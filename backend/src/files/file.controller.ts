import { Router } from 'express';
import multer from 'multer';
import { requireAuthOrApiKey } from '../middleware/auth.middleware';
import { uploadRateLimit, authRateLimit } from '../middleware/rate-limit.middleware';
import { fileService } from './file.service';
import { userService } from '../users/user.service';
import { config } from '../config';
import type { User } from '../lib/models';
import { fileRepository } from './file.repository';
import { resumableUploadService } from '../uploads/resumable-upload.service';
import { query } from '../lib/db';
import { recordFileActivity } from './file-activity.service';
import { getPublicOrigin } from '../middleware/proxy.middleware';

const router = Router();

// Multer: memory storage, no disk writes of plaintext
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.files.largeFileThresholdMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (config.files.allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed`));
    }
  },
});

function getUserId(req: import('express').Request): string {
  return req.session?.userId ?? req.apiKeyUserId!;
}

// GET /api/v1/files
router.get('/', requireAuthOrApiKey, authRateLimit, async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { search, mimeType, limit, offset, sortBy, sortOrder, folderId } = req.query as Record<string, string>;

    const result = await fileService.list(userId, {
      search,
      mimeType,
      ...(folderId !== undefined && { folderId: folderId === 'root' ? null : folderId }),
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
      sortBy: (['createdAt', 'fileSize', 'originalFilename', 'sortOrder'].includes(sortBy) ? sortBy : 'createdAt') as 'createdAt' | 'fileSize' | 'originalFilename' | 'sortOrder',
      sortOrder: sortOrder === 'asc' ? 'asc' : 'desc',
    });

    res.json({
      success: true,
      data: {
        files: result.files.map(safeFileDto),
        total: result.total,
        limit: limit ? parseInt(limit, 10) : 50,
        offset: offset ? parseInt(offset, 10) : 0,
      },
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/files/:id/move
router.patch('/:id/move', requireAuthOrApiKey, authRateLimit, async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const file = await fileRepository.findByIdAndUserId(req.params.id, userId);
    if (!file || file.status !== 'ACTIVE') {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'File not found' } });
      return;
    }
    const folderId = req.body?.folderId === null || req.body?.folderId === '' ? null : req.body?.folderId;
    if (folderId !== null && typeof folderId !== 'string') {
      res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'folderId must be a folder ID or null' } });
      return;
    }
    if (folderId && !(await query('SELECT id FROM folders WHERE id=? AND user_id=? LIMIT 1', [folderId, userId])).length) {
      res.status(404).json({ success: false, error: { code: 'FOLDER_NOT_FOUND', message: 'Folder not found' } });
      return;
    }
    const [last] = await query<Array<{ sortOrder: number }>>(`SELECT sort_order AS sortOrder FROM files WHERE user_id=? AND folder_id ${folderId === null ? 'IS NULL' : '= ?'} AND status='ACTIVE' ORDER BY sort_order DESC LIMIT 1`, folderId === null ? [userId] : [userId, folderId]);
    const updated = await fileRepository.move(file.id, folderId, (last?.sortOrder ?? -1) + 1);
    await recordFileActivity(userId, file.id, 'MOVE', file.originalFilename);
    res.json({ success: true, data: { file: safeFileDto(updated) } });
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/files/reorder
router.put('/reorder', requireAuthOrApiKey, authRateLimit, async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const fileIds: unknown = req.body?.fileIds;
    const folderValue = req.body?.folderId;
    const folderId = folderValue === null || folderValue === undefined || folderValue === 'root' ? null : folderValue;
    if (!Array.isArray(fileIds) || fileIds.some((id) => typeof id !== 'string') || new Set(fileIds).size !== fileIds.length) {
      res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'fileIds must be unique file IDs' } });
      return;
    }
    if (folderId !== null && typeof folderId !== 'string') {
      res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'folderId must be a folder ID or null' } });
      return;
    }
    if (folderId && !(await query('SELECT id FROM folders WHERE id=? AND user_id=? LIMIT 1', [folderId, userId])).length) {
      res.status(404).json({ success: false, error: { code: 'FOLDER_NOT_FOUND', message: 'Folder not found' } });
      return;
    }
    const ids = fileIds as string[];
    const owned = ids.length ? await query<Array<{ id: string }>>(
      `SELECT id FROM files WHERE id IN (${ids.map(() => '?').join(',')}) AND user_id=? AND folder_id ${folderId === null ? 'IS NULL' : '= ?'} AND status='ACTIVE'`,
      folderId === null ? [...ids, userId] : [...ids, userId, folderId],
    ) : [];
    if (owned.length !== ids.length) {
      res.status(400).json({ success: false, error: { code: 'INVALID_FILE_SET', message: 'All files must belong to you and the selected folder' } });
      return;
    }
    const [countRow] = await query<Array<{ total: number }>>(`SELECT COUNT(*) AS total FROM files WHERE user_id=? AND folder_id ${folderId === null ? 'IS NULL' : '= ?'} AND status='ACTIVE'`, folderId === null ? [userId] : [userId, folderId]);
    const folderFileCount = Number(countRow?.total ?? 0);
    if (folderFileCount !== ids.length) {
      res.status(400).json({ success: false, error: { code: 'INCOMPLETE_FILE_SET', message: 'Reordering requires every active file in the folder' } });
      return;
    }
    await fileRepository.reorder(userId, ids, folderId);
    if (ids.length) await recordFileActivity(userId, ids[0], 'REORDER', 'Files');
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/files
router.post('/', requireAuthOrApiKey, uploadRateLimit, upload.single('file'), async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const user = await userService.getById(userId) as User;

    if (!req.file) {
      res.status(400).json({ success: false, error: { code: 'NO_FILE', message: 'No file provided' } });
      return;
    }

    const folderId = typeof req.body?.folderId === 'string' && req.body.folderId ? req.body.folderId : null;
    if (folderId && !(await query('SELECT id FROM folders WHERE id=? AND user_id=? LIMIT 1', [folderId, userId])).length) {
      res.status(404).json({ success: false, error: { code: 'FOLDER_NOT_FOUND', message: 'Destination folder not found' } });
      return;
    }

    const file = await fileService.upload(
      user,
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      null,
      folderId
    );

    res.status(201).json({
      success: true,
      data: {
        file: {
          ...safeFileDto(file),
          url: `${getPublicOrigin(req)}/api/v1/images/${file.id}`,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/files/:id — download raw decrypted file
router.get('/:id', requireAuthOrApiKey, authRateLimit, async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const user = await userService.getById(userId) as User;

    const access = await fileRepository.findByIdAndAccessor(req.params.id, user.id);
    const metadata = access?.file;
    if (metadata?.storageType === 'GITHUB_CHUNKED') {
      const rangeHeader = req.headers.range;
      let range: { start: number; end: number } | undefined;
      if (rangeHeader) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
        const start = match?.[1] ? Number(match[1]) : Math.max(metadata.fileSize - Number(match?.[2] ?? 0), 0);
        const end = match?.[2] ? Number(match[2]) : metadata.fileSize - 1;
        if (!match || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= metadata.fileSize) {
          res.status(416).set('Content-Range', `bytes */${metadata.fileSize}`).end();
          return;
        }
        range = { start, end: Math.min(end, metadata.fileSize - 1) };
        res.status(206);
      }
      const start = range?.start ?? 0;
      const end = range?.end ?? metadata.fileSize - 1;
      const inline = req.query.inline === '1' && metadata.mimeType === 'application/pdf';
      res.set({
        'Content-Type': metadata.mimeType,
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(metadata.originalFilename)}"`,
        'Content-Length': String(end - start + 1),
        ...(range ? { 'Content-Range': `bytes ${start}-${end}/${metadata.fileSize}`, 'Accept-Ranges': 'bytes' } : { 'Accept-Ranges': 'bytes' }),
        'Cache-Control': 'private, no-store',
      });
      await resumableUploadService.stream(user, metadata.id, async (chunk) => {
        if (!res.write(chunk)) await new Promise<void>((resolve) => res.once('drain', resolve));
      }, range);
      res.end();
      return;
    }

    const { buffer, file } = await fileService.download(user, req.params.id);

    const inline = req.query.inline === '1' && file.mimeType === 'application/pdf';
    res.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(file.originalFilename)}"`,
      'Content-Length': buffer.length.toString(),
      'Cache-Control': 'private, no-store',
    });
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/files/:id
router.patch('/:id', requireAuthOrApiKey, authRateLimit, async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const user = await userService.getById(userId) as User;
    const filename = typeof req.body?.filename === 'string' ? req.body.filename.trim() : undefined;

    if (!filename) {
      res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'filename is required' } });
      return;
    }

    const file = await fileService.getById(user.id, req.params.id);
    if (!file) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'File not found' } });
      return;
    }

    const updated = await fileRepository.updateMetadata(req.params.id, {
      originalFilename: filename.substring(0, 255).replace(/[\\/?%*:|"<>]/g, '-').replace(/\.\./g, '')
    });
    await recordFileActivity(user.id, updated.id, 'RENAME', updated.originalFilename);

    res.json({ success: true, data: { file: safeFileDto(updated) } });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/files/:id
router.delete('/:id', requireAuthOrApiKey, authRateLimit, async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const user = await userService.getById(userId) as User;

    await fileService.delete(user, req.params.id);

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/images/:id — browser-friendly image endpoint
router.get('/images/:id', requireAuthOrApiKey, authRateLimit, async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const user = await userService.getById(userId) as User;

    const { buffer, file } = await fileService.download(user, req.params.id);

    res.set({
      'Content-Type': file.mimeType,
      'Content-Length': buffer.length.toString(),
      'Cache-Control': 'private, max-age=3600',
    });
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

function safeFileDto(file: {
  id: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  checksum: string;
  folderId: string | null;
  sortOrder: number;
}) {
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

export default router;
