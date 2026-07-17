import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./test/env-setup.ts"],
    // The queue-consumer tests block on real Redis (BRPOP) and real Postgres
    // round-trips, so give more headroom than vitest's 5s default.
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
