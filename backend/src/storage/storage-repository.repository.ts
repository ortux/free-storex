import * as crypto from 'crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { execute, query, transaction } from '../lib/db';

export interface StorageRepositoryRecord {
  id: string;
  userId: string;
  repositoryOwner: string;
  repositoryName: string;
  usedBytes: number;
  maxBytes: number;
  isPrimary: boolean;
  status: 'ACTIVE' | 'FULL';
}

export interface NewGitHubRepository {
  owner: string;
  name: string;
  sizeBytes: number;
}

const REPOSITORY_COLUMNS = `id,user_id AS userId,repository_owner AS repositoryOwner,
  repository_name AS repositoryName,used_bytes AS usedBytes,max_bytes AS maxBytes,
  is_primary AS isPrimary,status`;

export class StorageRepositoryRepository {
  async listByUserId(userId: string): Promise<StorageRepositoryRecord[]> {
    return query<StorageRepositoryRecord[]>(
      `SELECT ${REPOSITORY_COLUMNS} FROM storage_repositories WHERE user_id=? ORDER BY created_at`,
      [userId],
    );
  }

  async findByIdForUser(id: string, userId: string): Promise<StorageRepositoryRecord | null> {
    const [repository] = await query<StorageRepositoryRecord[]>(
      `SELECT ${REPOSITORY_COLUMNS} FROM storage_repositories WHERE id=? AND user_id=? LIMIT 1`,
      [id, userId],
    );
    return repository ?? null;
  }

  async registerPrimary(userId: string, owner: string, name: string, initialSizeBytes: number, maxBytes: number): Promise<void> {
    await execute(
      `INSERT INTO storage_repositories
       (id,user_id,repository_owner,repository_name,used_bytes,max_bytes,is_primary,status)
       VALUES (?,?,?,?,?,?,1,'ACTIVE')
       ON DUPLICATE KEY UPDATE id=VALUES(id)`,
      [crypto.randomUUID(), userId, owner, name, initialSizeBytes, maxBytes],
    );
  }

  async reserveCapacity(
    userId: string,
    bytes: number,
    maxBytes: number,
    createRepository: () => Promise<NewGitHubRepository>,
  ): Promise<StorageRepositoryRecord> {
    if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > maxBytes) {
      throw new Error('Storage reservation size is invalid or exceeds the per-repository capacity');
    }

    return transaction(async (connection) => {
      const [users] = await connection.execute<RowDataPacket[]>(
        'SELECT id FROM users WHERE id=? FOR UPDATE',
        [userId],
      );
      if (!users.length) throw new Error('Cannot allocate storage for an unknown user');

      const [repositories] = await connection.execute<(RowDataPacket & StorageRepositoryRecord)[]>(
        `SELECT ${REPOSITORY_COLUMNS} FROM storage_repositories
         WHERE user_id=? AND status='ACTIVE' ORDER BY created_at DESC FOR UPDATE`,
        [userId],
      );
      const available = repositories.find((repository) =>
        Number(repository.usedBytes) + bytes <= Number(repository.maxBytes)
      );

      if (available) {
        await connection.execute(
          'UPDATE storage_repositories SET used_bytes=used_bytes+? WHERE id=?',
          [bytes, available.id],
        );
        return { ...available, usedBytes: Number(available.usedBytes) + bytes };
      }

      await connection.execute(
        `UPDATE storage_repositories SET status='FULL'
         WHERE user_id=? AND status='ACTIVE' AND used_bytes+?>max_bytes`,
        [userId, bytes],
      );

      const created = await createRepository();
      const initialBytes = Math.max(0, Math.ceil(created.sizeBytes));
      if (initialBytes + bytes > maxBytes) {
        throw new Error('New GitHub storage repository does not have enough capacity for this object');
      }
      const repository: StorageRepositoryRecord = {
        id: crypto.randomUUID(),
        userId,
        repositoryOwner: created.owner,
        repositoryName: created.name,
        usedBytes: initialBytes + bytes,
        maxBytes,
        isPrimary: repositories.length === 0,
        status: 'ACTIVE',
      };
      await connection.execute(
        `INSERT INTO storage_repositories
         (id,user_id,repository_owner,repository_name,used_bytes,max_bytes,is_primary,status)
         VALUES (?,?,?,?,?,?,?,'ACTIVE')`,
        [repository.id, userId, created.owner, created.name, repository.usedBytes, maxBytes, repository.isPrimary ? 1 : 0],
      );
      return repository;
    });
  }

  async releaseReservation(repositoryId: string, bytes: number): Promise<void> {
    await execute(
      `UPDATE storage_repositories
       SET used_bytes=GREATEST(0,used_bytes-?),
           status=IF(used_bytes < max_bytes,'ACTIVE',status)
       WHERE id=?`,
      [bytes, repositoryId],
    );
  }
}

export const storageRepositoryRepository = new StorageRepositoryRepository();
