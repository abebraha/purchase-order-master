import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { POFormValues } from "@/lib/types";
import type { Style } from "@db/schema";
import { format as dateFormat } from "date-fns";
import { jsPDF } from "jspdf";
import autoTable from 'jspdf-autotable';

interface Props {
  data: POFormValues;
}

export default function POPreview({ data }: Props) {
  const { data: styles } = useQuery<Style[]>({ queryKey: ["/api/styles"] });

  const generatePDF = () => {
    const doc = new jsPDF();

    // Header
    doc.setFontSize(20);
    doc.text("United Intimate Group", 105, 20, { align: "center" });
    doc.setFontSize(10);
    doc.text("1410 Broadway/ Suite 1502, New York, NY, 10018", 105, 30, { align: "center" });
    doc.text("Email: ira@unitedintimate.com", 105, 35, { align: "center" });
    doc.text("Phone: Office - 347-380-8420, Cell - 646-251-2759", 105, 40, { align: "center" });

    // Order Information
    doc.setFontSize(12);
    doc.text(`Order Date: ${dateFormat(data.orderDate, "MM/dd/yyyy")}`, 15, 55);
    doc.text(`Ship To:`, 15, 65);
    doc.setFontSize(10);
    data.shipTo.split('\n').forEach((line, i) => {
      doc.text(line, 25, 70 + (i * 5));
    });

    doc.setFontSize(12);
    doc.text(`Bill To:`, 105, 65);
    doc.setFontSize(10);
    data.billTo.split('\n').forEach((line, i) => {
      doc.text(line, 115, 70 + (i * 5));
    });

    doc.setFontSize(12);
    doc.text(`Start Ship Date: ${dateFormat(data.startShipDate, "MM/dd/yyyy")}`, 15, 100);
    doc.text(`Cancel Date: ${dateFormat(data.cancelDate, "MM/dd/yyyy")}`, 105, 100);

    // Items Table
    const tableData = data.items.map(item => {
      const style = styles?.find(s => s.id === item.styleId);
      return [
        style?.styleNumber || '',
        style?.color || '',
        style?.description || '',
        item.quantity.toString(),
        `$${item.price.toFixed(2)}`,
        `$${(item.quantity * item.price).toFixed(2)}`,
      ];
    });

    autoTable(doc, {
      startY: 110,
      head: [['Style #', 'Color', 'Description', 'Quantity', 'Price', 'Total']],
      body: tableData,
    });

    // Totals
    const totalQuantity = data.items.reduce((sum, item) => sum + item.quantity, 0);
    const totalCost = data.items.reduce((sum, item) => sum + (item.quantity * item.price), 0);

    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.text(`Total Quantity: ${totalQuantity}`, 15, finalY);
    doc.text(`Total Cost: $${totalCost.toFixed(2)}`, 105, finalY);

    doc.save('purchase-order.pdf');
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold">United Intimate Group</h2>
          <p className="text-sm text-gray-600">1410 Broadway/ Suite 1502, New York, NY, 10018</p>
          <p className="text-sm text-gray-600">Email: ira@unitedintimate.com</p>
          <p className="text-sm text-gray-600">Phone: Office - 347-380-8420, Cell - 646-251-2759</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <div>
            <h3 className="font-semibold mb-2">Ship To:</h3>
            <p className="whitespace-pre-line">{data.shipTo}</p>
          </div>
          <div>
            <h3 className="font-semibold mb-2">Bill To:</h3>
            <p className="whitespace-pre-line">{data.billTo}</p>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-6">
          <div>
            <h3 className="font-semibold mb-2">Order Date:</h3>
            <p>{dateFormat(data.orderDate, "MM/dd/yyyy")}</p>
          </div>
          <div>
            <h3 className="font-semibold mb-2">Start Ship Date:</h3>
            <p>{dateFormat(data.startShipDate, "MM/dd/yyyy")}</p>
          </div>
          <div>
            <h3 className="font-semibold mb-2">Cancel Date:</h3>
            <p>{dateFormat(data.cancelDate, "MM/dd/yyyy")}</p>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Style #</TableHead>
              <TableHead>Color</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((item, index) => {
              const style = styles?.find(s => s.id === item.styleId);
              return (
                <TableRow key={index}>
                  <TableCell>{style?.styleNumber}</TableCell>
                  <TableCell>{style?.color}</TableCell>
                  <TableCell>{style?.description}</TableCell>
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell>${item.price.toFixed(2)}</TableCell>
                  <TableCell>${(item.quantity * item.price).toFixed(2)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        <div className="flex justify-end mt-6">
          <Button onClick={generatePDF}>Download PDF</Button>
        </div>
      </Card>
    </div>
  );
}