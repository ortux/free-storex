import type { Request, Response, NextFunction } from 'express';
import { apiKeyService } from '../api-keys/api-key.service';

/**
 * Extracts and validates API key from Authorization: Bearer header.
 * Sets req.apiKeyUserId if valid — does not reject, just populates.
 * Use requireAuthOrApiKey after this middleware to enforce authentication.
 */
export async function extractApiKey(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer sk_live_')) {
    return next();
  }

  const key = authHeader.replace('Bearer ', '').trim();
  const record = await apiKeyService.validate(key);

  if (record) {
    req.apiKeyUserId = record.userId;
  }

  next();
}
