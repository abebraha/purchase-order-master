import { differenceInCalendarDays, format, isValid, parseISO } from "date-fns";
import { DATE_INPUT_RE } from "@shared/po";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const moneyCompact = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

/** $1,234.56 */
export function formatMoney(n: number | string | null | undefined): string {
  return money.format(Number(n) || 0);
}

/** $1.2K / $3.4M — for tight KPI tiles and chart axes. */
export function formatMoneyCompact(n: number | string | null | undefined): string {
  return moneyCompact.format(Number(n) || 0);
}

/** 1,234 (up to `maxDecimals` decimals, trailing zeros dropped). */
export function formatNumber(n: number | string | null | undefined, maxDecimals = 2): string {
  return (Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: maxDecimals });
}

/**
 * Parse an API date. Accepts ISO timestamps and `yyyy-MM-dd` (interpreted as a local
 * calendar date). Returns null for empty/invalid input.
 */
export function parseDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isValid(value) ? value : null;
  const d = DATE_INPUT_RE.test(value) ? parseISO(value) : new Date(value);
  return isValid(d) ? d : null;
}

/** "Mar 4, 2025" (or a custom date-fns pattern). Empty string for missing dates. */
export function formatDate(value: string | Date | null | undefined, pattern = "MMM d, yyyy"): string {
  const d = parseDate(value);
  return d ? format(d, pattern) : "";
}

/** "Mar 4" */
export function formatDateShort(value: string | Date | null | undefined): string {
  return formatDate(value, "MMM d");
}

/** "Mar 4, 2025 at 3:22 PM" */
export function formatDateTime(value: string | Date | null | undefined): string {
  return formatDate(value, "MMM d, yyyy 'at' h:mm a");
}

/** Value for <input type="date"> in the user's local calendar: "2025-03-04". */
export function toDateInputValue(value: string | Date | null | undefined): string {
  const d = parseDate(value);
  return d ? format(d, "yyyy-MM-dd") : "";
}

export function todayInputValue(): string {
  return format(new Date(), "yyyy-MM-dd");
}

/** Calendar days from today (negative = in the past). */
export function daysFromToday(value: string | Date | null | undefined): number | null {
  const d = parseDate(value);
  return d ? differenceInCalendarDays(d, new Date()) : null;
}

/** "today", "tomorrow", "in 5 days", "yesterday", "3 days ago" */
export function formatRelativeDays(value: string | Date | null | undefined): string {
  const days = daysFromToday(value);
  if (days === null) return "";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

/** First non-empty line of a multi-line address. */
export function firstLine(text: string | null | undefined): string {
  return (text ?? "").split("\n").map((l) => l.trim()).find(Boolean) ?? "";
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? singular : plural}`;
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  // Neutralize spreadsheet formula injection, then quote if needed.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}

export function downloadFile(filename: string, content: BlobPart, mime = "text/plain;charset=utf-8") {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Downloads a CSV with a UTF-8 BOM so Excel opens accents correctly. */
export function downloadCsv(filename: string, rows: unknown[][]) {
  downloadFile(filename, "﻿" + toCsv(rows), "text/csv;charset=utf-8");
}
