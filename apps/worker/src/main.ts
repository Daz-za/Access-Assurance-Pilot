import dotenv from "dotenv";

dotenv.config();

console.log("Worker started.");
setInterval(() => {
  console.log("Worker heartbeat", new Date().toISOString());
}, 15000);
