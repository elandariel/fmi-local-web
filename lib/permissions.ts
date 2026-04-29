// lib/permissions.ts
// ─────────────────────────────────────────────────────────
// Centralized permission system for NOC FMI BizLink
// ─────────────────────────────────────────────────────────

export type Role = 'SUPER_DEV' | 'NOC' | 'AKTIVATOR' | 'ADMIN' | 'CS';

// ── All permission keys ──────────────────────────────────
export const ALL_PERMISSION_KEYS = [
  // Dashboard
  'dashboard.view',
  'dashboard.sync_sheet',
  'dashboard.create_wo',
  'dashboard.approve_ignored',
  // Monthly Report (Work Orders)
  'monthly_report.view',
  'monthly_report.create',
  'monthly_report.edit',
  'monthly_report.approve_edit',
  // Weekly Report (Tracker)
  'weekly_report.view',
  'weekly_report.create',
  'weekly_report.edit',
  // Backbone Report NOC
  'backbone.view',
  'backbone.approve_kode',
  // Data Client
  'data_client.view',
  'data_client.add',
  'data_client.edit_delete',
  // Data Interkoneksi
  'interkoneksi.view',
  'interkoneksi.add',
  'interkoneksi.edit_delete',
  // VLAN Database
  'vlan.view',
  'vlan.add',
  'vlan.edit_delete',
  // Activity Logs
  'logs.view',
  // Tools & Utilities
  'tools.view',
  'tools.ip_calc',
  'tools.report_gen',
  'tools.wo_distributor_view',
  'tools.wo_distributor_action',
  // Broadcast
  'broadcast.menu',
  'broadcast.view',
  'broadcast.create',
  'broadcast.delete',
  // Team Management
  'team.menu',
  // Role Management
  'roles.manage',
] as const;

export type PermissionKey = (typeof ALL_PERMISSION_KEYS)[number];

// ── Permission groups for UI display ────────────────────
export const PERMISSION_GROUPS: {
  label: string;
  keys: PermissionKey[];
  keyLabels: string[];
}[] = [
  {
    label: 'Dashboard',
    keys: ['dashboard.view', 'dashboard.sync_sheet', 'dashboard.create_wo', 'dashboard.approve_ignored'],
    keyLabels: ['Lihat', 'Sync Sheet', 'Buat WO', 'Approve Ignored Items'],
  },
  {
    label: 'Monthly Report (Aktivator)',
    keys: ['monthly_report.view', 'monthly_report.create', 'monthly_report.edit', 'monthly_report.approve_edit'],
    keyLabels: ['Lihat', 'Buat', 'Edit', 'Approve Edit WO'],
  },
  {
    label: 'Weekly Report (Tracker)',
    keys: ['weekly_report.view', 'weekly_report.create', 'weekly_report.edit'],
    keyLabels: ['Lihat', 'Buat', 'Edit'],
  },
  {
    label: 'Backbone Report NOC',
    keys: ['backbone.view', 'backbone.approve_kode'],
    keyLabels: ['Lihat', 'Approve Kode'],
  },
  {
    label: 'Data Client',
    keys: ['data_client.view', 'data_client.add', 'data_client.edit_delete'],
    keyLabels: ['Lihat', 'Tambah', 'Edit & Hapus'],
  },
  {
    label: 'Data Interkoneksi',
    keys: ['interkoneksi.view', 'interkoneksi.add', 'interkoneksi.edit_delete'],
    keyLabels: ['Lihat', 'Tambah', 'Edit & Hapus'],
  },
  {
    label: 'VLAN Database',
    keys: ['vlan.view', 'vlan.add', 'vlan.edit_delete'],
    keyLabels: ['Lihat', 'Tambah', 'Edit & Hapus'],
  },
  {
    label: 'Activity Log',
    keys: ['logs.view'],
    keyLabels: ['Lihat'],
  },
  {
    label: 'Tools & Utilities',
    keys: ['tools.view', 'tools.ip_calc', 'tools.report_gen', 'tools.wo_distributor_view', 'tools.wo_distributor_action'],
    keyLabels: ['Lihat', 'IP Calculator', 'Report Generator', 'Lihat WO Distributor', 'Aksi WO Distributor'],
  },
  {
    label: 'Broadcast Message',
    keys: ['broadcast.menu', 'broadcast.view', 'broadcast.create', 'broadcast.delete'],
    keyLabels: ['Akses Menu', 'Lihat', 'Buat', 'Hapus'],
  },
  {
    label: 'Manajemen',
    keys: ['team.menu', 'roles.manage'],
    keyLabels: ['Team Management', 'Role Management'],
  },
];

// ── Default permission matrix (code-level fallback) ──────
// SUPER_DEV always bypasses — not listed here.
// Empty array [] means SUPER_DEV only (no other role has access by default).
export const DEFAULT_MATRIX: Record<PermissionKey, Role[]> = {
  // Dashboard
  'dashboard.view':            ['NOC', 'AKTIVATOR', 'ADMIN', 'CS'],
  'dashboard.sync_sheet':      ['AKTIVATOR', 'ADMIN'],
  'dashboard.create_wo':       ['AKTIVATOR', 'ADMIN'],
  'dashboard.approve_ignored': ['ADMIN'],
  // Monthly Report
  'monthly_report.view':         ['NOC', 'AKTIVATOR', 'ADMIN', 'CS'],
  'monthly_report.create':       ['AKTIVATOR', 'ADMIN'],
  'monthly_report.edit':         ['AKTIVATOR', 'ADMIN'],
  'monthly_report.approve_edit': ['ADMIN'],
  // Weekly Report
  'weekly_report.view':   ['NOC', 'AKTIVATOR', 'ADMIN', 'CS'],
  'weekly_report.create': ['AKTIVATOR'],
  'weekly_report.edit':   ['AKTIVATOR'],
  // Backbone
  'backbone.view':         ['NOC', 'AKTIVATOR', 'ADMIN'],
  'backbone.approve_kode': [],
  // Data Client
  'data_client.view':        ['NOC', 'AKTIVATOR', 'ADMIN', 'CS'],
  'data_client.add':         ['NOC', 'AKTIVATOR', 'ADMIN'],
  'data_client.edit_delete': ['AKTIVATOR', 'ADMIN'],
  // Interkoneksi
  'interkoneksi.view':        ['NOC', 'AKTIVATOR', 'ADMIN', 'CS'],
  'interkoneksi.add':         ['NOC', 'AKTIVATOR', 'ADMIN'],
  'interkoneksi.edit_delete': ['AKTIVATOR', 'ADMIN'],
  // VLAN
  'vlan.view':        ['NOC', 'AKTIVATOR', 'ADMIN'],
  'vlan.add':         ['NOC', 'AKTIVATOR'],
  'vlan.edit_delete': ['NOC', 'AKTIVATOR'],
  // Logs
  'logs.view': ['NOC', 'AKTIVATOR', 'ADMIN'],
  // Tools
  'tools.view':                 ['NOC', 'AKTIVATOR', 'ADMIN', 'CS'],
  'tools.ip_calc':              ['NOC', 'AKTIVATOR', 'ADMIN', 'CS'],
  'tools.report_gen':           ['NOC', 'AKTIVATOR', 'ADMIN', 'CS'],
  'tools.wo_distributor_view':  ['AKTIVATOR', 'ADMIN'],
  'tools.wo_distributor_action':['ADMIN'],
  // Broadcast
  'broadcast.menu':   ['ADMIN'],
  'broadcast.view':   ['ADMIN'],
  'broadcast.create': ['ADMIN'],
  'broadcast.delete': ['ADMIN'],
  // Management
  'team.menu':    [],
  'roles.manage': [],
};

// ── Build a full boolean permission map for a given role ─
// This is used to seed the roles table in Supabase.
export function buildRolePermissions(role: Role): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const key of ALL_PERMISSION_KEYS) {
    map[key] = DEFAULT_MATRIX[key].includes(role);
  }
  return map;
}

// ── New permission check (dynamic, with overrides) ───────
// Priority: SUPER_DEV bypass → user override → role DB perms → default matrix
export function can(
  key: PermissionKey,
  role: Role | null | undefined,
  userOverrides?: Record<string, boolean> | null,
  rolePerms?: Record<string, boolean> | null,
): boolean {
  if (!role) return false;
  if (role === 'SUPER_DEV') return true;

  // 1. Per-user override (explicit grant or deny)
  if (userOverrides && key in userOverrides) return Boolean(userOverrides[key]);

  // 2. Role-level permissions from DB
  if (rolePerms && key in rolePerms) return Boolean(rolePerms[key]);

  // 3. Default matrix fallback
  return DEFAULT_MATRIX[key]?.includes(role) ?? false;
}

// ── Non-SUPER_DEV roles (for UI dropdowns / iteration) ──
export const NON_SUPER_ROLES: Role[] = ['NOC', 'AKTIVATOR', 'ADMIN', 'CS'];

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_DEV: 'Super Developer',
  NOC:       'NOC Engineer',
  AKTIVATOR: 'Aktivator',
  ADMIN:     'Administrator',
  CS:        'Customer Service',
};

export const ROLE_COLORS: Record<Role, { bg: string; text: string; border: string }> = {
  SUPER_DEV: { bg: 'rgba(168,85,247,0.15)', text: '#c084fc', border: 'rgba(168,85,247,0.3)' },
  NOC:       { bg: 'rgba(59,130,246,0.15)',  text: '#60a5fa', border: 'rgba(59,130,246,0.3)' },
  AKTIVATOR: { bg: 'rgba(16,185,129,0.15)',  text: '#34d399', border: 'rgba(16,185,129,0.3)' },
  ADMIN:     { bg: 'rgba(245,158,11,0.15)',  text: '#fbbf24', border: 'rgba(245,158,11,0.3)' },
  CS:        { bg: 'rgba(100,116,139,0.15)', text: '#94a3b8', border: 'rgba(100,116,139,0.3)' },
};

// ── Legacy API (kept for backward compatibility) ─────────
export const PERMISSIONS = {
  OVERVIEW_ACTION:              ['SUPER_DEV', 'AKTIVATOR'],
  CLIENT_ADD:                   ['SUPER_DEV', 'NOC', 'AKTIVATOR', 'ADMIN'],
  CLIENT_EDIT_DELETE:           ['SUPER_DEV', 'ADMIN', 'AKTIVATOR'],
  WO_CREATE:                    ['SUPER_DEV', 'AKTIVATOR'],
  WO_VIEW_DETAILS:              ['SUPER_DEV', 'NOC', 'AKTIVATOR', 'ADMIN', 'CS'],
  TRACKER_INPUT:                ['SUPER_DEV', 'AKTIVATOR'],
  VLAN_EDIT_DELETE:             ['SUPER_DEV', 'NOC', 'AKTIVATOR'],
  TOOLS_IP_CALC:                ['SUPER_DEV', 'NOC', 'AKTIVATOR', 'ADMIN', 'CS'],
  TOOLS_REPORT_GEN:             ['SUPER_DEV', 'NOC', 'AKTIVATOR', 'ADMIN', 'CS'],
  TOOLS_WO_DISTRIBUTOR_VIEW:    ['SUPER_DEV', 'AKTIVATOR', 'ADMIN'],
  TOOLS_WO_DISTRIBUTOR_ACTION:  ['SUPER_DEV', 'ADMIN'],
  BROADCAST_ACCESS:             ['SUPER_DEV', 'ADMIN'],
  MANAGE_USERS:                 ['SUPER_DEV'],
  MANAGE_ROLES:                 ['SUPER_DEV'],
};

export function hasAccess(
  userRole: Role | undefined | null,
  allowedRoles: string[] | undefined,
): boolean {
  if (!allowedRoles) return false;
  if (!userRole) return false;
  if (userRole === 'SUPER_DEV') return true;
  return allowedRoles.includes(userRole);
}
