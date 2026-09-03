// ===========================================================================
//  env.ts — everything the backend reads from .env, in one place.
//  Copy .env.example to .env and edit it; see README section 3.
// ===========================================================================

import "dotenv/config";

const text = (key: string, fallback = "") => (process.env[key] ?? fallback).trim();
const number = (key: string, fallback: number) => {
  const parsed = Number(process.env[key]);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const flag = (key: string, fallback: boolean) => {
  const value = text(key).toLowerCase();
  if (!value) return fallback;
  return value === "1" || value === "true" || value === "yes";
};

export const ENV = {
  databaseUrl: text("DATABASE_URL"),
  jwtSecret: text("JWT_SECRET", "dev-only-change-me-please-set-JWT_SECRET"),
  jwtExpireMinutes: number("JWT_EXPIRE_MINUTES", 1440),
  port: number("PORT", 8000),
  host: text("HOST", "0.0.0.0"),
  corsOrigins: text("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean),

  // Any private / LAN address is allowed by default so the app works from a
  // phone on the same Wi-Fi with zero configuration. Set CORS_ORIGIN_REGEX to
  // an empty string in .env before publishing on the internet.
  corsOriginRegex: new RegExp(
    text(
      "CORS_ORIGIN_REGEX",
      "^https?://(localhost|127\\.0\\.0\\.1|10\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}|192\\.168\\.\\d{1,3}\\.\\d{1,3}|172\\.(1[6-9]|2\\d|3[01])\\.\\d{1,3}\\.\\d{1,3})(:\\d+)?$",
    ) || "^$",
  ),

  seedOnStart: flag("SEED_ON_START", true),
  seedPassword: text("SEED_PASSWORD", "biten123"),

  // --- food photos (Supabase Storage) ---------------------------------
  // Leave these out and the app runs exactly as before, without photos.
  // SUPABASE_SERVICE_KEY must be the SECRET key (sb_secret_… or the older
  // service_role JWT). Never the publishable one, and never in the frontend.
  supabaseUrl: text("SUPABASE_URL"),
  supabaseServiceKey: text("SUPABASE_SERVICE_KEY"),
  supabaseBucket: text("SUPABASE_BUCKET", "food-photos"),

  enginePath: text("BITEN_ENGINE_PATH"),
  engineRequired: flag("BITEN_ENGINE_REQUIRED", false),

  loginRateLimit: number("LOGIN_RATE_LIMIT", 10),
  loginRateWindowSeconds: number("LOGIN_RATE_WINDOW_SECONDS", 60),

  isProduction: text("NODE_ENV") === "production",
} as const;

export function assertEnv() {
  if (!ENV.databaseUrl) {
    throw new Error(
      "DATABASE_URL is not set.\n" +
        "  Copy backend/.env.example to backend/.env and put your PostgreSQL\n" +
        "  connection string in it. See README1.md section 3.",
    );
  }
  if (ENV.isProduction && ENV.jwtSecret.startsWith("dev-only")) {
    throw new Error("Set a real JWT_SECRET in .env before running in production.");
  }
}
