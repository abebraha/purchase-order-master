import type { CustomerRecord } from "@shared/po";
import { ConfirmDialog } from "@/components/common";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { useCreateCustomer, useDeleteCustomer } from "@/lib/api";
import { customerFormValues } from "./customerUtils";

/** iOS-style alert confirming a customer deletion, followed by a toast with Undo. */
export function DeleteCustomerDialog({
  customer,
  onOpenChange,
}: {
  /** The customer to delete; null keeps the alert closed. */
  customer: CustomerRecord | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const remove = useDeleteCustomer();
  const recreate = useCreateCustomer();

  const undo = async (deleted: CustomerRecord) => {
    try {
      await recreate.mutateAsync(customerFormValues(deleted));
      toast({ title: "Customer Restored", description: `${deleted.name} is back in your customers.` });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Couldn't Restore Customer",
        description: error instanceof Error ? error.message : "Please add them again.",
      });
    }
  };

  const confirm = async () => {
    if (!customer) return;
    const deleted = customer;
    try {
      await remove.mutateAsync(deleted.id);
      onOpenChange(false);
      toast({
        title: "Customer Deleted",
        description: `${deleted.name} was removed from your customers.`,
        action: (
          <ToastAction
            altText={`Undo deleting ${deleted.name}`}
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
        title: "Couldn't Delete Customer",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    }
  };

  return (
    <ConfirmDialog
      open={Boolean(customer)}
      onOpenChange={(open) => {
        if (!remove.isPending) onOpenChange(open);
      }}
      title={customer ? `Delete ${customer.name}?` : "Delete Customer?"}
      description="They'll be removed from your customer list. Purchase orders you already created keep their details."
      confirmLabel="Delete Customer"
      destructive
      pending={remove.isPending}
      onConfirm={confirm}
    />
  );
}
