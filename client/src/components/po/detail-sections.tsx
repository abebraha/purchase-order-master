/**
 * Building blocks of the purchase-order detail screen (/purchase-orders/:id):
 * status picker, summary, internal notes, the archived banner and the loading skeleton.
 */
import { useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { Archive, ArchiveRestore, Check, ChevronsUpDown, Clock, Loader2, Trash2, TriangleAlert } from "lucide-react";
import { PO_STATUSES, PO_STATUS_LABELS, type POStatus, type PurchaseOrder } from "@shared/po";
import { IconTile, ListRow, ListSection } from "@/components/kit";
import { ConfirmDialog } from "@/components/common";
import { StatusBadge, StatusDot } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { useReviewPurchaseOrders, useSetPurchaseOrderStatus } from "@/lib/api";
import { isActivePO, isDueSoon, isOverdue } from "@/lib/filters";
import { daysFromToday, formatDate, formatMoney, formatNumber, parseDate, pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/** The usual next step for an order, offered as a one-tap row. */
const NEXT_STATUS: Partial<Record<POStatus, POStatus>> = {
  draft: "open",
  open: "in_production",
  in_production: "shipped",
  shipped: "received",
};

export function StatusSection({ po }: { po: PurchaseOrder }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const setStatus = useSetPurchaseOrderStatus();
  const review = useReviewPurchaseOrders();
  // Older POs (created before status tracking) go through "review", which records a history
  // entry even when the status stays the same — confirming "Open" counts as reviewed.
  const mutation = po.needsReview ? review : setStatus;
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<POStatus | null>(null);
  const label = `PO #${po.poNumber}`;
  const next = po.needsReview ? "received" : NEXT_STATUS[po.status];

  const apply = (status: POStatus) => {
    setPendingStatus(status);
    const run = po.needsReview
      ? (opts: Parameters<typeof review.mutate>[1]) => review.mutate({ ids: [po.id], status }, opts)
      : (opts: Parameters<typeof setStatus.mutate>[1]) => setStatus.mutate({ id: po.id, status }, opts);
    run(
      {
        onSuccess: () => {
          setConfirmCancel(false);
          toast({ title: "Status updated", description: `${label} is now ${PO_STATUS_LABELS[status]}.` });
        },
        onError: (error) => {
          // An unfinished draft can't leave "Draft" yet — offer the editor right from the toast.
          const missing = po.status === "draft" ? /^Finish this order first:\s*(.+)$/i.exec(error.message)?.[1] : undefined;
          toast({
            variant: missing ? "default" : "destructive",
            title: missing ? "Finish this draft first" : "Couldn't change the status",
            description: missing ? missing.charAt(0).toUpperCase() + missing.slice(1) : error.message,
            action: missing ? (
              <ToastAction
                altText={`Edit ${label}`}
                onClick={() => navigate(`/purchase-orders/${po.id}/edit`)}
                className="h-8 rounded-full border-0 bg-primary/10 px-3.5 font-semibold text-primary hover:bg-primary/15 dark:bg-primary/20"
              >
                Edit
              </ToastAction>
            ) : undefined,
          });
        },
        onSettled: () => setPendingStatus(null),
      },
    );
  };

  const choose = (status: POStatus) => {
    if ((status === po.status && !po.needsReview) || mutation.isPending) return;
    if (status === "cancelled") setConfirmCancel(true);
    else apply(status);
  };

  return (
    <>
      <ListSection
        footer={
          po.needsReview
            ? "This order was created before status tracking, so it's marked Open. Choose its current status — pick Open to keep it."
            : undefined
        }
      >
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={mutation.isPending}
              aria-label={`Status: ${PO_STATUS_LABELS[po.status]}. Change status`}
              className="relative flex min-h-11 w-full items-center gap-3 px-4 text-left outline-none transition-colors duration-100 after:absolute after:bottom-0 after:left-4 after:right-0 after:h-px after:bg-border/80 last:after:hidden hover:bg-accent/60 focus-visible:bg-accent active:bg-accent data-[state=open]:bg-accent/60 md:min-h-[46px]"
            >
              <span className="flex-1 py-[11px] text-[17px] leading-[22px] md:text-[15px] md:leading-5">Status</span>
              {mutation.isPending && pendingStatus !== next && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
              )}
              <StatusBadge status={po.status} className="px-3 py-[5px] text-[13px]" />
              <ChevronsUpDown className="-mr-1 h-4 w-4 shrink-0 text-muted-foreground/70" strokeWidth={2.25} aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[13.5rem]">
            {PO_STATUSES.map((status) => {
              const current = status === po.status;
              return (
                <DropdownMenuItem
                  key={status}
                  onSelect={() => choose(status)}
                  aria-checked={current}
                  role="menuitemradio"
                  className={cn(current && "font-semibold")}
                >
                  <Check className={cn("!h-4 !w-4 text-primary", current ? "opacity-100" : "opacity-0")} strokeWidth={2.75} aria-hidden />
                  <span className="flex-1">{PO_STATUS_LABELS[status]}</span>
                  <StatusDot status={status} className="h-2.5 w-2.5" />
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
        {next && (
          <ListRow
            onClick={() => choose(next)}
            disabled={mutation.isPending}
            title={<span className="text-primary">Mark as {PO_STATUS_LABELS[next]}</span>}
            accessory={
              mutation.isPending && pendingStatus === next ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
              ) : (
                <StatusDot status={next} className="h-2.5 w-2.5" />
              )
            }
          />
        )}
      </ListSection>
      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={(open) => !open && !mutation.isPending && setConfirmCancel(false)}
        title={`Cancel ${label}?`}
        description="The order will be marked as Cancelled. Nothing is deleted — you can change the status again anytime."
        confirmLabel="Mark as Cancelled"
        cancelLabel="Keep Order"
        destructive
        pending={mutation.isPending}
        onConfirm={() => apply("cancelled")}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

/** "Sep 13 – 25", "Sep 28 – Oct 12", or with the year when it isn't this year. */
export function formatShipWindow(start: string | null | undefined, end: string | null | undefined): string {
  const a = parseDate(start);
  const b = parseDate(end);
  if (!a && !b) return "";
  if (!a || !b) return formatDate(a ?? b);
  const thisYear = new Date().getFullYear();
  const withYear = a.getFullYear() !== thisYear || b.getFullYear() !== thisYear;
  const fmt = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" as const } : {}),
  });
  if (a.toDateString() === b.toDateString()) return fmt.format(a);
  if (a > b || typeof fmt.formatRange !== "function") return `${fmt.format(a)} – ${fmt.format(b)}`;
  try {
    return fmt.formatRange(a, b);
  } catch {
    return `${fmt.format(a)} – ${fmt.format(b)}`;
  }
}

function NotSet() {
  return <span className="text-muted-foreground/70">Not set</span>;
}

/** Keeps long values from pushing the row title off-screen. */
function Value({ children }: { children: ReactNode }) {
  return <span className="block max-w-[11.5rem] truncate sm:max-w-[16rem]">{children}</span>;
}

/** "Sep 30" this year, "Mar 4, 2025" otherwise. */
function formatCancelDate(value: string | null | undefined): string {
  return formatDate(value, parseDate(value)?.getFullYear() === new Date().getFullYear() ? "MMM d" : "MMM d, yyyy");
}

/** "In 5 days", "Tomorrow", "Today", "Passed yesterday", "Passed 3 days ago" — never a negative count. */
function cancelCountdown(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days > 1) return `In ${pluralize(days, "day")}`;
  if (days === -1) return "Passed yesterday";
  return `Passed ${pluralize(-days, "day")} ago`;
}

/**
 * "Cancel Date" row for active orders, with a countdown underneath (red once it has passed,
 * orange when it's close). Older orders still awaiting review get the plain date only: their
 * dates came from the old app, so a countdown or alarm would be misleading.
 */
function CancelDateRow({ po }: { po: PurchaseOrder }) {
  const days = daysFromToday(po.cancelDate);
  if (!isActivePO(po) || days === null) return null;
  const value = formatCancelDate(po.cancelDate);
  if (po.needsReview) return <ListRow title="Cancel Date" value={value} />;

  const overdue = isOverdue(po);
  const soon = !overdue && isDueSoon(po);
  const Icon = overdue ? TriangleAlert : soon ? Clock : null;
  return (
    <ListRow
      title="Cancel Date"
      subtitle={
        <span
          className={cn(
            "flex items-center gap-1",
            overdue && "font-medium text-destructive",
            soon && "font-medium text-[hsl(var(--warning-text))]",
          )}
        >
          {Icon && <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden />}
          <span className="truncate">{cancelCountdown(days)}</span>
        </span>
      }
      value={value}
    />
  );
}

export function SummarySection({ po }: { po: PurchaseOrder }) {
  const window = formatShipWindow(po.startShipDate, po.cancelDate);
  return (
    <ListSection header="Summary">
      <ListRow>
        <div className="text-[13px] leading-[18px] text-muted-foreground">Total</div>
        <div className="text-title-1 mt-0.5 tabular-nums md:text-title-2">{formatMoney(po.totalAmount)}</div>
      </ListRow>
      <ListRow title="Units" value={formatNumber(po.totalQuantity)} />
      <ListRow title="Items" value={formatNumber(po.itemCount)} />
      <ListRow title="Order Date" value={formatDate(po.orderDate) || <NotSet />} />
      <ListRow title="Ship Window" value={window || <NotSet />} />
      <CancelDateRow po={po} />
      <ListRow title="Payment Terms" value={po.terms ? <Value>{po.terms}</Value> : <NotSet />} />
    </ListSection>
  );
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

export function NotesSection({ notes }: { notes: string }) {
  return (
    <ListSection header="Internal Notes" footer="Only visible to your team — not printed.">
      <ListRow>
        <p className="whitespace-pre-wrap break-words text-[17px] leading-[22px] md:text-[15px] md:leading-5">{notes.trim()}</p>
      </ListRow>
    </ListSection>
  );
}

// ---------------------------------------------------------------------------
// Archived banner
// ---------------------------------------------------------------------------

export function ArchivedBanner({
  onRestore,
  onDelete,
  restoring,
}: {
  onRestore: () => void;
  onDelete: () => void;
  restoring?: boolean;
}) {
  return (
    <div role="status" className="flex flex-col gap-4 rounded-2xl bg-card p-4 sm:flex-row sm:items-center sm:gap-5 md:px-5">
      <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
        <IconTile icon={Archive} color="gray" size="md" />
        <div className="min-w-0">
          <p className="text-[17px] font-semibold leading-snug md:text-[15px]">This purchase order is archived</p>
          <p className="mt-0.5 text-[15px] leading-snug text-muted-foreground md:text-[13px]">
            It's hidden from your active orders. Deleting it moves it to Recently Deleted in Settings.
          </p>
        </div>
      </div>
      {/* On phones the buttons share the row by content width. */}
      <div className="flex shrink-0 flex-wrap gap-2 [&>*]:flex-auto sm:[&>*]:flex-none">
        <Button variant="tinted" onClick={onRestore} disabled={restoring}>
          {restoring ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <ArchiveRestore className="hidden sm:block" aria-hidden />
          )}
          Restore
        </Button>
        <Button variant="destructive-tinted" onClick={onDelete}>
          <Trash2 className="hidden sm:block" aria-hidden />
          Delete
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton (matches the final layout)
// ---------------------------------------------------------------------------

function ListSkeleton({ rows, header = true }: { rows: number; header?: boolean }) {
  return (
    <div className="space-y-1.5">
      {header && <Skeleton className="ml-4 h-3.5 w-20 rounded-md" />}
      <div className="overflow-hidden rounded-xl bg-card">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex h-11 items-center justify-between gap-4 border-b border-border/60 px-4 last:border-0 md:h-[42px]">
            <Skeleton className="h-3.5 w-24 rounded-md" />
            <Skeleton className="h-3.5 w-16 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DetailSkeleton({ layout }: { layout: "phone" | "tablet" | "desktop" }) {
  const status = <ListSkeleton rows={2} header={false} />;
  const summary = (
    <div className="space-y-1.5">
      <Skeleton className="ml-4 h-3.5 w-20 rounded-md" />
      <div className="overflow-hidden rounded-xl bg-card">
        <div className="border-b border-border/60 p-4">
          <Skeleton className="h-3 w-10 rounded-md" />
          <Skeleton className="mt-2 h-7 w-40 rounded-md" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex h-11 items-center justify-between gap-4 border-b border-border/60 px-4 last:border-0">
            <Skeleton className="h-3.5 w-24 rounded-md" />
            <Skeleton className="h-3.5 w-16 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
  const history = <ListSkeleton rows={2} />;
  const doc = <Skeleton className="h-[560px] rounded-2xl bg-card md:h-[880px]" />;
  return (
    <div aria-busy="true" aria-label="Loading purchase order">
      {layout === "desktop" ? (
        <div className="grid grid-cols-[minmax(0,1fr)_380px] items-start gap-8 2xl:grid-cols-[minmax(0,1fr)_400px]">
          {doc}
          <div className="space-y-6">
            {status}
            {summary}
            {history}
          </div>
        </div>
      ) : layout === "tablet" ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 items-start gap-6">
            <div className="space-y-6">
              {status}
              {summary}
            </div>
            {history}
          </div>
          {doc}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[66px] rounded-xl bg-card" />
            ))}
          </div>
          {status}
          {summary}
          {doc}
        </div>
      )}
    </div>
  );
}
