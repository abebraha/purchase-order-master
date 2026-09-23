// Shared purchase-order domain: constants, validation, and pure helpers.
// Imported by the server (relative path) and the client (via "@shared/po").
// Keep this file free of Node- or browser-only APIs.
import { z } from "zod";

export const PO_STATUSES = [
  "draft",
  "open",
  "in_production",
  "shipped",
  "received",
  "cancelled",
] as const;
export type POStatus = (typeof PO_STATUSES)[number];

export const PO_STATUS_LABELS: Record<POStatus, string> = {
  draft: "Draft",
  open: "Open",
  in_production: "In Production",
  shipped: "Shipped",
  received: "Received",
  cancelled: "Cancelled",
};

/** Statuses where the order is still expected to ship (used for "needs attention"). */
export const ACTIVE_STATUSES: POStatus[] = ["draft", "open", "in_production"];

export const PO_TYPES = ["Regular PO", "Bulk"] as const;
export type POType = (typeof PO_TYPES)[number];

/** Suggested payment terms. Any non-empty text is accepted (legacy data may contain "Other"). */
export const TERM_PRESETS = ["Net 30", "Net 45", "Net 60", "Net 90", "Due on Receipt", "Prepaid"] as const;

export const REVISION_ACTIONS = [
  "baseline",
  "external",
  "created",
  "updated",
  "status",
  "archived",
  "restored",
  "deleted",
  "recovered",
] as const;
export type RevisionAction = (typeof REVISION_ACTIONS)[number];

export const REVISION_ACTION_LABELS: Record<RevisionAction, string> = {
  baseline: "Saved to history",
  external: "Changed outside the app",
  created: "Created",
  updated: "Edited",
  status: "Status changed",
  archived: "Archived",
  restored: "Restored from archive",
  deleted: "Permanently deleted",
  recovered: "Recovered after deletion",
};

// ---------------------------------------------------------------------------
// API shapes (what the server returns as JSON)
// ---------------------------------------------------------------------------

export interface POItem {
  id?: number;
  /** Linked style id, or null for a manually typed style number. */
  styleId: number | null;
  /** Style number as saved on the PO line (snapshot). */
  manualStyleNumber: string;
  /** Resolved style number to display: manualStyleNumber, falling back to the linked style. */
  styleNumber: string;
  color: string;
  description: string;
  quantity: number;
  price: number;
}

export interface PurchaseOrder {
  id: number;
  poNumber: string;
  poType: string;
  status: POStatus;
  /** ISO timestamps. Calendar dates are stored at 12:00 UTC so they render on the same day in US time zones. */
  orderDate: string;
  startShipDate: string;
  cancelDate: string;
  dueDate: string;
  terms: string;
  shipTo: string;
  billTo: string;
  specialInstructions: string;
  /** Internal notes — never printed on the PO document. */
  notes: string;
  createdAt: string;
  updatedAt: string | null;
  archivedAt: string | null;
  /**
   * True for purchase orders created before status tracking existed that nobody has edited or
   * given a status since. Their status/dates weren't tracked, so they're kept out of
   * "overdue" / "cancel soon" alerts and offered for a quick review instead.
   */
  needsReview: boolean;
  /**
   * Content fingerprint of the saved PO. The editor sends it back as `expectedVersion`; the
   * server refuses the save (HTTP 412) if the PO changed in the meantime (another device, etc.).
   */
  version: string;
  items: POItem[];
  itemCount: number;
  totalQuantity: number;
  totalAmount: number;
}

export interface PORevision {
  id: number;
  poId: number;
  poNumber: string;
  action: RevisionAction;
  summary: string;
  snapshot: PurchaseOrder;
  createdAt: string;
}

export interface DeletedPurchaseOrder {
  revisionId: number;
  poId: number;
  poNumber: string;
  deletedAt: string;
  snapshot: PurchaseOrder;
}

export interface StyleRecord {
  id: number;
  styleNumber: string;
  color: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  /** Number of PO lines that reference this style (by link or by style number). */
  usageCount: number;
}

export interface StyleImportResult {
  created: number;
  skipped: number;
  message: string;
}

/**
 * A style number typed on purchase-order lines that isn't in the styles catalog ("library")
 * yet. Built from every saved PO, archived ones included; the POs themselves are never changed.
 */
export interface StyleSuggestion {
  /** The most common spelling as typed on the orders. */
  styleNumber: string;
  /** Most common non-empty color on its lines ("" if none). */
  color: string;
  /** Most common non-empty description on its lines ("" if none). */
  description: string;
  /** Every distinct color it was ordered in, most used first. */
  colors: string[];
  /** PO lines that use it. */
  lines: number;
  /** Distinct purchase orders that use it. */
  orders: number;
  /** Units ordered, not counting cancelled orders. */
  units: number;
  /** Latest order date (ISO). */
  lastOrdered: string;
}

export interface AddressSuggestion {
  value: string;
  count: number;
  lastUsed: string;
}

export interface AddressBook {
  shipTo: AddressSuggestion[];
  billTo: AddressSuggestion[];
}

export interface CompanyProfile {
  name: string;
  /** Multi-line street address. */
  address: string;
  email: string;
  phone: string;
}

export interface AppSettings {
  company: CompanyProfile;
  defaults: {
    poType: POType;
    terms: string;
    shipTo: string;
    billTo: string;
  };
  /** Optional note printed at the bottom of every PO document. */
  documentFooter: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  company: {
    name: "Soul Lune Apparel Group",
    address: "31 W 34th St. Suite 8028, New York, NY 10001",
    email: "ira@slapparelgroupny.com",
    phone: "+1 (646) 251-2759",
  },
  defaults: {
    poType: "Regular PO",
    terms: "Net 30",
    shipTo: "",
    billTo: "",
  },
  documentFooter: "",
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export const DATE_INPUT_RE = /^\d{4}-\d{2}-\d{2}$/;

const dateInput = z
  .string({ required_error: "Date is required" })
  .regex(DATE_INPUT_RE, "Enter a valid date");

export const POItemFormSchema = z
  .object({
    styleId: z.number().int().positive().nullable(),
    manualStyleNumber: z.string().trim(),
    color: z.string().trim().min(1, "Color is required"),
    description: z.string().trim(),
    quantity: z.coerce
      .number({ invalid_type_error: "Enter a quantity" })
      .positive("Must be more than 0"),
    price: z.coerce
      .number({ invalid_type_error: "Enter a price" })
      .min(0, "Can't be negative"),
  })
  // Older orders have lines without a style number; a description is enough to identify them.
  .refine((i) => i.manualStyleNumber.length > 0 || i.styleId !== null || i.description.length > 0, {
    path: ["manualStyleNumber"],
    message: "Choose a style (or add a description)",
  });

/** Form values used by the create/edit PO screen. Dates are `yyyy-MM-dd` strings (native date inputs). */
const POFormObject = z.object({
    poNumber: z.string().trim().min(1, "PO number is required").max(64, "Too long"),
    poType: z.enum(PO_TYPES),
    status: z.enum(PO_STATUSES),
    terms: z.string().trim().min(1, "Payment terms are required"),
    orderDate: dateInput,
    startShipDate: dateInput,
    cancelDate: dateInput,
    shipTo: z.string().trim().min(1, "Ship To address is required"),
    billTo: z.string().trim().min(1, "Bill To address is required"),
    specialInstructions: z.string(),
    notes: z.string(),
    items: z.array(POItemFormSchema).min(1, "Add at least one line item"),
});

export const POFormSchema = POFormObject.refine((v) => v.cancelDate >= v.startShipDate, {
  path: ["cancelDate"],
  message: "Cancel date must be on or after the start ship date",
});

/**
 * "Save as Draft" only needs a PO number and valid dates — everything else can be finished
 * later. (The server applies the same relaxed rules to drafts.)
 */
export const PODraftSchema = POFormObject.extend({
  shipTo: z.string(),
  billTo: z.string(),
  terms: z.string(),
  items: z.array(
    z.object({
      styleId: z.number().int().positive().nullable(),
      manualStyleNumber: z.string(),
      color: z.string(),
      description: z.string(),
      quantity: z.coerce.number({ invalid_type_error: "Enter a quantity" }).min(0, "Can't be negative"),
      price: z.coerce.number({ invalid_type_error: "Enter a price" }).min(0, "Can't be negative"),
    }),
  ),
});

export type POItemFormValues = z.infer<typeof POItemFormSchema>;
export type POFormValues = z.infer<typeof POFormSchema>;

export const StyleFormSchema = z.object({
  styleNumber: z.string().trim().min(1, "Style number is required").max(64, "Too long"),
  color: z.string().trim(),
  description: z.string().trim(),
});
export type StyleFormValues = z.infer<typeof StyleFormSchema>;

export const SettingsSchema = z.object({
  company: z.object({
    name: z.string().trim().min(1, "Company name is required"),
    address: z.string().trim(),
    email: z.string().trim(),
    phone: z.string().trim(),
  }),
  defaults: z.object({
    poType: z.enum(PO_TYPES),
    terms: z.string().trim().min(1, "Default terms are required"),
    shipTo: z.string(),
    billTo: z.string(),
  }),
  documentFooter: z.string(),
});

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** "$1,234.56" — used in history summaries (server and client). */
export function formatUsd(n: number): string {
  return `$${(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function lineTotal(item: { quantity: number | string; price: number | string }): number {
  const q = Number(item.quantity) || 0;
  const p = Number(item.price) || 0;
  return roundMoney(q * p);
}

export function computeTotals(items: Array<{ quantity: number | string; price: number | string }>) {
  let totalQuantity = 0;
  let totalAmount = 0;
  for (const item of items) {
    totalQuantity += Number(item.quantity) || 0;
    totalAmount += lineTotal(item);
  }
  return { itemCount: items.length, totalQuantity, totalAmount: roundMoney(totalAmount) };
}

/**
 * Suggest the next PO number after `last`, keeping any prefix and zero padding.
 * "1002" -> "1003", "SL-0099" -> "SL-0100", "ABC" -> "ABC-1".
 */
export function incrementPoNumber(last: string): string {
  const match = last.match(/^(.*?)(\d+)(\D*)$/);
  if (!match) return last ? `${last}-1` : "1001";
  const [, prefix, digits, suffix] = match;
  const next = String(BigInt(digits) + BigInt(1)).padStart(digits.length, "0");
  return `${prefix}${next}${suffix}`;
}

const FIELD_LABELS: Partial<Record<keyof PurchaseOrder, string>> = {
  poNumber: "PO number",
  poType: "PO type",
  status: "Status",
  orderDate: "Order date",
  startShipDate: "Start ship date",
  cancelDate: "Cancel date",
  terms: "Terms",
  shipTo: "Ship To",
  billTo: "Bill To",
  specialInstructions: "Special instructions",
  notes: "Internal notes",
};

const DATE_FIELDS = new Set<keyof PurchaseOrder>(["orderDate", "startShipDate", "cancelDate"]);

/**
 * Calendar days are compared in the company's time zone (New York). Older orders stored exact
 * times (e.g. 11 pm Eastern = 03:00 UTC the next day); comparing UTC days would report date
 * changes nobody made.
 */
export const BUSINESS_TIME_ZONE = "America/New_York";
const businessDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function dayOf(iso: string | null | undefined): string {
  if (!iso) return "";
  if (DATE_INPUT_RE.test(String(iso))) return String(iso);
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : businessDay.format(d);
}

function itemKey(i: POItem): string {
  return [i.styleNumber || i.manualStyleNumber, i.color, i.description].join("\u0000").toLowerCase();
}

/** Human-readable list of what changed between two snapshots of the same PO. */
export function describeChanges(before: PurchaseOrder | null | undefined, after: PurchaseOrder): string[] {
  if (!before) return [];
  const changes: string[] = [];

  for (const key of Object.keys(FIELD_LABELS) as Array<keyof PurchaseOrder>) {
    const label = FIELD_LABELS[key]!;
    const a = before[key];
    const b = after[key];
    if (DATE_FIELDS.has(key)) {
      if (dayOf(a as string) !== dayOf(b as string)) changes.push(`${label} changed`);
    } else if (key === "status") {
      if (a !== b) {
        changes.push(
          `Status: ${PO_STATUS_LABELS[a as POStatus] ?? a} → ${PO_STATUS_LABELS[b as POStatus] ?? b}`,
        );
      }
    } else if (key === "poNumber" || key === "poType" || key === "terms") {
      if ((a ?? "") !== (b ?? "")) changes.push(`${label}: ${a || "—"} → ${b || "—"}`);
    } else if (String(a ?? "").trim() !== String(b ?? "").trim()) {
      changes.push(`${label} updated`);
    }
  }

  const beforeItems = new Map<string, POItem[]>();
  for (const i of before.items ?? []) {
    const k = itemKey(i);
    beforeItems.set(k, [...(beforeItems.get(k) ?? []), i]);
  }
  let added = 0;
  let changedLines = 0;
  for (const i of after.items ?? []) {
    const k = itemKey(i);
    const list = beforeItems.get(k);
    if (list && list.length) {
      const prev = list.shift()!;
      if (Number(prev.quantity) !== Number(i.quantity) || Number(prev.price) !== Number(i.price)) {
        changedLines++;
      }
    } else {
      added++;
    }
  }
  let removed = 0;
  beforeItems.forEach((list) => {
    removed += list.length;
  });
  if (added) changes.push(`${added} line${added === 1 ? "" : "s"} added`);
  if (removed) changes.push(`${removed} line${removed === 1 ? "" : "s"} removed`);
  if (changedLines) changes.push(`${changedLines} line${changedLines === 1 ? "" : "s"} changed qty/price`);

  if (roundMoney(before.totalAmount) !== roundMoney(after.totalAmount)) {
    changes.push(`Total: ${formatUsd(before.totalAmount)} → ${formatUsd(after.totalAmount)}`);
  }
  return changes;
}
