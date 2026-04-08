export const dashboard = {
  activeCampaigns: 3,
  pendingReviews: 5,
  violationsDetected: 3,
  overdueTasks: 1,
};

export const inboxItems = [
  {
    id: "ri-1",
    campaignId: "camp-1",
    userId: "user-1",
    userName: "John Smith",
    department: "Finance",
    systemName: "SAP",
    roleName: "FI Admin",
    issue: "SoD conflict",
    severity: "High",
    status: "pending",
  },
  {
    id: "ri-2",
    campaignId: "camp-1",
    userId: "user-2",
    userName: "Amy Ndlovu",
    department: "IT",
    systemName: "AD",
    roleName: "Global Admin",
    issue: "Privileged access",
    severity: "Critical",
    status: "pending",
  },
];

export const reviewDetails = {
  "camp-1:user-1": {
    campaignId: "camp-1",
    campaignName: "Q2 Access Review",
    userId: "user-1",
    userName: "John Smith",
    department: "Finance",
    reviewerName: "Darren Lentz",
    assignments: [
      {
        id: "asg-1",
        systemName: "SAP",
        roleName: "FI Admin",
        risk: "critical",
        message: "SoD violation: FI Admin + AP Payments",
      },
      {
        id: "asg-2",
        systemName: "AD",
        roleName: "Standard User",
        risk: "ok",
        message: "No issue detected",
      },
    ],
  },
  "camp-1:user-2": {
    campaignId: "camp-1",
    campaignName: "Q2 Access Review",
    userId: "user-2",
    userName: "Amy Ndlovu",
    department: "IT",
    reviewerName: "Darren Lentz",
    assignments: [
      {
        id: "asg-3",
        systemName: "AD",
        roleName: "Global Admin",
        risk: "critical",
        message: "Privileged role requires enhanced review",
      },
    ],
  },
};

export const auditByReview: Record<string, any> = {
  "camp-1:user-1": {
    campaign: { id: "camp-1", name: "Q2 Access Review" },
    user: { id: "user-1", displayName: "John Smith" },
    events: [
      {
        id: "evt-1",
        timestamp: "2026-04-08T09:00:00Z",
        description: "Access snapshot captured",
      },
      {
        id: "evt-2",
        timestamp: "2026-04-08T09:05:00Z",
        description: "Review assigned to manager",
      },
    ],
    evidence: [
      { id: "evi-1", label: "Access snapshot" },
      { id: "evi-2", label: "Assignment summary" },
    ],
  },
};
