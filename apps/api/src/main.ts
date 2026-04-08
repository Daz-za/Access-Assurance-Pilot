import Fastify from "fastify";

const app = Fastify();

app.get("/health/live", async () => ({ status: "ok" }));

app.get("/me", async () => ({
  id: "1",
  displayName: "Demo User",
  role: "admin"
}));

app.get("/dashboard", async () => ({
  activeCampaigns: 3,
  pendingReviews: 12
}));

app.listen({ port: 4000, host: "0.0.0.0" }).then(() => {
  console.log("API running on 4000");
});
