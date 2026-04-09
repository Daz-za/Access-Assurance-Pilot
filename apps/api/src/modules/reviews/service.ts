import { prisma } from '../../lib/db';
import { opa } from '../../lib/opa';
import { canonicalize } from '../../lib/canonicalize';

export const reviewsService = {
  async getReview(id: string) {
    const review = await prisma.reviewItem.findUnique({
      where: { id },
      include: {
        accessAssignment: {
          include: {
            user: true,
            system: true,
          },
        },
        reviewDecisions: true,
      },
    });

    if (!review) return null;

    // Check policies
    const privileged = await opa.checkPrivileged(review.accessAssignment.userId, review.accessAssignment.systemId);
    const sod = await opa.checkSoD(review.accessAssignment.userId, [review.accessAssignment.role]);

    return {
      ...review,
      policies: {
        privileged,
        sod,
      },
    };
  },

  async submitDecision(id: string, decision: any) {
    const review = await prisma.reviewItem.findUnique({ where: { id } });
    if (!review) throw new Error('Review not found');

    // Create decision
    await prisma.reviewDecision.create({
      data: {
        reviewItemId: id,
        reviewerId: decision.reviewerId,
        decision: decision.decision,
        comments: decision.comments,
      },
    });

    // Update review status
    await prisma.reviewItem.update({
      where: { id },
      data: { status: 'completed' },
    });

    // Create audit event
    const auditEvent = await prisma.auditEvent.create({
      data: {
        campaignId: review.campaignId,
        userId: decision.reviewerId,
        eventType: 'decision.submitted',
        description: `Decision submitted for review ${id}`,
        payloadJson: decision,
        hash: canonicalize.hash(decision),
      },
    });

    // Enqueue jobs (simplified - in real implementation use BullMQ)
    console.log('Enqueue anchor job for event', auditEvent.id);
    console.log('Enqueue evidence job for review', id);

    return { success: true };
  },
};