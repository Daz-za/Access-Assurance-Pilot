import path from "node:path";
import dotenv from "dotenv";

// Must run (and finish) before anything imports "db" — the Prisma client
// singleton reads DATABASE_URL at module-load time. Vitest's `setupFiles`
// entries are each fully executed, in array order, before the next one (and
// before any test file) loads, so listing this file first in
// vitest.config.ts's setupFiles guarantees the ordering. Do not import "db"
// (or anything that transitively imports it) from this file.
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env at the repo root " +
      "(or set DATABASE_URL directly, e.g. in CI) before running apps/api tests " +
      "— they run against a real Postgres instance, not a mock."
  );
}
