"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const rate_limit_middleware_1 = require("../middleware/rate-limit.middleware");
const rbac_middleware_1 = require("../rbac/rbac.middleware");
const workspace_service_1 = require("./workspace.service");
const permissions_1 = require("../rbac/permissions");
const router = (0, express_1.Router)();
function actorId(req) {
    return req.session?.userId ?? req.apiKeyUserId;
}
function handleError(err, res, next) {
    if (err instanceof workspace_service_1.WorkspaceForbiddenError) {
        return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: err.message } });
    }
    if (err instanceof workspace_service_1.WorkspaceNotFoundError) {
        return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: err.message } });
    }
    if (err instanceof workspace_service_1.WorkspaceConflictError) {
        return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: err.message } });
    }
    next(err);
}
// ── Workspace CRUD ────────────────────────────────────────────────────────────
// GET /api/v1/workspaces
router.get('/', auth_middleware_1.requireAuth, rate_limit_middleware_1.authRateLimit, async (req, res, next) => {
    try {
        const workspaces = await workspace_service_1.workspaceService.listForUser(actorId(req));
        res.json({ success: true, data: workspaces });
    }
    catch (err) {
        next(err);
    }
});
// POST /api/v1/workspaces
router.post('/', auth_middleware_1.requireAuth, rate_limit_middleware_1.authRateLimit, async (req, res, next) => {
    try {
        const { name, description } = req.body;
        if (!name?.trim()) {
            return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'name is required' } });
        }
        const workspace = await workspace_service_1.workspaceService.create(actorId(req), { name, description });
        res.status(201).json({ success: true, data: workspace });
    }
    catch (err) {
        handleError(err, res, next);
    }
});
// GET /api/v1/workspaces/:workspaceId
router.get('/:workspaceId', auth_middleware_1.requireAuth, (0, rbac_middleware_1.requireWorkspacePermission)('file:read'), async (req, res, next) => {
    try {
        const ws = await workspace_service_1.workspaceService.getById(req.params.workspaceId);
        if (!ws)
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Workspace not found' } });
        const safeWs = {
            id: ws.id, name: ws.name, slug: ws.slug,
            description: ws.description,
            role: req.workspaceMembership?.role,
            permissions: req.workspaceMembership ? (0, permissions_1.can)(req.workspaceMembership.role, 'workspace:update') : false,
            createdAt: ws.createdAt,
        };
        res.json({ success: true, data: safeWs });
    }
    catch (err) {
        next(err);
    }
});
// PATCH /api/v1/workspaces/:workspaceId
router.patch('/:workspaceId', auth_middleware_1.requireAuth, (0, rbac_middleware_1.requireWorkspacePermission)('workspace:update'), async (req, res, next) => {
    try {
        const body = req.body;
        const updated = await workspace_service_1.workspaceService.update(actorId(req), req.params.workspaceId, {
            name: body.name,
            description: body.description,
        });
        res.json({ success: true, data: { id: updated.id, name: updated.name } });
    }
    catch (err) {
        handleError(err, res, next);
    }
});
// DELETE /api/v1/workspaces/:workspaceId
router.delete('/:workspaceId', auth_middleware_1.requireAuth, (0, rbac_middleware_1.requireWorkspacePermission)('workspace:delete'), async (req, res, next) => {
    try {
        await workspace_service_1.workspaceService.delete(actorId(req), req.params.workspaceId);
        res.json({ success: true });
    }
    catch (err) {
        handleError(err, res, next);
    }
});
// ── Members ───────────────────────────────────────────────────────────────────
// GET /api/v1/workspaces/:workspaceId/members
router.get('/:workspaceId/members', auth_middleware_1.requireAuth, (0, rbac_middleware_1.requireWorkspacePermission)('member:view'), async (req, res, next) => {
    try {
        const members = await workspace_service_1.workspaceService.listMembers(req.params.workspaceId);
        res.json({ success: true, data: members.map((m) => ({
                id: m.id, role: m.role, createdAt: m.createdAt,
                user: m.user,
            })) });
    }
    catch (err) {
        next(err);
    }
});
// POST /api/v1/workspaces/:workspaceId/members — invite by githubUsername or userId
router.post('/:workspaceId/members', auth_middleware_1.requireAuth, (0, rbac_middleware_1.requireWorkspacePermission)('member:invite'), async (req, res, next) => {
    try {
        const { githubUsername, userId, role } = req.body;
        if (!role || !['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'].includes(role)) {
            return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Valid role required: OWNER | ADMIN | MEMBER | VIEWER' } });
        }
        let inviteeId = userId;
        if (!inviteeId && githubUsername) {
            const found = await workspace_service_1.workspaceService.findUserByUsername(githubUsername);
            if (!found)
                return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `User @${githubUsername} not found` } });
            inviteeId = found.id;
        }
        if (!inviteeId) {
            return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'githubUsername or userId required' } });
        }
        const member = await workspace_service_1.workspaceService.inviteMember(actorId(req), req.params.workspaceId, inviteeId, role);
        res.status(201).json({ success: true, data: member });
    }
    catch (err) {
        handleError(err, res, next);
    }
});
// PATCH /api/v1/workspaces/:workspaceId/members/:userId — update role
router.patch('/:workspaceId/members/:userId', auth_middleware_1.requireAuth, (0, rbac_middleware_1.requireWorkspacePermission)('member:update_role'), async (req, res, next) => {
    try {
        const { role } = req.body;
        if (!role)
            return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'role required' } });
        const updated = await workspace_service_1.workspaceService.updateMemberRole(actorId(req), req.params.workspaceId, req.params.userId, role);
        res.json({ success: true, data: updated });
    }
    catch (err) {
        handleError(err, res, next);
    }
});
// DELETE /api/v1/workspaces/:workspaceId/members/:userId — remove member
router.delete('/:workspaceId/members/:userId', auth_middleware_1.requireAuth, (0, rbac_middleware_1.requireWorkspacePermission)('member:remove'), async (req, res, next) => {
    try {
        await workspace_service_1.workspaceService.removeMember(actorId(req), req.params.workspaceId, req.params.userId);
        res.json({ success: true });
    }
    catch (err) {
        handleError(err, res, next);
    }
});
// DELETE /api/v1/workspaces/:workspaceId/members/me — leave workspace
router.delete('/:workspaceId/members/me', auth_middleware_1.requireAuth, async (req, res, next) => {
    try {
        await workspace_service_1.workspaceService.removeMember(actorId(req), req.params.workspaceId, actorId(req));
        res.json({ success: true });
    }
    catch (err) {
        handleError(err, res, next);
    }
});
exports.default = router;
