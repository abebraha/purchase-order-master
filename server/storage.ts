import { db } from "@db";
import {
  styles,
  purchaseOrders,
  poItems,
  poRevisions,
  appSettings,
  type PurchaseOrderRow,
} from "@db/schema";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import {
  DEFAULT_SETTINGS,
  PO_STATUSES,
  REVISION_ACTION_LABELS,
  SettingsSchema,
  computeTotals,
  describeChanges,
  type AddressBook,
  type AppSettings,
  type DeletedPurchaseOrder,
  type POItem,
  type POStatus,
  type PORevision,
  type PurchaseOrder,
  type RevisionAction,
  type StyleRecord,
} from "../shared/po";

/** Encode a value as a real JSONB object (drizzle 0.29 + postgres-js would otherwise store a JSON string). */
function jsonb(value: unknown) {
  return sql`${JSON.stringify(value)}::text::jsonb`;
}

// Drizzle transaction handle or the root db — both expose the same query API.
type Executor = Pick<typeof db, "select" | "insert" | "update" | "delete" | "execute">;

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function toISO(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function normalizeStatus(status: string | null | undefined): POStatus {
  return (PO_STATUSES as readonly string[]).includes(status ?? "") ? (status as POStatus) : "open";
}

// ---------------------------------------------------------------------------
// Purchase orders
// ---------------------------------------------------------------------------

type ItemRow = {
  id: number;
  poId: number | null;
  styleId: number | null;
  manualStyleNumber: string | null;
  color: string;
  description: string;
  quantity: string;
  price: string;
  linkedStyleNumber: string | null;
};

async function loadItems(ex: Executor, poIds: number[]): Promise<Map<number, POItem[]>> {
  const byPo = new Map<number, POItem[]>();
  if (poIds.length === 0) return byPo;
  const rows: ItemRow[] = await ex
    .select({
      id: poItems.id,
      poId: poItems.poId,
      styleId: poItems.styleId,
      manualStyleNumber: poItems.manualStyleNumber,
      color: poItems.color,
      description: poItems.description,
      quantity: poItems.quantity,
      price: poItems.price,
      linkedStyleNumber: styles.styleNumber,
    })
    .from(poItems)
    .leftJoin(styles, eq(poItems.styleId, styles.id))
    .where(inArray(poItems.poId, poIds))
    .orderBy(asc(poItems.id));

  for (const row of rows) {
    if (row.poId === null) continue;
    const manual = (row.manualStyleNumber ?? "").trim();
    const item: POItem = {
      id: row.id,
      styleId: row.styleId && row.styleId > 0 ? row.styleId : null,
      manualStyleNumber: row.manualStyleNumber ?? "",
      styleNumber: manual || row.linkedStyleNumber || "",
      color: row.color ?? "",
      description: row.description ?? "",
      quantity: Number(row.quantity) || 0,
      price: Number(row.price) || 0,
    };
    const list = byPo.get(row.poId) ?? [];
    list.push(item);
    byPo.set(row.poId, list);
  }
  return byPo;
}

function toPurchaseOrder(row: PurchaseOrderRow, items: POItem[]): PurchaseOrder {
  return {
    id: row.id,
    poNumber: row.poNumber,
    poType: row.poType,
    status: normalizeStatus(row.status),
    orderDate: toISO(row.orderDate)!,
    startShipDate: toISO(row.startShipDate)!,
    cancelDate: toISO(row.cancelDate)!,
    dueDate: toISO(row.dueDate)!,
    terms: row.terms,
    shipTo: row.shipTo,
    billTo: row.billTo,
    specialInstructions: row.specialInstructions ?? "",
    notes: row.notes ?? "",
    createdAt: toISO(row.createdAt)!,
    updatedAt: toISO(row.updatedAt),
    archivedAt: toISO(row.archivedAt),
    items,
    ...computeTotals(items),
  };
}

export type ArchivedFilter = "exclude" | "only" | "include";

export async function listPurchaseOrders(archived: ArchivedFilter = "exclude"): Promise<PurchaseOrder[]> {
  const where =
    archived === "only"
      ? isNotNull(purchaseOrders.archivedAt)
      : archived === "exclude"
        ? isNull(purchaseOrders.archivedAt)
        : undefined;
  const rows = await db
    .select()
    .from(purchaseOrders)
    .where(where)
    .orderBy(desc(purchaseOrders.createdAt), desc(purchaseOrders.id));
  const items = await loadItems(db, rows.map((r) => r.id));
  return rows.map((r) => toPurchaseOrder(r, items.get(r.id) ?? []));
}

export async function getPurchaseOrder(id: number, ex: Executor = db): Promise<PurchaseOrder | null> {
  const [row] = await ex.select().from(purchaseOrders).where(eq(purchaseOrders.id, id));
  if (!row) return null;
  const items = await loadItems(ex, [id]);
  return toPurchaseOrder(row, items.get(id) ?? []);
}

async function requirePurchaseOrder(id: number, ex: Executor = db): Promise<PurchaseOrder> {
  const po = await getPurchaseOrder(id, ex);
  if (!po) throw new HttpError(404, "Purchase order not found");
  return po;
}

export async function poNumberExists(poNumber: string, excludeId?: number): Promise<boolean> {
  const rows = await db
    .select({ id: purchaseOrders.id })
    .from(purchaseOrders)
    .where(sql`lower(${purchaseOrders.poNumber}) = lower(${poNumber.trim()})`);
  return rows.some((r) => r.id !== excludeId);
}

export async function suggestNextPoNumber(increment: (last: string) => string): Promise<string> {
  const [latest] = await db
    .select({ poNumber: purchaseOrders.poNumber })
    .from(purchaseOrders)
    .orderBy(desc(purchaseOrders.createdAt), desc(purchaseOrders.id))
    .limit(1);
  let candidate = increment(latest?.poNumber ?? "1000");
  for (let i = 0; i < 500 && (await poNumberExists(candidate)); i++) {
    candidate = increment(candidate);
  }
  return candidate;
}

async function recordRevision(
  ex: Executor,
  po: PurchaseOrder,
  action: RevisionAction,
  summary: string,
  at?: Date,
) {
  await ex.insert(poRevisions).values({
    poId: po.id,
    poNumber: po.poNumber,
    action,
    summary,
    snapshot: jsonb(po),
    ...(at ? { createdAt: at } : {}),
  });
}

export interface POWriteInput {
  poNumber: string;
  poType: string;
  status: POStatus;
  terms: string;
  orderDate: Date;
  startShipDate: Date;
  cancelDate: Date;
  shipTo: string;
  billTo: string;
  specialInstructions: string;
  notes: string;
  items: Array<{
    styleId: number | null;
    manualStyleNumber: string;
    color: string;
    description: string;
    quantity: number;
    price: number;
  }>;
}

function itemValues(poId: number, items: POWriteInput["items"]) {
  return items.map((item) => ({
    poId,
    styleId: item.styleId && item.styleId > 0 ? item.styleId : null,
    manualStyleNumber: item.manualStyleNumber.trim(),
    color: item.color.trim(),
    description: item.description.trim(),
    quantity: String(item.quantity),
    price: String(item.price),
  }));
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "23505";
}

export async function createPurchaseOrder(input: POWriteInput): Promise<PurchaseOrder> {
  if (await poNumberExists(input.poNumber)) {
    throw new HttpError(409, `PO #${input.poNumber} already exists. Please use a different number.`);
  }
  try {
    return await db.transaction(async (tx) => {
      const now = new Date();
      const [row] = await tx
        .insert(purchaseOrders)
        .values({
          poNumber: input.poNumber.trim(),
          poType: input.poType,
          status: input.status,
          terms: input.terms.trim(),
          orderDate: input.orderDate,
          startShipDate: input.startShipDate,
          cancelDate: input.cancelDate,
          // Legacy NOT NULL column; kept in sync with the cancel date as before.
          dueDate: input.cancelDate,
          shipTo: input.shipTo.trim(),
          billTo: input.billTo.trim(),
          specialInstructions: input.specialInstructions.trim(),
          notes: input.notes.trim(),
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      await tx.insert(poItems).values(itemValues(row.id, input.items));
      const po = await requirePurchaseOrder(row.id, tx);
      await recordRevision(
        tx,
        po,
        "created",
        `Created with ${po.itemCount} line${po.itemCount === 1 ? "" : "s"} · ${po.totalQuantity.toLocaleString("en-US")} units · $${po.totalAmount.toFixed(2)}`,
      );
      return po;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new HttpError(409, `PO #${input.poNumber} already exists. Please use a different number.`);
    }
    throw error;
  }
}

export async function updatePurchaseOrder(id: number, input: POWriteInput): Promise<PurchaseOrder> {
  const before = await requirePurchaseOrder(id);
  if (before.poNumber.toLowerCase() !== input.poNumber.trim().toLowerCase() && (await poNumberExists(input.poNumber, id))) {
    throw new HttpError(409, `PO #${input.poNumber} already exists. Please use a different number.`);
  }
  try {
    return await db.transaction(async (tx) => {
      await tx
        .update(purchaseOrders)
        .set({
          poNumber: input.poNumber.trim(),
          poType: input.poType,
          status: input.status,
          terms: input.terms.trim(),
          orderDate: input.orderDate,
          startShipDate: input.startShipDate,
          cancelDate: input.cancelDate,
          // due_date is intentionally left as saved (no longer edited in the UI).
          shipTo: input.shipTo.trim(),
          billTo: input.billTo.trim(),
          specialInstructions: input.specialInstructions.trim(),
          notes: input.notes.trim(),
          updatedAt: new Date(),
        })
        .where(eq(purchaseOrders.id, id));
      // Line items are replaced wholesale; the previous version is preserved in po_revisions.
      await tx.delete(poItems).where(eq(poItems.poId, id));
      await tx.insert(poItems).values(itemValues(id, input.items));
      const after = await requirePurchaseOrder(id, tx);
      const changes = describeChanges(before, after);
      await recordRevision(tx, after, "updated", changes.length ? changes.join("; ") : "Saved with no changes");
      return after;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new HttpError(409, `PO #${input.poNumber} already exists. Please use a different number.`);
    }
    throw error;
  }
}

export async function setPurchaseOrderStatus(id: number, status: POStatus): Promise<PurchaseOrder> {
  return db.transaction(async (tx) => {
    const before = await requirePurchaseOrder(id, tx);
    if (before.status === status) return before;
    await tx
      .update(purchaseOrders)
      .set({ status, updatedAt: new Date() })
      .where(eq(purchaseOrders.id, id));
    const after = await requirePurchaseOrder(id, tx);
    await recordRevision(tx, after, "status", describeChanges(before, after).join("; "));
    return after;
  });
}

export async function setArchived(id: number, archived: boolean): Promise<PurchaseOrder> {
  return db.transaction(async (tx) => {
    const before = await requirePurchaseOrder(id, tx);
    if (Boolean(before.archivedAt) === archived) return before;
    await tx
      .update(purchaseOrders)
      .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
      .where(eq(purchaseOrders.id, id));
    const after = await requirePurchaseOrder(id, tx);
    await recordRevision(
      tx,
      after,
      archived ? "archived" : "restored",
      archived ? "Moved to archive" : "Restored from archive",
    );
    return after;
  });
}

/** Permanently deletes an archived PO. A full snapshot is kept in po_revisions so it can be recovered. */
export async function deletePurchaseOrder(id: number): Promise<void> {
  await db.transaction(async (tx) => {
    const po = await requirePurchaseOrder(id, tx);
    if (!po.archivedAt) {
      throw new HttpError(409, "Archive this purchase order before deleting it permanently.");
    }
    await recordRevision(tx, po, "deleted", "Permanently deleted (snapshot kept for recovery)");
    await tx.delete(poItems).where(eq(poItems.poId, id));
    await tx.delete(purchaseOrders).where(eq(purchaseOrders.id, id));
  });
}

export async function listRevisions(poId: number): Promise<PORevision[]> {
  const rows = await db
    .select()
    .from(poRevisions)
    .where(eq(poRevisions.poId, poId))
    .orderBy(desc(poRevisions.createdAt), desc(poRevisions.id));
  return rows.map((r) => ({
    id: r.id,
    poId: r.poId,
    poNumber: r.poNumber,
    action: (r.action in REVISION_ACTION_LABELS ? r.action : "updated") as RevisionAction,
    summary: r.summary,
    snapshot: r.snapshot as PurchaseOrder,
    createdAt: toISO(r.createdAt)!,
  }));
}

export async function listDeletedPurchaseOrders(): Promise<DeletedPurchaseOrder[]> {
  const rows = await db
    .select()
    .from(poRevisions)
    .where(
      and(
        eq(poRevisions.action, "deleted"),
        sql`NOT EXISTS (SELECT 1 FROM ${purchaseOrders} WHERE ${purchaseOrders.id} = ${poRevisions.poId})`,
      ),
    )
    .orderBy(desc(poRevisions.createdAt), desc(poRevisions.id));
  // Only the latest deletion per PO id.
  const seen = new Set<number>();
  const result: DeletedPurchaseOrder[] = [];
  for (const r of rows) {
    if (seen.has(r.poId)) continue;
    seen.add(r.poId);
    result.push({
      revisionId: r.id,
      poId: r.poId,
      poNumber: r.poNumber,
      deletedAt: toISO(r.createdAt)!,
      snapshot: r.snapshot as PurchaseOrder,
    });
  }
  return result;
}

/** Re-creates a permanently deleted PO from its snapshot, under its original id. */
export async function recoverDeletedPurchaseOrder(revisionId: number): Promise<PurchaseOrder> {
  const [rev] = await db.select().from(poRevisions).where(eq(poRevisions.id, revisionId));
  if (!rev || rev.action !== "deleted") throw new HttpError(404, "Deleted purchase order not found");
  const snap = rev.snapshot as PurchaseOrder;
  if (await getPurchaseOrder(rev.poId)) throw new HttpError(409, "This purchase order already exists.");
  if (await poNumberExists(snap.poNumber)) {
    throw new HttpError(409, `PO #${snap.poNumber} is already used by another purchase order.`);
  }
  return db.transaction(async (tx) => {
    const date = (v: string | null | undefined, fallback: Date) => (v ? new Date(v) : fallback);
    const now = new Date();
    await tx.insert(purchaseOrders).values({
      id: rev.poId,
      poNumber: snap.poNumber,
      poType: snap.poType,
      status: normalizeStatus(snap.status),
      terms: snap.terms,
      orderDate: date(snap.orderDate, now),
      startShipDate: date(snap.startShipDate, now),
      cancelDate: date(snap.cancelDate, now),
      dueDate: date(snap.dueDate ?? snap.cancelDate, now),
      shipTo: snap.shipTo,
      billTo: snap.billTo,
      specialInstructions: snap.specialInstructions ?? "",
      notes: snap.notes ?? "",
      createdAt: date(snap.createdAt, now),
      updatedAt: now,
      archivedAt: null,
    });
    if (snap.items?.length) {
      await tx.insert(poItems).values(
        itemValues(
          rev.poId,
          snap.items.map((i) => ({
            styleId: i.styleId,
            manualStyleNumber: i.manualStyleNumber || i.styleNumber || "",
            color: i.color ?? "",
            description: i.description ?? "",
            quantity: Number(i.quantity) || 0,
            price: Number(i.price) || 0,
          })),
        ),
      );
    }
    const po = await requirePurchaseOrder(rev.poId, tx);
    await recordRevision(tx, po, "recovered", "Recovered from a deleted snapshot");
    return po;
  });
}

/**
 * One-time safety net: store a JSON snapshot of every existing PO that has no history yet.
 * Purely additive (inserts into po_revisions only); safe to run on every startup.
 */
export async function ensureBaselineRevisions(): Promise<number> {
  const missing = await db
    .select({ id: purchaseOrders.id })
    .from(purchaseOrders)
    .where(sql`NOT EXISTS (SELECT 1 FROM ${poRevisions} WHERE ${poRevisions.poId} = ${purchaseOrders.id})`);
  let count = 0;
  for (const { id } of missing) {
    const po = await getPurchaseOrder(id);
    if (!po) continue;
    await recordRevision(db, po, "baseline", "Existing purchase order saved to history", new Date(po.updatedAt ?? po.createdAt));
    count++;
  }
  return count;
}

export async function listAddresses(): Promise<AddressBook> {
  const rows = await db
    .select({
      shipTo: purchaseOrders.shipTo,
      billTo: purchaseOrders.billTo,
      createdAt: purchaseOrders.createdAt,
    })
    .from(purchaseOrders)
    .orderBy(desc(purchaseOrders.createdAt));

  const collect = (key: "shipTo" | "billTo") => {
    const map = new Map<string, { value: string; count: number; lastUsed: string }>();
    for (const row of rows) {
      const value = (row[key] ?? "").trim();
      if (!value) continue;
      const k = value.toLowerCase().replace(/\s+/g, " ");
      const existing = map.get(k);
      if (existing) existing.count++;
      else map.set(k, { value, count: 1, lastUsed: toISO(row.createdAt)! });
    }
    return Array.from(map.values());
  };
  return { shipTo: collect("shipTo"), billTo: collect("billTo") };
}

export async function exportBackup() {
  const [pos, items, styleRows, revisions, settings] = await Promise.all([
    db.select().from(purchaseOrders).orderBy(asc(purchaseOrders.id)),
    db.select().from(poItems).orderBy(asc(poItems.id)),
    db.select().from(styles).orderBy(asc(styles.id)),
    db.select().from(poRevisions).orderBy(asc(poRevisions.id)),
    db.select().from(appSettings),
  ]);
  return {
    app: "purchase-order-master",
    version: 1,
    exportedAt: new Date().toISOString(),
    counts: {
      purchaseOrders: pos.length,
      poItems: items.length,
      styles: styleRows.length,
      revisions: revisions.length,
    },
    tables: {
      purchase_orders: pos,
      po_items: items,
      styles: styleRows,
      po_revisions: revisions,
      app_settings: settings,
    },
  };
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

export async function listStyles(): Promise<StyleRecord[]> {
  const rows = await db
    .select({
      id: styles.id,
      styleNumber: styles.styleNumber,
      color: styles.color,
      description: styles.description,
      createdAt: styles.createdAt,
      updatedAt: styles.updatedAt,
      usageCount: sql<number>`(
        SELECT count(*)::int FROM ${poItems}
        WHERE ${poItems.styleId} = ${styles.id}
           OR lower(trim(coalesce(${poItems.manualStyleNumber}, ''))) = lower(${styles.styleNumber})
      )`,
    })
    .from(styles)
    .orderBy(asc(styles.styleNumber));
  return rows.map((r) => ({
    ...r,
    usageCount: Number(r.usageCount) || 0,
    createdAt: toISO(r.createdAt)!,
    updatedAt: toISO(r.updatedAt)!,
  }));
}

async function styleNumberTaken(styleNumber: string, excludeId?: number) {
  const rows = await db
    .select({ id: styles.id })
    .from(styles)
    .where(sql`lower(${styles.styleNumber}) = lower(${styleNumber.trim()})`);
  return rows.some((r) => r.id !== excludeId);
}

export async function createStyle(input: { styleNumber: string; color: string; description: string }) {
  if (await styleNumberTaken(input.styleNumber)) {
    throw new HttpError(409, `Style ${input.styleNumber} already exists.`);
  }
  try {
    const [row] = await db
      .insert(styles)
      .values({
        styleNumber: input.styleNumber.trim(),
        color: input.color.trim(),
        description: input.description.trim(),
      })
      .returning();
    return row;
  } catch (error) {
    if (isUniqueViolation(error)) throw new HttpError(409, `Style ${input.styleNumber} already exists.`);
    throw error;
  }
}

export async function updateStyle(id: number, input: { styleNumber: string; color: string; description: string }) {
  if (await styleNumberTaken(input.styleNumber, id)) {
    throw new HttpError(409, `Style ${input.styleNumber} already exists.`);
  }
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(styles).where(eq(styles.id, id));
    if (!existing) throw new HttpError(404, "Style not found");
    // Existing PO lines keep the style number they were ordered with.
    await tx.execute(sql`
      UPDATE ${poItems} SET manual_style_number = ${existing.styleNumber}
      WHERE ${poItems.styleId} = ${id} AND coalesce(trim(${poItems.manualStyleNumber}), '') = ''
    `);
    const [row] = await tx
      .update(styles)
      .set({
        styleNumber: input.styleNumber.trim(),
        color: input.color.trim(),
        description: input.description.trim(),
        updatedAt: new Date(),
      })
      .where(eq(styles.id, id))
      .returning();
    return row;
  });
}

/** Deletes a style from the catalog. PO lines that used it keep their style number. */
export async function deleteStyle(id: number) {
  await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(styles).where(eq(styles.id, id));
    if (!existing) throw new HttpError(404, "Style not found");
    await tx.execute(sql`
      UPDATE ${poItems} SET manual_style_number = ${existing.styleNumber}
      WHERE ${poItems.styleId} = ${id} AND coalesce(trim(${poItems.manualStyleNumber}), '') = ''
    `);
    await tx.delete(styles).where(eq(styles.id, id));
  });
}

export async function bulkCreateStyles(
  records: Array<{ styleNumber: string; color: string; description: string }>,
): Promise<{ created: number; skipped: number }> {
  const seen = new Set<string>();
  const unique = records
    .map((r) => ({
      styleNumber: r.styleNumber.trim(),
      color: (r.color ?? "").trim(),
      description: (r.description ?? "").trim(),
    }))
    .filter((r) => {
      const k = r.styleNumber.toLowerCase();
      if (!r.styleNumber || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  const existing = await db.select({ styleNumber: styles.styleNumber }).from(styles);
  const existingKeys = new Set(existing.map((s) => s.styleNumber.toLowerCase()));
  const toInsert = unique.filter((r) => !existingKeys.has(r.styleNumber.toLowerCase()));
  let created = 0;
  for (let i = 0; i < toInsert.length; i += 500) {
    const chunk = toInsert.slice(i, i + 500);
    const inserted = await db
      .insert(styles)
      .values(chunk)
      .onConflictDoNothing({ target: styles.styleNumber })
      .returning({ id: styles.id });
    created += inserted.length;
  }
  return { created, skipped: records.length - created };
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const SETTINGS_KEY = "app";

function mergeSettings(value: unknown): AppSettings {
  const v = (value ?? {}) as Partial<AppSettings>;
  const merged: AppSettings = {
    company: { ...DEFAULT_SETTINGS.company, ...(v.company ?? {}) },
    defaults: { ...DEFAULT_SETTINGS.defaults, ...(v.defaults ?? {}) },
    documentFooter: v.documentFooter ?? DEFAULT_SETTINGS.documentFooter,
  };
  const parsed = SettingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

export async function getSettings(): Promise<AppSettings> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, SETTINGS_KEY));
  return mergeSettings(row?.value);
}

export async function saveSettings(settings: AppSettings): Promise<AppSettings> {
  await db
    .insert(appSettings)
    .values({ key: SETTINGS_KEY, value: jsonb(settings), updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: jsonb(settings), updatedAt: new Date() } });
  return getSettings();
}
