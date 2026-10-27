/**
 * Key Service
 *
 * Handles master key encryption/decryption using the server-side
 * MASTER_KEY_ENCRYPTION_SECRET environment variable.
 *
 * The master key is NEVER stored in plaintext — it is always wrapped
 * with the server secret before being saved to the database.
 */

import * as crypto from 'crypto';
import { config } from '../config';

const ALGORITHM = 'aes-256-gcm';
const KEY_SIZE = 32;
const NONCE_SIZE = 12;
const AUTH_TAG_SIZE = 16;

/**
 * Derive a stable 256-bit AES key from the MASTER_KEY_ENCRYPTION_SECRET
 * using HKDF so the raw secret string is never used directly as a key.
 */
function deriveServerKey(): Buffer {
  const secret = config.encryption.masterKeySecret;
  // Use HKDF to derive a proper 256-bit key
  return Buffer.from(crypto.hkdfSync(
    'sha256',
    Buffer.from(secret, 'utf8'),
    Buffer.from('free-store-master-key-wrapping', 'utf8'),
    Buffer.from('v1', 'utf8'),
    KEY_SIZE
  ));
}

export class KeyService {
  /**
   * Encrypt a master key (Buffer) with the server secret.
   * Returns a base64 string for database storage.
   */
  encryptMasterKey(masterKey: Buffer): string {
    const serverKey = deriveServerKey();
    const nonce = crypto.randomBytes(NONCE_SIZE);
    const cipher = crypto.createCipheriv(ALGORITHM, serverKey, nonce);
    const encrypted = Buffer.concat([cipher.update(masterKey), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const combined = Buffer.concat([nonce, authTag, encrypted]);
    return combined.toString('base64');
  }

  /**
   * Decrypt a master key from its base64-encoded stored form.
   */
  decryptMasterKey(encryptedMasterKeyBase64: string): Buffer {
    const serverKey = deriveServerKey();
    const combined = Buffer.from(encryptedMasterKeyBase64, 'base64');

    if (combined.length < NONCE_SIZE + AUTH_TAG_SIZE + 1) {
      throw new Error('Invalid encrypted master key format');
    }

    let offset = 0;
    const nonce = combined.subarray(offset, offset + NONCE_SIZE); offset += NONCE_SIZE;
    const authTag = combined.subarray(offset, offset + AUTH_TAG_SIZE); offset += AUTH_TAG_SIZE;
    const encrypted = combined.subarray(offset);

    const decipher = crypto.createDecipheriv(ALGORITHM, serverKey, nonce);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }

  /**
   * Encrypt a GitHub OAuth access token for at-rest storage.
   */
  encryptToken(token: string): string {
    return this.encryptMasterKey(Buffer.from(token, 'utf8'));
  }

  /**
   * Decrypt a stored GitHub OAuth access token.
   */
  decryptToken(encryptedToken: string): string {
    return this.decryptMasterKey(encryptedToken).toString('utf8');
  }
}

export const keyService = new KeyService();
