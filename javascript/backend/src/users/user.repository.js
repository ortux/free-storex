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
exports.userRepository = exports.UserRepository = void 0;
const db_1 = require("../lib/db");
const USER_COLUMNS = `id, github_id AS githubId, github_username AS githubUsername, email,
  github_access_token_encrypted AS githubAccessTokenEncrypted,
  encrypted_master_key AS encryptedMasterKey, repository_name AS repositoryName,
  repository_owner AS repositoryOwner, created_at AS createdAt, updated_at AS updatedAt`;
class UserRepository {
    async findById(id) {
        const rows = await (0, db_1.query)(`SELECT ${USER_COLUMNS} FROM users WHERE id = ? LIMIT 1`, [id]);
        return rows[0] ?? null;
    }
    async findByGithubId(githubId) {
        const rows = await (0, db_1.query)(`SELECT ${USER_COLUMNS} FROM users WHERE github_id = ? LIMIT 1`, [githubId]);
        return rows[0] ?? null;
    }
    async findByUsername(githubUsername) {
        const rows = await (0, db_1.query)(`SELECT id FROM users WHERE github_username = ? LIMIT 1`, [githubUsername]);
        return rows[0] ?? null;
    }
    async create(data) {
        const id = crypto.randomUUID();
        await (0, db_1.execute)(`INSERT INTO users (id, github_id, github_username, email, github_access_token_encrypted, encrypted_master_key)
       VALUES (?, ?, ?, ?, ?, ?)`, [id, data.githubId, data.githubUsername, data.email ?? null, data.githubAccessTokenEncrypted, data.encryptedMasterKey]);
        return (await this.findById(id));
    }
    async updateTokenAndRepo(id, data) {
        const assignments = [];
        const values = [];
        if (data.githubAccessTokenEncrypted !== undefined) {
            assignments.push('github_access_token_encrypted = ?');
            values.push(data.githubAccessTokenEncrypted);
        }
        if (data.repositoryName !== undefined) {
            assignments.push('repository_name = ?');
            values.push(data.repositoryName);
        }
        if (data.repositoryOwner !== undefined) {
            assignments.push('repository_owner = ?');
            values.push(data.repositoryOwner);
        }
        if (assignments.length)
            await (0, db_1.execute)(`UPDATE users SET ${assignments.join(', ')} WHERE id = ?`, [...values, id]);
        const user = await this.findById(id);
        if (!user)
            throw new Error('User not found after update');
        return user;
    }
    async updateGithubToken(id, encryptedToken) {
        await (0, db_1.execute)('UPDATE users SET github_access_token_encrypted = ? WHERE id = ?', [encryptedToken, id]);
    }
    async getStats(userId) {
        const rows = await (0, db_1.query)(`SELECT COUNT(*) AS fileCount, COALESCE(SUM(file_size), 0) AS totalBytes
       FROM files WHERE user_id = ? AND status = 'ACTIVE'`, [userId]);
        return { fileCount: Number(rows[0]?.fileCount ?? 0), totalBytes: Number(rows[0]?.totalBytes ?? 0) };
    }
}
exports.UserRepository = UserRepository;
const crypto = __importStar(require("crypto"));
exports.userRepository = new UserRepository();
