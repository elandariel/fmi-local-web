'use client';

import './globals.css';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import Header from '@/components/Header';
import { hasAccess, PERMISSIONS, Role, can, PermissionKey } from '@/lib/permissions';
import {
  LayoutDashboard, Users, Activity, LineChart, Server,
  History, Menu, LogOut, ClipboardList, Wrench, Megaphone,
  ShieldCheck, ShieldAlert, X, ChevronRight, Network, Sliders
} from 'lucide-react';

import GlobalBroadcast from '@/components/GlobalBroadcast';
import BroadcastTicker from '@/components/BroadcastTicker';
import { Toaster } from 'sonner';

// ─────────────────────────────────────────────
// SIDEBAR ITEM
// ─────────────────────────────────────────────
function SidebarItem({
  href, icon, label, show = true, onClick, collapsed
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  show?: boolean;
  onClick?: () => void;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);

  if (!show) return null;

  return (
    <Link href={href} onClick={onClick}>
      <div
        className={`
          relative flex items-center gap-3 rounded-xl transition-all duration-200 text-[13px] font-semibold mb-0.5 group
          ${collapsed ? 'justify-center w-10 h-10 mx-auto' : 'px-3 py-2.5'}
        `}
        style={{ color: isActive ? 'var(--sidebar-active-text)' : 'var(--sidebar-text)' }}
      >
        {/* Active background — BizLink cream pill */}
        {isActive && (
          <span
            className="absolute inset-0 rounded-xl"
            style={{ background: 'var(--sidebar-active-bg)' }}
          />
        )}

        {/* Hover background */}
        {!isActive && (
          <span className="absolute inset-0 rounded-xl bg-white/0 group-hover:bg-white/[0.06] transition-colors" />
        )}

        <span className="relative shrink-0 z-10">
          {icon}
        </span>

        {!collapsed && (
          <span className="relative z-10 truncate leading-none">{label}</span>
        )}

        {/* Tooltip for collapsed mode */}
        {collapsed && (
          <div
            className="absolute left-full ml-3 px-3 py-1.5 text-xs font-semibold rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-all duration-150"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-mid)',
              color: 'var(--text-primary)',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            {label}
            <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent" style={{ borderRightColor: 'var(--bg-elevated)' }} />
          </div>
        )}
      </div>
    </Link>
  );
}

// ─────────────────────────────────────────────
// NAV SECTION DIVIDER
// ─────────────────────────────────────────────
function NavSection({ label, collapsed }: { label: string; collapsed?: boolean }) {
  if (collapsed) {
    return (
      <div
        className="my-3 mx-auto w-6"
        style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
      />
    );
  }
  return (
    <p
      className="px-3 text-[9.5px] font-bold uppercase tracking-[0.12em] mb-1 mt-5 select-none"
      style={{ color: 'rgba(255,255,255,0.2)' }}
    >
      {label}
    </p>
  );
}

// ─────────────────────────────────────────────
// ROOT LAYOUT
// ─────────────────────────────────────────────
export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen]   = useState(false);
  const [collapsed, setCollapsed]       = useState(false);
  const [theme, setTheme]               = useState<'dark' | 'light'>('dark');
  const [userProfile, setUserProfile]   = useState<{
    name: string;
    role: Role | null;
    overrides: Record<string, boolean> | null;
    rolePerms: Record<string, boolean> | null;
  }>({ name: 'Loading...', role: null, overrides: null, rolePerms: null });
  const [loading, setLoading]           = useState(true);

  const router   = useRouter();
  const pathname = usePathname();
  const isLoginPage = pathname === '/login' || pathname === '/reset-password';

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );

  // Load saved theme
  useEffect(() => {
    const saved = localStorage.getItem('noc-theme') as 'dark' | 'light' | null;
    if (saved) setTheme(saved);
  }, []);

  // Mobile sidebar + resize
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) setSidebarOpen(true);
      else { setSidebarOpen(false); setCollapsed(false); }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Load user (including permission_overrides + role perms from DB)
  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, role, permission_overrides')
          .eq('id', user.id)
          .single();
        if (profile) {
          const role = profile.role as Role;
          // Fetch role-level permissions from roles table
          let rolePerms: Record<string, boolean> | null = null;
          if (role && role !== 'SUPER_DEV') {
            const { data: roleRow } = await supabase
              .from('roles')
              .select('permissions')
              .eq('name', role)
              .single();
            if (roleRow?.permissions) rolePerms = roleRow.permissions;
          }
          setUserProfile({
            name: profile.full_name || user.email?.split('@')[0] || 'User',
            role,
            overrides: profile.permission_overrides ?? null,
            rolePerms,
          });
        }
      } else if (!isLoginPage) {
        router.push('/login');
      }
      setLoading(false);
    }
    loadUser();
  }, [pathname, isLoginPage, router]);

  // Helper — checks permission with overrides + role perms from DB
  const userCan = (key: PermissionKey) =>
    can(key, userProfile.role, userProfile.overrides ?? undefined, userProfile.rolePerms ?? undefined);

  const canAccessPage = () => {
    if (loading || isLoginPage) return true;
    if (pathname.startsWith('/broadcast'))    return userCan('broadcast.menu');
    if (pathname.startsWith('/manage-users')) return userCan('team.menu');
    if (pathname.startsWith('/manage-roles')) return userProfile.role === 'SUPER_DEV';
    return true;
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('noc-theme', next);
  };

  const toggleSidebar        = () => setSidebarOpen(prev => !prev);
  const toggleCollapse       = () => setCollapsed(prev => !prev);
  const closeSidebarOnMobile = () => { if (window.innerWidth < 768) setSidebarOpen(false); };

  const sidebarWidth = collapsed ? 'w-[68px]' : 'w-[232px]';

  return (
    <html lang="id" data-theme={theme}>
      <body
        suppressHydrationWarning={true}
        className={`min-h-screen antialiased ${isLoginPage ? '' : 'flex overflow-hidden'}`}
        style={{ fontFamily: 'var(--font-sans)', background: 'var(--bg-base)', color: 'var(--text-primary)' }}
      >
        <Toaster
          richColors
          position="top-center"
          toastOptions={{
            style: {
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-mid)',
              color: 'var(--text-primary)',
            }
          }}
        />
        <GlobalBroadcast />

        {isLoginPage ? (
          <main className="w-full h-full">{children}</main>
        ) : (
          <>
            {/* Mobile overlay */}
            {sidebarOpen && (
              <div
                className="fixed inset-0 z-[55] md:hidden"
                style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
                onClick={toggleSidebar}
              />
            )}

            {/* ═══════════════════════════════════════
                SIDEBAR
                ═══════════════════════════════════════ */}
            <aside
              className={`
                fixed md:relative z-[60] h-screen flex flex-col flex-shrink-0
                transition-all duration-300 ease-in-out overflow-hidden
                ${sidebarOpen
                  ? `${sidebarWidth} translate-x-0`
                  : 'w-0 -translate-x-full md:' + sidebarWidth + ' md:translate-x-0'
                }
              `}
              style={{
                background: 'var(--sidebar-bg)',
                borderRight: '1px solid var(--sidebar-border)',
              }}
            >
              {/* ── LOGO AREA ── */}
              <div
                className={`flex items-center h-[60px] shrink-0 px-4 ${collapsed ? 'justify-center' : 'justify-between'}`}
                style={{ borderBottom: '1px solid var(--sidebar-border)' }}
              >
                <Link href="/" className="flex items-center gap-3 min-w-0 group" onClick={closeSidebarOnMobile}>
                  {/* Logo */}
                  <div
                    className="shrink-0 rounded-xl overflow-hidden"
                    style={{
                      width: 34, height: 34,
                      background: 'rgba(255,255,255,0.1)',
                      padding: 2,
                    }}
                  >
                    <Image
                      src="/logo-fmi.jpg"
                      alt="NOC FMI"
                      width={30}
                      height={30}
                      className="rounded-lg object-cover w-full h-full"
                    />
                  </div>

                  {!collapsed && (
                    <div className="min-w-0">
                      <h1
                        className="font-black text-[15px] tracking-tight leading-none"
                        style={{ letterSpacing: '-0.03em', color: 'var(--sidebar-active-bg)' }}
                      >
                        NOC FMI
                      </h1>
                      <p
                        className="font-bold mt-0.5"
                        style={{ fontSize: 9, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}
                      >
                        Network Operations
                      </p>
                    </div>
                  )}
                </Link>

                {/* Close on mobile */}
                {sidebarOpen && !collapsed && (
                  <button
                    onClick={toggleSidebar}
                    className="md:hidden p-1.5 rounded-lg transition-colors"
                    style={{ color: 'rgba(255,255,255,0.3)' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'white')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              {/* ── NAV ── */}
              <nav
                className={`flex-1 py-4 overflow-y-auto overflow-x-hidden custom-scrollbar ${collapsed ? 'px-2' : 'px-3'}`}
              >
                <NavSection label="Reporting" collapsed={collapsed} />
                <SidebarItem collapsed={collapsed} onClick={closeSidebarOnMobile} href="/"            icon={<LayoutDashboard size={16} />} label="Dashboard" />
                <SidebarItem collapsed={collapsed} onClick={closeSidebarOnMobile} href="/work-orders" icon={<ClipboardList size={16} />}   label="Monthly Report Aktivator" />
                <SidebarItem collapsed={collapsed} onClick={closeSidebarOnMobile} href="/tracker"     icon={<LineChart size={16} />}       label="Weekly Report Aktivator" />
                <SidebarItem collapsed={collapsed} onClick={closeSidebarOnMobile} href="/NOC/report"  icon={<Network size={16} />}         label="Backbone Report NOC" />

                <NavSection label="Database" collapsed={collapsed} />
                <SidebarItem collapsed={collapsed} onClick={closeSidebarOnMobile} href="/vlan"         icon={<Server size={16} />}    label="VLAN Database" />
                <SidebarItem collapsed={collapsed} onClick={closeSidebarOnMobile} href="/clients"      icon={<Users size={16} />}     label="Data Client" />
                <SidebarItem collapsed={collapsed} onClick={closeSidebarOnMobile} href="/interkoneksi" icon={<Activity size={16} />}  label="Data Interkoneksi" />

                <NavSection label="Log & Tools" collapsed={collapsed} />
                <SidebarItem collapsed={collapsed} onClick={closeSidebarOnMobile} href="/logs"  icon={<History size={16} />} label="Activity Log" />
                <SidebarItem collapsed={collapsed} onClick={closeSidebarOnMobile} href="/tools" icon={<Wrench size={16} />}  label="Tools & Utilities" />

                <NavSection label="Access" collapsed={collapsed} />
                <SidebarItem
                  collapsed={collapsed}
                  onClick={closeSidebarOnMobile}
                  href="/broadcast"
                  icon={<Megaphone size={16} />}
                  label="Broadcast Message"
                  show={userCan('broadcast.menu')}
                />
                <SidebarItem
                  collapsed={collapsed}
                  onClick={closeSidebarOnMobile}
                  href="/manage-users"
                  icon={<ShieldCheck size={16} style={{ color: '#fbbf24' }} />}
                  label="Team Management"
                  show={userCan('team.menu')}
                />
                <SidebarItem
                  collapsed={collapsed}
                  onClick={closeSidebarOnMobile}
                  href="/manage-roles"
                  icon={<Sliders size={16} style={{ color: '#c084fc' }} />}
                  label="Role Management"
                  show={userProfile.role === 'SUPER_DEV'}
                />
              </nav>

              {/* ── FOOTER: Profile + Controls ── */}
              <div
                className="shrink-0 p-3"
                style={{ borderTop: '1px solid var(--sidebar-border)', background: 'rgba(0,0,0,0.2)' }}
              >
                {/* Profile */}
                <Link
                  href="/profile"
                  onClick={closeSidebarOnMobile}
                  className={`flex items-center gap-2.5 rounded-xl p-2 mb-2 group transition-all duration-150 ${collapsed ? 'justify-center' : ''}`}
                  style={{ background: 'transparent' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  title={collapsed ? userProfile.name : undefined}
                >
                  {/* Avatar */}
                  <div
                    className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold"
                    style={{
                      background: 'var(--sidebar-active-bg)',
                      color: 'var(--sidebar-active-text)',
                      fontWeight: 800,
                    }}
                  >
                    {userProfile.name.charAt(0).toUpperCase()}
                  </div>

                  {!collapsed && (
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-white truncate leading-none">
                        {userProfile.name}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--sidebar-active-bg)', opacity: 0.7 }} />
                        <p className="font-bold uppercase" style={{ fontSize: 9, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.3)' }}>
                          {userProfile.role || '…'}
                        </p>
                      </div>
                    </div>
                  )}

                  {!collapsed && (
                    <button
                      onClick={(e) => { e.preventDefault(); handleLogout(); }}
                      className="p-1.5 rounded-lg transition-colors"
                      style={{ color: 'rgba(255,255,255,0.25)' }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.background = 'rgba(248,113,113,0.1)'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.25)'; e.currentTarget.style.background = 'transparent'; }}
                      title="Logout"
                    >
                      <LogOut size={14} />
                    </button>
                  )}
                </Link>

                {/* Collapse toggle — desktop only */}
                <button
                  onClick={toggleCollapse}
                  className={`hidden md:flex w-full items-center justify-center gap-2 py-1.5 rounded-lg transition-all duration-150 text-[11px] font-medium`}
                  style={{ color: 'rgba(255,255,255,0.2)' }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.2)'; e.currentTarget.style.background = 'transparent'; }}
                >
                  <ChevronRight size={13} className={`transition-transform duration-300 ${collapsed ? '' : 'rotate-180'}`} />
                  {!collapsed && <span>Collapse</span>}
                </button>
              </div>
            </aside>

            {/* ═══════════════════════════════════════
                MAIN CONTENT
                ═══════════════════════════════════════ */}
            <main className="flex-1 flex flex-col h-screen overflow-hidden relative" style={{ background: 'var(--bg-base)' }}>

              {/* Hamburger — mobile */}
              <div className="md:hidden absolute top-[14px] left-4 z-[50]">
                <button
                  onClick={toggleSidebar}
                  className="p-2 rounded-xl transition-all"
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-mid)',
                    color: 'var(--text-secondary)',
                    boxShadow: 'var(--shadow-sm)',
                  }}
                >
                  <Menu size={18} />
                </button>
              </div>

              <BroadcastTicker />
              <Header theme={theme} onToggleTheme={toggleTheme} />

              <div className="flex-1 overflow-y-auto overflow-x-hidden" style={{ background: 'var(--bg-base)' }}>
                {!loading && !canAccessPage() ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-10">
                    <div
                      className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
                      style={{ background: 'var(--danger-bg)', border: '1px solid rgba(248,113,113,0.2)' }}
                    >
                      <ShieldAlert size={32} style={{ color: 'var(--danger)' }} />
                    </div>
                    <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Akses Dibatasi</h1>
                    <p className="max-w-sm mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                      Role{' '}
                      <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{userProfile.role}</span>
                      {' '}tidak memiliki izin untuk mengakses halaman ini.
                    </p>
                    <Link
                      href="/"
                      className="btn btn-primary mt-6"
                    >
                      Kembali ke Dashboard
                    </Link>
                  </div>
                ) : (
                  children
                )}
              </div>
            </main>
          </>
        )}
      </body>
    </html>
  );
}
