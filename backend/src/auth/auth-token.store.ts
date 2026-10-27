import { createHash, randomBytes } from 'crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { execute, transaction } from '../lib/db';

const TTL_MS = 2 * 60 * 1000;

interface HandoffTokenRow extends RowDataPacket {
  userId: string;
  expiresAt: number | string;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function initializeHandoffTokenStore(): Promise<void> {
  await execute(`CREATE TABLE IF NOT EXISTS oauth_handoff_tokens (
    token_hash CHAR(64) NOT NULL PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    expires_at BIGINT UNSIGNED NOT NULL,
    KEY idx_oauth_handoff_tokens_expires (expires_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

export async function createHandoffToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const expiresAt = Date.now() + TTL_MS;

  await execute(
    'INSERT INTO oauth_handoff_tokens (token_hash,user_id,expires_at) VALUES (?,?,?)',
    [hashToken(token), userId, expiresAt],
  );
  await execute('DELETE FROM oauth_handoff_tokens WHERE expires_at <= ?', [Date.now()]);

  return token;
}

/**
 * Consumes and returns the userId associated with `token`.
 * The transaction makes consumption atomic across backend instances.
 */
export async function consumeHandoffToken(token: string): Promise<string | null> {
  return transaction(async (connection) => {
    const [rows] = await connection.execute<HandoffTokenRow[]>(
      'SELECT user_id AS userId, expires_at AS expiresAt FROM oauth_handoff_tokens WHERE token_hash=? FOR UPDATE',
      [hashToken(token)],
    );
    const entry = rows[0];

    if (!entry) return null;

    await connection.execute(
      'DELETE FROM oauth_handoff_tokens WHERE token_hash=?',
      [hashToken(token)],
    );

    return Number(entry.expiresAt) > Date.now() ? entry.userId : null;
  });
}
