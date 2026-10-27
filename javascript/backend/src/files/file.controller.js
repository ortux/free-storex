"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const rate_limit_middleware_1 = require("../middleware/rate-limit.middleware");
const file_service_1 = require("./file.service");
const user_service_1 = require("../users/user.service");
const config_1 = require("../config");
const file_repository_1 = require("./file.repository");
const resumable_upload_service_1 = require("../uploads/resumable-upload.service");
const db_1 = require("../lib/db");
const file_activity_service_1 = require("./file-activity.service");
const router = (0, express_1.Router)();
// Multer: memory storage, no disk writes of plaintext
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: config_1.config.files.largeFileThresholdMb * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (config_1.config.files.allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(new Error(`File type ${file.mimetype} is not allowed`));
        }
    },
});
function getUserId(req) {
    return req.session?.userId ?? req.apiKeyUserId;
}
// GET /api/v1/files
router.get('/', auth_middleware_1.requireAuth, rate_limit_middleware_1.authRateLimit, async (req, res, next) => {
    try {
        const userId = getUserId(req);
        const { search, mimeType, limit, offset, sortBy, sortOrder, folderId } = req.query;
        const result = await file_service_1.fileService.list(userId, {
            search,
            mimeType,
            ...(folderId !== undefined && { folderId: folderId === 'root' ? null : folderId }),
            limit: limit ? parseInt(limit, 10) : 50,
            offset: offset ? parseInt(offset, 10) : 0,
            sortBy: (['createdAt', 'fileSize', 'originalFilename', 'sortOrder'].includes(sortBy) ? sortBy : 'createdAt'),
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
    }
    catch (err) {
        next(err);
    }
});
// PATCH /api/v1/files/:id/move
router.patch('/:id/move', auth_middleware_1.requireAuth, rate_limit_middleware_1.authRateLimit, async (req, res, next) => {
    try {
        const userId = getUserId(req);
        const file = await file_repository_1.fileRepository.findByIdAndUserId(req.params.id, userId);
        if (!file || file.status !== 'ACTIVE') {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'File not found' } });
            return;
        }
        const folderId = req.body?.folderId === null || req.body?.folderId === '' ? null : req.body?.folderId;
        if (folderId !== null && typeof folderId !== 'string') {
            res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'folderId must be a folder ID or null' } });
            return;
        }
        if (folderId && !(await (0, db_1.query)('SELECT id FROM folders WHERE id=? AND user_id=? LIMIT 1', [folderId, userId])).length) {
            res.status(404).json({ success: false, error: { code: 'FOLDER_NOT_FOUND', message: 'Folder not found' } });
            return;
        }
        const [last] = await (0, db_1.query)(`SELECT sort_order AS sortOrder FROM files WHERE user_id=? AND folder_id ${folderId === null ? 'IS NULL' : '= ?'} AND status='ACTIVE' ORDER BY sort_order DESC LIMIT 1`, folderId === null ? [userId] : [userId, folderId]);
        const updated = await file_repository_1.fileRepository.move(file.id, folderId, (last?.sortOrder ?? -1) + 1);
        await (0, file_activity_service_1.recordFileActivity)(userId, file.id, 'MOVE', file.originalFilename);
        res.json({ success: true, data: { file: safeFileDto(updated) } });
    }
    catch (err) {
        next(err);
    }
});
// PUT /api/v1/files/reorder
router.put('/reorder', auth_middleware_1.requireAuth, rate_limit_middleware_1.authRateLimit, async (req, res, next) => {
    try {
        const userId = getUserId(req);
        const fileIds = req.body?.fileIds;
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
        if (folderId && !(await (0, db_1.query)('SELECT id FROM folders WHERE id=? AND user_id=? LIMIT 1', [folderId, userId])).length) {
            res.status(404).json({ success: false, error: { code: 'FOLDER_NOT_FOUND', message: 'Folder not found' } });
            return;
        }
        const ids = fileIds;
        const owned = ids.length ? await (0, db_1.query)(`SELECT id FROM files WHERE id IN (${ids.map(() => '?').join(',')}) AND user_id=? AND folder_id ${folderId === null ? 'IS NULL' : '= ?'} AND status='ACTIVE'`, folderId === null ? [...ids, userId] : [...ids, userId, folderId]) : [];
        if (owned.length !== ids.length) {
            res.status(400).json({ success: false, error: { code: 'INVALID_FILE_SET', message: 'All files must belong to you and the selected folder' } });
            return;
        }
        const [countRow] = await (0, db_1.query)(`SELECT COUNT(*) AS total FROM files WHERE user_id=? AND folder_id ${folderId === null ? 'IS NULL' : '= ?'} AND status='ACTIVE'`, folderId === null ? [userId] : [userId, folderId]);
        const folderFileCount = Number(countRow?.total ?? 0);
        if (folderFileCount !== ids.length) {
            res.status(400).json({ success: false, error: { code: 'INCOMPLETE_FILE_SET', message: 'Reordering requires every active file in the folder' } });
            return;
        }
        await file_repository_1.fileRepository.reorder(userId, ids, folderId);
        if (ids.length)
            await (0, file_activity_service_1.recordFileActivity)(userId, ids[0], 'REORDER', 'Files');
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
// POST /api/v1/files
router.post('/', auth_middleware_1.requireAuth, rate_limit_middleware_1.uploadRateLimit, upload.single('file'), async (req, res, next) => {
    try {
        const userId = getUserId(req);
        const user = await user_service_1.userService.getById(userId);
        if (!req.file) {
            res.status(400).json({ success: false, error: { code: 'NO_FILE', message: 'No file provided' } });
            return;
        }
        const folderId = typeof req.body?.folderId === 'string' && req.body.folderId ? req.body.folderId : null;
        if (folderId && !(await (0, db_1.query)('SELECT id FROM folders WHERE id=? AND user_id=? LIMIT 1', [folderId, userId])).length) {
            res.status(404).json({ success: false, error: { code: 'FOLDER_NOT_FOUND', message: 'Destination folder not found' } });
            return;
        }
        const file = await file_service_1.fileService.upload(user, req.file.buffer, req.file.originalname, req.file.mimetype, null, folderId);
        res.status(201).json({
            success: true,
            data: {
                file: {
                    ...safeFileDto(file),
                    url: `${req.protocol}://${req.get('host')}/api/v1/images/${file.id}`,
                },
            },
        });
    }
    catch (err) {
        next(err);
    }
});
// GET /api/v1/files/:id — download raw decrypted file
router.get('/:id', auth_middleware_1.requireAuth, rate_limit_middleware_1.authRateLimit, async (req, res, next) => {
    try {
        const userId = getUserId(req);
        const user = await user_service_1.userService.getById(userId);
        const access = await file_repository_1.fileRepository.findByIdAndAccessor(req.params.id, user.id);
        const metadata = access?.file;
        if (metadata?.storageType === 'GITHUB_CHUNKED') {
            const rangeHeader = req.headers.range;
            let range;
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
            await resumable_upload_service_1.resumableUploadService.stream(user, metadata.id, async (chunk) => {
                if (!res.write(chunk))
                    await new Promise((resolve) => res.once('drain', resolve));
            }, range);
            res.end();
            return;
        }
        const { buffer, file } = await file_service_1.fileService.download(user, req.params.id);
        const inline = req.query.inline === '1' && file.mimeType === 'application/pdf';
        res.set({
            'Content-Type': file.mimeType,
            'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(file.originalFilename)}"`,
            'Content-Length': buffer.length.toString(),
            'Cache-Control': 'private, no-store',
        });
        res.send(buffer);
    }
    catch (err) {
        next(err);
    }
});
// PATCH /api/v1/files/:id
router.patch('/:id', auth_middleware_1.requireAuth, rate_limit_middleware_1.authRateLimit, async (req, res, next) => {
    try {
        const userId = getUserId(req);
        const user = await user_service_1.userService.getById(userId);
        const filename = typeof req.body?.filename === 'string' ? req.body.filename.trim() : undefined;
        if (!filename) {
            res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'filename is required' } });
            return;
        }
        const file = await file_service_1.fileService.getById(user.id, req.params.id);
        if (!file) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'File not found' } });
            return;
        }
        const updated = await file_repository_1.fileRepository.updateMetadata(req.params.id, {
            originalFilename: filename.substring(0, 255).replace(/[\\/?%*:|"<>]/g, '-').replace(/\.\./g, '')
        });
        await (0, file_activity_service_1.recordFileActivity)(user.id, updated.id, 'RENAME', updated.originalFilename);
        res.json({ success: true, data: { file: safeFileDto(updated) } });
    }
    catch (err) {
        next(err);
    }
});
// DELETE /api/v1/files/:id
router.delete('/:id', auth_middleware_1.requireAuth, rate_limit_middleware_1.authRateLimit, async (req, res, next) => {
    try {
        const userId = getUserId(req);
        const user = await user_service_1.userService.getById(userId);
        await file_service_1.fileService.delete(user, req.params.id);
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
// GET /api/v1/images/:id — browser-friendly image endpoint
router.get('/images/:id', auth_middleware_1.requireAuth, rate_limit_middleware_1.authRateLimit, async (req, res, next) => {
    try {
        const userId = getUserId(req);
        const user = await user_service_1.userService.getById(userId);
        const { buffer, file } = await file_service_1.fileService.download(user, req.params.id);
        res.set({
            'Content-Type': file.mimeType,
            'Content-Length': buffer.length.toString(),
            'Cache-Control': 'private, max-age=3600',
        });
        res.send(buffer);
    }
    catch (err) {
        next(err);
    }
});
function safeFileDto(file) {
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
exports.default = router;
