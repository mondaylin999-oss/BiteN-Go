// ===========================================================================
//  index.ts — the BiteN Go API server.
//
//      cd backend
//      npm install
//      cp .env.example .env        (edit it: PostgreSQL password + JWT secret)
//      bash cpp/build.sh           (compiles the C++ engine)
//      npm run dev                 (http://localhost:8000)
//
//  Everything is JSON over HTTP. The frontend in ../frontend finds this server
//  by itself (see frontend/src/lib/api.ts) — you do not have to configure a
//  URL for it to work on your own machine or on your Wi-Fi.
// ===========================================================================

import express from "express";
import cors from "cors";
import { ENV, assertEnv } from "./env.js";
import { assertSchemaInstalled, closeDatabase, pingDatabase } from "./database.js";
import { engineMode, enginePath, callEngine } from "./engine.js";
import { attachUser, errorMiddleware, route } from "./http.js";
import { authRouter } from "./routes/auth.js";
import { canteenRouter } from "./routes/canteen.js";
import { transportRouter } from "./routes/transport.js";
import { cashflowRouter } from "./routes/cashflow.js";
import { closeFoodAvailability, getPreorderWindow } from "./canteen.js";
import { seedDatabase } from "./seed.js";
import { yangonTimeLabel } from "./time.js";

const app = express();

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

// --- CORS -------------------------------------------------------------------
// The listed origins plus any private/LAN address, so opening the app from a
// phone on the same Wi-Fi needs no configuration.
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true); // curl, health checks, same-origin
      if (ENV.corsOrigins.includes(origin) || ENV.corsOriginRegex.test(origin)) return callback(null, true);
      callback(new Error(`Origin ${origin} is not allowed by CORS_ORIGINS.`));
    },
    credentials: false,
  }),
);

app.use(attachUser);

// --- health -----------------------------------------------------------------
// The frontend pings this to discover which address the API is on, so keep it
// cheap and never require a login.
app.get(
  "/health",
  route(async () => {
    const database = await pingDatabase();
    return {
      status: database.ok ? "ok" : "degraded",
      service: "biten-go-api",
      engine: engineMode(),
      enginePath: enginePath(),
      database: database.ok ? "connected" : `unavailable: ${database.error}`,
      postgres: database.serverVersion ?? null,
      myanmarTime: yangonTimeLabel(),
      time: new Date().toISOString(),
    };
  }),
);

/** What the C++ engine reports about itself — handy when demonstrating. */
app.get(
  "/engine",
  route(async () => ({ mode: engineMode(), path: enginePath(), info: await callEngine("info") })),
);

app.use("/auth", authRouter);
app.use("/canteen", canteenRouter);
app.use("/transport", transportRouter);
app.use("/cashflow", cashflowRouter);

/**
 * Closes every dish at Myanmar midnight. Call it from Task Scheduler / cron:
 *     curl -X POST http://localhost:8000/scheduled/close-food-preorders
 */
app.post(
  "/scheduled/close-food-preorders",
  route(async () => ({ closed: await closeFoodAvailability() })),
);

app.use((_req, res) => res.status(404).json({ error: "No such endpoint." }));
app.use(errorMiddleware);

// --- startup ----------------------------------------------------------------

async function start() {
  assertEnv();

  const database = await pingDatabase();
  if (!database.ok) {
    console.error(
      "\nCannot connect to PostgreSQL.\n" +
        `  ${database.error}\n\n` +
        "  Check DATABASE_URL in backend/.env — remember to percent-encode\n" +
        "  special characters in the password (# becomes %23). README section 3.\n",
    );
    process.exit(1);
  }
  await assertSchemaInstalled();

  if (ENV.seedOnStart) {
    try {
      await seedDatabase({ quiet: false });
    } catch (error) {
      console.warn("[seed] skipped:", error instanceof Error ? error.message : error);
    }
  }

  const window = await getPreorderWindow();

  app.listen(ENV.port, ENV.host, () => {
    const engine = engineMode();
    console.log("\n  BiteN Go API");
    console.log(`  ────────────────────────────────────────────────────────`);
    console.log(`  Listening      http://localhost:${ENV.port}  (host ${ENV.host})`);
    console.log(`  Health         http://localhost:${ENV.port}/health`);
    console.log(`  Database       ${database.serverVersion ?? "connected"}`);
    console.log(
      engine === "c++"
        ? `  Engine         C++  (${enginePath()})`
        : "  Engine         TypeScript fallback — run  bash cpp/build.sh  to use the C++ engine",
    );
    console.log(`  Myanmar time   ${yangonTimeLabel()} — pre-orders ${window.orderingOpen ? "OPEN" : "closed until 12:00"}`);
    console.log(`  ────────────────────────────────────────────────────────`);
    console.log(`  Frontend: cd ../frontend && npm run dev\n`);
  });
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await closeDatabase();
    process.exit(0);
  });
}

start().catch(error => {
  console.error("\nBiteN Go failed to start:\n", error instanceof Error ? error.message : error, "\n");
  process.exit(1);
});
