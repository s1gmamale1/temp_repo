import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { agentsApi, adminApi } from '../services/api';
import type { Agent } from '../services/api';
import { Bot, Search, Loader2, RefreshCw, CheckCircle, XCircle, MessageSquare, UserPlus2 } from 'lucide-react';

const ROLES = ['All', 'Task Lead', 'Researcher', 'Developer', 'Designer', 'QA', 'DevOps'];
const STATUSES = ['All', 'approved', 'pending', 'rejected'];
const STATUS_COLOR: Record<string, string> = { approved: '#10b981', pending: '#faa81a', rejected: '#ef4444', active: '#10b981' };

export default function Agents() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [pending, setPending] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('All');
  const [status, setStatus] = useState('All');

  useEffect(() => {
    const u = localStorage.getItem('claw_user');
    if (u) setIsAdmin(JSON.parse(u).role === 'admin');
  }, []);

  const fetch = async () => {
    setLoading(true); setError(null);
    try {
      const params: any = {};
      if (status !== 'All') params.status = status;
      if (role !== 'All') params.role = role;
      const d = await agentsApi.list(params);
      setAgents(Array.isArray(d) ? d : (d?.agents || d?.data || []));
      if (isAdmin) { const p = await adminApi.getPendingAgents(); setPending(Array.isArray(p) ? p : (p?.agents || [])); }
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, [role, status, isAdmin]);

  const approve = async (id: string) => { try { await adminApi.approveAgent(id); fetch(); } catch { } };
  const reject = async (id: string) => { try { await adminApi.rejectAgent(id); fetch(); } catch { } };

  const filtered = agents.filter(a =>
    (a.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (a.handle ?? '').toLowerCase().includes(search.toLowerCase()) ||
    a.skills?.some((s: string) => s.toLowerCase().includes(search.toLowerCase()))
  );

  const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)' };

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <div className="ops-section-header" style={{ marginBottom: 4 }}>Core</div>
          <h1 style={{ ...mono, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-hi)' }}>AGENTS</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetch} disabled={loading} style={{ background: 'var(--ink-2)', border: '1px solid var(--ink-4)', borderRadius: 2, padding: '6px 8px', cursor: 'pointer', color: 'var(--text-lo)' }}>
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => navigate('/agents/register')} className="ops-btn flex items-center gap-1">
            <UserPlus2 size={11} /> Register Agent
          </button>
        </div>
      </div>

      {/* Pending banner */}
      {isAdmin && pending.length > 0 && (
        <div style={{ background: '#faa81a0d', border: '1px solid #faa81a33', borderRadius: 2, padding: '12px 16px' }}>
          <div style={{ ...mono, fontSize: 10, color: '#faa81a', letterSpacing: '0.1em', marginBottom: 10 }}>⚠ PENDING APPROVALS ({pending.length})</div>
          <div className="space-y-2">
            {pending.map(a => (
              <div key={a.id} className="flex items-center gap-3" style={{ background: 'var(--ink-3)', border: '1px solid var(--ink-4)', borderRadius: 2, padding: '8px 12px' }}>
                <Bot size={14} style={{ color: 'var(--text-lo)', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <span style={{ ...mono, fontSize: 12, color: 'var(--text-hi)' }}>{a.name}</span>
                  <span style={{ ...mono, fontSize: 9, color: 'var(--text-lo)', marginLeft: 8 }}>{a.role}</span>
                </div>
                <button onClick={() => approve(a.id)} style={{ ...mono, fontSize: 10, color: '#10b981', background: '#10b98115', border: '1px solid #10b98133', borderRadius: 2, padding: '3px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <CheckCircle size={10} /> Approve
                </button>
                <button onClick={() => reject(a.id)} style={{ ...mono, fontSize: 10, color: '#ef4444', background: '#ef444415', border: '1px solid #ef444433', borderRadius: 2, padding: '3px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <XCircle size={10} /> Reject
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={11} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-lo)' }} />
          <input type="text" placeholder="Search by name, handle, or skills..." value={search} onChange={e => setSearch(e.target.value)}
            className="ops-input" style={{ paddingLeft: 28, width: '100%' }} />
        </div>
        <select value={role} onChange={e => setRole(e.target.value)} className="ops-input" style={{ width: 'auto', cursor: 'pointer' }}>
          {ROLES.map(r => <option key={r} value={r}>{r === 'All' ? 'All Roles' : r}</option>)}
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)} className="ops-input" style={{ width: 'auto', cursor: 'pointer' }}>
          {STATUSES.map(s => <option key={s} value={s}>{s === 'All' ? 'All Statuses' : s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
      </div>

      {error && <div style={{ ...mono, fontSize: 11, color: '#ef4444', background: 'var(--ink-2)', border: '1px solid #7f1d1d', borderRadius: 2, padding: '10px 14px' }}>ERR: {error}</div>}

      {loading ? (
        <div className="flex items-center justify-center h-40 gap-3">
          <Loader2 size={14} className="animate-spin" style={{ color: 'var(--amber)' }} />
          <span style={{ ...mono, fontSize: 11, color: 'var(--text-lo)' }}>LOADING AGENTS...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="ops-panel p-12 text-center space-y-3">
          <Bot size={28} style={{ color: 'var(--text-lo)', margin: '0 auto' }} />
          <p style={{ ...mono, fontSize: 11, color: 'var(--text-lo)' }}>— no agents found —</p>
          <button onClick={() => navigate('/agents/register')} style={{ ...mono, fontSize: 10, color: 'var(--amber)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
            Register an agent
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map(a => {
              const sc = STATUS_COLOR[a.status] || 'var(--text-lo)';
              const initials = a.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
              return (
                <div key={a.id} className="ops-panel" style={{ padding: '16px 18px', cursor: 'pointer' }} onClick={() => navigate(`/agents/${a.id}`)}>
                  <div className="flex items-start gap-3 mb-3">
                    <div style={{ width: 38, height: 38, borderRadius: 2, background: 'linear-gradient(135deg,var(--amber-dark),var(--amber))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, ...mono, fontSize: 13, fontWeight: 700, color: '#000' }}>
                      {initials}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="flex items-center gap-2">
                        <span style={{ ...mono, fontSize: 13, fontWeight: 700, color: 'var(--text-hi)' }}>{a.name}</span>
                        <span style={{ ...mono, fontSize: 9, color: 'var(--text-lo)' }}>@{a.handle}</span>
                      </div>
                      <div style={{ ...mono, fontSize: 10, color: 'var(--text-lo)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>{a.role}</div>
                    </div>
                    <span style={{ ...mono, fontSize: 9, color: sc, border: `1px solid ${sc}44`, borderRadius: 2, padding: '2px 7px', textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>
                      {a.status}
                    </span>
                  </div>

                  {a.skills?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {a.skills.slice(0, 4).map((s: string) => (
                        <span key={s} style={{ ...mono, fontSize: 9, color: 'var(--text-lo)', background: 'var(--ink-3)', border: '1px solid var(--ink-4)', borderRadius: 2, padding: '2px 6px' }}>{s}</span>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2 pt-3" style={{ borderTop: '1px solid var(--ink-4)' }}>
                    <button onClick={e => { e.stopPropagation(); navigate(`/chat?agent=${a.id}`); }} className="ops-btn flex-1 flex items-center justify-center gap-1">
                      <MessageSquare size={10} /> Message
                    </button>
                    <button onClick={e => { e.stopPropagation(); navigate(`/projects?assign=${a.id}`); }} className="ops-btn flex-1 flex items-center justify-center gap-1">
                      <UserPlus2 size={10} /> Assign
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ ...mono, fontSize: 10, color: 'var(--text-lo)', textAlign: 'center' }}>
            Showing {filtered.length} agent{filtered.length !== 1 ? 's' : ''}
          </div>
        </>
      )}
    </div>
  );
}