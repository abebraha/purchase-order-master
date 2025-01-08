import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format as dateFormat } from "date-fns";

interface PurchaseOrder {
  id: number;
  poNumber: string;
  poType: string;
  orderDate: string;
  shipTo: string;
  items: Array<{
    id: number;
    styleId: number;
    quantity: number;
    price: number;
  }>;
}

export default function PurchaseOrders() {
  const { data: purchaseOrders } = useQuery<PurchaseOrder[]>({
    queryKey: ["/api/purchase-orders"],
  });

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Purchase Order History</h1>
        <Link href="/">
          <Button>Create New PO</Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Purchase Orders</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO #</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Order Date</TableHead>
                <TableHead>Ship To</TableHead>
                <TableHead>Total Items</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchaseOrders?.map((po) => (
                <TableRow key={po.id}>
                  <TableCell className="font-medium">{po.poNumber}</TableCell>
                  <TableCell>{po.poType}</TableCell>
                  <TableCell>{dateFormat(new Date(po.orderDate), "MMM d, yyyy")}</TableCell>
                  <TableCell>{po.shipTo.split('\n')[0]}</TableCell>
                  <TableCell>{po.items?.length || 0}</TableCell>
                  <TableCell>
                    <Link href={`/purchase-orders/${po.id}`}>
                      <Button variant="outline" size="sm">View</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}