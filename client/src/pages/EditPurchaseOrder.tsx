import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import PurchaseOrderForm from "@/components/PurchaseOrderForm";
import type { POFormValues } from "@/lib/types";

export default function EditPurchaseOrder() {
  const [, params] = useRoute<{ id: string }>("/purchase-orders/:id/edit");
  const [, setLocation] = useLocation();
  const id = params?.id;

  const { data: po, isLoading, error } = useQuery<POFormValues>({
    queryKey: [`/api/purchase-orders/${id}`],
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-1/4 bg-gray-200 rounded"></div>
          <div className="h-[600px] bg-gray-100 rounded"></div>
        </div>
      </div>
    );
  }

  if (error || !po) {
    return (
      <div className="container mx-auto p-6">
        <Card className="p-6">
          <h1 className="text-xl font-semibold text-red-600 mb-4">Error Loading Purchase Order</h1>
          <p className="text-gray-600 mb-4">
            {error ? error.toString() : "Purchase order not found"}
          </p>
        </Card>
      </div>
    );
  }

  const handleSubmit = (data: POFormValues) => {
    setLocation(`/purchase-orders/${id}`);
  };

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Edit Purchase Order</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Edit PO #{po.poNumber}</CardTitle>
        </CardHeader>
        <CardContent>
          <PurchaseOrderForm
            mode="edit"
            defaultValues={po}
            onSubmit={handleSubmit}
          />
        </CardContent>
      </Card>
    </div>
  );
}
