import * as crypto from 'crypto';
import type { User, FileRecord, UploadSessionStatus, FileChunkRecord } from '../lib/models';
import { execute, query } from '../lib/db';
import { config } from '../config';
import { encryptionService } from '../encryption/encryption.service';
import { storageProvider } from '../storage/github-storage.provider';
import { userService } from '../users/user.service';
import { userRepository } from '../users/user.repository';
import { fileRepository } from '../files/file.repository';
import { recordFileActivity } from '../files/file-activity.service';
import { matchesStoredChunk } from './chunk-integrity';
import { StorageLimitError, StorageUnavailableError } from '../storage/storage-provider.interface';
import { logger } from '../lib/logger';

export class UploadProblem extends Error {
  constructor(public readonly code: string, message: string, public readonly details?: unknown) { super(message); this.name = 'UploadProblem'; }
}
interface UploadSessionWithFile {
  id: string; userId: string; fileId: string; originalFilename: string; mimeType: string; fileSize: number;
  chunkSize: number; totalChunks: number; status: UploadSessionStatus; expiresAt: Date; createdAt: Date; updatedAt: Date;
  file: FileRecord;
}
function safeFilename(name: string): string { return name.replace(/[/\\?%*:|"<>]/g, '-').replace(/\.\./g, '').substring(0, 255); }
function fileId(): string { return 'f_' + crypto.randomBytes(8).toString('hex'); }
function aad(id: string, index: number): string { return `${id}:chunk_${index}:v1`; }
function chunkPath(id: string, index: number): string { return `files/${id}/${String(index).padStart(8, '0')}.enc`; }
function expectedChunkSize(fileSize: number, chunkSize: number, index: number, total: number): number { return index < total - 1 ? chunkSize : fileSize - (total - 1) * chunkSize; }
const SESSION_COLS = `id,user_id AS userId,file_id AS fileId,original_filename AS originalFilename,mime_type AS mimeType,
  file_size AS fileSize,chunk_size AS chunkSize,total_chunks AS totalChunks,status,expires_at AS expiresAt,created_at AS createdAt,updated_at AS updatedAt`;

export class ResumableUploadService {
  async create(user: User, input: { filename: string; mimeType: string; fileSize: number; workspaceId?: string; folderId?: string | null }) {
    if (!input.filename || !input.mimeType || !Number.isInteger(input.fileSize) || input.fileSize <= 0) throw new UploadProblem('BAD_REQUEST', 'filename, mimeType, and positive fileSize are required');
    if (!config.files.allowedMimeTypes.includes(input.mimeType)) throw new UploadProblem('UNSUPPORTED_MEDIA_TYPE', 'File type is not allowed');
    if (input.fileSize > config.files.maxSizeMb * 1024 * 1024) throw new UploadProblem('FILE_TOO_LARGE', `Max size is ${config.files.maxSizeMb}MB`);
    if (input.workspaceId && !(await query('SELECT id FROM workspaces WHERE id=? LIMIT 1', [input.workspaceId])).length) throw new UploadProblem('NOT_FOUND', 'Workspace not found');
    if (input.folderId && !(await query('SELECT id FROM folders WHERE id=? AND user_id=? LIMIT 1', [input.folderId, user.id])).length) throw new UploadProblem('FOLDER_NOT_FOUND', 'Destination folder not found');

    const chunkSize = Math.min(config.files.chunkSizeMb * 1024 * 1024, config.files.largeFileThresholdMb * 1024 * 1024, config.github.contentsMaxObjectBytes - 34);
    if (chunkSize <= 0) throw new UploadProblem('STORAGE_LIMIT', 'Configured chunk and object limits are invalid');
    const totalChunks = Math.ceil(input.fileSize / chunkSize);
    const id = fileId();
    const sessionId = crypto.randomUUID();
    const safeName = safeFilename(input.filename);
    const key = encryptionService.generateKey();
    const masterKey = userService.getMasterKey(user);
    const wrappedKey = encryptionService.wrapKey(key, masterKey);
    key.fill(0); masterKey.fill(0);
    const expiresAt = new Date(Date.now() + config.upload.expirationHours * 3600000);
    await execute(`INSERT INTO files (id,user_id,workspace_id,folder_id,original_filename,stored_filename,storage_path,mime_type,file_size,encrypted_file_key,checksum,status,storage_type,chunk_size,total_chunks)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,'PENDING','GITHUB_CHUNKED',?,?)`, [id,user.id,input.workspaceId ?? null,input.folderId ?? null,safeName,`${id}.enc`,`files/${id}`,input.mimeType,input.fileSize,wrappedKey,'',chunkSize,totalChunks]);
    await execute(`INSERT INTO upload_sessions (id,user_id,file_id,original_filename,mime_type,file_size,chunk_size,total_chunks,status,expires_at)
      VALUES (?,?,?,?,?,?,?,?, 'INITIALIZED',?)`, [sessionId,user.id,id,safeName,input.mimeType,input.fileSize,chunkSize,totalChunks,expiresAt]);
    return { id: sessionId, fileId: id, originalFilename: safeName, fileSize: input.fileSize, chunkSize, totalChunks, status: 'initialized', expiresAt };
  }

  async listActive(userId: string) {
    const sessions = await query<Array<Omit<UploadSessionWithFile, 'file'>>>(`SELECT ${SESSION_COLS} FROM upload_sessions WHERE user_id=? AND status IN ('INITIALIZED','UPLOADING','PAUSED') AND expires_at>UTC_TIMESTAMP() ORDER BY updated_at DESC LIMIT 50`, [userId]);
    return sessions.map((session) => ({ ...session, status: session.status.toLowerCase() }));
  }

  private async getOwnedSession(userId: string, id: string): Promise<UploadSessionWithFile> {
    const [session] = await query<Array<Omit<UploadSessionWithFile, 'file'>>>(`SELECT ${SESSION_COLS} FROM upload_sessions WHERE id=? AND user_id=? LIMIT 1`, [id,userId]);
    if (!session) throw new UploadProblem('UPLOAD_NOT_FOUND', 'Upload session not found');
    if (session.expiresAt < new Date()) throw new UploadProblem('UPLOAD_EXPIRED', 'Upload session expired');
    if (['CANCELLED','COMPLETED','FAILED','EXPIRED'].includes(session.status)) throw new UploadProblem(`UPLOAD_${session.status}`, `Upload is ${session.status.toLowerCase()}`);
    const file = await fileRepository.findById(session.fileId);
    if (!file || file.userId !== userId) throw new UploadProblem('UPLOAD_NOT_FOUND', 'Upload file not found');
    return { ...session, file };
  }

  async status(userId: string, id: string) {
    const session = await this.getOwnedSession(userId, id);
    const chunks = await query<Array<Pick<FileChunkRecord, 'chunkIndex' | 'originalSize' | 'checksum'>>>(`SELECT chunk_index AS chunkIndex,original_size AS originalSize,checksum FROM file_chunks WHERE file_id=? AND status='UPLOADED' ORDER BY chunk_index`, [session.fileId]);
    return {
      uploadId: session.id,fileId: session.fileId,filename: session.originalFilename,fileSize: session.fileSize,chunkSize: session.chunkSize,
      status: session.status.toLowerCase(),totalChunks: session.totalChunks,uploadedChunks: chunks.map((chunk) => chunk.chunkIndex),chunks,
      uploadedBytes: chunks.reduce((sum, chunk) => sum + chunk.originalSize, 0),expiresAt: session.expiresAt,
    };
  }

  async uploadChunk(user: User, sessionId: string, index: number, body: Buffer) {
    const session = await this.getOwnedSession(user.id, sessionId);
    if (!Number.isInteger(index) || index < 0 || index >= session.totalChunks) throw new UploadProblem('CHUNK_INDEX_INVALID', 'Chunk index is invalid');
    const expected = expectedChunkSize(session.fileSize, session.chunkSize, index, session.totalChunks);
    if (body.length !== expected) throw new UploadProblem('CHUNK_SIZE_INVALID', `Expected ${expected} bytes, received ${body.length}`);
    const [existing] = await query<Array<{ originalSize: number; checksum: string; status: string }>>('SELECT original_size AS originalSize,checksum,status FROM file_chunks WHERE file_id=? AND chunk_index=? LIMIT 1', [session.fileId,index]);
    if (existing?.status === 'UPLOADED') {
      if (!matchesStoredChunk(existing, body)) throw new UploadProblem('CHUNK_ALREADY_EXISTS', 'This chunk index is already stored with different content');
      return { index,status: 'already_uploaded',size: existing.originalSize };
    }
    const masterKey = userService.getMasterKey(user);
    const fileKey = encryptionService.unwrapKey(session.file.encryptedFileKey, masterKey);
    masterKey.fill(0);
    const encrypted = encryptionService.encryptChunk(body, fileKey, aad(session.fileId, index));
    fileKey.fill(0);
    const path = chunkPath(session.fileId, index);
    let result;
    try { result = await storageProvider.uploadObject({ storagePath: path,encryptedBuffer: encrypted,account: { accountId: user.id } }); }
    catch (error) {
      if (error instanceof StorageLimitError) throw new UploadProblem('STORAGE_LIMIT', error.message);
      if (error instanceof StorageUnavailableError) throw new UploadProblem('STORAGE_UNAVAILABLE', error.message);
      throw error;
    }
    const checksum = encryptionService.computeChecksum(body);
    await execute(`INSERT INTO file_chunks (id,file_id,chunk_index,github_path,github_sha,storage_repository_id,encrypted_size,original_size,nonce,checksum,status)
      VALUES (?,?,?,?,?,?,?,?,?,?,'UPLOADED') ON DUPLICATE KEY UPDATE github_path=VALUES(github_path),github_sha=VALUES(github_sha),storage_repository_id=VALUES(storage_repository_id),encrypted_size=VALUES(encrypted_size),original_size=VALUES(original_size),nonce=VALUES(nonce),checksum=VALUES(checksum),status='UPLOADED'`,
      [crypto.randomUUID(),session.fileId,index,path,result.providerRef,result.repositoryId,encrypted.length,body.length,encrypted.subarray(6,18).toString('base64'),checksum]);
    await execute("UPDATE upload_sessions SET status='UPLOADING' WHERE id=?", [session.id]);
    return { index,status: 'uploaded',size: body.length };
  }

  async complete(user: User, sessionId: string) {
    const session = await this.getOwnedSession(user.id, sessionId);
    const chunks = await query<FileChunkRecord[]>(`SELECT id,file_id AS fileId,chunk_index AS chunkIndex,github_path AS githubPath,github_sha AS githubSha,storage_repository_id AS storageRepositoryId,encrypted_size AS encryptedSize,original_size AS originalSize,nonce,checksum,status,created_at AS createdAt,updated_at AS updatedAt FROM file_chunks WHERE file_id=? AND status='UPLOADED' ORDER BY chunk_index`, [session.fileId]);
    const missing = Array.from({ length: session.totalChunks }, (_, index) => index).filter((index) => !chunks[index] || chunks[index].chunkIndex !== index);
    if (missing.length) throw new UploadProblem('MISSING_CHUNKS', 'Upload is missing chunks', missing);
    const masterKey = userService.getMasterKey(user);
    const fileKey = encryptionService.unwrapKey(session.file.encryptedFileKey, masterKey);
    masterKey.fill(0);
    const hash = crypto.createHash('sha256');
    try {
      for (const chunk of chunks) {
        const encrypted = await storageProvider.downloadObject({ storagePath: chunk.githubPath,repositoryId: chunk.storageRepositoryId,account: { accountId: user.id } });
        const plaintext = encryptionService.decryptChunk(encrypted,fileKey,aad(session.fileId,chunk.chunkIndex));
        if (plaintext.length !== expectedChunkSize(session.fileSize,session.chunkSize,chunk.chunkIndex,session.totalChunks) || !matchesStoredChunk(chunk,plaintext)) throw new UploadProblem('CHUNK_INVALID', `Chunk ${chunk.chunkIndex} failed integrity verification`);
        hash.update(plaintext);
      }
    } finally { fileKey.fill(0); }
    if (chunks.reduce((sum, chunk) => sum + chunk.originalSize, 0) !== session.fileSize) throw new UploadProblem('CHUNK_INVALID', 'Total uploaded chunk size does not match file manifest');
    const checksum = hash.digest('hex');
    await execute("UPDATE files SET checksum=?,status='ACTIVE' WHERE id=?", [checksum,session.fileId]);
    await execute("UPDATE upload_sessions SET status='COMPLETED' WHERE id=?", [session.id]);
    const file = await fileRepository.findById(session.fileId);
    if (!file) throw new Error('Completed file metadata missing');
    await recordFileActivity(user.id,file.id,'UPLOAD',file.originalFilename);
    return file;
  }

  async cancel(user: User, sessionId: string) {
    const [session] = await query<Array<Omit<UploadSessionWithFile, 'file'>>>(`SELECT ${SESSION_COLS} FROM upload_sessions WHERE id=? AND user_id=? LIMIT 1`, [sessionId,user.id]);
    if (!session) throw new UploadProblem('UPLOAD_NOT_FOUND','Upload session not found');
    if (session.status === 'CANCELLED' || session.status === 'EXPIRED') return;
    if (session.status === 'COMPLETED') throw new UploadProblem('UPLOAD_COMPLETED','Completed uploads cannot be cancelled');
    const chunks = await query<Array<{ githubPath: string; githubSha: string | null; storageRepositoryId: string | null; encryptedSize: number }>>('SELECT github_path AS githubPath,github_sha AS githubSha,storage_repository_id AS storageRepositoryId,encrypted_size AS encryptedSize FROM file_chunks WHERE file_id=?', [session.fileId]);
    let failed = false;
    for (const chunk of chunks) {
      if (!chunk.githubSha) continue;
      try { await storageProvider.deleteObject({ storagePath: chunk.githubPath,repositoryId: chunk.storageRepositoryId,providerRef: chunk.githubSha,account: { accountId: user.id } }); }
      catch { failed = true; }
    }
    if (failed) throw new UploadProblem('STORAGE_UNAVAILABLE','Some encrypted chunks could not be removed; cancellation can be retried');
    await execute("UPDATE upload_sessions SET status='CANCELLED' WHERE id=?", [sessionId]);
    await execute("UPDATE files SET status='DELETED' WHERE id=?", [session.fileId]);
  }

  async stream(user: User, id: string, write: (chunk: Buffer) => Promise<void>, range?: { start: number; end: number }) {
    const access = await fileRepository.findByIdAndAccessor(id,user.id);
    if (!access || access.file.status !== 'ACTIVE') throw new UploadProblem('FILE_NOT_FOUND','File not found');
    const file = access.file;
    if (file.storageType === 'GITHUB_SINGLE') return null;
    const owner = access.isOwner ? user : await userRepository.findById(file.userId);
    if (!owner) throw new UploadProblem('FILE_NOT_FOUND','File owner not found');
    const keyMaster = userService.getMasterKey(user);
    const wrapped = access.isOwner ? file.encryptedFileKey : access.recipientEncryptedFileKey;
    if (!wrapped) { keyMaster.fill(0); throw new UploadProblem('FILE_NOT_FOUND','File share unavailable'); }
    const fileKey = encryptionService.unwrapKey(wrapped,keyMaster); keyMaster.fill(0);
    const chunkSize = file.chunkSize; const total = file.totalChunks;
    if (!chunkSize || !total) { fileKey.fill(0); throw new UploadProblem('CHUNK_INVALID','Chunk manifest invalid'); }
    const start = range?.start ?? 0; const end = range?.end ?? file.fileSize - 1;
    const first = Math.floor(start / chunkSize); const last = Math.floor(end / chunkSize);
    const chunks = await query<FileChunkRecord[]>(`SELECT id,file_id AS fileId,chunk_index AS chunkIndex,github_path AS githubPath,github_sha AS githubSha,storage_repository_id AS storageRepositoryId,encrypted_size AS encryptedSize,original_size AS originalSize,nonce,checksum,status,created_at AS createdAt,updated_at AS updatedAt FROM file_chunks WHERE file_id=? AND status='UPLOADED' AND chunk_index BETWEEN ? AND ? ORDER BY chunk_index`, [id,first,last]);
    const byIndex = new Map(chunks.map((chunk) => [chunk.chunkIndex,chunk]));
    try {
      for (let index = first; index <= last; index++) {
        const chunk = byIndex.get(index); if (!chunk) throw new UploadProblem('CHUNK_INVALID',`Chunk ${index} missing`);
        const encrypted = await storageProvider.downloadObject({ storagePath: chunk.githubPath,repositoryId: chunk.storageRepositoryId,account: { accountId: owner.id } });
        const plaintext = encryptionService.decryptChunk(encrypted,fileKey,aad(id,index));
        if (!matchesStoredChunk(chunk,plaintext) || plaintext.length !== expectedChunkSize(file.fileSize,chunkSize,index,total)) throw new UploadProblem('CHUNK_INVALID',`Chunk ${index} failed integrity verification`);
        const chunkStart = index * chunkSize; const from = Math.max(start - chunkStart,0); const to = Math.min(end - chunkStart + 1,plaintext.length);
        if (to > from) await write(plaintext.subarray(from,to));
      }
    } finally { fileKey.fill(0); }
    return file;
  }

  async cleanupExpired(): Promise<number> {
    const sessions = await query<Array<Omit<UploadSessionWithFile,'file'>>>(`SELECT ${SESSION_COLS} FROM upload_sessions WHERE expires_at<UTC_TIMESTAMP() AND status IN ('INITIALIZED','UPLOADING','PAUSED') LIMIT 100`);
    let cleaned = 0;
    for (const session of sessions) {
      const user = await userRepository.findById(session.userId);
      if (!user) continue;
      const chunks = await query<Array<{ githubPath: string; githubSha: string | null; storageRepositoryId: string | null; encryptedSize: number }>>('SELECT github_path AS githubPath,github_sha AS githubSha,storage_repository_id AS storageRepositoryId,encrypted_size AS encryptedSize FROM file_chunks WHERE file_id=?', [session.fileId]);
      let failed = false;
      for (const chunk of chunks) {
        if (!chunk.githubSha) continue;
        try { await storageProvider.deleteObject({ storagePath: chunk.githubPath,repositoryId: chunk.storageRepositoryId,providerRef: chunk.githubSha,account: { accountId: user.id } }); }
        catch { failed = true; }
      }
      if (failed) { logger.warn('Expired upload cleanup incomplete; will retry', { uploadId: session.id }); continue; }
      await execute("UPDATE upload_sessions SET status='EXPIRED' WHERE id=?", [session.id]);
      await execute("UPDATE files SET status='DELETED' WHERE id=?", [session.fileId]);
      cleaned++;
    }
    return cleaned;
  }
}
export const resumableUploadService = new ResumableUploadService();
