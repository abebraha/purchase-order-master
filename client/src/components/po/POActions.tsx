/**
 * Everything you can *do* with a purchase order from its detail screen:
 *
 *   usePOActions(po, settings)  handlers (PDF, share, print, duplicate, edit, archive, restore,
 *                               delete) + the confirmation dialogs they need
 *   POQuickActions              Contacts-style row of big action tiles (phones)
 *   PONavActions                nav-bar actions: ••• menu + "Edit" on phones, a toolbar on desktop
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  Archive,
  ArchiveRestore,
  ArrowDownToLine,
  CopyPlus,
  Ellipsis,
  FileSpreadsheet,
  Loader2,
  Pencil,
  Printer,
  Share,
  SquarePen,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { DEFAULT_SETTINGS, type AppSettings, type PurchaseOrder } from "@shared/po";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToastAction } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/common";
import { useToast } from "@/hooks/use-toast";
import { useArchivePurchaseOrder, useDeletePurchaseOrder, useRestorePurchaseOrder } from "@/lib/api";
import { documentFromPurchaseOrder, type PODocumentData } from "@/lib/document";
import { exportLineItemsCsv } from "@/lib/export";
import { pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";

type PdfModule = typeof import("@/lib/pdf");
type Busy = "pdf" | "share" | "print" | null;

// ---------------------------------------------------------------------------
// PDF module preloading
// ---------------------------------------------------------------------------

/**
 * Loads the (heavy) PDF module in the background as soon as a screen needs it, so print/share
 * can run synchronously inside the click handler (popup blockers and the iOS share sheet
 * require a fresh user gesture). `load` covers the rare tap before it has arrived.
 */
function usePdf() {
  const ref = useRef<PdfModule | null>(null);
  useEffect(() => {
    let alive = true;
    import("@/lib/pdf")
      .then((mod) => {
        if (alive) ref.current = mod;
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const load = useCallback(async () => {
    if (ref.current) return ref.current;
    const mod = await import("@/lib/pdf");
    ref.current = mod;
    return mod;
  }, []);
  return { ref, load };
}

export function canShareFiles(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

/**
 * PDF actions for any document (the live PO or an older version from History).
 * print/share call into the preloaded module synchronously — nothing is awaited first.
 */
export function usePdfActions(data: PODocumentData, settings: AppSettings | undefined) {
  const { toast } = useToast();
  const { ref, load } = usePdf();
  const [busy, setBusy] = useState<Busy>(null);
  const effective = settings ?? DEFAULT_SETTINGS;

  const fail = useCallback(
    (title: string) => (error: unknown) => {
      toast({
        variant: "destructive",
        title,
        description: error instanceof Error ? error.message : "Please try again.",
      });
    },
    [toast],
  );

  const run = useCallback(
    (kind: Exclude<Busy, null>, action: (mod: PdfModule) => Promise<unknown>, errorTitle: string) => {
      setBusy(kind);
      const mod = ref.current;
      // Call synchronously when the module is ready so the browser still sees the tap.
      const promise = mod ? action(mod) : load().then(action);
      promise.catch(fail(errorTitle)).finally(() => setBusy(null));
    },
    [fail, load, ref],
  );

  const downloadPdf = useCallback(() => {
    run(
      "pdf",
      async (mod) => {
        await mod.downloadPOPdf(data, effective);
        toast({ title: "PDF downloaded", description: mod.pdfFileName(data) });
      },
      "Couldn't create the PDF",
    );
  }, [data, effective, run, toast]);

  const printPdf = useCallback(() => {
    run("print", (mod) => mod.printPOPdf(data, effective), "Couldn't open the print view");
  }, [data, effective, run]);

  const sharePdf = useCallback(() => {
    run(
      "share",
      async (mod) => {
        const result = await mod.sharePOPdf(data, effective);
        if (result === "downloaded") {
          toast({
            title: "PDF downloaded",
            description: "Sharing isn't available on this device, so the PDF was saved instead.",
          });
        }
      },
      "Couldn't share the PDF",
    );
  }, [data, effective, run, toast]);

  return { busy, downloadPdf, printPdf, sharePdf };
}

// ---------------------------------------------------------------------------
// usePOActions
// ---------------------------------------------------------------------------

export interface POActionsApi {
  po: PurchaseOrder;
  canShare: boolean;
  busy: Busy;
  archived: boolean;
  downloadPdf: () => void;
  sharePdf: () => void;
  printPdf: () => void;
  duplicate: () => void;
  edit: () => void;
  exportCsv: () => void;
  requestArchive: () => void;
  restore: () => void;
  restoring: boolean;
  requestDelete: () => void;
}

export function usePOActions(
  po: PurchaseOrder,
  settings: AppSettings | undefined,
  options: { onDeleteStart?: () => void; onDeleteEnd?: () => void } = {},
) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const data = useMemo(() => documentFromPurchaseOrder(po), [po]);
  const pdf = usePdfActions(data, settings);
  const archiveMutation = useArchivePurchaseOrder();
  const restoreMutation = useRestorePurchaseOrder();
  const deleteMutation = useDeletePurchaseOrder();
  const [confirm, setConfirm] = useState<"archive" | "delete" | null>(null);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => setCanShare(canShareFiles()), []);

  const label = `PO #${po.poNumber}`;
  const errorToast = useCallback(
    (title: string) => (error: Error) =>
      toast({ variant: "destructive", title, description: error.message }),
    [toast],
  );

  const archive = () =>
    archiveMutation.mutate(po.id, {
      onSuccess: () => {
        setConfirm(null);
        toast({ title: "Purchase order archived", description: `${label} is hidden from your active orders. You can restore it anytime.` });
      },
      onError: errorToast("Couldn't archive this order"),
    });

  const restore = () =>
    restoreMutation.mutate(po.id, {
      onSuccess: () => toast({ title: "Purchase order restored", description: `${label} is back in your active orders.` }),
      onError: errorToast("Couldn't restore this order"),
    });

  const remove = () => {
    options.onDeleteStart?.();
    // mutateAsync: the page may briefly lose its data while the delete settles, and the
    // follow-up (toast + navigation) must still happen.
    deleteMutation
      .mutateAsync(po.id)
      .then(() => {
        setConfirm(null);
        // Deleting is recoverable: the order moves to Settings → Recently Deleted.
        toast({
          title: "Purchase order deleted",
          description: `${label} moved to Recently Deleted in Settings. You can recover it there anytime.`,
          action: (
            <ToastAction
              altText="View Recently Deleted in Settings"
              onClick={() => navigate("/settings#deleted")}
              className="h-8 rounded-full border-0 bg-primary/10 px-3.5 font-semibold text-primary hover:bg-primary/15 dark:bg-primary/20"
            >
              View
            </ToastAction>
          ),
        });
        navigate("/purchase-orders?view=archived", { replace: true });
      })
      .catch((error: Error) => {
        options.onDeleteEnd?.();
        errorToast("Couldn't delete this order")(error);
      });
  };

  const api: POActionsApi = {
    po,
    canShare,
    busy: pdf.busy,
    archived: Boolean(po.archivedAt),
    downloadPdf: pdf.downloadPdf,
    sharePdf: pdf.sharePdf,
    printPdf: pdf.printPdf,
    duplicate: () => navigate(`/purchase-orders/new?from=${po.id}`),
    edit: () => navigate(`/purchase-orders/${po.id}/edit`),
    exportCsv: () => {
      exportLineItemsCsv([po], `PO-${po.poNumber.replace(/[^\w.-]+/g, "_")}-line-items.csv`);
      toast({ title: "Line items exported", description: `${pluralize(po.itemCount, "line item")} saved as a CSV file.` });
    },
    requestArchive: () => setConfirm("archive"),
    restore,
    restoring: restoreMutation.isPending,
    requestDelete: () => setConfirm("delete"),
  };

  const dialogs = (
    <>
      <ConfirmDialog
        open={confirm === "archive"}
        onOpenChange={(open) => !open && !archiveMutation.isPending && setConfirm(null)}
        title={`Archive ${label}?`}
        description="It will be hidden from your active orders. Nothing is deleted — you can restore it anytime."
        confirmLabel="Archive"
        pending={archiveMutation.isPending}
        onConfirm={archive}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(open) => !open && !deleteMutation.isPending && setConfirm(null)}
        title={`Delete ${label}?`}
        description="It moves to Recently Deleted in Settings, with its full history, so you can recover it anytime."
        confirmLabel="Delete"
        destructive
        pending={deleteMutation.isPending}
        onConfirm={remove}
      />
    </>
  );

  return { api, dialogs };
}

// ---------------------------------------------------------------------------
// Quick action tiles (Contacts-style)
// ---------------------------------------------------------------------------

function ActionTile({
  icon: Icon,
  label,
  onClick,
  busy,
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className="flex h-[66px] min-w-0 flex-col items-center justify-center gap-[5px] rounded-xl bg-card px-1 text-primary outline-none transition duration-150 hover:bg-accent/60 active:scale-[0.97] active:bg-accent focus-visible:ring-4 focus-visible:ring-ring/30 disabled:opacity-50 md:h-[60px]"
    >
      {busy ? (
        <Loader2 className="h-[22px] w-[22px] animate-spin" strokeWidth={2} aria-hidden />
      ) : (
        <Icon className="h-[22px] w-[22px]" strokeWidth={2} aria-hidden />
      )}
      <span className="max-w-full truncate text-[12px] font-medium leading-none">{label}</span>
    </button>
  );
}

export function POQuickActions({ actions, className }: { actions: POActionsApi; className?: string }) {
  return (
    <div className={cn("grid grid-cols-4 gap-2", className)} role="group" aria-label="Quick actions">
      <ActionTile icon={ArrowDownToLine} label="PDF" onClick={actions.downloadPdf} busy={actions.busy === "pdf"} />
      {actions.canShare ? (
        <ActionTile icon={Share} label="Share" onClick={actions.sharePdf} busy={actions.busy === "share"} />
      ) : (
        <ActionTile icon={Printer} label="Print" onClick={actions.printPdf} busy={actions.busy === "print"} />
      )}
      <ActionTile icon={CopyPlus} label="Duplicate" onClick={actions.duplicate} />
      <ActionTile icon={SquarePen} label="Edit" onClick={actions.edit} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nav bar actions
// ---------------------------------------------------------------------------

/** The ••• menu. Phones: the iOS 30px tinted circle; desktop: a 32px tinted button like the toolbar's. */
function MoreMenu({ actions, compact }: { actions: POActionsApi; compact: boolean }) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        {compact ? (
          <Button variant="plain" size="icon" aria-label="More actions" className="shrink-0">
            <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-primary/10 text-primary dark:bg-primary/20">
              <Ellipsis className="!h-5 !w-5" strokeWidth={2.25} />
            </span>
          </Button>
        ) : (
          <Button variant="tinted" size="icon-sm" aria-label="More actions" title="More actions" className="shrink-0">
            <Ellipsis className="!h-[18px] !w-[18px]" strokeWidth={2.25} />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={compact ? "end" : "start"} className="min-w-[14rem]">
        <DropdownMenuItem onSelect={actions.duplicate}>
          <CopyPlus aria-hidden />
          Duplicate
        </DropdownMenuItem>
        {compact && (
          <>
            <DropdownMenuItem onSelect={actions.downloadPdf}>
              <ArrowDownToLine aria-hidden />
              Download PDF
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={actions.printPdf}>
              <Printer aria-hidden />
              Print
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuItem onSelect={actions.exportCsv}>
          <FileSpreadsheet aria-hidden />
          Export Line Items as CSV
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {actions.archived ? (
          <>
            <DropdownMenuItem onSelect={actions.restore}>
              <ArchiveRestore aria-hidden />
              Restore
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={actions.requestDelete}
              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
            >
              <Trash2 aria-hidden />
              Delete
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem onSelect={actions.requestArchive}>
            <Archive aria-hidden />
            Archive
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Spinning({ busy, icon: Icon }: { busy: boolean; icon: LucideIcon }) {
  return busy ? <Loader2 className="animate-spin" aria-hidden /> : <Icon aria-hidden />;
}

/**
 * Right side of the nav bar, in the app-wide order: ••• first, secondary actions, then the one
 * primary action (Edit) rightmost. Phones: ••• + "Edit". Desktop (md+): a small toolbar.
 */
export function PONavActions({ actions }: { actions: POActionsApi }) {
  return (
    <>
      <div className="flex items-center md:hidden">
        <MoreMenu actions={actions} compact />
        <Button variant="plain" onClick={actions.edit} className="h-11 px-2 text-[17px] font-normal">
          Edit
        </Button>
      </div>
      <div className="hidden items-center gap-2 md:flex">
        <MoreMenu actions={actions} compact={false} />
        {actions.canShare && (
          <Button variant="tinted" size="sm" onClick={actions.sharePdf} disabled={actions.busy === "share"}>
            <Spinning busy={actions.busy === "share"} icon={Share} />
            Share
          </Button>
        )}
        <Button variant="tinted" size="sm" onClick={actions.printPdf} disabled={actions.busy === "print"}>
          <Spinning busy={actions.busy === "print"} icon={Printer} />
          Print
        </Button>
        <Button variant="tinted" size="sm" onClick={actions.downloadPdf} disabled={actions.busy === "pdf"}>
          <Spinning busy={actions.busy === "pdf"} icon={ArrowDownToLine} />
          Download PDF
        </Button>
        <Button size="sm" onClick={actions.edit} title="Edit (E)">
          <Pencil aria-hidden />
          Edit
        </Button>
      </div>
    </>
  );
}
