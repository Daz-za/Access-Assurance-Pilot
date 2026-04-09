import axios from 'axios';
import crypto from 'crypto';

const REKOR_URL = process.env.REKOR_URL || 'http://localhost:8080';

export const rekor = {
  async submitEntry(payload: any) {
    const canonicalized = JSON.stringify(payload, Object.keys(payload).sort());
    const hash = crypto.createHash('sha256').update(canonicalized).digest('hex');

    const entry = {
      kind: 'hashedrekord',
      apiVersion: '0.0.1',
      spec: {
        data: {
          hash: {
            algorithm: 'sha256',
            value: hash,
          },
        },
        signature: {
          content: Buffer.from(canonicalized).toString('base64'),
          publicKey: {
            content: Buffer.from('dummy-public-key').toString('base64'), // Replace with actual key
          },
        },
      },
    };

    const response = await axios.post(`${REKOR_URL}/api/v1/log/entries`, entry);
    return {
      uuid: response.data.uuid,
      logIndex: response.data.logIndex,
      integratedTime: response.data.integratedTime,
      inclusionProof: response.data.inclusionProof,
    };
  },

  async verifyEntry(uuid: string) {
    const response = await axios.get(`${REKOR_URL}/api/v1/log/entries/${uuid}`);
    return response.data;
  },
};