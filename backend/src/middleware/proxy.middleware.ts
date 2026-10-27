import type { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';
import { config } from '../config';

export function getPublicOrigin(req: Request): string {
  const protocol = req.get('x-forwarded-proto') || req.protocol;
  const host = req.get('x-forwarded-host') || req.get('host');
  return `${protocol}://${host}`;
}

export function requireProxy(req: Request, res: Response, next: NextFunction): void {
  if (req.apiKeyUserId) {
    next();
    return;
  }

  const pathname = req.originalUrl.split('?')[0];
  const isScopedUpload = req.method === 'PUT' && (
    /^\/api\/v1\/uploads\/[^/]+$/.test(pathname) ||
    /^\/api\/v1\/uploads\/[^/]+\/chunks\/\d+$/.test(pathname)
  );
  if (isScopedUpload) {
    next();
    return;
  }

  const expected = config.proxySharedSecret;
  if (!expected && !config.isProduction) {
    next();
    return;
  }

  const provided = req.get('x-proxy-secret');
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided ?? '');
  if (!provided || expectedBytes.length !== providedBytes.length || !timingSafeEqual(expectedBytes, providedBytes)) {
    res.status(403).json({
      success: false,
      error: { code: 'PROXY_REQUIRED', message: 'This API is available through the application proxy only' },
    });
    return;
  }

  next();
}
