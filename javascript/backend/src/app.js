"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("./config"); // Load env first
const express_1 = __importDefault(require("express"));
const express_session_1 = __importDefault(require("express-session"));
const passport_1 = __importDefault(require("passport"));
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const config_1 = require("./config");
const github_oauth_service_1 = require("./auth/github-oauth.service");
const api_key_middleware_1 = require("./middleware/api-key.middleware");
const rate_limit_middleware_1 = require("./middleware/rate-limit.middleware");
const error_middleware_1 = require("./middleware/error.middleware");
const logger_1 = require("./lib/logger");
const mysql_session_store_1 = require("./lib/mysql-session-store");
const auth_controller_1 = __importDefault(require("./auth/auth.controller"));
const user_controller_1 = __importDefault(require("./users/user.controller"));
const file_controller_1 = __importDefault(require("./files/file.controller"));
const image_controller_1 = __importDefault(require("./images/image.controller"));
const api_key_controller_1 = __importDefault(require("./api-keys/api-key.controller"));
const workspace_controller_1 = __importDefault(require("./workspaces/workspace.controller"));
const file_share_controller_1 = __importDefault(require("./shares/file-share.controller"));
const public_file_link_controller_1 = __importDefault(require("./shares/public-file-link.controller"));
const upload_controller_1 = __importDefault(require("./uploads/upload.controller"));
const drive_controller_1 = require("./files/drive.controller");
const resumable_upload_service_1 = require("./uploads/resumable-upload.service");
const app = (0, express_1.default)();
app.set('trust proxy', 1);
const sessionStore = new mysql_session_store_1.MySqlSessionStore();
// ── Security headers ──────────────────────────────────────────────────────────
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: 'same-site' },
    contentSecurityPolicy: config_1.config.isProduction ? undefined : false,
}));
// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = [config_1.config.frontendUrl, 'https://free-store.vercel.app', 'https://*.vercel.app'];
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin)
            return callback(null, true);
        const ok = allowedOrigins.some((candidate) => {
            if (candidate.includes('*')) {
                const pattern = new RegExp('^' + candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*') + '$');
                return pattern.test(origin);
            }
            return origin === candidate;
        });
        if (ok)
            return callback(null, true);
        return callback(new Error('CORS origin not allowed'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
// ── Body parsing ──────────────────────────────────────────────────────────────
// Exclude /api/v1/uploads/:id PUT from JSON parsing — that route reads raw bytes
app.use((req, res, next) => {
    if (req.method === 'PUT' && req.path.match(/^\/api\/v1\/uploads\/[^/]+(?:\/chunks\/\d+)?$/)) {
        return next(); // skip — upload.controller streams the body directly
    }
    express_1.default.json({ limit: '1mb' })(req, res, next);
});
app.use((req, res, next) => {
    if (req.method === 'PUT' && req.path.match(/^\/api\/v1\/uploads\/[^/]+(?:\/chunks\/\d+)?$/)) {
        return next();
    }
    express_1.default.urlencoded({ extended: false, limit: '1mb' })(req, res, next);
});
app.use((0, cookie_parser_1.default)());
// ── Session ───────────────────────────────────────────────────────────────────
app.use((0, express_session_1.default)({
    secret: config_1.config.session.secret,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    name: '__fstore_sid',
    cookie: {
        httpOnly: true,
        secure: config_1.config.isProduction,
        sameSite: config_1.config.isProduction ? 'none' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
    },
}));
// ── Passport ──────────────────────────────────────────────────────────────────
(0, github_oauth_service_1.configurePassport)();
app.use(passport_1.default.initialize());
app.use(passport_1.default.session());
// ── API key extraction (populates req.apiKeyUserId before any route) ──────────
app.use(api_key_middleware_1.extractApiKey);
// ── Global rate limit for unauthenticated callers ─────────────────────────────
app.use('/api', rate_limit_middleware_1.unauthRateLimit);
// ── Routes ────────────────────────────────────────────────────────────────────
// Auth
app.use('/auth', auth_controller_1.default);
// Core API v1
app.use('/api/v1/user', user_controller_1.default);
app.use('/api/v1/files', file_controller_1.default);
app.use('/api/v1/folders', drive_controller_1.folderRouter);
app.use('/api/v1/activity', drive_controller_1.activityRouter);
app.use('/api/v1/images', image_controller_1.default);
app.use('/api/v1/api-keys', api_key_controller_1.default);
// Workspaces + RBAC  (e.g. GET /api/v1/workspaces, POST /api/v1/workspaces/:id/members)
app.use('/api/v1/workspaces', workspace_controller_1.default);
// File sharing       (e.g. POST /api/v1/shares/file/:fileId, DELETE /api/v1/shares/:shareId)
app.use('/api/v1/shares', file_share_controller_1.default);
app.use('/api/v1/public-links', public_file_link_controller_1.default);
// Presigned uploads  (e.g. POST /api/v1/uploads/initiate, PUT /api/v1/uploads/:id)
// Raw body limit matches MAX_FILE_SIZE_MB — set here before the router so
// Express doesn't reject large PUT payloads before our handler sees them.
app.use('/api/v1/uploads', (req, _res, next) => {
    // Bound raw buffers to one configured chunk or the small-file threshold.
    if (req.method === 'PUT') {
        const isChunk = /^\/[^/]+\/chunks\/\d+$/.test(req.path);
        const maxBytes = ((isChunk ? config_1.config.files.chunkSizeMb : config_1.config.files.largeFileThresholdMb) + 1) * 1024 * 1024;
        const rawParser = express_1.default.raw({ type: '*/*', limit: maxBytes });
        return rawParser(req, _res, next);
    }
    next();
});
app.use('/api/v1/uploads', upload_controller_1.default);
// Health check
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
const cleanupIntervalMs = Math.max(1, config_1.config.upload.cleanupIntervalMinutes) * 60 * 1000;
setInterval(() => { resumable_upload_service_1.resumableUploadService.cleanupExpired().catch((err) => logger_1.logger.warn(`Upload cleanup failed: ${String(err)}`)); }, cleanupIntervalMs).unref();
// ── Error handling ────────────────────────────────────────────────────────────
app.use(error_middleware_1.notFoundHandler);
app.use(error_middleware_1.errorHandler);
// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = config_1.config.port;
void sessionStore.initialize().then(() => {
    app.listen(PORT, () => {
        logger_1.logger.info(`Free Store backend running on port ${PORT} [${config_1.config.nodeEnv}]`);
    });
}).catch((error) => {
    logger_1.logger.error('Failed to initialize MySQL session store', { error: String(error) });
    process.exitCode = 1;
});
exports.default = app;
