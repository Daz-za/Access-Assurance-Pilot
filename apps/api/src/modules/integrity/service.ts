import { prisma } from '../../lib/db';
import { rekor } from '../../lib/rekor';
import { canonicalize } from '../../lib/canonicalize';

export const integrityService = {
  async anchorAuditEvent(eventId: string) {
    const event = await prisma.auditEvent.findUnique({ where: { id: eventId } });
    if (!event) throw new Error('Event not found');

    const payload = {
      eventId: event.id,
      eventType: event.eventType,
      payload: event.payloadJson,
      timestamp: event.createdAt.toISOString(),
    };

    const rekorResponse = await rekor.submitEntry(payload);

    await prisma.auditAnchor.create({
      data: {
        auditEventId: eventId,
        hash: event.hash,
        rekorUuid: rekorResponse.uuid,
        rekorLogIndex: rekorResponse.logIndex,
        integratedTime: new Date(rekorResponse.integratedTime * 1000),
        inclusionProofJson: rekorResponse.inclusionProof,
        verificationStatus: 'verified',
      },
    });

    return rekorResponse;
  },
};