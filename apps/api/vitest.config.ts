import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./test/env-setup.ts", "./test/db-setup.ts"],
    // Real Postgres round-trips per test are slower than in-memory asserts;
    // give the suite more headroom than the vitest default (5s).
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
