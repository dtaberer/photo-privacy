import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "jsdom",
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
      reporter: ["text", "json", "lcov", "json-summary"], // gives coverage-final.json + lcov.info
    },
    setupFiles: ["src/__tests__/SetupTests.ts"], // NOTE: matches your filename casing
    globals: true, // provide global expect/vi/etc.
    css: true,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
