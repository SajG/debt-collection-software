import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// SY32 — resolve the app's "@/…" import alias (tsconfig paths) so
// tests can import route handlers and server actions directly.
export default defineConfig({
  // tsconfig.json keeps JSX as "preserve" for Next; tests that import a
  // .tsx module (the PDF templates) need it compiled.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
});
