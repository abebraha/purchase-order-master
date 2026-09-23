import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { format } from "date-fns";
import { BarChart3 } from "lucide-react";
import { formatMoney, formatMoneyCompact, pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { formatWholeMoney, type MonthBucket } from "./metrics";

/** Round-number ticks from 0 that cover `max` (e.g. 0, 50K, 100K, 150K). */
function niceTicks(max: number, target = 4): number[] {
  if (!(max > 0)) return [0, 1];
  const rough = max / target;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * pow).find((s) => s >= rough) ?? 10 * pow;
  const ticks: number[] = [];
  for (let v = 0; v < max + step; v += step) {
    ticks.push(v);
    if (v >= max) break;
  }
  return ticks;
}

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

const PLOT_HEIGHT = "h-[168px] md:h-[208px]";
const AXIS_LANE = 44; // px reserved on the right for the value axis (Apple puts it on the right)
const CALLOUT_W = 164;

/**
 * Twelve-month column chart in the style of Apple Health: one series in systemBlue, the
 * current month emphasized, value axis on the right, hairline grid. Hover, tap/scrub or
 * arrow keys show a callout with the exact value and order count; a visually hidden
 * table carries the same numbers for assistive tech.
 */
export function MonthlyChart({ data }: { data: MonthBucket[] }) {
  const [active, setActive] = useState<number | null>(null);
  const [barsRef, barsWidth] = useElementWidth<HTMLDivElement>();
  const rootRef = useRef<HTMLDivElement>(null);
  const pressing = useRef(false);

  const total = data.reduce((s, d) => s + d.value, 0);
  const totalCount = data.reduce((s, d) => s + d.count, 0);
  const max = Math.max(0, ...data.map((d) => d.value));
  const ticks = useMemo(() => niceTicks(max), [max]);
  const top = ticks[ticks.length - 1] || 1;
  const n = data.length;
  const currentIndex = data.findIndex((d) => d.current);
  const letters = barsWidth > 0 && barsWidth / n < 30;
  const range =
    n > 0 ? `${format(data[0].start, "MMM yyyy")} – ${format(data[n - 1].start, "MMM yyyy")}` : "";

  // Tap outside clears a touch selection.
  useEffect(() => {
    if (active === null) return;
    const onDown = (e: globalThis.PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setActive(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [active]);

  const indexAt = (clientX: number) => {
    const el = barsRef.current;
    if (!el || n === 0) return null;
    const r = el.getBoundingClientRect();
    const i = Math.floor(((clientX - r.left) / r.width) * n);
    return Math.min(n - 1, Math.max(0, i));
  };

  const onPointerDown = (e: PointerEvent) => {
    pressing.current = true;
    setActive(indexAt(e.clientX));
  };
  const onPointerMove = (e: PointerEvent) => {
    if (e.pointerType === "mouse" || pressing.current) setActive(indexAt(e.clientX));
  };
  const onPointerUp = () => {
    pressing.current = false;
  };
  const onPointerLeave = (e: PointerEvent) => {
    pressing.current = false;
    if (e.pointerType === "mouse") setActive(null);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const from = active ?? currentIndex;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      setActive(Math.min(n - 1, Math.max(0, from + (e.key === "ArrowRight" ? 1 : -1))));
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setActive(e.key === "Home" ? 0 : n - 1);
    } else if (e.key === "Escape") {
      setActive(null);
    }
  };

  const selected = active !== null ? data[active] : null;
  const center = (i: number) => (i + 0.5) / n;

  return (
    <div ref={rootRef} className="rounded-2xl bg-card p-4 md:p-5">
      {/* Header: total for the period (hidden behind the callout while scrubbing, like Health) */}
      <div className={cn("transition-opacity duration-150", selected ? "opacity-0" : "opacity-100")} aria-hidden={!!selected}>
        <div className="text-[13px] font-medium uppercase tracking-[0.02em] text-muted-foreground">Total</div>
        <div className="mt-0.5 text-[28px] font-semibold leading-8 tracking-[-0.02em]">{formatWholeMoney(total)}</div>
        <div className="mt-0.5 text-[13px] text-muted-foreground">
          {range} · {pluralize(totalCount, "order")}
        </div>
      </div>

      {total <= 0 ? (
        <div className="mt-4 flex h-[168px] flex-col items-center justify-center gap-2 rounded-xl bg-secondary/50 text-center md:h-[208px]">
          <BarChart3 className="h-7 w-7 text-muted-foreground/60" aria-hidden />
          <p className="max-w-[16rem] text-[15px] text-muted-foreground">No orders placed in the last 12 months.</p>
        </div>
      ) : (
        <div
          role="group"
          tabIndex={0}
          aria-label="Order value by month for the last 12 months. Use the left and right arrow keys to read each month."
          onKeyDown={onKeyDown}
          onFocus={() => setActive((a) => a ?? currentIndex)}
          onBlur={() => setActive(null)}
          className="relative mt-5 select-none rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ paddingRight: AXIS_LANE }}
        >
          {/* Plot */}
          <div className={cn("relative", PLOT_HEIGHT)}>
            {/* Grid + value axis */}
            {ticks.map((t) => (
              <div
                key={t}
                aria-hidden
                className="absolute inset-x-0 h-px bg-border"
                style={{ bottom: `${(t / top) * 100}%` }}
              >
                <span className="absolute left-[calc(100%+6px)] top-0 -translate-y-1/2 whitespace-nowrap text-[11px] leading-none text-muted-foreground tabular-nums">
                  {formatMoneyCompact(t)}
                </span>
              </div>
            ))}

            {/* Bars */}
            <div ref={barsRef} aria-hidden className="absolute inset-0 flex items-end">
              {data.map((d, i) => {
                const strong = active === null ? d.current : active === i;
                const pct = d.value > 0 ? Math.max((d.value / top) * 100, 1.5) : 0;
                return (
                  <div key={d.key} className="relative flex h-full flex-1 items-end justify-center">
                    {/* Crosshair from the top of the plot to the selected bar */}
                    {active === i && (
                      <div
                        className="absolute left-1/2 top-0 w-px -translate-x-1/2 bg-muted-foreground/35"
                        style={{ bottom: `${pct}%` }}
                      />
                    )}
                    {pct > 0 && (
                      <div
                        className={cn(
                          "w-[58%] max-w-6 rounded-t-[4px] transition-colors duration-150",
                          strong ? "bg-primary" : "bg-primary/30 dark:bg-primary/40",
                        )}
                        style={{ height: `${pct}%` }}
                      />
                    )}
                    {/* Direct label on the current month only */}
                    {d.current && active === null && d.value > 0 && (
                      <span
                        className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold leading-none text-foreground tabular-nums"
                        style={{ bottom: `calc(${pct}% + 5px)` }}
                      >
                        {formatMoneyCompact(d.value)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Hit layer: the whole column is the target, not just the painted bar */}
            <div
              aria-hidden
              className="absolute inset-0 cursor-default touch-pan-y"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onPointerLeave={onPointerLeave}
            />

            {/* Callout */}
            {selected && active !== null && (
              <div
                data-chart-callout
                className="pointer-events-none absolute bottom-[calc(100%+6px)] z-10 rounded-xl bg-secondary px-3 py-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:bg-accent"
                style={{
                  width: CALLOUT_W,
                  left: `clamp(0px, calc(${center(active) * 100}% - ${CALLOUT_W / 2}px), calc(100% + ${AXIS_LANE}px - ${CALLOUT_W}px))`,
                }}
              >
                <div className="text-[12px] font-medium text-muted-foreground">
                  {format(selected.start, "MMMM yyyy")}
                  {selected.current && " (so far)"}
                </div>
                <div className="text-[17px] font-semibold leading-6 tabular-nums">{formatMoney(selected.value)}</div>
                <div className="text-[12px] text-muted-foreground">{pluralize(selected.count, "order")}</div>
              </div>
            )}
          </div>

          {/* Month labels */}
          <div aria-hidden className="mt-1.5 flex">
            {data.map((d, i) => (
              <div
                key={d.key}
                className={cn(
                  "flex-1 text-center text-[11px] leading-4",
                  (active === null ? d.current : active === i) ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                {letters ? format(d.start, "MMMMM") : format(d.start, "MMM")}
              </div>
            ))}
          </div>

          <div className="sr-only" aria-live="polite">
            {selected ? `${format(selected.start, "MMMM yyyy")}: ${formatMoney(selected.value)}, ${pluralize(selected.count, "order")}` : ""}
          </div>
        </div>
      )}

      {/* Table view of the same numbers (wrapped: tables ignore sr-only's 1px width) */}
      <div className="sr-only">
      <table>
        <caption>Order value by month, last 12 months (cancelled orders excluded)</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Value</th>
            <th scope="col">Orders</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.key}>
              <th scope="row">{format(d.start, "MMMM yyyy")}</th>
              <td>{formatMoney(d.value)}</td>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
