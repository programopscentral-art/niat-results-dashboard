import crypto from 'node:crypto';
import { config } from './config.js';

// Sign/verify webhook payloads so only our Apps Script bridge can trigger a sync.
export function sign(body: string): string {
  return crypto.createHmac('sha256', config.webhookSecret).update(body).digest('hex');
}

export function verify(body: string, signature: string | undefined): boolean {
  if (!signature) return false;
  const expected = sign(body);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
