import { defineConfig } from "drizzle-kit";

// Generates flat migrations/NNNN_name.sql files, which wrangler applies with
// `wrangler d1 migrations apply DB --local|--remote`. No driver is needed:
// drizzle-kit only diffs the schema here, it never connects to D1.
export default defineConfig({
  dialect: "sqlite",
  // schema.ts re-exports the Better Auth tables from auth-schema.ts.
  schema: "./src/worker/db/schema.ts",
  out: "./migrations",
});
