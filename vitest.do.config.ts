// workerd tests for Durable Object WebSockets. WebSockets to DOs do not work
// with per-file storage isolation, so this project runs without isolation in
// a single worker (npm run test:do passes --max-workers=1 --no-isolate too).
// Tests here must clean up after themselves (fresh DO names, own D1 rows).
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
      name: "do",
      include: ["test/do/**/*.test.ts"],
      setupFiles: ["./test/apply-migrations.ts"],
      isolate: false,
      maxWorkers: 1,
      fileParallelism: false,
      passWithNoTests: true,
    },
  };
});
