import jwt from 'jsonwebtoken';
import { UploadTokenService } from '../uploads/upload-token.service';

jest.mock('../config', () => ({
  config: { upload: { tokenSecret: 'upload-token-test-secret', tokenTtlSeconds: 900 } },
}));

describe('UploadTokenService', () => {
  const service = new UploadTokenService();
  const payload = {
    purpose: 'resumable-chunk' as const,
    uploadId: 'session-1',
    userId: 'user-1',
    mimeType: 'application/octet-stream',
    fileSize: 1024,
    originalFilename: 'test.bin',
  };

  it('preserves a token purpose when signing and verifying', () => {
    expect(service.verify(service.sign(payload))).toEqual(payload);
  });

  it('rejects tokens without a recognized purpose', () => {
    const token = jwt.sign({ ...payload, purpose: 'unscoped' }, 'upload-token-test-secret', {
      expiresIn: '15m',
      algorithm: 'HS256',
    });

    expect(() => service.verify(token)).toThrow('Invalid upload token payload');
  });
});
