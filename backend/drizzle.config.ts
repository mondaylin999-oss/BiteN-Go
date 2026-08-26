import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Drizzle Kit is OPTIONAL in this project: database/schema.sql is the source of
// truth and you create the tables with pgAdmin4 (see README section 3). This
// config only exists so `npx drizzle-kit studio` / `generate` also work if you
// prefer migrations.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required — copy .env.example to .env first.");

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: { url: connectionString },
});
