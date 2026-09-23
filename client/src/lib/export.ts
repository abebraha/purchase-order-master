import { PO_STATUS_LABELS, type PurchaseOrder, type StyleRecord } from "@shared/po";
import { downloadCsv, formatDate, todayInputValue } from "@/lib/format";

const d = (iso: string | null | undefined) => formatDate(iso, "yyyy-MM-dd");

/** One row per purchase order. */
export function exportOrdersCsv(orders: PurchaseOrder[], filename = `purchase-orders-${todayInputValue()}.csv`) {
  const rows: unknown[][] = [
    [
      "PO Number", "Status", "Archived", "PO Type", "Order Date", "Start Ship", "Cancel Date", "Terms",
      "Ship To", "Bill To", "Lines", "Total Units", "Total Amount", "Special Instructions", "Internal Notes", "Created",
    ],
    ...orders.map((po) => [
      po.poNumber,
      PO_STATUS_LABELS[po.status] ?? po.status,
      po.archivedAt ? "Yes" : "No",
      po.poType,
      d(po.orderDate),
      d(po.startShipDate),
      d(po.cancelDate),
      po.terms,
      po.shipTo,
      po.billTo,
      po.itemCount,
      po.totalQuantity,
      po.totalAmount.toFixed(2),
      po.specialInstructions,
      po.notes,
      d(po.createdAt),
    ]),
  ];
  downloadCsv(filename, rows);
}

/** One row per line item (good for pivot tables). */
export function exportLineItemsCsv(orders: PurchaseOrder[], filename = `po-line-items-${todayInputValue()}.csv`) {
  const rows: unknown[][] = [
    [
      "PO Number", "Status", "PO Type", "Order Date", "Start Ship", "Cancel Date", "Ship To",
      "Style #", "Color", "Description", "Quantity", "Unit Price", "Line Total",
    ],
  ];
  for (const po of orders) {
    for (const item of po.items) {
      rows.push([
        po.poNumber,
        PO_STATUS_LABELS[po.status] ?? po.status,
        po.poType,
        d(po.orderDate),
        d(po.startShipDate),
        d(po.cancelDate),
        po.shipTo.split("\n")[0] ?? "",
        item.styleNumber,
        item.color,
        item.description,
        item.quantity,
        item.price.toFixed(2),
        (item.quantity * item.price).toFixed(2),
      ]);
    }
  }
  downloadCsv(filename, rows);
}

export function exportStylesCsv(styles: StyleRecord[], filename = `styles-${todayInputValue()}.csv`) {
  downloadCsv(filename, [
    ["style_number", "color", "description", "used_on_po_lines", "added"],
    ...styles.map((s) => [s.styleNumber, s.color, s.description, s.usageCount, d(s.createdAt)]),
  ]);
}
