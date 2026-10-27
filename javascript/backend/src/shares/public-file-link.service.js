"use strict";
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
exports.publicFileLinkService = exports.PublicFileLinkService = exports.PublicLinkNotFoundError = void 0;
const crypto = __importStar(require("crypto"));
const db_1 = require("../lib/db");
const config_1 = require("../config");
const file_activity_service_1 = require("../files/file-activity.service");
const file_repository_1 = require("../files/file.repository");
const user_repository_1 = require("../users/user.repository");
class PublicLinkNotFoundError extends Error {
    constructor() { super('This link is invalid, expired, or has been revoked'); this.name = 'PublicLinkNotFoundError'; }
}
exports.PublicLinkNotFoundError = PublicLinkNotFoundError;
function encryptionKey() { return crypto.createHash('sha256').update(config_1.config.encryption.masterKeySecret).digest(); }
function encryptToken(token) {
    const nonce = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), nonce);
    const body = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    return Buffer.concat([nonce, cipher.getAuthTag(), body]).toString('base64');
}
function decryptToken(value) {
    const payload = Buffer.from(value, 'base64');
    if (payload.length < 29)
        throw new Error('Invalid encrypted public link token');
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), payload.subarray(0, 12));
    decipher.setAuthTag(payload.subarray(12, 28));
    return Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString('utf8');
}
function hashToken(token) { return crypto.createHash('sha256').update(token).digest('hex'); }
function linkDto(link) { return { id: link.id, fileId: link.fileId, url: `${config_1.config.frontendUrl.replace(/\/$/, '')}/share/${decryptToken(link.tokenCiphertext)}`, expiresAt: link.expiresAt, createdAt: link.createdAt }; }
class PublicFileLinkService {
    async getForOwner(userId, fileId) {
        const file = await file_repository_1.fileRepository.findByIdAndUserId(fileId, userId);
        if (!file || file.status !== 'ACTIVE')
            throw new PublicLinkNotFoundError();
        const [link] = await (0, db_1.query)('SELECT id,file_id AS fileId,token_hash AS tokenHash,token_ciphertext AS tokenCiphertext,expires_at AS expiresAt,created_at AS createdAt FROM public_file_links WHERE file_id=? LIMIT 1', [fileId]);
        return link ? linkDto(link) : null;
    }
    async createOrRotate(userId, fileId, expiresAt) {
        const file = await file_repository_1.fileRepository.findByIdAndUserId(fileId, userId);
        if (!file || file.status !== 'ACTIVE')
            throw new PublicLinkNotFoundError();
        const token = crypto.randomBytes(32).toString('hex');
        const id = crypto.randomUUID();
        await (0, db_1.execute)(`INSERT INTO public_file_links (id,file_id,token_hash,token_ciphertext,expires_at) VALUES (?,?,?,?,?)
      ON DUPLICATE KEY UPDATE id=VALUES(id),token_hash=VALUES(token_hash),token_ciphertext=VALUES(token_ciphertext),expires_at=VALUES(expires_at),updated_at=UTC_TIMESTAMP(3)`, [id, fileId, hashToken(token), encryptToken(token), expiresAt]);
        const [link] = await (0, db_1.query)('SELECT id,file_id AS fileId,token_hash AS tokenHash,token_ciphertext AS tokenCiphertext,expires_at AS expiresAt,created_at AS createdAt FROM public_file_links WHERE file_id=?', [fileId]);
        await (0, file_activity_service_1.recordFileActivity)(userId, fileId, 'SHARE', file.originalFilename);
        return linkDto(link);
    }
    async revokeForOwner(userId, fileId) {
        const file = await file_repository_1.fileRepository.findByIdAndUserId(fileId, userId);
        if (!file || file.status !== 'ACTIVE')
            throw new PublicLinkNotFoundError();
        const result = await (0, db_1.execute)('DELETE FROM public_file_links WHERE file_id=?', [fileId]);
        if (result.affectedRows)
            await (0, file_activity_service_1.recordFileActivity)(userId, fileId, 'UNSHARE', file.originalFilename);
    }
    async resolve(token) {
        if (!/^[a-f0-9]{64}$/i.test(token))
            throw new PublicLinkNotFoundError();
        const [link] = await (0, db_1.query)(`SELECT id,file_id AS fileId,token_hash AS tokenHash,token_ciphertext AS tokenCiphertext,expires_at AS expiresAt,created_at AS createdAt FROM public_file_links WHERE token_hash=? AND (expires_at IS NULL OR expires_at>UTC_TIMESTAMP()) LIMIT 1`, [hashToken(token)]);
        if (!link)
            throw new PublicLinkNotFoundError();
        const file = await file_repository_1.fileRepository.findById(link.fileId);
        if (!file || file.status !== 'ACTIVE')
            throw new PublicLinkNotFoundError();
        const owner = await user_repository_1.userRepository.findById(file.userId);
        if (!owner)
            throw new PublicLinkNotFoundError();
        return { link, file, owner };
    }
    async getPublicMetadata(token) {
        const { file, link } = await this.resolve(token);
        return { filename: file.originalFilename, mimeType: file.mimeType, size: file.fileSize, expiresAt: link.expiresAt };
    }
}
exports.PublicFileLinkService = PublicFileLinkService;
exports.publicFileLinkService = new PublicFileLinkService();
