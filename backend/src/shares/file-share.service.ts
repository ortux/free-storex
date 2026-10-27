import * as crypto from 'crypto';
import type { FileShareRecord, SharePermission } from '../lib/models';
import { execute, query } from '../lib/db';
import { encryptionService } from '../encryption/encryption.service';
import { keyService } from '../encryption/key.service';
import { logger } from '../lib/logger';
import { recordFileActivity } from '../files/file-activity.service';

export class ShareNotFoundError extends Error { constructor(msg: string) { super(msg); this.name = 'ShareNotFoundError'; } }
export class ShareForbiddenError extends Error { constructor(msg: string) { super(msg); this.name = 'ShareForbiddenError'; } }
export class ShareConflictError extends Error { constructor(msg: string) { super(msg); this.name = 'ShareConflictError'; } }

const SHARE_COLUMNS = `id,file_id AS fileId,shared_with_id AS sharedWithId,shared_by_id AS sharedById,permission,
  recipient_encrypted_file_key AS recipientEncryptedFileKey,expires_at AS expiresAt,created_at AS createdAt,updated_at AS updatedAt`;

export class FileShareService {
  async share(actorId: string, fileId: string, recipientId: string, permission: SharePermission, expiresAt?: Date): Promise<{ share: FileShareRecord }> {
    const [file] = await query<Array<{ id: string; userId: string; originalFilename: string; encryptedFileKey: string }>>(
      'SELECT id,user_id AS userId,original_filename AS originalFilename,encrypted_file_key AS encryptedFileKey FROM files WHERE id=? AND user_id=? AND status<>\'DELETED\' LIMIT 1', [fileId, actorId]);
    if (!file) throw new ShareForbiddenError('File not found or you do not own it');
    if (actorId === recipientId) throw new ShareForbiddenError('Cannot share a file with yourself');
    const [existing] = await query('SELECT id FROM file_shares WHERE file_id=? AND shared_with_id=? LIMIT 1', [fileId, recipientId]);
    if (existing) throw new ShareConflictError('File is already shared with this user');
    const [owner, recipient] = await Promise.all([
      query<Array<{ encryptedMasterKey: string }>>('SELECT encrypted_master_key AS encryptedMasterKey FROM users WHERE id=? LIMIT 1', [actorId]),
      query<Array<{ encryptedMasterKey: string }>>('SELECT encrypted_master_key AS encryptedMasterKey FROM users WHERE id=? LIMIT 1', [recipientId]),
    ]);
    if (!owner[0] || !recipient[0]) throw new ShareNotFoundError('Recipient user not found');
    const ownerKey = keyService.decryptMasterKey(owner[0].encryptedMasterKey);
    const fileKey = encryptionService.unwrapKey(file.encryptedFileKey, ownerKey);
    ownerKey.fill(0);
    const recipientKey = keyService.decryptMasterKey(recipient[0].encryptedMasterKey);
    const wrapped = encryptionService.wrapKey(fileKey, recipientKey);
    fileKey.fill(0); recipientKey.fill(0);
    const shareId = crypto.randomUUID();
    await execute('INSERT INTO file_shares (id,file_id,shared_with_id,shared_by_id,permission,recipient_encrypted_file_key,expires_at) VALUES (?,?,?,?,?,?,?)', [shareId,fileId,recipientId,actorId,permission,wrapped,expiresAt ?? null]);
    const [share] = await query<FileShareRecord[]>(`SELECT ${SHARE_COLUMNS} FROM file_shares WHERE id=?`, [shareId]);
    logger.info('File shared', { fileId, sharedBy: actorId, sharedWith: recipientId, permission });
    await recordFileActivity(actorId, fileId, 'SHARE', file.originalFilename);
    return { share };
  }

  async updateShare(actorId: string, shareId: string, updates: { permission?: SharePermission; expiresAt?: Date | null }): Promise<FileShareRecord> {
    const [share] = await query<FileShareRecord[]>(`SELECT ${SHARE_COLUMNS} FROM file_shares WHERE id=? LIMIT 1`, [shareId]);
    if (!share) throw new ShareNotFoundError('Share not found');
    if (share.sharedById !== actorId) throw new ShareForbiddenError('Only the person who shared the file can update it');
    const sets: string[] = []; const values: unknown[] = [];
    if (updates.permission !== undefined) { sets.push('permission=?'); values.push(updates.permission); }
    if (updates.expiresAt !== undefined) { sets.push('expires_at=?'); values.push(updates.expiresAt); }
    if (sets.length) await execute(`UPDATE file_shares SET ${sets.join(',')} WHERE id=?`, [...values, shareId]);
    const [updated] = await query<FileShareRecord[]>(`SELECT ${SHARE_COLUMNS} FROM file_shares WHERE id=?`, [shareId]);
    return updated;
  }

  async revoke(actorId: string, shareId: string): Promise<void> {
    const [share] = await query<Array<FileShareRecord & { fileUserId: string; originalFilename: string }>>(
      `SELECT s.id,s.file_id AS fileId,s.shared_with_id AS sharedWithId,s.shared_by_id AS sharedById,s.permission,
       s.recipient_encrypted_file_key AS recipientEncryptedFileKey,s.expires_at AS expiresAt,s.created_at AS createdAt,s.updated_at AS updatedAt,
       f.user_id AS fileUserId,f.original_filename AS originalFilename FROM file_shares s JOIN files f ON f.id=s.file_id WHERE s.id=? LIMIT 1`, [shareId]);
    if (!share) throw new ShareNotFoundError('Share not found');
    if (share.fileUserId !== actorId && share.sharedById !== actorId && share.sharedWithId !== actorId) throw new ShareForbiddenError('Not authorised to revoke this share');
    await execute('DELETE FROM file_shares WHERE id=?', [shareId]);
    await recordFileActivity(actorId, share.fileId, 'UNSHARE', share.originalFilename);
    logger.info('File share revoked', { shareId, revokedBy: actorId });
  }

  async listSharedByMe(actorId: string): Promise<unknown[]> {
    return query(`SELECT s.id,s.file_id AS fileId,s.shared_with_id AS sharedWithId,s.shared_by_id AS sharedById,s.permission,s.expires_at AS expiresAt,s.created_at AS createdAt,
      JSON_OBJECT('id',f.id,'originalFilename',f.original_filename,'mimeType',f.mime_type,'fileSize',f.file_size) AS file,
      JSON_OBJECT('id',u.id,'githubUsername',u.github_username,'email',u.email) AS sharedWith
      FROM file_shares s JOIN files f ON f.id=s.file_id JOIN users u ON u.id=s.shared_with_id WHERE s.shared_by_id=? ORDER BY s.created_at DESC`, [actorId]);
  }

  async listSharedWithMe(actorId: string): Promise<unknown[]> {
    return query(`SELECT s.id,s.file_id AS fileId,s.shared_with_id AS sharedWithId,s.shared_by_id AS sharedById,s.permission,s.expires_at AS expiresAt,s.created_at AS createdAt,
      JSON_OBJECT('id',f.id,'originalFilename',f.original_filename,'mimeType',f.mime_type,'fileSize',f.file_size,'createdAt',f.created_at) AS file,
      JSON_OBJECT('id',u.id,'githubUsername',u.github_username,'email',u.email) AS sharedBy
      FROM file_shares s JOIN files f ON f.id=s.file_id JOIN users u ON u.id=s.shared_by_id
      WHERE s.shared_with_id=? AND f.status<>'DELETED' AND (s.expires_at IS NULL OR s.expires_at>UTC_TIMESTAMP()) ORDER BY s.created_at DESC`, [actorId]);
  }

  async listSharesForFile(actorId: string, fileId: string): Promise<unknown[]> {
    const [file] = await query('SELECT id FROM files WHERE id=? AND user_id=? LIMIT 1', [fileId, actorId]);
    if (!file) throw new ShareForbiddenError('File not found or you do not own it');
    return query(`SELECT s.id,s.file_id AS fileId,s.shared_with_id AS sharedWithId,s.shared_by_id AS sharedById,s.permission,s.expires_at AS expiresAt,s.created_at AS createdAt,
      JSON_OBJECT('id',u.id,'githubUsername',u.github_username,'email',u.email) AS sharedWith
      FROM file_shares s JOIN users u ON u.id=s.shared_with_id WHERE s.file_id=? ORDER BY s.created_at DESC`, [fileId]);
  }

  async checkSharePermission(userId: string, fileId: string, required: SharePermission): Promise<boolean> {
    const [share] = await query<Array<{ permission: SharePermission }>>(`SELECT permission FROM file_shares WHERE file_id=? AND shared_with_id=? AND (expires_at IS NULL OR expires_at>UTC_TIMESTAMP()) LIMIT 1`, [fileId,userId]);
    if (!share) return false;
    const rank: Record<SharePermission, number> = { VIEW: 1, EDIT: 2, MANAGE: 3 };
    return rank[share.permission] >= rank[required];
  }
}

export const fileShareService = new FileShareService();
