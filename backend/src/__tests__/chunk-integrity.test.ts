import * as crypto from 'crypto';
import { matchesStoredChunk } from '../uploads/chunk-integrity';

function storedChunk(plaintext: Buffer) {
  return {
    originalSize: plaintext.length,
    checksum: crypto.createHash('sha256').update(plaintext).digest('hex'),
  };
}

describe('chunk retry integrity', () => {
  it('accepts a retry containing the exact previously uploaded bytes', () => {
    const plaintext = Buffer.from('same chunk bytes');

    expect(matchesStoredChunk(storedChunk(plaintext), Buffer.from(plaintext))).toBe(true);
  });

  it('rejects a retry with different bytes even when the length matches', () => {
    expect(matchesStoredChunk(storedChunk(Buffer.from('first chunk')), Buffer.from('other chunk'))).toBe(false);
  });

  it('rejects a retry with a different length', () => {
    expect(matchesStoredChunk(storedChunk(Buffer.from('first chunk')), Buffer.from('short'))).toBe(false);
  });
});