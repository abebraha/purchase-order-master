import { pgTable, text, serial, timestamp, numeric } from "drizzle-orm/pg-core";
import { relations, type InferModel } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

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
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const poItems = pgTable("po_items", {
  id: serial("id").primaryKey(),
  poId: serial("po_id").references(() => purchaseOrders.id),
  styleId: serial("style_id").references(() => styles.id),
  color: text("color").notNull(),
  description: text("description").notNull(),
  quantity: numeric("quantity").notNull(),
  price: numeric("price").notNull(),
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

export const insertStyleSchema = createInsertSchema(styles);
export const selectStyleSchema = createSelectSchema(styles);

export const insertPurchaseOrderSchema = createInsertSchema(purchaseOrders);
export const selectPurchaseOrderSchema = createSelectSchema(purchaseOrders);

export const insertPoItemSchema = createInsertSchema(poItems);
export const selectPoItemSchema = createSelectSchema(poItems);

export type Style = InferModel<typeof styles>;
export type NewStyle = InferModel<typeof styles, "insert">;
export type PurchaseOrder = InferModel<typeof purchaseOrders>;
export type NewPurchaseOrder = InferModel<typeof purchaseOrders, "insert">;
export type PoItem = InferModel<typeof poItems>;
export type NewPoItem = InferModel<typeof poItems, "insert">;