import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "jsdom",
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
      reporter: ["text", "json", "lcov", "json-summary"], // gives coverage-final.json + lcov.info
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/__tests__/**",
        "src/**/*.d.ts",
        "src/**/index.ts", // small barrel files not meaningful for coverage gate
      ],
      thresholds: {
        statements: 35, // baseline current ~35.85 -> prevent regressions; ramp upward later
        lines: 35,
        branches: 30,
        functions: 35,
      },
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
