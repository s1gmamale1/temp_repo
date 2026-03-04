import { useState, useEffect } from 'react';
import { Activity as ActivityIcon, Loader2, RefreshCw, Zap } from 'lucide-react';

interface ActivityItem { id: string; action: string; target: string; time: string; project: string; type?: string; }

const TYPE_COLOR: Record<string, string> = { task: '#faa81a', agent: '#10b981', project: '#60a5fa', system: 'var(--text-lo)' };

export default function Activity() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = async () => {
    setLoading(true);
    try { setItems([]); } finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, []);

  const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)' };

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <div className="ops-section-header" style={{ marginBottom: 4 }}>Core</div>
          <h1 style={{ ...mono, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-hi)' }}>ACTIVITY LOG</h1>
        </div>
        <button onClick={fetch} disabled={loading} className="ops-btn flex items-center gap-1">
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="ops-panel p-0 overflow-hidden">
        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--ink-4)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Zap size={12} style={{ color: 'var(--amber)' }} />
          <span style={{ ...mono, fontSize: 10, color: 'var(--text-mid)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>All Activity</span>
          <span style={{ ...mono, fontSize: 9, color: 'var(--text-lo)', marginLeft: 'auto' }}>Live</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-32 gap-3">
            <Loader2 size={14} className="animate-spin" style={{ color: 'var(--amber)' }} />
            <span style={{ ...mono, fontSize: 11, color: 'var(--text-lo)' }}>LOADING...</span>
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding: '56px 0', textAlign: 'center' }}>
            <ActivityIcon size={28} style={{ color: 'var(--text-lo)', margin: '0 auto 12px', opacity: 0.4 }} />
            <p style={{ ...mono, fontSize: 12, color: 'var(--text-lo)' }}>— no activity recorded yet —</p>
            <p style={{ ...mono, fontSize: 10, color: 'var(--text-lo)', marginTop: 6, opacity: 0.6 }}>Agent events will appear here as they run</p>
          </div>
        ) : items.map((item, i) => (
          <div key={item.id} style={{ padding: '12px 18px', borderBottom: i < items.length - 1 ? '1px solid var(--ink-4)' : 'none', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: TYPE_COLOR[item.type || 'system'], marginTop: 5, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <span style={{ ...mono, fontSize: 12, color: 'var(--text-hi)' }}>{item.action}</span>
              <span style={{ ...mono, fontSize: 12, color: 'var(--text-lo)' }}> — {item.target}</span>
              <div style={{ ...mono, fontSize: 9, color: 'var(--text-lo)', marginTop: 3 }}>{item.time} · {item.project}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}