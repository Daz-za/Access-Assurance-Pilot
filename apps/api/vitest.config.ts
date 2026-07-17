import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./test/env-setup.ts", "./test/db-setup.ts"],
    // Real Postgres round-trips per test are slower than in-memory asserts;
    // give the suite more headroom than the vitest default (5s).
    testTimeout: 15000,
    hookTimeout: 15000,
    // Vitest's default file parallelism runs each test file in its own
    // worker, each loading its own copy of test/db-setup.ts — including its
    // own beforeEach reset+reseed cycle *and* its own inline audit-event
    // queue consumer loop. Since both the database and the Redis queue are
    // one real shared instance (not sandboxed per worker), two test files'
    // independent reset cycles and consumer loops race each other: one
    // file's consumer can steal another file's job, and one file's
    // beforeEach can wipe a row the other file is mid-poll for. Force all
    // test files in this suite into a single worker/process so there's
    // exactly one reset cycle and one consumer loop at a time — matching
    // the "one real, shared Postgres/Redis" reality this suite already
    // embraces (see docs/decisions/0004 and ENGINEERING_STANDARDS.md).
    fileParallelism: false,
  },
});
