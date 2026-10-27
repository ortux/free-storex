import { Router } from 'express';
import { requireAuthOrApiKey } from '../middleware/auth.middleware';
import { authRateLimit } from '../middleware/rate-limit.middleware';
import {
  fileShareService,
  ShareForbiddenError,
  ShareNotFoundError,
  ShareConflictError,
} from './file-share.service';
import type { SharePermission } from '../lib/models';
import { publicFileLinkService, PublicLinkNotFoundError } from './public-file-link.service';

const router = Router();

function actorId(req: import('express').Request): string {
  return req.session?.userId ?? req.apiKeyUserId!;
}

function handleError(err: unknown, res: import('express').Response, next: import('express').NextFunction) {
  if (err instanceof ShareForbiddenError) {
    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: err.message } });
  }
  if (err instanceof ShareNotFoundError) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: err.message } });
  }
  if (err instanceof ShareConflictError) {
    return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: err.message } });
  }
  next(err);
}

function safeShare(value: unknown) {
  const share = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  // Never expose recipientEncryptedFileKey in API responses
  const { recipientEncryptedFileKey: _, ...safe } = share;
  for (const key of ['file', 'sharedWith', 'sharedBy']) {
    if (typeof safe[key] === 'string') {
      try { safe[key] = JSON.parse(safe[key] as string); } catch { /* keep malformed optional relation opaque */ }
    }
  }
  return safe;
}

// ── Shares I created ──────────────────────────────────────────────────────────

// GET /api/v1/shares/by-me
router.get('/by-me', requireAuthOrApiKey, authRateLimit, async (req, res, next) => {
  try {
    const shares = await fileShareService.listSharedByMe(actorId(req));
    res.json({ success: true, data: shares.map(safeShare) });
  } catch (err) { next(err); }
});

// ── Shares I received ─────────────────────────────────────────────────────────

// GET /api/v1/shares/with-me
router.get('/with-me', requireAuthOrApiKey, authRateLimit, async (req, res, next) => {
  try {
    const shares = await fileShareService.listSharedWithMe(actorId(req));
    res.json({ success: true, data: shares.map(safeShare) });
  } catch (err) { next(err); }
});

// ── Shares on a file ──────────────────────────────────────────────────────────

// GET /api/v1/shares/file/:fileId
router.get('/file/:fileId', requireAuthOrApiKey, authRateLimit, async (req, res, next) => {
  try {
    const shares = await fileShareService.listSharesForFile(actorId(req), req.params.fileId);
    res.json({ success: true, data: shares.map(safeShare) });
  } catch (err) { handleError(err, res, next); }
});

router.get('/file/:fileId/link', requireAuthOrApiKey, authRateLimit, async (req, res, next) => {
  try {
    const link = await publicFileLinkService.getForOwner(actorId(req), req.params.fileId);
    res.json({ success: true, data: { link } });
  } catch (err) {
    if (err instanceof PublicLinkNotFoundError) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: err.message } });
      return;
    }
    next(err);
  }
});

router.post('/file/:fileId/link', requireAuthOrApiKey, authRateLimit, async (req, res, next) => {
  try {
    const rawExpiry = req.body?.expiresAt;
    let expiresAt: Date | null = null;
    if (rawExpiry !== undefined && rawExpiry !== null && rawExpiry !== '') {
      expiresAt = new Date(rawExpiry);
      if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
        res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'expiresAt must be a future date' } });
        return;
      }
    }
    const link = await publicFileLinkService.createOrRotate(actorId(req), req.params.fileId, expiresAt);
    res.status(201).json({ success: true, data: { link } });
  } catch (err) {
    if (err instanceof PublicLinkNotFoundError) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: err.message } });
      return;
    }
    next(err);
  }
});

router.delete('/file/:fileId/link', requireAuthOrApiKey, authRateLimit, async (req, res, next) => {
  try {
    await publicFileLinkService.revokeForOwner(actorId(req), req.params.fileId);
    res.json({ success: true });
  } catch (err) {
    if (err instanceof PublicLinkNotFoundError) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: err.message } });
      return;
    }
    next(err);
  }
});

// POST /api/v1/shares/file/:fileId  — share a file
router.post('/file/:fileId', requireAuthOrApiKey, authRateLimit, async (req, res, next) => {
  try {
    const { recipientId, permission, expiresAt } = req.body as {
      recipientId?: string;
      permission?: SharePermission;
      expiresAt?: string;
    };

    if (!recipientId) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'recipientId required' } });
    }
    if (!permission || !['VIEW', 'EDIT', 'MANAGE'].includes(permission)) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'permission must be VIEW | EDIT | MANAGE' } });
    }

    const result = await fileShareService.share(
      actorId(req),
      req.params.fileId,
      recipientId,
      permission,
      expiresAt ? new Date(expiresAt) : undefined
    );

    res.status(201).json({ success: true, data: safeShare(result.share as unknown as Record<string, unknown>) });
  } catch (err) { handleError(err, res, next); }
});

// ── Single share operations ───────────────────────────────────────────────────

// PATCH /api/v1/shares/:shareId  — update permission or expiry
router.patch('/:shareId', requireAuthOrApiKey, authRateLimit, async (req, res, next) => {
  try {
    const { permission, expiresAt } = req.body as {
      permission?: SharePermission;
      expiresAt?: string | null;
    };

    const updated = await fileShareService.updateShare(actorId(req), req.params.shareId, {
      permission,
      expiresAt: expiresAt === null ? null : expiresAt ? new Date(expiresAt) : undefined,
    });
    res.json({ success: true, data: safeShare(updated as unknown as Record<string, unknown>) });
  } catch (err) { handleError(err, res, next); }
});

// DELETE /api/v1/shares/:shareId  — revoke
router.delete('/:shareId', requireAuthOrApiKey, authRateLimit, async (req, res, next) => {
  try {
    await fileShareService.revoke(actorId(req), req.params.shareId);
    res.json({ success: true });
  } catch (err) { handleError(err, res, next); }
});

export default router;
