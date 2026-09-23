import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@db/schema";

// Columns are TIMESTAMP WITHOUT TIME ZONE; values are read/written as UTC wall time.
// Pin the process time zone so dates never shift if the host's TZ changes.
process.env.TZ = "UTC";

// Use DB_URL if set (avoids Railway auto-override of DATABASE_URL)
const connectionUrl = process.env.DB_URL || process.env.DATABASE_URL;
if (!connectionUrl) {
  throw new Error(
    "DB_URL or DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const isRailwayInternal = connectionUrl.includes('.railway.internal');
const client = postgres(connectionUrl, {
  ssl: process.env.NODE_ENV === "production" && !isRailwayInternal
    ? { rejectUnauthorized: false }
    : false,
  prepare: false,
  onnotice: () => {},
});
export const db = drizzle(client, { schema });

// Schema setup. Every statement is idempotent and ADDITIVE ONLY — nothing here may drop,
// rename, or rewrite existing data. Existing purchase orders, items and styles are kept as-is.
const migrations: string[] = [
  // Original tables (unchanged from the first release)
  `CREATE TABLE IF NOT EXISTS styles (
    id SERIAL PRIMARY KEY,
    style_number TEXT UNIQUE NOT NULL,
    color TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS purchase_orders (
    id SERIAL PRIMARY KEY,
    po_number TEXT UNIQUE NOT NULL,
    po_type TEXT NOT NULL,
    order_date TIMESTAMP NOT NULL,
    ship_to TEXT NOT NULL,
    bill_to TEXT NOT NULL,
    start_ship_date TIMESTAMP NOT NULL,
    cancel_date TIMESTAMP NOT NULL,
    terms TEXT NOT NULL DEFAULT 'Net 30',
    due_date TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS po_items (
    id SERIAL PRIMARY KEY,
    po_id INTEGER REFERENCES purchase_orders(id),
    style_id INTEGER,
    manual_style_number TEXT DEFAULT '',
    color TEXT NOT NULL,
    description TEXT NOT NULL,
    quantity NUMERIC NOT NULL,
    price NUMERIC NOT NULL
  )`,
  `ALTER TABLE po_items ADD COLUMN IF NOT EXISTS manual_style_number TEXT DEFAULT ''`,

  // Redesign: new optional columns on purchase_orders (existing rows get safe defaults)
  `ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS special_instructions TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open'`,
  `ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`,
  `ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP`,
  `CREATE INDEX IF NOT EXISTS po_items_po_id_idx ON po_items (po_id)`,

  // Redesign: append-only revision history (full JSON snapshot per change)
  `CREATE TABLE IF NOT EXISTS po_revisions (
    id SERIAL PRIMARY KEY,
    po_id INTEGER NOT NULL,
    po_number TEXT NOT NULL,
    action TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    snapshot JSONB NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS po_revisions_po_id_idx ON po_revisions (po_id)`,

  // Redesign: company profile & defaults
  `CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,

  // Sign-in: persistent sessions (so logins survive redeploys) and server-generated secrets.
  // Kept out of app_settings on purpose so they never end up in a backup download.
  `CREATE TABLE IF NOT EXISTS auth_sessions (
    sid TEXT PRIMARY KEY,
    sess JSONB NOT NULL,
    expire TIMESTAMP NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS auth_sessions_expire_idx ON auth_sessions (expire)`,
  `CREATE TABLE IF NOT EXISTS app_secrets (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
];

async function migrate() {
  for (const statement of migrations) {
    await client.unsafe(statement);
  }
  console.log("Database tables ready");
}

/** Resolves once the schema is in place. The server waits for this before accepting requests. */
export const ready: Promise<void> = migrate().catch((err: any) => {
  console.error("Error preparing database:", err);
  throw err;
});
