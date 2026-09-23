import { Link } from "wouter";
import { Check } from "lucide-react";
import type { PurchaseOrder } from "@shared/po";
import { ListSection } from "@/components/kit";
import { PORow } from "@/components/po/PORow";
import { DUE_SOON_DAYS, ordersHref } from "@/lib/filters";
import { pluralize } from "@/lib/format";
import { QuietCard } from "./QuietCard";

/** Active orders past (or close to) their cancel date, soonest first. */
export function NeedsAttention({
  orders,
  total,
  overdueCount,
  dueSoonCount,
}: {
  orders: PurchaseOrder[];
  total: number;
  overdueCount: number;
  dueSoonCount: number;
}) {
  if (orders.length === 0) {
    return (
      <QuietCard
        icon={Check}
        color="green"
        title="You're all caught up"
        description={`No open orders are past or within ${DUE_SOON_DAYS} days of their cancel date.`}
      />
    );
  }

  const footer =
    overdueCount > 0 && dueSoonCount > 0 ? (
      <>
        <Link href={ordersHref({ due: "overdue" })} className="text-primary hover:opacity-70">
          {overdueCount.toLocaleString("en-US")} past their cancel date
        </Link>
        <span aria-hidden> · </span>
        <Link href={ordersHref({ due: "soon" })} className="text-primary hover:opacity-70">
          {pluralize(dueSoonCount, "order")} cancelling within {DUE_SOON_DAYS} days
        </Link>
      </>
    ) : total > orders.length ? (
      `Showing ${orders.length} of ${total}.`
    ) : undefined;

  return (
    <ListSection footer={footer}>
      {orders.map((po) => (
        <PORow key={po.id} po={po} />
      ))}
    </ListSection>
  );
}

/** Where "See All" goes: overdue orders first, since they're the most urgent. */
export function attentionHref(overdueCount: number) {
  return ordersHref({ due: overdueCount > 0 ? "overdue" : "soon" });
}
