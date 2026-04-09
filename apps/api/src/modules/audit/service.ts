import { prisma } from '../../lib/db';

export const auditService = {
  async getAuditByReview(reviewId: string) {
    const review = await prisma.reviewItem.findUnique({
      where: { id: reviewId },
      include: {
        accessAssignment: true,
      },
    });

    if (!review) return [];

    const events = await prisma.auditEvent.findMany({
      where: { campaignId: review.campaignId },
      include: {
        auditAnchors: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return events;
  },
};