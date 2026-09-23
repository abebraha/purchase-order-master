import type { StyleFormValues, StyleRecord } from "@shared/po";
import { downloadCsv } from "@/lib/format";

// ---------------------------------------------------------------------------
// Sorting & searching
// ---------------------------------------------------------------------------

export type StyleSort = "az" | "used" | "recent";

export const STYLE_SORT_OPTIONS: Array<{ value: StyleSort; label: string; short: string }> = [
  { value: "az", label: "Style # A–Z", short: "A–Z" },
  { value: "used", label: "Most Used", short: "Most Used" },
  { value: "recent", label: "Recently Added", short: "Recent" },
];

export function sortLabel(sort: StyleSort): string {
  return STYLE_SORT_OPTIONS.find((o) => o.value === sort)?.label ?? "Style # A–Z";
}

const collator = new Intl.Collator("en-US", { numeric: true, sensitivity: "base" });

export function compareStyleNumbers(a: string, b: string): number {
  return collator.compare(a.trim(), b.trim());
}

function time(iso: string | null | undefined): number {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : 0;
}

export function sortStyles(styles: StyleRecord[], sort: StyleSort): StyleRecord[] {
  const list = [...styles];
  if (sort === "used") {
    list.sort((a, b) => b.usageCount - a.usageCount || compareStyleNumbers(a.styleNumber, b.styleNumber));
  } else if (sort === "recent") {
    list.sort((a, b) => time(b.createdAt) - time(a.createdAt) || b.id - a.id);
  } else {
    list.sort((a, b) => compareStyleNumbers(a.styleNumber, b.styleNumber));
  }
  return list;
}

/** Every word in the query must appear in the style #, color or description (any order). */
export function filterStyles(styles: StyleRecord[], query: string): StyleRecord[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return styles;
  return styles.filter((s) => {
    const haystack = `${s.styleNumber} ${s.color} ${s.description}`.toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
}

/** Contacts-style index letter: A–Z or 0–9, anything else goes under "#". */
export function indexLetter(styleNumber: string): string {
  const ch = styleNumber.trim().charAt(0).toUpperCase();
  return /[A-Z0-9]/.test(ch) ? ch : "#";
}

export interface StyleGroup {
  key: string;
  styles: StyleRecord[];
}

/** Groups an already-sorted list into consecutive sections by first character. */
export function groupByLetter(styles: StyleRecord[]): StyleGroup[] {
  const groups: StyleGroup[] = [];
  for (const style of styles) {
    const key = indexLetter(style.styleNumber);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.styles.push(style);
    else groups.push({ key, styles: [style] });
  }
  return groups;
}

/** "Black · Lace bralette", or "" when both are blank. */
export function styleDetails(style: Pick<StyleRecord, "color" | "description">): string {
  return [style.color, style.description].map((v) => (v ?? "").trim()).filter(Boolean).join(" · ");
}

export function findDuplicate(
  styles: StyleRecord[] | undefined,
  styleNumber: string,
  excludeId?: number,
): StyleRecord | undefined {
  const key = styleNumber.trim().toLowerCase();
  if (!key || !styles) return undefined;
  return styles.find((s) => s.id !== excludeId && s.styleNumber.trim().toLowerCase() === key);
}

// ---------------------------------------------------------------------------
// Paste from Excel / Google Sheets
// ---------------------------------------------------------------------------

/** Splits delimited text into rows of cells. Understands "quoted" cells (Excel quotes cells with line breaks). */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let cellStart = true;

  const endCell = () => {
    row.push(cell);
    cell = "";
    cellStart = true;
  };
  const endRow = () => {
    endCell();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cellStart && cell.trim() === "") {
      inQuotes = true;
      cell = "";
      cellStart = false;
      continue;
    }
    if (ch === delimiter) {
      endCell();
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      endRow();
    } else {
      cell += ch;
      if (ch !== " ") cellStart = false;
    }
  }
  if (cell !== "" || row.length) endRow();
  return rows;
}

const normalizeHeader = (s: string) => s.toLowerCase().replace(/[^a-z0-9#]/g, "");
const STYLE_HEADERS = ["stylenumber", "style#", "styleno", "style", "stylenum", "styles"].map(normalizeHeader);
const COLOR_HEADERS = ["color", "colour", "colors"].map(normalizeHeader);
const DESCRIPTION_HEADERS = ["description", "desc", "descriptions"].map(normalizeHeader);

function looksLikeHeader(cells: string[]): boolean {
  const first = normalizeHeader(cells[0] ?? "");
  if (first.startsWith("style")) return true;
  return cells.some((c) => {
    const n = normalizeHeader(c);
    return n === "style#" || n === "stylenumber" || n === "styleno";
  });
}

export interface ParsedPaste {
  /** Unique styles to import, in pasted order. */
  styles: StyleFormValues[];
  /** A header row was detected and skipped. */
  skippedHeader: boolean;
  /** Rows dropped because the style # repeated within the paste. */
  repeated: number;
  /** Non-empty rows that had no style number. */
  blank: number;
}

/**
 * Turns text copied from Excel / Google Sheets (tab separated) or typed CSV (comma separated)
 * into styles. Columns: style #, color, description. A header row is detected and — when it
 * names the columns — used to find them in any order.
 */
export function parsePastedStyles(text: string): ParsedPaste {
  const result: ParsedPaste = { styles: [], skippedHeader: false, repeated: 0, blank: 0 };
  if (!text.trim()) return result;

  const delimiter = text.includes("\t") ? "\t" : ",";
  let rows = parseDelimited(text, delimiter)
    .map((cells) => cells.map((c) => c.trim()))
    .filter((cells) => cells.some(Boolean));

  let styleCol = 0;
  let colorCol = 1;
  let descriptionCol = 2;
  let byHeader = false;

  if (rows.length && looksLikeHeader(rows[0])) {
    const header = rows[0].map(normalizeHeader);
    const find = (names: string[]) => header.findIndex((h) => names.includes(h));
    const s = find(STYLE_HEADERS);
    const c = find(COLOR_HEADERS);
    const d = find(DESCRIPTION_HEADERS);
    if (s >= 0) {
      styleCol = s;
      colorCol = c;
      descriptionCol = d;
      byHeader = true;
    }
    result.skippedHeader = true;
    rows = rows.slice(1);
  }

  const seen = new Set<string>();
  for (const cells of rows) {
    const styleNumber = cells[styleCol] ?? "";
    if (!styleNumber) {
      result.blank++;
      continue;
    }
    const key = styleNumber.toLowerCase();
    if (seen.has(key)) {
      result.repeated++;
      continue;
    }
    seen.add(key);
    const color = colorCol >= 0 ? cells[colorCol] ?? "" : "";
    // Unquoted commas in a typed description ("Bra, lace trim") would split it — keep the rest.
    const description =
      descriptionCol < 0
        ? ""
        : !byHeader && delimiter === ","
          ? cells.slice(descriptionCol).filter(Boolean).join(", ")
          : cells[descriptionCol] ?? "";
    result.styles.push({ styleNumber: styleNumber.slice(0, 64), color, description });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export function downloadStyleTemplate() {
  downloadCsv("styles-template.csv", [
    ["style_number", "color", "description"],
    ["SL3100", "Black", "Microfiber T-shirt bra"],
    ["SL3105", "Ivory", "Lace trim bralette"],
  ]);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Friendly problem with a picked file, or null. Never judges by MIME type (Windows reports CSV as Excel). */
export function checkImportFile(file: File): string | null {
  const name = file.name.toLowerCase();
  if (/\.(xlsx|xlsm|xls|numbers)$/.test(name)) {
    return "That's a spreadsheet file, not a CSV. Save it as CSV first (File › Save As › CSV), or use Paste from Excel.";
  }
  if (file.size === 0) return "That file is empty.";
  if (file.size > 5 * 1024 * 1024) return "That file is too large. The limit is 5 MB.";
  return null;
}
