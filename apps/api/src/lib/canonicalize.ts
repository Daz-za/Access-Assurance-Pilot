import crypto from 'crypto';

export const canonicalize = {
  payload(payload: any): string {
    return JSON.stringify(payload, Object.keys(payload).sort());
  },

  hash(payload: any): string {
    const canonicalized = this.payload(payload);
    return crypto.createHash('sha256').update(canonicalized).digest('hex');
  },
};