// Setup file for the workerd test projects: applies migrations/*.sql to the
// test D1 database. applyD1Migrations skips migrations already applied.
import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
