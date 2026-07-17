import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });

import { prisma, resetDatabase, seedDemoData } from "db";

async function main() {
  await resetDatabase(prisma);
  await seedDemoData(prisma);
  console.log("Seed complete: 2 systems, 2 users, 1 campaign, 2 review items, 4 assignments, 2 audit events.");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
