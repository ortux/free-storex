/**
 * UploadTokenService
 *
 * Issues and verifies short-lived JWT tokens scoped to single or resumable uploads.
 *
 * Token lifecycle:
 *   POST /api/v1/uploads/initiate
 *     → backend creates PENDING file record
 *     → signs JWT { uploadId, userId, fileId, mimeType, fileSize }
 *     → returns { uploadId, uploadUrl, token, expiresAt }
 *
 *   PUT /api/v1/uploads/:uploadId
 *     → client sends raw bytes + Authorization: Bearer <token>
 *     → backend verifies token, encrypts, pushes to GitHub, marks ACTIVE
 *
 * The token is single-use enforced at the DB level (PENDING → UPLOADING
 * transition is atomic; a second attempt finds status !== PENDING and rejects).
 */

import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface UploadTokenPayload {
  purpose: 'single' | 'resumable-chunk';
  /** Matches the file id for single uploads or session id for resumable uploads. */
  uploadId: string;
  /** Owner's user id */
  userId: string;
  /** MIME type validated at initiation time */
  mimeType: string;
  /** File size in bytes validated at initiation time */
  fileSize: number;
  /** Original filename (sanitised) */
  originalFilename: string;
}

export class UploadTokenService {
  /**
   * Sign a short-lived upload token.
   * Returns the signed JWT string.
   */
  sign(payload: UploadTokenPayload): string {
    return jwt.sign(payload, config.upload.tokenSecret, {
      expiresIn: `${config.upload.tokenTtlSeconds}s`,
      algorithm: 'HS256',
    });
  }

  /**
   * Verify and decode an upload token.
   * Throws if expired, tampered, or signed with wrong secret.
   */
  verify(token: string): UploadTokenPayload {
    const decoded = jwt.verify(token, config.upload.tokenSecret, {
      algorithms: ['HS256'],
    }) as UploadTokenPayload & { iat: number; exp: number };

    if (!decoded.uploadId || !decoded.userId ||
      (decoded.purpose !== 'single' && decoded.purpose !== 'resumable-chunk')) {
      throw new Error('Invalid upload token payload');
    }

    return {
      uploadId:         decoded.uploadId,
      userId:           decoded.userId,
      purpose:          decoded.purpose,
      mimeType:         decoded.mimeType,
      fileSize:         decoded.fileSize,
      originalFilename: decoded.originalFilename,
    };
  }

  /**
   * Build the full upload URL clients will PUT to.
   * e.g. https://api.example.com/api/v1/uploads/f_abc123
   */
  buildUploadUrl(baseUrl: string, uploadId: string): string {
    return `${baseUrl}/api/v1/uploads/${uploadId}`;
  }

  buildChunkUploadUrl(baseUrl: string, uploadId: string): string {
    return `${baseUrl}/api/v1/uploads/${uploadId}/chunks`;
  }
}

export const uploadTokenService = new UploadTokenService();
