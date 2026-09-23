import type { CustomerFormValues, CustomerRecord } from "@shared/po";
import { indexLetter } from "@/components/styles/styleUtils";

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

const collator = new Intl.Collator("en-US", { numeric: true, sensitivity: "base" });

export function sortCustomers(customers: CustomerRecord[]): CustomerRecord[] {
  return [...customers].sort((a, b) => collator.compare(a.name.trim(), b.name.trim()) || a.id - b.id);
}

/** Every word in the query must appear in the name, contact details or addresses (any order). */
export function filterCustomers(customers: CustomerRecord[], query: string): CustomerRecord[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return customers;
  return customers.filter((c) => {
    const haystack = [c.name, c.contactName, c.email, c.phone, c.shipTo, c.billTo].join(" ").toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
}

export interface CustomerGroup {
  key: string;
  customers: CustomerRecord[];
}

/** Groups an already-sorted list into consecutive sections by first character (like Contacts). */
export function groupByLetter(customers: CustomerRecord[]): CustomerGroup[] {
  const groups: CustomerGroup[] = [];
  for (const customer of customers) {
    const key = indexLetter(customer.name);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.customers.push(customer);
    else groups.push({ key, customers: [customer] });
  }
  return groups;
}

/** "Jane Doe · (212) 555-0100", or "" when there are no contact details. */
export function contactLine(c: Pick<CustomerRecord, "contactName" | "email" | "phone">): string {
  return [c.contactName, c.phone || c.email].map((v) => (v ?? "").trim()).filter(Boolean).join(" · ");
}

/** A multi-line address on one line: "Acme, 1 Main St, New York, NY 10001". */
export function oneLineAddress(text: string | null | undefined): string {
  return (text ?? "").split("\n").map((l) => l.trim()).filter(Boolean).join(", ");
}

export function findDuplicateCustomer(
  customers: CustomerRecord[] | undefined,
  name: string,
  excludeId?: number,
): CustomerRecord | undefined {
  const key = name.trim().toLowerCase();
  if (!key || !customers) return undefined;
  return customers.find((c) => c.id !== excludeId && c.name.trim().toLowerCase() === key);
}

export const EMPTY_CUSTOMER: CustomerFormValues = {
  name: "",
  contactName: "",
  email: "",
  phone: "",
  shipTo: "",
  billTo: "",
  terms: "",
  specialInstructions: "",
  notes: "",
};

export function customerFormValues(
  customer: CustomerRecord | null | undefined,
  initial?: Partial<CustomerFormValues>,
): CustomerFormValues {
  if (!customer) return { ...EMPTY_CUSTOMER, ...initial };
  return {
    name: customer.name,
    contactName: customer.contactName ?? "",
    email: customer.email ?? "",
    phone: customer.phone ?? "",
    shipTo: customer.shipTo ?? "",
    billTo: customer.billTo ?? "",
    terms: customer.terms ?? "",
    specialInstructions: customer.specialInstructions ?? "",
    notes: customer.notes ?? "",
  };
}

// ---------------------------------------------------------------------------
// Filling in a purchase order
// ---------------------------------------------------------------------------

/** PO fields a customer fills in. */
export const PREFILL_FIELDS = ["shipTo", "billTo", "terms", "specialInstructions"] as const;
export type PrefillField = (typeof PREFILL_FIELDS)[number];
export type PrefillValues = Record<PrefillField, string>;

export const PREFILL_LABELS: Record<PrefillField, string> = {
  shipTo: "Ship To",
  billTo: "Bill To",
  terms: "payment terms",
  specialInstructions: "special instructions",
};

export function pickPrefill(values: Partial<Record<PrefillField, string | undefined>>): PrefillValues {
  return {
    shipTo: values.shipTo ?? "",
    billTo: values.billTo ?? "",
    terms: values.terms ?? "",
    specialInstructions: values.specialInstructions ?? "",
  };
}

function normalize(text: string | null | undefined): string {
  return (text ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * PO values after switching from the `prev` customer to `next` (null = no customer):
 *  - fields `next` has saved are copied from it;
 *  - fields still showing what `prev` filled in go back to `fallback` (what a PO without a
 *    customer starts with), so nothing from the previous customer is left behind;
 *  - everything else — details typed by hand — is kept.
 */
export function switchCustomer(
  current: PrefillValues,
  prev: CustomerRecord | null,
  next: CustomerRecord | null,
  fallback: PrefillValues,
): PrefillValues {
  const result = { ...current };
  for (const field of PREFILL_FIELDS) {
    const nextValue = next?.[field]?.trim() ?? "";
    const prevValue = prev?.[field]?.trim() ?? "";
    if (nextValue) result[field] = next![field];
    else if (prevValue && normalize(current[field]) === normalize(prevValue)) result[field] = fallback[field];
  }
  return result;
}

/**
 * The one saved customer whose addresses are on this PO (every address the customer has saved
 * matches), or null when none or several match.
 */
export function matchCustomer(
  customers: CustomerRecord[],
  values: Pick<PrefillValues, "shipTo" | "billTo">,
): CustomerRecord | null {
  const matches = customers.filter((c) => {
    const saved = (["shipTo", "billTo"] as const).filter((f) => c[f].trim());
    return saved.length > 0 && saved.every((f) => normalize(c[f]) === normalize(values[f]));
  });
  return matches.length === 1 ? matches[0] : null;
}

/** "Ship To, Bill To and payment terms" */
export function listFields(fields: PrefillField[]): string {
  const labels = fields.map((f) => PREFILL_LABELS[f]);
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}
