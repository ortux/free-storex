"use strict";
/**
 * RBAC Middleware
 *
 * requireWorkspaceRole(permission) — gate a route by workspace membership + permission.
 * Reads workspaceId from req.params.workspaceId or req.body.workspaceId.
 *
 * requireFileOwner — ensure the requesting user owns the file (not just has access).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireWorkspacePermission = requireWorkspacePermission;
exports.requireWorkspaceOwner = requireWorkspaceOwner;
const workspace_repository_1 = require("../workspaces/workspace.repository");
const permissions_1 = require("./permissions");
function getActorId(req) {
    return req.session?.userId ?? req.apiKeyUserId;
}
/**
 * Require the actor to be a workspace member with the given permission.
 * workspaceId is read from req.params.workspaceId.
 */
function requireWorkspacePermission(permission) {
    return async (req, res, next) => {
        const actorId = getActorId(req);
        if (!actorId) {
            res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
            return;
        }
        const workspaceId = req.params.workspaceId ?? req.body.workspaceId;
        if (!workspaceId) {
            res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'workspaceId required' } });
            return;
        }
        const membership = await workspace_repository_1.workspaceRepository.getMember(workspaceId, actorId);
        if (!membership) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Not a workspace member' } });
            return;
        }
        if (!(0, permissions_1.can)(membership.role, permission)) {
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
function requireWorkspaceOwner(req, res, next) {
    if (!req.workspaceMembership || req.workspaceMembership.role !== 'OWNER') {
        res.status(403).json({
            success: false,
            error: { code: 'FORBIDDEN', message: 'Only the workspace owner can perform this action' },
        });
        return;
    }
    next();
}
