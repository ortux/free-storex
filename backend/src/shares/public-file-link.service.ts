import * as crypto from 'crypto';
import type { FileRecord, User } from '../lib/models';
import { execute, query } from '../lib/db';
import { config } from '../config';
import { recordFileActivity } from '../files/file-activity.service';
import { fileRepository } from '../files/file.repository';
import { userRepository } from '../users/user.repository';

export class PublicLinkNotFoundError extends Error { constructor() { super('This link is invalid, expired, or has been revoked'); this.name = 'PublicLinkNotFoundError'; } }
interface PublicFileLinkRecord { id: string; fileId: string; tokenHash: string; tokenCiphertext: string; expiresAt: Date | null; createdAt: Date; }
interface ResolvedPublicLink { link: PublicFileLinkRecord; file: FileRecord; owner: User; }
function encryptionKey(): Buffer { return crypto.createHash('sha256').update(config.encryption.masterKeySecret).digest(); }
function encryptToken(token: string): string {
  const nonce = crypto.randomBytes(12); const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), nonce);
  const body = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), body]).toString('base64');
}
function decryptToken(value: string): string {
  const payload = Buffer.from(value, 'base64'); if (payload.length < 29) throw new Error('Invalid encrypted public link token');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), payload.subarray(0,12));
  decipher.setAuthTag(payload.subarray(12,28));
  return Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString('utf8');
}
function hashToken(token: string): string { return crypto.createHash('sha256').update(token).digest('hex'); }
function linkDto(link: PublicFileLinkRecord) { return { id: link.id, fileId: link.fileId, url: `${config.frontendUrl.replace(/\/$/, '')}/share/${decryptToken(link.tokenCiphertext)}`, expiresAt: link.expiresAt, createdAt: link.createdAt }; }

export class PublicFileLinkService {
  async getForOwner(userId: string, fileId: string) {
    const file = await fileRepository.findByIdAndUserId(fileId, userId);
    if (!file || file.status !== 'ACTIVE') throw new PublicLinkNotFoundError();
    const [link] = await query<PublicFileLinkRecord[]>('SELECT id,file_id AS fileId,token_hash AS tokenHash,token_ciphertext AS tokenCiphertext,expires_at AS expiresAt,created_at AS createdAt FROM public_file_links WHERE file_id=? LIMIT 1', [fileId]);
    return link ? linkDto(link) : null;
  }

  async createOrRotate(userId: string, fileId: string, expiresAt: Date | null) {
    const file = await fileRepository.findByIdAndUserId(fileId, userId);
    if (!file || file.status !== 'ACTIVE') throw new PublicLinkNotFoundError();
    const token = crypto.randomBytes(32).toString('hex');
    const id = crypto.randomUUID();
    await execute(`INSERT INTO public_file_links (id,file_id,token_hash,token_ciphertext,expires_at) VALUES (?,?,?,?,?)
      ON DUPLICATE KEY UPDATE id=VALUES(id),token_hash=VALUES(token_hash),token_ciphertext=VALUES(token_ciphertext),expires_at=VALUES(expires_at),updated_at=UTC_TIMESTAMP(3)`,
      [id,fileId,hashToken(token),encryptToken(token),expiresAt]);
    const [link] = await query<PublicFileLinkRecord[]>('SELECT id,file_id AS fileId,token_hash AS tokenHash,token_ciphertext AS tokenCiphertext,expires_at AS expiresAt,created_at AS createdAt FROM public_file_links WHERE file_id=?', [fileId]);
    await recordFileActivity(userId, fileId, 'SHARE', file.originalFilename);
    return linkDto(link);
  }

  async revokeForOwner(userId: string, fileId: string): Promise<void> {
    const file = await fileRepository.findByIdAndUserId(fileId, userId);
    if (!file || file.status !== 'ACTIVE') throw new PublicLinkNotFoundError();
    const result = await execute('DELETE FROM public_file_links WHERE file_id=?', [fileId]);
    if (result.affectedRows) await recordFileActivity(userId, fileId, 'UNSHARE', file.originalFilename);
  }

  async resolve(token: string): Promise<ResolvedPublicLink> {
    if (!/^[a-f0-9]{64}$/i.test(token)) throw new PublicLinkNotFoundError();
    const [link] = await query<Array<PublicFileLinkRecord & { fileId: string }>>(`SELECT id,file_id AS fileId,token_hash AS tokenHash,token_ciphertext AS tokenCiphertext,expires_at AS expiresAt,created_at AS createdAt FROM public_file_links WHERE token_hash=? AND (expires_at IS NULL OR expires_at>UTC_TIMESTAMP()) LIMIT 1`, [hashToken(token)]);
    if (!link) throw new PublicLinkNotFoundError();
    const file = await fileRepository.findById(link.fileId);
    if (!file || file.status !== 'ACTIVE') throw new PublicLinkNotFoundError();
    const owner = await userRepository.findById(file.userId);
    if (!owner) throw new PublicLinkNotFoundError();
    return { link, file, owner };
  }

  async getPublicMetadata(token: string) {
    const { file, link } = await this.resolve(token);
    return { filename: file.originalFilename, mimeType: file.mimeType, size: file.fileSize, expiresAt: link.expiresAt };
  }
}

export const publicFileLinkService = new PublicFileLinkService();
