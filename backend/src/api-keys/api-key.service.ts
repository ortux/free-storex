/**
 * API Key Service
 *
 * Generates and validates API keys.
 * Keys are NEVER stored in plaintext — only SHA-256 hashes are stored.
 *
 * Key format: sk_live_<32 random hex bytes>
 */

import * as crypto from 'crypto';
import { execute, query } from '../lib/db';
import type { ApiKeyRecord } from '../lib/models';

const KEY_PREFIX = 'sk_live_';
const KEY_BYTES = 32; // 256 bits of randomness

export class ApiKeyService {
  /**
   * Generate a new API key and store its hash.
   * The plaintext key is returned ONCE — it cannot be recovered.
   */
  async create(
    userId: string,
    name: string,
    expiresAt?: Date
  ): Promise<{ key: string; record: ApiKeyRecord }> {
    const rawKey = crypto.randomBytes(KEY_BYTES).toString('hex');
    const key = `${KEY_PREFIX}${rawKey}`;
    const prefix = key.substring(0, 16); // Store prefix for display (sk_live_XXXXXXXX)
    const keyHash = this.hashKey(key);

    const id = crypto.randomUUID();
    await execute('INSERT INTO api_keys (id,user_id,name,key_hash,prefix,expires_at) VALUES (?,?,?,?,?,?)', [id, userId, name, keyHash, prefix, expiresAt ?? null]);
    const [record] = await query<ApiKeyRecord[]>(`SELECT id,user_id AS userId,name,key_hash AS keyHash,prefix,last_used AS lastUsed,created_at AS createdAt,expires_at AS expiresAt FROM api_keys WHERE id=?`, [id]);

    return { key, record };
  }

  /**
   * Validate an API key from a request.
   * Returns the associated API key record (with userId) or null.
   */
  async validate(rawKey: string): Promise<ApiKeyRecord | null> {
    if (!rawKey.startsWith(KEY_PREFIX)) return null;

    const keyHash = this.hashKey(rawKey);
    const [record] = await query<ApiKeyRecord[]>(`SELECT id,user_id AS userId,name,key_hash AS keyHash,prefix,last_used AS lastUsed,created_at AS createdAt,expires_at AS expiresAt FROM api_keys WHERE key_hash=? LIMIT 1`, [keyHash]);

    if (!record) return null;

    // Check expiry
    if (record.expiresAt && record.expiresAt < new Date()) {
      return null;
    }

    // Update last used timestamp (fire-and-forget)
    void execute('UPDATE api_keys SET last_used=UTC_TIMESTAMP(3) WHERE id=?', [record.id]).catch(() => {});

    return record;
  }

  async listByUserId(userId: string): Promise<ApiKeyRecord[]> {
    return query<ApiKeyRecord[]>(`SELECT id,user_id AS userId,name,key_hash AS keyHash,prefix,last_used AS lastUsed,created_at AS createdAt,expires_at AS expiresAt FROM api_keys WHERE user_id=? ORDER BY created_at DESC`, [userId]);
  }

  async delete(id: string, userId: string): Promise<void> {
    await execute('DELETE FROM api_keys WHERE id=? AND user_id=?', [id, userId]);
  }

  private hashKey(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex');
  }
}

export const apiKeyService = new ApiKeyService();
