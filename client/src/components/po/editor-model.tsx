/**
 * Form model for the purchase-order editor (create / edit / duplicate).
 *
 * The editor keeps quantity and price as the text the user typed ("1,200", "$4.50") so inputs
 * are forgiving; `editorResolver` normalizes them to numbers before running POFormSchema, and
 * handleSubmit receives clean POFormValues.
 */
import type { FieldErrors, Resolver, ResolverOptions, ResolverResult } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { addDays, differenceInCalendarDays, format, isToday, isYesterday } from "date-fns";
import {
  DATE_INPUT_RE,
  PO_STATUSES,
  PO_TYPES,
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

/** 1200 → "1,200" (blank for missing values). */
export function formatQuantityInput(n: number | string | null | undefined): string {
  const v = typeof n === "number" ? n : parseAmount(n);
  if (!Number.isFinite(v)) return "";
  return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** 8.5 → "8.50" (blank for missing values). */
export function formatPriceInput(n: number | string | null | undefined): string {
  const v = typeof n === "number" ? n : parseAmount(n);
  if (!Number.isFinite(v)) return "";
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
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
  return !item.manualStyleNumber?.trim() && !item.color?.trim() && !item.description?.trim() && !item.quantity?.trim() && !item.price?.trim();
}

/** Editor values → schema input (numbers may be NaN; the schema reports those as "Enter a …"). */
export function toFormValues({ customerId: _customerId, ...values }: EditorValues): POFormValues {
  return {
    ...values,
    items: (values.items ?? []).map((i) => ({
      styleId: i.styleId ?? null,
      manualStyleNumber: i.manualStyleNumber ?? "",
      color: i.color ?? "",
      description: i.description ?? "",
      quantity: parseAmount(i.quantity),
      price: parseAmount(i.price),
    })),
  };
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
    billTo: settings.defaults?.billTo ?? "",
    specialInstructions: "",
    notes: "",
    items: [emptyItem()],
    customerId: null,
  };
}

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

/**
 * zodResolver(POFormSchema) on normalized values. Also reports "cancel before start" even when
 * other fields are invalid (zod skips object refinements until the shape is valid).
 */
export const editorResolver: Resolver<EditorValues, unknown, POFormValues> = async (values, context, options) => {
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

// ---------------------------------------------------------------------------
// Local draft (create mode autosave)
// ---------------------------------------------------------------------------

export const DRAFT_KEY = "po-editor-draft";

export interface EditorDraft {
  savedAt: string;
  values: EditorValues;
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

export function loadDraft(fallback: EditorValues): EditorDraft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.savedAt !== "string" || !parsed.values) return null;
    return { savedAt: parsed.savedAt, values: sanitizeValues(parsed.values, fallback) };
  } catch {
    return null;
  }
}

export function saveDraft(values: EditorValues) {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ savedAt: new Date().toISOString(), values }));
  } catch {
    // Storage full or blocked (private mode) — autosave is best effort.
  }
}

export function clearDraft() {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
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
