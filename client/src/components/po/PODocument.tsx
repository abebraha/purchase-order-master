// STUB — to be implemented by the document agent. Props are the contract.
import type { AppSettings } from "@shared/po";
import type { PODocumentData } from "@/lib/document";

export interface PODocumentProps {
  data: PODocumentData;
  settings: AppSettings;
  className?: string;
}

/** Paper-style, responsive on-screen rendering of a purchase order. */
export default function PODocument({ data }: PODocumentProps) {
  return <div>PO #{data.poNumber}</div>;
}
