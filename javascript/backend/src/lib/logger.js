"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.safeLog = exports.logger = void 0;
const winston_1 = __importDefault(require("winston"));
const { combine, timestamp, errors, json, colorize, simple } = winston_1.default.format;
const isDev = process.env.NODE_ENV !== 'production';
exports.logger = winston_1.default.createLogger({
    level: isDev ? 'debug' : 'info',
    format: combine(timestamp(), errors({ stack: true }), json()),
    defaultMeta: { service: 'free-store' },
    transports: [
        new winston_1.default.transports.Console({
            format: isDev
                ? combine(colorize(), simple())
                : combine(timestamp(), json()),
        }),
    ],
});
// Safe log helpers — never log secrets, keys, tokens
exports.safeLog = {
    userUpload: (userId, fileId) => exports.logger.info(`User ${userId} uploaded file ${fileId}`),
    userDownload: (userId, fileId) => exports.logger.info(`User ${userId} downloaded file ${fileId}`),
    userDelete: (userId, fileId) => exports.logger.info(`User ${userId} deleted file ${fileId}`),
    githubUpload: (fileId, path) => exports.logger.info(`GitHub upload successful`, { fileId, path }),
    githubDelete: (fileId) => exports.logger.info(`GitHub delete successful`, { fileId }),
    encryptionSuccess: (fileId) => exports.logger.info(`File encryption successful`, { fileId }),
    decryptionSuccess: (fileId) => exports.logger.info(`File decryption successful`, { fileId }),
    authLogin: (userId, username) => exports.logger.info(`User logged in`, { userId, username }),
    authLogout: (userId) => exports.logger.info(`User logged out`, { userId }),
    repoCreated: (userId, repoName) => exports.logger.info(`GitHub repository created`, { userId, repoName }),
    error: (message, err) => {
        if (err instanceof Error) {
            exports.logger.error(message, { message: err.message, stack: err.stack });
        }
        else {
            exports.logger.error(message);
        }
    },
};
