"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
exports.requireAuthOrApiKey = requireAuthOrApiKey;
function requireAuth(req, res, next) {
    if (!req.session?.userId) {
        res.status(401).json({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        });
        return;
    }
    next();
}
function requireAuthOrApiKey(req, res, next) {
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
