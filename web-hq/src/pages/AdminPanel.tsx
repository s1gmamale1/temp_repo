import { useState, useEffect } from 'react';
import { adminApi } from '../services/api';
import { Shield, CheckCircle, XCircle, Loader2, RefreshCw, Search, Bot, Users, UserCheck } from 'lucide-react';

export default function AdminPanel() {
  const [tab, setTab] = useState<'pending' | 'approved' | 'users'>('pending');
  const [pending, setPending] = useState<any[]>([]);
  const [approved, setApproved] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actLoad, setActLoad] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true); setError(null);
    try {
      const [pData, aData, uData] = await Promise.allSettled([
        adminApi.getPendingAgents(),
        adminApi.getApprovedAgents(),
        adminApi.getUsers(),
      ]);
      setPending(pData.status === 'fulfilled' ? (pData.value?.agents || pData.value || []) : []);
      setApproved(aData.status === 'fulfilled' ? (aData.value?.agents || aData.value || []) : []);
      setUsers(uData.status === 'fulfilled' ? (uData.value?.users || uData.value || []) : []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const approve = async (id: string) => {
    setActLoad(id);
    try { await adminApi.approveAgent(id); setOk('Agent approved'); setPending(p => p.filter(a => a.id !== id)); fetchData(); }
    catch (e: any) { setError(e.message); }
    finally { setActLoad(null); }
  };
  const reject = async (id: string) => {
    setActLoad(id);
    try { await adminApi.rejectAgent(id); setOk('Agent rejected'); setPending(p => p.filter(a => a.id !== id)); }
    catch (e: any) { setError(e.message); }
    finally { setActLoad(null); }
  };

  const ago = (d: string) => { const diff = Date.now() - new Date(d).getTime(); const h = Math.floor(diff / 3600000); const day = Math.floor(h / 24); return day > 0 ? `${day}d ago` : h > 0 ? `${h}h ago` : 'just now'; };

  const filtPending = pending.filter(a => a.name?.toLowerCase().includes(search.toLowerCase()) || a.role?.toLowerCase().includes(search.toLowerCase()));
  const filtApproved = approved.filter(a => a.name?.toLowerCase().includes(search.toLowerCase()) || a.role?.toLowerCase().includes(search.toLowerCase()));
  const filtUsers = users.filter(u => u.username?.toLowerCase().includes(search.toLowerCase()) || u.role?.toLowerCase().includes(search.toLowerCase()));

  const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)' };

  const TABS = [
    { id: 'pending', label: 'Pending Agents', icon: <Bot size={11} />, count: pending.length, color: '#faa81a' },
    { id: 'approved', label: 'Approved Agents', icon: <UserCheck size={11} />, count: approved.length, color: '#10b981' },
    { id: 'users', label: 'All Users', icon: <Users size={11} />, count: users.length, color: '#60a5fa' },
  ];

  if (loading) return (
    <div className="flex items-center justify-center h-64 gap-3">
      <Loader2 size={16} className="animate-spin" style={{ color: 'var(--amber)' }} />
      <span style={{ ...mono, fontSize: 11, color: 'var(--text-lo)' }}>LOADING ADMIN DATA...</span>
    </div>
  );

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <div className="ops-section-header" style={{ marginBottom: 4 }}>Admin</div>
          <h1 style={{ ...mono, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-hi)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Shield size={18} style={{ color: 'var(--amber)' }} /> ADMIN PANEL
          </h1>
        </div>
        <button onClick={fetchData} disabled={loading} className="ops-btn flex items-center gap-1">
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {TABS.map(t => (
          <div key={t.id} className="ops-stat" style={{ cursor: 'pointer', borderColor: tab === t.id ? t.color + '44' : undefined }} onClick={() => setTab(t.id as any)}>
            <div className="flex items-center justify-between mb-2">
              <span className="ops-label">{t.label.split(' ')[0] + ' ' + (t.label.split(' ')[1] || '')}</span>
              <span style={{ color: t.color }}>{t.icon}</span>
            </div>
            <div style={{ ...mono, fontSize: 28, fontWeight: 700, color: t.color }}>{t.count}</div>
          </div>
        ))}
      </div>

      {(error || ok) && (
        <div style={{ ...mono, fontSize: 11, color: error ? '#ef4444' : '#10b981', background: 'var(--ink-2)', border: `1px solid ${error ? '#7f1d1d' : '#064e3b'}`, borderRadius: 2, padding: '10px 14px' }}>
          {error || ok}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1" style={{ borderBottom: '1px solid var(--ink-4)' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)} style={{
            ...mono, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '7px 16px', border: '1px solid transparent', borderBottom: 'none', borderRadius: '2px 2px 0 0', cursor: 'pointer', transition: 'all 100ms', marginBottom: -1,
            background: tab === t.id ? 'var(--ink-2)' : 'transparent',
            color: tab === t.id ? t.color : 'var(--text-lo)',
            borderColor: tab === t.id ? 'var(--ink-4)' : 'transparent',
            borderBottomColor: tab === t.id ? 'var(--ink-2)' : 'transparent',
          }}>
            {t.id === 'pending' ? 'Pending' : t.id === 'approved' ? 'Approved' : 'Users'}
            <span style={{ marginLeft: 6, fontSize: 9, opacity: 0.7 }}>({t.count})</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ position: 'relative', maxWidth: 360 }}>
        <Search size={11} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-lo)' }} />
        <input type="text" placeholder={`Search ${tab}...`} value={search} onChange={e => { setSearch(e.target.value); setOk(null); setError(null); }}
          className="ops-input" style={{ paddingLeft: 28, width: '100%' }} />
      </div>

      {/* Pending */}
      {tab === 'pending' && (
        <div className="ops-panel p-0 overflow-hidden">
          {filtPending.length === 0 ? (
            <p style={{ ...mono, fontSize: 11, color: 'var(--text-lo)', padding: '32px 0', textAlign: 'center' }}>— no pending agent registrations —</p>
          ) : (
            <table className="ops-table w-full">
              <thead><tr><th>Agent</th><th>Role</th><th>Requested</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
              <tbody>
                {filtPending.map(a => (
                  <tr key={a.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Bot size={12} style={{ color: 'var(--text-lo)' }} />
                        <span style={{ color: 'var(--text-hi)' }}>{a.name}</span>
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-lo)', textTransform: 'uppercase', fontSize: 10 }}>{a.role}</td>
                    <td style={{ color: 'var(--text-lo)', fontSize: 10 }}>{a.requestedAt ? ago(a.requestedAt) : '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => approve(a.id)} disabled={actLoad === a.id}
                          style={{ ...mono, fontSize: 10, color: '#10b981', background: '#10b98115', border: '1px solid #10b98133', borderRadius: 2, padding: '3px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, opacity: actLoad === a.id ? 0.5 : 1 }}>
                          <CheckCircle size={10} /> Approve
                        </button>
                        <button onClick={() => reject(a.id)} disabled={actLoad === a.id}
                          style={{ ...mono, fontSize: 10, color: '#ef4444', background: '#ef444415', border: '1px solid #ef444433', borderRadius: 2, padding: '3px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, opacity: actLoad === a.id ? 0.5 : 1 }}>
                          <XCircle size={10} /> Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Approved */}
      {tab === 'approved' && (
        <div className="ops-panel p-0 overflow-hidden">
          {filtApproved.length === 0 ? (
            <p style={{ ...mono, fontSize: 11, color: 'var(--text-lo)', padding: '32px 0', textAlign: 'center' }}>— no approved agents —</p>
          ) : (
            <table className="ops-table w-full">
              <thead><tr><th>Agent</th><th>Role</th><th>Approved By</th><th>Status</th></tr></thead>
              <tbody>
                {filtApproved.map(a => (
                  <tr key={a.id}>
                    <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Bot size={12} style={{ color: '#10b981' }} /><span style={{ color: 'var(--text-hi)' }}>{a.name}</span></div></td>
                    <td style={{ color: 'var(--text-lo)', fontSize: 10, textTransform: 'uppercase' }}>{a.role}</td>
                    <td style={{ color: 'var(--text-lo)', fontSize: 10 }}>{a.approvedBy || '—'}</td>
                    <td><span style={{ ...mono, fontSize: 9, color: a.status === 'active' ? '#10b981' : 'var(--text-lo)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{a.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Users */}
      {tab === 'users' && (
        <div className="ops-panel p-0 overflow-hidden">
          {filtUsers.length === 0 ? (
            <p style={{ ...mono, fontSize: 11, color: 'var(--text-lo)', padding: '32px 0', textAlign: 'center' }}>— no users —</p>
          ) : (
            <table className="ops-table w-full">
              <thead><tr><th>Username</th><th>Role</th><th>Created</th><th>Last Login</th></tr></thead>
              <tbody>
                {filtUsers.map(u => (
                  <tr key={u.id}>
                    <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 22, height: 22, borderRadius: 2, background: 'var(--amber)', display: 'flex', alignItems: 'center', justifyContent: 'center', ...mono, fontSize: 10, fontWeight: 700, color: '#000', flexShrink: 0 }}>{u.username?.[0]?.toUpperCase() || '?'}</div><span style={{ color: 'var(--text-hi)' }}>{u.username}</span></div></td>
                    <td><span style={{ ...mono, fontSize: 9, color: u.role === 'admin' ? 'var(--amber)' : '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.08em', border: `1px solid ${u.role === 'admin' ? 'var(--amber)33' : '#60a5fa33'}`, borderRadius: 2, padding: '2px 6px' }}>{u.role}</span></td>
                    <td style={{ color: 'var(--text-lo)', fontSize: 10 }}>{u.createdAt ? ago(u.createdAt) : '—'}</td>
                    <td style={{ color: 'var(--text-lo)', fontSize: 10 }}>{u.lastLogin ? ago(u.lastLogin) : 'never'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}