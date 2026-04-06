'use client';
import { PERMISSIONS, hasAccess, Role } from '@/lib/permissions';
import Link from 'next/link';

export default function Sidebar({ userRole }: { userRole: Role }) {
  const menuItems = [
    { name: 'Overview', href: '/', roles: ['SUPER_DEV', 'NOC', 'AKTIVATOR', 'ADMIN', 'CS'] },
    { name: 'Data Client', href: '/clients', roles: ['SUPER_DEV', 'NOC', 'AKTIVATOR', 'ADMIN', 'CS'] },
    { name: 'Data Interkoneksi', href: '/interkoneksi', roles: ['SUPER_DEV', 'NOC', 'AKTIVATOR', 'ADMIN', 'CS'] },
    { name: 'Work Orders', href: '/work-orders', roles: ['SUPER_DEV', 'NOC', 'AKTIVATOR', 'ADMIN', 'CS'] },
    { name: 'VLAN Master', href: '/vlan', roles: ['SUPER_DEV', 'NOC', 'AKTIVATOR', 'ADMIN', 'CS'] },
    { name: 'Broadcast', href: '/broadcast', roles: PERMISSIONS.BROADCAST_ACCESS }, // Hidden for NOC/AKT/CS
    { name: 'Manage Users', href: '/manage-users', roles: PERMISSIONS.MANAGE_USERS }, // Only SUPER_DEV
  ];

  return (
    <aside className="w-64 bg-slate-900 text-white h-screen p-4">
      <nav className="space-y-2">
        {menuItems.map((item) => (
          hasAccess(userRole, item.roles) && (
            <Link key={item.href} href={item.href} className="block p-3 hover:bg-slate-800 rounded-lg">
              {item.name}
            </Link>
          )
        ))}
      </nav>
    </aside>
  );
}