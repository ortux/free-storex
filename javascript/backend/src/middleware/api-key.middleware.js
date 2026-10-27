"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractApiKey = extractApiKey;
const api_key_service_1 = require("../api-keys/api-key.service");
/**
 * Extracts and validates API key from Authorization: Bearer header.
 * Sets req.apiKeyUserId if valid — does not reject, just populates.
 * Use requireAuthOrApiKey after this middleware to enforce authentication.
 */
async function extractApiKey(req, _res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer sk_live_')) {
        return next();
    }
    const key = authHeader.replace('Bearer ', '').trim();
    const record = await api_key_service_1.apiKeyService.validate(key);
    if (record) {
        req.apiKeyUserId = record.userId;
    }
    next();
}
