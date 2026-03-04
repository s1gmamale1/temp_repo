import { useEffect, useState, useCallback } from 'react';
import { X, CheckCircle, AlertTriangle, Info, XCircle } from 'lucide-react';

export type ToastType = 'success' | 'warning' | 'error' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

const toastListeners: Set<(toast: Toast) => void> = new Set();

export function toast(type: ToastType, title: string, message?: string) {
  const t: Toast = { id: `${Date.now()}-${Math.random()}`, type, title, message };
  toastListeners.forEach(fn => fn(t));
}
toast.success = (title: string, msg?: string) => toast('success', title, msg);
toast.error   = (title: string, msg?: string) => toast('error',   title, msg);
toast.warning = (title: string, msg?: string) => toast('warning', title, msg);
toast.info    = (title: string, msg?: string) => toast('info',    title, msg);

const ICONS = {
  success: CheckCircle,
  warning: AlertTriangle,
  error:   XCircle,
  info:    Info,
};
const COLORS: Record<ToastType, { border: string; icon: string; label: string }> = {
  success: { border: 'rgba(16,185,129,.4)',  icon: '#10b981', label: 'SYS_OK' },
  warning: { border: 'rgba(245,158,11,.4)',  icon: '#f59e0b', label: 'WARN'   },
  error:   { border: 'rgba(239,68,68,.4)',   icon: '#ef4444', label: 'ERR'    },
  info:    { border: 'rgba(59,130,246,.4)',  icon: '#60a5fa', label: 'INFO'   },
};

function ToastItem({ t, onRemove }: { t: Toast & { exiting?: boolean }; onRemove: (id: string) => void }) {
  const Icon = ICONS[t.type];
  const c = COLORS[t.type];
  return (
    <div className={t.exiting ? 'toast-exit' : 'toast-enter'}
      style={{ background: 'var(--ink-2)', border: `1px solid ${c.border}`, borderRadius: 2, padding: '10px 12px', display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 280, maxWidth: 340, position: 'relative' }}>
      <Icon size={14} style={{ color: c.icon, flexShrink: 0, marginTop: 1 }} />
      <div className="flex-1 min-w-0">
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.15em', color: c.icon, marginBottom: 2, textTransform: 'uppercase' }}>{c.label}</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-hi)', fontWeight: 500 }}>{t.title}</div>
        {t.message && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-mid)', marginTop: 2, lineHeight: 1.4 }}>{t.message}</div>}
      </div>
      <button onClick={() => onRemove(t.id)} style={{ color: 'var(--text-lo)', flexShrink: 0 }}>
        <X size={11} />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<(Toast & { exiting?: boolean })[]>([]);

  const remove = useCallback((id: string) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 250);
  }, []);

  useEffect(() => {
    const handler = (t: Toast) => {
      setToasts(prev => [...prev.slice(-4), t]);
      setTimeout(() => remove(t.id), 5000);
    };
    toastListeners.add(handler);
    return () => { toastListeners.delete(handler); };
  }, [remove]);

  if (!toasts.length) return null;
  return (
    <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 10000, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {toasts.map(t => <ToastItem key={t.id} t={t} onRemove={remove} />)}
    </div>
  );
}
