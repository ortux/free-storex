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
exports.activityRouter = exports.folderRouter = void 0;
const express_1 = require("express");
const db_1 = require("../lib/db");
const auth_middleware_1 = require("../middleware/auth.middleware");
const rate_limit_middleware_1 = require("../middleware/rate-limit.middleware");
exports.folderRouter = (0, express_1.Router)();
exports.activityRouter = (0, express_1.Router)();
function actorId(req) { return req.session?.userId ?? req.apiKeyUserId; }
const FOLDER_SELECT = 'id,user_id AS userId,parent_id AS parentId,name,sort_order AS sortOrder,created_at AS createdAt,updated_at AS updatedAt';
exports.folderRouter.use(auth_middleware_1.requireAuth, rate_limit_middleware_1.authRateLimit);
exports.folderRouter.get('/', async (req, res, next) => {
    try {
        const folders = await (0, db_1.query)(`SELECT ${FOLDER_SELECT} FROM folders WHERE user_id=? ORDER BY parent_id,sort_order,name`, [actorId(req)]);
        res.json({ success: true, data: { folders } });
    }
    catch (error) {
        next(error);
    }
});
exports.folderRouter.post('/', async (req, res, next) => {
    try {
        const userId = actorId(req);
        const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
        const parentId = typeof req.body?.parentId === 'string' && req.body.parentId ? req.body.parentId : null;
        if (!name || name.length > 255)
            return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Folder name must be 1 to 255 characters' } });
        if (parentId) {
            const parent = await (0, db_1.query)('SELECT id FROM folders WHERE id=? AND user_id=? LIMIT 1', [parentId, userId]);
            if (!parent.length)
                return res.status(404).json({ success: false, error: { code: 'PARENT_NOT_FOUND', message: 'Parent folder not found' } });
        }
        const duplicate = await (0, db_1.query)('SELECT id FROM folders WHERE user_id=? AND parent_id <=> ? AND name=? LIMIT 1', [userId, parentId, name]);
        if (duplicate.length)
            return res.status(409).json({ success: false, error: { code: 'FOLDER_EXISTS', message: 'A folder with this name already exists here' } });
        const id = crypto.randomUUID();
        await (0, db_1.execute)('INSERT INTO folders (id,user_id,parent_id,name) VALUES (?,?,?,?)', [id, userId, parentId, name]);
        const rows = await (0, db_1.query)(`SELECT ${FOLDER_SELECT} FROM folders WHERE id=?`, [id]);
        res.status(201).json({ success: true, data: { folder: rows[0] } });
    }
    catch (error) {
        next(error);
    }
});
exports.folderRouter.patch('/:id', async (req, res, next) => {
    try {
        const userId = actorId(req);
        const [folder] = await (0, db_1.query)(`SELECT ${FOLDER_SELECT} FROM folders WHERE id=? AND user_id=? LIMIT 1`, [req.params.id, userId]);
        if (!folder)
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Folder not found' } });
        const name = req.body?.name === undefined ? undefined : typeof req.body.name === 'string' ? req.body.name.trim() : '';
        const parentId = req.body?.parentId === undefined ? undefined : (typeof req.body.parentId === 'string' && req.body.parentId ? req.body.parentId : null);
        const sortOrder = req.body?.sortOrder;
        if (name !== undefined && (!name || name.length > 255))
            return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Folder name must be 1 to 255 characters' } });
        if (sortOrder !== undefined && (!Number.isInteger(sortOrder) || sortOrder < 0))
            return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'sortOrder must be a non-negative integer' } });
        if (parentId !== undefined) {
            if (parentId === folder.id)
                return res.status(400).json({ success: false, error: { code: 'FOLDER_CYCLE', message: 'A folder cannot be its own parent' } });
            if (parentId) {
                const folders = await (0, db_1.query)('SELECT id,parent_id AS parentId FROM folders WHERE user_id=?', [userId]);
                const parents = new Map(folders.map((item) => [item.id, item.parentId]));
                if (!parents.has(parentId))
                    return res.status(404).json({ success: false, error: { code: 'PARENT_NOT_FOUND', message: 'Parent folder not found' } });
                let cursor = parentId;
                while (cursor) {
                    if (cursor === folder.id)
                        return res.status(400).json({ success: false, error: { code: 'FOLDER_CYCLE', message: 'A folder cannot be moved inside its own hierarchy' } });
                    cursor = parents.get(cursor);
                }
            }
        }
        const nextName = name ?? folder.name;
        const nextParent = parentId === undefined ? folder.parentId : parentId;
        if ((name !== undefined || parentId !== undefined) && (await (0, db_1.query)('SELECT id FROM folders WHERE user_id=? AND parent_id <=> ? AND name=? AND id<>? LIMIT 1', [userId, nextParent, nextName, folder.id])).length) {
            return res.status(409).json({ success: false, error: { code: 'FOLDER_EXISTS', message: 'A folder with this name already exists here' } });
        }
        const sets = [];
        const values = [];
        if (name !== undefined) {
            sets.push('name=?');
            values.push(name);
        }
        if (parentId !== undefined) {
            sets.push('parent_id=?');
            values.push(parentId);
        }
        if (sortOrder !== undefined) {
            sets.push('sort_order=?');
            values.push(sortOrder);
        }
        if (sets.length)
            await (0, db_1.execute)(`UPDATE folders SET ${sets.join(',')} WHERE id=? AND user_id=?`, [...values, folder.id, userId]);
        const [updated] = await (0, db_1.query)(`SELECT ${FOLDER_SELECT} FROM folders WHERE id=?`, [folder.id]);
        res.json({ success: true, data: { folder: updated } });
    }
    catch (error) {
        next(error);
    }
});
exports.folderRouter.delete('/:id', async (req, res, next) => {
    try {
        const result = await (0, db_1.execute)('DELETE FROM folders WHERE id=? AND user_id=?', [req.params.id, actorId(req)]);
        if (!result.affectedRows)
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Folder not found' } });
        res.json({ success: true });
    }
    catch (error) {
        next(error);
    }
});
exports.activityRouter.get('/', auth_middleware_1.requireAuth, rate_limit_middleware_1.authRateLimit, async (req, res, next) => {
    try {
        const requested = Number(req.query.limit ?? 20);
        const limit = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), 100) : 20;
        const activities = await (0, db_1.query)('SELECT id,user_id AS userId,file_id AS fileId,action,file_name AS fileName,created_at AS createdAt FROM file_activities WHERE user_id=? ORDER BY created_at DESC LIMIT ?', [actorId(req), limit]);
        res.json({ success: true, data: { activities } });
    }
    catch (error) {
        next(error);
    }
});
const crypto = __importStar(require("crypto"));
