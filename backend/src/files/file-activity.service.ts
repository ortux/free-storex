import * as crypto from 'crypto';
import { execute } from '../lib/db';
import { logger } from '../lib/logger';

export type FileActivityAction = 'UPLOAD' | 'RENAME' | 'MOVE' | 'REORDER' | 'DELETE' | 'SHARE' | 'UNSHARE';

export async function recordFileActivity(
  userId: string,
  fileId: string | null,
  action: FileActivityAction,
  fileName: string,
): Promise<void> {
  try {
    await execute('INSERT INTO file_activities (id,user_id,file_id,action,file_name) VALUES (?,?,?,?,?)', [
      crypto.randomUUID(), userId, fileId, action, fileName.slice(0, 255),
    ]);
  } catch (error) {
    logger.warn('Failed to record file activity', { userId, fileId, action, error: String(error) });
  }
}