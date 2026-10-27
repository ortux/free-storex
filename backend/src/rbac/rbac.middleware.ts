/**
 * RBAC Middleware
 *
 * requireWorkspaceRole(permission) — gate a route by workspace membership + permission.
 * Reads workspaceId from req.params.workspaceId or req.body.workspaceId.
 *
 * requireFileOwner — ensure the requesting user owns the file (not just has access).
 */

import type { Request, Response, NextFunction } from 'express';
import { workspaceRepository } from '../workspaces/workspace.repository';
import { can, type Permission } from './permissions';

function getActorId(req: Request): string | undefined {
  return req.session?.userId ?? req.apiKeyUserId;
}

/**
 * Require the actor to be a workspace member with the given permission.
 * workspaceId is read from req.params.workspaceId.
 */
export function requireWorkspacePermission(permission: Permission) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const actorId = getActorId(req);
    if (!actorId) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      return;
    }

    const workspaceId = req.params.workspaceId ?? (req.body as Record<string, string>).workspaceId;
    if (!workspaceId) {
      res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'workspaceId required' } });
      return;
    }

    const membership = await workspaceRepository.getMember(workspaceId, actorId);

    if (!membership) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Not a workspace member' } });
      return;
    }

    if (!can(membership.role, permission)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: `Role ${membership.role} does not have permission: ${permission}`,
        },
      });
      return;
    }

    // Attach membership info for downstream use
    req.workspaceMembership = membership;
    next();
  };
}

/**
 * Require the actor to be the workspace OWNER.
 */
export function requireWorkspaceOwner(req: Request, res: Response, next: NextFunction): void {
  if (!req.workspaceMembership || req.workspaceMembership.role !== 'OWNER') {
    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Only the workspace owner can perform this action' },
    });
    return;
  }
  next();
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      workspaceMembership?: import('../lib/models').WorkspaceMember;
    }
  }
}
