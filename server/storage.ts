import { createHash } from "crypto";
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
  PO_STATUS_LABELS,
  REVISION_ACTION_LABELS,
  STYLE_NUMBER_MAX_LENGTH,
  SettingsSchema,
  computeTotals,
  describeChanges,
  formatUsd,
  type AddressBook,
  type AppSettings,
  type DeletedPurchaseOrder,
  type POItem,
  type POStatus,
  type PORevision,
  type PurchaseOrder,
  type RevisionAction,
  type StyleRecord,
  type StyleSuggestion,
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

/**
 * Fingerprint of everything a person can change on a PO (not derived/computed fields).
 * Works for live rows and for stored snapshots alike, so it also detects edits made outside
 * this server (e.g. the old app during a deploy, or a manual SQL fix).
 */
function contentVersion(po: Omit<PurchaseOrder, "version">): string {
  const content = [
    po.poNumber, po.poType, po.status, po.orderDate, po.startShipDate, po.cancelDate, po.dueDate ?? null,
    po.terms, po.shipTo, po.billTo, po.specialInstructions ?? "", po.notes ?? "", po.archivedAt ?? null,
    (po.items ?? []).map((i) => [
      i.styleId ?? null, i.manualStyleNumber ?? "", i.color ?? "", i.description ?? "", Number(i.quantity) || 0, Number(i.price) || 0,
    ]),
  ];
  return createHash("sha1").update(JSON.stringify(content)).digest("hex").slice(0, 16);
}

function toPurchaseOrder(row: PurchaseOrderRow, items: POItem[], needsReview = false): PurchaseOrder {
  const po: Omit<PurchaseOrder, "version"> = {
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
    needsReview,
    items,
    ...computeTotals(items),
  };
  return { ...po, version: contentVersion(po) };
}

/** Row-locks a PO for the rest of the transaction so concurrent writes can't interleave. */
async function lockPurchaseOrder(tx: Executor, id: number) {
  await tx.select({ id: purchaseOrders.id }).from(purchaseOrders).where(eq(purchaseOrders.id, id)).for("update");
}

/**
 * If the PO was changed without going through this server (so no history entry was written),
 * save its current state to history before anything else changes it.
 */
async function captureExternalChanges(ex: Executor, po: PurchaseOrder): Promise<boolean> {
  const [latest] = await ex
    .select({ snapshot: poRevisions.snapshot })
    .from(poRevisions)
    .where(eq(poRevisions.poId, po.id))
    .orderBy(desc(poRevisions.id))
    .limit(1);
  if (latest && contentVersion(latest.snapshot as PurchaseOrder) === po.version) return false;
  await recordRevision(
    ex,
    po,
    latest ? "external" : "baseline",
    latest ? "Changes made outside PO Master were saved to history" : "Existing purchase order saved to history",
  );
  return true;
}

export const CONFLICT_MESSAGE =
  "This purchase order was changed somewhere else (another device or screen) after you opened it.";

/**
 * POs that only have the "baseline" history entry (they predate status tracking) and haven't
 * been edited or given a status since.
 */
async function loadNeedsReview(ex: Executor, poIds: number[]): Promise<Set<number>> {
  const result = new Set<number>();
  if (poIds.length === 0) return result;
  const rows = await ex
    .select({
      poId: poRevisions.poId,
      baseline: sql<boolean>`bool_or(${poRevisions.action} = 'baseline')`,
      reviewed: sql<boolean>`bool_or(${poRevisions.action} in ('created', 'updated', 'status', 'recovered'))`,
    })
    .from(poRevisions)
    .where(inArray(poRevisions.poId, poIds))
    .groupBy(poRevisions.poId);
  for (const r of rows) if (r.baseline && !r.reviewed) result.add(r.poId);
  return result;
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
  const ids = rows.map((r) => r.id);
  const [items, review] = await Promise.all([loadItems(db, ids), loadNeedsReview(db, ids)]);
  return rows.map((r) => toPurchaseOrder(r, items.get(r.id) ?? [], review.has(r.id)));
}

export async function getPurchaseOrder(id: number, ex: Executor = db): Promise<PurchaseOrder | null> {
  const [row] = await ex.select().from(purchaseOrders).where(eq(purchaseOrders.id, id));
  if (!row) return null;
  const [items, review] = await Promise.all([loadItems(ex, [id]), loadNeedsReview(ex, [id])]);
  return toPurchaseOrder(row, items.get(id) ?? [], review.has(id));
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

/** PO numbers of deleted POs (kept so they can be recovered without a number clash). */
async function deletedPoNumbers(): Promise<Set<string>> {
  const rows = await db
    .select({ poNumber: poRevisions.poNumber })
    .from(poRevisions)
    .where(
      and(
        eq(poRevisions.action, "deleted"),
        sql`NOT EXISTS (SELECT 1 FROM purchase_orders p WHERE p.id = "po_revisions"."po_id")`,
      ),
    );
  return new Set(rows.map((r) => r.poNumber.trim().toLowerCase()));
}

export async function suggestNextPoNumber(increment: (last: string) => string): Promise<string> {
  // Continue the highest plain-number PO (e.g. 3013 → 3014) so one oddly named PO ("SAMPLE-A")
  // doesn't derail the sequence; if there are none, continue the most recent PO's pattern.
  const [highestNumeric] = await db
    .select({ poNumber: purchaseOrders.poNumber })
    .from(purchaseOrders)
    .where(sql`${purchaseOrders.poNumber} ~ '^[0-9]{1,15}$'`)
    .orderBy(sql`${purchaseOrders.poNumber}::bigint desc`)
    .limit(1);
  const [latest] = highestNumeric
    ? [highestNumeric]
    : await db
        .select({ poNumber: purchaseOrders.poNumber })
        .from(purchaseOrders)
        .orderBy(desc(purchaseOrders.createdAt), desc(purchaseOrders.id))
        .limit(1);
  const deleted = await deletedPoNumbers();
  let candidate = increment(latest?.poNumber ?? "1000");
  for (let i = 0; i < 500 && (deleted.has(candidate.toLowerCase()) || (await poNumberExists(candidate))); i++) {
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
      if (input.items.length) await tx.insert(poItems).values(itemValues(row.id, input.items));
      const po = await requirePurchaseOrder(row.id, tx);
      await recordRevision(
        tx,
        po,
        "created",
        `Created with ${po.itemCount} line${po.itemCount === 1 ? "" : "s"} · ${po.totalQuantity.toLocaleString("en-US")} units · ${formatUsd(po.totalAmount)}`,
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

export async function updatePurchaseOrder(
  id: number,
  input: POWriteInput,
  expectedVersion?: string,
): Promise<PurchaseOrder> {
  if (await poNumberExists(input.poNumber, id)) {
    throw new HttpError(409, `PO #${input.poNumber} already exists. Please use a different number.`);
  }
  try {
    return await db.transaction(async (tx) => {
      await lockPurchaseOrder(tx, id);
      const before = await requirePurchaseOrder(id, tx);
      if (expectedVersion && expectedVersion !== before.version) throw new HttpError(412, CONFLICT_MESSAGE);
      await captureExternalChanges(tx, before);
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
      if (input.items.length) await tx.insert(poItems).values(itemValues(id, input.items));
      const after = await requirePurchaseOrder(id, tx);
      // A save that changed nothing (e.g. the same form submitted from two tabs) adds no history.
      if (after.version === before.version) return after;
      const changes = describeChanges(before, after);
      await recordRevision(tx, after, "updated", changes.length ? changes.join("; ") : "Updated");
      return { ...after, needsReview: false }; // the entry just recorded counts as a review
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new HttpError(409, `PO #${input.poNumber} already exists. Please use a different number.`);
    }
    throw error;
  }
}

export async function setPurchaseOrderStatus(
  id: number,
  status: POStatus,
  check?: (po: PurchaseOrder) => void,
): Promise<PurchaseOrder> {
  return db.transaction(async (tx) => {
    await lockPurchaseOrder(tx, id);
    const before = await requirePurchaseOrder(id, tx);
    if (before.status === status) return before;
    check?.(before);
    await captureExternalChanges(tx, before);
    await tx
      .update(purchaseOrders)
      .set({ status, updatedAt: new Date() })
      .where(eq(purchaseOrders.id, id));
    const after = await requirePurchaseOrder(id, tx);
    await recordRevision(tx, after, "status", describeChanges(before, after).join("; "));
    return { ...after, needsReview: false };
  });
}

/**
 * Gives older (pre-status-tracking) POs a status in one step. Always records a "status" history
 * entry — even when the status doesn't change — so the PO counts as reviewed.
 */
export async function reviewPurchaseOrders(ids: number[], status: POStatus): Promise<number> {
  let count = 0;
  for (const id of Array.from(new Set(ids))) {
    await db.transaction(async (tx) => {
      await lockPurchaseOrder(tx, id);
      const before = await getPurchaseOrder(id, tx);
      // Skip anything reviewed/edited meanwhile (e.g. on another device) — never override that.
      if (!before || !before.needsReview) return;
      await captureExternalChanges(tx, before);
      await tx.update(purchaseOrders).set({ status, updatedAt: new Date() }).where(eq(purchaseOrders.id, id));
      const after = await requirePurchaseOrder(id, tx);
      const change = describeChanges(before, after).find((c) => c.startsWith("Status"));
      await recordRevision(tx, after, "status", change ? `${change} (reviewed older order)` : `Reviewed older order — kept as ${PO_STATUS_LABELS[status]}`);
      count++;
    });
  }
  return count;
}

export async function setArchived(id: number, archived: boolean): Promise<PurchaseOrder> {
  return db.transaction(async (tx) => {
    await lockPurchaseOrder(tx, id);
    const before = await requirePurchaseOrder(id, tx);
    if (Boolean(before.archivedAt) === archived) return before;
    await captureExternalChanges(tx, before);
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
    await lockPurchaseOrder(tx, id);
    const po = await requirePurchaseOrder(id, tx);
    await captureExternalChanges(tx, po);
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
        sql`NOT EXISTS (SELECT 1 FROM purchase_orders p WHERE p.id = "po_revisions"."po_id")`,
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
  // If its number was reused meanwhile, recover it as "<number>-R" (then -R2, -R3…) rather than failing.
  let poNumber = snap.poNumber;
  for (let n = 1; n < 100 && (await poNumberExists(poNumber)); n++) {
    poNumber = `${snap.poNumber}-R${n === 1 ? "" : n}`;
  }
  const renumbered = poNumber !== snap.poNumber;
  return db.transaction(async (tx) => {
    const date = (v: string | null | undefined, fallback: Date) => (v ? new Date(v) : fallback);
    const now = new Date();
    await tx.insert(purchaseOrders).values({
      id: rev.poId,
      poNumber,
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
    await recordRevision(
      tx,
      po,
      "recovered",
      renumbered
        ? `Recovered from a deleted snapshot as PO #${poNumber} (PO #${snap.poNumber} is now used by another order)`
        : "Recovered from a deleted snapshot",
    );
    return { ...po, needsReview: false };
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
    .where(sql`NOT EXISTS (SELECT 1 FROM po_revisions r WHERE r.po_id = "purchase_orders"."id")`);
  let count = 0;
  for (const { id } of missing) {
    const po = await getPurchaseOrder(id);
    if (!po) continue;
    await recordRevision(db, po, "baseline", "Existing purchase order saved to history", new Date(po.updatedAt ?? po.createdAt));
    count++;
  }

  // Catch up on changes made while this server wasn't the one writing (e.g. the previous
  // version of the app was still running during a deploy, or a rollback): if a PO no longer
  // matches its latest history entry, save its current state as a new entry.
  const [pos, latest] = await Promise.all([
    listPurchaseOrders("include"),
    db.execute(sql`SELECT DISTINCT ON (po_id) po_id, snapshot FROM po_revisions ORDER BY po_id, id DESC`),
  ]);
  const latestByPo = new Map<number, PurchaseOrder>();
  for (const row of latest as unknown as Array<{ po_id: number; snapshot: PurchaseOrder }>) {
    latestByPo.set(Number(row.po_id), row.snapshot);
  }
  for (const po of pos) {
    const snap = latestByPo.get(po.id);
    if (snap && contentVersion(snap) !== po.version) {
      await recordRevision(db, po, "external", "Changes made outside PO Master were saved to history");
      count++;
    }
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

/** All rows of a table exactly as stored (Postgres renders timestamps/numerics losslessly). */
async function dumpTable(table: string, orderBy: string): Promise<unknown[]> {
  const rows = await db.execute(
    sql`SELECT coalesce(json_agg(t ORDER BY ${sql.raw(orderBy)})::text, '[]') AS rows FROM ${sql.raw(table)} t`,
  );
  const text = (rows as unknown as Array<{ rows: string }>)[0]?.rows ?? "[]";
  return JSON.parse(text);
}

export async function exportBackup() {
  const [pos, items, styleRows, revisions, settings] = await Promise.all([
    dumpTable("purchase_orders", "id"),
    dumpTable("po_items", "id"),
    dumpTable("styles", "id"),
    dumpTable("po_revisions", "id"),
    dumpTable("app_settings", "key"),
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
  const [rows, usage] = await Promise.all([
    db
      .select({
        id: styles.id,
        styleNumber: styles.styleNumber,
        color: styles.color,
        description: styles.description,
        createdAt: styles.createdAt,
        updatedAt: styles.updatedAt,
      })
      .from(styles)
      .orderBy(asc(styles.styleNumber)),
    // PO lines per style, by link or by typed style number (a line matching both counts once).
    // Two hash joins, not a subquery per style: that re-scanned every line for every style and
    // took many seconds once a catalog had a few thousand styles.
    db.execute(sql`
      SELECT style_id, count(*)::int AS uses FROM (
        SELECT s.id AS style_id, pi.id AS item_id
          FROM styles s JOIN po_items pi ON pi.style_id = s.id
        UNION
        SELECT s.id, pi.id
          FROM styles s JOIN po_items pi
            ON lower(trim(coalesce(pi.manual_style_number, ''))) = lower(s.style_number)
      ) matches
      GROUP BY style_id
    `),
  ]);
  const usesById = new Map<number, number>();
  for (const row of usage as unknown as Array<{ style_id: number; uses: number }>) {
    usesById.set(Number(row.style_id), Number(row.uses) || 0);
  }
  return rows.map((r) => ({
    ...r,
    usageCount: usesById.get(r.id) ?? 0,
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

/**
 * Adds many styles at once, skipping blanks, repeats and styles already in the catalog (ignoring
 * case). Style numbers longer than a single style may have are left out too (counted in `tooLong`,
 * which is part of `skipped`), so every entry can still be edited afterwards.
 */
export async function bulkCreateStyles(
  records: Array<{ styleNumber: string; color: string; description: string }>,
): Promise<{ created: number; skipped: number; tooLong: number }> {
  const seen = new Set<string>();
  let tooLong = 0;
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
      if (r.styleNumber.length > STYLE_NUMBER_MAX_LENGTH) {
        tooLong++;
        return false;
      }
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
  return { created, skipped: records.length - created, tooLong };
}

/**
 * Counts text case-insensitively ("Black" and "BLACK" are one color) and remembers each
 * group's most common spelling. Ties go to the most recently ordered.
 */
type Usage = { count: number; last: number };
const byUse = (a: Usage, b: Usage) => b.count - a.count || b.last - a.last;

class TextTally {
  private groups = new Map<string, Usage & { spellings: Map<string, Usage> }>();

  add(text: string | null | undefined, time: number) {
    const value = (text ?? "").trim();
    if (!value) return;
    const key = value.toLowerCase();
    let group = this.groups.get(key);
    if (!group) {
      group = { count: 0, last: time, spellings: new Map() };
      this.groups.set(key, group);
    }
    group.count++;
    group.last = Math.max(group.last, time);
    const spelling = group.spellings.get(value) ?? { count: 0, last: time };
    spelling.count++;
    spelling.last = Math.max(spelling.last, time);
    group.spellings.set(value, spelling);
  }

  /** Every distinct value (its most common spelling), most used first. */
  values(): string[] {
    return Array.from(this.groups.values())
      .sort(byUse)
      .map((g) => Array.from(g.spellings.entries()).sort((a, b) => byUse(a[1], b[1]))[0][0]);
  }

  /** The most common value, or "" when nothing was added. */
  top(): string {
    return this.values()[0] ?? "";
  }
}

/**
 * Style numbers typed on PO lines that aren't in the styles catalog (older versions of the app
 * never saved them there). Covers every saved PO, archived ones included — permanently deleted
 * POs are gone from these tables. Matching is trimmed and case-insensitive, like the catalog.
 * Lines linked to a style that still exists are skipped: that style is in the catalog, even if it
 * was renamed after the order was placed. So are style numbers too long for the catalog to hold
 * (someone typed a description into the style # field): they couldn't be saved or edited there.
 *
 * Read-only: purchase orders and their lines are never modified here.
 */
export async function listStyleSuggestions(): Promise<StyleSuggestion[]> {
  const [lines, catalog] = await Promise.all([
    db
      .select({
        poId: poItems.poId,
        manualStyleNumber: poItems.manualStyleNumber,
        color: poItems.color,
        description: poItems.description,
        quantity: poItems.quantity,
        status: purchaseOrders.status,
        orderDate: purchaseOrders.orderDate,
      })
      .from(poItems)
      .innerJoin(purchaseOrders, eq(poItems.poId, purchaseOrders.id))
      .leftJoin(styles, eq(poItems.styleId, styles.id))
      .where(and(isNull(styles.id), sql`coalesce(trim(${poItems.manualStyleNumber}), '') <> ''`))
      .orderBy(asc(poItems.id)),
    db.select({ styleNumber: styles.styleNumber }).from(styles),
  ]);
  const inCatalog = new Set(catalog.map((s) => s.styleNumber.trim().toLowerCase()));

  const found = new Map<
    string,
    { numbers: TextTally; colors: TextTally; descriptions: TextTally; lines: number; orders: Set<number>; units: number; last: number }
  >();
  for (const line of lines) {
    const styleNumber = (line.manualStyleNumber ?? "").trim();
    const key = styleNumber.toLowerCase();
    if (!styleNumber || styleNumber.length > STYLE_NUMBER_MAX_LENGTH || line.poId === null || inCatalog.has(key)) {
      continue;
    }
    const time = line.orderDate ? new Date(line.orderDate).getTime() || 0 : 0;
    let entry = found.get(key);
    if (!entry) {
      entry = {
        numbers: new TextTally(),
        colors: new TextTally(),
        descriptions: new TextTally(),
        lines: 0,
        orders: new Set(),
        units: 0,
        last: time,
      };
      found.set(key, entry);
    }
    entry.numbers.add(styleNumber, time);
    entry.colors.add(line.color, time);
    entry.descriptions.add(line.description, time);
    entry.lines++;
    entry.orders.add(line.poId);
    if (normalizeStatus(line.status) !== "cancelled") entry.units += Number(line.quantity) || 0;
    entry.last = Math.max(entry.last, time);
  }

  return Array.from(found.values())
    .map((e) => {
      const colors = e.colors.values();
      return {
        styleNumber: e.numbers.top(),
        color: colors[0] ?? "",
        description: e.descriptions.top(),
        colors,
        lines: e.lines,
        orders: e.orders.size,
        units: e.units,
        lastOrdered: toISO(new Date(e.last))!,
      };
    })
    .sort(
      (a, b) =>
        b.units - a.units ||
        b.lastOrdered.localeCompare(a.lastOrdered) ||
        a.styleNumber.localeCompare(b.styleNumber, "en", { numeric: true }),
    );
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
