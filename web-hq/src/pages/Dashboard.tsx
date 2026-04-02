import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { projectsApi, machinesApi, agentsApi, wsClient } from '../services/api';
import { Bot, FolderKanban, CheckSquare, DollarSign, ArrowRight, Zap, Loader2, AlertCircle, Server, WifiOff, Trash2, Cpu } from 'lucide-react';

function timeAgo(ts: string) {
  if (!ts) return 'Never';
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}

function agentStatusInfo(a: any) {
  const hb = a.last_heartbeat || a.rnd_last_run;
  if (!hb) return { label: 'OFFLINE', cls: 'ops-badge-red', dot: 'ops-dot-red', dimmed: true };
  const mins = (Date.now() - new Date(hb).getTime()) / 60000;
  if (mins < 5) return { label: 'ONLINE', cls: 'ops-badge-green', dot: 'ops-dot-green ops-dot-pulse', dimmed: false };
  if (mins < 30) return { label: 'IDLE', cls: 'ops-badge-amber', dot: 'ops-dot-amber', dimmed: false };
  return { label: 'OFFLINE', cls: 'ops-badge-red', dot: 'ops-dot-red', dimmed: true };
}

function agentInitials(name: string) {
  return name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '??';
}

const AVATAR_COLORS = ['#06b6d4', '#10b981', '#8b5cf6', '#f59e0b', '#3b82f6', '#ef4444', '#ec4899'];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function machineStatus(m: any) {
  if (!m.last_seen) return { label: 'OFFLINE', cls: 'ops-badge-red', dot: 'ops-dot-red' };
  const mins = (Date.now() - new Date(m.last_seen).getTime()) / 60000;
  if (mins < 5) return { label: 'ONLINE', cls: 'ops-badge-green', dot: 'ops-dot-green ops-dot-pulse' };
  if (mins < 30) return { label: 'IDLE', cls: 'ops-badge-amber', dot: 'ops-dot-amber' };
  return { label: 'OFFLINE', cls: 'ops-badge-red', dot: 'ops-dot-red' };
}

export default function Dashboard() {
  const [projects, setProjects] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalAgents: 0, activeProjects: 0, totalTasks: 0, monthlyCost: 0, monthlyBudget: 275 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const deleteMachine = async (id: string) => {
    if (!confirm('Delete this machine?')) return;
    await machinesApi.delete(id);
    setMachines(prev => prev.filter(m => m.id !== id));
  };

  const load = async () => {
    try {
      setLoading(true); setError(null);
      const [pd, md, ad] = await Promise.allSettled([projectsApi.list(), machinesApi.list(), agentsApi.list()]);
      const pList = pd.status === 'fulfilled' ? (pd.value.projects || []) : [];
      const mList = md.status === 'fulfilled' ? (md.value.machines || []) : [];
      const aList = ad.status === 'fulfilled' ? (ad.value.agents || ad.value || []) : [];
      setProjects(pList); setMachines(mList);
      let monthlyCost = 0;
      try { const { costsApi } = await import('../services/api'); const c = await costsApi.getSummary(); monthlyCost = c?.totalSpent || c?.total || 0; } catch {}
      setStats({ totalAgents: aList.length, activeProjects: pList.filter((p: any) => p.status === 'active').length, totalTasks: pList.reduce((s: number, p: any) => s + (p.stats?.activeTasks || 0), 0), monthlyCost, monthlyBudget: 275 });
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={20} className="animate-spin" style={{ color: 'var(--cyan)' }} />
      <span className="ml-3" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-mid)', letterSpacing: '0.1em' }}>LOADING DASHBOARD...</span>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--cyan)', opacity: 0.7, marginBottom: 4 }}>// Control Center</div>
          <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-hi)', textShadow: '0 0 20px rgba(34,211,238,0.15)' }}>DASHBOARD</h1>
        </div>
        <div className="flex items-center gap-2">
          {error && (
            <div className="flex items-center gap-2" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#ef4444' }}>
              <AlertCircle size={12} />{error}
              <button onClick={load} style={{ color: 'var(--cyan)', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}>Retry</button>
            </div>
          )}
          <button onClick={load} className="ops-btn ops-btn-primary"><Zap size={11} /> Refresh</button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Agents */}
        <div className="neon-card neon-card-cyan" style={{ padding: '1.1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--cyan)', opacity: 0.8 }}>Agents</span>
            <Bot size={12} style={{ color: 'var(--cyan)', opacity: 0.6 }} />
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-hi)', lineHeight: 1, textShadow: '0 0 20px rgba(34,211,238,0.2)' }}>{stats.totalAgents}</div>
        </div>

        {/* Active Projects */}
        <div className="neon-card" style={{ padding: '1.1rem', borderColor: 'rgba(16,185,129,0.15)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--green)', opacity: 0.8 }}>Projects</span>
            <FolderKanban size={12} style={{ color: 'var(--green)', opacity: 0.6 }} />
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.8rem', fontWeight: 700, color: 'var(--green)', lineHeight: 1, textShadow: '0 0 20px rgba(16,185,129,0.3)' }}>{stats.activeProjects}</div>
        </div>

        {/* Active Tasks */}
        <div className="neon-card neon-card-pm" style={{ padding: '1.1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--amber)', opacity: 0.8 }}>Tasks</span>
            <CheckSquare size={12} style={{ color: 'var(--amber)', opacity: 0.6 }} />
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.8rem', fontWeight: 700, color: 'var(--amber)', lineHeight: 1, textShadow: '0 0 20px rgba(245,158,11,0.3)' }}>{stats.totalTasks}</div>
        </div>

        {/* Monthly Cost */}
        <div className="neon-card neon-card-worker" style={{ padding: '1.1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--blue)', opacity: 0.8 }}>Monthly Cost</span>
            <DollarSign size={12} style={{ color: 'var(--blue)', opacity: 0.6 }} />
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.4rem', fontWeight: 700, color: 'var(--blue)', lineHeight: 1, textShadow: '0 0 20px rgba(59,130,246,0.3)' }}>${stats.monthlyCost.toFixed(2)}</div>
          <div className="ops-bar-track" style={{ marginTop: 10 }}>
            <div className="ops-bar-fill" style={{ width: Math.min((stats.monthlyCost / stats.monthlyBudget) * 100, 100) + '%', background: 'linear-gradient(90deg, rgba(59,130,246,0.6), #3b82f6)', boxShadow: '0 0 8px rgba(59,130,246,0.5)' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-lo)' }}>
            <span>$0</span><span>${stats.monthlyBudget}</span>
          </div>
        </div>
      </div>

      {/* Machine Fleet */}
      <div>
        <div className="ops-section-header"><Server size={11} /> Mac Mini Fleet</div>
        {machines.length === 0 ? (
          <div className="neon-card" style={{ padding: '2.5rem', textAlign: 'center' }}>
            <WifiOff size={22} style={{ color: 'var(--text-dim)', margin: '0 auto 10px' }} />
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-lo)' }}>No machines registered yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {machines.map((m: any) => {
              const st = machineStatus(m);
              return (
                <div key={m.id} className="neon-card" style={{ padding: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className={"ops-dot " + st.dot} />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--text-hi)' }}>{m.hostname}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className={"ops-badge " + st.cls} style={{ fontSize: 9 }}>{st.label}</span>
                      <button onClick={() => deleteMachine(m.id)} title="Delete"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: 2, display: 'flex' }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-dim)')}>
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {m.ip_address && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-lo)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>IP</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--cyan)' }}>{m.ip_address}</span>
                      </div>
                    )}
                    {[['Agents', m.agents?.length || 0], ['Last Seen', timeAgo(m.last_seen)]].map(([k, v]) => (
                      <div key={String(k)} style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-lo)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{k}</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-mid)' }}>{v}</span>
                      </div>
                    ))}
                  </div>
                  {m.agents?.length > 0 && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--ink-4)', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {m.agents.map((a: any) => (
                        <span key={a.agent_id} className="ops-badge ops-badge-purple" style={{ fontSize: 9 }}>{a.handle || a.agent_name}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Projects */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div className="ops-section-header" style={{ marginBottom: 0 }}><FolderKanban size={11} /> Projects</div>
          <Link to="/projects" className="ops-btn" style={{ padding: '3px 10px', fontSize: 9 }}>View All <ArrowRight size={9} /></Link>
        </div>
        {projects.length === 0 ? (
          <div className="neon-card" style={{ padding: '2rem', textAlign: 'center' }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-lo)' }}>
              No projects yet. <Link to="/new-project" style={{ color: 'var(--cyan)', textDecoration: 'none' }}>Create one →</Link>
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {projects.slice(0, 6).map((p: any) => (
              <div key={p.id} className="neon-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--text-hi)', lineHeight: 1.3 }}>{p.name}</h3>
                  <span className={"ops-badge " + (p.status === 'active' ? 'ops-badge-green' : p.status === 'paused' ? 'ops-badge-amber' : 'ops-badge-gray')} style={{ fontSize: 8, flexShrink: 0 }}>
                    {(p.status || 'unknown').toUpperCase()}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {[['Tasks', (p.stats?.activeTasks || 0) + ' / ' + (p.stats?.totalTasks || 0)], ['Today', '$' + (p.stats?.todayCost || 0).toFixed(2)], ['Month', '$' + (p.stats?.monthCost || 0).toFixed(2)]].map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-lo)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{k}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-mid)' }}>{v}</span>
                    </div>
                  ))}
                </div>
                <Link to={"/projects/" + p.id} className="ops-btn ops-btn-primary" style={{ width: '100%', justifyContent: 'center', fontSize: 10, marginTop: 'auto' }}>
                  Open <ArrowRight size={9} />
                </Link>
              </div>
            ))}
            <Link to="/new-project" className="neon-card" style={{
              padding: '1rem', minHeight: 150, cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
              border: '1px dashed var(--ink-5)', textDecoration: 'none',
              transition: 'border-color 120ms',
            }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = 'rgba(34,211,238,0.3)')}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = 'var(--ink-5)')}>
              <Cpu size={20} style={{ color: 'var(--text-dim)' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-lo)', letterSpacing: '0.1em' }}>NEW PROJECT</span>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
