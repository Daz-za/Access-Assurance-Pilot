import type { PrismaClient } from "@prisma/client";

// Single source of truth for the Phase 1 demo fixture data. Consumed by:
//   - apps/api/src/db/seed.ts (the real `pnpm seed` / `make seed` flow)
//   - apps/api/test/setup.ts (test isolation: reset + reseed before each test)
//
// This is a 1:1 port of the data that used to live in
// apps/api/src/data/demo.ts, so the seeded state matches what the demo
// flow/tests already expect: 2 systems, 2 users, 1 campaign, 2 pending review
// items, 3 access assignments, and one pre-existing audit trail entry for
// camp-1:user-1.

/**
 * Deletes all rows from every domain table, in FK-safe order. Use before
 * `seedDemoData` to guarantee a known starting state (this is what makes the
 * apps/api integration tests repeatable against a real Postgres instance).
 */
export async function resetDatabase(client: PrismaClient): Promise<void> {
  await client.auditEvent.deleteMany();
  await client.reviewDecision.deleteMany();
  await client.reviewItem.deleteMany();
  await client.accessAssignment.deleteMany();
  await client.campaign.deleteMany();
  await client.appUser.deleteMany();
  await client.system.deleteMany();
}

/**
 * Populates the fixture data the demo flow expects. Assumes an empty (or
 * freshly reset) database — call `resetDatabase` first if the tables might
 * already contain rows from a previous run.
 */
export async function seedDemoData(client: PrismaClient): Promise<void> {
  await client.system.createMany({
    data: [
      { id: "sys-1", name: "SAP", type: "erp", connectionStatus: "connected" },
      { id: "sys-2", name: "AD", type: "directory", connectionStatus: "connected" },
      { id: "sys-3", name: "CSV Upload", type: "custom", connectionStatus: "connected" },
    ],
  });

  await client.appUser.createMany({
    data: [
      {
        id: "user-1",
        displayName: "John Smith",
        email: "john.smith@example.com",
        department: "Finance",
      },
      {
        id: "user-2",
        displayName: "Amy Ndlovu",
        email: "amy.ndlovu@example.com",
        department: "IT",
      },
    ],
  });

  await client.campaign.create({
    data: { id: "camp-1", name: "Q2 Access Review", status: "active" },
  });

  await client.accessAssignment.createMany({
    data: [
      {
        id: "asg-1",
        userId: "user-1",
        systemId: "sys-1",
        roleName: "FI Admin",
        risk: "critical",
        message: "SoD violation: FI Admin + AP Payments",
      },
      {
        id: "asg-2",
        userId: "user-1",
        systemId: "sys-2",
        roleName: "Standard User",
        risk: "ok",
        message: "No issue detected",
      },
      {
        id: "asg-3",
        userId: "user-2",
        systemId: "sys-2",
        roleName: "Global Admin",
        risk: "critical",
        message: "Privileged role requires enhanced review",
      },
      // Phase 1 part 2: asg-1's "FI Admin" role alone never actually
      // triggered the SoD policy (infra/opa/data/policy-data.json's only
      // configured pair is ["FI Admin", "AP Payments"]) — user-1 needs both
      // roles assigned for evaluateSodPolicy to produce a real, non-empty
      // deny (via OPA or the local fallback). Without this row, the "SoD
      // conflict" label on ri-1 was cosmetic; asg-1's message field
      // described a violation the actual assignment data couldn't reproduce.
      {
        id: "asg-4",
        userId: "user-1",
        systemId: "sys-1",
        roleName: "AP Payments",
        risk: "critical",
        message: "SoD violation: FI Admin + AP Payments",
      },
    ],
  });

  await client.reviewItem.createMany({
    data: [
      {
        id: "ri-1",
        campaignId: "camp-1",
        userId: "user-1",
        systemName: "SAP",
        roleName: "FI Admin",
        issue: "SoD conflict",
        severity: "High",
        status: "pending",
      },
      {
        id: "ri-2",
        campaignId: "camp-1",
        userId: "user-2",
        systemName: "AD",
        roleName: "Global Admin",
        issue: "Privileged access",
        severity: "Critical",
        status: "pending",
      },
    ],
  });

  await client.auditEvent.createMany({
    data: [
      {
        id: "evt-1",
        campaignId: "camp-1",
        userId: "user-1",
        timestamp: new Date("2026-04-08T09:00:00Z"),
        description: "Access snapshot captured",
      },
      {
        id: "evt-2",
        campaignId: "camp-1",
        userId: "user-1",
        timestamp: new Date("2026-04-08T09:05:00Z"),
        description: "Review assigned to manager",
      },
    ],
  });
}
