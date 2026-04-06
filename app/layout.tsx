'use client';

import './globals.css';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import Header from '@/components/Header';
import { hasAccess, PERMISSIONS, Role } from '@/lib/permissions';
import { 
  LayoutDashboard, Users, Activity, LineChart, Server, 
  History, Menu, LogOut, ClipboardList, Wrench, Megaphone,
  ShieldCheck, ShieldAlert, X, ChevronRight
} from 'lucide-react';

import GlobalBroadcast from '@/components/GlobalBroadcast';
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
    <Link href={href} onClick={onClick} title={collapsed ? label : undefined}>
      <div className={`
        flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 text-sm font-medium mb-0.5 relative group
        ${isActive 
          ? 'bg-[#1a4d8f] text-white shadow-sm' 
          : 'text-[#8a9bb5] hover:bg-[#1a2535] hover:text-[#c8d6e8]'
        }
        ${collapsed ? 'justify-center px-0' : ''}
      `}>
        {/* Active indicator bar */}
        {isActive && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-blue-400 rounded-r-full" />
        )}
        
        <span className={`shrink-0 ${isActive ? 'text-blue-200' : ''}`}>
          {icon}
        </span>
        
        {!collapsed && (
          <span className="truncate leading-none">{label}</span>
        )}

        {/* Tooltip for collapsed mode */}
        {collapsed && (
          <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-slate-800 text-white text-xs font-medium rounded-md opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity duration-150 shadow-lg">
            {label}
            <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-800" />
          </div>
        )}
      </div>
    </Link>
  );
}

// ─────────────────────────────────────────────
// SECTION LABEL
// ─────────────────────────────────────────────
function NavSection({ label, collapsed }: { label: string; collapsed?: boolean }) {
  if (collapsed) {
    return <div className="border-t border-[#1e2a3a] my-3 mx-2" />;
  }
  return (
    <p className="px-3 text-[10px] font-bold text-[#3d5269] uppercase tracking-widest mb-1 mt-5 select-none">
      {label}
    </p>
  );
}

// ─────────────────────────────────────────────
// ROOT LAYOUT
// ─────────────────────────────────────────────
export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [userProfile, setUserProfile] = useState<{ name: string; role: Role | null }>({ name: 'Loading...', role: null });
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );

  // Handle mobile sidebar + desktop resize
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setSidebarOpen(true);
      } else {
        setSidebarOpen(false);
        setCollapsed(false);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Load user
  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, role')
          .eq('id', user.id)
          .single();
        if (profile) {
          setUserProfile({ 
            name: profile.full_name || user.email?.split('@')[0] || 'User', 
            role: profile.role as Role 
          });
        }
      } else if (!isLoginPage) {
        router.push('/login');
      }
      setLoading(false);
    }
    loadUser();
  }, [pathname, isLoginPage, router]);

  const canAccessPage = () => {
    if (loading || isLoginPage) return true;
    if (pathname.startsWith('/broadcast')) return hasAccess(userProfile.role, PERMISSIONS.BROADCAST_ACCESS);
    if (pathname.startsWith('/manage-users')) return hasAccess(userProfile.role, PERMISSIONS.MANAGE_USERS);
    return true;
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const toggleSidebar = () => setSidebarOpen(prev => !prev);
  const toggleCollapse = () => setCollapsed(prev => !prev);
  const closeSidebarOnMobile = () => {
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  const sidebarWidth = collapsed ? 'w-16' : 'w-60';

  return (
    <html lang="en">
      <body
        suppressHydrationWarning={true}
        className={`
          min-h-screen font-sans antialiased
          ${isLoginPage ? 'bg-[#0f1621]' : 'bg-[#f4f6f9] flex overflow-hidden'}
        `}
        style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}
      >
        <Toaster richColors position="top-center" />
        <GlobalBroadcast />

        {isLoginPage ? (
          <main className="w-full h-full">{children}</main>
        ) : (
          <>
            {/* Mobile overlay */}
            {sidebarOpen && (
              <div
                className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[55] md:hidden"
                onClick={toggleSidebar}
              />
            )}

            {/* ── SIDEBAR ── */}
            <aside className={`
              fixed md:relative z-[60] h-screen bg-[#0f1621] text-white
              flex flex-col flex-shrink-0 transition-all duration-300 ease-in-out
              border-r border-[#1e2a3a] overflow-hidden
              ${sidebarOpen
                ? `${sidebarWidth} translate-x-0`
                : 'w-0 -translate-x-full md:' + sidebarWidth + ' md:translate-x-0'
              }
            `}>

              {/* Logo */}
              <div className={`
                flex items-center border-b border-[#1e2a3a] h-[64px] shrink-0 px-4
                ${collapsed ? 'justify-center' : 'justify-between'}
              `}>
                <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center shrink-0 shadow-md">
                    <Image
                      src="/logo-fmi.jpg"
                      alt="NOC FMI"
                      width={28}
                      height={28}
                      className="rounded-md object-cover"
                    />
                  </div>
                  {!collapsed && (
                    <div className="min-w-0">
                      <h1 className="font-black text-[15px] tracking-tight leading-none text-white">
                        NOC <span className="text-blue-400">FMI</span>
                      </h1>
                      <p className="text-[9px] text-[#3d5269] uppercase tracking-[0.15em] font-bold mt-0.5">
                        Network Operations
                      </p>
                    </div>
                  )}
                </Link>

                {/* Close on mobile */}
                {sidebarOpen && !collapsed && (
                  <button onClick={toggleSidebar} className="md:hidden text-[#4a5e78] hover:text-white p-1 ml-1">
                    <X size={18} />
                  </button>
                )}
              </div>

              {/* Navigation */}
              <nav className={`
                flex-1 py-3 overflow-y-auto overflow-x-hidden custom-scrollbar
                ${collapsed ? 'px-2' : 'px-3'}
              `}>
                <NavSection label="Reporting" collapsed={collapsed} />
                <SidebarItem collapsed={collapsed} onClick={closeSidebarOnMobile} href="/"             icon={<LayoutDashboard size={17} />} label="Dashboard" />
                <SidebarItem collapsed={collapsed} onClick={closeSidebarOnMobile} href="/work-orders"  icon={<ClipboardList size={17} />}  label="Monthly Report" />
                <SidebarItem collapsed={collapsed} onClick={closeSidebarOnMobile} href="/tracker"      icon={<LineChart size={17} />}      label="Weekly Report" />

                <NavSection label="Database" collapsed={collapsed} />
                <SidebarItem collapsed={collapsed} onClick={closeSidebarOnMobile} href="/vlan"  icon={<Server size={17} />}  label="VLAN Database" />
                <SidebarItem collapsed={collapsed} onClick={closeSidebarOnMobile} href="/clients"      icon={<Users size={17} />}          label="Data Client" />
                <SidebarItem collapsed={collapsed} onClick={closeSidebarOnMobile} href="/interkoneksi" icon={<Activity size={17} />}       label="Data Interkoneksi" />

                <NavSection label="Log And Tools" collapsed={collapsed} />
                <SidebarItem collapsed={collapsed} onClick={closeSidebarOnMobile} href="/logs"  icon={<History size={17} />} label="Activity Log" />
                <SidebarItem collapsed={collapsed} onClick={closeSidebarOnMobile} href="/tools" icon={<Wrench size={17} />}  label="Tools & Utilities" />

                <NavSection label="Access Control" collapsed={collapsed} />
                <SidebarItem
                  collapsed={collapsed}
                  onClick={closeSidebarOnMobile}
                  href="/broadcast"
                  icon={<Megaphone size={17} />}
                  label="Broadcast Message"
                  show={hasAccess(userProfile.role, PERMISSIONS.BROADCAST_ACCESS)}
                />
                <SidebarItem
                  collapsed={collapsed}
                  onClick={closeSidebarOnMobile}
                  href="/manage-users"
                  icon={<ShieldCheck size={17} className="text-amber-400" />}
                  label="Team Management"
                  show={hasAccess(userProfile.role, PERMISSIONS.MANAGE_USERS)}
                />
              </nav>

              {/* Profile + Collapse toggle */}
              <div className="border-t border-[#1e2a3a] p-3 shrink-0 bg-[#0c1219]">
                {/* Profile row */}
                <Link
                  href="/profile"
                  onClick={closeSidebarOnMobile}
                  className={`
                    flex items-center gap-3 rounded-lg p-2 
                    hover:bg-[#1a2535] transition-colors group mb-2
                    ${collapsed ? 'justify-center' : ''}
                  `}
                  title={collapsed ? userProfile.name : undefined}
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-700 to-blue-500 flex-shrink-0 flex items-center justify-center text-xs font-bold text-white shadow-sm border border-[#1e2a3a]">
                    {userProfile.name.charAt(0).toUpperCase()}
                  </div>
                  {!collapsed && (
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-white truncate leading-none">{userProfile.name}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <p className="text-[10px] text-[#4a5e78] font-bold uppercase tracking-wider">
                          {userProfile.role || '…'}
                        </p>
                      </div>
                    </div>
                  )}
                  {!collapsed && (
                    <button
                      onClick={(e) => { e.preventDefault(); handleLogout(); }}
                      className="p-1.5 text-[#4a5e78] hover:text-rose-400 hover:bg-[#1e2a3a] rounded-md transition-colors"
                      title="Logout"
                    >
                      <LogOut size={15} />
                    </button>
                  )}
                </Link>

                {/* Collapse toggle — desktop only */}
                <button
                  onClick={toggleCollapse}
                  className={`
                    hidden md:flex w-full items-center justify-center gap-2
                    py-1.5 rounded-md text-[#3d5269] hover:text-[#8a9bb5] hover:bg-[#1a2535]
                    transition-colors text-[11px] font-medium
                  `}
                >
                  <ChevronRight size={14} className={`transition-transform duration-300 ${collapsed ? '' : 'rotate-180'}`} />
                  {!collapsed && <span>Collapse sidebar</span>}
                </button>
              </div>
            </aside>

            {/* ── MAIN CONTENT ── */}
            <main className="flex-1 flex flex-col h-screen overflow-hidden bg-[#f4f6f9] relative">
              {/* Hamburger — mobile */}
              <div className="md:hidden absolute top-[14px] left-4 z-[50]">
                <button
                  onClick={toggleSidebar}
                  className="p-2 bg-white rounded-lg shadow-sm text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  <Menu size={18} />
                </button>
              </div>

              <Header />

              <div className="flex-1 overflow-y-auto overflow-x-hidden relative">
                {!loading && !canAccessPage() ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-10">
                    <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center mb-5">
                      <ShieldAlert size={32} className="text-rose-500" />
                    </div>
                    <h1 className="text-xl font-bold text-slate-900">Akses Dibatasi</h1>
                    <p className="text-slate-500 max-w-sm mt-2 text-sm">
                      Role <span className="font-semibold text-slate-700">{userProfile.role}</span> tidak memiliki izin untuk mengakses halaman ini.
                    </p>
                    <Link
                      href="/"
                      className="mt-6 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-sm shadow-sm transition-colors"
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