import { PO_STATUS_LABELS } from "@shared/po";
import { ListRow, ListSection } from "@/components/kit";
import { STATUS_STYLES, StatusDot } from "@/components/StatusBadge";
import { formatMoneyCompact, pluralize } from "@/lib/format";
import { ordersHref } from "@/lib/filters";
import { cn } from "@/lib/utils";
import { formatWholeMoney, type StatusSlice } from "./metrics";

/**
 * Orders by status, like iPhone Storage: a thin segmented bar (2px surface gaps between
 * segments) with the list below acting as its legend and table.
 */
export function StatusBreakdown({
  statuses,
  totalCount,
  totalValue,
}: {
  statuses: StatusSlice[];
  totalCount: number;
  totalValue: number;
}) {
  const present = statuses.filter((s) => s.count > 0);
  const summary = present
    .map((s) => `${PO_STATUS_LABELS[s.status]}: ${s.count}`)
    .join(", ");

  return (
    <ListSection>
      <div className="relative px-4 pb-4 pt-3.5 after:absolute after:bottom-0 after:left-4 after:right-0 after:h-px after:bg-border/80">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[17px] font-semibold md:text-[15px]">{pluralize(totalCount, "order")}</span>
          <span className="text-[15px] text-muted-foreground tabular-nums md:text-sm">{formatWholeMoney(totalValue)}</span>
        </div>
        <div
          role="img"
          aria-label={`Orders by status. ${summary}.`}
          className="mt-3 flex h-2.5 gap-[2px] overflow-hidden rounded-full"
        >
          {present.map((s) => (
            <div
              key={s.status}
              title={`${PO_STATUS_LABELS[s.status]}: ${pluralize(s.count, "order")} (${Math.round((s.count / Math.max(totalCount, 1)) * 100)}%)`}
              className={cn("h-full min-w-[4px]", STATUS_STYLES[s.status].dot)}
              style={{ flexGrow: s.count, flexBasis: 0 }}
            />
          ))}
        </div>
      </div>
      {statuses.map((s) => (
        <ListRow
          key={s.status}
          href={ordersHref({ status: [s.status] })}
          inset="2.375rem"
          leading={<StatusDot status={s.status} className="h-2.5 w-2.5" />}
          title={PO_STATUS_LABELS[s.status]}
          value={
            <span className={cn(s.count === 0 && "text-muted-foreground/60")}>
              {s.count.toLocaleString("en-US")}
              {s.count > 0 && (
                <>
                  <span className="px-1 text-muted-foreground/50" aria-hidden>
                    ·
                  </span>
                  <span className="sr-only">, </span>
                  {formatMoneyCompact(s.value)}
                </>
              )}
            </span>
          }
        />
      ))}
    </ListSection>
  );
}
