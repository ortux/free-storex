/**
 * FileService
 *
 * Orchestrates upload/download/delete via:
 *   EncryptionService  →  crypto operations
 *   IStorageProvider  →  encrypted object persistence
 *   FileRepository  →  metadata persistence
 *
 * Security invariant: GitHub only ever receives AES-256-GCM encrypted bytes.
 */

import * as crypto from 'crypto';
import type { FileRecord as File, User, Workspace } from '../lib/models';
import { encryptionService } from '../encryption/encryption.service';
import { storageProvider } from '../storage/github-storage.provider';
import { fileRepository } from './file.repository';
import { userService } from '../users/user.service';
import { safeLog } from '../lib/logger';
import { config } from '../config';
import { recordFileActivity } from './file-activity.service';
import { userRepository } from '../users/user.repository';
import { query } from '../lib/db';

export class NotFoundError extends Error {
  constructor(msg: string) { super(msg); this.name = 'NotFoundError'; }
}
export class ForbiddenError extends Error {
  constructor(msg: string) { super(msg); this.name = 'ForbiddenError'; }
}

function generateFileId(): string {
  return 'f_' + crypto.randomBytes(8).toString('hex');
}
function generateStoredFilename(): string {
  return crypto.randomBytes(8).toString('hex') + '.enc';
}
function sanitizeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '-').replace(/\.\./g, '').substring(0, 255);
}

export class FileService {
  async upload(
    user: User,
    fileBuffer: Buffer,
    originalFilename: string,
    mimeType: string,
    workspace?: Workspace | null,
    folderId?: string | null,
  ): Promise<File> {
    const maxBytes = config.files.maxSizeMb * 1024 * 1024;
    if (fileBuffer.length > maxBytes) {
      throw new Error(`File exceeds maximum size of ${config.files.maxSizeMb}MB`);
    }
    if (!config.files.allowedMimeTypes.includes(mimeType)) {
      throw new Error(`File type ${mimeType} is not allowed`);
    }
    if (fileBuffer.length > config.files.largeFileThresholdMb * 1024 * 1024) {
      throw new Error('File exceeds the single-object upload threshold; use resumable upload');
    }
    const fileId         = generateFileId();
    const storedFilename = generateStoredFilename();
    const storagePath    = `files/${storedFilename}`;

    await fileRepository.create({
      id:               fileId,
      userId:           user.id,
      workspaceId:      workspace?.id,
      folderId:          folderId ?? null,
      originalFilename: sanitizeFilename(originalFilename),
      storedFilename,
      storagePath,
      mimeType,
      fileSize:         fileBuffer.length,
      encryptedFileKey: '',
      checksum:         '',
      status:           'PENDING',
    });

    try {
      await fileRepository.updateStatus(fileId, 'UPLOADING');

      const checksum         = encryptionService.computeChecksum(fileBuffer);
      const fileKey          = encryptionService.generateKey();
      const encryptedBuffer  = encryptionService.encrypt(fileBuffer, fileKey);
      safeLog.encryptionSuccess(fileId);

      const masterKey        = userService.getMasterKey(user);
      const encryptedFileKey = encryptionService.wrapKey(fileKey, masterKey);
      fileKey.fill(0);
      masterKey.fill(0);

      const uploadResult = await storageProvider.uploadObject({
        storagePath,
        encryptedBuffer,
        account: { accountId: user.id },
      });
      safeLog.githubUpload(fileId, storagePath);

      await fileRepository.updateUploadResult(fileId, {
        checksum,
        encryptedFileKey,
        providerRef: uploadResult.providerRef,
        storageRepositoryId: uploadResult.repositoryId,
      });
      const updated = await fileRepository.findById(fileId);
      if (!updated) throw new Error('Uploaded file metadata was not found');

      safeLog.userUpload(user.id, fileId);
      await recordFileActivity(user.id, fileId, 'UPLOAD', updated.originalFilename);
      return updated;
    } catch (err) {
      await fileRepository.updateStatus(fileId, 'FAILED').catch(() => {});
      throw err;
    }
  }

  async download(user: User, fileId: string): Promise<{ buffer: Buffer; file: File }> {
    const access = await fileRepository.findByIdAndAccessor(fileId, user.id);
    if (!access) throw new NotFoundError('File not found');

    const { file, isOwner, recipientEncryptedFileKey } = access;

    const fileOwner = isOwner
      ? user
      : await userRepository.findById(file.userId);
    if (!fileOwner) throw new NotFoundError('File owner not found');

    const encryptedBuffer = await storageProvider.downloadObject({
      storagePath: file.storagePath,
      repositoryId: file.storageRepositoryId,
      account: { accountId: fileOwner.id },
    });

    const wrappedKey  = isOwner ? file.encryptedFileKey : recipientEncryptedFileKey!;
    const masterKey   = userService.getMasterKey(user);
    const fileKey     = encryptionService.unwrapKey(wrappedKey, masterKey);
    masterKey.fill(0);

    const plaintext = encryptionService.decrypt(encryptedBuffer, fileKey);
    fileKey.fill(0);

    safeLog.decryptionSuccess(fileId);
    safeLog.userDownload(user.id, fileId);
    return { buffer: plaintext, file };
  }

  async delete(user: User, fileId: string): Promise<void> {
    const file = await fileRepository.findByIdAndUserId(fileId, user.id);
    if (!file) throw new NotFoundError('File not found');
    if (file.status === 'DELETED') return;

    await fileRepository.updateStatus(fileId, 'DELETING');

    try {
      if (file.storageType === 'GITHUB_CHUNKED') {
        const chunks = await query<Array<{
          storagePath: string;
          providerRef: string | null;
          repositoryId: string | null;
        }>>(
          `SELECT github_path AS storagePath,github_sha AS providerRef,
            storage_repository_id AS repositoryId
           FROM file_chunks WHERE file_id=? AND status='UPLOADED' ORDER BY chunk_index`,
          [file.id],
        );
        if (chunks.length !== file.totalChunks) {
          throw new Error('Cannot delete chunked file: stored chunk metadata is incomplete');
        }
        for (const chunk of chunks) {
          if (!chunk.providerRef) throw new Error('Cannot delete chunked file: missing GitHub SHA');
          await storageProvider.deleteObject({
            storagePath: chunk.storagePath,
            repositoryId: chunk.repositoryId,
            providerRef: chunk.providerRef,
            account: { accountId: user.id },
          });
        }
      } else {
        if (!file.providerRef) throw new Error('Cannot delete file: missing GitHub SHA');
        await storageProvider.deleteObject({
          storagePath: file.storagePath,
          repositoryId: file.storageRepositoryId,
          providerRef: file.providerRef,
          account: { accountId: user.id },
        });
      }
      safeLog.githubDelete(fileId);
      await fileRepository.delete(fileId);
      safeLog.userDelete(user.id, fileId);
      await recordFileActivity(user.id, fileId, 'DELETE', file.originalFilename);
    } catch (err) {
      await fileRepository.updateStatus(fileId, 'ACTIVE').catch(() => {});
      throw err;
    }
  }

  async list(userId: string, options?: Parameters<typeof fileRepository.listByUserId>[1]) {
    return fileRepository.listByUserId(userId, options);
  }

  async listWorkspaceFiles(workspaceId: string, options?: Parameters<typeof fileRepository.listByWorkspaceId>[1]) {
    return fileRepository.listByWorkspaceId(workspaceId, options);
  }

  async getById(userId: string, fileId: string): Promise<File | null> {
    return fileRepository.findByIdAndUserId(fileId, userId);
  }
}

export const fileService = new FileService();
