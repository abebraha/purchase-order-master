/**
 * Form model for the purchase-order editor (create / edit / duplicate).
 *
 * The editor keeps quantity and price as the text the user typed ("1,200", "$4.50") so inputs
 * are forgiving; `editorResolver` normalizes them to numbers before running POFormSchema, and
 * handleSubmit receives clean POFormValues.
 *
 * Saved values are never rewritten behind the owner's back: numbers load with full precision
 * (and blur formatting only adds separators), and untouched dates are sent back as the exact
 * timestamps that were loaded (`withOriginalDates`).
 */
import type { FieldErrors, Resolver, ResolverOptions, ResolverResult } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { addDays, differenceInCalendarDays, format, isToday, isYesterday } from "date-fns";
import {
  DATE_INPUT_RE,
  PO_STATUSES,
  PO_TYPES,
  PODraftSchema,
  POFormSchema,
  computeTotals,
  type AppSettings,
  type CustomerRecord,
  type POFormValues,
  type POStatus,
  type POType,
  type PurchaseOrder,
} from "@shared/po";
import { pickPrefill, switchCustomer, type PrefillValues } from "@/components/customers/customerUtils";
import { parseDate, toDateInputValue, todayInputValue } from "@/lib/format";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EditorItem {
  styleId: number | null;
  manualStyleNumber: string;
  color: string;
  description: string;
  /** Raw text as typed, e.g. "1,200". */
  quantity: string;
  /** Raw text as typed, e.g. "$4.50". */
  price: string;
}

export type EditorValues = Omit<POFormValues, "items"> & {
  items: EditorItem[];
  /**
   * Saved customer picked for this order (null = none). Only used to fill in the form — it's
   * never sent to the server, and the PO keeps its own copy of every detail.
   */
  customerId: number | null;
};

export type EditorMode = "create" | "duplicate" | "edit";

export const CANCEL_BEFORE_START_MESSAGE = "Cancel date must be on or after the start ship date";

// ---------------------------------------------------------------------------
// Forgiving number parsing / formatting
// ---------------------------------------------------------------------------

/** Parses "1,200", "$4.50", " 12 " → number. Returns NaN for blank or unreadable text. */
export function parseAmount(text: string | number | null | undefined): number {
  if (typeof text === "number") return text;
  if (text === null || text === undefined) return NaN;
  const cleaned = String(text).replace(/[\s$,]/g, "");
  if (!cleaned) return NaN;
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(cleaned)) return NaN;
  return Number(cleaned);
}

/**
 * Exact decimal text for `v` with thousands separators — never rounds, so a saved value shown in
 * the editor parses back to the very same number: 12000 → "12,000", 0.00833 → "0.00833".
 */
function exactNumberText(v: number, minFractionDigits = 0): string {
  const abs = Math.abs(v);
  // String() gives the shortest text that round-trips; very large/small numbers use exponent form.
  let text = String(abs);
  if (/e/i.test(text)) text = abs.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 20 });
  const [int, frac = ""] = text.split(".");
  const fraction = frac.padEnd(minFractionDigits, "0");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${v < 0 ? "-" : ""}${grouped}${fraction ? `.${fraction}` : ""}`;
}

/** 1200 → "1,200"; 312.375 → "312.375" (blank for missing values). Never rounds. */
export function formatQuantityInput(n: number | string | null | undefined): string {
  const v = typeof n === "number" ? n : parseAmount(n);
  if (!Number.isFinite(v)) return "";
  return exactNumberText(v);
}

/** 8.5 → "8.50"; 0.00833 → "0.00833" (blank for missing values). Never rounds. */
export function formatPriceInput(n: number | string | null | undefined): string {
  const v = typeof n === "number" ? n : parseAmount(n);
  if (!Number.isFinite(v)) return "";
  return exactNumberText(v, 2);
}

function finiteOrZero(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

/** Live totals for partially filled items. */
export function editorTotals(items: Array<Partial<EditorItem>> | undefined) {
  return computeTotals(
    (items ?? []).map((i) => ({
      quantity: finiteOrZero(parseAmount(i?.quantity)),
      price: finiteOrZero(parseAmount(i?.price)),
    })),
  );
}

export function itemAmount(item: Partial<EditorItem> | undefined): number {
  return editorTotals(item ? [item] : []).totalAmount;
}

// ---------------------------------------------------------------------------
// Conversions
// ---------------------------------------------------------------------------

export function emptyItem(): EditorItem {
  return { styleId: null, manualStyleNumber: "", color: "", description: "", quantity: "", price: "" };
}

export function isBlankItem(item: Partial<EditorItem> | undefined): boolean {
  if (!item) return true;
  return (
    !item.styleId &&
    !item.manualStyleNumber?.trim() &&
    !item.color?.trim() &&
    !item.description?.trim() &&
    !item.quantity?.trim() &&
    !item.price?.trim()
  );
}

/**
 * Editor values → schema input (numbers may be NaN; the schema reports those as "Enter a …").
 * `blankNumbersAsZero` is for drafts: an empty quantity/price is simply "not filled in yet".
 */
export function toFormValues(
  { customerId: _customerId, ...values }: EditorValues,
  { blankNumbersAsZero = false } = {},
): POFormValues {
  const num = (text: string | undefined) =>
    blankNumbersAsZero && !String(text ?? "").trim() ? 0 : parseAmount(text);
  return {
    ...values,
    items: (values.items ?? []).map((i) => ({
      styleId: i.styleId ?? null,
      manualStyleNumber: i.manualStyleNumber ?? "",
      color: i.color ?? "",
      description: i.description ?? "",
      quantity: num(i.quantity),
      price: num(i.price),
    })),
  };
}

const DATE_KEYS = ["orderDate", "startShipDate", "cancelDate"] as const;

/**
 * Edit mode: dates whose day the owner didn't change are sent back as the exact timestamps that
 * were loaded, so older orders' saved times are never rewritten (and history doesn't report
 * date changes nobody made).
 */
export function withOriginalDates<T extends Pick<POFormValues, (typeof DATE_KEYS)[number]>>(
  values: T,
  original: Pick<PurchaseOrder, (typeof DATE_KEYS)[number]> | undefined,
): T {
  if (!original) return values;
  const out = { ...values };
  for (const key of DATE_KEYS) {
    const saved = original[key];
    if (saved && values[key] === toDateInputValue(saved)) out[key] = saved;
  }
  return out;
}

export function addDaysInput(dateInput: string, days: number): string {
  const d = parseDate(dateInput) ?? new Date();
  return format(addDays(d, days), "yyyy-MM-dd");
}

function safePoType(value: string | null | undefined): POType {
  return (PO_TYPES as readonly string[]).includes(value ?? "") ? (value as POType) : PO_TYPES[0];
}

function safeStatus(value: string | null | undefined): POStatus {
  return (PO_STATUSES as readonly string[]).includes(value ?? "") ? (value as POStatus) : "open";
}

/** "Company name\nStreet address" from Settings → Company (blank if not set up). */
export function companyAddressText(settings: AppSettings | undefined): string {
  return [settings?.company?.name, settings?.company?.address]
    .map((v) => v?.trim())
    .filter(Boolean)
    .join("\n");
}

export function valuesForCreate(settings: AppSettings, poNumber = ""): EditorValues {
  const today = todayInputValue();
  return {
    poNumber,
    poType: safePoType(settings.defaults?.poType),
    status: "open",
    terms: settings.defaults?.terms || "Net 30",
    orderDate: today,
    startShipDate: today,
    cancelDate: addDaysInput(today, 30),
    shipTo: settings.defaults?.shipTo ?? "",
    // Purchase orders bill the company itself, so its address is the natural default.
    billTo: settings.defaults?.billTo?.trim() ? settings.defaults.billTo : companyAddressText(settings),
    specialInstructions: "",
    notes: "",
    items: [emptyItem()],
    customerId: null,
  };
}

/** Saved PO → editor values. Numbers keep their full precision (see formatPriceInput). */
export function valuesFromPurchaseOrder(po: PurchaseOrder): EditorValues {
  const items = (po.items ?? []).map<EditorItem>((i) => ({
    styleId: i.styleId && i.styleId > 0 ? i.styleId : null,
    manualStyleNumber: i.manualStyleNumber || i.styleNumber || "",
    color: i.color ?? "",
    description: i.description ?? "",
    quantity: formatQuantityInput(i.quantity),
    price: formatPriceInput(i.price),
  }));
  return {
    poNumber: po.poNumber ?? "",
    poType: safePoType(po.poType),
    status: safeStatus(po.status),
    terms: po.terms ?? "",
    orderDate: toDateInputValue(po.orderDate),
    startShipDate: toDateInputValue(po.startShipDate),
    cancelDate: toDateInputValue(po.cancelDate),
    shipTo: po.shipTo ?? "",
    billTo: po.billTo ?? "",
    specialInstructions: po.specialInstructions ?? "",
    notes: po.notes ?? "",
    items: items.length ? items : [emptyItem()],
    customerId: null,
  };
}

/** Copy of an existing PO: same type, terms, addresses, instructions and items; new dates. */
export function valuesForDuplicate(po: PurchaseOrder, poNumber = ""): EditorValues {
  const base = valuesFromPurchaseOrder(po);
  const start = parseDate(base.startShipDate);
  const cancel = parseDate(base.cancelDate);
  let windowDays = start && cancel ? differenceInCalendarDays(cancel, start) : 30;
  if (!Number.isFinite(windowDays) || windowDays < 0) windowDays = 30;
  const today = todayInputValue();
  return {
    ...base,
    poNumber,
    status: "open",
    orderDate: today,
    startShipDate: today,
    cancelDate: addDaysInput(today, windowDays),
    notes: "",
  };
}

/** What a PO without a customer starts with — where a removed customer's details go back to. */
export function noCustomerDetails(settings: AppSettings): PrefillValues {
  return pickPrefill(valuesForCreate(settings));
}

/** `values` with a saved customer's details filled in (and the customer picked). */
export function valuesWithCustomer(values: EditorValues, customer: CustomerRecord, settings: AppSettings): EditorValues {
  return {
    ...values,
    ...switchCustomer(pickPrefill(values), null, customer, noCustomerDetails(settings)),
    customerId: customer.id,
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const baseResolver = zodResolver(POFormSchema);

/** Draft issues → react-hook-form's nested error object ("items.2.quantity" → errors.items[2].quantity). */
function draftFieldErrors(issues: DraftIssue[]): FieldErrors<EditorValues> {
  const errors: Record<string, any> = {};
  for (const issue of issues) {
    const parts = issue.path.split(".");
    let node = errors;
    parts.forEach((part, i) => {
      if (i === parts.length - 1) {
        if (!node[part]) node[part] = { type: "draft", message: issue.message };
        return;
      }
      if (!node[part]) node[part] = /^\d+$/.test(parts[i + 1] ?? "") ? [] : {};
      node = node[part];
    });
  }
  return errors as FieldErrors<EditorValues>;
}

/**
 * zodResolver(POFormSchema) on normalized values. Also reports "cancel before start" even when
 * other fields are invalid (zod skips object refinements until the shape is valid).
 * A PO whose status is Draft only needs what `validateDraft` asks for.
 */
export const editorResolver: Resolver<EditorValues, unknown, POFormValues> = async (values, context, options) => {
  if (values.status === "draft") {
    const draft = validateDraft(values);
    return draft.ok
      ? { values: draft.values, errors: {} }
      : { values: {}, errors: draftFieldErrors(draft.issues) };
  }
  const result = (await baseResolver(
    toFormValues(values),
    context,
    options as unknown as ResolverOptions<POFormValues>,
  )) as unknown as ResolverResult<EditorValues, POFormValues>;
  const errors = result.errors as FieldErrors<EditorValues>;
  if (
    errors &&
    Object.keys(errors).length > 0 &&
    !errors.cancelDate &&
    DATE_INPUT_RE.test(values.cancelDate ?? "") &&
    DATE_INPUT_RE.test(values.startShipDate ?? "") &&
    values.cancelDate < values.startShipDate
  ) {
    errors.cancelDate = { type: "custom", message: CANCEL_BEFORE_START_MESSAGE };
  }
  return result;
};

export interface DraftIssue {
  /** Form field path, e.g. "poNumber" or "items.2.quantity". */
  path: string;
  message: string;
}

export type DraftValidation =
  | { ok: true; values: POFormValues }
  | { ok: false; issues: DraftIssue[] };

/**
 * Validation for drafts ("save it now, finish it later"): only the PO number, valid dates (and
 * payment terms, which are always pre-filled) are required. Completely empty item rows are
 * dropped and blank quantities/prices count as 0.
 */
export function validateDraft(values: EditorValues): DraftValidation {
  const keptIndex: number[] = [];
  const items = (values.items ?? []).filter((item, index) => {
    if (isBlankItem(item)) return false;
    keptIndex.push(index);
    return true;
  });
  const parsed = PODraftSchema.safeParse(toFormValues({ ...values, items }, { blankNumbersAsZero: true }));
  const issues: DraftIssue[] = [];
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = [...issue.path];
      if (path[0] === "items" && typeof path[1] === "number") path[1] = keptIndex[path[1]] ?? path[1];
      issues.push({ path: path.join("."), message: issue.message });
    }
  }
  // The server stores payment terms on every PO (it doesn't accept blank terms, even on drafts).
  if (!String(values.terms ?? "").trim() && !issues.some((i) => i.path === "terms")) {
    issues.push({ path: "terms", message: "Payment terms are required" });
  }
  if (
    !issues.some((i) => i.path === "cancelDate") &&
    DATE_INPUT_RE.test(values.cancelDate ?? "") &&
    DATE_INPUT_RE.test(values.startShipDate ?? "") &&
    values.cancelDate < values.startShipDate
  ) {
    issues.push({ path: "cancelDate", message: CANCEL_BEFORE_START_MESSAGE });
  }
  if (!parsed.success || issues.length) return { ok: false, issues };
  return { ok: true, values: parsed.data as POFormValues };
}

// ---------------------------------------------------------------------------
// Local draft (autosave — survives Back, reloads and the phone closing the page)
// ---------------------------------------------------------------------------

/** Create mode's key (one unsaved new PO at a time). */
export const DRAFT_KEY = "po-editor-draft";

/** Where the editor autosaves unsaved changes: one slot for new POs, one per PO being edited or copied. */
export function draftKey(mode: EditorMode, id?: number): string {
  if (mode === "edit" && id) return `${DRAFT_KEY}-${id}`;
  if (mode === "duplicate" && id) return `${DRAFT_KEY}-from-${id}`;
  return DRAFT_KEY;
}

export interface EditorDraft {
  savedAt: string;
  values: EditorValues;
  /** Edit mode: `version` of the saved PO these changes were made on. */
  baseVersion?: string;
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : fallback;
}

/** Fills any missing/odd fields of a stored draft from `fallback`. */
function sanitizeValues(raw: any, fallback: EditorValues): EditorValues {
  const items: EditorItem[] = Array.isArray(raw?.items)
    ? raw.items.map((i: any) => ({
        styleId: typeof i?.styleId === "number" && i.styleId > 0 ? i.styleId : null,
        manualStyleNumber: str(i?.manualStyleNumber),
        color: str(i?.color),
        description: str(i?.description),
        quantity: str(i?.quantity),
        price: str(i?.price),
      }))
    : fallback.items;
  return {
    poNumber: str(raw?.poNumber, fallback.poNumber),
    poType: safePoType(raw?.poType ?? fallback.poType),
    status: safeStatus(raw?.status ?? fallback.status),
    terms: str(raw?.terms, fallback.terms),
    orderDate: str(raw?.orderDate, fallback.orderDate),
    startShipDate: str(raw?.startShipDate, fallback.startShipDate),
    cancelDate: str(raw?.cancelDate, fallback.cancelDate),
    shipTo: str(raw?.shipTo, fallback.shipTo),
    billTo: str(raw?.billTo, fallback.billTo),
    specialInstructions: str(raw?.specialInstructions, fallback.specialInstructions),
    notes: str(raw?.notes, fallback.notes),
    items: items.length ? items : [emptyItem()],
    customerId: typeof raw?.customerId === "number" && raw.customerId > 0 ? raw.customerId : null,
  };
}

export function loadDraft(key: string, fallback: EditorValues): EditorDraft | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.savedAt !== "string" || !parsed.values) return null;
    return {
      savedAt: parsed.savedAt,
      values: sanitizeValues(parsed.values, fallback),
      baseVersion: typeof parsed.baseVersion === "string" ? parsed.baseVersion : undefined,
    };
  } catch {
    return null;
  }
}

export function saveDraft(key: string, values: EditorValues, baseVersion?: string) {
  try {
    window.localStorage.setItem(key, JSON.stringify({ savedAt: new Date().toISOString(), values, baseVersion }));
  } catch {
    // Storage full or blocked (private mode) — autosave is best effort.
  }
}

export function clearDraft(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/** True when two sets of editor values would save the same purchase order. */
export function sameEditorValues(a: EditorValues, b: EditorValues): boolean {
  const norm = (v: EditorValues) => {
    const f = toFormValues(v);
    return JSON.stringify({ ...f, items: f.items.filter((_, i) => !isBlankItem(v.items[i])) });
  };
  return norm(a) === norm(b);
}

// ---------------------------------------------------------------------------
// Leaving the editor
// ---------------------------------------------------------------------------

const EDITOR_PATH = /^\/purchase-orders\/(new|\d+\/edit)(?:[?#/]|$)/;

/**
 * Path of the previous history entry, when the browser can tell (Navigation API) and going back to
 * it stays inside the running app (a full page load would drop the "saved" message).
 */
function previousEntryPath(): string | null {
  const nav = (window as unknown as {
    navigation?: {
      currentEntry?: { index: number } | null;
      entries?: () => Array<{ url: string | null; sameDocument?: boolean }>;
    };
  }).navigation;
  const index = nav?.currentEntry?.index ?? -1;
  if (!nav?.entries || index <= 0) return null;
  const previous = nav.entries()[index - 1];
  const url = previous?.url;
  if (!url || previous.sameDocument === false) return null;
  try {
    const u = new URL(url);
    return u.origin === window.location.origin ? u.pathname + u.search : null;
  } catch {
    return null;
  }
}

/**
 * Closes the editor like a compose sheet: goes back to the screen it was opened from, so the
 * editor doesn't stay in history (Back later doesn't reopen it). When that screen isn't known,
 * `fallback(href)` is used (callers replace the editor's history entry with `href`).
 * `onlyIfPrevious`: go back only when the previous screen is `href` itself.
 */
export function leaveEditor(href: string, fallback: (href: string) => void, { onlyIfPrevious = false } = {}) {
  const previous = previousEntryPath();
  const canGoBack = previous !== null && !EDITOR_PATH.test(previous) && (!onlyIfPrevious || previous === href);
  if (canGoBack) window.history.back();
  else fallback(href);
}

/** "today at 3:22 PM", "yesterday at 9:05 AM", "Mar 4 at 3:22 PM". */
export function formatDraftTime(iso: string): string {
  const d = parseDate(iso);
  if (!d) return "earlier";
  const time = format(d, "h:mm a");
  if (isToday(d)) return `today at ${time}`;
  if (isYesterday(d)) return `yesterday at ${time}`;
  return `${format(d, "MMM d")} at ${time}`;
}
