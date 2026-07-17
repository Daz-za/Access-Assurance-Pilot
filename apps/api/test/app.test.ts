import { describe, it, expect, beforeAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "db";
import { buildApp } from "../src/app";

/**
 * Audit-event writing is now async (Phase 1 part 2: apps/api enqueues onto
 * Redis, apps/worker — or, in this test suite, the inline stand-in consumer
 * in test/db-setup.ts — is what actually writes the row). Poll instead of
 * assuming the row exists immediately after the decision response returns.
 */
async function pollForAuditEvent(
  app: FastifyInstance,
  campaignId: string,
  userId: string,
  predicate: (events: Array<{ description: string }>) => boolean,
  { timeoutMs = 2000, intervalMs = 50 } = {}
): Promise<Array<{ description: string }>> {
  const deadline = Date.now() + timeoutMs;
  let lastEvents: Array<{ description: string }> = [];

  while (Date.now() < deadline) {
    const res = await app.inject({ method: "GET", url: `/audit/campaigns/${campaignId}/users/${userId}` });
    if (res.statusCode === 200) {
      lastEvents = (res.json() as { events: Array<{ description: string }> }).events;
      if (predicate(lastEvents)) {
        return lastEvents;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for the audit trail to match. Last seen: ${JSON.stringify(lastEvents)}`
  );
}

describe("api app", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  it("responds to /health/live", async () => {
    const res = await app.inject({ method: "GET", url: "/health/live" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });

  it("serves the dashboard summary", async () => {
    const res = await app.inject({ method: "GET", url: "/dashboard" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      activeCampaigns: expect.any(Number),
      pendingReviews: expect.any(Number),
      violationsDetected: expect.any(Number),
      overdueTasks: expect.any(Number),
    });
  });

  it("lists pending inbox items", async () => {
    const res = await app.inject({ method: "GET", url: "/inbox" });
    expect(res.statusCode).toBe(200);

    const body = res.json() as { items: Array<{ id: string; status: string }> };
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.every((item) => item.status === "pending")).toBe(true);
    expect(body.items.some((item) => item.id === "ri-1")).toBe(true);
  });

  it("404s for an unknown review detail", async () => {
    const res = await app.inject({ method: "GET", url: "/reviews/camp-x/users/user-x" });
    expect(res.statusCode).toBe(404);
  });

  it("submitting a decision mutates inbox status and appends an audit event, honestly tagged as a degraded OPA evaluation", async () => {
    const before = await app.inject({ method: "GET", url: "/inbox" });
    const beforeItems = before.json().items as Array<{ id: string }>;
    expect(beforeItems.some((item) => item.id === "ri-1")).toBe(true);

    const decisionRes = await app.inject({
      method: "POST",
      url: "/reviews/camp-1/users/user-1/decision",
      payload: { decision: "approve_all", comment: "looks fine" },
    });

    expect(decisionRes.statusCode).toBe(200);
    const decisionBody = decisionRes.json();
    expect(decisionBody.ok).toBe(true);
    expect(decisionBody.decision).toBe("approve_all");
    expect(decisionBody.comment).toBe("looks fine");

    // No OPA instance runs in this test environment, so this decision is
    // expected to exercise the *degraded* fallback path honestly — not a
    // mocked "success" response. See apps/api/test/opa.test.ts for the
    // unit-level coverage of the non-degraded (OPA reachable) path.
    expect(decisionBody.policyResult.degraded).toBe(true);
    expect(decisionBody.policyResult.degradedReason).toMatch(/OPA unreachable/);
    // user-1 has both roles of the seeded SoD pair (FI Admin + AP Payments,
    // see packages/db/src/seed-data.ts) — the local fallback must actually
    // detect it, driven by infra/opa/data/policy-data.json, not silently
    // report an empty/allow result.
    expect(decisionBody.policyResult.result.deny).toEqual(["SoD violation: FI Admin + AP Payments"]);

    const after = await app.inject({ method: "GET", url: "/inbox" });
    const afterItems = after.json().items as Array<{ id: string }>;
    expect(afterItems.some((item) => item.id === "ri-1")).toBe(false);

    const events = await pollForAuditEvent(app, "camp-1", "user-1", (evts) =>
      evts.some((event) => event.description.includes("Decision submitted: approve_all"))
    );

    const decisionEvent = events.find((event) => event.description.includes("Decision submitted: approve_all"));
    expect(decisionEvent).toBeDefined();
    // The audit trail — what an auditor actually reads — must never make a
    // degraded evaluation look identical to a real one: both the policy
    // flag and the degraded fallback must be legible in the description.
    expect(decisionEvent!.description).toContain("(policy flags present)");
    expect(decisionEvent!.description).toContain("(degraded: OPA unreachable");
    expect(decisionEvent!.description).toContain("local fallback used)");

    // Also verify persistence directly against Postgres, not just the HTTP
    // echo: the full policyResult (including degraded/degradedReason) must
    // be in the stored ReviewDecision row, per the Phase 1 roadmap's "audit
    // trail served from the database" requirement.
    const stored = await prisma.reviewDecision.findFirst({
      where: { reviewItem: { campaignId: "camp-1", userId: "user-1" } },
      orderBy: { decidedAt: "desc" },
    });
    expect(stored).not.toBeNull();
    const storedPolicyResult = stored?.policyResult as { degraded?: boolean; degradedReason?: string } | null;
    expect(storedPolicyResult?.degraded).toBe(true);
    expect(storedPolicyResult?.degradedReason).toMatch(/OPA unreachable/);
  });
});
