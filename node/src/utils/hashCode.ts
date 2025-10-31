import crypto from 'crypto';
export function hashCode(code: string) {
  return crypto.createHash('sha256').update(code).digest('hex');
}
