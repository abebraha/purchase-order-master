import type { PurchaseOrder } from "@shared/po";
import { ListRow, ListSection } from "@/components/kit";
import { PORow } from "@/components/po/PORow";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/format";
import type { OrderFilters } from "@/lib/filters";
import { groupByOrderMonth, isDateSort } from "./utils";

interface Section {
  key: string;
  header?: string;
  total?: number;
  orders: PurchaseOrder[];
}

/** Splits the (already ordered) list into sections and keeps only the first `limit` rows. */
function buildSections(orders: PurchaseOrder[], filters: OrderFilters, limit: number): Section[] {
  const all: Section[] = isDateSort(filters)
    ? groupByOrderMonth(orders, filters.sort === "oldest").map((g) => ({
        key: g.key,
        header: g.label,
        total: g.totalAmount,
        orders: g.orders,
      }))
    : [{ key: "all", orders }];

  const out: Section[] = [];
  let left = limit;
  for (const s of all) {
    if (left <= 0) break;
    out.push({ ...s, orders: s.orders.slice(0, left) });
    left -= s.orders.length;
  }
  return out;
}

/**
 * Phone layout: inset grouped sections of PORow, grouped by order month when sorted by date
 * (like Mail / Photos), otherwise one flat section.
 */
export function OrdersList({
  orders,
  filters,
  limit,
  onShowMore,
}: {
  orders: PurchaseOrder[];
  filters: OrderFilters;
  limit: number;
  onShowMore: () => void;
}) {
  const sections = buildSections(orders, filters, limit);
  const remaining = orders.length - Math.min(limit, orders.length);

  return (
    <div className="space-y-6">
      {sections.map((s) => (
        <ListSection
          key={s.key}
          header={s.header}
          headerAction={
            s.total !== undefined ? (
              <span className="text-[13px] tabular-nums text-muted-foreground">{formatMoney(s.total)}</span>
            ) : undefined
          }
        >
          {s.orders.map((po) => (
            <PORow key={po.id} po={po} />
          ))}
        </ListSection>
      ))}
      {remaining > 0 && (
        <ListSection footer={`Showing ${limit.toLocaleString("en-US")} of ${orders.length.toLocaleString("en-US")} orders`}>
          <ListRow onClick={onShowMore} accessory="none">
            <span className="block text-center text-[17px] text-primary md:text-[15px]">Show More</span>
          </ListRow>
        </ListSection>
      )}
    </div>
  );
}

export function OrdersListSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading purchase orders">
      {[4, 3].map((rows, g) => (
        <section key={g} className="space-y-1.5">
          <div className="flex justify-between px-4">
            <Skeleton className="h-3.5 w-28 rounded-md" />
            <Skeleton className="h-3.5 w-16 rounded-md" />
          </div>
          <div className="overflow-hidden rounded-xl bg-card">
            {Array.from({ length: rows }).map((_, i) => (
              <div key={i} className="relative space-y-2 px-4 py-[13px] after:absolute after:bottom-0 after:left-4 after:right-0 after:h-px after:bg-border/80 last:after:hidden">
                <div className="flex justify-between gap-6">
                  <Skeleton className="h-[18px] w-24 rounded-md" />
                  <Skeleton className="h-[18px] w-20 rounded-md" />
                </div>
                <div className="flex justify-between gap-6">
                  <Skeleton className="h-4 w-36 rounded-md" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
                <Skeleton className="h-3.5 w-48 rounded-md" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
