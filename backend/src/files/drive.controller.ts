import { Router } from 'express';
import { execute, query } from '../lib/db';
import { requireAuthOrApiKey } from '../middleware/auth.middleware';
import { authRateLimit } from '../middleware/rate-limit.middleware';

export const folderRouter = Router();
export const activityRouter = Router();

function actorId(req: import('express').Request): string { return req.session?.userId ?? req.apiKeyUserId!; }
interface FolderRow { id: string; userId: string; parentId: string | null; name: string; sortOrder: number; createdAt: Date; updatedAt: Date; }
const FOLDER_SELECT = 'id,user_id AS userId,parent_id AS parentId,name,sort_order AS sortOrder,created_at AS createdAt,updated_at AS updatedAt';

folderRouter.use(requireAuthOrApiKey, authRateLimit);
folderRouter.get('/', async (req, res, next) => {
  try {
    const folders = await query<FolderRow[]>(`SELECT ${FOLDER_SELECT} FROM folders WHERE user_id=? ORDER BY parent_id,sort_order,name`, [actorId(req)]);
    res.json({ success: true, data: { folders } });
  } catch (error) { next(error); }
});

folderRouter.post('/', async (req, res, next) => {
  try {
    const userId = actorId(req);
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const parentId = typeof req.body?.parentId === 'string' && req.body.parentId ? req.body.parentId : null;
    if (!name || name.length > 255) return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Folder name must be 1 to 255 characters' } });
    if (parentId) {
      const parent = await query<FolderRow[]>('SELECT id FROM folders WHERE id=? AND user_id=? LIMIT 1', [parentId, userId]);
      if (!parent.length) return res.status(404).json({ success: false, error: { code: 'PARENT_NOT_FOUND', message: 'Parent folder not found' } });
    }
    const duplicate = await query<FolderRow[]>('SELECT id FROM folders WHERE user_id=? AND parent_id <=> ? AND name=? LIMIT 1', [userId, parentId, name]);
    if (duplicate.length) return res.status(409).json({ success: false, error: { code: 'FOLDER_EXISTS', message: 'A folder with this name already exists here' } });
    const id = crypto.randomUUID();
    await execute('INSERT INTO folders (id,user_id,parent_id,name) VALUES (?,?,?,?)', [id, userId, parentId, name]);
    const rows = await query<FolderRow[]>(`SELECT ${FOLDER_SELECT} FROM folders WHERE id=?`, [id]);
    res.status(201).json({ success: true, data: { folder: rows[0] } });
  } catch (error) { next(error); }
});

folderRouter.patch('/:id', async (req, res, next) => {
  try {
    const userId = actorId(req);
    const [folder] = await query<FolderRow[]>(`SELECT ${FOLDER_SELECT} FROM folders WHERE id=? AND user_id=? LIMIT 1`, [req.params.id, userId]);
    if (!folder) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Folder not found' } });
    const name = req.body?.name === undefined ? undefined : typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const parentId = req.body?.parentId === undefined ? undefined : (typeof req.body.parentId === 'string' && req.body.parentId ? req.body.parentId : null);
    const sortOrder = req.body?.sortOrder;
    if (name !== undefined && (!name || name.length > 255)) return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Folder name must be 1 to 255 characters' } });
    if (sortOrder !== undefined && (!Number.isInteger(sortOrder) || sortOrder < 0)) return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'sortOrder must be a non-negative integer' } });
    if (parentId !== undefined) {
      if (parentId === folder.id) return res.status(400).json({ success: false, error: { code: 'FOLDER_CYCLE', message: 'A folder cannot be its own parent' } });
      if (parentId) {
        const folders = await query<Array<{ id: string; parentId: string | null }>>('SELECT id,parent_id AS parentId FROM folders WHERE user_id=?', [userId]);
        const parents = new Map(folders.map((item) => [item.id, item.parentId]));
        if (!parents.has(parentId)) return res.status(404).json({ success: false, error: { code: 'PARENT_NOT_FOUND', message: 'Parent folder not found' } });
        let cursor: string | null | undefined = parentId;
        while (cursor) {
          if (cursor === folder.id) return res.status(400).json({ success: false, error: { code: 'FOLDER_CYCLE', message: 'A folder cannot be moved inside its own hierarchy' } });
          cursor = parents.get(cursor);
        }
      }
    }
    const nextName = name ?? folder.name;
    const nextParent = parentId === undefined ? folder.parentId : parentId;
    if ((name !== undefined || parentId !== undefined) && (await query('SELECT id FROM folders WHERE user_id=? AND parent_id <=> ? AND name=? AND id<>? LIMIT 1', [userId,nextParent,nextName,folder.id])).length) {
      return res.status(409).json({ success: false, error: { code: 'FOLDER_EXISTS', message: 'A folder with this name already exists here' } });
    }
    const sets: string[] = []; const values: unknown[] = [];
    if (name !== undefined) { sets.push('name=?'); values.push(name); }
    if (parentId !== undefined) { sets.push('parent_id=?'); values.push(parentId); }
    if (sortOrder !== undefined) { sets.push('sort_order=?'); values.push(sortOrder); }
    if (sets.length) await execute(`UPDATE folders SET ${sets.join(',')} WHERE id=? AND user_id=?`, [...values, folder.id, userId]);
    const [updated] = await query<FolderRow[]>(`SELECT ${FOLDER_SELECT} FROM folders WHERE id=?`, [folder.id]);
    res.json({ success: true, data: { folder: updated } });
  } catch (error) { next(error); }
});

folderRouter.delete('/:id', async (req, res, next) => {
  try {
    const result = await execute('DELETE FROM folders WHERE id=? AND user_id=?', [req.params.id, actorId(req)]);
    if (!result.affectedRows) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Folder not found' } });
    res.json({ success: true });
  } catch (error) { next(error); }
});

activityRouter.get('/', requireAuthOrApiKey, authRateLimit, async (req, res, next) => {
  try {
    const requested = Number(req.query.limit ?? 20);
    const limit = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), 100) : 20;
    const activities = await query('SELECT id,user_id AS userId,file_id AS fileId,action,file_name AS fileName,created_at AS createdAt FROM file_activities WHERE user_id=? ORDER BY created_at DESC LIMIT ?', [actorId(req), limit]);
    res.json({ success: true, data: { activities } });
  } catch (error) { next(error); }
});

import * as crypto from 'crypto';
