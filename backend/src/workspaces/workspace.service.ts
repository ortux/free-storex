import * as crypto from 'crypto';
import type { Workspace, Role } from '../lib/models';
import { workspaceRepository } from './workspace.repository';
import { userRepository } from '../users/user.repository';
import { can, isAtLeast } from '../rbac/permissions';

export class WorkspaceConflictError extends Error {
  constructor(msg: string) { super(msg); this.name = 'WorkspaceConflictError'; }
}
export class WorkspaceForbiddenError extends Error {
  constructor(msg: string) { super(msg); this.name = 'WorkspaceForbiddenError'; }
}
export class WorkspaceNotFoundError extends Error {
  constructor(msg: string) { super(msg); this.name = 'WorkspaceNotFoundError'; }
}

function generateSlug(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 40);
  return `${base}-${crypto.randomBytes(3).toString('hex')}`;
}

export class WorkspaceService {
  async create(ownerId: string, data: { name: string; description?: string }): Promise<Workspace> {
    const workspace = await workspaceRepository.create({
      name:        data.name.trim(),
      slug:        generateSlug(data.name),
      description: data.description,
      ownerId,
    });
    await workspaceRepository.addMember({ workspaceId: workspace.id, userId: ownerId, role: 'OWNER' });
    return workspace;
  }

  async getById(id: string): Promise<Workspace | null> {
    return workspaceRepository.findById(id);
  }

  async listForUser(userId: string) {
    return workspaceRepository.listByMember(userId);
  }

  async update(
    actorId: string,
    workspaceId: string,
    data: { name?: string; description?: string }
  ): Promise<Workspace> {
    const membership = await workspaceRepository.getMember(workspaceId, actorId);
    if (!membership) throw new WorkspaceForbiddenError('Not a workspace member');
    if (!can(membership.role, 'workspace:update')) {
      throw new WorkspaceForbiddenError('Insufficient permissions to update workspace');
    }
    const updateData: Parameters<typeof workspaceRepository.update>[1] = {};
    if (data.name)                updateData.name        = data.name.trim();
    if (data.description !== undefined) updateData.description = data.description;
    return workspaceRepository.update(workspaceId, updateData);
  }

  async delete(actorId: string, workspaceId: string): Promise<void> {
    const membership = await workspaceRepository.getMember(workspaceId, actorId);
    if (!membership) throw new WorkspaceForbiddenError('Not a workspace member');
    if (!can(membership.role, 'workspace:delete')) {
      throw new WorkspaceForbiddenError('Only the workspace owner can delete the workspace');
    }
    await workspaceRepository.delete(workspaceId);
  }

  async listMembers(workspaceId: string) {
    return workspaceRepository.listMembers(workspaceId);
  }

  async inviteMember(actorId: string, workspaceId: string, inviteeId: string, role: Role) {
    const actorMembership = await workspaceRepository.getMember(workspaceId, actorId);
    if (!actorMembership) throw new WorkspaceForbiddenError('Not a workspace member');
    if (!can(actorMembership.role, 'member:invite')) {
      throw new WorkspaceForbiddenError('Insufficient permissions to invite members');
    }
    if (!isAtLeast(actorMembership.role, role)) {
      throw new WorkspaceForbiddenError(`Cannot grant role ${role} — it exceeds your own role`);
    }
    const invitee = await userRepository.findById(inviteeId);
    if (!invitee) throw new WorkspaceNotFoundError('User not found');
    const existing = await workspaceRepository.getMember(workspaceId, inviteeId);
    if (existing) throw new WorkspaceConflictError('User is already a workspace member');
    return workspaceRepository.addMember({ workspaceId, userId: inviteeId, role, invitedById: actorId });
  }

  async updateMemberRole(actorId: string, workspaceId: string, targetUserId: string, newRole: Role) {
    const actorMembership = await workspaceRepository.getMember(workspaceId, actorId);
    if (!actorMembership) throw new WorkspaceForbiddenError('Not a workspace member');
    if (!can(actorMembership.role, 'member:update_role')) {
      throw new WorkspaceForbiddenError('Insufficient permissions to update member roles');
    }
    const targetMembership = await workspaceRepository.getMember(workspaceId, targetUserId);
    if (!targetMembership) throw new WorkspaceNotFoundError('Member not found');
    if (targetMembership.role === 'OWNER') throw new WorkspaceForbiddenError('Cannot change the workspace owner role');
    if (!isAtLeast(actorMembership.role, newRole)) {
      throw new WorkspaceForbiddenError(`Cannot grant role ${newRole} — it exceeds your own role`);
    }
    return workspaceRepository.updateMemberRole(workspaceId, targetUserId, newRole);
  }

  async removeMember(actorId: string, workspaceId: string, targetUserId: string): Promise<void> {
    if (actorId !== targetUserId) {
      const actorMembership = await workspaceRepository.getMember(workspaceId, actorId);
      if (!actorMembership) throw new WorkspaceForbiddenError('Not a workspace member');
      if (!can(actorMembership.role, 'member:remove')) {
        throw new WorkspaceForbiddenError('Insufficient permissions to remove members');
      }
    }
    const targetMembership = await workspaceRepository.getMember(workspaceId, targetUserId);
    if (!targetMembership) throw new WorkspaceNotFoundError('Member not found');
    if (targetMembership.role === 'OWNER') throw new WorkspaceForbiddenError('Cannot remove the workspace owner');
    await workspaceRepository.removeMember(workspaceId, targetUserId);
  }

  async findUserByUsername(githubUsername: string): Promise<{ id: string } | null> {
    return userRepository.findByUsername(githubUsername);
  }
}

export const workspaceService = new WorkspaceService();
