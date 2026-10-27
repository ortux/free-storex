"use strict";
/**
 * UploadTokenService
 *
 * Issues and verifies short-lived JWT tokens that authorise a single
 * file upload using a short-lived upload token.
 *
 * Token lifecycle:
 *   POST /api/v1/uploads/initiate
 *     → backend creates PENDING file record
 *     → signs JWT { uploadId, userId, fileId, mimeType, fileSize }
 *     → returns { uploadId, uploadUrl, token, expiresAt }
 *
 *   PUT /api/v1/uploads/:uploadId
 *     → client sends raw bytes + Authorization: Bearer <token>
 *     → backend verifies token, encrypts, pushes to GitHub, marks ACTIVE
 *
 * The token is single-use enforced at the DB level (PENDING → UPLOADING
 * transition is atomic; a second attempt finds status !== PENDING and rejects).
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadTokenService = exports.UploadTokenService = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("../config");
class UploadTokenService {
    /**
     * Sign a short-lived upload token.
     * Returns the signed JWT string.
     */
    sign(payload) {
        return jsonwebtoken_1.default.sign(payload, config_1.config.upload.tokenSecret, {
            expiresIn: `${config_1.config.upload.tokenTtlSeconds}s`,
            algorithm: 'HS256',
        });
    }
    /**
     * Verify and decode an upload token.
     * Throws if expired, tampered, or signed with wrong secret.
     */
    verify(token) {
        const decoded = jsonwebtoken_1.default.verify(token, config_1.config.upload.tokenSecret, {
            algorithms: ['HS256'],
        });
        if (!decoded.uploadId || !decoded.userId) {
            throw new Error('Invalid upload token payload');
        }
        return {
            uploadId: decoded.uploadId,
            userId: decoded.userId,
            mimeType: decoded.mimeType,
            fileSize: decoded.fileSize,
            originalFilename: decoded.originalFilename,
        };
    }
    /**
     * Build the full upload URL clients will PUT to.
     * e.g. https://api.example.com/api/v1/uploads/f_abc123
     */
    buildUploadUrl(baseUrl, uploadId) {
        return `${baseUrl}/api/v1/uploads/${uploadId}`;
    }
}
exports.UploadTokenService = UploadTokenService;
exports.uploadTokenService = new UploadTokenService();
