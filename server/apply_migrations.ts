import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "./db.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function apply() {
  const migrationsDir = path.join(__dirname, "..", "migrations");
  if (!fs.existsSync(migrationsDir)) {
    console.error("Migrations directory not found:", migrationsDir);
    process.exit(1);
  }

  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  const client = await pool.connect();
  try {
    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      console.log("Applying:", file);
      const sql = fs.readFileSync(filePath, 'utf8');
      // Split on marker used in repository to separate statements
      const statements = sql.split('\n--> statement-breakpoint\n').map(s => s.trim()).filter(Boolean);
      for (const stmt of statements) {
        console.log("Executing statement (truncated):", stmt.substring(0, 120).replace(/\n/g, ' '));
        try {
          await client.query(stmt);
        } catch (err: any) {
          // If the object already exists, skip and continue (idempotent migrations)
          const msg = err && (err.message || err.toString());
          if (err && (err.code === '42P07' || /already exists/i.test(msg))) {
            console.log("Skipping statement because object already exists:", msg);
            continue;
          }

          // Some ALTER statements fail when views/rules depend on the column/type.
          // Skip these specific errors so migrations are idempotent on databases
          // that already have views or rules defined.
          if (err && (err.code === '0A000' || /depends on column|cannot alter type|used by a view|rule _RETURN on view/i.test(msg))) {
            console.log("Skipping statement due to dependent view/rule or unsupported ALTER:", msg);
            continue;
          }

          // For other errors, rethrow to fail the migration
          throw err;
        }
      }
    }
    console.log("All migrations applied successfully.");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exitCode = 1;
  } finally {
    client.release();
  }
}

apply().catch(err => { console.error(err); process.exit(1); });
