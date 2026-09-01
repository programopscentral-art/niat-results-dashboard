import crypto from 'node:crypto';

// Stable hash of a normalized row so we only write rows that actually changed.
export function rowHash(obj: unknown): string {
  return crypto.createHash('sha1').update(JSON.stringify(obj)).digest('hex');
}
