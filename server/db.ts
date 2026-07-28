// server/db.ts
import "dotenv/config";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

// ✅ This matches the file you pasted (exports: users, employees, projects, projectTasks, taskMembers, etc.)
import * as schema from "../shared/schema.ts";

/* ================================
   Safety Check
================================ */
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is not defined in the .env file");
}
console.log("🔗 DATABASE_URL found:", DATABASE_URL.replace(/:\/\/[^@]+@/, "://****:****@")); // Mask password


/* ================================
   PostgreSQL Pool (Neon)
================================ */
export const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },

  // OPTIMIZATION: Increased from 5 to 25 to support 50+ concurrent users
  // Neon serverless mode handles actual connection pooling efficiently
  max: 25,
  // Was 10s — on a page where clicks are seconds apart (not constant), that
  // meant nearly every request paid the cost of opening a brand-new
  // connection to Neon (TLS handshake + auth over WAN, ~200-800ms+, more if
  // Neon's compute had also auto-suspended). Keeping idle connections open
  // longer avoids re-paying that cost on every click.
  idleTimeoutMillis: 60_000,
  connectionTimeoutMillis: 30_000,
  statement_timeout: 30_000,
});

/* ================================
   Pool Error Handler
================================ */
pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL pool error:", err);
});

// Ensure each new client uses the public schema search_path
// (Neon pooler connections may have empty search_path by default)
pool.on('connect', async (client) => {
  try {
    await client.query("SET search_path TO public");
  } catch (err: any) {
    console.warn('Failed to set search_path:', err && err.message ? err.message : err);
  }
});

// Initialize pool: set search_path on first connection
(async () => {
  try {
    const client = await pool.connect();
    await client.query("SET search_path TO public, pg_catalog");
    const result = await client.query("SHOW search_path");
    console.log("🔧 Pool initialized with search_path:", result.rows[0]?.search_path || 'not set');
    client.release();
  } catch (err: any) {
    console.warn('⚠️ Warning: Failed to initialize search_path:', err && err.message ? err.message : err);
  }
})();

/* ================================
   Drizzle ORM Instance
================================ */
export const db = drizzle(pool, { schema });

/* ================================
   Database Health Check
================================ */
export async function checkDatabaseConnection() {
  try {
    console.log("🔌 Attempting database connection...");
    const client = await pool.connect();
    await client.query("SET search_path TO public, pg_catalog");
    await client.query("SELECT 1");
    client.release();
    console.log("✅ Database connection successful");
    return true;
  } catch (err: any) {
    console.error("❌ Database connection failed");
    console.error("Error:", err.message);
    console.error("Code:", err.code);
    return false;
  }
}