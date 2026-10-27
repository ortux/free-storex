import rateLimit from 'express-rate-limit';
import { config } from '../config';

const windowMs = 60 * 1000; // 1 minute

export const unauthRateLimit = rateLimit({
  windowMs,
  max: config.rateLimit.unauthenticated,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down' },
  },
});

export const authRateLimit = rateLimit({
  windowMs,
  max: config.rateLimit.authenticated,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.session?.userId ?? req.ip ?? 'unknown',
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down' },
  },
});

export const uploadRateLimit = rateLimit({
  windowMs,
  max: config.rateLimit.upload,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.session?.userId ?? req.apiKeyUserId ?? req.ip ?? 'unknown',
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Upload rate limit exceeded' },
  },
});
