import type { PrismaClient, AuditEvent } from "db";
import type Redis from "ioredis";
import { consumeOne } from "queue";

export interface ConsumerLoopOptions {
  onEvent?: (event: AuditEvent) => void;
  onError?: (error: unknown) => void;
  /** Seconds to block on each Redis BRPOP before looping again. */
  pollTimeoutSeconds?: number;
  /** Checked once per iteration; return true to stop the loop. Defaults to
   * "never stop", which is what the real worker process wants. Tests pass a
   * bounded version so the loop actually terminates. */
  shouldStop?: () => boolean;
  /** Delay (ms) after an error before retrying, so a Redis/Postgres outage
   * doesn't spin the loop hot. */
  errorBackoffMs?: number;
}

/**
 * The worker's queue-consumer logic: repeatedly dequeue+apply one
 * audit-event job (via the shared "queue" package's consumeOne) until told
 * to stop. Extracted from main.ts so it's unit-testable — main.ts just calls
 * this with no shouldStop (runs forever) and console.log-based callbacks.
 */
export async function runConsumerLoop(
  prisma: PrismaClient,
  redis: Redis,
  options: ConsumerLoopOptions = {}
): Promise<void> {
  const { onEvent, onError, pollTimeoutSeconds = 5, shouldStop = () => false, errorBackoffMs = 1000 } = options;

  while (!shouldStop()) {
    try {
      const event = await consumeOne(prisma, redis, pollTimeoutSeconds);
      if (event) {
        onEvent?.(event);
      }
    } catch (error) {
      onError?.(error);
      await new Promise((resolve) => setTimeout(resolve, errorBackoffMs));
    }
  }
}
