import { prisma } from '../../lib/db';

export const dashboardService = {
  async getDashboard() {
    // Return dashboard data
    return {
      campaigns: [],
      pendingReviews: 0,
      completedReviews: 0,
    };
  },
};