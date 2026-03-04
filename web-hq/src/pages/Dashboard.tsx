import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { projectsApi, machinesApi } from '../services/api';
import { Cpu, FolderKanban, CheckSquare, DollarSign, ArrowRight, Zap, Loader2, AlertCircle, Server, WifiOff } from 'lucide-react';

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
  const [stats, setStats] = useState({ macMinis: 0, activeProjects: 0, totalTasks: 0, monthlyCost: 0, monthlyBudget: 275 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true); setError(null);
      const [pd, md] = await Promise.allSettled([projectsApi.list(), machinesApi.list()]);
      const pList = pd.status === 'fulfilled' ? (pd.value.projects || []) : [];
      const mList = md.status === 'fulfilled' ? (md.value.machines || []) : [];
      setProjects(pList); setMachines(mList);
      let monthlyCost = 0;
      try { const { costsApi } = await import('../services/api'); const c = await costsApi.getSummary(); monthlyCost = c?.total || 0; } catch {}
      setStats({ macMinis: mList.length, activeProjects: pList.filter((p: any) => p.status === 'active').length, totalTasks: pList.reduce((s: number, p: any) => s + (p.stats?.activeTasks || 0), 0), monthlyCost, monthlyBudget: 275 });
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={20} className="animate-spin" style={{ color: 'var(--amber)' }} />
      <span className="ml-3" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-mid)' }}>LOADING DASHBOARD...</span>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <div className="ops-section-header" style={{ marginBottom: 4 }}>Control Center</div>
          <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-hi)' }}>DASHBOARD</h1>
        </div>
        <div className="flex items-center gap-2">
          {error && <div className="flex items-center gap-2" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#ef4444' }}><AlertCircle size={12} />{error}<button onClick={load} style={{ color: 'var(--amber)', textDecoration: 'underline' }}>Retry</button></div>}
          <button onClick={load} className="ops-btn"><Zap size={11} /> Refresh</button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="ops-stat"><div className="flex items-center justify-between mb-3"><span className="ops-label">Mac Minis</span><Cpu size={13} style={{ color: 'var(--amber)' }} /></div><div className="ops-value">{stats.macMinis}</div></div>
        <div className="ops-stat"><div className="flex items-center justify-between mb-3"><span className="ops-label">Active Projects</span><FolderKanban size={13} style={{ color: '#10b981' }} /></div><div className="ops-value" style={{ color: '#10b981' }}>{stats.activeProjects}</div></div>
        <div className="ops-stat"><div className="flex items-center justify-between mb-3"><span className="ops-label">Active Tasks</span><CheckSquare size={13} style={{ color: '#f59e0b' }} /></div><div className="ops-value" style={{ color: '#f59e0b' }}>{stats.totalTasks}</div></div>
        <div className="ops-stat">
          <div className="flex items-center justify-between mb-3"><span className="ops-label">Monthly Cost</span><DollarSign size={13} style={{ color: '#60a5fa' }} /></div>
          <div className="ops-value" style={{ fontSize: '1.5rem' }}>${stats.monthlyCost.toFixed(2)}</div>
          <div className="ops-bar-track" style={{ marginTop: 8 }}><div className="ops-bar-fill" style={{ width: Math.min((stats.monthlyCost / stats.monthlyBudget) * 100, 100) + '%' }} /></div>
          <div className="flex justify-between mt-1" style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-lo)' }}><span>$0</span><span>${stats.monthlyBudget}</span></div>
        </div>
      </div>

      <div>
        <div className="ops-section-header"><Server size={11} /> Mac Mini Fleet</div>
        {machines.length === 0 ? (
          <div className="ops-panel p-8 text-center"><WifiOff size={24} className="mx-auto mb-3" style={{ color: 'var(--text-dim)' }} /><p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-lo)' }}>No Mac Minis registered yet</p></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {machines.map((m: any) => {
              const st = machineStatus(m);
              return (
                <div key={m.id} className="ops-panel p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2"><span className={"ops-dot " + st.dot} /><span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600 }}>{m.hostname}</span></div>
                    <span className={"ops-badge " + st.cls}>{st.label}</span>
                  </div>
                  <div className="space-y-1.5">
                    {m.ip_address && <div className="flex justify-between"><span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-lo)', textTransform: 'uppercase' }}>IP</span><span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-mid)' }}>{m.ip_address}</span></div>}
                    <div className="flex justify-between"><span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-lo)', textTransform: 'uppercase' }}>Agents</span><span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-mid)' }}>{m.agents?.length || 0}</span></div>
                    <div className="flex justify-between"><span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-lo)', textTransform: 'uppercase' }}>Last Seen</span><span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-mid)' }}>{timeAgo(m.last_seen)}</span></div>
                  </div>
                  {m.agents?.length > 0 && <div className="mt-3 pt-3 flex flex-wrap gap-1" style={{ borderTop: '1px solid var(--ink-4)' }}>{m.agents.map((a: any) => <span key={a.agent_id} className="ops-badge ops-badge-purple" style={{ fontSize: 9 }}>{a.handle || a.agent_name}</span>)}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="ops-section-header" style={{ marginBottom: 0 }}><FolderKanban size={11} /> Projects</div>
          <Link to="/projects" className="ops-btn" style={{ padding: '4px 10px', fontSize: 10 }}>View All <ArrowRight size={10} /></Link>
        </div>
        {projects.length === 0 ? (
          <div className="ops-panel p-8 text-center"><p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-lo)' }}>No projects. <Link to="/new-project" style={{ color: 'var(--amber)' }}>Create one</Link></p></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {projects.slice(0, 6).map((p: any) => (
              <div key={p.id} className="ops-panel p-4">
                <div className="flex items-start justify-between mb-3">
                  <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--text-hi)' }}>{p.name}</h3>
                  <span className={"ops-badge " + (p.status === 'active' ? 'ops-badge-green' : p.status === 'paused' ? 'ops-badge-amber' : 'ops-badge-gray')} style={{ fontSize: 9 }}>{(p.status || 'unknown').toUpperCase()}</span>
                </div>
                <div className="space-y-1.5 mb-4">
                  {[['Tasks', (p.stats?.activeTasks || 0) + ' / ' + (p.stats?.totalTasks || 0)], ['Today', '$' + (p.stats?.todayCost || 0).toFixed(2)], ['Month', '$' + (p.stats?.monthCost || 0).toFixed(2)]].map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-lo)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{k}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-mid)' }}>{v}</span>
                    </div>
                  ))}
                </div>
                <Link to={"/projects/" + p.id} className="ops-btn" style={{ width: '100%', justifyContent: 'center', display: 'flex' }}>Open <ArrowRight size={10} /></Link>
              </div>
            ))}
            <Link to="/new-project" className="ops-panel flex flex-col items-center justify-center gap-2 p-4" style={{ border: '1px dashed var(--ink-4)', minHeight: 160, cursor: 'pointer' }}>
              <span style={{ fontSize: 24, color: 'var(--text-dim)' }}>+</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-lo)' }}>New Project</span>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
