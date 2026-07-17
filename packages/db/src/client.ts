import { PrismaClient } from "@prisma/client";

// Standard singleton pattern so `tsx watch` / hot reload and repeated
// `import { prisma } from "db"` calls across apps/api and apps/worker don't
// each spin up their own connection pool. See
// https://www.prisma.io/docs/orm/more/help-and-troubleshooting/help-articles/nextjs-prisma-client-dev-practices
// for the pattern this mirrors.
declare global {
  var __prismaClient: PrismaClient | undefined;
}

export const prisma: PrismaClient = global.__prismaClient ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.__prismaClient = prisma;
}
