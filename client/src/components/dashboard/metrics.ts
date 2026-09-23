/**
 * Pure summary math for the Home screen. Everything here is derived from the active
 * (non-archived) purchase-order list so the numbers on every card agree with each other.
 */
import {
  addDays,
  addMonths,
  endOfMonth,
  format,
  getDaysInMonth,
  startOfDay,
  startOfMonth,
  subDays,
} from "date-fns";
import { lineTotal, PO_STATUSES, type POStatus, type PurchaseOrder } from "@shared/po";
import { parseDate } from "@/lib/format";
import { isDueSoon, isOverdue, sortOrders } from "@/lib/filters";

/**
 * "Open Orders" on Home: everything still to be received — Draft, Open, In Production and
 * Shipped (a wider set than the single "Open" status, so the tile says "to receive").
 */
export const OPEN_STATUSES: POStatus[] = ["draft", "open", "in_production", "shipped"];

/**
 * Orders that count toward "This Month", the monthly chart and Top Styles: every status except
 * Cancelled. Links from those figures filter the list by the same statuses so the counts match.
 */
export const ORDERED_STATUSES: POStatus[] = PO_STATUSES.filter((s) => s !== "cancelled");

export const TOP_STYLES_DAYS = 90;
const MONTHS_IN_CHART = 12;
const LIST_LIMIT = 5;

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const dateKey = (d: Date) => format(d, "yyyy-MM-dd");

export interface MonthBucket {
  /** yyyy-MM */
  key: string;
  start: Date;
  value: number;
  count: number;
  current: boolean;
}

export interface StatusSlice {
  status: POStatus;
  count: number;
  value: number;
}

export interface TopStyle {
  styleNumber: string;
  description: string;
  units: number;
  value: number;
  orders: number;
}

export interface DashboardSummary {
  open: { value: number; count: number; units: number; styles: number };
  month: {
    value: number;
    count: number;
    /** Fractional change vs the same days of last month; null when there is nothing to compare. */
    change: number | null;
    /** yyyy-MM-dd bounds of this calendar month (for the orders link). */
    from: string;
    to: string;
    /** "Aug 1–23" — the comparison window. */
    compareLabel: string;
  };
  dueSoonCount: number;
  overdueCount: number;
  /** Overdue + due-soon active orders, soonest cancel date first (max 5). */
  attention: PurchaseOrder[];
  attentionTotal: number;
  recent: PurchaseOrder[];
  monthly: MonthBucket[];
  statuses: StatusSlice[];
  totalCount: number;
  totalValue: number;
  topStyles: TopStyle[];
}

/** Picks the most common non-empty text (for a style's description). */
function mostCommon(counts: Map<string, number>): string {
  let best = "";
  let bestCount = 0;
  counts.forEach((c, text) => {
    if (c > bestCount) {
      best = text;
      bestCount = c;
    }
  });
  return best;
}

export function summarize(orders: PurchaseOrder[], now: Date = new Date()): DashboardSummary {
  // --- Open orders ------------------------------------------------------------------------
  const openStyles = new Set<string>();
  let openValue = 0;
  let openCount = 0;
  let openUnits = 0;
  for (const po of orders) {
    if (!OPEN_STATUSES.includes(po.status)) continue;
    openCount++;
    openValue += num(po.totalAmount);
    openUnits += num(po.totalQuantity);
    for (const item of po.items ?? []) {
      const style = (item.styleNumber || item.manualStyleNumber || "").trim().toUpperCase();
      if (style) openStyles.add(style);
    }
  }

  // --- This month vs the same days last month -------------------------------------------------
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const prevStart = startOfMonth(addMonths(now, -1));
  const prevDays = Math.min(now.getDate(), getDaysInMonth(prevStart));
  const prevEnd = addDays(prevStart, prevDays - 1);
  const [mFrom, mTo, pFrom, pTo] = [monthStart, monthEnd, prevStart, prevEnd].map(dateKey);

  let monthValue = 0;
  let monthCount = 0;
  let prevValue = 0;

  // --- Monthly chart buckets ----------------------------------------------------------------
  const monthly: MonthBucket[] = [];
  const bucketByKey = new Map<string, MonthBucket>();
  for (let i = MONTHS_IN_CHART - 1; i >= 0; i--) {
    const start = startOfMonth(addMonths(now, -i));
    const bucket: MonthBucket = { key: format(start, "yyyy-MM"), start, value: 0, count: 0, current: i === 0 };
    monthly.push(bucket);
    bucketByKey.set(bucket.key, bucket);
  }

  // --- Top styles (last 90 days) ---------------------------------------------------------------
  const styleCutoff = dateKey(subDays(startOfDay(now), TOP_STYLES_DAYS));
  const styles = new Map<
    string,
    { styleNumber: string; units: number; value: number; orders: Set<number>; descriptions: Map<string, number> }
  >();

  for (const po of orders) {
    if (!ORDERED_STATUSES.includes(po.status)) continue;
    const ordered = parseDate(po.orderDate);
    if (!ordered) continue;
    const day = dateKey(ordered);
    const amount = num(po.totalAmount);

    if (day >= mFrom && day <= mTo) {
      monthValue += amount;
      monthCount++;
    } else if (day >= pFrom && day <= pTo) {
      prevValue += amount;
    }

    const bucket = bucketByKey.get(day.slice(0, 7));
    if (bucket) {
      bucket.value += amount;
      bucket.count++;
    }

    if (day >= styleCutoff) {
      for (const item of po.items ?? []) {
        const styleNumber = (item.styleNumber || item.manualStyleNumber || "").trim();
        if (!styleNumber) continue;
        const key = styleNumber.toUpperCase();
        let entry = styles.get(key);
        if (!entry) {
          entry = { styleNumber, units: 0, value: 0, orders: new Set(), descriptions: new Map() };
          styles.set(key, entry);
        }
        entry.units += num(item.quantity);
        entry.value += lineTotal(item);
        entry.orders.add(po.id);
        const description = (item.description ?? "").trim();
        if (description) entry.descriptions.set(description, (entry.descriptions.get(description) ?? 0) + 1);
      }
    }
  }

  const change = prevValue > 0 ? (monthValue - prevValue) / prevValue : null;

  // --- Needs attention -----------------------------------------------------------------------
  const cancelTime = (po: PurchaseOrder) => parseDate(po.cancelDate)?.getTime() ?? 0;
  let overdueCount = 0;
  let dueSoonCount = 0;
  const attentionAll: PurchaseOrder[] = [];
  for (const po of orders) {
    if (isOverdue(po)) {
      overdueCount++;
      attentionAll.push(po);
    } else if (isDueSoon(po)) {
      dueSoonCount++;
      attentionAll.push(po);
    }
  }
  attentionAll.sort((a, b) => cancelTime(a) - cancelTime(b) || a.id - b.id);

  // --- Status breakdown ----------------------------------------------------------------------
  const statuses: StatusSlice[] = PO_STATUSES.map((status) => ({ status, count: 0, value: 0 }));
  let totalValue = 0;
  for (const po of orders) {
    const slice = statuses.find((s) => s.status === po.status);
    if (slice) {
      slice.count++;
      slice.value += num(po.totalAmount);
    }
    totalValue += num(po.totalAmount);
  }

  const topStyles: TopStyle[] = Array.from(styles.values())
    .map((s) => ({
      styleNumber: s.styleNumber,
      description: mostCommon(s.descriptions),
      units: s.units,
      value: s.value,
      orders: s.orders.size,
    }))
    .sort((a, b) => b.units - a.units || b.value - a.value)
    .slice(0, LIST_LIMIT);

  return {
    open: { value: openValue, count: openCount, units: openUnits, styles: openStyles.size },
    month: {
      value: monthValue,
      count: monthCount,
      change,
      from: mFrom,
      to: mTo,
      compareLabel:
        prevDays === 1 ? format(prevStart, "MMM d") : `${format(prevStart, "MMM d")}–${format(prevEnd, "d")}`,
    },
    dueSoonCount,
    overdueCount,
    attention: attentionAll.slice(0, LIST_LIMIT),
    attentionTotal: attentionAll.length,
    recent: sortOrders(orders, "newest").slice(0, LIST_LIMIT),
    monthly,
    statuses,
    totalCount: orders.length,
    totalValue,
    topStyles,
  };
}

// ---------------------------------------------------------------------------
// Number formatting for big, glanceable figures
// ---------------------------------------------------------------------------

const wholeMoney = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const compactNumber = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const compactMoney = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

/** "$8,400" below $100K, "$412.5K" / "$1.2M" above — fits a phone tile. */
export function figureMoney(n: number): string {
  return Math.abs(n) >= 100_000 ? compactMoney.format(n) : wholeMoney.format(Math.round(n));
}

/** "38,400" below 100K, "412.5K" above. */
export function figureNumber(n: number): string {
  return Math.abs(n) >= 100_000 ? compactNumber.format(n) : Math.round(n).toLocaleString("en-US");
}

/** "$412,510" — whole dollars. */
export function formatWholeMoney(n: number): string {
  return wholeMoney.format(Math.round(n));
}

/** Time-of-day greeting in Title Case. */
export function greeting(now: Date): string {
  const h = now.getHours();
  if (h >= 5 && h < 12) return "Good Morning";
  if (h >= 12 && h < 17) return "Good Afternoon";
  return "Good Evening";
}
