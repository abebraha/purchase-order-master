import type { POFormValues, POStatus, PurchaseOrder } from "@shared/po";
import { computeTotals } from "@shared/po";

/**
 * Everything needed to render a purchase-order document (on screen or as a PDF).
 * Built either from a saved PurchaseOrder or from unsaved form values (live preview).
 */
export interface PODocumentData {
  poNumber: string;
  poType: string;
  status: POStatus;
  /** ISO timestamp or yyyy-MM-dd — format with formatDate() from lib/format. */
  orderDate: string;
  startShipDate: string;
  cancelDate: string;
  terms: string;
  shipTo: string;
  billTo: string;
  specialInstructions: string;
  items: Array<{
    styleNumber: string;
    color: string;
    description: string;
    quantity: number;
    price: number;
  }>;
  totalQuantity: number;
  totalAmount: number;
}

export function documentFromPurchaseOrder(po: PurchaseOrder): PODocumentData {
  return {
    poNumber: po.poNumber,
    poType: po.poType,
    status: po.status,
    orderDate: po.orderDate,
    startShipDate: po.startShipDate,
    cancelDate: po.cancelDate,
    terms: po.terms,
    shipTo: po.shipTo,
    billTo: po.billTo,
    specialInstructions: po.specialInstructions,
    items: po.items.map((i) => ({
      styleNumber: i.styleNumber || i.manualStyleNumber,
      color: i.color,
      description: i.description,
      quantity: Number(i.quantity) || 0,
      price: Number(i.price) || 0,
    })),
    totalQuantity: po.totalQuantity,
    totalAmount: po.totalAmount,
  };
}

/** Tolerates partially filled forms (used for the live preview while typing). */
export function documentFromFormValues(values: Partial<POFormValues>): PODocumentData {
  const items = (values.items ?? []).map((i) => ({
    styleNumber: i?.manualStyleNumber ?? "",
    color: i?.color ?? "",
    description: i?.description ?? "",
    quantity: Number(i?.quantity) || 0,
    price: Number(i?.price) || 0,
  }));
  const totals = computeTotals(items);
  return {
    poNumber: values.poNumber ?? "",
    poType: values.poType ?? "Regular PO",
    status: values.status ?? "open",
    orderDate: values.orderDate ?? "",
    startShipDate: values.startShipDate ?? "",
    cancelDate: values.cancelDate ?? "",
    terms: values.terms ?? "",
    shipTo: values.shipTo ?? "",
    billTo: values.billTo ?? "",
    specialInstructions: values.specialInstructions ?? "",
    items,
    totalQuantity: totals.totalQuantity,
    totalAmount: totals.totalAmount,
  };
}
