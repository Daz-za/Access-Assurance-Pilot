#!/usr/bin/env node
// Thin wrapper so `prisma migrate dev|deploy` (invoked via
// `pnpm --filter db run migrate:dev|migrate:deploy`, or transitively via
// `pnpm --filter api run migrate` / `make migrate`) can find DATABASE_URL.
//
// Unlike apps/api's own dotenv.config({ path: ... }) calls, the Prisma CLI
// does its own env loading and only looks for a .env next to schema.prisma
// or in its current working directory — neither of which is the repo root
// .env that .env.example documents and apps/api actually reads. Load it
// explicitly here instead of duplicating a second .env inside packages/db.
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const [, , ...prismaArgs] = process.argv;

const result = spawnSync("prisma", prismaArgs, {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

process.exit(result.status ?? 1);
