import { prisma } from '../../lib/db';
import { storage } from '../../lib/storage';
import fs from 'fs';
import path from 'path';

export const evidenceService = {
  async generateEvidence(reviewId: string) {
    const review = await prisma.reviewItem.findUnique({
      where: { id: reviewId },
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

    if (!review) throw new Error('Review not found');

    // Generate evidence document
    const evidence = {
      reviewId,
      user: review.accessAssignment.user.name,
      system: review.accessAssignment.system.name,
      role: review.accessAssignment.role,
      decisions: review.reviewDecisions,
      generatedAt: new Date().toISOString(),
    };

    // Write to temp file
    const tempFile = path.join('/tmp', `evidence-${reviewId}.json`);
    fs.writeFileSync(tempFile, JSON.stringify(evidence, null, 2));

    // Upload to MinIO
    const artifactUrl = await storage.uploadEvidence('access-assurance-evidence', `evidence-${reviewId}.json`, tempFile);

    // Save to DB
    await prisma.evidenceItem.create({
      data: {
        auditEventId: reviewId, // Assuming reviewId maps to eventId
        artifactUrl,
        hash: require('crypto').createHash('sha256').update(JSON.stringify(evidence)).digest('hex'),
      },
    });

    // Clean up
    fs.unlinkSync(tempFile);

    return artifactUrl;
  },
};