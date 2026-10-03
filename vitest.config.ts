import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// SY32 — resolve the app's "@/…" import alias (tsconfig paths) so
// tests can import route handlers and server actions directly.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
});
