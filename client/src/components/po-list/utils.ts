import { endOfMonth, endOfYear, format, startOfMonth, startOfYear, subDays } from "date-fns";
import type { PurchaseOrder } from "@shared/po";
import { daysFromToday, formatDate, formatDateShort, parseDate } from "@/lib/format";
import { DEFAULT_FILTERS, SORT_OPTIONS, type OrderFilters, type OrderSort } from "@/lib/filters";

// ---------------------------------------------------------------------------
// Filter state helpers
// ---------------------------------------------------------------------------

/** How many things are set inside the Filters sheet (type, order date range, sort). */
export function sheetFilterCount(f: OrderFilters): number {
  return (f.type ? 1 : 0) + (f.from || f.to ? 1 : 0) + (f.sort !== DEFAULT_FILTERS.sort ? 1 : 0);
}

/** True when anything narrows or reorders the list (the view itself doesn't count). */
export function hasActiveFilters(f: OrderFilters): boolean {
  return Boolean(f.q.trim() || f.status.length || f.due || sheetFilterCount(f));
}

/** Everything reset except which view (active / archived) is showing. */
export function clearedFilters(f: OrderFilters): OrderFilters {
  return { ...DEFAULT_FILTERS, view: f.view };
}

/** Title Case labels for sort menus (Apple capitalization for menu items). */
const SORT_TITLES: Partial<Record<OrderSort, string>> = {
  newest: "Newest First",
  oldest: "Oldest First",
  cancel: "Cancel Date (Soonest)",
  amount: "Amount (Highest)",
  po: "PO Number",
};

export const SORT_CHOICES: Array<{ value: OrderSort; label: string }> = SORT_OPTIONS.map((o) => ({
  value: o.value,
  label: SORT_TITLES[o.value] ?? o.label,
}));

// ---------------------------------------------------------------------------
// Order-date presets
// ---------------------------------------------------------------------------

export type DatePreset = "all" | "this_month" | "last_30" | "last_90" | "this_year" | "custom";

export const DATE_PRESETS: Array<{ value: DatePreset; label: string }> = [
  { value: "all", label: "All Time" },
  { value: "this_month", label: "This Month" },
  { value: "last_30", label: "Last 30 Days" },
  { value: "last_90", label: "Last 90 Days" },
  { value: "this_year", label: "This Year" },
  { value: "custom", label: "Custom" },
];

const ymd = (d: Date) => format(d, "yyyy-MM-dd");

/** from/to (yyyy-MM-dd) for a preset, relative to today. */
export function presetRange(preset: DatePreset, today = new Date()): { from: string; to: string } {
  switch (preset) {
    case "this_month":
      return { from: ymd(startOfMonth(today)), to: ymd(endOfMonth(today)) };
    case "last_30":
      return { from: ymd(subDays(today, 30)), to: "" };
    case "last_90":
      return { from: ymd(subDays(today, 90)), to: "" };
    case "this_year":
      return { from: ymd(startOfYear(today)), to: ymd(endOfYear(today)) };
    default:
      return { from: "", to: "" };
  }
}

/** Which preset a from/to pair corresponds to ("custom" when none match). */
export function presetFor(from: string, to: string, today = new Date()): DatePreset {
  if (!from && !to) return "all";
  for (const p of ["this_month", "last_30", "last_90", "this_year"] as const) {
    const r = presetRange(p, today);
    if (r.from === from && r.to === to) return p;
  }
  return "custom";
}

/** Short label for an active date range chip: "This Month", "Sep 1 – Sep 30", "Since Aug 24". */
export function dateRangeLabel(from: string, to: string): string {
  const preset = presetFor(from, to);
  if (preset !== "custom" && preset !== "all") {
    return DATE_PRESETS.find((p) => p.value === preset)!.label;
  }
  const withYear = (v: string) => {
    const d = parseDate(v);
    if (!d) return "";
    return d.getFullYear() === new Date().getFullYear() ? formatDateShort(d) : formatDate(d);
  };
  if (from && to) return `${withYear(from)} – ${withYear(to)}`;
  if (from) return `Since ${withYear(from)}`;
  if (to) return `Until ${withYear(to)}`;
  return "All Time";
}

// ---------------------------------------------------------------------------
// Month grouping (phones, newest/oldest sort)
// ---------------------------------------------------------------------------

export interface MonthGroup {
  key: string;
  label: string;
  orders: PurchaseOrder[];
  totalAmount: number;
}

/**
 * Groups orders by order month, newest month first (or oldest first when `ascending`).
 * Within a month, orders are sorted by order date; ties keep their incoming order.
 * Orders without a readable order date land in a final "No Order Date" group.
 */
export function groupByOrderMonth(orders: PurchaseOrder[], ascending = false): MonthGroup[] {
  const map = new Map<string, MonthGroup>();
  const undated: PurchaseOrder[] = [];
  orders.forEach((po) => {
    const d = parseDate(po.orderDate);
    if (!d) {
      undated.push(po);
      return;
    }
    const key = format(d, "yyyy-MM");
    let group = map.get(key);
    if (!group) {
      group = { key, label: format(d, "MMMM yyyy"), orders: [], totalAmount: 0 };
      map.set(key, group);
    }
    group.orders.push(po);
    group.totalAmount += Number(po.totalAmount) || 0;
  });

  const dir = ascending ? 1 : -1;
  const time = (po: PurchaseOrder) => parseDate(po.orderDate)?.getTime() ?? 0;
  const groups = Array.from(map.values()).sort((a, b) => dir * a.key.localeCompare(b.key));
  groups.forEach((g) => {
    const index = new Map(g.orders.map((po, i) => [po.id, i]));
    g.orders.sort((a, b) => dir * (time(a) - time(b)) || index.get(a.id)! - index.get(b.id)!);
  });
  if (undated.length) {
    groups.push({
      key: "none",
      label: "No Order Date",
      orders: undated,
      totalAmount: undated.reduce((sum, po) => sum + (Number(po.totalAmount) || 0), 0),
    });
  }
  return groups;
}

/** True when the list is sorted by date and should be grouped by month. */
export function isDateSort(f: OrderFilters): boolean {
  return f.sort === "newest" || f.sort === "oldest";
}

/**
 * Orders in display order. For newest/oldest the order follows the month grouping (by order
 * date), so the phone list and the desktop table always agree.
 */
export function displayOrder(orders: PurchaseOrder[], f: OrderFilters): PurchaseOrder[] {
  if (!isDateSort(f)) return orders;
  return groupByOrderMonth(orders, f.sort === "oldest").flatMap((g) => g.orders);
}

// ---------------------------------------------------------------------------
// Ship window
// ---------------------------------------------------------------------------

/**
 * Compact ship window: "Oct 1 – Oct 31" this year, "May 1 – 30, 2025" or "Apr 28 – May 30, 2025"
 * for other years, "Dec 20, 2026 – Jan 5, 2027" across years, a single date when start = cancel,
 * or "—" when both are missing.
 */
export function formatShipWindow(start: string | null | undefined, cancel: string | null | undefined): string {
  const s = parseDate(start);
  const c = parseDate(cancel);
  const thisYear = new Date().getFullYear();
  const one = (d: Date) => (d.getFullYear() === thisYear ? formatDateShort(d) : formatDate(d));
  if (!s && !c) return "—";
  if (!s || !c) return one((s ?? c)!);
  if (ymd(s) === ymd(c)) return one(s);
  if (s.getFullYear() !== c.getFullYear()) return `${formatDate(s)} – ${formatDate(c)}`;
  if (c.getFullYear() === thisYear) return `${formatDateShort(s)} – ${formatDateShort(c)}`;
  if (s.getMonth() === c.getMonth()) return `${formatDateShort(s)} – ${format(c, "d, yyyy")}`;
  return `${formatDateShort(s)} – ${formatDate(c)}`;
}

/** Tooltip copy for the cancel date: "Cancel date in 3 days", "Cancel date passed 5 days ago". */
export function cancelDateHint(cancel: string | null | undefined): string {
  const days = daysFromToday(cancel);
  if (days === null) return "";
  if (days === 0) return "Cancel date is today";
  if (days === 1) return "Cancel date is tomorrow";
  if (days > 1) return `Cancel date in ${days} days`;
  if (days === -1) return "Cancel date passed yesterday";
  return `Cancel date passed ${-days} days ago`;
}
