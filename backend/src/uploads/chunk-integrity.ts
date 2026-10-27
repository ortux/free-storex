import * as crypto from 'crypto';

export interface StoredChunkIntegrity {
  originalSize: number;
  checksum: string;
}

export function matchesStoredChunk(existing: StoredChunkIntegrity, plaintext: Buffer): boolean {
  if (existing.originalSize !== plaintext.length) return false;
  const checksum = crypto.createHash('sha256').update(plaintext).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(existing.checksum, 'hex'), Buffer.from(checksum, 'hex'));
}