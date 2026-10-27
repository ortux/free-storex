import cors from 'cors';
import type { Request, RequestHandler } from 'express';

const methods = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const publicApiHeaders = ['Content-Type', 'Authorization', 'Range'];

function isCoreApiRequest(req: Request): boolean {
  return req.path === '/api/v1' || req.path.startsWith('/api/v1/');
}

function isApiKeyPreflight(req: Request): boolean {
  if (req.method !== 'OPTIONS' || !isCoreApiRequest(req)) return false;
  return (req.get('access-control-request-headers') ?? '')
    .split(',')
    .some((header) => header.trim().toLowerCase() === 'authorization');
}

export function createCorsMiddleware(frontendUrl: string): RequestHandler {
  const allowedOrigins = [frontendUrl, 'https://free-store.vercel.app', 'https://*.vercel.app'];
  const browserCors = cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const ok = allowedOrigins.some((candidate) => {
        if (candidate.includes('*')) {
          const pattern = new RegExp('^' + candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*') + '$');
          return pattern.test(origin);
        }
        return origin === candidate;
      });
      if (ok) return callback(null, true);
      return callback(new Error('CORS origin not allowed'));
    },
    credentials: true,
    methods,
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const apiKeyCors = cors({
    origin: '*',
    credentials: false,
    methods,
    allowedHeaders: publicApiHeaders,
    exposedHeaders: ['Content-Length', 'Content-Range', 'Accept-Ranges'],
    maxAge: 600,
  });

  return (req, res, next) => {
    const isApiKeyRequest = isCoreApiRequest(req) &&
      req.get('authorization')?.startsWith('Bearer ');
    if (isApiKeyRequest || isApiKeyPreflight(req)) {
      return apiKeyCors(req, res, next);
    }
    return browserCors(req, res, next);
  };
}
