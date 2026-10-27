"use strict";
/**
 * Encryption Service
 *
 * Handles all cryptographic operations using AES-256-GCM authenticated encryption.
 * This service is completely isolated from GitHub logic — it never touches network calls.
 *
 * File encryption format (binary):
 * [4 bytes magic "GST1"] [1 byte version] [1 byte algorithm] [12 bytes nonce] [16 bytes authTag] [N bytes ciphertext]
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
exports.encryptionService = exports.EncryptionService = void 0;
const crypto = __importStar(require("crypto"));
// Magic bytes identifying our encrypted file format
const MAGIC = Buffer.from('GST1');
const VERSION = 1;
const ALGORITHM_ID = 1; // 1 = AES-256-GCM
const ALGORITHM = 'aes-256-gcm';
const KEY_SIZE = 32; // 256 bits
const NONCE_SIZE = 12; // 96 bits — recommended for GCM
const AUTH_TAG_SIZE = 16; // 128 bits
// Header layout:
// [0-3]   MAGIC (4 bytes)
// [4]     VERSION (1 byte)
// [5]     ALGORITHM (1 byte)
// [6-17]  NONCE (12 bytes)
// [18-33] AUTH_TAG (16 bytes)
// [34+]   CIPHERTEXT
const HEADER_SIZE = 4 + 1 + 1 + NONCE_SIZE + AUTH_TAG_SIZE; // 34 bytes
class EncryptionService {
    /**
     * Generate a cryptographically secure 256-bit random key.
     * Returns raw Buffer — never derive from user data.
     */
    generateKey() {
        return crypto.randomBytes(KEY_SIZE);
    }
    /**
     * Encrypt a file buffer using AES-256-GCM.
     * Returns a binary buffer in GST1 format.
     */
    encrypt(plaintext, key) {
        if (key.length !== KEY_SIZE) {
            throw new Error(`Key must be ${KEY_SIZE} bytes, got ${key.length}`);
        }
        const nonce = crypto.randomBytes(NONCE_SIZE);
        const cipher = crypto.createCipheriv(ALGORITHM, key, nonce);
        const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
        const authTag = cipher.getAuthTag();
        // Build the GST1 binary header
        const header = Buffer.alloc(HEADER_SIZE);
        let offset = 0;
        MAGIC.copy(header, offset);
        offset += 4;
        header.writeUInt8(VERSION, offset);
        offset += 1;
        header.writeUInt8(ALGORITHM_ID, offset);
        offset += 1;
        nonce.copy(header, offset);
        offset += NONCE_SIZE;
        authTag.copy(header, offset);
        return Buffer.concat([header, ciphertext]);
    }
    encryptChunk(plaintext, key, aad) {
        if (key.length !== KEY_SIZE) {
            throw new Error(`Key must be ${KEY_SIZE} bytes, got ${key.length}`);
        }
        const nonce = crypto.randomBytes(NONCE_SIZE);
        const cipher = crypto.createCipheriv(ALGORITHM, key, nonce);
        cipher.setAAD(Buffer.from(aad, 'utf8'));
        const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
        const authTag = cipher.getAuthTag();
        const header = Buffer.alloc(HEADER_SIZE);
        let offset = 0;
        MAGIC.copy(header, offset);
        offset += 4;
        header.writeUInt8(VERSION, offset);
        offset += 1;
        header.writeUInt8(ALGORITHM_ID, offset);
        offset += 1;
        nonce.copy(header, offset);
        offset += NONCE_SIZE;
        authTag.copy(header, offset);
        return Buffer.concat([header, ciphertext]);
    }
    /**
     * Decrypt a GST1-format buffer using AES-256-GCM.
     * Throws if the auth tag is invalid — never returns corrupted data.
     */
    decrypt(encryptedBuffer, key) {
        if (key.length !== KEY_SIZE) {
            throw new Error(`Key must be ${KEY_SIZE} bytes, got ${key.length}`);
        }
        if (encryptedBuffer.length < HEADER_SIZE + 1) {
            throw new Error('Encrypted buffer is too short');
        }
        // Validate magic
        const magic = encryptedBuffer.subarray(0, 4);
        if (!magic.equals(MAGIC)) {
            throw new Error('Invalid file format: magic mismatch');
        }
        let offset = 4;
        const version = encryptedBuffer.readUInt8(offset);
        offset += 1;
        if (version !== VERSION) {
            throw new Error(`Unsupported encryption version: ${version}`);
        }
        const algorithmId = encryptedBuffer.readUInt8(offset);
        offset += 1;
        if (algorithmId !== ALGORITHM_ID) {
            throw new Error(`Unsupported algorithm: ${algorithmId}`);
        }
        const nonce = encryptedBuffer.subarray(offset, offset + NONCE_SIZE);
        offset += NONCE_SIZE;
        const authTag = encryptedBuffer.subarray(offset, offset + AUTH_TAG_SIZE);
        offset += AUTH_TAG_SIZE;
        const ciphertext = encryptedBuffer.subarray(offset);
        const decipher = crypto.createDecipheriv(ALGORITHM, key, nonce);
        decipher.setAuthTag(authTag);
        // GCM auth tag verification throws here if tampered
        const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        return plaintext;
    }
    decryptChunk(encryptedBuffer, key, aad) {
        if (key.length !== KEY_SIZE) {
            throw new Error(`Key must be ${KEY_SIZE} bytes, got ${key.length}`);
        }
        if (encryptedBuffer.length < HEADER_SIZE + 1)
            throw new Error('Encrypted chunk is too short');
        if (!encryptedBuffer.subarray(0, 4).equals(MAGIC))
            throw new Error('Invalid chunk format');
        if (encryptedBuffer.readUInt8(4) !== VERSION || encryptedBuffer.readUInt8(5) !== ALGORITHM_ID) {
            throw new Error('Unsupported chunk format');
        }
        const nonce = encryptedBuffer.subarray(6, 6 + NONCE_SIZE);
        const authTag = encryptedBuffer.subarray(6 + NONCE_SIZE, HEADER_SIZE);
        const decipher = crypto.createDecipheriv(ALGORITHM, key, nonce);
        decipher.setAAD(Buffer.from(aad, 'utf8'));
        decipher.setAuthTag(authTag);
        return Buffer.concat([decipher.update(encryptedBuffer.subarray(HEADER_SIZE)), decipher.final()]);
    }
    /**
     * Wrap (encrypt) a file key using the user's master key.
     * Uses AES-256-GCM with a fresh nonce.
     * Returns a base64 string suitable for database storage.
     */
    wrapKey(fileKey, masterKey) {
        const nonce = crypto.randomBytes(NONCE_SIZE);
        const cipher = crypto.createCipheriv(ALGORITHM, masterKey, nonce);
        const wrapped = Buffer.concat([cipher.update(fileKey), cipher.final()]);
        const authTag = cipher.getAuthTag();
        // Format: nonce:authTag:wrappedKey (base64)
        const combined = Buffer.concat([nonce, authTag, wrapped]);
        return combined.toString('base64');
    }
    /**
     * Unwrap (decrypt) a wrapped file key using the user's master key.
     */
    unwrapKey(wrappedKeyBase64, masterKey) {
        const combined = Buffer.from(wrappedKeyBase64, 'base64');
        if (combined.length < NONCE_SIZE + AUTH_TAG_SIZE + 1) {
            throw new Error('Invalid wrapped key format');
        }
        let offset = 0;
        const nonce = combined.subarray(offset, offset + NONCE_SIZE);
        offset += NONCE_SIZE;
        const authTag = combined.subarray(offset, offset + AUTH_TAG_SIZE);
        offset += AUTH_TAG_SIZE;
        const wrappedKey = combined.subarray(offset);
        const decipher = crypto.createDecipheriv(ALGORITHM, masterKey, nonce);
        decipher.setAuthTag(authTag);
        return Buffer.concat([decipher.update(wrappedKey), decipher.final()]);
    }
    /**
     * Compute SHA-256 checksum of a buffer for integrity verification.
     * This is NOT used as an encryption mechanism.
     */
    computeChecksum(data) {
        return crypto.createHash('sha256').update(data).digest('hex');
    }
}
exports.EncryptionService = EncryptionService;
exports.encryptionService = new EncryptionService();
