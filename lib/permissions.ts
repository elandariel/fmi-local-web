export type Role = 'SUPER_DEV' | 'NOC' | 'AKTIVATOR' | 'ADMIN' | 'CS';

export const PERMISSIONS = {
  // 1. OVERVIEW
  OVERVIEW_ACTION: ['SUPER_DEV', 'AKTIVATOR'], 

  // 2. DATA CLIENT
  CLIENT_ADD: ['SUPER_DEV', 'NOC', 'AKTIVATOR', 'ADMIN'],
  CLIENT_EDIT_DELETE: ['SUPER_DEV', 'ADMIN', 'AKTIVATOR', ],

  // 3. WORK ORDERS
  WO_CREATE: ['SUPER_DEV', 'AKTIVATOR'],
  WO_VIEW_DETAILS: ['SUPER_DEV', 'NOC', 'AKTIVATOR', 'ADMIN', 'CS'],

  // 4. TRACKER
  TRACKER_INPUT: ['SUPER_DEV', 'AKTIVATOR'], 

  // 5. VLAN MASTER
  VLAN_EDIT_DELETE: ['SUPER_DEV', 'NOC', 'AKTIVATOR'], 

  // 6. TOOLS & UTILITIES
  TOOLS_IP_CALC: ['SUPER_DEV', 'NOC', 'AKTIVATOR', 'ADMIN', 'CS'],
  TOOLS_REPORT_GEN: ['SUPER_DEV', 'NOC', 'AKTIVATOR', 'ADMIN', 'CS'],
  TOOLS_WO_DISTRIBUTOR_VIEW: ['SUPER_DEV', 'AKTIVATOR', 'ADMIN'], 
  TOOLS_WO_DISTRIBUTOR_ACTION: ['SUPER_DEV', 'ADMIN'], 

  // 7. BROADCAST
  BROADCAST_ACCESS: ['SUPER_DEV', 'ADMIN'],

  // 8. ADMIN TAB (MANAGE USERS)
  MANAGE_USERS: ['SUPER_DEV']
};

export function hasAccess(userRole: Role | undefined | null, allowedRoles: string[] | undefined) {
  // 1. PENGAMAN (FIX ERROR): Jika allowedRoles kosong/undefined, anggap tidak punya akses (return false)
  // Ini yang bikin error "reading 'includes'" hilang
  if (!allowedRoles) return false;

  // 2. Jika userRole kosong, tolak
  if (!userRole) return false;

  // 3. Super Dev akses segalanya
  if (userRole === 'SUPER_DEV') return true;

  // 4. Cek apakah role ada di daftar
  return allowedRoles.includes(userRole);
}