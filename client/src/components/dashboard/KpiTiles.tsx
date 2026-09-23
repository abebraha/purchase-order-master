import type { ReactNode } from "react";
import { Link } from "wouter";
import { CalendarClock, CalendarDays, FileText, Package, type LucideIcon } from "lucide-react";
import { IconTile, type IosColor } from "@/components/kit";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney, formatNumber, pluralize } from "@/lib/format";
import { DUE_SOON_DAYS, ordersHref } from "@/lib/filters";
import { cn } from "@/lib/utils";
import { figureMoney, figureNumber, OPEN_STATUSES, ORDERED_STATUSES, type DashboardSummary } from "./metrics";

// ---------------------------------------------------------------------------
// Tile
// ---------------------------------------------------------------------------

interface KpiTileProps {
  href: string;
  icon: LucideIcon;
  color: IosColor;
  label: string;
  /** Big glanceable figure (already formatted). */
  value: string;
  /** Exact value, shown on hover and read by screen readers. */
  exactValue?: string;
  /** One line of context. Pass several parts to show them as "a · b". */
  detail: ReactNode | ReactNode[];
}

/**
 * A tappable summary tile, like the cards in Health's Summary or Reminders' smart lists:
 * colored icon + label, one big number, one line of context.
 */
export function KpiTile({ href, icon, color, label, value, exactValue, detail }: KpiTileProps) {
  const parts = (Array.isArray(detail) ? detail : [detail]).filter((part) => part != null && part !== false);
  return (
    <Link
      href={href}
      className={cn(
        "group flex min-w-0 flex-col rounded-2xl bg-card p-3.5 outline-none md:p-4",
        "transition-[background-color,transform] duration-150 active:scale-[0.98]",
        "hover:bg-accent/60 dark:hover:bg-accent/80 focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      {/* min-h-8 fits a two-line label, so values in a row line up whether or not a label wraps. */}
      <div className="flex min-h-8 min-w-0 items-center gap-2">
        <IconTile icon={icon} color={color} />
        {/* Wraps to a second line on very narrow phones instead of cutting the label off. */}
        <span className="line-clamp-2 min-w-0 text-[13px] font-semibold leading-4 text-muted-foreground md:text-sm md:leading-5">
          {label}
        </span>
      </div>
      <div
        className="mt-3 truncate text-[28px] font-semibold leading-8 tracking-[-0.02em] md:mt-4 md:text-[30px] md:leading-9"
        title={exactValue}
      >
        {exactValue && <span className="sr-only">{exactValue}</span>}
        <span aria-hidden={exactValue ? true : undefined}>{value}</span>
      </div>
      {/*
        Detail parts are separated by a centered "·". Each part reserves the separator's width on
        its left and the row is shifted left by the same amount inside an overflow-hidden box, so
        a part that wraps to the start of a line has its "·" clipped instead of dangling.
      */}
      <div className="mt-1 min-w-0 overflow-hidden text-[13px] leading-[18px] text-muted-foreground">
        <div className="-ml-3 flex flex-wrap items-baseline">
          {parts.map((part, i) => (
            <span key={i} className="relative min-w-0 pl-3">
              {i > 0 && (
                <span aria-hidden className="absolute left-0 w-3 text-center">
                  ·
                </span>
              )}
              {part}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}

export function KpiTilesSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4" aria-hidden>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-2xl bg-card p-3.5 md:p-4">
          <div className="flex min-h-8 items-center gap-2">
            <Skeleton className="h-[29px] w-[29px] rounded-[7px]" />
            <Skeleton className="h-3.5 w-20 rounded-full" />
          </div>
          <Skeleton className="mt-3.5 h-7 w-24 rounded-lg md:mt-5" />
          <Skeleton className="mt-2 h-3 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The four Home tiles
// ---------------------------------------------------------------------------

function Delta({ change, compareLabel }: { change: number | null; compareLabel: string }) {
  if (change === null) return null;
  const pct = Math.round(Math.abs(change) * 100);
  if (pct === 0) {
    return <span title={`Same as ${compareLabel}`}>Even</span>;
  }
  const up = change > 0;
  const text = `${up ? "Up" : "Down"} ${pct.toLocaleString("en-US")}% compared with ${compareLabel}`;
  return (
    <span className="whitespace-nowrap" title={text}>
      <span aria-hidden>
        {up ? "▲" : "▼"} {pct.toLocaleString("en-US")}%
      </span>
      <span className="sr-only">, {text}</span>
    </span>
  );
}

export function KpiTiles({ summary }: { summary: DashboardSummary }) {
  const { open, month, dueSoonCount, overdueCount } = summary;
  const cancelHref =
    dueSoonCount === 0 && overdueCount > 0 ? ordersHref({ due: "overdue" }) : ordersHref({ due: "soon" });

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
      <KpiTile
        href={ordersHref({ status: OPEN_STATUSES })}
        icon={FileText}
        color="blue"
        label="Open Orders"
        value={figureMoney(open.value)}
        exactValue={formatMoney(open.value)}
        // Counts Draft through Shipped, so say what it means: it's more than the "Open" status alone.
        // On narrow phones it wraps only as "15 orders / to receive".
        detail={
          <span>
            <span className="whitespace-nowrap">{pluralize(open.count, "order")}</span>{" "}
            <span className="whitespace-nowrap">to receive</span>
          </span>
        }
      />
      <KpiTile
        href={ordersHref({ status: OPEN_STATUSES })}
        icon={Package}
        color="indigo"
        label="Units on Order"
        value={figureNumber(open.units)}
        exactValue={`${formatNumber(open.units)} units`}
        detail={pluralize(open.styles, "style")}
      />
      <KpiTile
        // Cancelled orders don't count toward the month, so the list leaves them out too.
        href={ordersHref({ from: month.from, to: month.to, status: ORDERED_STATUSES })}
        icon={CalendarDays}
        color="teal"
        label="This Month"
        value={figureMoney(month.value)}
        exactValue={formatMoney(month.value)}
        detail={[
          <span className="whitespace-nowrap">{pluralize(month.count, "order")}</span>,
          month.change !== null && <Delta change={month.change} compareLabel={month.compareLabel} />,
        ]}
      />
      <KpiTile
        href={cancelHref}
        icon={CalendarClock}
        color="orange"
        label="Cancel Soon"
        value={dueSoonCount.toLocaleString("en-US")}
        exactValue={`${pluralize(dueSoonCount, "order")} with a cancel date in the next ${DUE_SOON_DAYS} days`}
        detail={
          overdueCount > 0 ? (
            <span className="font-medium text-destructive">{overdueCount.toLocaleString("en-US")} overdue</span>
          ) : (
            `Next ${DUE_SOON_DAYS} days`
          )
        }
      />
    </div>
  );
}
