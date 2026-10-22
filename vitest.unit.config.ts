// Node tests: engine, ratings, finalization plan, bank tool, schemas.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)) },
  },
  test: {
    name: "unit",
    environment: "node",
    include: ["test/unit/**/*.test.ts"],
    passWithNoTests: true,
  },
});
