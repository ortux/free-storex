"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MySqlSessionStore = void 0;
const express_session_1 = __importDefault(require("express-session"));
const db_1 = require("./db");
const logger_1 = require("./logger");
class MySqlSessionStore extends express_session_1.default.Store {
    cleanupTimer;
    async initialize() {
        await (0, db_1.execute)(`CREATE TABLE IF NOT EXISTS user_sessions (
      session_id VARCHAR(128) NOT NULL PRIMARY KEY,
      expires_at BIGINT UNSIGNED NOT NULL,
      session_data MEDIUMTEXT NOT NULL,
      KEY idx_user_sessions_expires (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
        this.cleanupTimer = setInterval(() => {
            void (0, db_1.execute)('DELETE FROM user_sessions WHERE expires_at <= ?', [Date.now()])
                .catch((error) => logger_1.logger.warn('Expired session cleanup failed', { error: String(error) }));
        }, 15 * 60 * 1000).unref();
    }
    get(sid, callback) {
        void (0, db_1.query)('SELECT session_data AS sessionData, expires_at AS expiresAt FROM user_sessions WHERE session_id=? LIMIT 1', [sid])
            .then(([row]) => {
            if (!row || Number(row.expiresAt) <= Date.now()) {
                if (row)
                    void this.destroy(sid, () => undefined);
                callback(null, null);
                return;
            }
            callback(null, JSON.parse(row.sessionData));
        })
            .catch((error) => callback(error));
    }
    set(sid, value, callback) {
        const expiresAt = value.cookie.expires
            ? new Date(value.cookie.expires).getTime()
            : Date.now() + (value.cookie.maxAge ?? 24 * 60 * 60 * 1000);
        void (0, db_1.execute)(`INSERT INTO user_sessions (session_id,expires_at,session_data) VALUES (?,?,?)
      ON DUPLICATE KEY UPDATE expires_at=VALUES(expires_at),session_data=VALUES(session_data)`, [sid, expiresAt, JSON.stringify(value)])
            .then(() => callback?.())
            .catch((error) => callback?.(error));
    }
    destroy(sid, callback) {
        void (0, db_1.execute)('DELETE FROM user_sessions WHERE session_id=?', [sid])
            .then(() => callback?.())
            .catch((error) => callback?.(error));
    }
    touch(sid, value, callback) {
        const expiresAt = value.cookie.expires
            ? new Date(value.cookie.expires).getTime()
            : Date.now() + (value.cookie.maxAge ?? 24 * 60 * 60 * 1000);
        void (0, db_1.execute)('UPDATE user_sessions SET expires_at=? WHERE session_id=?', [expiresAt, sid])
            .then(() => callback?.())
            .catch((error) => callback?.(error));
    }
    close() {
        if (this.cleanupTimer)
            clearInterval(this.cleanupTimer);
    }
}
exports.MySqlSessionStore = MySqlSessionStore;
