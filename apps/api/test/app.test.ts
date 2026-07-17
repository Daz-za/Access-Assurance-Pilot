import { describe, it, expect, beforeAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";

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

  it("submitting a decision mutates inbox status and appends an audit event", async () => {
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

    const after = await app.inject({ method: "GET", url: "/inbox" });
    const afterItems = after.json().items as Array<{ id: string }>;
    expect(afterItems.some((item) => item.id === "ri-1")).toBe(false);

    const auditRes = await app.inject({
      method: "GET",
      url: "/audit/campaigns/camp-1/users/user-1",
    });

    expect(auditRes.statusCode).toBe(200);
    const auditBody = auditRes.json() as {
      events: Array<{ description: string }>;
    };
    expect(auditBody.events.length).toBeGreaterThan(0);
    expect(
      auditBody.events.some((event) => event.description.includes("Decision submitted: approve_all"))
    ).toBe(true);
  });
});
