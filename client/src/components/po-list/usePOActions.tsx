import { useLocation } from "wouter";
import { DEFAULT_SETTINGS, PO_STATUS_LABELS, type POStatus, type PurchaseOrder } from "@shared/po";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import {
  useArchivePurchaseOrder,
  useRestorePurchaseOrder,
  useSetPurchaseOrderStatus,
  useSettings,
} from "@/lib/api";
import { documentFromPurchaseOrder } from "@/lib/document";

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : "Please try again.");

/** Actions offered for a purchase order in list menus, with toasts for every outcome. */
export function usePOActions() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { data: settings } = useSettings();
  const setStatus = useSetPurchaseOrderStatus();
  const archive = useArchivePurchaseOrder();
  const restore = useRestorePurchaseOrder();

  const open = (po: PurchaseOrder) => navigate(`/purchase-orders/${po.id}`);
  const edit = (po: PurchaseOrder) => navigate(`/purchase-orders/${po.id}/edit`);
  const duplicate = (po: PurchaseOrder) => navigate(`/purchase-orders/new?from=${po.id}`);

  const downloadPdf = async (po: PurchaseOrder) => {
    try {
      const { downloadPOPdf, pdfFileName } = await import("@/lib/pdf");
      const data = documentFromPurchaseOrder(po);
      await downloadPOPdf(data, settings ?? DEFAULT_SETTINGS);
      toast({ title: "PDF downloaded", description: pdfFileName(data) });
    } catch (e) {
      toast({ variant: "destructive", title: "Couldn't create the PDF", description: errorMessage(e) });
    }
  };

  const changeStatus = (po: PurchaseOrder, status: POStatus) => {
    if (status === po.status) return;
    setStatus.mutate(
      { id: po.id, status },
      {
        onSuccess: () =>
          toast({ title: `PO #${po.poNumber} marked ${PO_STATUS_LABELS[status]}` }),
        onError: (e) =>
          toast({ variant: "destructive", title: "Couldn't change the status", description: errorMessage(e) }),
      },
    );
  };

  const restoreOrder = (po: PurchaseOrder) => {
    restore.mutate(po.id, {
      onSuccess: () =>
        toast({ title: `PO #${po.poNumber} restored`, description: "It's back with your active orders." }),
      onError: (e) =>
        toast({ variant: "destructive", title: "Couldn't restore this order", description: errorMessage(e) }),
    });
  };

  const archiveOrder = (po: PurchaseOrder) => {
    archive.mutate(po.id, {
      onSuccess: () =>
        toast({
          title: `PO #${po.poNumber} archived`,
          description: "Find it anytime under Archived.",
          action: (
            <ToastAction altText="Undo archive" onClick={() => restoreOrder(po)}>
              Undo
            </ToastAction>
          ),
        }),
      onError: (e) =>
        toast({ variant: "destructive", title: "Couldn't archive this order", description: errorMessage(e) }),
    });
  };

  return {
    open,
    edit,
    duplicate,
    downloadPdf,
    changeStatus,
    archive: archiveOrder,
    restore: restoreOrder,
  };
}

export type POActions = ReturnType<typeof usePOActions>;
