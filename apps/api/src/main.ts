import dotenv from "dotenv";
import { buildApp } from "./app";

dotenv.config();

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
