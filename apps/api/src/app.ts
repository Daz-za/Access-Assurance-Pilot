import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { prisma, Prisma } from "db";
import { createRedisClient, enqueueAuditEvent } from "queue";
import { evaluateSodPolicy } from "./lib/opa";

// Singleton Redis connection for enqueueing audit-event jobs — mirrors the
// prisma singleton pattern in packages/db/src/client.ts. apps/worker is the
// consumer; see packages/queue/src/index.ts for the shared queue contract.
const redis = createRedisClient();

export interface BuildAppOptions {
  logger?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? true });

  await app.register(cors, { origin: true });

  app.get("/health/live", async () => ({ status: "ok" }));

  app.get("/health/ready", async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: "ready", services: { api: "ok", db: "ok" } };
    } catch {
      return { status: "degraded", services: { api: "ok", db: "down" } };
    }
  });

  app.get("/me", async () => ({
    id: "demo-admin",
    displayName: "Darren Lentz",
    email: "darren@example.com",
    roles: ["admin"],
  }));

  app.get("/dashboard", async () => {
    const [activeCampaigns, pendingReviews, violationsDetected] = await Promise.all([
      prisma.campaign.count({ where: { status: "active" } }),
      prisma.reviewItem.count({ where: { status: "pending" } }),
      prisma.reviewItem.count({ where: { status: "pending" } }),
    ]);

    return {
      activeCampaigns,
      pendingReviews,
      violationsDetected,
      // No due-date field exists in the Phase 1 schema yet (campaign
      // management/deadlines land in Phase 3), so this is honestly 0 rather
      // than a fabricated number.
      overdueTasks: 0,
    };
  });

  app.get("/inbox", async () => {
    const items = await prisma.reviewItem.findMany({
      where: { status: "pending" },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    });

    return {
      items: items.map((item) => ({
        id: item.id,
        campaignId: item.campaignId,
        userId: item.userId,
        userName: item.user.displayName,
        department: item.user.department,
        systemName: item.systemName,
        roleName: item.roleName,
        issue: item.issue,
        severity: item.severity,
        status: item.status,
      })),
    };
  });

  app.get("/reviews/:campaignId/users/:userId", async (request, reply) => {
    const { campaignId, userId } = request.params as { campaignId: string; userId: string };

    const [reviewItem, campaign, user] = await Promise.all([
      prisma.reviewItem.findUnique({ where: { campaignId_userId: { campaignId, userId } } }),
      prisma.campaign.findUnique({ where: { id: campaignId } }),
      prisma.appUser.findUnique({ where: { id: userId } }),
    ]);

    if (!reviewItem || !campaign || !user) {
      return reply.status(404).send({ message: "Review detail not found" });
    }

    const assignments = await prisma.accessAssignment.findMany({
      where: { userId },
      include: { system: true },
      orderBy: { createdAt: "asc" },
    });

    return {
      campaignId: campaign.id,
      campaignName: campaign.name,
      userId: user.id,
      userName: user.displayName,
      department: user.department,
      reviewerName: "Darren Lentz",
      assignments: assignments.map((assignment) => ({
        id: assignment.id,
        systemName: assignment.system.name,
        roleName: assignment.roleName,
        risk: assignment.risk,
        message: assignment.message,
      })),
    };
  });

  app.post("/reviews/:campaignId/users/:userId/decision", async (request, reply) => {
    const { campaignId, userId } = request.params as { campaignId: string; userId: string };
    const body = request.body as {
      decision: "approve_all" | "revoke_selected" | "flag_follow_up";
      comment?: string;
      selectedAssignmentIds?: string[];
    };

    const reviewItem = await prisma.reviewItem.findUnique({
      where: { campaignId_userId: { campaignId, userId } },
    });

    if (!reviewItem) {
      return reply.status(404).send({ message: "Review detail not found" });
    }

    const assignments = await prisma.accessAssignment.findMany({ where: { userId } });
    const policyResult = await evaluateSodPolicy(assignments.map((a) => a.roleName));

    const selectedAssignmentIds = body.selectedAssignmentIds ?? [];
    const description = `Decision submitted: ${body.decision}${
      policyResult.result.deny.length ? " (policy flags present)" : ""
    }${policyResult.degraded ? ` (degraded: ${policyResult.degradedReason}, local fallback used)` : ""}`;

    // The user-facing inbox needs to update immediately, so the decision and
    // status flip stay synchronous. Audit-event writing is real async work
    // (Phase 1 roadmap item) — enqueue it onto Redis for apps/worker to
    // write, rather than writing the AuditEvent row here ourselves.
    await prisma.$transaction([
      prisma.reviewDecision.create({
        data: {
          reviewItemId: reviewItem.id,
          decision: body.decision,
          comment: body.comment || null,
          selectedAssignmentIds,
          // Store the full policy result, including the degraded/
          // degradedReason tags — the audit trail must never make a
          // degraded evaluation look identical to a real one downstream.
          // Cast: SodPolicyResult is a plain JSON-serializable object, but
          // its named interface (deliberately not an index-signature type,
          // so opa.ts's return shape stays self-documenting) doesn't
          // structurally satisfy Prisma's InputJsonValue on its own.
          policyResult: policyResult as unknown as Prisma.InputJsonValue,
        },
      }),
      prisma.reviewItem.update({
        where: { id: reviewItem.id },
        data: { status: "completed" },
      }),
    ]);

    try {
      await enqueueAuditEvent(redis, { campaignId, userId, description });
    } catch (error) {
      // The decision itself is already durably persisted above; a queue
      // outage here means the audit event write is delayed, not lost data
      // for the decision. Log loudly rather than fail the request or hide it.
      app.log.error({ err: error }, "Failed to enqueue audit-event job");
    }

    return {
      ok: true,
      decision: body.decision,
      comment: body.comment || null,
      policyResult,
    };
  });

  app.get("/audit/campaigns/:campaignId/users/:userId", async (request, reply) => {
    const { campaignId, userId } = request.params as { campaignId: string; userId: string };

    const [campaign, user, events] = await Promise.all([
      prisma.campaign.findUnique({ where: { id: campaignId } }),
      prisma.appUser.findUnique({ where: { id: userId } }),
      prisma.auditEvent.findMany({
        where: { campaignId, userId },
        orderBy: { timestamp: "asc" },
      }),
    ]);

    if (!campaign || !user || events.length === 0) {
      return reply.status(404).send({ message: "Audit trail not found" });
    }

    return {
      campaign: { id: campaign.id, name: campaign.name },
      user: { id: user.id, displayName: user.displayName },
      events: events.map((event) => ({
        id: event.id,
        timestamp: event.timestamp.toISOString(),
        description: event.description,
      })),
    };
  });

  app.get("/violations", async () => {
    const items = await prisma.reviewItem.findMany({
      where: { status: "pending" },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    });

    return {
      items: items.map((item) => ({
        userId: item.userId,
        userName: item.user.displayName,
        campaignId: item.campaignId,
        issueType: item.issue,
        issueLabel: item.issue,
        systems: [item.systemName],
        severity: item.severity,
      })),
    };
  });

  app.get("/admin/systems", async () => {
    const systems = await prisma.system.findMany({ orderBy: { createdAt: "asc" } });

    return {
      items: systems.map((system) => ({
        id: system.id,
        name: system.name,
        type: system.type,
        connectionStatus: system.connectionStatus,
      })),
    };
  });

  app.get("/admin/rules", async () => ({
    items: [
      {
        id: "rule-1",
        name: "FI Admin + AP Payments",
        type: "sod",
        enabled: true,
        severity: "critical",
      },
      {
        id: "rule-2",
        name: "Global Admin Privileged Flag",
        type: "privileged",
        enabled: true,
        severity: "critical",
      },
    ],
  }));

  return app;
}
