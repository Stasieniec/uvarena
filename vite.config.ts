import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export const sharedAlias = {
  "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
};

export default defineConfig({
  resolve: { alias: sharedAlias },
  plugins: [react(), tailwindcss(), cloudflare()],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
