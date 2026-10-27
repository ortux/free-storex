"use strict";
/**
 * API Key Service
 *
 * Generates and validates API keys.
 * Keys are NEVER stored in plaintext — only SHA-256 hashes are stored.
 *
 * Key format: sk_live_<32 random hex bytes>
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiKeyService = exports.ApiKeyService = void 0;
const crypto = __importStar(require("crypto"));
const db_1 = require("../lib/db");
const KEY_PREFIX = 'sk_live_';
const KEY_BYTES = 32; // 256 bits of randomness
class ApiKeyService {
    /**
     * Generate a new API key and store its hash.
     * The plaintext key is returned ONCE — it cannot be recovered.
     */
    async create(userId, name, expiresAt) {
        const rawKey = crypto.randomBytes(KEY_BYTES).toString('hex');
        const key = `${KEY_PREFIX}${rawKey}`;
        const prefix = key.substring(0, 16); // Store prefix for display (sk_live_XXXXXXXX)
        const keyHash = this.hashKey(key);
        const id = crypto.randomUUID();
        await (0, db_1.execute)('INSERT INTO api_keys (id,user_id,name,key_hash,prefix,expires_at) VALUES (?,?,?,?,?,?)', [id, userId, name, keyHash, prefix, expiresAt ?? null]);
        const [record] = await (0, db_1.query)(`SELECT id,user_id AS userId,name,key_hash AS keyHash,prefix,last_used AS lastUsed,created_at AS createdAt,expires_at AS expiresAt FROM api_keys WHERE id=?`, [id]);
        return { key, record };
    }
    /**
     * Validate an API key from a request.
     * Returns the associated API key record (with userId) or null.
     */
    async validate(rawKey) {
        if (!rawKey.startsWith(KEY_PREFIX))
            return null;
        const keyHash = this.hashKey(rawKey);
        const [record] = await (0, db_1.query)(`SELECT id,user_id AS userId,name,key_hash AS keyHash,prefix,last_used AS lastUsed,created_at AS createdAt,expires_at AS expiresAt FROM api_keys WHERE key_hash=? LIMIT 1`, [keyHash]);
        if (!record)
            return null;
        // Check expiry
        if (record.expiresAt && record.expiresAt < new Date()) {
            return null;
        }
        // Update last used timestamp (fire-and-forget)
        void (0, db_1.execute)('UPDATE api_keys SET last_used=UTC_TIMESTAMP(3) WHERE id=?', [record.id]).catch(() => { });
        return record;
    }
    async listByUserId(userId) {
        return (0, db_1.query)(`SELECT id,user_id AS userId,name,key_hash AS keyHash,prefix,last_used AS lastUsed,created_at AS createdAt,expires_at AS expiresAt FROM api_keys WHERE user_id=? ORDER BY created_at DESC`, [userId]);
    }
    async delete(id, userId) {
        await (0, db_1.execute)('DELETE FROM api_keys WHERE id=? AND user_id=?', [id, userId]);
    }
    hashKey(key) {
        return crypto.createHash('sha256').update(key).digest('hex');
    }
}
exports.ApiKeyService = ApiKeyService;
exports.apiKeyService = new ApiKeyService();
