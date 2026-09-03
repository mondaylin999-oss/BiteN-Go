// ===========================================================================
//  database.ts — the single PostgreSQL connection pool.
//
//  There is no in-memory / mock mode any more: every screen reads and writes
//  this database, so the app behaves the same on your laptop, your phone and
//  anyone else's machine on the same network.
// ===========================================================================

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { ENV } from "./env.js";
import * as schema from "../drizzle/schema.js";

// PostgreSQL returns BIGINT/NUMERIC as strings by default; every money column
// in this project is INTEGER, but this keeps counts numeric too.
pg.types.setTypeParser(pg.types.builtins.INT8, value => Number(value));

function createDrizzle() {
  return drizzle(getPool(), { schema });
}

let pool: pg.Pool | null = null;
let database: ReturnType<typeof createDrizzle> | null = null;

export function getPool() {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: ENV.databaseUrl,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    pool.on("error", error => console.error("[database] idle client error:", error.message));
  }
  return pool;
}

/** The Drizzle handle used by every query in this backend. */
export function db() {
  if (!database) database = createDrizzle();
  return database;
}

/** Used by /health and by the startup banner. */
export async function pingDatabase(): Promise<{ ok: boolean; error?: string; serverVersion?: string }> {
  try {
    const result = await getPool().query("SELECT version() AS version");
    return { ok: true, serverVersion: String(result.rows[0]?.version ?? "").split(",")[0] };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * The tables the backend cannot run without. Derived checks only — never a
 * hard-coded count: an earlier version compared "how many of these 8 exist"
 * against the number 9, so the backend refused to start no matter how
 * correctly the database had been set up.
 */
const REQUIRED_TABLES = [
  "users",
  "transactions",
  "food_items",
  "orders",
  "order_items",
  "vehicles",
  "transport_routes",
  "ride_bookings",
] as const;

/** Where this backend is actually looking, in words the message can print. */
async function describeConnection() {
  try {
    const row = (
      await getPool().query(
        "SELECT current_database() AS db, current_user AS who, coalesce(inet_server_addr()::text, 'localhost') AS host, inet_server_port() AS port",
      )
    ).rows[0];
    return `database "${row?.db}" on ${row?.host}:${row?.port} as user "${row?.who}"`;
  } catch {
    return "the database in backend/.env (DATABASE_URL)";
  }
}

/** Fails loudly at startup when schema.sql has not been run yet. */
export async function assertSchemaInstalled() {
  const result = await getPool().query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])",
    [REQUIRED_TABLES as unknown as string[]],
  );
  const found = new Set(result.rows.map(row => String(row.table_name)));
  const missing = REQUIRED_TABLES.filter(table => !found.has(table));

  if (missing.length) {
    const where = await describeConnection();
    throw new Error(
      `The BiteN Go tables are missing from ${where}.\n` +
        `  Missing: ${missing.join(", ")}\n` +
        `  Found:   ${found.size ? Array.from(found).sort().join(", ") : "none of them"}\n` +
        "\n" +
        "  If you HAVE run database/schema.sql, you almost certainly ran it while\n" +
        "  connected to a different database than the one named above — in pgAdmin4\n" +
        "  click the right database first, then Tools -> Query Tool.\n" +
        "\n" +
        "  Otherwise run it now:\n" +
        "    psql -U postgres -d biten_go_db -f database/schema.sql\n" +
        "  (See README1.md section 3.)",
    );
  }
}

export async function closeDatabase() {
  if (pool) {
    await pool.end();
    pool = null;
    database = null;
  }
}

export { schema };
