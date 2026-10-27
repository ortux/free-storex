/**
 * Upload Controller — tokenized upload flow for the GitHub backend
 *
 * 1. POST /api/v1/uploads/initiate  → validate → create PENDING → return signed token + URL
 * 2. PUT  /api/v1/uploads/:uploadId → verify token → encrypt → push to GitHub → ACTIVE
 * 3. GET  /api/v1/uploads/:uploadId/status → poll status
 * 4. DELETE /api/v1/uploads/:uploadId → abort PENDING upload
 */

import { Router } from 'express';
import * as crypto from 'crypto';
import type { Request } from 'express';
import type { User } from '../lib/models';

import { requireAuthOrApiKey }           from '../middleware/auth.middleware';
import { uploadRateLimit, authRateLimit } from '../middleware/rate-limit.middleware';
import { uploadTokenService }            from './upload-token.service';
import { fileRepository }               from '../files/file.repository';
import { recordFileActivity }            from '../files/file-activity.service';
import { userService }                  from '../users/user.service';
import { encryptionService }            from '../encryption/encryption.service';
import { storageProvider }              from '../storage/github-storage.provider';
import { config }                       from '../config';
import { getPublicOrigin }              from '../middleware/proxy.middleware';
import { query }                         from '../lib/db';
import { safeLog }                      from '../lib/logger';
import { resumableUploadService, UploadProblem } from './resumable-upload.service';

const router = Router();

function getActorId(req: Request): string {
  return req.session?.userId ?? req.apiKeyUserId!;
}
function sanitize(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '-').replace(/\.\./g, '').substring(0, 255);
}
function newFileId(): string {
  return 'f_' + crypto.randomBytes(8).toString('hex');
}
function newStoredFilename(): string {
  return crypto.randomBytes(8).toString('hex') + '.enc';
}

function collectBody(req: Request): Promise<Buffer> {
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data',  (c: Buffer) => chunks.push(c));
    req.on('end',   () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function fileDto(file: {
  id: string; originalFilename: string; mimeType: string;
  fileSize: number; status: string; checksum: string;
  createdAt: Date; updatedAt: Date;
  folderId: string | null; sortOrder: number;
}) {
  return {
    id:        file.id,
    filename:  file.originalFilename,
    mimeType:  file.mimeType,
    size:      file.fileSize,
    status:    file.status,
    checksum:  file.checksum,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
    folderId: file.folderId,
    sortOrder: file.sortOrder,
  };
}

// ── Resumable upload API ─────────────────────────────────────────────────────

router.post('/', requireAuthOrApiKey, uploadRateLimit, async (req, res, next) => {
  try {
    const user = await userService.getById(getActorId(req)) as User | null;
    if (!user) throw new UploadProblem('UNAUTHORIZED', 'User not found');
    const body = req.body as Record<string, unknown>;
    const upload = await resumableUploadService.create(user, {
      filename: String(body.filename ?? ''),
      mimeType: String(body.mimeType ?? body.mime_type ?? ''),
      fileSize: Number(body.fileSize ?? body.size),
      workspaceId: typeof body.workspaceId === 'string' ? body.workspaceId : undefined,
      folderId: typeof body.folderId === 'string' ? body.folderId : null,
    });
    const chunkUploadToken = uploadTokenService.sign({
      purpose: 'resumable-chunk',
      uploadId: upload.id,
      userId: user.id,
      mimeType: 'application/octet-stream',
      fileSize: upload.fileSize,
      originalFilename: upload.originalFilename,
    });
    const chunkUploadUrl = uploadTokenService.buildChunkUploadUrl(config.upload.publicOrigin || getPublicOrigin(req), upload.id);
    res.status(201).json({ success: true, data: { upload, chunkUploadToken, chunkUploadUrl } });
  } catch (err) { next(err); }
});

router.get('/', requireAuthOrApiKey, authRateLimit, async (req, res, next) => {
  try {
    res.json({ success: true, data: { uploads: await resumableUploadService.listActive(getActorId(req)) } });
  } catch (err) { next(err); }
});

router.get('/:uploadId/status', requireAuthOrApiKey, authRateLimit, async (req, res, next) => {
  try {
    const userId = getActorId(req);
    const status = await resumableUploadService.status(userId, req.params.uploadId);
    const chunkUploadToken = uploadTokenService.sign({
      purpose: 'resumable-chunk',
      uploadId: status.uploadId,
      userId,
      mimeType: 'application/octet-stream',
      fileSize: status.fileSize,
      originalFilename: status.filename,
    });
    const chunkUploadUrl = uploadTokenService.buildChunkUploadUrl(config.upload.publicOrigin || getPublicOrigin(req), status.uploadId);
    res.json({ success: true, data: { ...status, chunkUploadToken, chunkUploadUrl } });
  } catch (err) { next(err); }
});

router.put('/:uploadId/chunks/:chunkIndex', uploadRateLimit, async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Upload token required' } });
      return;
    }

    let tokenPayload: ReturnType<typeof uploadTokenService.verify>;
    try {
      tokenPayload = uploadTokenService.verify(authHeader.slice(7).trim());
    } catch {
      res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Upload token is invalid or expired' } });
      return;
    }
    if (tokenPayload.purpose !== 'resumable-chunk' || tokenPayload.uploadId !== req.params.uploadId) {
      res.status(403).json({ success: false, error: { code: 'TOKEN_MISMATCH', message: 'Token is not valid for this upload chunk' } });
      return;
    }

    const user = await userService.getById(tokenPayload.userId) as User | null;
    if (!user) throw new UploadProblem('UNAUTHORIZED', 'User not found');
    const body = Buffer.isBuffer(req.body) ? req.body : await collectBody(req);
    const chunk = await resumableUploadService.uploadChunk(user, req.params.uploadId, Number(req.params.chunkIndex), body);
    res.json({ success: true, data: { chunk } });
  } catch (err) { next(err); }
});

router.post('/:uploadId/complete', requireAuthOrApiKey, uploadRateLimit, async (req, res, next) => {
  try {
    const user = await userService.getById(getActorId(req)) as User | null;
    if (!user) throw new UploadProblem('UNAUTHORIZED', 'User not found');
    const file = await resumableUploadService.complete(user, req.params.uploadId);
    res.json({ success: true, data: { file: fileDto(file), url: `${getPublicOrigin(req)}/api/v1/files/${file.id}` } });
  } catch (err) { next(err); }
});

router.delete('/:uploadId', requireAuthOrApiKey, async (req, res, next) => {
  try {
    const user = await userService.getById(getActorId(req)) as User | null;
    if (!user) throw new UploadProblem('UNAUTHORIZED', 'User not found');
    await resumableUploadService.cancel(user, req.params.uploadId);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── 1. Initiate ───────────────────────────────────────────────────────────────

router.post('/initiate', requireAuthOrApiKey, uploadRateLimit, async (req, res, next) => {
  try {
    const actorId = getActorId(req);
    const user    = await userService.getById(actorId) as User | null;
    if (!user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'User not found' } });
      return;
    }

    const body        = req.body as Record<string, unknown>;
    const filename    = body.filename    as string | undefined;
    const mimeType    = body.mimeType    as string | undefined;
    const fileSize    = body.fileSize    as number | undefined;
    const workspaceId = body.workspaceId as string | undefined;
    const folderId = typeof body.folderId === 'string' && body.folderId ? body.folderId : null;

    if (!filename || typeof filename !== 'string') {
      res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'filename is required' } });
      return;
    }
    if (!mimeType || !config.files.allowedMimeTypes.includes(mimeType)) {
      res.status(415).json({ success: false, error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: `Allowed types: ${config.files.allowedMimeTypes.join(', ')}` } });
      return;
    }
    if (!fileSize || typeof fileSize !== 'number' || fileSize <= 0) {
      res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'fileSize must be a positive number' } });
      return;
    }
    if (fileSize > config.files.maxSizeMb * 1024 * 1024) {
      res.status(413).json({ success: false, error: { code: 'FILE_TOO_LARGE', message: `Max size is ${config.files.maxSizeMb}MB` } });
      return;
    }
    if (fileSize > config.files.largeFileThresholdMb * 1024 * 1024) {
      res.status(413).json({ success: false, error: { code: 'USE_RESUMABLE_UPLOAD', message: 'File exceeds the single-object upload threshold; use resumable upload' } });
      return;
    }
    let fileWorkspaceId: string | undefined;
    if (workspaceId) {
      const [workspace] = await query<Array<{ id: string }>>('SELECT id FROM workspaces WHERE id=? LIMIT 1', [workspaceId]);
      if (!workspace) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Workspace not found' } });
        return;
      }
      fileWorkspaceId = workspace.id;
    }

    if (folderId && !(await query('SELECT id FROM folders WHERE id=? AND user_id=? LIMIT 1', [folderId, user.id])).length) {
      res.status(404).json({ success: false, error: { code: 'FOLDER_NOT_FOUND', message: 'Destination folder not found' } });
      return;
    }

    const fileId         = newFileId();
    const storedFilename = newStoredFilename();
    const storagePath    = `files/${storedFilename}`;

    await fileRepository.create({
      id:               fileId,
      userId:           user.id,
      workspaceId:      fileWorkspaceId,
      folderId,
      originalFilename: sanitize(filename),
      storedFilename,
      storagePath,
      mimeType,
      fileSize,
      encryptedFileKey: '',
      checksum:         '',
      status:           'PENDING',
    });

    const token     = uploadTokenService.sign({ purpose: 'single', uploadId: fileId, userId: user.id, mimeType, fileSize, originalFilename: sanitize(filename) });
    const expiresAt = new Date(Date.now() + config.upload.tokenTtlSeconds * 1000);
    const uploadUrl = uploadTokenService.buildUploadUrl(config.upload.publicOrigin || getPublicOrigin(req), fileId);

    safeLog.userUpload(user.id, `${fileId} [initiated]`);

    res.status(201).json({
      success: true,
      data: { uploadId: fileId, uploadUrl, token, expiresAt: expiresAt.toISOString(), expiresInSeconds: config.upload.tokenTtlSeconds, filename: sanitize(filename), mimeType, fileSize },
    });
  } catch (err) { next(err); }
});

// ── 2. Execute upload ─────────────────────────────────────────────────────────

router.put('/:uploadId', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Upload token required' } });
      return;
    }

    let tokenPayload: ReturnType<typeof uploadTokenService.verify>;
    try {
      tokenPayload = uploadTokenService.verify(authHeader.slice(7).trim());
    } catch {
      res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Upload token is invalid or expired' } });
      return;
    }

    const { uploadId, userId, fileSize } = tokenPayload;

    if (tokenPayload.purpose !== 'single') {
      res.status(403).json({ success: false, error: { code: 'TOKEN_MISMATCH', message: 'Token is not valid for a single upload' } });
      return;
    }

    if (uploadId !== req.params.uploadId) {
      res.status(403).json({ success: false, error: { code: 'TOKEN_MISMATCH', message: 'Token uploadId does not match URL' } });
      return;
    }

    const fileRecord = await fileRepository.findById(uploadId);
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

    const user = await userService.getById(userId) as User | null;
    if (!user) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'User not found' } });
      return;
    }
    await fileRepository.updateStatus(uploadId, 'UPLOADING');

    try {
      const checksum         = encryptionService.computeChecksum(fileBuffer);
      const fileKey          = encryptionService.generateKey();
      const encrypted        = encryptionService.encrypt(fileBuffer, fileKey);
      safeLog.encryptionSuccess(uploadId);

      const masterKey        = userService.getMasterKey(user);
      const encryptedFileKey = encryptionService.wrapKey(fileKey, masterKey);
      fileKey.fill(0);
      masterKey.fill(0);

      const uploadResult = await storageProvider.uploadObject({
        storagePath:     fileRecord.storagePath,
        encryptedBuffer: encrypted,
        account:          { accountId: user.id },
      });
      safeLog.githubUpload(uploadId, fileRecord.storagePath);

      await fileRepository.updateUploadResult(uploadId, {
        checksum,
        encryptedFileKey,
        providerRef: uploadResult.providerRef,
        storageRepositoryId: uploadResult.repositoryId,
      });
      const updated = await fileRepository.findById(uploadId);
      if (!updated) throw new Error('Uploaded file metadata was not found');

      safeLog.userUpload(user.id, uploadId);
      await recordFileActivity(user.id, updated.id, 'UPLOAD', updated.originalFilename);
      res.json({ success: true, data: { file: fileDto(updated), url: `${getPublicOrigin(req)}/api/v1/images/${updated.id}` } });
    } catch (err) {
      await fileRepository.updateStatus(uploadId, 'FAILED').catch(() => {});
      throw err;
    }
  } catch (err) { next(err); }
});

// ── 3. Status ─────────────────────────────────────────────────────────────────

router.get('/:uploadId/status', requireAuthOrApiKey, authRateLimit, async (req, res, next) => {
  try {
    const actorId    = getActorId(req);
    const fileRecord = await fileRepository.findById(req.params.uploadId);
    if (!fileRecord || fileRecord.userId !== actorId) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Upload not found' } });
      return;
    }
    const STATUS_MAP: Record<string, string> = {
      PENDING: 'waiting', UPLOADING: 'in_progress', ACTIVE: 'complete',
      FAILED: 'failed', DELETING: 'deleting', DELETED: 'deleted',
    };
    res.json({
      success: true,
      data: {
        uploadId:  fileRecord.id,
        status:    STATUS_MAP[fileRecord.status] ?? fileRecord.status.toLowerCase(),
        rawStatus: fileRecord.status,
        filename:  fileRecord.originalFilename,
        mimeType:  fileRecord.mimeType,
        fileSize:  fileRecord.fileSize,
        createdAt: fileRecord.createdAt,
        updatedAt: fileRecord.updatedAt,
        ...(fileRecord.status === 'ACTIVE' && { url: `${getPublicOrigin(req)}/api/v1/images/${fileRecord.id}` }),
      },
    });
  } catch (err) { next(err); }
});

// ── 4. Abort ──────────────────────────────────────────────────────────────────

router.delete('/:uploadId', requireAuthOrApiKey, async (req, res, next) => {
  try {
    const actorId    = getActorId(req);
    const fileRecord = await fileRepository.findById(req.params.uploadId);
    if (!fileRecord || fileRecord.userId !== actorId) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Upload not found' } });
      return;
    }
    if (fileRecord.status !== 'PENDING') {
      res.status(409).json({ success: false, error: { code: 'CANNOT_ABORT', message: `Cannot abort upload in state: ${fileRecord.status}` } });
      return;
    }
    await fileRepository.hardDelete(fileRecord.id);
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
