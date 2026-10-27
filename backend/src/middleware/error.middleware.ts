import type { Request, Response, NextFunction } from 'express';
import { NotFoundError, ForbiddenError } from '../files/file.service';
import { WorkspaceConflictError, WorkspaceForbiddenError, WorkspaceNotFoundError } from '../workspaces/workspace.service';
import { ShareForbiddenError, ShareNotFoundError, ShareConflictError } from '../shares/file-share.service';
import { logger } from '../lib/logger';
import { config } from '../config';
import { UploadProblem } from '../uploads/resumable-upload.service';
import { StorageLimitError, StorageUnavailableError } from '../storage/storage-provider.interface';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` },
  });
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof UploadProblem) {
    const status = err.code === 'UNAUTHORIZED' ? 401
      : err.code === 'NOT_FOUND' || err.code === 'UPLOAD_NOT_FOUND' ? 404
      : err.code === 'FILE_TOO_LARGE' || err.code === 'CHUNK_SIZE_INVALID' || err.code === 'USE_RESUMABLE_UPLOAD' ? 413
      : err.code === 'STORAGE_LIMIT' ? 413
      : err.code === 'STORAGE_UNAVAILABLE' ? 503
      : err.code === 'UNSUPPORTED_MEDIA_TYPE' ? 415
      : err.code === 'MISSING_CHUNKS' || err.code.startsWith('UPLOAD_') || err.code === 'CHUNK_INDEX_INVALID' ? 409
      : 400;
    if (status === 503) {
      logger.error('Request failed with storage unavailable', {
        method: req.method,
        path: req.path,
        message: err.message,
      });
    }
    res.status(status).json({ success: false, error: { code: err.code, message: err.message, ...(err.details !== undefined ? { chunks: err.details } : {}) } });
    return;
  }
  if (err instanceof StorageLimitError) {
    res.status(413).json({ success: false, error: { code: 'STORAGE_LIMIT', message: err.message } });
    return;
  }
  if (err instanceof StorageUnavailableError) {
    logger.error('Request failed with storage unavailable', {
      method: req.method,
      path: req.path,
      message: err.message,
    });
    res.status(503).json({ success: false, error: { code: 'STORAGE_UNAVAILABLE', message: err.message } });
    return;
  }
  if (typeof err === 'object' && err !== null && 'status' in err && (err as { status?: number }).status === 413) {
    res.status(413).json({ success: false, error: { code: 'CHUNK_SIZE_INVALID', message: 'Request exceeds the configured upload chunk limit' } });
    return;
  }
  // ── 404 ──────────────────────────────────────────────────────────────────
  if (
    err instanceof NotFoundError ||
    err instanceof WorkspaceNotFoundError ||
    err instanceof ShareNotFoundError
  ) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: (err as Error).message } });
    return;
  }

  // ── 403 ──────────────────────────────────────────────────────────────────
  if (
    err instanceof ForbiddenError ||
    err instanceof WorkspaceForbiddenError ||
    err instanceof ShareForbiddenError
  ) {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: (err as Error).message } });
    return;
  }

  // ── 409 ──────────────────────────────────────────────────────────────────
  if (err instanceof WorkspaceConflictError || err instanceof ShareConflictError) {
    res.status(409).json({ success: false, error: { code: 'CONFLICT', message: (err as Error).message } });
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
  logger.error('Unhandled error', {
    message: err instanceof Error ? err.message : String(err),
    stack:   err instanceof Error ? err.stack   : undefined,
  });

  const message = config.isProduction
    ? 'An internal error occurred'
    : err instanceof Error ? err.message : String(err);

  res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message } });
}
