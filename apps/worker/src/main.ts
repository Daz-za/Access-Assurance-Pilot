import path from "node:path";
import dotenv from "dotenv";
import { prisma } from "db";
import { createRedisClient } from "queue";
import { heartbeatLog } from "./heartbeat";
import { runConsumerLoop } from "./queueConsumer";

// pnpm workspace scripts run with cwd set to the package directory
// (apps/worker), so the default dotenv.config() would only ever look for
// apps/worker/.env. Point it at the repo-root .env explicitly — same fix
// apps/api/src/main.ts already needed (see docs/STATE.md).
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

console.log("Worker started.");
setInterval(() => {
  console.log(...heartbeatLog());
}, 15000);

const redis = createRedisClient();

// Real async work (Phase 1 roadmap item): consume audit-event jobs enqueued
// by apps/api's decision route and write the AuditEvent rows here — the only
// place that does so now that the API route no longer writes them directly.
runConsumerLoop(prisma, redis, {
  onEvent: (event) => {
    console.log(`Worker: wrote audit event ${event.id} (${event.campaignId}/${event.userId})`);
  },
  onError: (error) => {
    console.error("Worker: queue consumer error", error);
  },
}).catch((error) => {
  console.error("Worker: queue consumer loop exited unexpectedly", error);
  process.exit(1);
});
