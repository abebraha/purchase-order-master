import { useEffect, useRef, type ReactNode } from "react";
import { CircleAlert, Clock, SlidersHorizontal, X } from "lucide-react";
import { PO_STATUSES, PO_STATUS_LABELS, type POStatus } from "@shared/po";
import { StatusDot } from "@/components/StatusBadge";
import type { DueFilter, OrderFilters } from "@/lib/filters";
import { cn } from "@/lib/utils";
import { dateRangeLabel, sheetFilterCount } from "./utils";

// ---------------------------------------------------------------------------
// Chip — capsule toggle with a 44px touch target on phones
// ---------------------------------------------------------------------------

export function Chip({
  selected = false,
  onClick,
  children,
  count,
  muted,
  className,
  "aria-label": ariaLabel,
  "aria-haspopup": hasPopup,
}: {
  selected?: boolean;
  onClick: () => void;
  children: ReactNode;
  count?: number;
  /** Dim an unselected chip (e.g. a status with no matching orders). */
  muted?: boolean;
  className?: string;
  "aria-label"?: string;
  /** Opens a sheet instead of toggling (no pressed state). */
  "aria-haspopup"?: "dialog";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-haspopup={hasPopup}
      aria-pressed={hasPopup ? undefined : selected}
      className={cn("group flex h-11 shrink-0 items-center outline-none md:h-9", className)}
    >
      <span
        className={cn(
          "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[15px] font-medium leading-none",
          "transition-[background-color,color,transform] duration-150 group-active:scale-[0.96]",
          "group-focus-visible:ring-4 group-focus-visible:ring-ring/30 md:h-8 md:px-3 md:text-[13px]",
          "[&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0 md:[&_svg]:h-3.5 md:[&_svg]:w-3.5",
          selected
            ? "bg-primary text-primary-foreground"
            : cn("bg-card text-foreground group-hover:bg-card/60", muted && "text-muted-foreground"),
        )}
      >
        {children}
        {count !== undefined && (
          <span
            className={cn(
              "tabular-nums",
              selected ? "text-primary-foreground/75" : "text-muted-foreground",
            )}
          >
            {count.toLocaleString("en-US")}
          </span>
        )}
      </span>
    </button>
  );
}

function Divider() {
  return <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 self-center bg-border" />;
}

// ---------------------------------------------------------------------------
// FilterChips — the horizontally scrolling filter row under the search field
// ---------------------------------------------------------------------------

export function FilterChips({
  filters,
  onChange,
  onOpenFilters,
  statusCounts,
  dueCounts,
}: {
  filters: OrderFilters;
  onChange: (patch: Partial<OrderFilters>) => void;
  onOpenFilters: () => void;
  /** Orders per status given the other filters (omit while loading). */
  statusCounts?: Record<POStatus, number>;
  dueCounts?: Record<DueFilter, number>;
}) {
  const sheetCount = sheetFilterCount(filters);
  const toggleStatus = (s: POStatus) =>
    onChange({
      status: filters.status.includes(s) ? filters.status.filter((x) => x !== s) : [...filters.status, s],
    });
  const toggleDue = (d: DueFilter) => onChange({ due: filters.due === d ? "" : d });
  const dateActive = Boolean(filters.from || filters.to);

  // Arriving from a link (e.g. the dashboard's "Open" or "Overdue"), make sure the selected chip
  // is visible on a phone instead of hidden off the right edge. Re-run once counts widen chips.
  const rowRef = useRef<HTMLDivElement>(null);
  const loaded = Boolean(statusCounts);
  useEffect(() => {
    let cancelled = false;
    const reveal = () => {
      const row = rowRef.current;
      if (!row || cancelled) return;
      const hidden = Array.from(row.querySelectorAll<HTMLElement>('[aria-pressed="true"]')).find(
        (chip) => chip.offsetLeft + chip.offsetWidth > row.scrollLeft + row.clientWidth,
      );
      if (hidden) row.scrollLeft = hidden.offsetLeft - 48;
    };
    reveal();
    // Chip widths change if a web font swaps in after the first paint.
    document.fonts?.ready.then(reveal).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [loaded]);

  return (
    <div
      ref={rowRef}
      role="toolbar"
      aria-label="Filters"
      className="relative -mx-4 flex items-center gap-2 overflow-x-auto px-4 scrollbar-none md:-mx-6 md:px-6 lg:-mx-8 lg:px-8"
    >
      <Chip onClick={onOpenFilters} aria-haspopup="dialog" aria-label={sheetCount ? `Filters, ${sheetCount} applied` : "Filters"}>
        <SlidersHorizontal strokeWidth={2.25} />
        Filters
        {sheetCount > 0 && (
          <span className="-mr-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold tabular-nums text-primary-foreground">
            {sheetCount}
          </span>
        )}
      </Chip>

      {filters.type && (
        <Chip selected onClick={() => onChange({ type: "" })} aria-label={`Remove filter: ${filters.type}`}>
          {filters.type}
          <X strokeWidth={2.5} className="-mr-0.5 opacity-80" />
        </Chip>
      )}
      {dateActive && (
        <Chip
          selected
          onClick={() => onChange({ from: "", to: "" })}
          aria-label={`Remove filter: ordered ${dateRangeLabel(filters.from, filters.to)}`}
        >
          {dateRangeLabel(filters.from, filters.to)}
          <X strokeWidth={2.5} className="-mr-0.5 opacity-80" />
        </Chip>
      )}

      <Divider />

      {filters.view === "active" && (
        <>
          <Chip selected={filters.due === "soon"} onClick={() => toggleDue("soon")} count={dueCounts?.soon}>
            <Clock
              strokeWidth={2.25}
              className={filters.due === "soon" ? undefined : "text-[hsl(28_100%_45%)] dark:text-ios-orange"}
            />
            Cancel Soon
          </Chip>
          <Chip selected={filters.due === "overdue"} onClick={() => toggleDue("overdue")} count={dueCounts?.overdue}>
            <CircleAlert strokeWidth={2.25} className={filters.due === "overdue" ? undefined : "text-destructive"} />
            Overdue
          </Chip>
          <Divider />
        </>
      )}

      {PO_STATUSES.map((s) => {
        const selected = filters.status.includes(s);
        const count = statusCounts?.[s];
        return (
          <Chip key={s} selected={selected} onClick={() => toggleStatus(s)} count={count} muted={count === 0}>
            <StatusDot status={s} className={cn("h-2 w-2", selected && "bg-primary-foreground")} />
            {PO_STATUS_LABELS[s]}
          </Chip>
        );
      })}
    </div>
  );
}
