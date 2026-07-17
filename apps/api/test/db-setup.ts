import { beforeEach, afterAll } from "vitest";
import { prisma, resetDatabase, seedDemoData } from "db";

// Integration tests hit a real Postgres instance (see docs/decisions/0004 and
// ENGINEERING_STANDARDS.md — no mocked Prisma client). Resetting to the known
// fixture set before every test is what makes that repeatable: each test
// starts from the same 2 systems/2 users/1 campaign/2 review items/3
// assignments/2 audit events, regardless of what a previous test run left
// behind.
beforeEach(async () => {
  await resetDatabase(prisma);
  await seedDemoData(prisma);
});

afterAll(async () => {
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
