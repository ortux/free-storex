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
exports.workspaceService = exports.WorkspaceService = exports.WorkspaceNotFoundError = exports.WorkspaceForbiddenError = exports.WorkspaceConflictError = void 0;
const crypto = __importStar(require("crypto"));
const workspace_repository_1 = require("./workspace.repository");
const user_repository_1 = require("../users/user.repository");
const permissions_1 = require("../rbac/permissions");
class WorkspaceConflictError extends Error {
    constructor(msg) { super(msg); this.name = 'WorkspaceConflictError'; }
}
exports.WorkspaceConflictError = WorkspaceConflictError;
class WorkspaceForbiddenError extends Error {
    constructor(msg) { super(msg); this.name = 'WorkspaceForbiddenError'; }
}
exports.WorkspaceForbiddenError = WorkspaceForbiddenError;
class WorkspaceNotFoundError extends Error {
    constructor(msg) { super(msg); this.name = 'WorkspaceNotFoundError'; }
}
exports.WorkspaceNotFoundError = WorkspaceNotFoundError;
function generateSlug(name) {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 40);
    return `${base}-${crypto.randomBytes(3).toString('hex')}`;
}
class WorkspaceService {
    async create(ownerId, data) {
        const workspace = await workspace_repository_1.workspaceRepository.create({
            name: data.name.trim(),
            slug: generateSlug(data.name),
            description: data.description,
            ownerId,
        });
        await workspace_repository_1.workspaceRepository.addMember({ workspaceId: workspace.id, userId: ownerId, role: 'OWNER' });
        return workspace;
    }
    async getById(id) {
        return workspace_repository_1.workspaceRepository.findById(id);
    }
    async listForUser(userId) {
        return workspace_repository_1.workspaceRepository.listByMember(userId);
    }
    async update(actorId, workspaceId, data) {
        const membership = await workspace_repository_1.workspaceRepository.getMember(workspaceId, actorId);
        if (!membership)
            throw new WorkspaceForbiddenError('Not a workspace member');
        if (!(0, permissions_1.can)(membership.role, 'workspace:update')) {
            throw new WorkspaceForbiddenError('Insufficient permissions to update workspace');
        }
        const updateData = {};
        if (data.name)
            updateData.name = data.name.trim();
        if (data.description !== undefined)
            updateData.description = data.description;
        return workspace_repository_1.workspaceRepository.update(workspaceId, updateData);
    }
    async delete(actorId, workspaceId) {
        const membership = await workspace_repository_1.workspaceRepository.getMember(workspaceId, actorId);
        if (!membership)
            throw new WorkspaceForbiddenError('Not a workspace member');
        if (!(0, permissions_1.can)(membership.role, 'workspace:delete')) {
            throw new WorkspaceForbiddenError('Only the workspace owner can delete the workspace');
        }
        await workspace_repository_1.workspaceRepository.delete(workspaceId);
    }
    async listMembers(workspaceId) {
        return workspace_repository_1.workspaceRepository.listMembers(workspaceId);
    }
    async inviteMember(actorId, workspaceId, inviteeId, role) {
        const actorMembership = await workspace_repository_1.workspaceRepository.getMember(workspaceId, actorId);
        if (!actorMembership)
            throw new WorkspaceForbiddenError('Not a workspace member');
        if (!(0, permissions_1.can)(actorMembership.role, 'member:invite')) {
            throw new WorkspaceForbiddenError('Insufficient permissions to invite members');
        }
        if (!(0, permissions_1.isAtLeast)(actorMembership.role, role)) {
            throw new WorkspaceForbiddenError(`Cannot grant role ${role} — it exceeds your own role`);
        }
        const invitee = await user_repository_1.userRepository.findById(inviteeId);
        if (!invitee)
            throw new WorkspaceNotFoundError('User not found');
        const existing = await workspace_repository_1.workspaceRepository.getMember(workspaceId, inviteeId);
        if (existing)
            throw new WorkspaceConflictError('User is already a workspace member');
        return workspace_repository_1.workspaceRepository.addMember({ workspaceId, userId: inviteeId, role, invitedById: actorId });
    }
    async updateMemberRole(actorId, workspaceId, targetUserId, newRole) {
        const actorMembership = await workspace_repository_1.workspaceRepository.getMember(workspaceId, actorId);
        if (!actorMembership)
            throw new WorkspaceForbiddenError('Not a workspace member');
        if (!(0, permissions_1.can)(actorMembership.role, 'member:update_role')) {
            throw new WorkspaceForbiddenError('Insufficient permissions to update member roles');
        }
        const targetMembership = await workspace_repository_1.workspaceRepository.getMember(workspaceId, targetUserId);
        if (!targetMembership)
            throw new WorkspaceNotFoundError('Member not found');
        if (targetMembership.role === 'OWNER')
            throw new WorkspaceForbiddenError('Cannot change the workspace owner role');
        if (!(0, permissions_1.isAtLeast)(actorMembership.role, newRole)) {
            throw new WorkspaceForbiddenError(`Cannot grant role ${newRole} — it exceeds your own role`);
        }
        return workspace_repository_1.workspaceRepository.updateMemberRole(workspaceId, targetUserId, newRole);
    }
    async removeMember(actorId, workspaceId, targetUserId) {
        if (actorId !== targetUserId) {
            const actorMembership = await workspace_repository_1.workspaceRepository.getMember(workspaceId, actorId);
            if (!actorMembership)
                throw new WorkspaceForbiddenError('Not a workspace member');
            if (!(0, permissions_1.can)(actorMembership.role, 'member:remove')) {
                throw new WorkspaceForbiddenError('Insufficient permissions to remove members');
            }
        }
        const targetMembership = await workspace_repository_1.workspaceRepository.getMember(workspaceId, targetUserId);
        if (!targetMembership)
            throw new WorkspaceNotFoundError('Member not found');
        if (targetMembership.role === 'OWNER')
            throw new WorkspaceForbiddenError('Cannot remove the workspace owner');
        await workspace_repository_1.workspaceRepository.removeMember(workspaceId, targetUserId);
    }
    async findUserByUsername(githubUsername) {
        return user_repository_1.userRepository.findByUsername(githubUsername);
    }
}
exports.WorkspaceService = WorkspaceService;
exports.workspaceService = new WorkspaceService();
