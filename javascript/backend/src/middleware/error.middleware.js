"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notFoundHandler = notFoundHandler;
exports.errorHandler = errorHandler;
const file_service_1 = require("../files/file.service");
const workspace_service_1 = require("../workspaces/workspace.service");
const file_share_service_1 = require("../shares/file-share.service");
const logger_1 = require("../lib/logger");
const config_1 = require("../config");
const resumable_upload_service_1 = require("../uploads/resumable-upload.service");
const storage_provider_interface_1 = require("../storage/storage-provider.interface");
function notFoundHandler(req, res) {
    res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` },
    });
}
function errorHandler(err, req, res, _next) {
    if (err instanceof resumable_upload_service_1.UploadProblem) {
        const status = err.code === 'UNAUTHORIZED' ? 401
            : err.code === 'NOT_FOUND' || err.code === 'UPLOAD_NOT_FOUND' ? 404
                : err.code === 'FILE_TOO_LARGE' || err.code === 'CHUNK_SIZE_INVALID' || err.code === 'USE_RESUMABLE_UPLOAD' ? 413
                    : err.code === 'STORAGE_LIMIT' ? 413
                        : err.code === 'STORAGE_UNAVAILABLE' ? 503
                            : err.code === 'UNSUPPORTED_MEDIA_TYPE' ? 415
                                : err.code === 'MISSING_CHUNKS' || err.code.startsWith('UPLOAD_') || err.code === 'CHUNK_INDEX_INVALID' ? 409
                                    : 400;
        if (status === 503) {
            logger_1.logger.error('Request failed with storage unavailable', {
                method: req.method,
                path: req.path,
                message: err.message,
            });
        }
        res.status(status).json({ success: false, error: { code: err.code, message: err.message, ...(err.details !== undefined ? { chunks: err.details } : {}) } });
        return;
    }
    if (err instanceof storage_provider_interface_1.StorageLimitError) {
        res.status(413).json({ success: false, error: { code: 'STORAGE_LIMIT', message: err.message } });
        return;
    }
    if (err instanceof storage_provider_interface_1.StorageUnavailableError) {
        logger_1.logger.error('Request failed with storage unavailable', {
            method: req.method,
            path: req.path,
            message: err.message,
        });
        res.status(503).json({ success: false, error: { code: 'STORAGE_UNAVAILABLE', message: err.message } });
        return;
    }
    if (typeof err === 'object' && err !== null && 'status' in err && err.status === 413) {
        res.status(413).json({ success: false, error: { code: 'CHUNK_SIZE_INVALID', message: 'Request exceeds the configured upload chunk limit' } });
        return;
    }
    // ── 404 ──────────────────────────────────────────────────────────────────
    if (err instanceof file_service_1.NotFoundError ||
        err instanceof workspace_service_1.WorkspaceNotFoundError ||
        err instanceof file_share_service_1.ShareNotFoundError) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: err.message } });
        return;
    }
    // ── 403 ──────────────────────────────────────────────────────────────────
    if (err instanceof file_service_1.ForbiddenError ||
        err instanceof workspace_service_1.WorkspaceForbiddenError ||
        err instanceof file_share_service_1.ShareForbiddenError) {
        res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: err.message } });
        return;
    }
    // ── 409 ──────────────────────────────────────────────────────────────────
    if (err instanceof workspace_service_1.WorkspaceConflictError || err instanceof file_share_service_1.ShareConflictError) {
        res.status(409).json({ success: false, error: { code: 'CONFLICT', message: err.message } });
        return;
    }
    // ── 413 ──────────────────────────────────────────────────────────────────
    if (err instanceof Error && err.message.startsWith('File exceeds')) {
        res.status(413).json({ success: false, error: { code: 'FILE_TOO_LARGE', message: err.message } });
        return;
    }
    if (err instanceof Error && err.message.includes('single-object upload threshold')) {
        res.status(413).json({ success: false, error: { code: 'USE_RESUMABLE_UPLOAD', message: err.message } });
        return;
    }
    // ── 415 ──────────────────────────────────────────────────────────────────
    if (err instanceof Error && err.message.startsWith('File type')) {
        res.status(415).json({ success: false, error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: err.message } });
        return;
    }
    // ── 500 decrypt ───────────────────────────────────────────────────────────
    if (err instanceof Error && err.message.toLowerCase().includes('decrypt')) {
        res.status(500).json({ success: false, error: { code: 'DECRYPTION_FAILED', message: 'Unable to decrypt file' } });
        return;
    }
    // ── 500 generic ───────────────────────────────────────────────────────────
    logger_1.logger.error('Unhandled error', {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
    });
    const message = config_1.config.isProduction
        ? 'An internal error occurred'
        : err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message } });
}
