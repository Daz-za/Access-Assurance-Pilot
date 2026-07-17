import Redis from "ioredis";
import type { PrismaClient, AuditEvent } from "db";

// Phase 1 part 2 — real async work over Redis. Shared by apps/api (producer:
// the decision route enqueues instead of writing AuditEvent rows itself) and
// apps/worker (consumer: the only thing that actually calls
// prisma.auditEvent.create). Kept in one small package so the queue key name
// and job shape can't drift between producer and consumer, and so apps/api's
// test suite can drive the same consume logic inline (see
// apps/api/test/db-setup.ts) instead of needing a second OS process.
//
// Implementation choice (reversible, no ADR per CLAUDE.md's model-tiering
// note on this item): a minimal hand-rolled Redis list queue via ioredis
// (LPUSH/BRPOP), not BullMQ. The schema here is one job type, no retries,
// no scheduling, no priorities — BullMQ's extra machinery (and dependency
// weight) isn't earning its keep yet. Revisit if Phase 2+ needs delayed
// jobs, retries with backoff, or multiple queues.

// Overridable via env so independent test suites sharing one Redis instance
// (apps/api's decision-flow test and apps/worker's own queue-consumer tests,
// which `turbo run test` may run as concurrent processes) don't cross-drain
// each other's jobs on the same list key. Real dev/prod usage (apps/api
// producing, apps/worker consuming) always wants the default, shared key.
export const AUDIT_EVENT_QUEUE_KEY = process.env.AUDIT_EVENT_QUEUE_KEY || "audit-events";

export interface AuditEventJob {
  campaignId: string;
  userId: string;
  description: string;
  /** ISO timestamp. Optional — omit to let the consumer stamp "now" (the
   * AuditEvent.timestamp column defaults to now() at the Prisma layer). */
  timestamp?: string;
}

export function createRedisClient(url: string = process.env.REDIS_URL || "redis://localhost:6379"): Redis {
  return new Redis(url);
}

/** Producer side: push a job onto the queue. */
export async function enqueueAuditEvent(redis: Redis, job: AuditEventJob): Promise<void> {
  await redis.lpush(AUDIT_EVENT_QUEUE_KEY, JSON.stringify(job));
}

/**
 * Consumer side, step 1: blocking pop with a bounded timeout (seconds).
 * Returns the parsed job, or null if nothing arrived within the timeout —
 * callers are expected to loop on this rather than treat null as an error.
 */
export async function dequeueAuditEvent(redis: Redis, timeoutSeconds = 5): Promise<AuditEventJob | null> {
  const popped = await redis.brpop(AUDIT_EVENT_QUEUE_KEY, timeoutSeconds);
  if (!popped) return null;
  const [, payload] = popped;
  return JSON.parse(payload) as AuditEventJob;
}

/** Consumer side, step 2: actually write the AuditEvent row. */
export async function applyAuditEventJob(prisma: PrismaClient, job: AuditEventJob): Promise<AuditEvent> {
  return prisma.auditEvent.create({
    data: {
      campaignId: job.campaignId,
      userId: job.userId,
      description: job.description,
      ...(job.timestamp ? { timestamp: new Date(job.timestamp) } : {}),
    },
  });
}

/**
 * Convenience combining both consumer steps: dequeue one job (if any, within
 * timeoutSeconds) and apply it. This is the exact loop body apps/worker runs
 * forever, and is also what apps/api's test suite calls inline to act as a
 * stand-in worker so assertions against the real (async) audit trail don't
 * need a second OS process.
 */
export async function consumeOne(
  prisma: PrismaClient,
  redis: Redis,
  timeoutSeconds = 5
): Promise<AuditEvent | null> {
  const job = await dequeueAuditEvent(redis, timeoutSeconds);
  if (!job) return null;
  return applyAuditEventJob(prisma, job);
}
