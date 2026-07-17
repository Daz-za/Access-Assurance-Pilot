import dotenv from "dotenv";
import { heartbeatLog } from "./heartbeat";

dotenv.config();

console.log("Worker started.");
setInterval(() => {
  console.log(...heartbeatLog());
}, 15000);
