import { Router } from 'express';
import { requireAuthOrApiKey } from '../middleware/auth.middleware';
import { authRateLimit } from '../middleware/rate-limit.middleware';
import { fileService } from '../files/file.service';
import { userService } from '../users/user.service';
import type { User } from '../lib/models';

const router = Router();

function getUserId(req: import('express').Request): string {
  return req.session?.userId ?? req.apiKeyUserId!;
}

/**
 * GET /api/v1/images/:id
 *
 * Serve decrypted image with correct Content-Type.
 * Browser can use this directly in <img src="..."> after authenticating via cookie.
 */
router.get('/:id', requireAuthOrApiKey, authRateLimit, async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const user = await userService.getById(userId) as User;

    const { buffer, file } = await fileService.download(user, req.params.id);

    // Only serve files that are actually images
    if (!file.mimeType.startsWith('image/')) {
      res.status(415).json({
        success: false,
        error: { code: 'NOT_AN_IMAGE', message: 'Requested file is not an image' },
      });
      return;
    }

    res.set({
      'Content-Type': file.mimeType,
      'Content-Length': buffer.length.toString(),
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

export default router;
