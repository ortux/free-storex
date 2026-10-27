"use strict";
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
exports.fileService = exports.FileService = exports.ForbiddenError = exports.NotFoundError = void 0;
const crypto = __importStar(require("crypto"));
const encryption_service_1 = require("../encryption/encryption.service");
const github_storage_provider_1 = require("../storage/github-storage.provider");
const file_repository_1 = require("./file.repository");
const user_service_1 = require("../users/user.service");
const logger_1 = require("../lib/logger");
const config_1 = require("../config");
const file_activity_service_1 = require("./file-activity.service");
const user_repository_1 = require("../users/user.repository");
class NotFoundError extends Error {
    constructor(msg) { super(msg); this.name = 'NotFoundError'; }
}
exports.NotFoundError = NotFoundError;
class ForbiddenError extends Error {
    constructor(msg) { super(msg); this.name = 'ForbiddenError'; }
}
exports.ForbiddenError = ForbiddenError;
function generateFileId() {
    return 'f_' + crypto.randomBytes(8).toString('hex');
}
function generateStoredFilename() {
    return crypto.randomBytes(8).toString('hex') + '.enc';
}
function sanitizeFilename(name) {
    return name.replace(/[/\\?%*:|"<>]/g, '-').replace(/\.\./g, '').substring(0, 255);
}
class FileService {
    async upload(user, fileBuffer, originalFilename, mimeType, workspace, folderId) {
        const maxBytes = config_1.config.files.maxSizeMb * 1024 * 1024;
        if (fileBuffer.length > maxBytes) {
            throw new Error(`File exceeds maximum size of ${config_1.config.files.maxSizeMb}MB`);
        }
        if (!config_1.config.files.allowedMimeTypes.includes(mimeType)) {
            throw new Error(`File type ${mimeType} is not allowed`);
        }
        if (fileBuffer.length > config_1.config.files.largeFileThresholdMb * 1024 * 1024) {
            throw new Error('File exceeds the single-object upload threshold; use resumable upload');
        }
        const fileId = generateFileId();
        const storedFilename = generateStoredFilename();
        const storagePath = `files/${storedFilename}`;
        await file_repository_1.fileRepository.create({
            id: fileId,
            userId: user.id,
            workspaceId: workspace?.id,
            folderId: folderId ?? null,
            originalFilename: sanitizeFilename(originalFilename),
            storedFilename,
            storagePath,
            mimeType,
            fileSize: fileBuffer.length,
            encryptedFileKey: '',
            checksum: '',
            status: 'PENDING',
        });
        try {
            await file_repository_1.fileRepository.updateStatus(fileId, 'UPLOADING');
            const checksum = encryption_service_1.encryptionService.computeChecksum(fileBuffer);
            const fileKey = encryption_service_1.encryptionService.generateKey();
            const encryptedBuffer = encryption_service_1.encryptionService.encrypt(fileBuffer, fileKey);
            logger_1.safeLog.encryptionSuccess(fileId);
            const masterKey = user_service_1.userService.getMasterKey(user);
            const encryptedFileKey = encryption_service_1.encryptionService.wrapKey(fileKey, masterKey);
            fileKey.fill(0);
            masterKey.fill(0);
            await github_storage_provider_1.storageProvider.assertCapacity({ accountId: user.id }, encryptedBuffer.length);
            const uploadResult = await github_storage_provider_1.storageProvider.uploadObject({
                storagePath,
                encryptedBuffer,
                account: { accountId: user.id },
            });
            logger_1.safeLog.githubUpload(fileId, storagePath);
            await file_repository_1.fileRepository.updateUploadResult(fileId, { checksum, encryptedFileKey, providerRef: uploadResult.providerRef });
            const updated = await file_repository_1.fileRepository.findById(fileId);
            if (!updated)
                throw new Error('Uploaded file metadata was not found');
            logger_1.safeLog.userUpload(user.id, fileId);
            await (0, file_activity_service_1.recordFileActivity)(user.id, fileId, 'UPLOAD', updated.originalFilename);
            return updated;
        }
        catch (err) {
            await file_repository_1.fileRepository.updateStatus(fileId, 'FAILED').catch(() => { });
            throw err;
        }
    }
    async download(user, fileId) {
        const access = await file_repository_1.fileRepository.findByIdAndAccessor(fileId, user.id);
        if (!access)
            throw new NotFoundError('File not found');
        const { file, isOwner, recipientEncryptedFileKey } = access;
        const fileOwner = isOwner
            ? user
            : await user_repository_1.userRepository.findById(file.userId);
        if (!fileOwner)
            throw new NotFoundError('File owner not found');
        const encryptedBuffer = await github_storage_provider_1.storageProvider.downloadObject({
            storagePath: file.storagePath,
            account: { accountId: fileOwner.id },
        });
        const wrappedKey = isOwner ? file.encryptedFileKey : recipientEncryptedFileKey;
        const masterKey = user_service_1.userService.getMasterKey(user);
        const fileKey = encryption_service_1.encryptionService.unwrapKey(wrappedKey, masterKey);
        masterKey.fill(0);
        const plaintext = encryption_service_1.encryptionService.decrypt(encryptedBuffer, fileKey);
        fileKey.fill(0);
        logger_1.safeLog.decryptionSuccess(fileId);
        logger_1.safeLog.userDownload(user.id, fileId);
        return { buffer: plaintext, file };
    }
    async delete(user, fileId) {
        const file = await file_repository_1.fileRepository.findByIdAndUserId(fileId, user.id);
        if (!file)
            throw new NotFoundError('File not found');
        if (file.status === 'DELETED')
            return;
        if (!file.providerRef) {
            throw new Error('Cannot delete file: missing GitHub SHA');
        }
        await file_repository_1.fileRepository.updateStatus(fileId, 'DELETING');
        try {
            await github_storage_provider_1.storageProvider.deleteObject({
                storagePath: file.storagePath,
                providerRef: file.providerRef,
                account: { accountId: user.id },
            });
            logger_1.safeLog.githubDelete(fileId);
            await file_repository_1.fileRepository.delete(fileId);
            logger_1.safeLog.userDelete(user.id, fileId);
            await (0, file_activity_service_1.recordFileActivity)(user.id, fileId, 'DELETE', file.originalFilename);
        }
        catch (err) {
            await file_repository_1.fileRepository.updateStatus(fileId, 'ACTIVE').catch(() => { });
            throw err;
        }
    }
    async list(userId, options) {
        return file_repository_1.fileRepository.listByUserId(userId, options);
    }
    async listWorkspaceFiles(workspaceId, options) {
        return file_repository_1.fileRepository.listByWorkspaceId(workspaceId, options);
    }
    async getById(userId, fileId) {
        return file_repository_1.fileRepository.findByIdAndUserId(fileId, userId);
    }
}
exports.FileService = FileService;
exports.fileService = new FileService();
