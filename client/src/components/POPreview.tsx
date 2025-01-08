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
import { format } from "date-fns";
import { jsPDF } from "jspdf";
import autoTable from 'jspdf-autotable';

interface Props {
  data: POFormValues;
}

export default function POPreview({ data }: Props) {
  const { data: styles } = useQuery<Style[]>({ queryKey: ["/api/styles"] });

  const generatePDF = () => {
    const doc = new jsPDF();

    // Set custom fonts for a more modern look
    doc.setFont("helvetica");

    // PO Number in top right
    doc.setFontSize(14);
    doc.setTextColor(44, 62, 80);
    doc.text(`PO #: ${data.poNumber}`, 190, 20, { align: "right" });

    // Header with company logo and info
    doc.setFontSize(24);
    doc.setTextColor(44, 62, 80); // Dark blue-gray
    doc.text("United Intimate Group", 105, 25, { align: "center" });

    doc.setFontSize(10);
    doc.setTextColor(127, 140, 141); // Lighter gray for secondary text
    doc.text("1410 Broadway/ Suite 1502, New York, NY, 10018", 105, 35, { align: "center" });
    doc.text("Email: ira@unitedintimate.com", 105, 40, { align: "center" });
    doc.text("Phone: Office - 347-380-8420, Cell - 646-251-2759", 105, 45, { align: "center" });

    // Add a subtle separator line
    doc.setDrawColor(189, 195, 199);
    doc.line(20, 50, 190, 50);

    // PO Type and Order Information
    doc.setFontSize(12);
    doc.setTextColor(44, 62, 80);
    doc.text(`PO Type: ${data.poType}`, 20, 60);
    doc.text(`Order Date: ${format(data.orderDate, "MMMM d, yyyy")}`, 105, 60);

    // Ship To and Bill To sections with better formatting
    doc.setFontSize(12);
    doc.text("Ship To:", 20, 70);
    doc.setFontSize(10);
    data.shipTo.split('\n').forEach((line, i) => {
      doc.text(line, 20, 77 + (i * 5));
    });

    doc.setFontSize(12);
    doc.text("Bill To:", 105, 70);
    doc.setFontSize(10);
    data.billTo.split('\n').forEach((line, i) => {
      doc.text(line, 105, 77 + (i * 5));
    });

    // Shipping Dates with improved layout
    doc.setFontSize(11);
    doc.text(`Start Ship: ${format(data.startShipDate, "MMM d, yyyy")}`, 20, 105);
    doc.text(`Cancel Date: ${format(data.cancelDate, "MMM d, yyyy")}`, 105, 105);

    // Items Table with modern styling
    const tableData = data.items.map(item => {
      const style = styles?.find(s => s.id === item.styleId);
      return [
        style?.styleNumber || '',
        item.color || '',
        item.description || '',
        item.quantity.toString(),
        `$${item.price.toFixed(2)}`,
        `$${(item.quantity * item.price).toFixed(2)}`,
      ];
    });

    autoTable(doc, {
      startY: 115,
      head: [['Style #', 'Color', 'Description', 'Quantity', 'Price', 'Total']],
      body: tableData,
      headStyles: {
        fillColor: [44, 62, 80],
        fontSize: 10,
        fontStyle: 'bold',
      },
      bodyStyles: {
        fontSize: 9,
      },
      alternateRowStyles: {
        fillColor: [249, 250, 251],
      },
      margin: { top: 10 },
    });

    // Totals with improved visibility
    const totalQuantity = data.items.reduce((sum, item) => sum + item.quantity, 0);
    const totalCost = data.items.reduce((sum, item) => sum + (item.quantity * item.price), 0);

    const finalY = (doc as any).lastAutoTable.finalY + 15;

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(`Total Quantity: ${totalQuantity}`, 20, finalY);
    doc.text(`Total Cost: $${totalCost.toFixed(2)}`, 105, finalY);

    doc.save('purchase-order.pdf');
  };

  return (
    <div className="space-y-6">
      <Card className="p-6 shadow-lg bg-gradient-to-b from-white to-gray-50">
        <div className="relative text-center mb-8">
          <div className="absolute right-0 top-0">
            <p className="text-lg font-semibold text-gray-800">PO #: {data.poNumber}</p>
          </div>
          <h2 className="text-3xl font-semibold text-gray-800 mb-2">United Intimate Group</h2>
          <div className="space-y-1 text-gray-500">
            <p>1410 Broadway/ Suite 1502, New York, NY, 10018</p>
            <p>Email: ira@unitedintimate.com</p>
            <p>Phone: Office - 347-380-8420, Cell - 646-251-2759</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8 mb-8">
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-gray-600 uppercase tracking-wide">Ship To</h3>
            <p className="whitespace-pre-line text-gray-700 bg-gray-50 p-4 rounded-lg border border-gray-100">
              {data.shipTo}
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-gray-600 uppercase tracking-wide">Bill To</h3>
            <p className="whitespace-pre-line text-gray-700 bg-gray-50 p-4 rounded-lg border border-gray-100">
              {data.billTo}
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-4 gap-8 mb-8">
          <div className="space-y-1">
            <h3 className="text-sm font-medium text-gray-600 uppercase tracking-wide">PO Type</h3>
            <p className="text-gray-700">{data.poType}</p>
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-medium text-gray-600 uppercase tracking-wide">Order Date</h3>
            <p className="text-gray-700">{format(data.orderDate, "MMMM d, yyyy")}</p>
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-medium text-gray-600 uppercase tracking-wide">Start Ship Date</h3>
            <p className="text-gray-700">{format(data.startShipDate, "MMMM d, yyyy")}</p>
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-medium text-gray-600 uppercase tracking-wide">Cancel Date</h3>
            <p className="text-gray-700">{format(data.cancelDate, "MMMM d, yyyy")}</p>
          </div>
        </div>

        <div className="rounded-lg overflow-hidden border border-gray-200">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="font-medium">Style #</TableHead>
                <TableHead className="font-medium">Color</TableHead>
                <TableHead className="font-medium">Description</TableHead>
                <TableHead className="font-medium text-right">Quantity</TableHead>
                <TableHead className="font-medium text-right">Price</TableHead>
                <TableHead className="font-medium text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((item, index) => {
                const style = styles?.find(s => s.id === item.styleId);
                return (
                  <TableRow key={index} className="hover:bg-gray-50">
                    <TableCell className="font-medium">{style?.styleNumber}</TableCell>
                    <TableCell>{item.color}</TableCell>
                    <TableCell>{item.description}</TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right">${item.price.toFixed(2)}</TableCell>
                    <TableCell className="text-right">${(item.quantity * item.price).toFixed(2)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="flex justify-end mt-8">
          <Button
            onClick={generatePDF}
            className="bg-gray-900 text-white hover:bg-gray-800 transition-colors"
          >
            Download PDF
          </Button>
        </div>
      </Card>
    </div>
  );
}