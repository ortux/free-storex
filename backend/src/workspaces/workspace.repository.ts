import * as crypto from 'crypto';
import { execute, query } from '../lib/db';
import type { Role, Workspace, WorkspaceMember } from '../lib/models';

const WORKSPACE_COLS = `id, name, slug, description, owner_id AS ownerId, created_at AS createdAt, updated_at AS updatedAt`;
const MEMBER_COLS = `id, workspace_id AS workspaceId, user_id AS userId, role, invited_by_id AS invitedById, created_at AS createdAt, updated_at AS updatedAt`;

export class WorkspaceRepository {
  async create(data: { name: string; slug: string; description?: string; ownerId: string }): Promise<Workspace> {
    const id = crypto.randomUUID();
    await execute('INSERT INTO workspaces (id,name,slug,description,owner_id) VALUES (?,?,?,?,?)', [id, data.name, data.slug, data.description ?? null, data.ownerId]);
    return (await this.findById(id))!;
  }
  async findById(id: string): Promise<Workspace | null> {
    const rows = await query<Workspace[]>(`SELECT ${WORKSPACE_COLS} FROM workspaces WHERE id = ? LIMIT 1`, [id]); return rows[0] ?? null;
  }
  async findBySlug(slug: string): Promise<Workspace | null> {
    const rows = await query<Workspace[]>(`SELECT ${WORKSPACE_COLS} FROM workspaces WHERE slug = ? LIMIT 1`, [slug]); return rows[0] ?? null;
  }
  async listByMember(userId: string): Promise<Array<Workspace & { role: Role }>> {
    return query<Array<Workspace & { role: Role }>>(
      `SELECT w.id,w.name,w.slug,w.description,w.owner_id AS ownerId,w.created_at AS createdAt,w.updated_at AS updatedAt,m.role
       FROM workspace_members m JOIN workspaces w ON w.id=m.workspace_id WHERE m.user_id=? ORDER BY m.created_at ASC`, [userId]);
  }
  async update(id: string, data: Partial<{ name: string; description: string }>): Promise<Workspace> {
    const sets: string[] = []; const values: unknown[] = [];
    if (data.name !== undefined) { sets.push('name=?'); values.push(data.name); }
    if (data.description !== undefined) { sets.push('description=?'); values.push(data.description); }
    if (sets.length) await execute(`UPDATE workspaces SET ${sets.join(',')} WHERE id=?`, [...values, id]);
    const result = await this.findById(id); if (!result) throw new Error('Workspace not found'); return result;
  }
  async delete(id: string): Promise<void> { await execute('DELETE FROM workspaces WHERE id=?', [id]); }
  async addMember(data: { workspaceId: string; userId: string; role: Role; invitedById?: string }): Promise<WorkspaceMember> {
    const id = crypto.randomUUID();
    await execute('INSERT INTO workspace_members (id,workspace_id,user_id,role,invited_by_id) VALUES (?,?,?,?,?)', [id, data.workspaceId, data.userId, data.role, data.invitedById ?? null]);
    return (await this.getMember(data.workspaceId, data.userId))!;
  }
  async getMember(workspaceId: string, userId: string): Promise<WorkspaceMember | null> {
    const rows = await query<WorkspaceMember[]>(`SELECT ${MEMBER_COLS} FROM workspace_members WHERE workspace_id=? AND user_id=? LIMIT 1`, [workspaceId, userId]); return rows[0] ?? null;
  }
  async listMembers(workspaceId: string): Promise<Array<WorkspaceMember & { user: { id: string; githubUsername: string; email: string | null } }>> {
    const rows = await query<Array<WorkspaceMember & { joinedUserId: string; githubUsername: string; email: string | null }>>(
      `SELECT m.id,m.workspace_id AS workspaceId,m.user_id AS userId,m.role,m.invited_by_id AS invitedById,m.created_at AS createdAt,m.updated_at AS updatedAt,
       u.id AS joinedUserId,u.github_username AS githubUsername,u.email
       FROM workspace_members m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=? ORDER BY m.created_at ASC`, [workspaceId]
    );
    return rows.map(({ joinedUserId, githubUsername, email, ...member }) => ({ ...member, user: { id: joinedUserId, githubUsername, email } }));
  }
  async updateMemberRole(workspaceId: string, userId: string, role: Role): Promise<WorkspaceMember> {
    await execute('UPDATE workspace_members SET role=? WHERE workspace_id=? AND user_id=?', [role, workspaceId, userId]);
    const member = await this.getMember(workspaceId, userId); if (!member) throw new Error('Workspace member not found'); return member;
  }
  async removeMember(workspaceId: string, userId: string): Promise<void> { await execute('DELETE FROM workspace_members WHERE workspace_id=? AND user_id=?', [workspaceId, userId]); }
}

export const workspaceRepository = new WorkspaceRepository();
