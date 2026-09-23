import { useState } from "react";
import { History } from "lucide-react";
import type { PurchaseOrder } from "@shared/po";
import { ConfirmDialog } from "@/components/common";
import { IconTile } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useReviewPurchaseOrders } from "@/lib/api";
import { pluralize } from "@/lib/format";

/**
 * Bulk "Mark as Received" for the Needs Review list on the Orders screen. It acts on exactly the
 * older orders listed (after search and filters), never on ones the search hides, and says so
 * when some are hidden. The Home screen keeps its own "all older orders" card.
 */
export function ReviewShownOrders({
  orders,
  scoped,
}: {
  /** The listed POs that still need review. Renders nothing when empty. */
  orders: PurchaseOrder[];
  /** True when the search or filters hide some older orders, so "all" would be misleading. */
  scoped: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const review = useReviewPurchaseOrders();
  const { toast } = useToast();
  const count = orders.length;
  if (count === 0) return null;

  const one = count === 1;
  const title = scoped
    ? `${pluralize(count, "matching older order")} ${one ? "needs" : "need"} a status`
    : `${pluralize(count, "older order")} ${one ? "needs" : "need"} a status`;
  const buttonLabel = one ? "Mark as Received" : scoped ? `Mark These ${count} as Received` : "Mark All as Received";
  const dialogTitle = scoped
    ? one
      ? "Mark this order as Received?"
      : `Mark these ${count} orders as Received?`
    : `Mark ${pluralize(count, "order")} as Received?`;

  const markShown = () =>
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
          <h2 className="text-[17px] font-semibold leading-snug md:text-[15px]">{title}</h2>
          <p className="mt-0.5 text-[15px] leading-snug text-muted-foreground md:text-[13px]">
            {one
              ? "It was created before status tracking, so it's marked Open. If it's complete, mark it as received."
              : "These were created before status tracking, so they're marked Open. If they're complete, mark them as received, or open one to set its status."}
            {scoped && " Other older orders won't change."}
          </p>
        </div>
      </div>
      <Button variant="tinted" className="w-full min-w-0 shrink-0 md:w-auto" onClick={() => setConfirming(true)}>
        {buttonLabel}
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={dialogTitle}
        description={
          scoped
            ? `Only the ${one ? "order" : `${count} orders`} shown will change. Each order's history records it, so you can set a different status later.`
            : "Each order's history records the change, so you can set a different status on any of them later."
        }
        confirmLabel="Mark as Received"
        pending={review.isPending}
        onConfirm={markShown}
      />
    </div>
  );
}
