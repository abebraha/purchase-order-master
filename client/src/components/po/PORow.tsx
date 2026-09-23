import type { PurchaseOrder } from "@shared/po";
import { ListRow } from "@/components/kit";
import { ArchivedBadge, StatusBadge } from "@/components/StatusBadge";
import { firstLine, formatDate, formatDateShort, formatMoney, formatNumber, formatRelativeDays } from "@/lib/format";
import { isDueSoon, isOverdue } from "@/lib/filters";

/**
 * A purchase order as a row in an inset grouped list (Apple Mail–style, three lines):
 *   PO #1001                         $8,400.00
 *   Macy's DC                     [In Production]
 *   Cancel date in 3 days  /  Ordered Sep 21 · 1,200 units
 * Use inside <ListSection> everywhere POs are listed so they look the same across screens.
 */
export function PORow({ po, href }: { po: PurchaseOrder; href?: string }) {
  const overdue = isOverdue(po);
  const dueSoon = !overdue && isDueSoon(po);
  return (
    <ListRow href={href ?? `/purchase-orders/${po.id}`} accessory="chevron">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-[17px] font-semibold leading-[22px] md:text-[15px] md:leading-5">PO #{po.poNumber}</span>
        <span className="shrink-0 text-[15px] tabular-nums text-foreground md:text-sm">{formatMoney(po.totalAmount)}</span>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-3">
        <span className="truncate text-[15px] leading-5 text-muted-foreground md:text-[13px]">
          {firstLine(po.shipTo) || "No ship-to address"}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {po.archivedAt && <ArchivedBadge />}
          <StatusBadge status={po.status} />
        </span>
      </div>
      <div className="mt-1 truncate text-[13px] leading-[18px] text-muted-foreground md:text-xs">
        {overdue ? (
          <span className="font-medium text-destructive">
            Past cancel date · {formatDate(po.cancelDate)}
          </span>
        ) : dueSoon ? (
          <span className="font-medium text-[hsl(var(--warning-text))]">
            Cancel date {formatRelativeDays(po.cancelDate)} · {formatDateShort(po.cancelDate)}
          </span>
        ) : po.needsReview ? (
          <>Ordered {formatDate(po.orderDate)} · Status not reviewed</>
        ) : (
          <>
            Ordered {formatDate(po.orderDate)} · {formatNumber(po.totalQuantity)} units
          </>
        )}
      </div>
    </ListRow>
  );
}
