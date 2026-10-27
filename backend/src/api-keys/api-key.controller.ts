import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { apiKeyService } from './api-key.service';

const router = Router();

function getUserId(req: import('express').Request): string {
  return req.session?.userId ?? req.apiKeyUserId!;
}

// GET /api/v1/api-keys
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const keys = await apiKeyService.listByUserId(userId);

    // Never expose the hash — only prefix, name, dates
    res.json({
      success: true,
      data: keys.map((k) => ({
        id: k.id,
        name: k.name,
        prefix: k.prefix,
        lastUsed: k.lastUsed,
        createdAt: k.createdAt,
        expiresAt: k.expiresAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/api-keys
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { name, expiresAt } = req.body as { name?: string; expiresAt?: string };

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'API key name is required' },
      });
      return;
    }

    const { key, record } = await apiKeyService.create(
      userId,
      name.trim(),
      expiresAt ? new Date(expiresAt) : undefined
    );

    // Return the raw key ONCE — it will never be shown again
    res.status(201).json({
      success: true,
      data: {
        key, // plaintext — only shown once
        id: record.id,
        name: record.name,
        prefix: record.prefix,
        createdAt: record.createdAt,
        expiresAt: record.expiresAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/api-keys/:id
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const userId = getUserId(req);
    await apiKeyService.delete(req.params.id, userId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
