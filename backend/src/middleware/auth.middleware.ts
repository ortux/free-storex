import type { Request, Response, NextFunction } from 'express';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.userId) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
    return;
  }
  next();
}

export function requireAuthOrApiKey(req: Request, res: Response, next: NextFunction): void {
  // Session auth
  if (req.session?.userId) {
    return next();
  }
  // API key auth handled downstream via api-key.middleware
  if (req.apiKeyUserId) {
    return next();
  }
  res.status(401).json({
    success: false,
    error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
  });
}

// Augment Express request type
declare global {
  namespace Express {
    interface Request {
      apiKeyUserId?: string;
      currentUserId?: string;
    }
    interface Session {
      userId?: string;
    }
  }
}
