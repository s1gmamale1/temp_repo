import { useState, useEffect, useCallback } from 'react';
import { adminApi, orchestrationApi, wsClient } from '../services/api';
import { toast } from '../components/Toast';
import { Shield, CheckCircle, XCircle, Loader2, RefreshCw, Search, Bot, Users, UserCheck, Trash2, Cpu, Radio, Zap, ScrollText, AlertTriangle, Info, AlertOctagon } from 'lucide-react';

const TYPE_META: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  pm:     { icon: <Cpu size={11} />,   color: '#f59e0b', label: 'PM' },
  worker: { icon: <Bot size={11} />,   color: '#3b82f6', label: 'WORKER' },
  rnd:    { icon: <Radio size={11} />, color: '#ef4444', label: 'R&D' },
};
const getTypeMeta = (t?: string) => TYPE_META[t ?? ''] ?? TYPE_META['worker'];

// ── Log Viewer ──────────────────────────────────────────────────────────────

type LogEntry = { time: string; level: string; msg: string; [key: string]: unknown };

const LEVEL_STYLE: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  info:  { color: '#60a5fa', icon: <Info size={10} />,          label: 'INFO'  },
  warn:  { color: '#f59e0b', icon: <AlertTriangle size={10} />, label: 'WARN'  },
  error: { color: '#ef4444', icon: <AlertOctagon size={10} />,  label: 'ERROR' },
  debug: { color: '#94a3b8', icon: <Info size={10} />,          label: 'DEBUG' },
  fatal: { color: '#f87171', icon: <AlertOctagon size={10} />,  label: 'FATAL' },
};
const getLevelStyle = (l: string) => LEVEL_STYLE[l] ?? LEVEL_STYLE['info'];

function LogViewer() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [levelFilter, setLevelFilter] = useState('');
  const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)' };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.getLogs({ limit: 200, ...(levelFilter ? { level: levelFilter } : {}) });
      setLogs(res.logs || []);
    } catch (e: any) {
      toast.error('Failed to load logs', e.message);
    } finally {
      setLoading(false);
    }
  }, [levelFilter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <select value={levelFilter} onChange={e => setLevelFilter(e.target.value)}
          className="ops-input" style={{ width: 120, ...mono, fontSize: 11 }}>
          <option value="">All levels</option>
          <option value="info">INFO</option>
          <option value="warn">WARN</option>
          <option value="error">ERROR</option>
          <option value="debug">DEBUG</option>
        </select>
        <button onClick={load} disabled={loading} className="ops-btn flex items-center gap-1">
          {loading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />} Refresh
        </button>
        <span style={{ ...mono, fontSize: 10, color: 'var(--text-lo)', marginLeft: 'auto' }}>{logs.length} entries</span>
      </div>
      <div style={{ background: 'var(--ink-1)', border: '1px solid var(--ink-4)', borderRadius: 2, maxHeight: 520, overflowY: 'auto' }}>
        {logs.length === 0 ? (
          <p style={{ ...mono, fontSize: 11, color: 'var(--text-lo)', padding: '32px 0', textAlign: 'center' }}>
            {loading ? 'Loading…' : '— no log entries captured yet —'}
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--ink-2)', zIndex: 1 }}>
              <tr>
                {['Time', 'Level', 'Message', 'Meta'].map(h => (
                  <th key={h} style={{ ...mono, fontSize: 9, letterSpacing: '0.1em', color: 'var(--text-lo)', textTransform: 'uppercase', padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid var(--ink-4)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((entry, i) => {
                const ls = getLevelStyle(entry.level);
                const { time, level, msg, ...meta } = entry;
                const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
                return (
                  <tr key={i} style={{ borderBottom: '1px solid var(--ink-3)' }}>
                    <td style={{ ...mono, fontSize: 10, color: 'var(--text-lo)', padding: '5px 10px', whiteSpace: 'nowrap' }}>
                      {new Date(time).toLocaleTimeString()}
                    </td>
                    <td style={{ padding: '5px 10px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, ...mono, fontSize: 9, letterSpacing: '0.08em', color: ls.color, background: ls.color + '18', border: `1px solid ${ls.color}33`, borderRadius: 2, padding: '2px 6px' }}>
                        {ls.icon} {ls.label}
                      </span>
                    </td>
                    <td style={{ ...mono, fontSize: 11, color: 'var(--text-hi)', padding: '5px 10px', maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={msg}>{msg}</td>
                    <td style={{ ...mono, fontSize: 10, color: 'var(--text-lo)', padding: '5px 10px', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={metaStr}>{metaStr}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Admin Panel ──────────────────────────────────────────────────────────────

export default function AdminPanel() {
  const [tab, setTab] = useState<'pending' | 'approved' | 'users' | 'pending_users' | 'logs'>('pending');
  const [pending, setPending] = useState<any[]>([]);
  const [approved, setApproved] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [pendingUsers, setPendingUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actLoad, setActLoad] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [sweeping, setSweeping] = useState(false);
  const [sweepResult, setSweepResult] = useState<{ scanned: number; assigned: number; skipped: number; errors: number } | null>(null);

  const fetchData = async () => {
    setLoading(true); setError(null);
    try {
      const [pData, aData, uData, puData] = await Promise.allSettled([
        adminApi.getPendingAgents(),
        adminApi.getApprovedAgents(),
        adminApi.getUsers(),
        fetch('/api/admin/users/pending', { headers: { 'Authorization': `Bearer ${localStorage.getItem('claw_token')}` } }).then(r => r.json()),
      ]);
      setPending(pData.status === 'fulfilled' ? (pData.value?.agents || pData.value || []) : []);
      setApproved(aData.status === 'fulfilled' ? (aData.value?.agents || aData.value || []) : []);
      setUsers(uData.status === 'fulfilled' ? (uData.value?.users || uData.value || []) : []);
      setPendingUsers(puData.status === 'fulfilled' ? (puData.value?.users || []) : []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  // Real-time: new agent registered → add to pending list immediately
  useEffect(() => {
    const onRegistered = (d: any) => {
      const newAgent = { id: d?.id, name: d?.name, handle: d?.handle, role: d?.role, agent_type: d?.agent_type, created_at: d?.registered_at };
      setPending(prev => prev.some(a => a.id === newAgent.id) ? prev : [newAgent, ...prev]);
      setOk(`New agent "${d?.name}" is waiting for approval`);
    };
    const onApproved = () => fetchData();
    const onStatusChanged = (d: any) => {
      setApproved(prev => prev.map(a => a.id === d.agent_id ? { ...a, status: d.status } : a));
    };
    const onUserRegistered = (d: any) => {
      const u = d?.user || d;
      setPendingUsers(prev => prev.some(x => x.id === u.id) ? prev : [u, ...prev]);
      setOk(`New user "${u.name || u.login}" is waiting for approval`);
    };
    wsClient.on('agent:registered', onRegistered);
    wsClient.on('agent:approved', onApproved);
    wsClient.on('agent:status_changed', onStatusChanged);
    wsClient.on('user:registered', onUserRegistered);
    return () => {
      wsClient.off('agent:registered', onRegistered);
      wsClient.off('agent:approved', onApproved);
      wsClient.off('agent:status_changed', onStatusChanged);
      wsClient.off('user:registered', onUserRegistered);
    };
  }, []);

  const approve = async (id: string) => {
    setActLoad(id);
    try { await adminApi.approveAgent(id); setOk('Agent approved'); setPending(p => p.filter(a => a.id !== id)); fetchData(); toast.success('Agent approved'); }
    catch (e: any) { setError(e.message); toast.error('Approve failed', e.message); }
    finally { setActLoad(null); }
  };
  const reject = async (id: string) => {
    setActLoad(id);
    try { await adminApi.rejectAgent(id); setOk('Agent rejected'); setPending(p => p.filter(a => a.id !== id)); toast.success('Agent rejected'); }
    catch (e: any) { setError(e.message); toast.error('Reject failed', e.message); }
    finally { setActLoad(null); }
  };
  const deleteAgent = async (id: string, name: string) => {
    if (!window.confirm(`Permanently delete agent "${name}"? This cannot be undone.`)) return;
    setActLoad(id);
    try {
      await adminApi.deleteAgent(id);
      setOk(`Agent ${name} deleted`);
      setPending(p => p.filter(a => a.id !== id));
      setApproved(a => a.filter(a => a.id !== id));
      toast.success('Agent deleted', name);
    }
    catch (e: any) { setError(e.message); toast.error('Delete failed', e.message); }
    finally { setActLoad(null); }
  };

  const approveUser = async (id: string) => {
    setActLoad(id);
    try {
      const res = await fetch(`/api/admin/users/${id}/approve`, { method: 'POST', headers: { 'Authorization': `Bearer ${localStorage.getItem('claw_token')}` } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setOk('User approved'); setPendingUsers(p => p.filter(u => u.id !== id)); fetchData();
      toast.success('User approved');
    } catch (e: any) { setError(e.message); toast.error('Approve failed', e.message); }
    finally { setActLoad(null); }
  };
  const rejectUser = async (id: string) => {
    setActLoad(id);
    try {
      const res = await fetch(`/api/admin/users/${id}/reject`, { method: 'POST', headers: { 'Authorization': `Bearer ${localStorage.getItem('claw_token')}` } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setOk('User rejected'); setPendingUsers(p => p.filter(u => u.id !== id));
      toast.success('User rejected');
    } catch (e: any) { setError(e.message); toast.error('Reject failed', e.message); }
    finally { setActLoad(null); }
  };

  const runSweep = async () => {
    setSweeping(true); setError(null); setOk(null); setSweepResult(null);
    try {
      const r = await orchestrationApi.sweep();
      setSweepResult(r);
      setOk(`Sweep complete — assigned: ${r.assigned}, skipped: ${r.skipped}, errors: ${r.errors}`);
    } catch (e: any) { setError(e.message); }
    finally { setSweeping(false); }
  };

  const ago = (d: string) => { const diff = Date.now() - new Date(d).getTime(); const h = Math.floor(diff / 3600000); const day = Math.floor(h / 24); return day > 0 ? `${day}d ago` : h > 0 ? `${h}h ago` : 'just now'; };

  const filtPending = pending.filter(a => a.name?.toLowerCase().includes(search.toLowerCase()) || a.role?.toLowerCase().includes(search.toLowerCase()));
  const filtApproved = approved.filter(a => a.name?.toLowerCase().includes(search.toLowerCase()) || a.role?.toLowerCase().includes(search.toLowerCase()));
  const filtUsers = users.filter(u => u.username?.toLowerCase().includes(search.toLowerCase()) || u.role?.toLowerCase().includes(search.toLowerCase()));

  const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)' };

  const TABS = [
    { id: 'pending', label: 'Pending Agents', icon: <Bot size={11} />, count: pending.length, color: '#faa81a' },
    { id: 'approved', label: 'Approved Agents', icon: <UserCheck size={11} />, count: approved.length, color: '#10b981' },
    { id: 'pending_users', label: 'Pending Users', icon: <Users size={11} />, count: pendingUsers.length, color: '#f87171' },
    { id: 'users', label: 'All Users', icon: <UserCheck size={11} />, count: users.length, color: '#60a5fa' },
    { id: 'logs', label: 'Server Logs', icon: <ScrollText size={11} />, count: null, color: '#a78bfa' },
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
        <div className="flex items-center gap-2">
          <button onClick={runSweep} disabled={sweeping} className="ops-btn flex items-center gap-1" title="Auto-assign all pending unassigned tasks">
            {sweeping ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />} Auto-Assign
          </button>
          <button onClick={fetchData} disabled={loading} className="ops-btn flex items-center gap-1">
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {TABS.filter(t => t.count !== null).map(t => (
          <div key={t.id} className="ops-stat" style={{ cursor: 'pointer', borderColor: tab === t.id ? t.color + '44' : undefined }} onClick={() => setTab(t.id as any)}>
            <div className="flex items-center justify-between mb-2">
              <span className="ops-label">{t.label}</span>
              <span style={{ color: t.color }}>{t.icon}</span>
            </div>
            <div style={{ ...mono, fontSize: 28, fontWeight: 700, color: t.color }}>{t.count}</div>
          </div>
        ))}
      </div>

      {(error || ok) && (
        <div style={{ ...mono, fontSize: 11, color: error ? '#ef4444' : '#10b981', background: 'var(--ink-2)', border: `1px solid ${error ? '#7f1d1d' : '#064e3b'}`, borderRadius: 2, padding: '10px 14px' }}>
          {error || ok}
          {sweepResult && !error && (
            <span style={{ marginLeft: 12, opacity: 0.7 }}>
              (scanned: {sweepResult.scanned} / assigned: {sweepResult.assigned} / skipped: {sweepResult.skipped})
            </span>
          )}
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
            {t.label}
            {t.count !== null && <span style={{ marginLeft: 6, fontSize: 9, opacity: 0.7 }}>({t.count})</span>}
          </button>
        ))}
      </div>

      {/* Search (not shown on logs tab) */}
      {tab !== 'logs' && (
        <div style={{ position: 'relative', maxWidth: 360 }}>
          <Search size={11} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-lo)' }} />
          <input type="text" placeholder={`Search ${tab}...`} value={search} onChange={e => { setSearch(e.target.value); setOk(null); setError(null); }}
            className="ops-input" style={{ paddingLeft: 28, width: '100%' }} />
        </div>
      )}

      {/* Pending */}
      {tab === 'pending' && (
        <div className="ops-panel p-0 overflow-hidden">
          {filtPending.length === 0 ? (
            <p style={{ ...mono, fontSize: 11, color: 'var(--text-lo)', padding: '32px 0', textAlign: 'center' }}>— no pending agent registrations —</p>
          ) : (
            <table className="ops-table w-full">
              <thead><tr><th>Agent</th><th>Type</th><th>Role</th><th>Requested</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
              <tbody>
                {filtPending.map(a => {
                  const tm = getTypeMeta(a.agent_type);
                  return (
                  <tr key={a.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: tm.color }}>{tm.icon}</span>
                        <span style={{ color: 'var(--text-hi)' }}>{a.name}</span>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: tm.color, background: tm.color + '18', border: `1px solid ${tm.color}33`, borderRadius: 2, padding: '2px 6px', letterSpacing: '0.08em' }}>{tm.label}</span>
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
                        <button onClick={() => deleteAgent(a.id, a.name)} disabled={actLoad === a.id}
                          style={{ ...mono, fontSize: 10, color: '#94a3b8', background: '#94a3b815', border: '1px solid #94a3b833', borderRadius: 2, padding: '3px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, opacity: actLoad === a.id ? 0.5 : 1 }}>
                          <Trash2 size={10} /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                  ); })}
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
              <thead><tr><th>Agent</th><th>Type</th><th>Role</th><th>Approved By</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
              <tbody>
                {filtApproved.map(a => {
                  const tm = getTypeMeta(a.agent_type);
                  return (
                  <tr key={a.id}>
                    <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ color: tm.color }}>{tm.icon}</span><span style={{ color: 'var(--text-hi)' }}>{a.name}</span></div></td>
                    <td><span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: tm.color, background: tm.color + '18', border: `1px solid ${tm.color}33`, borderRadius: 2, padding: '2px 6px', letterSpacing: '0.08em' }}>{tm.label}</span></td>
                    <td style={{ color: 'var(--text-lo)', fontSize: 10, textTransform: 'uppercase' }}>{a.role}</td>
                    <td style={{ color: 'var(--text-lo)', fontSize: 10 }}>{a.approvedBy || '—'}</td>
                    <td><span style={{ ...mono, fontSize: 9, color: a.status === 'active' ? '#10b981' : 'var(--text-lo)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{a.status}</span></td>
                    <td style={{ textAlign: 'right' }}>
                      <button onClick={() => deleteAgent(a.id, a.name)} disabled={actLoad === a.id}
                        style={{ ...mono, fontSize: 10, color: '#ef4444', background: '#ef444415', border: '1px solid #ef444433', borderRadius: 2, padding: '3px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto', opacity: actLoad === a.id ? 0.5 : 1 }}>
                        {actLoad === a.id ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />} Delete
                      </button>
                    </td>
                  </tr>
                  ); })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Pending Users */}
      {tab === 'pending_users' && (
        <div className="ops-panel p-0 overflow-hidden">
          {pendingUsers.length === 0 ? (
            <p style={{ ...mono, fontSize: 11, color: 'var(--text-lo)', padding: '32px 0', textAlign: 'center' }}>— no pending user registrations —</p>
          ) : (
            <table className="ops-table w-full">
              <thead><tr><th>Name</th><th>Login</th><th>Email</th><th>Requested</th><th>Actions</th></tr></thead>
              <tbody>
                {pendingUsers.map(u => (
                  <tr key={u.id}>
                    <td><span style={{ color: 'var(--text-hi)' }}>{u.name}</span></td>
                    <td><span style={{ ...mono, fontSize: 11 }}>{u.login}</span></td>
                    <td style={{ color: 'var(--text-lo)', fontSize: 11 }}>{u.email}</td>
                    <td style={{ color: 'var(--text-lo)', fontSize: 10 }}>{u.created_at ? ago(u.created_at) : '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => approveUser(u.id)} disabled={actLoad === u.id} className="ops-btn" style={{ color: '#10b981', borderColor: '#10b98133' }}>
                          {actLoad === u.id ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />} Approve
                        </button>
                        <button onClick={() => rejectUser(u.id)} disabled={actLoad === u.id} className="ops-btn" style={{ color: '#f87171', borderColor: '#f8717133' }}>
                          {actLoad === u.id ? <Loader2 size={11} className="animate-spin" /> : <XCircle size={11} />} Reject
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

      {/* Server Logs */}
      {tab === 'logs' && (
        <div className="ops-panel">
          <LogViewer />
        </div>
      )}
    </div>
  );
}