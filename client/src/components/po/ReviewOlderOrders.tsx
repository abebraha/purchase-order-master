import { useState } from "react";
import { Link } from "wouter";
import { History } from "lucide-react";
import type { PurchaseOrder } from "@shared/po";
import { ConfirmDialog } from "@/components/common";
import { IconTile } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useReviewPurchaseOrders } from "@/lib/api";
import { ordersHref } from "@/lib/filters";
import { pluralize } from "@/lib/format";

/**
 * Friendly one-time prompt for purchase orders created before status tracking existed.
 * They all start as "Open" with unreliable ship dates, so instead of flagging them as overdue
 * we offer to mark them received in one step (recorded in each PO's history) or review them.
 */
export function ReviewOlderOrders({
  orders,
  showReviewLink = true,
}: {
  /** The POs that still need review (po.needsReview). Renders nothing when empty. */
  orders: PurchaseOrder[];
  showReviewLink?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const review = useReviewPurchaseOrders();
  const { toast } = useToast();
  const count = orders.length;
  if (count === 0) return null;

  const markAll = () =>
    review.mutate(
      { ids: orders.map((po) => po.id), status: "received" },
      {
        onSuccess: ({ updated }) => {
          setConfirming(false);
          toast({
            title: `${pluralize(updated, "order")} marked Received`,
            description: "You can change any of them later from the order's page.",
          });
        },
        onError: (error) =>
          toast({ title: "Couldn't update those orders", description: error.message, variant: "destructive" }),
      },
    );

  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-card p-4 md:flex-row md:items-center md:p-5">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <IconTile icon={History} color="indigo" size="md" />
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold leading-snug md:text-[15px]">
            {pluralize(count, "older order")} {count === 1 ? "needs" : "need"} a status
          </h2>
          <p className="mt-0.5 text-[15px] leading-snug text-muted-foreground md:text-[13px]">
            {count === 1 ? "It was" : "These were"} created before status tracking, so {count === 1 ? "it's" : "they're"} marked
            Open. If {count === 1 ? "it's" : "they're"} complete, mark {count === 1 ? "it" : "them"} as received — or review
            one by one.
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2 md:flex-nowrap md:justify-end">
        {showReviewLink && (
          <Button asChild variant="secondary" className="flex-1 md:flex-none">
            <Link href={ordersHref({ review: true })}>Review</Link>
          </Button>
        )}
        <Button variant="tinted" className="flex-1 md:flex-none" onClick={() => setConfirming(true)}>
          Mark All as Received
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Mark ${pluralize(count, "order")} as Received?`}
        description="Each order's history records the change, so you can set a different status on any of them later."
        confirmLabel="Mark as Received"
        pending={review.isPending}
        onConfirm={markAll}
      />
    </div>
  );
}
