// workerd tests: API routes and D1, with per-test storage isolation.
// Current @cloudflare/vitest-plugin API: the cloudflareTest() Vite plugin,
// `env` and `exports` from "cloudflare:workers" (exports.default.fetch
// replaces SELF), migrations through readD1Migrations + applyD1Migrations.
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations(fileURLToPath(new URL("./migrations", import.meta.url)));
  return {
    resolve: {
      alias: { "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)) },
    },
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          // Test bindings. They override .dev.vars, so tests behave the same without it.
          bindings: {
            TEST_MIGRATIONS: migrations,
            TEST_MODE: "1",
            APP_URL: "http://localhost",
            BETTER_AUTH_SECRET: "test-secret-0123456789abcdef0123456789abcdef",
          },
        },
      }),
    ],
    test: {
      name: "worker",
      include: ["test/worker/**/*.test.ts"],
      setupFiles: ["./test/apply-migrations.ts"],
      passWithNoTests: true,
    },
  };
});
