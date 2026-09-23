import { Tags } from "lucide-react";
import { ListRow, ListSection } from "@/components/kit";
import { formatMoney, formatNumber, pluralize } from "@/lib/format";
import { ordersHref } from "@/lib/filters";
import { TOP_STYLES_DAYS, type TopStyle } from "./metrics";
import { QuietCard } from "./QuietCard";

/**
 * Top styles by units, in the style of Screen Time's "Most Used": each row carries a thin
 * bar scaled to the leader. Phones stack name / numbers / bar; wider screens lay the row
 * out as one line so the bars read as a horizontal bar chart.
 */
export function TopStyles({ styles }: { styles: TopStyle[] }) {
  if (styles.length === 0) {
    return (
      <QuietCard
        icon={Tags}
        color="purple"
        title="No styles ordered lately"
        description={`Styles from orders placed in the last ${TOP_STYLES_DAYS} days will show up here.`}
      />
    );
  }
  const max = Math.max(...styles.map((s) => s.units), 1);

  return (
    <ListSection
      footer={`Units ordered in the last ${TOP_STYLES_DAYS} days, not counting cancelled orders. Tap a style to see its orders.`}
    >
      {styles.map((s, i) => {
        const pct = Math.max((s.units / max) * 100, 2);
        const bar = (
          <div className="h-1.5 w-full" aria-hidden>
            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
        );
        const description = s.description || "No description";
        return (
          <ListRow
            key={s.styleNumber}
            href={ordersHref({ q: s.styleNumber })}
            inset="1rem"
          >
            {/* Phone: three lines */}
            <div className="md:hidden">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-[17px] font-semibold leading-[22px]">{s.styleNumber}</span>
                <span className="shrink-0 text-[15px] tabular-nums">{formatNumber(s.units)} units</span>
              </div>
              <div className="mt-0.5 flex items-baseline justify-between gap-3 text-[13px] leading-[18px] text-muted-foreground">
                <span className="truncate">{description}</span>
                <span className="shrink-0 tabular-nums">{formatMoney(s.value)}</span>
              </div>
              <div className="mt-2 pb-0.5">{bar}</div>
            </div>

            {/* Tablet & desktop: one line */}
            <div className="hidden items-center gap-4 md:flex">
              <span className="w-5 shrink-0 text-right text-[13px] text-muted-foreground tabular-nums">{i + 1}</span>
              <div className="w-48 min-w-0 shrink-0 lg:w-56">
                <div className="truncate text-[15px] font-semibold leading-5">{s.styleNumber}</div>
                <div className="truncate text-xs leading-4 text-muted-foreground">
                  {description} · {pluralize(s.orders, "order")}
                </div>
              </div>
              <div className="min-w-0 flex-1">{bar}</div>
              <span className="w-28 shrink-0 text-right text-sm tabular-nums">{formatNumber(s.units)} units</span>
              <span className="w-24 shrink-0 text-right text-sm text-muted-foreground tabular-nums">
                {formatMoney(s.value)}
              </span>
            </div>
          </ListRow>
        );
      })}
    </ListSection>
  );
}
