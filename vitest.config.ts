import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup-env.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    include: ["tests/**/*.test.ts"],
  },
});
