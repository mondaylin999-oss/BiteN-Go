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

/** Fails loudly at startup when schema.sql has not been run yet. */
export async function assertSchemaInstalled() {
  const result = await getPool().query(
    "SELECT COUNT(*)::int AS present FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('users','transactions','food_items','orders','order_items','vehicles','transport_routes','trips','ride_bookings')",
  );
  const present = Number(result.rows[0]?.present ?? 0);
  if (present < 9) {
    throw new Error(
      "The BiteN Go tables are missing from this database.\n" +
        "  Open database/schema.sql in the pgAdmin4 Query Tool and run it,\n" +
        "  or:  psql -U postgres -d biten_go_db -f database/schema.sql\n" +
        "  (See README.md section 3.)",
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
