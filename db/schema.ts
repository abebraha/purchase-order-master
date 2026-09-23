import { pgTable, text, serial, timestamp, numeric, integer, jsonb, index } from "drizzle-orm/pg-core";
import { relations, type InferModel } from "drizzle-orm";

// IMPORTANT: this file must mirror the live database exactly (see db/index.ts, which
// creates/migrates tables additively on startup). Never rename or drop a column here —
// production purchase-order history lives in these tables.

export const styles = pgTable("styles", {
  id: serial("id").primaryKey(),
  styleNumber: text("style_number").unique().notNull(),
  color: text("color").default('').notNull(),
  description: text("description").default('').notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const purchaseOrders = pgTable("purchase_orders", {
  id: serial("id").primaryKey(),
  poNumber: text("po_number").unique().notNull(),
  poType: text("po_type").notNull(),
  orderDate: timestamp("order_date").notNull(),
  shipTo: text("ship_to").notNull(),
  billTo: text("bill_to").notNull(),
  startShipDate: timestamp("start_ship_date").notNull(),
  cancelDate: timestamp("cancel_date").notNull(),
  terms: text("terms").notNull().default('Net 30'),
  dueDate: timestamp("due_date").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // Added in the redesign (additive migrations in db/index.ts)
  specialInstructions: text("special_instructions").notNull().default(''),
  notes: text("notes").notNull().default(''),
  status: text("status").notNull().default('open'),
  updatedAt: timestamp("updated_at"),
  archivedAt: timestamp("archived_at"),
});

export const poItems = pgTable("po_items", {
  id: serial("id").primaryKey(),
  poId: integer("po_id").references(() => purchaseOrders.id),
  styleId: integer("style_id"),
  manualStyleNumber: text("manual_style_number").default(''),
  color: text("color").notNull(),
  description: text("description").notNull(),
  quantity: numeric("quantity").notNull(),
  price: numeric("price").notNull(),
});

// Append-only audit log. Every create/edit/status change/archive/delete stores a full JSON
// snapshot of the PO, so no version of a purchase order is ever lost. No foreign key on
// purpose: revisions must outlive a permanently deleted PO so it can be recovered.
export const poRevisions = pgTable("po_revisions", {
  id: serial("id").primaryKey(),
  poId: integer("po_id").notNull(),
  poNumber: text("po_number").notNull(),
  action: text("action").notNull(),
  summary: text("summary").notNull().default(''),
  snapshot: jsonb("snapshot").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  poIdIdx: index("po_revisions_po_id_idx").on(t.poId),
}));

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Sign-in sessions (see server/session-store.ts). Rows expire on their own; nothing else
// references them.
export const authSessions = pgTable("auth_sessions", {
  sid: text("sid").primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: timestamp("expire").notNull(),
}, (t) => ({
  expireIdx: index("auth_sessions_expire_idx").on(t.expire),
}));

// Server-generated secrets (e.g. the session signing key). Never exported in backups.
export const appSecrets = pgTable("app_secrets", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const stylesRelations = relations(styles, ({ many }) => ({
  items: many(poItems),
}));

export const purchaseOrdersRelations = relations(purchaseOrders, ({ many }) => ({
  items: many(poItems),
}));

export const poItemsRelations = relations(poItems, ({ one }) => ({
  style: one(styles, {
    fields: [poItems.styleId],
    references: [styles.id],
  }),
  purchaseOrder: one(purchaseOrders, {
    fields: [poItems.poId],
    references: [purchaseOrders.id],
  }),
}));

export type Style = InferModel<typeof styles>;
export type NewStyle = InferModel<typeof styles, "insert">;
export type PurchaseOrderRow = InferModel<typeof purchaseOrders>;
export type NewPurchaseOrder = InferModel<typeof purchaseOrders, "insert">;
export type PoItem = InferModel<typeof poItems>;
export type NewPoItem = InferModel<typeof poItems, "insert">;
export type PoRevisionRow = InferModel<typeof poRevisions>;
