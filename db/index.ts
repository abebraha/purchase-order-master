import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@db/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const MAX_RETRIES = 5;
const RETRY_DELAY = 2000; // 2 seconds

async function createDatabaseConnection() {
  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`Attempting to connect to database (attempt ${attempt}/${MAX_RETRIES})...`);
      const client = postgres(process.env.DATABASE_URL, {
        max: 10,
        idle_timeout: 20,
        connect_timeout: 10,
      });

      // Test the connection
      await client`SELECT 1`;
      console.log('Database connection established successfully');
      return client;
    } catch (error) {
      lastError = error;
      console.error(`Database connection attempt ${attempt} failed:`, error);
      if (attempt < MAX_RETRIES) {
        console.log(`Retrying in ${RETRY_DELAY/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      }
    }
  }

  throw new Error(`Failed to connect to database after ${MAX_RETRIES} attempts. Last error: ${lastError}`);
}

let client;
try {
  client = await createDatabaseConnection();
} catch (error) {
  console.error('Fatal database connection error:', error);
  throw error;
}

export const db = drizzle(client, { schema });