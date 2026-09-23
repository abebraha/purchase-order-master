import type { Express, NextFunction, Request, Response } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import {
  DATE_INPUT_RE,
  PO_STATUSES,
  PO_TYPES,
  SettingsSchema,
  StyleFormSchema,
  incrementPoNumber,
} from "../shared/po";
import {
  HttpError,
  bulkCreateStyles,
  createPurchaseOrder,
  createStyle,
  deletePurchaseOrder,
  deleteStyle,
  exportBackup,
  getPurchaseOrder,
  getSettings,
  listAddresses,
  listDeletedPurchaseOrders,
  listPurchaseOrders,
  listRevisions,
  listStyles,
  poNumberExists,
  recoverDeletedPurchaseOrder,
  saveSettings,
  setArchived,
  setPurchaseOrderStatus,
  suggestNextPoNumber,
  updatePurchaseOrder,
  updateStyle,
  type ArchivedFilter,
  type POWriteInput,
} from "./storage";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

type Handler = (req: Request, res: Response) => Promise<unknown>;

/** Wraps an async handler: HttpErrors and validation errors become clean JSON responses. */
function route(handler: Handler) {
  return async (req: Request, res: Response, _next: NextFunction) => {
    try {
      await handler(req, res);
    } catch (error) {
      if (error instanceof HttpError) {
        return res.status(error.status).json({ error: error.message, message: error.message });
      }
      if (error instanceof z.ZodError) {
        const first = error.issues[0];
        const where = first?.path?.length ? `${first.path.join(".")}: ` : "";
        const message = `${where}${first?.message ?? "Invalid request"}`;
        return res.status(400).json({ error: message, message, issues: error.issues });
      }
      console.error(`${req.method} ${req.path} failed:`, error);
      const message = error instanceof Error ? error.message : "Unknown error";
      return res.status(500).json({ error: "Something went wrong", message });
    }
  };
}

function idParam(req: Request): number {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) throw new HttpError(400, "Invalid id");
  return id;
}

/**
 * Accepts `yyyy-MM-dd` (new UI; stored at 12:00 UTC so the calendar day is stable across US
 * time zones) or any ISO timestamp (older clients).
 */
const dateField = z.union([z.string(), z.date()]).transform((value, ctx) => {
  const d =
    typeof value === "string" && DATE_INPUT_RE.test(value)
      ? new Date(`${value}T12:00:00.000Z`)
      : new Date(value);
  if (Number.isNaN(d.getTime())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid date" });
    return z.NEVER;
  }
  return d;
});

const numberField = z.union([z.number(), z.string()]).transform((value, ctx) => {
  const n = typeof value === "number" ? value : Number(String(value).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Must be a number" });
    return z.NEVER;
  }
  return n;
});

const itemSchema = z.object({
  styleId: z.union([z.number(), z.null()]).optional().transform((v) => (v && v > 0 ? v : null)),
  manualStyleNumber: z.string().optional().default(""),
  styleNumber: z.string().optional(),
  color: z.string().optional().default(""),
  description: z.string().optional().default(""),
  quantity: numberField.refine((n) => n > 0, "Quantity must be more than 0"),
  price: numberField.refine((n) => n >= 0, "Price can't be negative"),
});

const poWriteSchema = z
  .object({
    poNumber: z.string().trim().min(1, "PO number is required").max(64),
    poType: z.string().trim().min(1).default("Regular PO"),
    status: z.enum(PO_STATUSES).optional(),
    terms: z.string().trim().min(1).default("Net 30"),
    orderDate: dateField,
    startShipDate: dateField,
    cancelDate: dateField,
    shipTo: z.string().trim().min(1, "Ship To address is required"),
    billTo: z.string().trim().min(1, "Bill To address is required"),
    specialInstructions: z.string().optional().default(""),
    notes: z.string().optional().default(""),
    items: z.array(itemSchema).min(1, "Add at least one line item"),
  })
  .transform((v) => ({
    ...v,
    items: v.items.map((i) => ({
      styleId: i.styleId,
      manualStyleNumber: (i.manualStyleNumber || i.styleNumber || "").trim(),
      color: i.color,
      description: i.description,
      quantity: i.quantity,
      price: i.price,
    })),
  }));

function parsePoWrite(body: unknown, fallbackStatus: POWriteInput["status"]): POWriteInput {
  const v = poWriteSchema.parse(body);
  if (!(PO_TYPES as readonly string[]).includes(v.poType)) {
    throw new HttpError(400, `PO type must be one of: ${PO_TYPES.join(", ")}`);
  }
  if (v.items.some((i) => !i.manualStyleNumber && !i.styleId)) {
    throw new HttpError(400, "Every line item needs a style number");
  }
  return { ...v, status: v.status ?? fallbackStatus };
}

function archivedFilter(value: unknown): ArchivedFilter {
  return value === "only" || value === "include" ? value : "exclude";
}

function pickColumn(record: Record<string, string>, candidates: string[]): string {
  const normalized = (s: string) => s.toLowerCase().replace(/[^a-z0-9#]/g, "");
  const wanted = candidates.map(normalized);
  const key = Object.keys(record).find((k) => wanted.includes(normalized(k)));
  return key ? String(record[key] ?? "").trim() : "";
}

export function registerRoutes(app: Express): Server {
  const httpServer = createServer(app);

  // -------------------------------------------------------------------------
  // Styles
  // -------------------------------------------------------------------------

  app.get("/api/styles", route(async (_req, res) => {
    res.json(await listStyles());
  }));

  app.post("/api/styles", route(async (req, res) => {
    const input = StyleFormSchema.parse({
      styleNumber: req.body?.styleNumber ?? "",
      color: req.body?.color ?? "",
      description: req.body?.description ?? "",
    });
    res.status(201).json(await createStyle(input));
  }));

  app.post("/api/styles/bulk", route(async (req, res) => {
    const records = z
      .array(z.object({
        styleNumber: z.string(),
        color: z.string().optional().default(""),
        description: z.string().optional().default(""),
      }))
      .max(10000)
      .parse(req.body?.styles ?? []);
    const result = await bulkCreateStyles(records);
    res.json({
      ...result,
      message: `Added ${result.created} style${result.created === 1 ? "" : "s"}${result.skipped ? `, skipped ${result.skipped} duplicate or blank` : ""}.`,
    });
  }));

  app.post("/api/styles/import", upload.single("file"), route(async (req, res) => {
    if (!req.file) throw new HttpError(400, "No file uploaded");
    let rows: Record<string, string>[];
    try {
      rows = parse(req.file.buffer.toString("utf8").replace(/^﻿/, ""), {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      });
    } catch (error) {
      throw new HttpError(400, `Could not read that CSV file: ${error instanceof Error ? error.message : "unknown error"}`);
    }
    const records = rows
      .map((row) => ({
        styleNumber: pickColumn(row, ["style_number", "style number", "style #", "style no", "style", "stylenumber"]),
        color: pickColumn(row, ["color", "colour"]),
        description: pickColumn(row, ["description", "desc"]),
      }))
      .filter((r) => r.styleNumber);
    if (records.length === 0) {
      throw new HttpError(400, 'No style numbers found. Make sure the CSV has a "style_number" column.');
    }
    const result = await bulkCreateStyles(records);
    res.json({
      ...result,
      message: `Imported ${result.created} style${result.created === 1 ? "" : "s"}${result.skipped ? `, skipped ${result.skipped} already in the catalog` : ""}.`,
    });
  }));

  app.put("/api/styles/:id", route(async (req, res) => {
    const input = StyleFormSchema.parse({
      styleNumber: req.body?.styleNumber ?? "",
      color: req.body?.color ?? "",
      description: req.body?.description ?? "",
    });
    res.json(await updateStyle(idParam(req), input));
  }));

  app.delete("/api/styles/:id", route(async (req, res) => {
    await deleteStyle(idParam(req));
    res.json({ success: true });
  }));

  // -------------------------------------------------------------------------
  // Purchase orders
  // -------------------------------------------------------------------------

  app.get("/api/purchase-orders", route(async (req, res) => {
    res.json(await listPurchaseOrders(archivedFilter(req.query.archived)));
  }));

  app.get("/api/purchase-orders/next-number", route(async (_req, res) => {
    res.json({ poNumber: await suggestNextPoNumber(incrementPoNumber) });
  }));

  app.get("/api/purchase-orders/check/:poNumber", route(async (req, res) => {
    const excludeId = req.query.excludeId ? Number(req.query.excludeId) : undefined;
    res.json({ exists: await poNumberExists(req.params.poNumber, excludeId) });
  }));

  app.get("/api/purchase-orders/:id", route(async (req, res) => {
    const po = await getPurchaseOrder(idParam(req));
    if (!po) throw new HttpError(404, "Purchase order not found");
    res.json(po);
  }));

  app.get("/api/purchase-orders/:id/revisions", route(async (req, res) => {
    res.json(await listRevisions(idParam(req)));
  }));

  app.post("/api/purchase-orders", route(async (req, res) => {
    res.status(201).json(await createPurchaseOrder(parsePoWrite(req.body, "open")));
  }));

  app.put("/api/purchase-orders/:id", route(async (req, res) => {
    const id = idParam(req);
    const current = await getPurchaseOrder(id);
    if (!current) throw new HttpError(404, "Purchase order not found");
    res.json(await updatePurchaseOrder(id, parsePoWrite(req.body, current.status)));
  }));

  app.patch("/api/purchase-orders/:id/status", route(async (req, res) => {
    const { status } = z.object({ status: z.enum(PO_STATUSES) }).parse(req.body);
    res.json(await setPurchaseOrderStatus(idParam(req), status));
  }));

  app.post("/api/purchase-orders/:id/archive", route(async (req, res) => {
    res.json(await setArchived(idParam(req), true));
  }));

  app.post("/api/purchase-orders/:id/restore", route(async (req, res) => {
    res.json(await setArchived(idParam(req), false));
  }));

  // Permanent delete — only allowed for archived POs; a recoverable snapshot is kept.
  app.delete("/api/purchase-orders/:id", route(async (req, res) => {
    await deletePurchaseOrder(idParam(req));
    res.json({ success: true });
  }));

  app.get("/api/deleted-purchase-orders", route(async (_req, res) => {
    res.json(await listDeletedPurchaseOrders());
  }));

  app.post("/api/deleted-purchase-orders/:id/recover", route(async (req, res) => {
    res.json(await recoverDeletedPurchaseOrder(idParam(req)));
  }));

  // -------------------------------------------------------------------------
  // Addresses, settings, backup
  // -------------------------------------------------------------------------

  app.get("/api/addresses", route(async (_req, res) => {
    res.json(await listAddresses());
  }));

  app.get("/api/settings", route(async (_req, res) => {
    res.json(await getSettings());
  }));

  app.put("/api/settings", route(async (req, res) => {
    res.json(await saveSettings(SettingsSchema.parse(req.body)));
  }));

  app.get("/api/backup", route(async (_req, res) => {
    const backup = await exportBackup();
    const stamp = backup.exportedAt.slice(0, 10);
    res.setHeader("Content-Disposition", `attachment; filename="po-master-backup-${stamp}.json"`);
    res.setHeader("Content-Type", "application/json");
    res.send(JSON.stringify(backup, null, 2));
  }));

  app.all("/api/*", (_req, res) => {
    res.status(404).json({ error: "Not found", message: "Not found" });
  });

  return httpServer;
}
