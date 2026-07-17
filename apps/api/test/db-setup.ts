import { beforeEach, afterAll } from "vitest";
import { prisma, resetDatabase, seedDemoData } from "db";
import { createRedisClient, dequeueAuditEvent, applyAuditEventJob } from "queue";

// Integration tests hit a real Postgres instance (see docs/decisions/0004 and
// ENGINEERING_STANDARDS.md — no mocked Prisma client). Resetting to the known
// fixture set before every test is what makes that repeatable: each test
// starts from the same 2 systems/2 users/1 campaign/2 review items/4
// assignments/2 audit events, regardless of what a previous test run left
// behind.
beforeEach(async () => {
  await resetDatabase(prisma);
  await seedDemoData(prisma);
});

// Inline stand-in worker for the test suite. apps/api's decision route now
// enqueues audit-event jobs onto Redis instead of writing them directly
// (apps/worker is the real consumer in dev/prod — see
// apps/worker/src/queueConsumer.ts). For apps/api's own tests to honestly
// assert against the real (async) audit trail — GET /audit/... reading real
// Postgres rows, not a mock — *something* has to drain that queue. Rather
// than spin up a second OS process, run the exact same dequeue+apply logic
// (imported from the shared "queue" package, so it can't drift from what
// apps/worker actually runs) in a background loop for the lifetime of this
// test file.
const testConsumerRedis = createRedisClient();
let stopConsumer = false;
const consumerLoopDone = (async () => {
  while (!stopConsumer) {
    try {
      const job = await dequeueAuditEvent(testConsumerRedis, 1);
      if (job) {
        await applyAuditEventJob(prisma, job);
      }
    } catch {
      // A transient error here (e.g. a reset/reseed racing a dequeue) just
      // means this iteration's job gets picked up on the next loop tick —
      // vitest's own bounded polling in app.test.ts is what actually asserts
      // eventual delivery, so don't crash the suite over it.
    }
  }
})();

afterAll(async () => {
  // Stop draining the queue *before* the final reset/reseed/disconnect below
  // — otherwise a job could get applied against a prisma client that's
  // already disconnected, or after the fixture rows have been reset.
  stopConsumer = true;
  await consumerLoopDone;
  await testConsumerRedis.quit();

  // Leave the shared database in the same known-clean fixture state the
  // suite started with, rather than whatever the last test happened to
  // mutate it into (e.g. ri-1 marked completed by the decision-flow test).
  // Anything that runs against this same Postgres instance after the test
  // suite — a developer poking at the API by hand, or
  // docs/reviews/phase-0/gate.sh, which assumes ri-1 is pending and does not
  // reseed itself — should find the fixture data exactly as seeded.
  await resetDatabase(prisma);
  await seedDemoData(prisma);
  await prisma.$disconnect();
});
