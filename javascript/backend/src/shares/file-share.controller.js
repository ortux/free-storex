"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const rate_limit_middleware_1 = require("../middleware/rate-limit.middleware");
const file_share_service_1 = require("./file-share.service");
const public_file_link_service_1 = require("./public-file-link.service");
const router = (0, express_1.Router)();
function actorId(req) {
    return req.session?.userId ?? req.apiKeyUserId;
}
function handleError(err, res, next) {
    if (err instanceof file_share_service_1.ShareForbiddenError) {
        return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: err.message } });
    }
    if (err instanceof file_share_service_1.ShareNotFoundError) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: err.message } });
    }
    if (err instanceof file_share_service_1.ShareConflictError) {
        return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: err.message } });
    }
    next(err);
}
function safeShare(value) {
    const share = typeof value === 'object' && value !== null ? value : {};
    // Never expose recipientEncryptedFileKey in API responses
    const { recipientEncryptedFileKey: _, ...safe } = share;
    for (const key of ['file', 'sharedWith', 'sharedBy']) {
        if (typeof safe[key] === 'string') {
            try {
                safe[key] = JSON.parse(safe[key]);
            }
            catch { /* keep malformed optional relation opaque */ }
        }
    }
    return safe;
}
// ── Shares I created ──────────────────────────────────────────────────────────
// GET /api/v1/shares/by-me
router.get('/by-me', auth_middleware_1.requireAuth, rate_limit_middleware_1.authRateLimit, async (req, res, next) => {
    try {
        const shares = await file_share_service_1.fileShareService.listSharedByMe(actorId(req));
        res.json({ success: true, data: shares.map(safeShare) });
    }
    catch (err) {
        next(err);
    }
});
// ── Shares I received ─────────────────────────────────────────────────────────
// GET /api/v1/shares/with-me
router.get('/with-me', auth_middleware_1.requireAuth, rate_limit_middleware_1.authRateLimit, async (req, res, next) => {
    try {
        const shares = await file_share_service_1.fileShareService.listSharedWithMe(actorId(req));
        res.json({ success: true, data: shares.map(safeShare) });
    }
    catch (err) {
        next(err);
    }
});
// ── Shares on a file ──────────────────────────────────────────────────────────
// GET /api/v1/shares/file/:fileId
router.get('/file/:fileId', auth_middleware_1.requireAuth, rate_limit_middleware_1.authRateLimit, async (req, res, next) => {
    try {
        const shares = await file_share_service_1.fileShareService.listSharesForFile(actorId(req), req.params.fileId);
        res.json({ success: true, data: shares.map(safeShare) });
    }
    catch (err) {
        handleError(err, res, next);
    }
});
router.get('/file/:fileId/link', auth_middleware_1.requireAuth, rate_limit_middleware_1.authRateLimit, async (req, res, next) => {
    try {
        const link = await public_file_link_service_1.publicFileLinkService.getForOwner(actorId(req), req.params.fileId);
        res.json({ success: true, data: { link } });
    }
    catch (err) {
        if (err instanceof public_file_link_service_1.PublicLinkNotFoundError) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: err.message } });
            return;
        }
        next(err);
    }
});
router.post('/file/:fileId/link', auth_middleware_1.requireAuth, rate_limit_middleware_1.authRateLimit, async (req, res, next) => {
    try {
        const rawExpiry = req.body?.expiresAt;
        let expiresAt = null;
        if (rawExpiry !== undefined && rawExpiry !== null && rawExpiry !== '') {
            expiresAt = new Date(rawExpiry);
            if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
                res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'expiresAt must be a future date' } });
                return;
            }
        }
        const link = await public_file_link_service_1.publicFileLinkService.createOrRotate(actorId(req), req.params.fileId, expiresAt);
        res.status(201).json({ success: true, data: { link } });
    }
    catch (err) {
        if (err instanceof public_file_link_service_1.PublicLinkNotFoundError) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: err.message } });
            return;
        }
        next(err);
    }
});
router.delete('/file/:fileId/link', auth_middleware_1.requireAuth, rate_limit_middleware_1.authRateLimit, async (req, res, next) => {
    try {
        await public_file_link_service_1.publicFileLinkService.revokeForOwner(actorId(req), req.params.fileId);
        res.json({ success: true });
    }
    catch (err) {
        if (err instanceof public_file_link_service_1.PublicLinkNotFoundError) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: err.message } });
            return;
        }
        next(err);
    }
});
// POST /api/v1/shares/file/:fileId  — share a file
router.post('/file/:fileId', auth_middleware_1.requireAuth, rate_limit_middleware_1.authRateLimit, async (req, res, next) => {
    try {
        const { recipientId, permission, expiresAt } = req.body;
        if (!recipientId) {
            return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'recipientId required' } });
        }
        if (!permission || !['VIEW', 'EDIT', 'MANAGE'].includes(permission)) {
            return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'permission must be VIEW | EDIT | MANAGE' } });
        }
        const result = await file_share_service_1.fileShareService.share(actorId(req), req.params.fileId, recipientId, permission, expiresAt ? new Date(expiresAt) : undefined);
        res.status(201).json({ success: true, data: safeShare(result.share) });
    }
    catch (err) {
        handleError(err, res, next);
    }
});
// ── Single share operations ───────────────────────────────────────────────────
// PATCH /api/v1/shares/:shareId  — update permission or expiry
router.patch('/:shareId', auth_middleware_1.requireAuth, rate_limit_middleware_1.authRateLimit, async (req, res, next) => {
    try {
        const { permission, expiresAt } = req.body;
        const updated = await file_share_service_1.fileShareService.updateShare(actorId(req), req.params.shareId, {
            permission,
            expiresAt: expiresAt === null ? null : expiresAt ? new Date(expiresAt) : undefined,
        });
        res.json({ success: true, data: safeShare(updated) });
    }
    catch (err) {
        handleError(err, res, next);
    }
});
// DELETE /api/v1/shares/:shareId  — revoke
router.delete('/:shareId', auth_middleware_1.requireAuth, rate_limit_middleware_1.authRateLimit, async (req, res, next) => {
    try {
        await file_share_service_1.fileShareService.revoke(actorId(req), req.params.shareId);
        res.json({ success: true });
    }
    catch (err) {
        handleError(err, res, next);
    }
});
exports.default = router;
