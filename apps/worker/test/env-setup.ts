import path from "node:path";
import dotenv from "dotenv";

// Must run (and finish) before anything imports "db" or "queue" — the
// Prisma client singleton reads DATABASE_URL, and createRedisClient() reads
// REDIS_URL, both at module-load time. See apps/api/test/env-setup.ts for
// the same pattern and rationale (vitest setupFiles run in array order,
// each fully finishing before the next module loads).
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env at the repo root " +
      "(or set DATABASE_URL directly, e.g. in CI) before running apps/worker tests " +
      "— the queue-consumer tests write real AuditEvent rows via Prisma, not a mock."
  );
}

if (!process.env.REDIS_URL) {
  throw new Error(
    "REDIS_URL is not set. Copy .env.example to .env at the repo root " +
      "(or set REDIS_URL directly, e.g. in CI) before running apps/worker tests " +
      "— the queue-consumer tests exercise a real Redis queue, not a mock."
  );
}

// `turbo run test` may run apps/api's and apps/worker's test suites as
// concurrent processes against the same Redis instance. apps/api's
// decision-flow test enqueues onto the default "audit-events" key; give
// this suite its own key so the two can't drain each other's jobs. Must be
// set before "queue" (or anything importing it) loads, since
// AUDIT_EVENT_QUEUE_KEY is read from process.env at module scope.
process.env.AUDIT_EVENT_QUEUE_KEY = "audit-events-worker-test";
