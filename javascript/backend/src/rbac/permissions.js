"use strict";
/**
 * RBAC Permissions
 *
 * Role hierarchy (highest → lowest): OWNER > ADMIN > MEMBER > VIEWER
 *
 * Modeled after AWS IAM / GCP IAM / Azure RBAC:
 *   - Roles are assigned per workspace membership
 *   - Permissions are additive (higher roles include all lower permissions)
 *   - Resource-level checks happen in services, not just middleware
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.can = can;
exports.getPermissions = getPermissions;
exports.isAtLeast = isAtLeast;
exports.rolesWithPermission = rolesWithPermission;
/** Permissions granted to each role (cumulative — each role has its own set) */
const ROLE_PERMISSIONS = {
    OWNER: [
        'file:read',
        'file:write',
        'file:delete',
        'file:share',
        'member:invite',
        'member:remove',
        'member:update_role',
        'member:view',
        'workspace:update',
        'workspace:delete',
        'workspace:manage_storage',
    ],
    ADMIN: [
        'file:read',
        'file:write',
        'file:delete',
        'file:share',
        'member:invite',
        'member:remove',
        'member:update_role',
        'member:view',
        'workspace:update',
        'workspace:manage_storage',
    ],
    MEMBER: [
        'file:read',
        'file:write',
        'file:share',
        'member:view',
    ],
    VIEWER: [
        'file:read',
        'member:view',
    ],
};
/** Check if a role has a specific permission */
function can(role, permission) {
    return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
/** Get all permissions for a role */
function getPermissions(role) {
    return ROLE_PERMISSIONS[role] ?? [];
}
/** Role hierarchy rank — higher number = more privilege */
const ROLE_RANK = {
    OWNER: 4,
    ADMIN: 3,
    MEMBER: 2,
    VIEWER: 1,
};
/** Check if roleA is at least as privileged as roleB */
function isAtLeast(roleA, roleB) {
    return ROLE_RANK[roleA] >= ROLE_RANK[roleB];
}
/** Return all roles that have a specific permission */
function rolesWithPermission(permission) {
    return Object.keys(ROLE_PERMISSIONS).filter((r) => ROLE_PERMISSIONS[r].includes(permission));
}
