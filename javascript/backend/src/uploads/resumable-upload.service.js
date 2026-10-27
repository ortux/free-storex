"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.resumableUploadService = exports.ResumableUploadService = exports.UploadProblem = void 0;
const crypto = __importStar(require("crypto"));
const db_1 = require("../lib/db");
const config_1 = require("../config");
const encryption_service_1 = require("../encryption/encryption.service");
const github_storage_provider_1 = require("../storage/github-storage.provider");
const user_service_1 = require("../users/user.service");
const user_repository_1 = require("../users/user.repository");
const file_repository_1 = require("../files/file.repository");
const file_activity_service_1 = require("../files/file-activity.service");
const chunk_integrity_1 = require("./chunk-integrity");
const storage_provider_interface_1 = require("../storage/storage-provider.interface");
const logger_1 = require("../lib/logger");
class UploadProblem extends Error {
    code;
    details;
    constructor(code, message, details) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = 'UploadProblem';
    }
}
exports.UploadProblem = UploadProblem;
function safeFilename(name) { return name.replace(/[/\\?%*:|"<>]/g, '-').replace(/\.\./g, '').substring(0, 255); }
function fileId() { return 'f_' + crypto.randomBytes(8).toString('hex'); }
function aad(id, index) { return `${id}:chunk_${index}:v1`; }
function chunkPath(id, index) { return `files/${id}/${String(index).padStart(8, '0')}.enc`; }
function expectedChunkSize(fileSize, chunkSize, index, total) { return index < total - 1 ? chunkSize : fileSize - (total - 1) * chunkSize; }
const SESSION_COLS = `id,user_id AS userId,file_id AS fileId,original_filename AS originalFilename,mime_type AS mimeType,
  file_size AS fileSize,chunk_size AS chunkSize,total_chunks AS totalChunks,status,expires_at AS expiresAt,created_at AS createdAt,updated_at AS updatedAt`;
class ResumableUploadService {
    async create(user, input) {
        if (!input.filename || !input.mimeType || !Number.isInteger(input.fileSize) || input.fileSize <= 0)
            throw new UploadProblem('BAD_REQUEST', 'filename, mimeType, and positive fileSize are required');
        if (!config_1.config.files.allowedMimeTypes.includes(input.mimeType))
            throw new UploadProblem('UNSUPPORTED_MEDIA_TYPE', 'File type is not allowed');
        if (input.fileSize > config_1.config.files.maxSizeMb * 1024 * 1024)
            throw new UploadProblem('FILE_TOO_LARGE', `Max size is ${config_1.config.files.maxSizeMb}MB`);
        if (input.workspaceId && !(await (0, db_1.query)('SELECT id FROM workspaces WHERE id=? LIMIT 1', [input.workspaceId])).length)
            throw new UploadProblem('NOT_FOUND', 'Workspace not found');
        if (input.folderId && !(await (0, db_1.query)('SELECT id FROM folders WHERE id=? AND user_id=? LIMIT 1', [input.folderId, user.id])).length)
            throw new UploadProblem('FOLDER_NOT_FOUND', 'Destination folder not found');
        const chunkSize = Math.min(config_1.config.files.chunkSizeMb * 1024 * 1024, config_1.config.files.largeFileThresholdMb * 1024 * 1024, config_1.config.github.contentsMaxObjectBytes - 34);
        if (chunkSize <= 0)
            throw new UploadProblem('STORAGE_LIMIT', 'Configured chunk and object limits are invalid');
        const totalChunks = Math.ceil(input.fileSize / chunkSize);
        try {
            await github_storage_provider_1.storageProvider.assertCapacity({ accountId: user.id }, input.fileSize + totalChunks * 34);
        }
        catch (error) {
            if (error instanceof storage_provider_interface_1.StorageLimitError)
                throw new UploadProblem('STORAGE_LIMIT', error.message);
            if (error instanceof storage_provider_interface_1.StorageUnavailableError)
                throw new UploadProblem('STORAGE_UNAVAILABLE', error.message);
            throw error;
        }
        const id = fileId();
        const sessionId = crypto.randomUUID();
        const safeName = safeFilename(input.filename);
        const key = encryption_service_1.encryptionService.generateKey();
        const masterKey = user_service_1.userService.getMasterKey(user);
        const wrappedKey = encryption_service_1.encryptionService.wrapKey(key, masterKey);
        key.fill(0);
        masterKey.fill(0);
        const expiresAt = new Date(Date.now() + config_1.config.upload.expirationHours * 3600000);
        await (0, db_1.execute)(`INSERT INTO files (id,user_id,workspace_id,folder_id,original_filename,stored_filename,storage_path,mime_type,file_size,encrypted_file_key,checksum,status,storage_type,chunk_size,total_chunks)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,'PENDING','GITHUB_CHUNKED',?,?)`, [id, user.id, input.workspaceId ?? null, input.folderId ?? null, safeName, `${id}.enc`, `files/${id}`, input.mimeType, input.fileSize, wrappedKey, '', chunkSize, totalChunks]);
        await (0, db_1.execute)(`INSERT INTO upload_sessions (id,user_id,file_id,original_filename,mime_type,file_size,chunk_size,total_chunks,status,expires_at)
      VALUES (?,?,?,?,?,?,?,?, 'INITIALIZED',?)`, [sessionId, user.id, id, safeName, input.mimeType, input.fileSize, chunkSize, totalChunks, expiresAt]);
        return { id: sessionId, fileId: id, originalFilename: safeName, fileSize: input.fileSize, chunkSize, totalChunks, status: 'initialized', expiresAt };
    }
    async listActive(userId) {
        const sessions = await (0, db_1.query)(`SELECT ${SESSION_COLS} FROM upload_sessions WHERE user_id=? AND status IN ('INITIALIZED','UPLOADING','PAUSED') AND expires_at>UTC_TIMESTAMP() ORDER BY updated_at DESC LIMIT 50`, [userId]);
        return sessions.map((session) => ({ ...session, status: session.status.toLowerCase() }));
    }
    async getOwnedSession(userId, id) {
        const [session] = await (0, db_1.query)(`SELECT ${SESSION_COLS} FROM upload_sessions WHERE id=? AND user_id=? LIMIT 1`, [id, userId]);
        if (!session)
            throw new UploadProblem('UPLOAD_NOT_FOUND', 'Upload session not found');
        if (session.expiresAt < new Date())
            throw new UploadProblem('UPLOAD_EXPIRED', 'Upload session expired');
        if (['CANCELLED', 'COMPLETED', 'FAILED', 'EXPIRED'].includes(session.status))
            throw new UploadProblem(`UPLOAD_${session.status}`, `Upload is ${session.status.toLowerCase()}`);
        const file = await file_repository_1.fileRepository.findById(session.fileId);
        if (!file || file.userId !== userId)
            throw new UploadProblem('UPLOAD_NOT_FOUND', 'Upload file not found');
        return { ...session, file };
    }
    async status(userId, id) {
        const session = await this.getOwnedSession(userId, id);
        const chunks = await (0, db_1.query)(`SELECT chunk_index AS chunkIndex,original_size AS originalSize,checksum FROM file_chunks WHERE file_id=? AND status='UPLOADED' ORDER BY chunk_index`, [session.fileId]);
        return {
            uploadId: session.id, fileId: session.fileId, filename: session.originalFilename, fileSize: session.fileSize, chunkSize: session.chunkSize,
            status: session.status.toLowerCase(), totalChunks: session.totalChunks, uploadedChunks: chunks.map((chunk) => chunk.chunkIndex), chunks,
            uploadedBytes: chunks.reduce((sum, chunk) => sum + chunk.originalSize, 0), expiresAt: session.expiresAt,
        };
    }
    async uploadChunk(user, sessionId, index, body) {
        const session = await this.getOwnedSession(user.id, sessionId);
        if (!Number.isInteger(index) || index < 0 || index >= session.totalChunks)
            throw new UploadProblem('CHUNK_INDEX_INVALID', 'Chunk index is invalid');
        const expected = expectedChunkSize(session.fileSize, session.chunkSize, index, session.totalChunks);
        if (body.length !== expected)
            throw new UploadProblem('CHUNK_SIZE_INVALID', `Expected ${expected} bytes, received ${body.length}`);
        const [existing] = await (0, db_1.query)('SELECT original_size AS originalSize,checksum,status FROM file_chunks WHERE file_id=? AND chunk_index=? LIMIT 1', [session.fileId, index]);
        if (existing?.status === 'UPLOADED') {
            if (!(0, chunk_integrity_1.matchesStoredChunk)(existing, body))
                throw new UploadProblem('CHUNK_ALREADY_EXISTS', 'This chunk index is already stored with different content');
            return { index, status: 'already_uploaded', size: existing.originalSize };
        }
        const masterKey = user_service_1.userService.getMasterKey(user);
        const fileKey = encryption_service_1.encryptionService.unwrapKey(session.file.encryptedFileKey, masterKey);
        masterKey.fill(0);
        const encrypted = encryption_service_1.encryptionService.encryptChunk(body, fileKey, aad(session.fileId, index));
        fileKey.fill(0);
        const path = chunkPath(session.fileId, index);
        let result;
        try {
            result = await github_storage_provider_1.storageProvider.uploadObject({ storagePath: path, encryptedBuffer: encrypted, account: { accountId: user.id } });
        }
        catch (error) {
            if (error instanceof storage_provider_interface_1.StorageLimitError)
                throw new UploadProblem('STORAGE_LIMIT', error.message);
            if (error instanceof storage_provider_interface_1.StorageUnavailableError)
                throw new UploadProblem('STORAGE_UNAVAILABLE', error.message);
            throw error;
        }
        const checksum = encryption_service_1.encryptionService.computeChecksum(body);
        await (0, db_1.execute)(`INSERT INTO file_chunks (id,file_id,chunk_index,github_path,github_sha,encrypted_size,original_size,nonce,checksum,status)
      VALUES (?,?,?,?,?,?,?,?,?,'UPLOADED') ON DUPLICATE KEY UPDATE github_path=VALUES(github_path),github_sha=VALUES(github_sha),encrypted_size=VALUES(encrypted_size),original_size=VALUES(original_size),nonce=VALUES(nonce),checksum=VALUES(checksum),status='UPLOADED'`, [crypto.randomUUID(), session.fileId, index, path, result.providerRef, encrypted.length, body.length, encrypted.subarray(6, 18).toString('base64'), checksum]);
        await (0, db_1.execute)("UPDATE upload_sessions SET status='UPLOADING' WHERE id=?", [session.id]);
        return { index, status: 'uploaded', size: body.length };
    }
    async complete(user, sessionId) {
        const session = await this.getOwnedSession(user.id, sessionId);
        const chunks = await (0, db_1.query)(`SELECT id,file_id AS fileId,chunk_index AS chunkIndex,github_path AS githubPath,github_sha AS githubSha,encrypted_size AS encryptedSize,original_size AS originalSize,nonce,checksum,status,created_at AS createdAt,updated_at AS updatedAt FROM file_chunks WHERE file_id=? AND status='UPLOADED' ORDER BY chunk_index`, [session.fileId]);
        const missing = Array.from({ length: session.totalChunks }, (_, index) => index).filter((index) => !chunks[index] || chunks[index].chunkIndex !== index);
        if (missing.length)
            throw new UploadProblem('MISSING_CHUNKS', 'Upload is missing chunks', missing);
        const masterKey = user_service_1.userService.getMasterKey(user);
        const fileKey = encryption_service_1.encryptionService.unwrapKey(session.file.encryptedFileKey, masterKey);
        masterKey.fill(0);
        const hash = crypto.createHash('sha256');
        try {
            for (const chunk of chunks) {
                const encrypted = await github_storage_provider_1.storageProvider.downloadObject({ storagePath: chunk.githubPath, account: { accountId: user.id } });
                const plaintext = encryption_service_1.encryptionService.decryptChunk(encrypted, fileKey, aad(session.fileId, chunk.chunkIndex));
                if (plaintext.length !== expectedChunkSize(session.fileSize, session.chunkSize, chunk.chunkIndex, session.totalChunks) || !(0, chunk_integrity_1.matchesStoredChunk)(chunk, plaintext))
                    throw new UploadProblem('CHUNK_INVALID', `Chunk ${chunk.chunkIndex} failed integrity verification`);
                hash.update(plaintext);
            }
        }
        finally {
            fileKey.fill(0);
        }
        if (chunks.reduce((sum, chunk) => sum + chunk.originalSize, 0) !== session.fileSize)
            throw new UploadProblem('CHUNK_INVALID', 'Total uploaded chunk size does not match file manifest');
        const checksum = hash.digest('hex');
        await (0, db_1.execute)("UPDATE files SET checksum=?,status='ACTIVE' WHERE id=?", [checksum, session.fileId]);
        await (0, db_1.execute)("UPDATE upload_sessions SET status='COMPLETED' WHERE id=?", [session.id]);
        const file = await file_repository_1.fileRepository.findById(session.fileId);
        if (!file)
            throw new Error('Completed file metadata missing');
        await (0, file_activity_service_1.recordFileActivity)(user.id, file.id, 'UPLOAD', file.originalFilename);
        return file;
    }
    async cancel(user, sessionId) {
        const [session] = await (0, db_1.query)(`SELECT ${SESSION_COLS} FROM upload_sessions WHERE id=? AND user_id=? LIMIT 1`, [sessionId, user.id]);
        if (!session)
            throw new UploadProblem('UPLOAD_NOT_FOUND', 'Upload session not found');
        if (session.status === 'CANCELLED' || session.status === 'EXPIRED')
            return;
        if (session.status === 'COMPLETED')
            throw new UploadProblem('UPLOAD_COMPLETED', 'Completed uploads cannot be cancelled');
        const chunks = await (0, db_1.query)('SELECT github_path AS githubPath,github_sha AS githubSha FROM file_chunks WHERE file_id=?', [session.fileId]);
        let failed = false;
        for (const chunk of chunks) {
            if (!chunk.githubSha)
                continue;
            try {
                await github_storage_provider_1.storageProvider.deleteObject({ storagePath: chunk.githubPath, providerRef: chunk.githubSha, account: { accountId: user.id } });
            }
            catch {
                failed = true;
            }
        }
        if (failed)
            throw new UploadProblem('STORAGE_UNAVAILABLE', 'Some encrypted chunks could not be removed; cancellation can be retried');
        await (0, db_1.execute)("UPDATE upload_sessions SET status='CANCELLED' WHERE id=?", [sessionId]);
        await (0, db_1.execute)("UPDATE files SET status='DELETED' WHERE id=?", [session.fileId]);
    }
    async stream(user, id, write, range) {
        const access = await file_repository_1.fileRepository.findByIdAndAccessor(id, user.id);
        if (!access || access.file.status !== 'ACTIVE')
            throw new UploadProblem('FILE_NOT_FOUND', 'File not found');
        const file = access.file;
        if (file.storageType === 'GITHUB_SINGLE')
            return null;
        const owner = access.isOwner ? user : await user_repository_1.userRepository.findById(file.userId);
        if (!owner)
            throw new UploadProblem('FILE_NOT_FOUND', 'File owner not found');
        const keyMaster = user_service_1.userService.getMasterKey(user);
        const wrapped = access.isOwner ? file.encryptedFileKey : access.recipientEncryptedFileKey;
        if (!wrapped) {
            keyMaster.fill(0);
            throw new UploadProblem('FILE_NOT_FOUND', 'File share unavailable');
        }
        const fileKey = encryption_service_1.encryptionService.unwrapKey(wrapped, keyMaster);
        keyMaster.fill(0);
        const chunkSize = file.chunkSize;
        const total = file.totalChunks;
        if (!chunkSize || !total) {
            fileKey.fill(0);
            throw new UploadProblem('CHUNK_INVALID', 'Chunk manifest invalid');
        }
        const start = range?.start ?? 0;
        const end = range?.end ?? file.fileSize - 1;
        const first = Math.floor(start / chunkSize);
        const last = Math.floor(end / chunkSize);
        const chunks = await (0, db_1.query)(`SELECT id,file_id AS fileId,chunk_index AS chunkIndex,github_path AS githubPath,github_sha AS githubSha,encrypted_size AS encryptedSize,original_size AS originalSize,nonce,checksum,status,created_at AS createdAt,updated_at AS updatedAt FROM file_chunks WHERE file_id=? AND status='UPLOADED' AND chunk_index BETWEEN ? AND ? ORDER BY chunk_index`, [id, first, last]);
        const byIndex = new Map(chunks.map((chunk) => [chunk.chunkIndex, chunk]));
        try {
            for (let index = first; index <= last; index++) {
                const chunk = byIndex.get(index);
                if (!chunk)
                    throw new UploadProblem('CHUNK_INVALID', `Chunk ${index} missing`);
                const encrypted = await github_storage_provider_1.storageProvider.downloadObject({ storagePath: chunk.githubPath, account: { accountId: owner.id } });
                const plaintext = encryption_service_1.encryptionService.decryptChunk(encrypted, fileKey, aad(id, index));
                if (!(0, chunk_integrity_1.matchesStoredChunk)(chunk, plaintext) || plaintext.length !== expectedChunkSize(file.fileSize, chunkSize, index, total))
                    throw new UploadProblem('CHUNK_INVALID', `Chunk ${index} failed integrity verification`);
                const chunkStart = index * chunkSize;
                const from = Math.max(start - chunkStart, 0);
                const to = Math.min(end - chunkStart + 1, plaintext.length);
                if (to > from)
                    await write(plaintext.subarray(from, to));
            }
        }
        finally {
            fileKey.fill(0);
        }
        return file;
    }
    async cleanupExpired() {
        const sessions = await (0, db_1.query)(`SELECT ${SESSION_COLS} FROM upload_sessions WHERE expires_at<UTC_TIMESTAMP() AND status IN ('INITIALIZED','UPLOADING','PAUSED') LIMIT 100`);
        let cleaned = 0;
        for (const session of sessions) {
            const user = await user_repository_1.userRepository.findById(session.userId);
            if (!user)
                continue;
            const chunks = await (0, db_1.query)('SELECT github_path AS githubPath,github_sha AS githubSha FROM file_chunks WHERE file_id=?', [session.fileId]);
            let failed = false;
            for (const chunk of chunks) {
                if (!chunk.githubSha)
                    continue;
                try {
                    await github_storage_provider_1.storageProvider.deleteObject({ storagePath: chunk.githubPath, providerRef: chunk.githubSha, account: { accountId: user.id } });
                }
                catch {
                    failed = true;
                }
            }
            if (failed) {
                logger_1.logger.warn('Expired upload cleanup incomplete; will retry', { uploadId: session.id });
                continue;
            }
            await (0, db_1.execute)("UPDATE upload_sessions SET status='EXPIRED' WHERE id=?", [session.id]);
            await (0, db_1.execute)("UPDATE files SET status='DELETED' WHERE id=?", [session.fileId]);
            cleaned++;
        }
        return cleaned;
    }
}
exports.ResumableUploadService = ResumableUploadService;
exports.resumableUploadService = new ResumableUploadService();
