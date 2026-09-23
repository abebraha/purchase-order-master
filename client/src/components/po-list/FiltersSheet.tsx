import { useEffect, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { PO_TYPES } from "@shared/po";
import { ResponsiveDialog } from "@/components/common";
import { Field, SegmentedControl } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { pluralize } from "@/lib/format";
import { DEFAULT_FILTERS, type OrderFilters } from "@/lib/filters";
import { cn } from "@/lib/utils";
import { DATE_PRESETS, SORT_CHOICES, presetFor, presetRange, sheetFilterCount, type DatePreset } from "./utils";

function Group({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-2">
      <h3 id={id} className="px-1 text-[13px] font-normal uppercase tracking-[0.02em] text-muted-foreground">
        {label}
      </h3>
      {children}
    </section>
  );
}

const TYPE_OPTIONS = [
  { value: "all", label: "All" },
  ...PO_TYPES.map((t) => ({ value: t as string, label: t })),
];

/** Filters sheet: PO type, order-date range and sort. Changes apply immediately. */
export function FiltersSheet({
  open,
  onOpenChange,
  filters,
  onChange,
  resultCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: OrderFilters;
  onChange: (patch: Partial<OrderFilters>) => void;
  /** Orders matching the current filters (for the "Show 12 Orders" button). */
  resultCount?: number;
}) {
  // "Custom" stays selected while the person picks dates, even if the range is still empty.
  const [custom, setCustom] = useState(false);
  useEffect(() => {
    if (open) setCustom(presetFor(filters.from, filters.to) === "custom");
    // Only when the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const preset: DatePreset = custom ? "custom" : presetFor(filters.from, filters.to);
  const rangeError = filters.from && filters.to && filters.from > filters.to;
  const count = sheetFilterCount(filters);

  const choosePreset = (p: DatePreset) => {
    setCustom(p === "custom");
    if (p !== "custom") onChange(presetRange(p));
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Filters"
      className="sm:max-w-md"
      footer={
        <div className="grid w-full grid-cols-[minmax(6.5rem,auto)_1fr] gap-3 md:flex md:justify-end md:gap-2">
          <Button
            variant="secondary"
            className="h-12 text-[17px] md:h-9 md:text-sm"
            disabled={count === 0}
            onClick={() => {
              setCustom(false);
              onChange({ type: DEFAULT_FILTERS.type, from: "", to: "", sort: DEFAULT_FILTERS.sort });
            }}
          >
            Reset
          </Button>
          <Button className="h-12 text-[17px] md:h-9 md:text-sm" onClick={() => onOpenChange(false)}>
            {resultCount === undefined
              ? "Done"
              : resultCount === 0
                ? "No Matching Orders"
                : `Show ${pluralize(resultCount, "Order")}`}
          </Button>
        </div>
      }
    >
      <div className="space-y-6 pb-1 pt-1">
        <Group label="PO Type" id="filters-type">
          <SegmentedControl
            aria-label="PO type"
            value={filters.type || "all"}
            onChange={(v) => onChange({ type: v === "all" ? "" : v })}
            options={TYPE_OPTIONS}
          />
        </Group>

        <Group label="Order Date" id="filters-date">
          <div role="radiogroup" aria-labelledby="filters-date" className="grid grid-cols-3 gap-2">
            {DATE_PRESETS.map((p) => {
              const active = preset === p.value;
              return (
                <button
                  key={p.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => choosePreset(p.value)}
                  className={cn(
                    "flex h-11 items-center justify-center rounded-[10px] px-2 text-[15px] outline-none transition-[background-color,color,transform] duration-150 active:scale-[0.97] focus-visible:ring-4 focus-visible:ring-ring/30 md:h-9 md:text-[13px]",
                    active
                      ? "bg-primary font-semibold text-primary-foreground"
                      : "bg-muted font-medium text-foreground hover:bg-accent",
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          {preset === "custom" && (
            <div className="grid grid-cols-2 gap-3 pt-2">
              <Field label="From" htmlFor="filters-from">
                <Input
                  id="filters-from"
                  type="date"
                  value={filters.from}
                  max={filters.to || undefined}
                  onChange={(e) => onChange({ from: e.target.value })}
                />
              </Field>
              <Field label="To" htmlFor="filters-to">
                <Input
                  id="filters-to"
                  type="date"
                  value={filters.to}
                  min={filters.from || undefined}
                  onChange={(e) => onChange({ to: e.target.value })}
                />
              </Field>
              {rangeError && (
                <p className="col-span-2 text-[13px] font-medium text-destructive">
                  The start date is after the end date.
                </p>
              )}
            </div>
          )}
        </Group>

        <Group label="Sort By" id="filters-sort">
          <div role="radiogroup" aria-labelledby="filters-sort" className="overflow-hidden rounded-xl bg-muted">
            {SORT_CHOICES.map((o) => {
              const active = filters.sort === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onChange({ sort: o.value })}
                  className="relative flex min-h-11 w-full items-center justify-between gap-3 px-4 text-left text-[17px] outline-none transition-colors hover:bg-accent focus-visible:bg-accent active:bg-accent md:min-h-10 md:text-[15px] after:absolute after:bottom-0 after:left-4 after:right-0 after:h-px after:bg-border/80 last:after:hidden"
                >
                  <span>{o.label}</span>
                  {active && <Check className="h-[18px] w-[18px] shrink-0 text-primary" strokeWidth={2.75} aria-hidden />}
                </button>
              );
            })}
          </div>
        </Group>
      </div>
    </ResponsiveDialog>
  );
}
