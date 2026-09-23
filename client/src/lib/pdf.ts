// Purchase-order PDF (jsPDF + jspdf-autotable), laid out to mirror the on-screen PODocument:
// letterhead left, "PURCHASE ORDER #…" right, a meta row, Ship To / Bill To, special
// instructions, the line-item table, totals, and a footer on every page.
//
// buildPOPdf() is pure (no window / document / navigator) so it can run in Node for tests.
// jsPDF is imported lazily inside it, so importing this module stays cheap.
import type { jsPDF } from "jspdf";
import type { AppSettings } from "@shared/po";
import { lineTotal } from "@shared/po";
import type { PODocumentData } from "@/lib/document";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";

// ---------------------------------------------------------------------------
// Design tokens (points; US Letter is 612 × 792)
// ---------------------------------------------------------------------------

type RGB = [number, number, number];

const INK: RGB = [29, 29, 31]; // #1D1D1F
const SECONDARY: RGB = [110, 110, 115]; // #6E6E73
const TERTIARY: RGB = [142, 142, 147]; // #8E8E93
const ACCENT: RGB = [0, 122, 255]; // systemBlue #007AFF
const FILL: RGB = [245, 245, 247]; // #F5F5F7
const RULE: RGB = [210, 210, 215]; // #D2D2D7
const HAIRLINE: RGB = [229, 229, 234]; // #E5E5EA
const RED: RGB = [255, 59, 48]; // systemRed #FF3B30

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_X = 54;
const MARGIN_TOP = 54;
/** Content top on continuation pages (below the running header). */
const CONT_TOP = 78;
const CONTENT_W = PAGE_W - MARGIN_X * 2;
const RIGHT = PAGE_W - MARGIN_X;
/** Helvetica cap height as a fraction of the font size. */
const CAP = 0.718;
const HAIR = 0.5;
const EMPTY = "\u2014"; // em dash (in WinAnsi)

// ---------------------------------------------------------------------------
// Text sanitizing — the standard PDF fonts only cover WinAnsi (cp1252)
// ---------------------------------------------------------------------------

/** Characters above Latin-1 that cp1252 still maps (curly quotes, dashes, ellipsis, euro, TM...). */
const WIN_ANSI_EXTRAS = new Set(
  "\u20AC\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u017D\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u017E\u0178",
);

const REPLACEMENTS: Record<string, string> = {
  // Spaces (incl. the narrow no-break space newer ICU puts in times) and invisible characters
  "\u00A0": " ",
  "\u2002": " ",
  "\u2003": " ",
  "\u2004": " ",
  "\u2005": " ",
  "\u2006": " ",
  "\u2007": " ",
  "\u2008": " ",
  "\u2009": " ",
  "\u200A": " ",
  "\u202F": " ",
  "\u205F": " ",
  "\u3000": " ",
  "\t": " ",
  "\u200B": "",
  "\u200C": "",
  "\u200D": "",
  "\u2060": "",
  "\uFEFF": "",
  "\u00AD": "",
  // Dashes and minus
  "\u2010": "-",
  "\u2011": "-",
  "\u2012": "\u2013",
  "\u2015": "\u2014",
  "\u2212": "-",
  "\u2043": "-",
  // Quotes and primes
  "\u201B": "\u2018",
  "\u201F": "\u201C",
  "\u2032": "'",
  "\u2033": '"',
  "\u2035": "'",
  "\u00B4": "'",
  "\uFF02": '"',
  "\uFF07": "'",
  // Arrows
  "\u2192": "->",
  "\u2190": "<-",
  "\u2194": "<->",
  "\u21D2": "=>",
  "\u21D0": "<=",
  "\u21D4": "<=>",
  "\u2191": "^",
  "\u2193": "v",
  "\u279C": "->",
  "\u27A1": "->",
  "\u2794": "->",
  // Bullets, math and misc
  "\u2023": "\u2022",
  "\u25CF": "\u2022",
  "\u25E6": "\u2022",
  "\u2219": "\u00B7",
  "\u22C5": "\u00B7",
  "\u2215": "/",
  "\u2044": "/",
  "\u2264": "<=",
  "\u2265": ">=",
  "\u2260": "!=",
  "\u2248": "~",
  "\u2116": "No.",
  "\u2153": "1/3",
  "\u2154": "2/3",
  "\u215B": "1/8",
  "\u2713": "",
  "\u2714": "",
  // Letters without a Latin-1 decomposition
  "\u0141": "L",
  "\u0142": "l",
  "\u0110": "D",
  "\u0111": "d",
  "\u0131": "i",
  "\u0126": "H",
  "\u0127": "h",
};

function isWinAnsi(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return (code >= 0x20 && code <= 0x7e) || (code >= 0xa1 && code <= 0xff) || WIN_ANSI_EXTRAS.has(ch);
}

/** Maps text onto what Helvetica (WinAnsi) can render; unsupported characters are dropped. */
export function sanitizePdfText(value: unknown): string {
  if (value === null || value === undefined) return "";
  const input = String(value).replace(/\r\n?/g, "\n").normalize("NFC");
  let out = "";
  for (const ch of input) {
    if (ch === "\n" || isWinAnsi(ch)) {
      out += ch;
      continue;
    }
    const mapped = REPLACEMENTS[ch];
    if (mapped !== undefined) {
      out += mapped;
      continue;
    }
    // Accented letters outside Latin-1 (e.g. Hungarian or Romanian ones): decompose and keep
    // the base letter when it is representable.
    const base = ch.normalize("NFD").replace(/[\u0300-\u036F]/g, "");
    if (base && base !== ch && Array.from(base).every(isWinAnsi)) out += base;
  }
  // Collapse gaps left by dropped characters, per line.
  return out
    .split("\n")
    .map((line) => line.replace(/ {2,}/g, " ").trimEnd())
    .join("\n");
}

/** Trims blank lines at the start/end of multi-line text. */
function cleanBlock(value: unknown): string {
  return sanitizePdfText(value).trim();
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

type FontStyle = "normal" | "bold";

function font(doc: jsPDF, size: number, style: FontStyle, color: RGB) {
  doc.setFont("helvetica", style);
  doc.setFontSize(size);
  doc.setTextColor(color[0], color[1], color[2]);
}

/** Wraps text (keeping explicit line breaks) to `width` in the current font. */
function wrap(doc: jsPDF, text: string, width: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    if (!para.trim()) {
      lines.push("");
      continue;
    }
    lines.push(...(doc.splitTextToSize(para, width) as string[]));
  }
  return lines;
}

/** Width of a string drawn with letter spacing. */
function spacedWidth(doc: jsPDF, text: string, charSpace: number): number {
  return doc.getTextWidth(text) + charSpace * Math.max(0, text.length - 1);
}

/** Small uppercase, letter-spaced label ("SHIP TO"). Returns its baseline. */
function eyebrow(
  doc: jsPDF,
  label: string,
  x: number,
  capTop: number,
  color: RGB = SECONDARY,
  align: "left" | "right" = "left",
): number {
  const size = 7.5;
  const cs = 0.9;
  font(doc, size, "bold", color);
  const text = label.toUpperCase();
  const baseline = capTop + size * CAP;
  const left = align === "right" ? x - spacedWidth(doc, text, cs) : x;
  doc.text(text, left, baseline, { charSpace: cs });
  return baseline;
}

function hline(doc: jsPDF, x1: number, x2: number, y: number, color: RGB = RULE, width = HAIR) {
  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setLineWidth(width);
  doc.line(x1, y, x2, y);
}

/** Shortens text with an ellipsis so it fits `width` in the current font. */
function fit(doc: jsPDF, text: string, width: number): string {
  if (doc.getTextWidth(text) <= width) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (doc.getTextWidth(`${text.slice(0, mid).trimEnd()}\u2026`) <= width) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, lo).trimEnd()}\u2026`;
}

function orDash(value: string): string {
  return value.trim() ? value : EMPTY;
}

// ---------------------------------------------------------------------------
// buildPOPdf
// ---------------------------------------------------------------------------

/** Builds the PO PDF (multi-page aware). */
export async function buildPOPdf(data: PODocumentData, settings: AppSettings): Promise<jsPDF> {
  const [{ jsPDF: JsPDF, GState }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable/es"),
  ]);

  const doc = new JsPDF({ unit: "pt", format: "letter", orientation: "portrait", compress: true });

  const company = settings?.company ?? { name: "", address: "", email: "", phone: "" };
  const companyName = sanitizePdfText(company.name).trim();
  const poNumber = sanitizePdfText(data.poNumber).trim();
  const footerNote = cleanBlock(settings?.documentFooter);
  const watermark =
    data.status === "draft"
      ? { label: "DRAFT", color: TERTIARY, opacity: 0.09 }
      : data.status === "cancelled"
        ? { label: "CANCELLED", color: RED, opacity: 0.08 }
        : null;

  doc.setProperties({
    title: poNumber ? `Purchase Order #${poNumber}` : "Purchase Order",
    subject: "Purchase Order",
    author: companyName,
    creator: "PO Master",
  });
  try {
    doc.viewerPreferences({ DisplayDocTitle: true });
  } catch {
    // Older builds without the viewerPreferences plugin — cosmetic only.
  }

  // --- Footer geometry (reserved on every page) --------------------------------------------
  font(doc, 8, "normal", TERTIARY);
  const footerPo = poNumber ? `PO #${fit(doc, poNumber, 150)} \u00B7 ` : "";
  const pageLabelW = doc.getTextWidth(`${footerPo}Page 88 of 88`);
  font(doc, 8, "normal", SECONDARY);
  const footerLines = footerNote ? wrap(doc, footerNote, CONTENT_W - pageLabelW - 28).slice(0, 4) : [];
  const FOOTER_LH = 11;
  const footerLastBaseline = PAGE_H - 36;
  const footerFirstBaseline = footerLastBaseline - Math.max(0, footerLines.length - 1) * FOOTER_LH;
  const footerRuleY = footerFirstBaseline - 8 * CAP - 11;
  const contentBottom = footerRuleY - 20;

  // --- Page decoration (drawn first on each page, beneath the content) ----------------------
  const decorated = new Set<number>();
  const decorate = () => {
    const page = doc.getCurrentPageInfo().pageNumber;
    if (decorated.has(page)) return;
    decorated.add(page);

    if (watermark) {
      doc.saveGraphicsState();
      doc.setGState(new GState({ opacity: watermark.opacity }));
      doc.setFont("helvetica", "bold");
      doc.setFontSize(1);
      const unit = doc.getTextWidth(watermark.label);
      const size = Math.min(140, 560 / unit);
      font(doc, size, "bold", watermark.color);
      const w = doc.getTextWidth(watermark.label);
      const angle = 40;
      const rad = (angle * Math.PI) / 180;
      const capH = size * CAP;
      const cx = PAGE_W / 2;
      const cy = PAGE_H / 2 + 20;
      const x = cx - (w / 2) * Math.cos(rad) + (capH / 2) * Math.sin(rad);
      const y = cy + (w / 2) * Math.sin(rad) + (capH / 2) * Math.cos(rad);
      doc.text(watermark.label, x, y, { angle });
      doc.restoreGraphicsState();
    }

    if (page > 1) {
      // Running header on continuation pages.
      const capTop = 40;
      font(doc, 8, "normal", SECONDARY);
      const running = fit(doc, poNumber ? `Purchase Order #${poNumber}` : "Purchase Order", CONTENT_W * 0.45);
      doc.text(running, RIGHT, capTop + 8 * CAP, { align: "right" });
      const runningW = doc.getTextWidth(running);
      font(doc, 8, "bold", INK);
      if (companyName) doc.text(fit(doc, companyName, CONTENT_W - runningW - 24), MARGIN_X, capTop + 8 * CAP);
      hline(doc, MARGIN_X, RIGHT, capTop + 16, HAIRLINE);
    }
  };
  const newPage = (): number => {
    doc.addPage("letter", "portrait");
    decorate();
    return CONT_TOP;
  };

  decorate();
  let y = MARGIN_TOP;

  // --- Header: letterhead (left) + PURCHASE ORDER #… (right) --------------------------------
  // Right block first: its width decides how much room the letterhead gets.
  const eyebrowText = "PURCHASE ORDER";
  font(doc, 7.5, "bold", ACCENT);
  const eyebrowW = spacedWidth(doc, eyebrowText, 0.9);

  // Big "#1001" — shrinks (then wraps) so very long PO numbers still fit.
  const maxRightW = CONTENT_W * 0.46;
  const poLabel = poNumber ? `#${poNumber}` : "";
  let numSize = 26;
  font(doc, numSize, "bold", INK);
  const numW = doc.getTextWidth(poLabel);
  if (numW > maxRightW) numSize = Math.max(15, (numSize * maxRightW) / numW);
  font(doc, numSize, "bold", INK);
  const numLines = poLabel ? (doc.splitTextToSize(poLabel, maxRightW) as string[]).slice(0, 3) : [];
  const numLH = numSize * 1.12;
  const numBlockW = numLines.length ? Math.max(...numLines.map((l) => doc.getTextWidth(l))) : 0;

  const pill = watermark ? watermark.label : "";
  font(doc, 7, "bold", INK);
  const pillTextW = pill ? spacedWidth(doc, pill, 0.8) : 0;
  const pillW = pill ? pillTextW + 16 : 0;

  const rightW = Math.max(eyebrowW, numBlockW, pillW);

  const eyebrowBaseline = eyebrow(doc, eyebrowText, RIGHT, y, ACCENT, "right");
  let rightBottom = eyebrowBaseline + 2;
  let numBaseline = eyebrowBaseline;
  if (numLines.length) {
    numBaseline = eyebrowBaseline + 9 + numSize * CAP;
    font(doc, numSize, "bold", INK);
    numLines.forEach((line, i) => {
      doc.text(line, RIGHT, numBaseline + i * numLH, { align: "right" });
    });
    numBaseline += (numLines.length - 1) * numLH;
    rightBottom = numBaseline + numSize * 0.21;
  }

  if (pill) {
    const pillH = 15;
    const pillTop = rightBottom + (numLines.length ? 7 : 8);
    const tint: RGB = data.status === "cancelled" ? [255, 229, 227] : [236, 236, 240];
    const text: RGB = data.status === "cancelled" ? [215, 0, 21] : [99, 99, 102];
    doc.setFillColor(tint[0], tint[1], tint[2]);
    doc.roundedRect(RIGHT - pillW, pillTop, pillW, pillH, pillH / 2, pillH / 2, "F");
    font(doc, 7, "bold", text);
    doc.text(pill, RIGHT - pillW + 8, pillTop + pillH / 2 + (7 * CAP) / 2, { charSpace: 0.8 });
    rightBottom = pillTop + pillH;
  }

  // Letterhead
  const leftW = CONTENT_W - rightW - 28;
  let leftBottom = y;
  if (companyName) {
    // Long names step down in size before wrapping (max 3 lines).
    let nameSize = 17;
    font(doc, nameSize, "bold", INK);
    while (nameSize > 12 && (doc.splitTextToSize(companyName, leftW) as string[]).length > 2) {
      nameSize -= 1;
      font(doc, nameSize, "bold", INK);
    }
    const nameLH = nameSize * 1.18;
    const nameLines = (doc.splitTextToSize(companyName, leftW) as string[]).slice(0, 3);
    let baseline = y + nameSize * CAP;
    nameLines.forEach((line, i) => doc.text(line, MARGIN_X, baseline + i * nameLH));
    baseline += (nameLines.length - 1) * nameLH;
    leftBottom = baseline + 4;

    font(doc, 8.5, "normal", SECONDARY);
    const contact = [
      ...(cleanBlock(company.address) ? wrap(doc, cleanBlock(company.address), leftW) : []),
      ...[sanitizePdfText(company.email).trim(), sanitizePdfText(company.phone).trim()]
        .filter(Boolean)
        .flatMap((line) => wrap(doc, line, leftW)),
    ];
    let cb = baseline + 15;
    for (const line of contact) {
      doc.text(line, MARGIN_X, cb);
      leftBottom = cb + 2.5;
      cb += 12;
    }
  }

  y = Math.max(leftBottom, rightBottom) + 22;
  hline(doc, MARGIN_X, RIGHT, y, RULE);
  y += 18;

  // --- Meta row ------------------------------------------------------------------------------
  const meta: Array<[string, string]> = [
    ["Order date", formatDate(data.orderDate)],
    ["PO type", sanitizePdfText(data.poType).trim()],
    ["Payment terms", sanitizePdfText(data.terms).trim()],
    ["Start ship", formatDate(data.startShipDate)],
    ["Cancel date", formatDate(data.cancelDate)],
  ];
  const colW = CONTENT_W / meta.length;
  let metaBottom = y;
  meta.forEach(([label, value], i) => {
    const x = MARGIN_X + i * colW;
    font(doc, 8, "normal", SECONDARY);
    const labelBaseline = y + 8 * CAP;
    doc.text(label, x, labelBaseline);
    font(doc, 10, "normal", value ? INK : TERTIARY);
    const lines = (doc.splitTextToSize(orDash(value), colW - 12) as string[]).slice(0, 6);
    const first = labelBaseline + 8 + 10 * CAP + 2;
    lines.forEach((line, j) => doc.text(line, x, first + j * 13));
    metaBottom = Math.max(metaBottom, first + (lines.length - 1) * 13 + 3);
  });
  y = metaBottom + 18;
  hline(doc, MARGIN_X, RIGHT, y, RULE);
  y += 20;

  // --- Addresses: Ship To (left), Bill To (right) ---------------------------------------------
  const gutter = 24;
  const addrW = (CONTENT_W - gutter) / 2;
  const addrLH = 14;
  font(doc, 10, "normal", INK);
  const blocks = [
    { label: "Ship To", x: MARGIN_X, text: cleanBlock(data.shipTo) },
    { label: "Bill To", x: MARGIN_X + addrW + gutter, text: cleanBlock(data.billTo) },
  ].map((b) => ({ ...b, lines: b.text ? wrap(doc, b.text, addrW - 8) : [EMPTY] }));
  const addrLines = Math.max(...blocks.map((b) => b.lines.length));
  const addrH = 7.5 * CAP + 10 + 10 * CAP + (addrLines - 1) * addrLH + 4;
  if (y + addrH > contentBottom) y = newPage();
  for (const b of blocks) {
    const labelBaseline = eyebrow(doc, b.label, b.x, y);
    font(doc, 10, "normal", b.text ? INK : TERTIARY);
    const first = labelBaseline + 10 + 10 * CAP;
    b.lines.forEach((line, i) => doc.text(line, b.x, first + i * addrLH));
  }
  y += addrH + 22;

  // --- Special instructions (tinted panel, wraps and continues across pages) ------------------
  const instructions = cleanBlock(data.specialInstructions);
  if (instructions) {
    const pad = 14;
    const lh = 13.5;
    const labelH = 7.5 * CAP + 9;
    font(doc, 9.5, "normal", INK);
    const lines = wrap(doc, instructions, CONTENT_W - pad * 2);
    let i = 0;
    let first = true;
    while (i < lines.length) {
      const headH = first ? labelH : 0;
      const room = Math.floor((contentBottom - y - pad * 2 - headH - 9.5 * CAP + lh) / lh);
      const remaining = lines.length - i;
      // Don't leave a lonely line or two at the bottom of a page.
      if (room < Math.min(3, remaining)) {
        y = newPage();
        continue;
      }
      const n = Math.min(room, remaining);
      const h = pad * 2 + headH + 9.5 * CAP + (n - 1) * lh + 2;
      doc.setFillColor(FILL[0], FILL[1], FILL[2]);
      doc.roundedRect(MARGIN_X, y, CONTENT_W, h, 8, 8, "F");
      let baseline = y + pad;
      if (first) {
        eyebrow(doc, i === 0 ? "Special Instructions" : "Special Instructions (continued)", MARGIN_X + pad, y + pad);
        baseline += labelH;
      }
      font(doc, 9.5, "normal", INK);
      baseline += 9.5 * CAP;
      for (let k = 0; k < n; k++) doc.text(lines[i + k], MARGIN_X + pad, baseline + k * lh);
      i += n;
      y += h;
      first = false;
      if (i < lines.length) {
        y = newPage();
        first = true;
      }
    }
    y += 22;
  }

  // --- Line items -----------------------------------------------------------------------------
  const items = data.items ?? [];
  const rows = items.map((item) => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.price) || 0;
    return [
      orDash(sanitizePdfText(item.styleNumber).trim()),
      orDash(sanitizePdfText(item.color).trim()),
      orDash(cleanBlock(item.description)),
      formatNumber(qty),
      formatMoney(price),
      formatMoney(lineTotal({ quantity: qty, price })),
    ];
  });
  const head = ["Style #", "Color", "Description", "Qty", "Unit price", "Amount"].map((h) => h.toUpperCase());
  const padX = 8;

  // Size the short columns to their content (within limits) so descriptions get the room.
  const measure = (col: number, bodyStyle: FontStyle, min: number, max: number) => {
    font(doc, 7.5, "bold", INK);
    let w = doc.getTextWidth(head[col]);
    font(doc, 9.5, bodyStyle, INK);
    for (const row of rows) w = Math.max(w, ...row[col].split("\n").map((l) => doc.getTextWidth(l)));
    return Math.min(max, Math.max(min, Math.ceil(w + padX * 2 + 1)));
  };
  const widths =
    rows.length > 0
      ? {
          style: measure(0, "bold", 64, 118),
          color: measure(1, "normal", 58, 104),
          qty: measure(3, "normal", 48, 76),
          price: measure(4, "normal", 64, 92),
          amount: measure(5, "normal", 76, 112),
        }
      : { style: 72, color: 72, qty: 52, price: 68, amount: 84 };
  // Descriptions keep at least ~150pt: style/color give way first; numbers never wrap.
  const MIN_DESC = 150;
  const numericW = widths.qty + widths.price + widths.amount;
  const textW = widths.style + widths.color;
  const roomForText = Math.max(120, CONTENT_W - numericW - MIN_DESC);
  if (textW > roomForText) {
    const k = roomForText / textW;
    widths.style = Math.max(56, Math.floor(widths.style * k));
    widths.color = Math.max(56, Math.floor(widths.color * k));
  }

  // Keep the header with at least one row: start on a new page if there's no room for both.
  if (y + 64 > contentBottom) y = newPage();

  autoTable(doc, {
    startY: y,
    margin: { top: CONT_TOP, left: MARGIN_X, right: MARGIN_X, bottom: PAGE_H - contentBottom },
    theme: "plain",
    tableWidth: CONTENT_W,
    showHead: "everyPage",
    rowPageBreak: "avoid",
    head: [head],
    body: rows,
    styles: {
      font: "helvetica",
      fontSize: 9.5,
      textColor: INK,
      cellPadding: { top: 7.5, bottom: 7.5, left: padX, right: padX },
      overflow: "linebreak",
      valign: "top",
      lineWidth: 0,
      lineColor: HAIRLINE,
    },
    headStyles: {
      fontStyle: "bold",
      fontSize: 7.5,
      textColor: SECONDARY,
      fillColor: false,
      valign: "middle",
      cellPadding: { top: 7, bottom: 7, left: padX, right: padX },
    },
    bodyStyles: { lineWidth: { bottom: HAIR }, lineColor: HAIRLINE },
    columnStyles: {
      0: { cellWidth: widths.style, fontStyle: "bold" },
      1: { cellWidth: widths.color },
      2: { cellWidth: "auto", textColor: [58, 58, 60] },
      3: { cellWidth: widths.qty, halign: "right" },
      4: { cellWidth: widths.price, halign: "right" },
      5: { cellWidth: widths.amount, halign: "right" },
    },
    didParseCell: (hook) => {
      if (hook.section === "head") {
        const w = [widths.style, widths.color, 0, widths.qty, widths.price, widths.amount][hook.column.index];
        if (w) hook.cell.styles.cellWidth = w;
        if (hook.column.index >= 3) hook.cell.styles.halign = "right";
      }
    },
    willDrawCell: (hook) => {
      // One rounded, very light header band instead of per-cell fills.
      if (hook.section === "head" && hook.column.index === 0) {
        doc.setFillColor(FILL[0], FILL[1], FILL[2]);
        doc.roundedRect(MARGIN_X, hook.cell.y, CONTENT_W, hook.cell.height, 5, 5, "F");
      }
    },
    willDrawPage: () => decorate(),
  });

  y = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y;
  if (rows.length === 0) {
    font(doc, 9.5, "normal", TERTIARY);
    doc.text("No line items", PAGE_W / 2, y + 22 + 9.5 * CAP, { align: "center" });
    y += 44;
    hline(doc, MARGIN_X, RIGHT, y, HAIRLINE);
  }
  y += 16;

  // --- Totals ---------------------------------------------------------------------------------
  const totalsH = 58;
  if (y + totalsH > contentBottom) y = newPage();
  const totalsW = 232;
  const tx = RIGHT - totalsW;
  const valueX = RIGHT - 8;

  font(doc, 9.5, "normal", SECONDARY);
  const unitsBaseline = y + 9.5 * CAP + 2;
  doc.text("Total units", tx + 8, unitsBaseline);
  font(doc, 9.5, "normal", INK);
  doc.text(formatNumber(data.totalQuantity), valueX, unitsBaseline, { align: "right" });

  hline(doc, tx, RIGHT, unitsBaseline + 10, RULE);

  const totalBaseline = unitsBaseline + 10 + 12 + 17 * CAP;
  font(doc, 11, "bold", INK);
  doc.text("Total", tx + 8, totalBaseline);
  const totalLabelW = doc.getTextWidth("Total");
  font(doc, 8, "normal", TERTIARY);
  doc.text("USD", tx + 8 + totalLabelW + 5, totalBaseline);
  font(doc, 17, "bold", INK);
  doc.text(formatMoney(data.totalAmount), valueX, totalBaseline, { align: "right" });

  // --- Footer on every page -------------------------------------------------------------------
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    hline(doc, MARGIN_X, RIGHT, footerRuleY, HAIRLINE);
    font(doc, 8, "normal", SECONDARY);
    footerLines.forEach((line, i) => doc.text(line, MARGIN_X, footerFirstBaseline + i * FOOTER_LH));
    font(doc, 8, "normal", TERTIARY);
    const pageLabel = `${footerPo}Page ${p} of ${pages}`;
    doc.text(pageLabel, RIGHT, footerFirstBaseline, { align: "right" });
  }
  doc.setPage(pages);

  return doc;
}

// ---------------------------------------------------------------------------
// Browser helpers
// ---------------------------------------------------------------------------

/** File name used for downloads/shares, e.g. "PO-1001.pdf". */
export function pdfFileName(data: PODocumentData): string {
  return `PO-${(data.poNumber || "draft").replace(/[^\w.-]+/g, "_")}.pdf`;
}

function pdfBlob(doc: jsPDF): Blob {
  return doc.output("blob") as Blob;
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // iOS Safari reads the blob after the click returns; keep the URL alive for a while.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Triggers a browser download of the PDF. */
export async function downloadPOPdf(data: PODocumentData, settings: AppSettings): Promise<void> {
  const doc = await buildPOPdf(data, settings);
  saveBlob(pdfBlob(doc), pdfFileName(data));
}

/**
 * Opens the native share sheet with the PDF attached (mobile). Falls back to downloading
 * when file sharing isn't supported. Resolves to what happened.
 */
export async function sharePOPdf(
  data: PODocumentData,
  settings: AppSettings,
): Promise<"shared" | "downloaded" | "cancelled"> {
  const doc = await buildPOPdf(data, settings);
  const blob = pdfBlob(doc);
  const name = pdfFileName(data);

  if (typeof navigator !== "undefined" && typeof navigator.share === "function" && typeof File !== "undefined") {
    const file = new File([blob], name, { type: "application/pdf" });
    const payload: ShareData = {
      files: [file],
      title: data.poNumber ? `Purchase Order #${data.poNumber}` : "Purchase Order",
    };
    let canShare = false;
    try {
      canShare = typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
    } catch {
      canShare = false;
    }
    if (canShare) {
      try {
        await navigator.share(payload);
        return "shared";
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return "cancelled";
        // NotAllowedError (gesture expired) or a platform failure: fall back to a download.
      }
    }
  }

  saveBlob(blob, name);
  return "downloaded";
}

/** Opens the PDF in a new tab with the print dialog. */
export async function printPOPdf(data: PODocumentData, settings: AppSettings): Promise<void> {
  // Must run synchronously inside the click handler, before any await, or popup blockers win.
  const win = typeof window !== "undefined" ? window.open("", "_blank") : null;
  try {
    if (win) {
      try {
        win.document.title = data.poNumber ? `Purchase Order #${data.poNumber}` : "Purchase Order";
        win.document.body.style.cssText =
          "margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;" +
          "font:15px -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#6e6e73;background:#f2f2f7";
        win.document.body.textContent = "Preparing PDF…";
      } catch {
        // Cross-origin or locked-down window — the PDF still loads below.
      }
    }

    const doc = await buildPOPdf(data, settings);
    doc.autoPrint();
    const blob = pdfBlob(doc);

    if (!win || win.closed) {
      // Popup blocked (or closed while we worked): hand the file over instead.
      saveBlob(blob, pdfFileName(data));
      return;
    }
    const url = URL.createObjectURL(blob);
    win.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
  } catch (err) {
    try {
      win?.close();
    } catch {
      // ignore
    }
    throw err;
  }
}
