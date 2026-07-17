import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type Redis from "ioredis";
import { prisma } from "db";
import { createRedisClient, enqueueAuditEvent, type AuditEventJob } from "queue";
import { runConsumerLoop } from "../src/queueConsumer";
import type { AuditEvent } from "db";

// Real Redis + real Postgres, no mocks — same posture as apps/api's
// integration tests (see docs/decisions/0004 and ENGINEERING_STANDARDS.md).
// AuditEvent has no FK to Campaign/AppUser (see the schema comment), so
// these tests can use throwaway campaignId/userId values without touching
// the shared demo fixture rows other suites rely on.

describe("worker queue consumer", () => {
  let redis: Redis;

  beforeAll(() => {
    redis = createRedisClient();
  });

  afterAll(async () => {
    await redis.quit();
    await prisma.$disconnect();
  });

  it("dequeues an enqueued job and writes the AuditEvent row via Prisma", async () => {
    const job: AuditEventJob = {
      campaignId: "test-camp-queue",
      userId: "test-user-queue-1",
      description: "queue consumer test event",
    };

    await enqueueAuditEvent(redis, job);

    let written: AuditEvent | undefined;
    await runConsumerLoop(prisma, redis, {
      pollTimeoutSeconds: 2,
      onEvent: (event) => {
        written = event;
      },
      shouldStop: () => written !== undefined,
    });

    expect(written).toBeDefined();
    expect(written!.campaignId).toBe(job.campaignId);
    expect(written!.userId).toBe(job.userId);
    expect(written!.description).toBe(job.description);

    const row = await prisma.auditEvent.findUnique({ where: { id: written!.id } });
    expect(row).not.toBeNull();
    expect(row?.description).toBe(job.description);

    await prisma.auditEvent.delete({ where: { id: written!.id } });
  });

  it("stamps its own timestamp when the job omits one", async () => {
    const job: AuditEventJob = {
      campaignId: "test-camp-queue",
      userId: "test-user-queue-2",
      description: "queue consumer test event without timestamp",
    };

    const before = Date.now();
    await enqueueAuditEvent(redis, job);

    let written: AuditEvent | undefined;
    await runConsumerLoop(prisma, redis, {
      pollTimeoutSeconds: 2,
      onEvent: (event) => {
        written = event;
      },
      shouldStop: () => written !== undefined,
    });
    const after = Date.now();

    expect(written).toBeDefined();
    const stamped = written!.timestamp.getTime();
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(stamped).toBeLessThanOrEqual(after);

    await prisma.auditEvent.delete({ where: { id: written!.id } });
  });

  it("terminates cleanly within the poll timeout when the queue is empty", async () => {
    const events: AuditEvent[] = [];
    let checks = 0;

    const start = Date.now();
    await runConsumerLoop(prisma, redis, {
      pollTimeoutSeconds: 1,
      onEvent: (event) => events.push(event),
      // Run exactly one BRPOP attempt (bounded by pollTimeoutSeconds) then
      // stop — proves the loop doesn't hang or busy-spin against an empty
      // queue, without asserting on a specific empty-queue "result" (there
      // isn't one — dequeueAuditEvent just returns null, which the loop
      // silently treats as "nothing to do this iteration").
      shouldStop: () => {
        checks += 1;
        return checks > 1;
      },
    });
    const elapsedMs = Date.now() - start;

    expect(events).toHaveLength(0);
    // One BRPOP with a 1s timeout should take roughly that long, not hang.
    expect(elapsedMs).toBeLessThan(5000);
  });
});
