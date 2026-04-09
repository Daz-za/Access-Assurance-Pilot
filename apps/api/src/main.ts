import Fastify from "fastify";
import cors from "@fastify/cors";
import dotenv from "dotenv";
import { dashboard, inboxItems, reviewDetails, auditByReview } from "./data/demo";
import { evaluateSodPolicy } from "./lib/opa";

dotenv.config();

async function start() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });

  app.get("/health/live", async () => ({ status: "ok" }));

  app.get("/health/ready", async () => ({
    status: "ready",
    services: { api: "ok" },
  }));

  app.get("/me", async () => ({
    id: "demo-admin",
    displayName: "Darren Lentz",
    email: "darren@example.com",
    roles: ["admin"],
  }));

  app.get("/dashboard", async () => dashboard);

  app.get("/inbox", async () => ({
    items: inboxItems.filter((item) => item.status === "pending"),
  }));

  app.get("/reviews/:campaignId/users/:userId", async (request, reply) => {
    const { campaignId, userId } = request.params as { campaignId: string; userId: string };
    const key = `${campaignId}:${userId}`;
    const detail = reviewDetails[key as keyof typeof reviewDetails];

    if (!detail) {
      return reply.status(404).send({ message: "Review detail not found" });
    }

    return detail;
  });

  app.post("/reviews/:campaignId/users/:userId/decision", async (request, reply) => {
    const { campaignId, userId } = request.params as { campaignId: string; userId: string };
    const body = request.body as {
      decision: "approve_all" | "revoke_selected" | "flag_follow_up";
      comment?: string;
      selectedAssignmentIds?: string[];
    };

    const key = `${campaignId}:${userId}`;
    const detail = reviewDetails[key as keyof typeof reviewDetails];

    if (!detail) {
      return reply.status(404).send({ message: "Review detail not found" });
    }

    const policyResult = await evaluateSodPolicy(detail.assignments.map((a) => a.roleName));

    const matchingInboxItem = inboxItems.find(
      (item) => item.campaignId === campaignId && item.userId === userId
    );

    if (matchingInboxItem) {
      matchingInboxItem.status = "completed";
    }

    if (!auditByReview[key]) {
      auditByReview[key] = {
        campaign: { id: campaignId, name: detail.campaignName },
        user: { id: userId, displayName: detail.userName },
        events: [],
        evidence: [],
      };
    }

    auditByReview[key].events.push({
      id: `evt-${Date.now()}`,
      timestamp: new Date().toISOString(),
      description: `Decision submitted: ${body.decision}${
        policyResult?.result?.deny?.length ? " (policy flags present)" : ""
      }`,
    });

    auditByReview[key].evidence.push({
      id: `evi-${Date.now()}`,
      label: "Reviewer decision record",
    });

    return {
      ok: true,
      decision: body.decision,
      comment: body.comment || null,
      policyResult,
    };
  });

  app.get("/audit/campaigns/:campaignId/users/:userId", async (request, reply) => {
    const { campaignId, userId } = request.params as { campaignId: string; userId: string };
    const key = `${campaignId}:${userId}`;
    const audit = auditByReview[key];

    if (!audit) {
      return reply.status(404).send({ message: "Audit trail not found" });
    }

    return audit;
  });

  app.get("/violations", async () => ({
    items: inboxItems
      .filter((item) => item.status === "pending")
      .map((item) => ({
        userId: item.userId,
        userName: item.userName,
        campaignId: item.campaignId,
        issueType: item.issue,
        issueLabel: item.issue,
        systems: [item.systemName],
        severity: item.severity,
      })),
  }));

  app.get("/admin/systems", async () => ({
    items: [
      { id: "sys-1", name: "SAP", type: "erp", connectionStatus: "connected" },
      { id: "sys-2", name: "AD", type: "directory", connectionStatus: "connected" },
      { id: "sys-3", name: "CSV Upload", type: "custom", connectionStatus: "connected" },
    ],
  }));

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

  const port = Number(process.env.API_PORT || 4000);
  await app.listen({ port, host: "0.0.0.0" });
  app.log.info(`API running on ${port}`);
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});