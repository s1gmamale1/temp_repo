import { useState, useEffect, useRef } from 'react';
import {
  Bell, Check, X, Target, MessageSquare, UserPlus,
  AlertTriangle, Loader2, CheckSquare, ExternalLink
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotificationStore } from '../store/notificationStore';
import type { Notification } from '../store/notificationStore';
import { userSession } from '../services/api';

export type { Notification };

export default function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const {
    notifications, unreadCount, loading,
    fetchNotifications, markRead, markAllRead, dismiss,
  } = useNotificationStore();

  useEffect(() => { if (userSession.isLoggedIn()) fetchNotifications(); }, [fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setIsOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const handleClick = (n: Notification) => {
    if (!n.is_read) markRead(n.id);
    setIsOpen(false);
    switch (n.type) {
      case 'project_assignment': case 'project_assigned':
        navigate(n.data?.project_id ? `/projects/${n.data.project_id}` : '/projects'); break;
      case 'dm_message': case 'message':
        navigate('/chat'); break;
      case 'task_assigned': case 'task_accepted': case 'task_rejected': case 'task_completed':
        navigate(n.data?.task_id ? `/tasks?task=${n.data.task_id}` : '/tasks'); break;
      case 'agent_registered':
        navigate('/admin'); break;
    }
  };

  const getIcon = (type: string) => {
    const s: React.CSSProperties = {
      width: 28, height: 28, borderRadius: 3, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    };
    switch (type) {
      case 'project_assignment': case 'project_assigned':
        return <div style={{ ...s, background: '#4f46e512', border: '1px solid #4f46e530' }}><Target size={13} style={{ color: '#818cf8' }} /></div>;
      case 'dm_message': case 'message':
        return <div style={{ ...s, background: '#0ea5e912', border: '1px solid #0ea5e930' }}><MessageSquare size={13} style={{ color: '#38bdf8' }} /></div>;
      case 'task_assigned':
        return <div style={{ ...s, background: '#10b98112', border: '1px solid #10b98130' }}><UserPlus size={13} style={{ color: '#34d399' }} /></div>;
      case 'task_accepted': case 'task_completed':
        return <div style={{ ...s, background: '#10b98112', border: '1px solid #10b98130' }}><CheckSquare size={13} style={{ color: '#34d399' }} /></div>;
      case 'task_rejected':
        return <div style={{ ...s, background: '#ef444412', border: '1px solid #ef444430' }}><AlertTriangle size={13} style={{ color: '#f87171' }} /></div>;
      case 'agent_registered':
        return <div style={{ ...s, background: '#f59e0b12', border: '1px solid #f59e0b30' }}><UserPlus size={13} style={{ color: '#fbbf24' }} /></div>;
      default:
        return <div style={{ ...s, background: '#64748b12', border: '1px solid #64748b30' }}><Bell size={13} style={{ color: '#94a3b8' }} /></div>;
    }
  };

  const fmtTime = (ts: string) => {
    const d = Date.now() - new Date(ts).getTime();
    const m = Math.floor(d / 60000), h = Math.floor(d / 3600000), dy = Math.floor(d / 86400000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    if (h < 24) return `${h}h ago`;
    if (dy < 7) return `${dy}d ago`;
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const M: React.CSSProperties = { fontFamily: 'var(--font-mono)' };

  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
      {/* Bell */}
      <button
        onClick={() => { setIsOpen(o => !o); if (!isOpen) fetchNotifications(); }}
        style={{
          position: 'relative', padding: 6, background: 'none', border: 'none',
          cursor: 'pointer', color: 'var(--text-lo)', borderRadius: 4, lineHeight: 0,
        }}
        title="Notifications"
      >
        <Bell size={15} />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: 1, right: 1,
            minWidth: 15, height: 15, borderRadius: 8,
            background: '#ef4444', color: '#fff',
            ...M, fontSize: 8, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 6px)',
          width: 350, background: 'var(--ink-2)',
          border: '1px solid var(--ink-4)', borderRadius: 4,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)', zIndex: 200, overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '9px 12px', borderBottom: '1px solid var(--ink-4)',
          }}>
            <span style={{ ...M, fontSize: 10, fontWeight: 700, color: 'var(--text-hi)', letterSpacing: '0.1em' }}>
              NOTIFICATIONS {unreadCount > 0 && <span style={{ color: '#ef4444' }}>({unreadCount})</span>}
            </span>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {unreadCount > 0 && (
                <button onClick={markAllRead} style={{
                  ...M, fontSize: 8, padding: '3px 7px', cursor: 'pointer',
                  background: 'none', border: '1px solid var(--ink-4)', borderRadius: 3,
                  color: 'var(--amber)', letterSpacing: '0.06em',
                  display: 'flex', alignItems: 'center', gap: 3,
                }}>
                  <Check size={8} /> MARK ALL READ
                </button>
              )}
              <button onClick={() => setIsOpen(false)} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-lo)', padding: 2, lineHeight: 0,
              }}>
                <X size={12} />
              </button>
            </div>
          </div>

          {/* List */}
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 28 }}>
                <Loader2 size={18} style={{ color: 'var(--amber)', animation: 'spin 1s linear infinite' }} />
              </div>
            ) : notifications.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 16px' }}>
                <Bell size={26} style={{ color: 'var(--text-dim)', margin: '0 auto 10px', display: 'block' }} />
                <div style={{ ...M, fontSize: 11, color: 'var(--text-lo)' }}>No notifications</div>
                <div style={{ ...M, fontSize: 9, color: 'var(--text-dim)', marginTop: 3 }}>You're all caught up</div>
              </div>
            ) : (
              notifications.map(n => (
                <NotifRow key={n.id} n={n} M={M} getIcon={getIcon} fmtTime={fmtTime}
                  onClick={() => handleClick(n)} onDismiss={() => dismiss(n.id)} />
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div style={{ padding: '7px 12px', borderTop: '1px solid var(--ink-4)', textAlign: 'center' }}>
              <button onClick={() => { setIsOpen(false); navigate('/activity'); }} style={{
                ...M, fontSize: 9, background: 'none', border: 'none',
                cursor: 'pointer', color: 'var(--text-lo)', letterSpacing: '0.06em',
              }}>
                VIEW ALL ACTIVITY →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NotifRow({ n, M, getIcon, fmtTime, onClick, onDismiss }: {
  n: Notification; M: React.CSSProperties;
  getIcon: (t: string) => React.ReactNode;
  fmtTime: (ts: string) => string;
  onClick: () => void; onDismiss: () => void;
}) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', gap: 10, padding: '10px 12px', cursor: 'pointer',
        borderBottom: '1px solid var(--ink-4)',
        background: hov ? 'var(--ink-3)' : !n.is_read ? 'rgba(250,168,26,0.04)' : 'transparent',
        transition: 'background 100ms',
      }}
    >
      {getIcon(n.type)}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
          <span style={{ ...M, fontSize: 11, fontWeight: 600, color: !n.is_read ? 'var(--text-hi)' : 'var(--text-mid)' }}>
            {n.title}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            {!n.is_read && <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--amber)' }} />}
            <button
              onClick={e => { e.stopPropagation(); onDismiss(); }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 1,
                color: 'var(--text-lo)', lineHeight: 0,
                opacity: hov ? 1 : 0, transition: 'opacity 100ms',
              }}
            ><X size={10} /></button>
          </div>
        </div>
        <div style={{ ...M, fontSize: 10, color: 'var(--text-lo)', marginTop: 2, lineHeight: 1.5 }}>
          {n.content}
        </div>
        {(n.type === 'project_assignment' || n.type === 'project_assigned') && n.data?.project_id && (
          <div style={{ marginTop: 6 }}>
            <button
              onClick={e => { e.stopPropagation(); onClick(); }}
              style={{
                ...M, fontSize: 9, padding: '3px 8px', fontWeight: 700,
                background: 'var(--amber)', color: '#000',
                border: 'none', borderRadius: 3, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 3,
              }}
            ><ExternalLink size={8} /> VIEW PROJECT</button>
          </div>
        )}
        <div style={{ ...M, fontSize: 9, color: 'var(--text-dim)', marginTop: 4 }}>
          {fmtTime(n.created_at)}
        </div>
      </div>
    </div>
  );
}