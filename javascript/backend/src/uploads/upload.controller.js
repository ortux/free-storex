"use strict";
/**
 * Upload Controller — tokenized upload flow for the GitHub backend
 *
 * 1. POST /api/v1/uploads/initiate  → validate → create PENDING → return signed token + URL
 * 2. PUT  /api/v1/uploads/:uploadId → verify token → encrypt → push to GitHub → ACTIVE
 * 3. GET  /api/v1/uploads/:uploadId/status → poll status
 * 4. DELETE /api/v1/uploads/:uploadId → abort PENDING upload
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
const express_1 = require("express");
const crypto = __importStar(require("crypto"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const rate_limit_middleware_1 = require("../middleware/rate-limit.middleware");
const upload_token_service_1 = require("./upload-token.service");
const file_repository_1 = require("../files/file.repository");
const file_activity_service_1 = require("../files/file-activity.service");
const user_service_1 = require("../users/user.service");
const encryption_service_1 = require("../encryption/encryption.service");
const github_storage_provider_1 = require("../storage/github-storage.provider");
const config_1 = require("../config");
const db_1 = require("../lib/db");
const logger_1 = require("../lib/logger");
const resumable_upload_service_1 = require("./resumable-upload.service");
const router = (0, express_1.Router)();
function getActorId(req) {
    return req.session?.userId ?? req.apiKeyUserId;
}
function sanitize(name) {
    return name.replace(/[/\\?%*:|"<>]/g, '-').replace(/\.\./g, '').substring(0, 255);
}
function newFileId() {
    return 'f_' + crypto.randomBytes(8).toString('hex');
}
function newStoredFilename() {
    return crypto.randomBytes(8).toString('hex') + '.enc';
}
function collectBody(req) {
    if (Buffer.isBuffer(req.body))
        return Promise.resolve(req.body);
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}
function fileDto(file) {
    return {
        id: file.id,
        filename: file.originalFilename,
        mimeType: file.mimeType,
        size: file.fileSize,
        status: file.status,
        checksum: file.checksum,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
        folderId: file.folderId,
        sortOrder: file.sortOrder,
    };
}
// ── Resumable upload API ─────────────────────────────────────────────────────
router.post('/', auth_middleware_1.requireAuth, rate_limit_middleware_1.uploadRateLimit, async (req, res, next) => {
    try {
        const user = await user_service_1.userService.getById(getActorId(req));
        if (!user)
            throw new resumable_upload_service_1.UploadProblem('UNAUTHORIZED', 'User not found');
        const body = req.body;
        const upload = await resumable_upload_service_1.resumableUploadService.create(user, {
            filename: String(body.filename ?? ''),
            mimeType: String(body.mimeType ?? body.mime_type ?? ''),
            fileSize: Number(body.fileSize ?? body.size),
            workspaceId: typeof body.workspaceId === 'string' ? body.workspaceId : undefined,
            folderId: typeof body.folderId === 'string' ? body.folderId : null,
        });
        res.status(201).json({ success: true, data: { upload } });
    }
    catch (err) {
        next(err);
    }
});
router.get('/', auth_middleware_1.requireAuth, rate_limit_middleware_1.authRateLimit, async (req, res, next) => {
    try {
        res.json({ success: true, data: { uploads: await resumable_upload_service_1.resumableUploadService.listActive(getActorId(req)) } });
    }
    catch (err) {
        next(err);
    }
});
router.get('/:uploadId/status', auth_middleware_1.requireAuth, rate_limit_middleware_1.authRateLimit, async (req, res, next) => {
    try {
        res.json({ success: true, data: await resumable_upload_service_1.resumableUploadService.status(getActorId(req), req.params.uploadId) });
    }
    catch (err) {
        next(err);
    }
});
router.put('/:uploadId/chunks/:chunkIndex', auth_middleware_1.requireAuth, rate_limit_middleware_1.uploadRateLimit, async (req, res, next) => {
    try {
        const user = await user_service_1.userService.getById(getActorId(req));
        if (!user)
            throw new resumable_upload_service_1.UploadProblem('UNAUTHORIZED', 'User not found');
        const body = Buffer.isBuffer(req.body) ? req.body : await collectBody(req);
        const chunk = await resumable_upload_service_1.resumableUploadService.uploadChunk(user, req.params.uploadId, Number(req.params.chunkIndex), body);
        res.json({ success: true, data: { chunk } });
    }
    catch (err) {
        next(err);
    }
});
router.post('/:uploadId/complete', auth_middleware_1.requireAuth, rate_limit_middleware_1.uploadRateLimit, async (req, res, next) => {
    try {
        const user = await user_service_1.userService.getById(getActorId(req));
        if (!user)
            throw new resumable_upload_service_1.UploadProblem('UNAUTHORIZED', 'User not found');
        const file = await resumable_upload_service_1.resumableUploadService.complete(user, req.params.uploadId);
        res.json({ success: true, data: { file: fileDto(file), url: `${req.protocol}://${req.get('host')}/api/v1/files/${file.id}` } });
    }
    catch (err) {
        next(err);
    }
});
router.delete('/:uploadId', auth_middleware_1.requireAuth, async (req, res, next) => {
    try {
        const user = await user_service_1.userService.getById(getActorId(req));
        if (!user)
            throw new resumable_upload_service_1.UploadProblem('UNAUTHORIZED', 'User not found');
        await resumable_upload_service_1.resumableUploadService.cancel(user, req.params.uploadId);
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
// ── 1. Initiate ───────────────────────────────────────────────────────────────
router.post('/initiate', auth_middleware_1.requireAuth, rate_limit_middleware_1.uploadRateLimit, async (req, res, next) => {
    try {
        const actorId = getActorId(req);
        const user = await user_service_1.userService.getById(actorId);
        if (!user) {
            res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'User not found' } });
            return;
        }
        const body = req.body;
        const filename = body.filename;
        const mimeType = body.mimeType;
        const fileSize = body.fileSize;
        const workspaceId = body.workspaceId;
        const folderId = typeof body.folderId === 'string' && body.folderId ? body.folderId : null;
        if (!filename || typeof filename !== 'string') {
            res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'filename is required' } });
            return;
        }
        if (!mimeType || !config_1.config.files.allowedMimeTypes.includes(mimeType)) {
            res.status(415).json({ success: false, error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: `Allowed types: ${config_1.config.files.allowedMimeTypes.join(', ')}` } });
            return;
        }
        if (!fileSize || typeof fileSize !== 'number' || fileSize <= 0) {
            res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'fileSize must be a positive number' } });
            return;
        }
        if (fileSize > config_1.config.files.maxSizeMb * 1024 * 1024) {
            res.status(413).json({ success: false, error: { code: 'FILE_TOO_LARGE', message: `Max size is ${config_1.config.files.maxSizeMb}MB` } });
            return;
        }
        if (fileSize > config_1.config.files.largeFileThresholdMb * 1024 * 1024) {
            res.status(413).json({ success: false, error: { code: 'USE_RESUMABLE_UPLOAD', message: 'File exceeds the single-object upload threshold; use resumable upload' } });
            return;
        }
        await github_storage_provider_1.storageProvider.assertCapacity({ accountId: user.id }, fileSize + 34);
        let fileWorkspaceId;
        if (workspaceId) {
            const [workspace] = await (0, db_1.query)('SELECT id FROM workspaces WHERE id=? LIMIT 1', [workspaceId]);
            if (!workspace) {
                res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Workspace not found' } });
                return;
            }
            fileWorkspaceId = workspace.id;
        }
        if (folderId && !(await (0, db_1.query)('SELECT id FROM folders WHERE id=? AND user_id=? LIMIT 1', [folderId, user.id])).length) {
            res.status(404).json({ success: false, error: { code: 'FOLDER_NOT_FOUND', message: 'Destination folder not found' } });
            return;
        }
        const fileId = newFileId();
        const storedFilename = newStoredFilename();
        const storagePath = `files/${storedFilename}`;
        await file_repository_1.fileRepository.create({
            id: fileId,
            userId: user.id,
            workspaceId: fileWorkspaceId,
            folderId,
            originalFilename: sanitize(filename),
            storedFilename,
            storagePath,
            mimeType,
            fileSize,
            encryptedFileKey: '',
            checksum: '',
            status: 'PENDING',
        });
        const token = upload_token_service_1.uploadTokenService.sign({ uploadId: fileId, userId: user.id, mimeType, fileSize, originalFilename: sanitize(filename) });
        const expiresAt = new Date(Date.now() + config_1.config.upload.tokenTtlSeconds * 1000);
        const uploadUrl = upload_token_service_1.uploadTokenService.buildUploadUrl(`${req.protocol}://${req.get('host')}`, fileId);
        logger_1.safeLog.userUpload(user.id, `${fileId} [initiated]`);
        res.status(201).json({
            success: true,
            data: { uploadId: fileId, uploadUrl, token, expiresAt: expiresAt.toISOString(), expiresInSeconds: config_1.config.upload.tokenTtlSeconds, filename: sanitize(filename), mimeType, fileSize },
        });
    }
    catch (err) {
        next(err);
    }
});
// ── 2. Execute upload ─────────────────────────────────────────────────────────
router.put('/:uploadId', async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization ?? '';
        if (!authHeader.startsWith('Bearer ')) {
            res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Upload token required' } });
            return;
        }
        let tokenPayload;
        try {
            tokenPayload = upload_token_service_1.uploadTokenService.verify(authHeader.slice(7).trim());
        }
        catch {
            res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Upload token is invalid or expired' } });
            return;
        }
        const { uploadId, userId, fileSize } = tokenPayload;
        if (uploadId !== req.params.uploadId) {
            res.status(403).json({ success: false, error: { code: 'TOKEN_MISMATCH', message: 'Token uploadId does not match URL' } });
            return;
        }
        const fileRecord = await file_repository_1.fileRepository.findById(uploadId);
        if (!fileRecord) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Upload not found' } });
            return;
        }
        if (fileRecord.userId !== userId) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Token does not match file owner' } });
            return;
        }
        if (fileRecord.status !== 'PENDING') {
            const code = fileRecord.status === 'ACTIVE' ? 'ALREADY_COMPLETED' : 'UPLOAD_NOT_RESUMABLE';
            res.status(409).json({ success: false, error: { code, message: `Upload is in state: ${fileRecord.status}` } });
            return;
        }
        const fileBuffer = await collectBody(req);
        if (fileBuffer.length === 0) {
            res.status(400).json({ success: false, error: { code: 'EMPTY_BODY', message: 'Request body is empty' } });
            return;
        }
        if (Math.abs(fileBuffer.length - fileSize) > 1024) {
            res.status(400).json({ success: false, error: { code: 'SIZE_MISMATCH', message: `Received ${fileBuffer.length} bytes but token declared ${fileSize} bytes` } });
            return;
        }
        const user = await user_service_1.userService.getById(userId);
        if (!user) {
            res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'User not found' } });
            return;
        }
        await file_repository_1.fileRepository.updateStatus(uploadId, 'UPLOADING');
        try {
            const checksum = encryption_service_1.encryptionService.computeChecksum(fileBuffer);
            const fileKey = encryption_service_1.encryptionService.generateKey();
            const encrypted = encryption_service_1.encryptionService.encrypt(fileBuffer, fileKey);
            logger_1.safeLog.encryptionSuccess(uploadId);
            const masterKey = user_service_1.userService.getMasterKey(user);
            const encryptedFileKey = encryption_service_1.encryptionService.wrapKey(fileKey, masterKey);
            fileKey.fill(0);
            masterKey.fill(0);
            const uploadResult = await github_storage_provider_1.storageProvider.uploadObject({
                storagePath: fileRecord.storagePath,
                encryptedBuffer: encrypted,
                account: { accountId: user.id },
            });
            logger_1.safeLog.githubUpload(uploadId, fileRecord.storagePath);
            await file_repository_1.fileRepository.updateUploadResult(uploadId, { checksum, encryptedFileKey, providerRef: uploadResult.providerRef });
            const updated = await file_repository_1.fileRepository.findById(uploadId);
            if (!updated)
                throw new Error('Uploaded file metadata was not found');
            logger_1.safeLog.userUpload(user.id, uploadId);
            await (0, file_activity_service_1.recordFileActivity)(user.id, updated.id, 'UPLOAD', updated.originalFilename);
            res.json({ success: true, data: { file: fileDto(updated), url: `${req.protocol}://${req.get('host')}/api/v1/images/${updated.id}` } });
        }
        catch (err) {
            await file_repository_1.fileRepository.updateStatus(uploadId, 'FAILED').catch(() => { });
            throw err;
        }
    }
    catch (err) {
        next(err);
    }
});
// ── 3. Status ─────────────────────────────────────────────────────────────────
router.get('/:uploadId/status', auth_middleware_1.requireAuth, rate_limit_middleware_1.authRateLimit, async (req, res, next) => {
    try {
        const actorId = getActorId(req);
        const fileRecord = await file_repository_1.fileRepository.findById(req.params.uploadId);
        if (!fileRecord || fileRecord.userId !== actorId) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Upload not found' } });
            return;
        }
        const STATUS_MAP = {
            PENDING: 'waiting', UPLOADING: 'in_progress', ACTIVE: 'complete',
            FAILED: 'failed', DELETING: 'deleting', DELETED: 'deleted',
        };
        res.json({
            success: true,
            data: {
                uploadId: fileRecord.id,
                status: STATUS_MAP[fileRecord.status] ?? fileRecord.status.toLowerCase(),
                rawStatus: fileRecord.status,
                filename: fileRecord.originalFilename,
                mimeType: fileRecord.mimeType,
                fileSize: fileRecord.fileSize,
                createdAt: fileRecord.createdAt,
                updatedAt: fileRecord.updatedAt,
                ...(fileRecord.status === 'ACTIVE' && { url: `${req.protocol}://${req.get('host')}/api/v1/images/${fileRecord.id}` }),
            },
        });
    }
    catch (err) {
        next(err);
    }
});
// ── 4. Abort ──────────────────────────────────────────────────────────────────
router.delete('/:uploadId', auth_middleware_1.requireAuth, async (req, res, next) => {
    try {
        const actorId = getActorId(req);
        const fileRecord = await file_repository_1.fileRepository.findById(req.params.uploadId);
        if (!fileRecord || fileRecord.userId !== actorId) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Upload not found' } });
            return;
        }
        if (fileRecord.status !== 'PENDING') {
            res.status(409).json({ success: false, error: { code: 'CANNOT_ABORT', message: `Cannot abort upload in state: ${fileRecord.status}` } });
            return;
        }
        await file_repository_1.fileRepository.hardDelete(fileRecord.id);
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
