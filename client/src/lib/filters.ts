import { ACTIVE_STATUSES, PO_STATUSES, type POStatus, type PurchaseOrder } from "@shared/po";
import { DATE_INPUT_RE } from "@shared/po";
import { daysFromToday, parseDate } from "@/lib/format";

/**
 * Purchase-order list filters. They live in the URL query string so filtered views can be
 * linked (e.g. from the dashboard) and survive back/forward navigation.
 *
 *   q       free-text search
 *   status  comma-separated POStatus values
 *   type    "Regular PO" | "Bulk"
 *   view    "archived" to show archived POs (default: active)
 *   sort    newest | oldest | po | cancel | amount
 *   from,to order-date range, yyyy-MM-dd (inclusive)
 *   due     soon (cancel date within DUE_SOON_DAYS) | overdue (cancel date passed) — active POs only
 */
export type OrderSort = "newest" | "oldest" | "po" | "cancel" | "amount";
export type DueFilter = "soon" | "overdue";

export interface OrderFilters {
  q: string;
  status: POStatus[];
  type: string;
  view: "active" | "archived";
  sort: OrderSort;
  from: string;
  to: string;
  due: DueFilter | "";
}

export const DEFAULT_FILTERS: OrderFilters = {
  q: "",
  status: [],
  type: "",
  view: "active",
  sort: "newest",
  from: "",
  to: "",
  due: "",
};

export const SORT_OPTIONS: Array<{ value: OrderSort; label: string }> = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "cancel", label: "Cancel date (soonest)" },
  { value: "amount", label: "Amount (highest)" },
  { value: "po", label: "PO number" },
];

/** Days ahead that count as "cancel date coming up". */
export const DUE_SOON_DAYS = 14;

const SORTS = new Set<OrderSort>(["newest", "oldest", "po", "cancel", "amount"]);

export function parseOrderFilters(search: string): OrderFilters {
  const p = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const status = (p.get("status") ?? "")
    .split(",")
    .filter((s): s is POStatus => (PO_STATUSES as readonly string[]).includes(s));
  const sort = p.get("sort") as OrderSort;
  const due = p.get("due");
  const date = (v: string | null) => (v && DATE_INPUT_RE.test(v) ? v : "");
  return {
    q: p.get("q") ?? "",
    status,
    type: p.get("type") ?? "",
    view: p.get("view") === "archived" ? "archived" : "active",
    sort: SORTS.has(sort) ? sort : "newest",
    from: date(p.get("from")),
    to: date(p.get("to")),
    due: due === "soon" || due === "overdue" ? due : "",
  };
}

/** Query string (without "?") containing only non-default values. */
export function serializeOrderFilters(filters: Partial<OrderFilters>): string {
  const f = { ...DEFAULT_FILTERS, ...filters };
  const p = new URLSearchParams();
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.status.length) p.set("status", f.status.join(","));
  if (f.type) p.set("type", f.type);
  if (f.view === "archived") p.set("view", "archived");
  if (f.sort !== "newest") p.set("sort", f.sort);
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", f.to);
  if (f.due) p.set("due", f.due);
  return p.toString();
}

/** Link to the purchase-order list with the given filters, e.g. ordersHref({ due: "overdue" }). */
export function ordersHref(filters: Partial<OrderFilters> = {}): string {
  const qs = serializeOrderFilters(filters);
  return qs ? `/purchase-orders?${qs}` : "/purchase-orders";
}

export function isActivePO(po: Pick<PurchaseOrder, "status">): boolean {
  return ACTIVE_STATUSES.includes(po.status);
}

/** Active PO whose cancel date has passed. */
export function isOverdue(po: Pick<PurchaseOrder, "status" | "cancelDate">): boolean {
  const d = daysFromToday(po.cancelDate);
  return isActivePO(po) && d !== null && d < 0;
}

/** Active PO whose cancel date is today or within the next `days` days. */
export function isDueSoon(po: Pick<PurchaseOrder, "status" | "cancelDate">, days = DUE_SOON_DAYS): boolean {
  const d = daysFromToday(po.cancelDate);
  return isActivePO(po) && d !== null && d >= 0 && d <= days;
}

function searchText(po: PurchaseOrder): string {
  return [
    po.poNumber,
    po.poType,
    po.terms,
    po.shipTo,
    po.billTo,
    po.specialInstructions,
    po.notes,
    ...po.items.flatMap((i) => [i.styleNumber, i.manualStyleNumber, i.color, i.description]),
  ]
    .join(" \n ")
    .toLowerCase();
}

export function matchesFilters(po: PurchaseOrder, f: OrderFilters): boolean {
  if (f.status.length && !f.status.includes(po.status)) return false;
  if (f.type && po.poType !== f.type) return false;
  if (f.due === "soon" && !isDueSoon(po)) return false;
  if (f.due === "overdue" && !isOverdue(po)) return false;
  if (f.from || f.to) {
    const order = parseDate(po.orderDate);
    if (!order) return false;
    const day = order.getFullYear() * 10000 + (order.getMonth() + 1) * 100 + order.getDate();
    const asNum = (s: string) => Number(s.replace(/-/g, ""));
    if (f.from && day < asNum(f.from)) return false;
    if (f.to && day > asNum(f.to)) return false;
  }
  const q = f.q.trim().toLowerCase();
  if (q) {
    const haystack = searchText(po);
    if (!q.split(/\s+/).every((term) => haystack.includes(term))) return false;
  }
  return true;
}

const time = (iso: string | null | undefined) => parseDate(iso)?.getTime() ?? 0;

export function sortOrders(list: PurchaseOrder[], sort: OrderSort): PurchaseOrder[] {
  const copy = [...list];
  switch (sort) {
    case "oldest":
      return copy.sort((a, b) => time(a.createdAt) - time(b.createdAt) || a.id - b.id);
    case "po":
      return copy.sort((a, b) => a.poNumber.localeCompare(b.poNumber, undefined, { numeric: true }));
    case "cancel":
      return copy.sort((a, b) => time(a.cancelDate) - time(b.cancelDate));
    case "amount":
      return copy.sort((a, b) => b.totalAmount - a.totalAmount);
    case "newest":
    default:
      return copy.sort((a, b) => time(b.createdAt) - time(a.createdAt) || b.id - a.id);
  }
}

export function applyOrderFilters(list: PurchaseOrder[], f: OrderFilters): PurchaseOrder[] {
  return sortOrders(list.filter((po) => matchesFilters(po, f)), f.sort);
}
