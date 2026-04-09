import React, { useEffect, useState } from "react";
import { apiGet, apiPost } from "./lib/api";

type DashboardResponse = {
  activeCampaigns: number;
  pendingReviews: number;
  violationsDetected: number;
  overdueTasks: number;
};

type InboxItem = {
  id: string;
  campaignId: string;
  userId: string;
  userName: string;
  department: string;
  systemName: string;
  roleName: string;
  issue: string;
  severity: string;
};

type ReviewDetail = {
  campaignId: string;
  campaignName: string;
  userId: string;
  userName: string;
  department: string;
  reviewerName: string;
  assignments: Array<{
    id: string;
    systemName: string;
    roleName: string;
    risk: string;
    message: string;
  }>;
};

type AuditResponse = {
  campaign: { id: string; name: string };
  user: { id: string; displayName: string };
  events: Array<{ id: string; timestamp: string; description: string }>;
};

const shellStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "linear-gradient(180deg, #0f172a 0%, #020617 100%)",
  color: "white",
  fontFamily: "Inter, Arial, sans-serif",
};

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 20,
  padding: 20,
};

function App() {
  const [view, setView] = useState<"dashboard" | "inbox" | "audit">("dashboard");
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [selected, setSelected] = useState<ReviewDetail | null>(null);
  const [audit, setAudit] = useState<AuditResponse | null>(null);
  const [comment, setComment] = useState("");

  useEffect(() => {
    apiGet<DashboardResponse>("/dashboard").then(setDashboard).catch(console.error);
    apiGet<{ items: InboxItem[] }>("/inbox")
      .then((r) => setInbox(r.items))
      .catch(console.error);
  }, []);

  async function openReview(item: InboxItem) {
    const detail = await apiGet<ReviewDetail>(
      `/reviews/${item.campaignId}/users/${item.userId}`
    );
    setSelected(detail);
  }

  async function submitDecision(decision: "approve_all" | "revoke_selected" | "flag_follow_up") {
    if (!selected) return;

    await apiPost(`/reviews/${selected.campaignId}/users/${selected.userId}/decision`, {
      decision,
      comment,
      selectedAssignmentIds:
        decision === "revoke_selected"
          ? selected.assignments.filter((a) => a.risk !== "ok").map((a) => a.id)
          : [],
    });

    const updatedInbox = await apiGet<{ items: InboxItem[] }>("/inbox");
    setInbox(updatedInbox.items);
    setSelected(null);
    setComment("");
    setView("audit");

    const auditData = await apiGet<AuditResponse>(
      `/audit/campaigns/${selected.campaignId}/users/${selected.userId}`
    );
    setAudit(auditData);
  }

  return (
    <div style={shellStyle}>
      <div style={{ display: "flex" }}>
        <aside
          style={{
            width: 240,
            borderRight: "1px solid rgba(255,255,255,0.08)",
            minHeight: "100vh",
            padding: 20,
          }}
        >
          <h2 style={{ marginTop: 0 }}>Access Assurance</h2>
          <p style={{ color: "#94a3b8", fontSize: 14 }}>Pilot demo</p>

          <div style={{ display: "grid", gap: 10, marginTop: 30 }}>
            <button onClick={() => setView("dashboard")}>Dashboard</button>
            <button onClick={() => setView("inbox")}>Inbox</button>
            <button onClick={() => setView("audit")}>Audit</button>
          </div>
        </aside>

        <main style={{ flex: 1, padding: 24 }}>
          <h1 style={{ marginTop: 0 }}>Access Assurance Hub</h1>
          <p style={{ color: "#94a3b8" }}>
            Unified access reviews, policy flags, and audit-ready evidence.
          </p>

          {view === "dashboard" && dashboard && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
              <div style={cardStyle}>
                <div>Active Campaigns</div>
                <h2>{dashboard.activeCampaigns}</h2>
              </div>
              <div style={cardStyle}>
                <div>Pending Reviews</div>
                <h2>{dashboard.pendingReviews}</h2>
              </div>
              <div style={cardStyle}>
                <div>Violations Detected</div>
                <h2>{dashboard.violationsDetected}</h2>
              </div>
              <div style={cardStyle}>
                <div>Overdue Tasks</div>
                <h2>{dashboard.overdueTasks}</h2>
              </div>
            </div>
          )}

          {view === "inbox" && (
            <div style={{ marginTop: 20, ...cardStyle }}>
              <h2>Inbox</h2>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th align="left">User</th>
                    <th align="left">Department</th>
                    <th align="left">System</th>
                    <th align="left">Role</th>
                    <th align="left">Issue</th>
                    <th align="left">Severity</th>
                    <th align="left">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {inbox.map((row) => (
                    <tr key={row.id}>
                      <td>{row.userName}</td>
                      <td>{row.department}</td>
                      <td>{row.systemName}</td>
                      <td>{row.roleName}</td>
                      <td>{row.issue}</td>
                      <td>{row.severity}</td>
                      <td>
                        <button onClick={() => openReview(row)}>Review</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {view === "audit" && audit && (
            <div style={{ marginTop: 20, ...cardStyle }}>
              <h2>Audit Trail</h2>
              <p>
                <strong>{audit.user.displayName}</strong> · {audit.campaign.name}
              </p>
              <ul>
                {audit.events.map((event) => (
                  <li key={event.id}>
                    {event.timestamp} — {event.description}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </main>

        {selected && (
          <div
            style={{
              width: 420,
              borderLeft: "1px solid rgba(255,255,255,0.08)",
              padding: 20,
              background: "rgba(2,6,23,0.9)",
            }}
          >
            <h2>{selected.userName}</h2>
            <p style={{ color: "#94a3b8" }}>
              {selected.department} · Reviewer: {selected.reviewerName}
            </p>

            <h3>Assignments</h3>
            <ul>
              {selected.assignments.map((a) => (
                <li key={a.id}>
                  {a.systemName} · {a.roleName} · {a.risk} · {a.message}
                </li>
              ))}
            </ul>

            <h3>Comment</h3>
            <textarea
              style={{ width: "100%", minHeight: 100 }}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />

            <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
              <button onClick={() => submitDecision("approve_all")}>Approve all</button>
              <button onClick={() => submitDecision("revoke_selected")}>Revoke risk items</button>
              <button onClick={() => submitDecision("flag_follow_up")}>Flag follow-up</button>
              <button onClick={() => setSelected(null)}>Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;