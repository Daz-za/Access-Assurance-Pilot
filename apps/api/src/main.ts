import path from "node:path";
import dotenv from "dotenv";
import { buildApp } from "./app";

// pnpm workspace scripts run with cwd set to the package directory
// (apps/api), so the default dotenv.config() would only ever look for
// apps/api/.env. Point it at the repo-root .env (where DATABASE_URL etc.
// live, per .env.example) explicitly. Falls back to whatever is already in
// process.env (e.g. CI) if the file doesn't exist — dotenv never overrides
// existing env vars.
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

async function start() {
  const app = await buildApp();

  const port = Number(process.env.API_PORT || 4000);
  await app.listen({ port, host: "0.0.0.0" });
  app.log.info(`API running on ${port}`);
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
