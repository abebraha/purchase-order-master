import { useQuery } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import POPreview from "@/components/POPreview";
import type { POFormValues } from "@/lib/types";

export default function PurchaseOrderView() {
  const [, params] = useRoute<{ id: string }>("/purchase-orders/:id");
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
          <Link href="/purchase-orders">
            <Button>Back to PO History</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Purchase Order Details</h1>
        <Link href="/purchase-orders">
          <Button variant="outline">Back to PO History</Button>
        </Link>
      </div>
      
      <POPreview data={po} />
    </div>
  );
}
