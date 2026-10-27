import { Router } from 'express';
import { requireAuthOrApiKey } from '../middleware/auth.middleware';
import { authRateLimit } from '../middleware/rate-limit.middleware';
import { requireWorkspacePermission } from '../rbac/rbac.middleware';
import { workspaceService, WorkspaceConflictError, WorkspaceForbiddenError, WorkspaceNotFoundError } from './workspace.service';
import { can } from '../rbac/permissions';
import type { Role } from '../lib/models';

const router = Router();

function actorId(req: import('express').Request): string {
  return req.session?.userId ?? req.apiKeyUserId!;
}

function handleError(err: unknown, res: import('express').Response, next: import('express').NextFunction) {
  if (err instanceof WorkspaceForbiddenError) {
    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: err.message } });
  }
  if (err instanceof WorkspaceNotFoundError) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: err.message } });
  }
  if (err instanceof WorkspaceConflictError) {
    return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: err.message } });
  }
  next(err);
}

// ── Workspace CRUD ────────────────────────────────────────────────────────────

// GET /api/v1/workspaces
router.get('/', requireAuthOrApiKey, authRateLimit, async (req, res, next) => {
  try {
    const workspaces = await workspaceService.listForUser(actorId(req));
    res.json({ success: true, data: workspaces });
  } catch (err) { next(err); }
});

// POST /api/v1/workspaces
router.post('/', requireAuthOrApiKey, authRateLimit, async (req, res, next) => {
  try {
    const { name, description } = req.body as Record<string, string>;
    if (!name?.trim()) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'name is required' } });
    }
    const workspace = await workspaceService.create(actorId(req), { name, description });
    res.status(201).json({ success: true, data: workspace });
  } catch (err) { handleError(err, res, next); }
});

// GET /api/v1/workspaces/:workspaceId
router.get('/:workspaceId', requireAuthOrApiKey, requireWorkspacePermission('file:read'), async (req, res, next) => {
  try {
    const ws = await workspaceService.getById(req.params.workspaceId);
    if (!ws) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Workspace not found' } });

    const safeWs = {
      id: ws.id, name: ws.name, slug: ws.slug,
      description: ws.description,
      role: req.workspaceMembership?.role,
      permissions: req.workspaceMembership ? can(req.workspaceMembership.role, 'workspace:update') : false,
      createdAt: ws.createdAt,
    };
    res.json({ success: true, data: safeWs });
  } catch (err) { next(err); }
});

// PATCH /api/v1/workspaces/:workspaceId
router.patch('/:workspaceId', requireAuthOrApiKey, requireWorkspacePermission('workspace:update'), async (req, res, next) => {
  try {
    const body = req.body as Record<string, string>;
    const updated = await workspaceService.update(actorId(req), req.params.workspaceId, {
      name: body.name,
      description: body.description,
    });
    res.json({ success: true, data: { id: updated.id, name: updated.name } });
  } catch (err) { handleError(err, res, next); }
});

// DELETE /api/v1/workspaces/:workspaceId
router.delete('/:workspaceId', requireAuthOrApiKey, requireWorkspacePermission('workspace:delete'), async (req, res, next) => {
  try {
    await workspaceService.delete(actorId(req), req.params.workspaceId);
    res.json({ success: true });
  } catch (err) { handleError(err, res, next); }
});

// ── Members ───────────────────────────────────────────────────────────────────

// GET /api/v1/workspaces/:workspaceId/members
router.get('/:workspaceId/members', requireAuthOrApiKey, requireWorkspacePermission('member:view'), async (req, res, next) => {
  try {
    const members = await workspaceService.listMembers(req.params.workspaceId);
    res.json({ success: true, data: members.map((m) => ({
      id: m.id, role: m.role, createdAt: m.createdAt,
      user: m.user,
    })) });
  } catch (err) { next(err); }
});

// POST /api/v1/workspaces/:workspaceId/members — invite by githubUsername or userId
router.post('/:workspaceId/members', requireAuthOrApiKey, requireWorkspacePermission('member:invite'), async (req, res, next) => {
  try {
    const { githubUsername, userId, role } = req.body as Record<string, string>;
    if (!role || !['OWNER','ADMIN','MEMBER','VIEWER'].includes(role)) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Valid role required: OWNER | ADMIN | MEMBER | VIEWER' } });
    }

    let inviteeId = userId;
    if (!inviteeId && githubUsername) {
      const found = await workspaceService.findUserByUsername(githubUsername);
      if (!found) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `User @${githubUsername} not found` } });
      inviteeId = found.id;
    }
    if (!inviteeId) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'githubUsername or userId required' } });
    }

    const member = await workspaceService.inviteMember(actorId(req), req.params.workspaceId, inviteeId, role as Role);
    res.status(201).json({ success: true, data: member });
  } catch (err) { handleError(err, res, next); }
});

// PATCH /api/v1/workspaces/:workspaceId/members/:userId — update role
router.patch('/:workspaceId/members/:userId', requireAuthOrApiKey, requireWorkspacePermission('member:update_role'), async (req, res, next) => {
  try {
    const { role } = req.body as { role: Role };
    if (!role) return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'role required' } });
    const updated = await workspaceService.updateMemberRole(actorId(req), req.params.workspaceId, req.params.userId, role);
    res.json({ success: true, data: updated });
  } catch (err) { handleError(err, res, next); }
});

// DELETE /api/v1/workspaces/:workspaceId/members/:userId — remove member
router.delete('/:workspaceId/members/:userId', requireAuthOrApiKey, requireWorkspacePermission('member:remove'), async (req, res, next) => {
  try {
    await workspaceService.removeMember(actorId(req), req.params.workspaceId, req.params.userId);
    res.json({ success: true });
  } catch (err) { handleError(err, res, next); }
});

// DELETE /api/v1/workspaces/:workspaceId/members/me — leave workspace
router.delete('/:workspaceId/members/me', requireAuthOrApiKey, async (req, res, next) => {
  try {
    await workspaceService.removeMember(actorId(req), req.params.workspaceId, actorId(req));
    res.json({ success: true });
  } catch (err) { handleError(err, res, next); }
});

export default router;
