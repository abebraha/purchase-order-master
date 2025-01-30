import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import POPreview from "@/components/POPreview";
import { useToast } from "@/hooks/use-toast";
import type { POFormValues } from "@/lib/types";

export default function PurchaseOrderView() {
  const [, params] = useRoute<{ id: string }>("/purchase-orders/:id");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const id = params?.id;

  const { data: po, isLoading, error } = useQuery<POFormValues>({
    queryKey: [`/api/purchase-orders/${id}`],
    enabled: !!id,
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/purchase-orders/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to delete purchase order');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/purchase-orders'] });
      toast({
        title: "Success",
        description: "Purchase order deleted successfully",
      });
      setLocation('/purchase-orders');
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this purchase order?')) {
      deleteMutation.mutate();
    }
  };

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
        <div className="flex gap-4">
          <Link href={`/purchase-orders/${id}/edit`}>
            <Button variant="secondary">Edit PO</Button>
          </Link>
          <Button 
            variant="destructive" 
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? "Deleting..." : "Delete PO"}
          </Button>
          <Link href="/purchase-orders">
            <Button variant="outline">Back to PO History</Button>
          </Link>
        </div>
      </div>

      <POPreview data={po} />
    </div>
  );
}