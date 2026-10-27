import { execute, query } from '../lib/db';
import type { User } from '../lib/models';

const USER_COLUMNS = `id, github_id AS githubId, github_username AS githubUsername, email,
  github_access_token_encrypted AS githubAccessTokenEncrypted,
  encrypted_master_key AS encryptedMasterKey, repository_name AS repositoryName,
  repository_owner AS repositoryOwner, created_at AS createdAt, updated_at AS updatedAt`;

export class UserRepository {
  async findById(id: string): Promise<User | null> {
    const rows = await query<User[]>(`SELECT ${USER_COLUMNS} FROM users WHERE id = ? LIMIT 1`, [id]);
    return rows[0] ?? null;
  }

  async findByGithubId(githubId: string): Promise<User | null> {
    const rows = await query<User[]>(`SELECT ${USER_COLUMNS} FROM users WHERE github_id = ? LIMIT 1`, [githubId]);
    return rows[0] ?? null;
  }

  async findByUsername(githubUsername: string): Promise<Pick<User, 'id'> | null> {
    const rows = await query<Array<Pick<User, 'id'>>>(`SELECT id FROM users WHERE github_username = ? LIMIT 1`, [githubUsername]);
    return rows[0] ?? null;
  }

  async create(data: {
    githubId: string;
    githubUsername: string;
    email?: string | null;
    githubAccessTokenEncrypted: string;
    encryptedMasterKey: string;
  }): Promise<User> {
    const id = crypto.randomUUID();
    await execute(
      `INSERT INTO users (id, github_id, github_username, email, github_access_token_encrypted, encrypted_master_key)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, data.githubId, data.githubUsername, data.email ?? null, data.githubAccessTokenEncrypted, data.encryptedMasterKey],
    );
    return (await this.findById(id))!;
  }

  async updateTokenAndRepo(id: string, data: {
    githubAccessTokenEncrypted?: string;
    repositoryName?: string;
    repositoryOwner?: string;
  }): Promise<User> {
    const assignments: string[] = [];
    const values: unknown[] = [];
    if (data.githubAccessTokenEncrypted !== undefined) { assignments.push('github_access_token_encrypted = ?'); values.push(data.githubAccessTokenEncrypted); }
    if (data.repositoryName !== undefined) { assignments.push('repository_name = ?'); values.push(data.repositoryName); }
    if (data.repositoryOwner !== undefined) { assignments.push('repository_owner = ?'); values.push(data.repositoryOwner); }
    if (assignments.length) await execute(`UPDATE users SET ${assignments.join(', ')} WHERE id = ?`, [...values, id]);
    const user = await this.findById(id);
    if (!user) throw new Error('User not found after update');
    return user;
  }

  async updateGithubToken(id: string, encryptedToken: string): Promise<void> {
    await execute('UPDATE users SET github_access_token_encrypted = ? WHERE id = ?', [encryptedToken, id]);
  }

  async getStats(userId: string): Promise<{ fileCount: number; totalBytes: number }> {
    const rows = await query<Array<{ fileCount: number; totalBytes: number | null }>>(
      `SELECT COUNT(*) AS fileCount, COALESCE(SUM(file_size), 0) AS totalBytes
       FROM files WHERE user_id = ? AND status = 'ACTIVE'`, [userId],
    );
    return { fileCount: Number(rows[0]?.fileCount ?? 0), totalBytes: Number(rows[0]?.totalBytes ?? 0) };
  }
}

import * as crypto from 'crypto';
export const userRepository = new UserRepository();
