"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../.env') });
function requireEnv(key) {
    const value = process.env[key];
    if (!value)
        throw new Error(`Missing required environment variable: ${key}`);
    return value;
}
function optionalEnv(key, defaultValue) {
    return process.env[key] ?? defaultValue;
}
exports.config = {
    nodeEnv: optionalEnv('NODE_ENV', 'development'),
    port: parseInt(optionalEnv('PORT', '3000'), 10),
    frontendUrl: optionalEnv('FRONTEND_URL', 'http://localhost:5173'),
    database: {
        url: requireEnv('DATABASE_URL'),
    },
    github: {
        clientId: requireEnv('GITHUB_CLIENT_ID'),
        clientSecret: requireEnv('GITHUB_CLIENT_SECRET'),
        callbackUrl: requireEnv('GITHUB_CALLBACK_URL'),
        contentsMaxObjectBytes: parseInt(optionalEnv('GITHUB_CONTENTS_MAX_OBJECT_MB', '100'), 10) * 1024 * 1024,
        writeIntervalMs: parseInt(optionalEnv('GITHUB_CONTENT_WRITE_INTERVAL_MS', '10000'), 10),
    },
    session: {
        secret: requireEnv('SESSION_SECRET'),
    },
    encryption: {
        masterKeySecret: requireEnv('MASTER_KEY_ENCRYPTION_SECRET'),
    },
    upload: {
        tokenSecret: requireEnv('UPLOAD_TOKEN_SECRET'),
        tokenTtlSeconds: parseInt(optionalEnv('UPLOAD_TOKEN_TTL_SECONDS', '900'), 10),
        expirationHours: parseInt(optionalEnv('UPLOAD_EXPIRATION_HOURS', '24'), 10),
        concurrency: parseInt(optionalEnv('UPLOAD_CONCURRENCY', '3'), 10),
        maxRetries: parseInt(optionalEnv('UPLOAD_MAX_RETRIES', '3'), 10),
        cleanupIntervalMinutes: parseInt(optionalEnv('CLEANUP_INTERVAL_MINUTES', '30'), 10),
    },
    files: {
        maxSizeMb: parseInt(optionalEnv('MAX_FILE_SIZE_MB', '1024'), 10),
        largeFileThresholdMb: parseInt(optionalEnv('LARGE_FILE_THRESHOLD_MB', '20'), 10),
        chunkSizeMb: parseInt(optionalEnv('CHUNK_SIZE_MB', '5'), 10),
        allowedMimeTypes: [
            'image/jpeg', 'image/png', 'image/webp',
            'image/gif', 'image/avif', 'application/pdf',
            'video/mp4', 'video/webm', 'video/quicktime',
            'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm',
            'application/zip', 'application/octet-stream',
        ],
    },
    rateLimit: {
        unauthenticated: parseInt(optionalEnv('RATE_LIMIT_UNAUTHENTICATED', '60'), 10),
        authenticated: parseInt(optionalEnv('RATE_LIMIT_AUTHENTICATED', '300'), 10),
        upload: parseInt(optionalEnv('RATE_LIMIT_UPLOAD', '30'), 10),
    },
    isProduction: process.env.NODE_ENV === 'production',
};
