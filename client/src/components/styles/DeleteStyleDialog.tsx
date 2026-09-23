import type { StyleRecord } from "@shared/po";
import { ConfirmDialog } from "@/components/common";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { useCreateStyle, useDeleteStyle } from "@/lib/api";
import { pluralize } from "@/lib/format";

/** iOS-style alert confirming a catalog deletion, followed by a toast with Undo. */
export function DeleteStyleDialog({
  style,
  onOpenChange,
}: {
  /** The style to delete; null keeps the alert closed. */
  style: StyleRecord | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const remove = useDeleteStyle();
  const recreate = useCreateStyle();

  const undo = async (deleted: StyleRecord) => {
    try {
      await recreate.mutateAsync({
        styleNumber: deleted.styleNumber,
        color: deleted.color ?? "",
        description: deleted.description ?? "",
      });
      toast({ title: "Style restored", description: `${deleted.styleNumber} is back in your catalog.` });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Couldn't restore style",
        description: error instanceof Error ? error.message : "Please add it again.",
      });
    }
  };

  const confirm = async () => {
    if (!style) return;
    const deleted = style;
    try {
      await remove.mutateAsync(deleted.id);
      onOpenChange(false);
      toast({
        title: "Style deleted",
        description: `${deleted.styleNumber} was removed from your catalog.`,
        action: (
          <ToastAction
            altText={`Undo deleting ${deleted.styleNumber}`}
            onClick={() => void undo(deleted)}
            className="h-8 rounded-full border-0 bg-primary/10 px-3.5 font-semibold text-primary hover:bg-primary/15 focus:ring-0 focus:ring-offset-0 dark:bg-primary/20"
          >
            Undo
          </ToastAction>
        ),
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Couldn't delete style",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    }
  };

  const used = style?.usageCount ?? 0;

  return (
    <ConfirmDialog
      open={Boolean(style)}
      onOpenChange={(open) => {
        if (!remove.isPending) onOpenChange(open);
      }}
      title={style ? `Delete ${style.styleNumber}?` : "Delete Style?"}
      description={
        used > 0
          ? `Used on ${pluralize(used, "PO item")}. Those purchase orders keep this style number — only the catalog entry is removed.`
          : "It will be removed from your style catalog. No purchase orders use it."
      }
      confirmLabel="Delete Style"
      destructive
      pending={remove.isPending}
      onConfirm={confirm}
    />
  );
}
