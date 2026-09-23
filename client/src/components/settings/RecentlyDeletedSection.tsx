import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { differenceInCalendarDays, differenceInMinutes, formatDistanceToNowStrict } from "date-fns";
import { FileText, Loader2 } from "lucide-react";
import { computeTotals, type AppSettings, type DeletedPurchaseOrder, type PurchaseOrder } from "@shared/po";
import { IconTile, ListRow, ListSection } from "@/components/kit";
import { ResponsiveDialog } from "@/components/common";
import PODocument from "@/components/po/PODocument";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { useDeletedPurchaseOrders, useRecoverDeletedPurchaseOrder } from "@/lib/api";
import { documentFromPurchaseOrder, type PODocumentData } from "@/lib/document";
import { formatDate, formatDateTime, formatMoney, parseDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const VISIBLE = 5;

/** "just now", "12 minutes ago", "3 hours ago", "yesterday", "4 days ago", "on Sep 3" */
function deletedAgo(iso: string): string {
  const d = parseDate(iso);
  if (!d) return "";
  const now = new Date();
  if (differenceInMinutes(now, d) < 1) return "just now";
  const days = differenceInCalendarDays(now, d);
  if (days === 0) return formatDistanceToNowStrict(d, { addSuffix: true });
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return `on ${formatDate(d, d.getFullYear() === now.getFullYear() ? "MMM d" : "MMM d, yyyy")}`;
}

/** Older snapshots may miss derived fields — fill them in so the document always renders. */
function snapshotTotal(s: PurchaseOrder | undefined): number {
  if (!s) return 0;
  return typeof s.totalAmount === "number" ? s.totalAmount : computeTotals(s.items ?? []).totalAmount;
}

function documentFromSnapshot(s: PurchaseOrder): PODocumentData {
  const items = Array.isArray(s?.items) ? s.items : [];
  const totals = computeTotals(items);
  return documentFromPurchaseOrder({
    ...s,
    poNumber: s?.poNumber ?? "",
    poType: s?.poType ?? "",
    terms: s?.terms ?? "",
    shipTo: s?.shipTo ?? "",
    billTo: s?.billTo ?? "",
    specialInstructions: s?.specialInstructions ?? "",
    items,
    totalQuantity: typeof s?.totalQuantity === "number" ? s.totalQuantity : totals.totalQuantity,
    totalAmount: typeof s?.totalAmount === "number" ? s.totalAmount : totals.totalAmount,
  });
}

function DeletedRow({
  item,
  pending,
  disabled,
  onOpen,
  onRecover,
}: {
  item: DeletedPurchaseOrder;
  pending: boolean;
  disabled: boolean;
  onOpen: () => void;
  onRecover: () => void;
}) {
  const number = item.poNumber || item.snapshot?.poNumber || "—";
  return (
    <div
      style={{ ["--row-inset" as string]: "3.5625rem" }}
      className={cn(
        "relative flex min-h-11 items-center gap-2 pr-4 transition-colors duration-100",
        "after:absolute after:bottom-0 after:left-[var(--row-inset)] after:right-0 after:h-px after:bg-border/80 last:after:hidden",
        "hover:bg-accent/60 has-[.row-main:active]:bg-accent",
      )}
      data-testid="deleted-row"
    >
      <button
        type="button"
        onClick={onOpen}
        className="row-main flex min-w-0 flex-1 items-center gap-3 self-stretch pl-4 text-left outline-none focus-visible:bg-accent"
        aria-label={`Preview PO #${number}`}
      >
        <IconTile icon={FileText} color="gray" variant="tinted" />
        <span className="min-w-0 flex-1 py-[11px]">
          <span className="block truncate text-[17px] leading-[22px] md:text-[15px] md:leading-5">PO #{number}</span>
          <span className="mt-0.5 block truncate text-[13px] leading-[18px] text-muted-foreground md:text-xs md:leading-4">
            Deleted {deletedAgo(item.deletedAt)} · <span className="tabular-nums">{formatMoney(snapshotTotal(item.snapshot))}</span>
          </span>
        </span>
      </button>
      <Button
        type="button"
        variant="tinted"
        size="sm"
        onClick={onRecover}
        disabled={disabled}
        aria-label={`Recover PO #${number}`}
        className="relative shrink-0 after:absolute after:-inset-1 md:after:hidden"
      >
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        Recover
      </Button>
    </div>
  );
}

export function RecentlyDeletedSection({
  settings,
  onOpenLink,
}: {
  settings: AppSettings;
  /** Navigates to an in-app page (Settings passes one that asks first when there are unsaved edits). */
  onOpenLink?: (href: string) => void;
}) {
  const { data, isLoading, error, refetch, isRefetching } = useDeletedPurchaseOrders();
  const recover = useRecoverDeletedPurchaseOrder();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [showAll, setShowAll] = useState(false);
  // The sheet keeps showing its order while it animates closed, so track "open" separately.
  const [preview, setPreview] = useState<DeletedPurchaseOrder | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const items = useMemo(
    () => [...(data ?? [])].sort((a, b) => (b.deletedAt ?? "").localeCompare(a.deletedAt ?? "")),
    [data],
  );
  const visible = showAll ? items : items.slice(0, VISIBLE);

  const openPreview = (item: DeletedPurchaseOrder) => {
    setPreview(item);
    setPreviewOpen(true);
  };

  const doRecover = (item: DeletedPurchaseOrder) => {
    const number = item.poNumber || item.snapshot?.poNumber;
    recover.mutate(item.revisionId, {
      onSuccess: (po) => {
        setPreviewOpen(false);
        toast({
          title: "Purchase order recovered",
          description: `PO #${po.poNumber} is back in your orders.`,
          action: (
            <ToastAction
              altText={`Open PO #${po.poNumber}`}
              onClick={() => (onOpenLink ?? navigate)(`/purchase-orders/${po.id}`)}
              className="h-8 rounded-full border-0 bg-primary/10 px-3.5 font-semibold text-primary hover:bg-primary/15 dark:bg-primary/20"
            >
              Open
            </ToastAction>
          ),
        });
      },
      onError: (e) => {
        toast({
          variant: "destructive",
          title: number ? `Couldn't recover PO #${number}` : "Couldn't recover this order",
          description: e.message,
        });
      },
    });
  };

  const pendingId = recover.isPending ? recover.variables : undefined;

  return (
    <>
      <ListSection
        header="Recently Deleted"
        footer={
          items.length
            ? "Tap an order to preview it. Recovering puts it back in your purchase orders."
            : undefined
        }
      >
        {isLoading ? (
          Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex h-[62px] items-center gap-3 px-4" aria-hidden>
              <Skeleton className="h-[29px] w-[29px] rounded-[7px]" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-28 rounded-md" />
                <Skeleton className="h-3 w-40 rounded-md" />
              </div>
              <Skeleton className="h-8 w-20 rounded-full" />
            </div>
          ))
        ) : error && !data ? (
          <ListRow
            title="Couldn't load deleted orders"
            subtitle={error.message}
            value={
              <Button variant="plain" size="sm" className="-mr-2" onClick={() => refetch()} disabled={isRefetching}>
                Try Again
              </Button>
            }
          />
        ) : items.length === 0 ? (
          <ListRow>
            <span className="text-[17px] text-muted-foreground md:text-[15px]">No recently deleted purchase orders</span>
          </ListRow>
        ) : (
          <>
            {visible.map((item) => (
              <DeletedRow
                key={item.revisionId}
                item={item}
                pending={pendingId === item.revisionId}
                disabled={recover.isPending}
                onOpen={() => openPreview(item)}
                onRecover={() => doRecover(item)}
              />
            ))}
            {items.length > VISIBLE && (
              <ListRow onClick={() => setShowAll((v) => !v)}>
                <span className="text-[17px] text-primary md:text-[15px]">
                  {showAll ? "Show Less" : `Show All ${items.length}`}
                </span>
              </ListRow>
            )}
          </>
        )}
      </ListSection>

      <ResponsiveDialog
        open={previewOpen && !!preview}
        onOpenChange={setPreviewOpen}
        title={preview ? `PO #${preview.poNumber || preview.snapshot?.poNumber || "—"}` : "Deleted Order"}
        description={preview ? `Deleted ${formatDateTime(preview.deletedAt)}` : undefined}
        className="sm:max-w-3xl"
        footer={
          preview && (
            <>
              <Button type="button" variant="secondary" onClick={() => setPreviewOpen(false)} className="max-md:order-last">
                Close
              </Button>
              <Button type="button" onClick={() => doRecover(preview)} disabled={recover.isPending}>
                {recover.isPending && <Loader2 className="animate-spin" aria-hidden />}
                Recover
              </Button>
            </>
          )
        }
      >
        {preview?.snapshot && (
          <div className="rounded-[20px] bg-background p-1.5 md:p-2">
            <PODocument data={documentFromSnapshot(preview.snapshot)} settings={settings} />
          </div>
        )}
      </ResponsiveDialog>
    </>
  );
}
