// STUB — to be implemented by the document agent. Signatures are the contract.
import type { jsPDF } from "jspdf";
import type { AppSettings } from "@shared/po";
import type { PODocumentData } from "@/lib/document";

/** Builds the PO PDF (multi-page aware). */
export async function buildPOPdf(_data: PODocumentData, _settings: AppSettings): Promise<jsPDF> {
  throw new Error("not implemented");
}

/** File name used for downloads/shares, e.g. "PO-1001.pdf". */
export function pdfFileName(data: PODocumentData): string {
  return `PO-${(data.poNumber || "draft").replace(/[^\w.-]+/g, "_")}.pdf`;
}

/** Triggers a browser download of the PDF. */
export async function downloadPOPdf(_data: PODocumentData, _settings: AppSettings): Promise<void> {
  throw new Error("not implemented");
}

/**
 * Opens the native share sheet with the PDF attached (mobile). Falls back to downloading
 * when file sharing isn't supported. Resolves to what happened.
 */
export async function sharePOPdf(
  _data: PODocumentData,
  _settings: AppSettings,
): Promise<"shared" | "downloaded" | "cancelled"> {
  throw new Error("not implemented");
}

/** Opens the PDF in a new tab with the print dialog. */
export async function printPOPdf(_data: PODocumentData, _settings: AppSettings): Promise<void> {
  throw new Error("not implemented");
}
