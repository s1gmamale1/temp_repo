import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { projectsApi } from '../services/api';
import { Plus, Search, Play, Pause, Loader2, FolderOpen } from 'lucide-react';

interface Project {
  id: string; name: string; type: string; status: string;
  macMiniId: string; stats: { activeTasks: number; totalTasks: number; todayCost: number; monthCost: number; monthBudget: number };
  lastActivity?: string; pmName?: string | null;
}

const STATUS_COLOR: Record<string, string> = { active: '#10b981', standby: '#faa81a', offline: '#ef4444', setup: '#60a5fa' };
const TYPE_COLOR: Record<string, string> = { saas: '#a78bfa', content: '#f472b6', ecom: '#fb923c', custom: '#22d3ee' };

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchProjects = async () => {
    try { setLoading(true); const d = await projectsApi.list(); setProjects(d.projects || []); }
    catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { fetchProjects(); }, []);

  const toggle = async (id: string, status: string) => {
    try { await projectsApi.updateStatus(id, status === 'active' ? 'standby' : 'active'); fetchProjects(); } catch { }
  };

  const filtered = projects.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) || p.id.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return (
    <div className="flex items-center justify-center h-64 gap-3">
      <Loader2 size={16} className="animate-spin" style={{ color: 'var(--amber)' }} />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-lo)', letterSpacing: '0.1em' }}>LOADING PROJECTS...</span>
    </div>
  );

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <div className="ops-section-header" style={{ marginBottom: 4 }}>Core</div>
          <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-hi)' }}>PROJECTS</h1>
        </div>
        <Link to="/new-project" className="ops-btn flex items-center gap-1" style={{ textDecoration: 'none', color: 'inherit' }}>
          <Plus size={11} /> New Project
        </Link>
      </div>

      <div className="flex gap-2">
        <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
          <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-lo)' }} />
          <input type="text" placeholder="Search projects..." value={search} onChange={e => setSearch(e.target.value)}
            className="ops-input" style={{ paddingLeft: 30, width: '100%' }} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="ops-panel p-12 text-center space-y-4">
          <FolderOpen size={32} style={{ color: 'var(--text-lo)', margin: '0 auto' }} />
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-lo)' }}>
            {search ? '— no projects match —' : '— no projects yet —'}
          </p>
          {!search && (
            <Link to="/new-project" className="ops-btn inline-flex items-center gap-1" style={{ textDecoration: 'none', color: 'inherit' }}>
              <Plus size={11} /> Create First Project
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(p => {
            const sc = STATUS_COLOR[p.status] || 'var(--text-lo)';
            const tc = TYPE_COLOR[p.type] || '#64748b';
            const budgetPct = p.stats?.monthBudget ? Math.min((p.stats.monthCost / p.stats.monthBudget) * 100, 100) : 0;
            return (
              <div key={p.id} className="ops-panel overflow-hidden" style={{ padding: 0 }}>
                {/* top accent strip */}
                <div style={{ height: 2, background: tc }} />
                <div style={{ padding: '16px 18px' }}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--text-hi)', letterSpacing: '-0.01em' }}>{p.name}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: tc, textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 2 }}>{p.type}</div>
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: sc, textTransform: 'uppercase', letterSpacing: '0.1em', border: `1px solid ${sc}33`, borderRadius: 2, padding: '2px 7px' }}>
                      {p.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {[['Tasks', `${p.stats?.activeTasks || 0}/${p.stats?.totalTasks || 0}`], ['Month Cost', `$${p.stats?.monthCost || 0}`]].map(([l, v]) => (
                      <div key={String(l)} style={{ background: 'var(--ink-3)', border: '1px solid var(--ink-4)', borderRadius: 2, padding: '8px 12px' }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-lo)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{l}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--text-hi)', marginTop: 2 }}>{v}</div>
                      </div>
                    ))}
                  </div>

                  {p.stats?.monthBudget > 0 && (
                    <div className="mb-3">
                      <div className="flex justify-between mb-1" style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-lo)' }}>
                        <span>Budget</span><span>${p.stats.monthCost} / ${p.stats.monthBudget}</span>
                      </div>
                      <div className="ops-bar-track" style={{ height: 3 }}>
                        <div style={{ height: '100%', width: budgetPct + '%', background: budgetPct > 80 ? '#ef4444' : tc, borderRadius: 1, transition: 'width 0.6s ease' }} />
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 mt-3 pt-3" style={{ borderTop: '1px solid var(--ink-4)' }}>
                    <Link to={`/projects/${p.id}`} className="ops-btn flex-1 text-center" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                      View
                    </Link>
                    <button onClick={() => toggle(p.id, p.status)} title={p.status === 'active' ? 'Pause' : 'Start'}
                      style={{ padding: '4px 10px', background: 'var(--ink-3)', border: '1px solid var(--ink-4)', borderRadius: 2, cursor: 'pointer', color: p.status === 'active' ? '#faa81a' : '#10b981' }}>
                      {p.status === 'active' ? <Pause size={11} /> : <Play size={11} />}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          <Link to="/new-project" style={{ textDecoration: 'none', minHeight: 180, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, border: '1px dashed var(--ink-4)', borderRadius: 2, color: 'var(--text-lo)', transition: 'all 150ms' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--amber)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--ink-4)')}>
            <Plus size={18} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase' }}>New Project</span>
          </Link>
        </div>
      )}
    </div>
  );
}