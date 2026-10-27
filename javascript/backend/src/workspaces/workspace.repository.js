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
exports.workspaceRepository = exports.WorkspaceRepository = void 0;
const crypto = __importStar(require("crypto"));
const db_1 = require("../lib/db");
const WORKSPACE_COLS = `id, name, slug, description, owner_id AS ownerId, created_at AS createdAt, updated_at AS updatedAt`;
const MEMBER_COLS = `id, workspace_id AS workspaceId, user_id AS userId, role, invited_by_id AS invitedById, created_at AS createdAt, updated_at AS updatedAt`;
class WorkspaceRepository {
    async create(data) {
        const id = crypto.randomUUID();
        await (0, db_1.execute)('INSERT INTO workspaces (id,name,slug,description,owner_id) VALUES (?,?,?,?,?)', [id, data.name, data.slug, data.description ?? null, data.ownerId]);
        return (await this.findById(id));
    }
    async findById(id) {
        const rows = await (0, db_1.query)(`SELECT ${WORKSPACE_COLS} FROM workspaces WHERE id = ? LIMIT 1`, [id]);
        return rows[0] ?? null;
    }
    async findBySlug(slug) {
        const rows = await (0, db_1.query)(`SELECT ${WORKSPACE_COLS} FROM workspaces WHERE slug = ? LIMIT 1`, [slug]);
        return rows[0] ?? null;
    }
    async listByMember(userId) {
        return (0, db_1.query)(`SELECT w.id,w.name,w.slug,w.description,w.owner_id AS ownerId,w.created_at AS createdAt,w.updated_at AS updatedAt,m.role
       FROM workspace_members m JOIN workspaces w ON w.id=m.workspace_id WHERE m.user_id=? ORDER BY m.created_at ASC`, [userId]);
    }
    async update(id, data) {
        const sets = [];
        const values = [];
        if (data.name !== undefined) {
            sets.push('name=?');
            values.push(data.name);
        }
        if (data.description !== undefined) {
            sets.push('description=?');
            values.push(data.description);
        }
        if (sets.length)
            await (0, db_1.execute)(`UPDATE workspaces SET ${sets.join(',')} WHERE id=?`, [...values, id]);
        const result = await this.findById(id);
        if (!result)
            throw new Error('Workspace not found');
        return result;
    }
    async delete(id) { await (0, db_1.execute)('DELETE FROM workspaces WHERE id=?', [id]); }
    async addMember(data) {
        const id = crypto.randomUUID();
        await (0, db_1.execute)('INSERT INTO workspace_members (id,workspace_id,user_id,role,invited_by_id) VALUES (?,?,?,?,?)', [id, data.workspaceId, data.userId, data.role, data.invitedById ?? null]);
        return (await this.getMember(data.workspaceId, data.userId));
    }
    async getMember(workspaceId, userId) {
        const rows = await (0, db_1.query)(`SELECT ${MEMBER_COLS} FROM workspace_members WHERE workspace_id=? AND user_id=? LIMIT 1`, [workspaceId, userId]);
        return rows[0] ?? null;
    }
    async listMembers(workspaceId) {
        const rows = await (0, db_1.query)(`SELECT m.id,m.workspace_id AS workspaceId,m.user_id AS userId,m.role,m.invited_by_id AS invitedById,m.created_at AS createdAt,m.updated_at AS updatedAt,
       u.id AS joinedUserId,u.github_username AS githubUsername,u.email
       FROM workspace_members m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=? ORDER BY m.created_at ASC`, [workspaceId]);
        return rows.map(({ joinedUserId, githubUsername, email, ...member }) => ({ ...member, user: { id: joinedUserId, githubUsername, email } }));
    }
    async updateMemberRole(workspaceId, userId, role) {
        await (0, db_1.execute)('UPDATE workspace_members SET role=? WHERE workspace_id=? AND user_id=?', [role, workspaceId, userId]);
        const member = await this.getMember(workspaceId, userId);
        if (!member)
            throw new Error('Workspace member not found');
        return member;
    }
    async removeMember(workspaceId, userId) { await (0, db_1.execute)('DELETE FROM workspace_members WHERE workspace_id=? AND user_id=?', [workspaceId, userId]); }
}
exports.WorkspaceRepository = WorkspaceRepository;
exports.workspaceRepository = new WorkspaceRepository();
