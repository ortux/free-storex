"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadRateLimit = exports.authRateLimit = exports.unauthRateLimit = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const config_1 = require("../config");
const windowMs = 60 * 1000; // 1 minute
exports.unauthRateLimit = (0, express_rate_limit_1.default)({
    windowMs,
    max: config_1.config.rateLimit.unauthenticated,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down' },
    },
});
exports.authRateLimit = (0, express_rate_limit_1.default)({
    windowMs,
    max: config_1.config.rateLimit.authenticated,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.session?.userId ?? req.ip ?? 'unknown',
    message: {
        success: false,
        error: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down' },
    },
});
exports.uploadRateLimit = (0, express_rate_limit_1.default)({
    windowMs,
    max: config_1.config.rateLimit.upload,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.session?.userId ?? req.apiKeyUserId ?? req.ip ?? 'unknown',
    message: {
        success: false,
        error: { code: 'RATE_LIMITED', message: 'Upload rate limit exceeded' },
    },
});
