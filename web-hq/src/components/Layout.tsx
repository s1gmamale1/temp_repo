import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, FolderKanban, CheckSquare, DollarSign,
  Activity, Settings, MessageSquare, Bot, Menu, X,
  LogOut, ChevronRight, Shield, Coins, UserPlus, Radio, Shuffle,
  Zap, BookOpen, FlaskConical
} from 'lucide-react';
import NotificationBell from './NotificationBell';

interface LayoutProps {
  children: React.ReactNode;
  user?: { id: string; name: string; email?: string; avatar_url?: string; role?: 'admin' | 'readonly' | 'user'; } | null;
  onLogout?: () => void;
}

const NAV = [
  { path: '/',        icon: LayoutDashboard, label: 'Dashboard', group: 'main' },
  { path: '/hq',      icon: Radio,           label: 'HQ',        group: 'main' },
  { path: '/projects',icon: FolderKanban,    label: 'Projects',  group: 'main' },
  { path: '/tasks',   icon: CheckSquare,     label: 'Tasks',     group: 'main' },
  { path: '/agents',  icon: Bot,             label: 'Agents',    group: 'main' },
  { path: '/chat',    icon: MessageSquare,   label: 'Comms',     group: 'main' },
  { path: '/assign',  icon: Shuffle,         label: 'Assign',    group: 'main' },
  { path: '/rnd',     icon: FlaskConical,    label: 'R&D Lab',   group: 'ops' },
  { path: '/costs',   icon: DollarSign,      label: 'Costs',     group: 'ops' },
  { path: '/tokens',  icon: Coins,           label: 'Tokens',    group: 'ops' },
  { path: '/activity',icon: Activity,        label: 'Activity',  group: 'ops' },
];

const ADMIN_NAV = [
  { path: '/admin',          icon: Shield,   label: 'Admin Panel', group: 'admin' },
  { path: '/agents/register',icon: UserPlus, label: 'New Agent',   group: 'admin' },
];

export default function Layout({ children, user, onLogout }: LayoutProps) {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isAdmin = user?.role === 'admin';

  const NavItem = ({ item }: { item: typeof NAV[0] }) => {
    const active = location.pathname === item.path ||
      (item.path !== '/' && location.pathname.startsWith(item.path));
    return (
      <Link
        to={item.path}
        onClick={() => setMobileOpen(false)}
        className={`ops-nav-item ${active ? 'active' : ''}`}
      >
        <item.icon size={12} strokeWidth={active ? 2 : 1.5} />
        {item.label}
        {active && (
          <ChevronRight
            size={9}
            className="ml-auto"
            style={{ color: 'var(--cyan)', opacity: 0.7 }}
          />
        )}
      </Link>
    );
  };

  const Sidebar = () => (
    <nav className="ops-sidebar">
      {/* Logo */}
      <div className="ops-sidebar-logo">
        <div className="ops-sidebar-logo-mark">
          <Zap size={13} style={{ color: 'var(--cyan)' }} strokeWidth={2.5} />
        </div>
        <div>
          <div className="ops-sidebar-logo-text">CLAW</div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 8,
            color: 'var(--text-lo)',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
          }}>agent ops</div>
        </div>
      </div>

      {/* Nav */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Core */}
        <div>
          <div className="ops-sidebar-group-label" style={{ marginBottom: 6 }}>Core</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {NAV.filter(n => n.group === 'main').map(n => <NavItem key={n.path} item={n} />)}
          </div>
        </div>

        {/* Operations */}
        <div>
          <div className="ops-sidebar-group-label" style={{ marginBottom: 6 }}>Operations</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {NAV.filter(n => n.group === 'ops').map(n => <NavItem key={n.path} item={n} />)}
          </div>
        </div>

        {/* Admin */}
        {isAdmin && (
          <div>
            <div className="ops-sidebar-group-label" style={{ marginBottom: 6, color: 'rgba(245,158,11,0.5)' }}>Admin</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {ADMIN_NAV.map(n => <NavItem key={n.path} item={n} />)}
            </div>
          </div>
        )}
      </div>

      {/* Bottom: settings + user */}
      <div style={{ borderTop: '1px solid var(--ink-4)', padding: '10px', display: 'flex', flexDirection: 'column', gap: 6, position: 'relative' }}>
        {/* Cyan glow on top of bottom bar */}
        <div style={{
          position: 'absolute', top: -1, left: 0, right: 0, height: '1px',
          background: 'linear-gradient(90deg, transparent, rgba(34,211,238,0.2), transparent)',
          pointerEvents: 'none',
        }} />

        <Link
          to="/settings"
          className={`ops-nav-item ${location.pathname === '/settings' ? 'active' : ''}`}
        >
          <Settings size={12} strokeWidth={1.5} />
          Settings
        </Link>

        <a
          href={import.meta.env.VITE_DOCS_URL || 'http://localhost:4040'}
          target="_blank"
          rel="noopener noreferrer"
          className="ops-nav-item"
          style={{ color: 'var(--cyan)', opacity: 0.7 }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '0.7')}
        >
          <BookOpen size={12} strokeWidth={1.5} />
          Docs
        </a>

        {user && (
          <div style={{
            marginTop: 4,
            padding: '8px 10px',
            borderRadius: 4,
            background: 'var(--ink-3)',
            border: '1px solid var(--ink-5)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            {/* Avatar */}
            <div style={{
              width: 26, height: 26,
              borderRadius: 4,
              background: 'var(--glow-cyan)',
              border: '1px solid rgba(34,211,238,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-mono)',
              fontSize: 11, fontWeight: 700,
              color: 'var(--cyan)',
              flexShrink: 0,
              boxShadow: '0 0 8px rgba(34,211,238,0.15)',
            }}>
              {user.name?.charAt(0).toUpperCase()}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11, fontWeight: 600,
                color: 'var(--text-hi)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {user.name}
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 8,
                color: user.role === 'admin' ? 'var(--amber)' : 'var(--text-lo)',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
              }}>
                {user.role}
              </div>
            </div>

            {onLogout && (
              <button
                onClick={onLogout}
                title="Logout"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-lo)', padding: 3, borderRadius: 3,
                  transition: 'color 120ms',
                  display: 'flex', alignItems: 'center',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-lo)')}
              >
                <LogOut size={12} />
              </button>
            )}
          </div>
        )}
      </div>
    </nav>
  );

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--ink-1)', position: 'relative', zIndex: 1 }}>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(2px)' }}
          className="lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar desktop */}
      <div className="hidden lg:flex">
        <Sidebar />
      </div>

      {/* Sidebar mobile */}
      <div className={`fixed inset-y-0 left-0 z-50 lg:hidden transform transition-transform duration-300 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar />
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Topbar */}
        <header style={{
          height: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          flexShrink: 0,
          background: 'var(--ink-2)',
          borderBottom: '1px solid var(--ink-4)',
          position: 'relative',
        }}>
          {/* Bottom glow line on topbar */}
          <div style={{
            position: 'absolute', bottom: -1, left: 0, right: 0, height: '1px',
            background: 'linear-gradient(90deg, transparent, rgba(34,211,238,0.15), transparent)',
            pointerEvents: 'none',
          }} />

          <button
            className="lg:hidden"
            onClick={() => setMobileOpen(o => !o)}
            style={{
              background: 'none', border: '1px solid var(--ink-5)',
              borderRadius: 3, padding: '4px 6px', cursor: 'pointer',
              color: 'var(--text-mid)', display: 'flex', alignItems: 'center',
            }}
          >
            {mobileOpen ? <X size={14} /> : <Menu size={14} />}
          </button>

          {/* Right side: system status + notifications */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
            {/* Online pill */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '3px 10px',
              borderRadius: 20,
              background: 'var(--ink-3)',
              border: '1px solid rgba(16,185,129,0.2)',
              boxShadow: '0 0 12px rgba(16,185,129,0.05)',
            }}>
              <span className="ops-dot ops-dot-green ops-dot-pulse" />
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                color: 'var(--green)',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                textShadow: '0 0 8px rgba(16,185,129,0.5)',
              }}>
                ONLINE
              </span>
            </div>

            <NotificationBell />
          </div>
        </header>

        {/* Page content */}
        <main style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px',
          background: 'var(--ink-1)',
          position: 'relative',
          zIndex: 1,
        }}>
          {children}
        </main>
      </div>
    </div>
  );
}
