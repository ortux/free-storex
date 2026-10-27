import session from 'express-session';
import type { SessionData } from 'express-session';
import { execute, query } from './db';
import { logger } from './logger';

export class MySqlSessionStore extends session.Store {
  private cleanupTimer?: NodeJS.Timeout;

  async initialize(): Promise<void> {
    await execute(`CREATE TABLE IF NOT EXISTS user_sessions (
      session_id VARCHAR(128) NOT NULL PRIMARY KEY,
      expires_at BIGINT UNSIGNED NOT NULL,
      session_data MEDIUMTEXT NOT NULL,
      KEY idx_user_sessions_expires (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    this.cleanupTimer = setInterval(() => {
      void execute('DELETE FROM user_sessions WHERE expires_at <= ?', [Date.now()])
        .catch((error) => logger.warn('Expired session cleanup failed', { error: String(error) }));
    }, 15 * 60 * 1000).unref();
  }

  get(sid: string, callback: (error: unknown, session?: SessionData | null) => void): void {
    void query<Array<{ sessionData: string; expiresAt: number | string }>>(
      'SELECT session_data AS sessionData, expires_at AS expiresAt FROM user_sessions WHERE session_id=? LIMIT 1',
      [sid]
    )
      .then(([row]) => {
        if (!row || Number(row.expiresAt) <= Date.now()) {
          if (row) void this.destroy(sid, () => undefined);
          callback(null, null);
          return;
        }
        callback(null, JSON.parse(row.sessionData) as SessionData);
      })
      .catch((error: unknown) => callback(error));
  }

  set(sid: string, value: SessionData, callback?: (error?: unknown) => void): void {
    const expiresAt = value.cookie.expires
      ? new Date(value.cookie.expires).getTime()
      : Date.now() + (value.cookie.maxAge ?? 24 * 60 * 60 * 1000);

    void execute(`INSERT INTO user_sessions (session_id,expires_at,session_data) VALUES (?,?,?)
      ON DUPLICATE KEY UPDATE expires_at=VALUES(expires_at),session_data=VALUES(session_data)`,
      [sid, expiresAt, JSON.stringify(value)])
      .then(() => callback?.())
      .catch((error: unknown) => callback?.(error));
  }

  destroy(sid: string, callback?: (error?: unknown) => void): void {
    void execute('DELETE FROM user_sessions WHERE session_id=?', [sid])
      .then(() => callback?.())
      .catch((error: unknown) => callback?.(error));
  }

  touch(sid: string, value: SessionData, callback?: (error?: unknown) => void): void {
    const expiresAt = value.cookie.expires
      ? new Date(value.cookie.expires).getTime()
      : Date.now() + (value.cookie.maxAge ?? 24 * 60 * 60 * 1000);

    void execute('UPDATE user_sessions SET expires_at=? WHERE session_id=?', [expiresAt, sid])
      .then(() => callback?.())
      .catch((error: unknown) => callback?.(error));
  }

  close(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }
}