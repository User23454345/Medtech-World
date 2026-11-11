/**
 * Rollen & Berechtigungen (RBAC).
 *
 * Gäste können alle freigegebenen Inhalte lesen und suchen. Ein Konto wird
 * nur für persönliche Funktionen (Favoriten, Fortschritt, Notizen) benötigt.
 */
export const ROLES = ['learner', 'technician', 'editor', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  learner: 'Lernende/r',
  technician: 'Techniker/in',
  editor: 'Redaktion',
  admin: 'Administration',
};

export const PERMISSIONS = [
  'content:read',
  'content:read-drafts',
  'quality:read',
  'user:self',
  'market:inquire',
  'copilot:use',
  'users:manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const BASE: Permission[] = ['content:read', 'user:self', 'copilot:use', 'market:inquire'];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  learner: BASE,
  technician: BASE,
  editor: [...BASE, 'content:read-drafts', 'quality:read'],
  admin: [...BASE, 'content:read-drafts', 'quality:read', 'users:manage'],
};

/** Berechtigungen für nicht angemeldete Besucher */
export const GUEST_PERMISSIONS: readonly Permission[] = ['content:read', 'copilot:use'];

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return GUEST_PERMISSIONS.includes(permission);
  return ROLE_PERMISSIONS[role].includes(permission);
}
