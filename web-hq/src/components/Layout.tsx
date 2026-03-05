import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, FolderKanban, CheckSquare, DollarSign,
  Activity, Settings, MessageSquare, Bot, Menu, X,
  Cpu, LogOut, ChevronRight, Shield, Coins, UserPlus, Radio, Shuffle
} from 'lucide-react';
import NotificationBell from './NotificationBell';

interface LayoutProps {
  children: React.ReactNode;
  user?: { id: string; name: string; email?: string; avatar_url?: string; role?: 'admin' | 'readonly' | 'user'; } | null;
  onLogout?: () => void;
}

const NAV = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard', group: 'main' },
  { path: '/hq', icon: Radio, label: 'HQ', group: 'main' },
  { path: '/projects', icon: FolderKanban, label: 'Projects', group: 'main' },
  { path: '/tasks', icon: CheckSquare, label: 'Tasks', group: 'main' },
  { path: '/agents', icon: Bot, label: 'Agents', group: 'main' },
  { path: '/chat', icon: MessageSquare, label: 'Comms', group: 'main' },
  { path: '/assign', icon: Shuffle, label: 'Assign', group: 'main' },
  { path: '/costs', icon: DollarSign, label: 'Costs', group: 'ops' },
  { path: '/tokens', icon: Coins, label: 'Tokens', group: 'ops' },
  { path: '/activity', icon: Activity, label: 'Activity', group: 'ops' },
];

const ADMIN_NAV = [
  { path: '/admin', icon: Shield, label: 'Admin Panel', group: 'admin' },
  { path: '/agents/register', icon: UserPlus, label: 'New Agent', group: 'admin' },
];

export default function Layout({ children, user, onLogout }: LayoutProps) {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isAdmin = user?.role === 'admin';

  const NavItem = ({ item }: { item: typeof NAV[0] }) => {
    const active = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
    return (
      <Link
        to={item.path}
        onClick={() => setMobileOpen(false)}
        className={`ops-nav-item ${active ? 'active' : ''}`}
      >
        <item.icon size={13} />
        {item.label}
        {active && <ChevronRight size={10} className="ml-auto" style={{ color: 'var(--amber)', opacity: 0.6 }} />}
      </Link>
    );
  };

  const Sidebar = () => (
    <nav className="ops-sidebar">
      {/* Logo */}
      <div className="ops-sidebar-logo">
        <Cpu size={16} style={{ color: 'var(--amber)' }} />
        <span className="ops-sidebar-logo-text">PROJECT-CLAW</span>
      </div>

      {/* Nav groups */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        <div>
          <div className="px-3 mb-2" style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>Core</div>
          <div className="space-y-0.5">
            {NAV.filter(n => n.group === 'main').map(n => <NavItem key={n.path} item={n} />)}
          </div>
        </div>
        <div>
          <div className="px-3 mb-2" style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>Operations</div>
          <div className="space-y-0.5">
            {NAV.filter(n => n.group === 'ops').map(n => <NavItem key={n.path} item={n} />)}
          </div>
        </div>
        {isAdmin && (
          <div>
            <div className="px-3 mb-2" style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>Admin</div>
            <div className="space-y-0.5">
              {ADMIN_NAV.map(n => <NavItem key={n.path} item={n} />)}
            </div>
          </div>
        )}
      </div>

      {/* Settings + user */}
      <div className="border-t px-3 py-3 space-y-1" style={{ borderColor: 'var(--ink-4)' }}>
        <Link to="/settings" className={`ops-nav-item ${location.pathname === '/settings' ? 'active' : ''}`}>
          <Settings size={13} /> Settings
        </Link>
        {user && (
          <div className="mt-3 px-2 py-2 rounded flex items-center gap-2" style={{ background: 'var(--ink-3)', border: '1px solid var(--ink-4)' }}>
            <div className="w-7 h-7 rounded-sm flex items-center justify-center text-xs font-bold" style={{ background: 'var(--amber-glow)', color: 'var(--amber)', fontFamily: 'var(--font-mono)', border: '1px solid var(--amber-line)' }}>
              {user.name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-hi)', fontWeight: 600 }} className="truncate">{user.name}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--amber)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{user.role}</div>
            </div>
            {onLogout && (
              <button onClick={onLogout} className="p-1 rounded" style={{ color: 'var(--text-lo)' }}
                title="Logout">
                <LogOut size={12} />
              </button>
            )}
          </div>
        )}
      </div>
    </nav>
  );

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--ink-1)' }}>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar desktop */}
      <div className="hidden lg:flex">
        <Sidebar />
      </div>

      {/* Sidebar mobile */}
      <div className={`fixed inset-y-0 left-0 z-50 lg:hidden transform transition-transform duration-300 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar />
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="h-12 flex items-center justify-between px-4 flex-shrink-0" style={{ background: 'var(--ink-2)', borderBottom: '1px solid var(--ink-4)' }}>
          <button className="lg:hidden ops-btn p-1.5" onClick={() => setMobileOpen(true)}>
            <Menu size={14} />
          </button>
          <div className="flex items-center gap-2 ml-auto">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded" style={{ background: 'var(--ink-3)', border: '1px solid var(--ink-4)' }}>
              <span className="ops-dot ops-dot-green ops-dot-pulse" />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--green)', letterSpacing: '0.08em' }}>ONLINE</span>
            </div>
            <NotificationBell />
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6" style={{ background: 'var(--ink-1)' }}>
          {children}
        </main>
      </div>
    </div>
  );
}