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

import type { Role } from '../lib/models';

export type Permission =
  | 'file:read'
  | 'file:write'
  | 'file:delete'
  | 'file:share'
  | 'member:invite'
  | 'member:remove'
  | 'member:update_role'
  | 'member:view'
  | 'workspace:update'
  | 'workspace:delete'
  | 'workspace:manage_storage';

/** Permissions granted to each role (cumulative — each role has its own set) */
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
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
export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** Get all permissions for a role */
export function getPermissions(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

/** Role hierarchy rank — higher number = more privilege */
const ROLE_RANK: Record<Role, number> = {
  OWNER: 4,
  ADMIN: 3,
  MEMBER: 2,
  VIEWER: 1,
};

/** Check if roleA is at least as privileged as roleB */
export function isAtLeast(roleA: Role, roleB: Role): boolean {
  return ROLE_RANK[roleA] >= ROLE_RANK[roleB];
}

/** Return all roles that have a specific permission */
export function rolesWithPermission(permission: Permission): Role[] {
  return (Object.keys(ROLE_PERMISSIONS) as Role[]).filter((r) =>
    ROLE_PERMISSIONS[r].includes(permission)
  );
}
