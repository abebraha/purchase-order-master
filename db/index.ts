import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@db/schema";

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
});
export const db = drizzle(client, { schema });

// Auto-create tables if they don't exist
client`
  CREATE TABLE IF NOT EXISTS styles (
    id SERIAL PRIMARY KEY,
    style_number TEXT UNIQUE NOT NULL,
    color TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )
`.then(() => client`
  CREATE TABLE IF NOT EXISTS purchase_orders (
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
  )
`).then(() => client`
  CREATE TABLE IF NOT EXISTS po_items (
    id SERIAL PRIMARY KEY,
    po_id INTEGER REFERENCES purchase_orders(id),
    style_id INTEGER,
    color TEXT NOT NULL,
    description TEXT NOT NULL,
    quantity NUMERIC NOT NULL,
    price NUMERIC NOT NULL
  )
`).then(() => console.log('Database tables ready'))
  .catch((err: any) => console.error('Error creating tables:', err));