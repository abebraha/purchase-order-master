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
  TableFooter,
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

  // Calculate totals
  const totalQuantity = data.items.reduce((sum, item) => sum + item.quantity, 0);
  const totalCost = data.items.reduce((sum, item) => sum + (item.quantity * item.price), 0);

  // Format number with commas and optional decimal places
  const formatNumber = (num: number, decimals = 0) => {
    return num.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  };

  // Get style number - either from linked style or manual entry
  const getStyleNumber = (item: any) => {
    const style = styles?.find(s => s.id === item.styleId);
    return style?.styleNumber || item.manualStyleNumber || '';
  };

  const generatePDF = () => {
    const doc = new jsPDF();

    // Set custom fonts for a more modern look
    doc.setFont("helvetica");

    // Add a subtle background gradient
    const width = doc.internal.pageSize.width;
    const height = doc.internal.pageSize.height;
    doc.setFillColor(249, 250, 251); // Very light gray
    doc.rect(0, 0, width, height, 'F');

    // Modern header design
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(15, 15, width - 30, 45, 3, 3, 'F');

    // Company header with modern styling
    doc.setFontSize(24);
    doc.setTextColor(44, 62, 80);
    doc.text("United Intimate Group", 105, 30, { align: "center" });

    // PO Number with enhanced visibility
    doc.setFontSize(14);
    doc.setTextColor(44, 62, 80);
    doc.text(`Purchase Order #${data.poNumber}`, 190, 25, { align: "right" });

    // Contact information with improved layout
    doc.setFontSize(10);
    doc.setTextColor(107, 114, 128);
    doc.text("1410 Broadway/ Suite 1502, New York, NY, 10018", 105, 38, { align: "center" });
    doc.text("Email: ira@unitedintimate.com", 105, 43, { align: "center" });
    doc.text("Phone: Office - 347-380-8420, Cell - 646-251-2759", 105, 48, { align: "center" });

    // Info section with modern card-like design
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(15, 70, width - 30, 40, 3, 3, 'F');

    // Order information with improved layout
    doc.setFontSize(11);
    doc.setTextColor(44, 62, 80);
    doc.text(`PO Type: ${data.poType}`, 25, 82);
    doc.text(`Order Date: ${format(new Date(data.orderDate), "MMMM d, yyyy")}`, 25, 89);
    doc.text(`Payment Terms: ${data.terms}`, 25, 96);
    doc.text(`Start Ship: ${format(new Date(data.startShipDate), "MMM d, yyyy")}`, 115, 82);
    doc.text(`Cancel Date: ${format(new Date(data.cancelDate), "MMM d, yyyy")}`, 115, 89);
    if (data.dueDate) {
      doc.text(`Due Date: ${format(new Date(data.dueDate), "MMM d, yyyy")}`, 115, 96);
    }

    // Address section with card-like design
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(15, 120, (width - 35) / 2, 40, 3, 3, 'F');
    doc.roundedRect((width + 5) / 2, 120, (width - 35) / 2, 40, 3, 3, 'F');

    // Bill To and Ship To with improved formatting
    doc.setFontSize(12);
    doc.setTextColor(44, 62, 80);
    doc.text("Bill To:", 25, 130);
    doc.text("Ship To:", (width + 15) / 2, 130);

    doc.setFontSize(10);
    doc.setTextColor(75, 85, 99);
    data.billTo.split('\n').forEach((line, i) => {
      doc.text(line, 25, 138 + (i * 5));
    });
    data.shipTo.split('\n').forEach((line, i) => {
      doc.text(line, (width + 15) / 2, 138 + (i * 5));
    });

    // Add Special Instructions if present
    if (data.specialInstructions) {
      const instructionsY = 170;
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(15, instructionsY, width - 30, 30, 3, 3, 'F');

      doc.setFontSize(12);
      doc.setTextColor(44, 62, 80);
      doc.text("Special Instructions:", 25, instructionsY + 10);

      doc.setFontSize(10);
      doc.setTextColor(75, 85, 99);
      doc.text(data.specialInstructions, 25, instructionsY + 20);
    }

    // Adjust the starting Y position for the items table based on whether there are special instructions
    const tableStartY = data.specialInstructions ? 210 : 170;

    // Items table with updated style number handling
    const tableData = data.items.map(item => ([
      getStyleNumber(item),
      item.color || '',
      item.description || '',
      formatNumber(item.quantity),
      `$${formatNumber(item.price, 2)}`,
      `$${formatNumber(item.quantity * item.price, 2)}`,
    ]));

    autoTable(doc, {
      startY: tableStartY,
      head: [['Style #', 'Color', 'Description', 'Quantity', 'Price', 'Total']],
      body: tableData,
      headStyles: {
        fillColor: [244, 244, 245],
        textColor: [15, 23, 42],
        fontSize: 11,
        fontStyle: 'bold',
        halign: 'left',
      },
      bodyStyles: {
        fontSize: 10,
        textColor: [55, 65, 81],
      },
      alternateRowStyles: {
        fillColor: [249, 250, 251],
      },
      margin: { top: 10 },
      styles: {
        cellPadding: 5,
        fontSize: 10,
        lineColor: [226, 232, 240],
        lineWidth: 0.1,
      },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 15;

    // Total section with card-like design
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(width - 80, finalY, 65, 25, 3, 3, 'F');

    doc.setFontSize(11);
    doc.setTextColor(44, 62, 80);
    doc.text(`Total Quantity: ${formatNumber(totalQuantity)}`, width - 75, finalY + 8);
    doc.text(`Total Cost: $${formatNumber(totalCost, 2)}`, width - 75, finalY + 18);

    // Save with PO number in filename
    doc.save(`PO-${data.poNumber}.pdf`);
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

        <div className="grid gap-8 md:grid-cols-2 mb-8">
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-gray-600 uppercase tracking-wide">Bill To</h3>
            <p className="whitespace-pre-line text-gray-700 bg-gray-50 p-4 rounded-lg border border-gray-100">
              {data.billTo}
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-gray-600 uppercase tracking-wide">Ship To</h3>
            <p className="whitespace-pre-line text-gray-700 bg-gray-50 p-4 rounded-lg border border-gray-100">
              {data.shipTo}
            </p>
          </div>
        </div>

        {data.specialInstructions && (
          <div className="mb-8">
            <h3 className="text-sm font-medium text-gray-600 uppercase tracking-wide mb-2">Special Instructions</h3>
            <p className="whitespace-pre-line text-gray-700 bg-gray-50 p-4 rounded-lg border border-gray-100">
              {data.specialInstructions}
            </p>
          </div>
        )}

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
              {data.items.map((item, index) => (
                <TableRow key={index} className="hover:bg-gray-50">
                  <TableCell className="font-medium">{getStyleNumber(item)}</TableCell>
                  <TableCell>{item.color}</TableCell>
                  <TableCell>{item.description}</TableCell>
                  <TableCell className="text-right">{formatNumber(item.quantity)}</TableCell>
                  <TableCell className="text-right">${formatNumber(item.price, 2)}</TableCell>
                  <TableCell className="text-right">${formatNumber(item.quantity * item.price, 2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter className="bg-gray-50">
              <TableRow>
                <TableCell colSpan={3} className="font-medium text-right">Totals</TableCell>
                <TableCell className="text-right font-medium">{formatNumber(totalQuantity)}</TableCell>
                <TableCell className="text-right font-medium"></TableCell>
                <TableCell className="text-right font-medium">${formatNumber(totalCost, 2)}</TableCell>
              </TableRow>
            </TableFooter>
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