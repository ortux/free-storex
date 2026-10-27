// ── Static frontend (production) ─────────────────────────────────────────────
// The built React app is copied into backend/public/ during the production
// build.  We serve it here so the backend is the single deployable unit.
// API and auth routes are registered after this so they take priority.
import './config'; // Load env vars first — must be before any config import
import path from 'path';
import fs from 'fs';
const publicDir = path.join(__dirname, '..', 'public');

import express from 'express';
import session from 'express-session';
import passport from 'passport';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';

import { config } from './config';
import { configurePassport } from './auth/github-oauth.service';
import { extractApiKey } from './middleware/api-key.middleware';
import { requireProxy } from './middleware/proxy.middleware';
import { createCorsMiddleware } from './middleware/cors.middleware';
import { unauthRateLimit } from './middleware/rate-limit.middleware';
import { notFoundHandler, errorHandler } from './middleware/error.middleware';
import { logger } from './lib/logger';
import { MySqlSessionStore } from './lib/mysql-session-store';
import { initializeHandoffTokenStore } from './auth/auth-token.store';

import authRouter      from './auth/auth.controller';
import userRouter      from './users/user.controller';
import fileRouter      from './files/file.controller';
import imageRouter     from './images/image.controller';
import apiKeyRouter    from './api-keys/api-key.controller';
import workspaceRouter from './workspaces/workspace.controller';
import shareRouter     from './shares/file-share.controller';
import publicFileLinkRouter from './shares/public-file-link.controller';
import uploadRouter    from './uploads/upload.controller';
import { folderRouter, activityRouter } from './files/drive.controller';
import { resumableUploadService } from './uploads/resumable-upload.service';

const app = express();
app.set('trust proxy', 1);
const sessionStore = new MySqlSessionStore();

// ── Security headers ──────────────────────────────────────────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'same-site' },
    contentSecurityPolicy: config.isProduction ? undefined : false,
  })
);

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(createCorsMiddleware(config.frontendUrl));

// ── Body parsing ──────────────────────────────────────────────────────────────
// Exclude /api/v1/uploads/:id PUT from JSON parsing — that route reads raw bytes
app.use((req, res, next) => {
  if (req.method === 'PUT' && req.path.match(/^\/api\/v1\/uploads\/[^/]+(?:\/chunks\/\d+)?$/)) {
    return next(); // skip — upload.controller streams the body directly
  }
  express.json({ limit: '1mb' })(req, res, next);
});
app.use((req, res, next) => {
  if (req.method === 'PUT' && req.path.match(/^\/api\/v1\/uploads\/[^/]+(?:\/chunks\/\d+)?$/)) {
    return next();
  }
  express.urlencoded({ extended: false, limit: '1mb' })(req, res, next);
});
app.use(cookieParser());

// ── Session ───────────────────────────────────────────────────────────────────
app.use(
  session({
    secret: config.session.secret,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    name: '__fstore_sid',
    cookie: {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: config.isProduction ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

// ── Passport ──────────────────────────────────────────────────────────────────
// passport.initialize() is needed globally so passport.authenticate() works.
// passport.session() (which calls deserializeUser on *every* request) is NOT
// mounted globally — instead it is applied only inside the /auth router so the
// DB round-trip only happens during the OAuth flow, not on every API call.
// Auth checks for API routes rely solely on req.session.userId (see auth.middleware.ts).
configurePassport();
app.use(passport.initialize());

// ── API key extraction (populates req.apiKeyUserId before any route) ──────────
app.use(extractApiKey);

// ── Global rate limit for unauthenticated callers ─────────────────────────────
app.use('/api', unauthRateLimit);
app.use('/api/v1', requireProxy);

// ── Routes ────────────────────────────────────────────────────────────────────

// Auth
app.use('/auth',              authRouter);

// Core API v1
app.use('/api/v1/user',       userRouter);
app.use('/api/v1/files',      fileRouter);
app.use('/api/v1/folders',    folderRouter);
app.use('/api/v1/activity',   activityRouter);
app.use('/api/v1/images',     imageRouter);
app.use('/api/v1/api-keys',   apiKeyRouter);

// Workspaces + RBAC  (e.g. GET /api/v1/workspaces, POST /api/v1/workspaces/:id/members)
app.use('/api/v1/workspaces', workspaceRouter);

// File sharing       (e.g. POST /api/v1/shares/file/:fileId, DELETE /api/v1/shares/:shareId)
app.use('/api/v1/shares',     shareRouter);
app.use('/api/v1/public-links', publicFileLinkRouter);

// Presigned uploads  (e.g. POST /api/v1/uploads/initiate, PUT /api/v1/uploads/:id)
// Raw body limit matches MAX_FILE_SIZE_MB — set here before the router so
// Express doesn't reject large PUT payloads before our handler sees them.
app.use('/api/v1/uploads', (req, _res, next) => {
  // Bound raw buffers to one configured chunk or the small-file threshold.
  if (req.method === 'PUT') {
    const isChunk = /^\/[^/]+\/chunks\/\d+$/.test(req.path);
    const maxBytes = ((isChunk ? config.files.chunkSizeMb : config.files.largeFileThresholdMb) + 1) * 1024 * 1024;
    const rawParser = express.raw({ type: '*/*', limit: maxBytes });
    return rawParser(req, _res, next);
  }
  next();
});
app.use('/api/v1/uploads',    uploadRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const cleanupIntervalMs = Math.max(1, config.upload.cleanupIntervalMinutes) * 60 * 1000;
setInterval(() => { resumableUploadService.cleanupExpired().catch((err) => logger.warn(`Upload cleanup failed: ${String(err)}`)); }, cleanupIntervalMs).unref();

// ── Static frontend & SPA fallback ───────────────────────────────────────────
// Serve the pre-built React app when the backend is running as a standalone
// deployable (i.e. frontend/dist was copied to backend/public/).
// API, auth, and health routes registered above take priority because Express
// matches routes in registration order.  Anything that didn't match an API
// route falls through here — unknown paths return index.html so client-side
// routing works correctly.
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir, {
    // Aggressive caching for hashed assets, no cache for HTML
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      } else {
        // Vite fingerprints all JS/CSS/image assets — safe to cache for a year
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }));

  // SPA fallback — any non-file request that reached here gets index.html
  app.get('*', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

// ── Error handling ────────────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = config.port;
void Promise.all([sessionStore.initialize(), initializeHandoffTokenStore()]).then(() => {
  app.listen(PORT, () => {
    logger.info(`Free Store backend running on port ${PORT} [${config.nodeEnv}]`);
  });
}).catch((error) => {
  logger.error('Failed to initialize MySQL auth stores', { error: String(error) });
  process.exitCode = 1;
});

export default app;
