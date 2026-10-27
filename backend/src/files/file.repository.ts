import { execute, query, transaction } from '../lib/db';
import type { FileRecord, FileStatus } from '../lib/models';

const FILE_COLUMNS = `id, user_id AS userId, workspace_id AS workspaceId, folder_id AS folderId,
  sort_order AS sortOrder, original_filename AS originalFilename, stored_filename AS storedFilename,
  storage_path AS storagePath, storage_repository_id AS storageRepositoryId, provider_ref AS providerRef, mime_type AS mimeType, file_size AS fileSize,
  encrypted_file_key AS encryptedFileKey, encryption_version AS encryptionVersion,
  storage_type AS storageType, chunk_size AS chunkSize, total_chunks AS totalChunks,
  checksum, status, created_at AS createdAt, updated_at AS updatedAt`;

export class FileRepository {
  async create(data: {
    id: string; userId: string; workspaceId?: string; folderId?: string | null;
    originalFilename: string; storedFilename: string; storagePath: string; mimeType: string;
    fileSize: number; encryptedFileKey: string; checksum: string; status?: FileStatus;
  }): Promise<FileRecord> {
    await execute(
      `INSERT INTO files (id,user_id,workspace_id,folder_id,original_filename,stored_filename,storage_path,mime_type,file_size,encrypted_file_key,checksum,status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [data.id, data.userId, data.workspaceId ?? null, data.folderId ?? null, data.originalFilename,
        data.storedFilename, data.storagePath, data.mimeType, data.fileSize, data.encryptedFileKey, data.checksum, data.status ?? 'PENDING'],
    );
    return (await this.findById(data.id))!;
  }

  async findById(id: string): Promise<FileRecord | null> {
    const rows = await query<FileRecord[]>(`SELECT ${FILE_COLUMNS} FROM files WHERE id = ? LIMIT 1`, [id]);
    return rows[0] ?? null;
  }

  async findByIdAndUserId(id: string, userId: string): Promise<FileRecord | null> {
    const rows = await query<FileRecord[]>(`SELECT ${FILE_COLUMNS} FROM files WHERE id = ? AND user_id = ? AND status <> 'DELETED' LIMIT 1`, [id, userId]);
    return rows[0] ?? null;
  }

  async findByIdAndAccessor(id: string, userId: string): Promise<{ file: FileRecord; isOwner: boolean; recipientEncryptedFileKey?: string } | null> {
    const owned = await this.findByIdAndUserId(id, userId);
    if (owned) return { file: owned, isOwner: true };
    const rows = await query<Array<{ recipientEncryptedFileKey: string } & FileRecord>>(
      `SELECT f.${'id'}, f.user_id AS userId, f.workspace_id AS workspaceId, f.folder_id AS folderId,
       f.sort_order AS sortOrder, f.original_filename AS originalFilename, f.stored_filename AS storedFilename,
       f.storage_path AS storagePath, f.storage_repository_id AS storageRepositoryId, f.provider_ref AS providerRef, f.mime_type AS mimeType, f.file_size AS fileSize,
       f.encrypted_file_key AS encryptedFileKey, f.encryption_version AS encryptionVersion,
       f.storage_type AS storageType, f.chunk_size AS chunkSize, f.total_chunks AS totalChunks,
       f.checksum, f.status, f.created_at AS createdAt, f.updated_at AS updatedAt,
       s.recipient_encrypted_file_key AS recipientEncryptedFileKey
       FROM files f JOIN file_shares s ON s.file_id = f.id
       WHERE f.id = ? AND s.shared_with_id = ? AND f.status <> 'DELETED'
       AND (s.expires_at IS NULL OR s.expires_at > UTC_TIMESTAMP()) LIMIT 1`, [id, userId],
    );
    const row = rows[0];
    if (!row) return null;
    const { recipientEncryptedFileKey, ...file } = row;
    return { file, isOwner: false, recipientEncryptedFileKey };
  }

  async listByUserId(userId: string, options?: {
    search?: string; mimeType?: string; workspaceId?: string; folderId?: string | null;
    limit?: number; offset?: number; sortBy?: 'createdAt' | 'fileSize' | 'originalFilename' | 'sortOrder'; sortOrder?: 'asc' | 'desc';
  }): Promise<{ files: FileRecord[]; total: number }> {
    const conditions = ['user_id = ?', "status = 'ACTIVE'"];
    const values: unknown[] = [userId];
    if (options?.search) { conditions.push('original_filename LIKE ?'); values.push(`%${options.search}%`); }
    if (options?.mimeType) { conditions.push('mime_type = ?'); values.push(options.mimeType); }
    if (options?.workspaceId) { conditions.push('workspace_id = ?'); values.push(options.workspaceId); }
    if (options?.folderId !== undefined) { conditions.push(options.folderId === null ? 'folder_id IS NULL' : 'folder_id = ?'); if (options.folderId !== null) values.push(options.folderId); }
    const where = conditions.join(' AND ');
    const sortColumns = { createdAt: 'created_at', fileSize: 'file_size', originalFilename: 'original_filename', sortOrder: 'sort_order' };
    const sortColumn = sortColumns[options?.sortBy ?? 'createdAt'];
    const order = options?.sortOrder === 'asc' ? 'ASC' : 'DESC';
    const orderSql = options?.sortBy === 'sortOrder' ? `sort_order ${order}, created_at DESC` : `${sortColumn} ${order}`;
    const limit = Math.max(1, Math.min(options?.limit ?? 50, 1000));
    const offset = Math.max(0, options?.offset ?? 0);
    const [files, counts] = await Promise.all([
      query<FileRecord[]>(`SELECT ${FILE_COLUMNS} FROM files WHERE ${where} ORDER BY ${orderSql} LIMIT ? OFFSET ?`, [...values, limit, offset]),
      query<Array<{ total: number }>>(`SELECT COUNT(*) AS total FROM files WHERE ${where}`, values),
    ]);
    return { files, total: Number(counts[0]?.total ?? 0) };
  }

  async listByWorkspaceId(workspaceId: string, options?: { search?: string; mimeType?: string; limit?: number; offset?: number }): Promise<{ files: FileRecord[]; total: number }> {
    const conditions = ['workspace_id = ?', "status = 'ACTIVE'"];
    const values: unknown[] = [workspaceId];
    if (options?.search) { conditions.push('original_filename LIKE ?'); values.push(`%${options.search}%`); }
    if (options?.mimeType) { conditions.push('mime_type = ?'); values.push(options.mimeType); }
    const where = conditions.join(' AND ');
    const limit = Math.max(1, Math.min(options?.limit ?? 50, 1000));
    const offset = Math.max(0, options?.offset ?? 0);
    const [files, counts] = await Promise.all([
      query<FileRecord[]>(`SELECT ${FILE_COLUMNS} FROM files WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...values, limit, offset]),
      query<Array<{ total: number }>>(`SELECT COUNT(*) AS total FROM files WHERE ${where}`, values),
    ]);
    return { files, total: Number(counts[0]?.total ?? 0) };
  }

  async updateStatus(id: string, status: FileStatus, providerRef?: string): Promise<FileRecord> {
    await execute(`UPDATE files SET status = ?, provider_ref = COALESCE(?, provider_ref) WHERE id = ?`, [status, providerRef ?? null, id]);
    const file = await this.findById(id);
    if (!file) throw new Error('File not found after status update');
    return file;
  }

  async updateUploadResult(id: string, data: { checksum: string; encryptedFileKey: string; providerRef: string; storageRepositoryId: string }): Promise<void> {
    await execute("UPDATE files SET checksum=?, encrypted_file_key=?, provider_ref=?, storage_repository_id=?, status='ACTIVE' WHERE id=?", [data.checksum, data.encryptedFileKey, data.providerRef, data.storageRepositoryId, id]);
  }

  async updateMetadata(id: string, data: { originalFilename?: string; mimeType?: string; fileSize?: number }): Promise<FileRecord> {
    const assignments: string[] = [];
    const values: unknown[] = [];
    if (data.originalFilename !== undefined) { assignments.push('original_filename = ?'); values.push(data.originalFilename); }
    if (data.mimeType !== undefined) { assignments.push('mime_type = ?'); values.push(data.mimeType); }
    if (data.fileSize !== undefined) { assignments.push('file_size = ?'); values.push(data.fileSize); }
    if (assignments.length) await execute(`UPDATE files SET ${assignments.join(', ')} WHERE id = ?`, [...values, id]);
    const file = await this.findById(id);
    if (!file) throw new Error('File not found after metadata update');
    return file;
  }

  async move(id: string, folderId: string | null, sortOrder: number): Promise<FileRecord> {
    await execute('UPDATE files SET folder_id = ?, sort_order = ? WHERE id = ?', [folderId, sortOrder, id]);
    return (await this.findById(id))!;
  }

  async reorder(userId: string, fileIds: string[], folderId: string | null): Promise<void> {
    await transaction(async (connection) => {
      for (const [sortOrder, id] of fileIds.entries()) {
        await connection.execute(
          `UPDATE files SET sort_order = ? WHERE id = ? AND user_id = ? AND folder_id ${folderId === null ? 'IS NULL' : '= ?'} AND status = 'ACTIVE'`,
          folderId === null ? [sortOrder, id, userId] : [sortOrder, id, userId, folderId],
        );
      }
    });
  }

  async delete(id: string): Promise<void> { await execute("UPDATE files SET status = 'DELETED' WHERE id = ?", [id]); }
  async hardDelete(id: string): Promise<void> { await execute('DELETE FROM files WHERE id = ?', [id]); }
}

export const fileRepository = new FileRepository();
