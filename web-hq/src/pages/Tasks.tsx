import { useState, useEffect, useCallback } from 'react';
import { tasksApi, projectsApi } from '../services/api';
import { Plus, Loader2, LayoutGrid, List } from 'lucide-react';

interface Task { id: string; title: string; status: string; priority: string; assignee?: string; projectId?: string; }

const STATUS_COLS = ['backlog', 'in_progress', 'in_review', 'done'];
const STATUS_LABEL: Record<string, string> = { backlog: 'BACKLOG', in_progress: 'IN PROGRESS', in_review: 'IN REVIEW', done: 'DONE' };
const STATUS_COLOR: Record<string, string> = { backlog: 'var(--text-lo)', in_progress: '#faa81a', in_review: '#60a5fa', done: '#10b981' };
const PRI_COLOR: Record<string, string> = { critical: '#ef4444', high: '#f97316', medium: '#faa81a', low: '#64748b' };

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'kanban' | 'list'>('kanban');
  const [selProj, setSelProj] = useState('all');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const pd = await projectsApi.list().catch(() => ({ projects: [] }));
      const allProjects = pd?.projects || [];
      setProjects(allProjects);

      // Fetch tasks for selected project or all projects
      const projectsToFetch = selProj !== 'all'
        ? allProjects.filter((p: any) => p.id === selProj)
        : allProjects;

      const taskResults = await Promise.allSettled(
        projectsToFetch.map((p: any) => tasksApi.list(p.id))
      );
      const allTasks = taskResults.flatMap(r =>
        r.status === 'fulfilled' ? (r.value?.tasks || r.value || []) : []
      );
      setTasks(allTasks);
    } finally { setLoading(false); }
  }, [selProj]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)' };

  const TaskCard = ({ task }: { task: Task }) => (
    <div style={{ background: 'var(--ink-3)', border: '1px solid var(--ink-4)', borderLeft: `3px solid ${PRI_COLOR[task.priority] || 'var(--ink-4)'}`, borderRadius: 2, padding: '10px 12px', marginBottom: 6, cursor: 'pointer', transition: 'border-color 150ms' }}>
      <div style={{ ...mono, fontSize: 12, color: 'var(--text-hi)', marginBottom: 6, lineHeight: 1.4 }}>{task.title}</div>
      <div className="flex items-center justify-between">
        <span style={{ ...mono, fontSize: 9, color: PRI_COLOR[task.priority] || 'var(--text-lo)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{task.priority || '—'}</span>
        {task.assignee && <span style={{ ...mono, fontSize: 9, color: 'var(--text-lo)' }}>@{task.assignee}</span>}
      </div>
    </div>
  );

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <div className="ops-section-header" style={{ marginBottom: 4 }}>Core</div>
          <h1 style={{ ...mono, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-hi)' }}>TASK CENTER</h1>
        </div>
        <div className="flex items-center gap-2">
          {/* Project filter */}
          <select value={selProj} onChange={e => setSelProj(e.target.value)} className="ops-input" style={{ width: 'auto', cursor: 'pointer' }}>
            <option value="all">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {/* View toggle */}
          <div style={{ display: 'flex', background: 'var(--ink-2)', border: '1px solid var(--ink-4)', borderRadius: 2, padding: 2, gap: 2 }}>
            {[['kanban', LayoutGrid], ['list', List]].map(([v, Icon]: any) => (
              <button key={v} onClick={() => setView(v)} style={{ padding: '4px 8px', borderRadius: 1, background: view === v ? 'var(--amber)' : 'transparent', color: view === v ? '#000' : 'var(--text-lo)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <Icon size={12} />
              </button>
            ))}
          </div>
          <button className="ops-btn flex items-center gap-1"><Plus size={11} /> Create Task</button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 gap-3">
          <Loader2 size={14} className="animate-spin" style={{ color: 'var(--amber)' }} />
          <span style={{ ...mono, fontSize: 11, color: 'var(--text-lo)' }}>LOADING TASKS...</span>
        </div>
      ) : view === 'kanban' ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {STATUS_COLS.map(col => {
            const colTasks = tasks.filter(t => (t.status || 'backlog') === col);
            return (
              <div key={col}>
                <div className="flex items-center justify-between mb-3" style={{ borderBottom: `2px solid ${STATUS_COLOR[col]}`, paddingBottom: 6 }}>
                  <span style={{ ...mono, fontSize: 10, letterSpacing: '0.1em', color: STATUS_COLOR[col] }}>{STATUS_LABEL[col]}</span>
                  <span style={{ ...mono, fontSize: 10, color: 'var(--text-lo)', background: 'var(--ink-3)', border: '1px solid var(--ink-4)', borderRadius: '50%', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{colTasks.length}</span>
                </div>
                <div style={{ minHeight: 120 }}>
                  {colTasks.length === 0 ? (
                    <div style={{ ...mono, fontSize: 10, color: 'var(--text-lo)', textAlign: 'center', padding: '24px 0', opacity: 0.5 }}>empty</div>
                  ) : colTasks.map(t => <TaskCard key={t.id} task={t} />)}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="ops-panel p-0 overflow-hidden">
          {tasks.length === 0 ? (
            <p style={{ ...mono, fontSize: 11, color: 'var(--text-lo)', padding: '32px 0', textAlign: 'center' }}>— no tasks —</p>
          ) : (
            <table className="ops-table w-full">
              <thead><tr><th>Title</th><th>Status</th><th>Priority</th><th>Assignee</th></tr></thead>
              <tbody>
                {tasks.map(t => (
                  <tr key={t.id}>
                    <td style={{ color: 'var(--text-hi)' }}>{t.title}</td>
                    <td><span style={{ color: STATUS_COLOR[t.status || 'backlog'], ...mono, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{STATUS_LABEL[t.status || 'backlog']}</span></td>
                    <td><span style={{ color: PRI_COLOR[t.priority] || 'var(--text-lo)', ...mono, fontSize: 10, textTransform: 'uppercase' }}>{t.priority || '—'}</span></td>
                    <td style={{ color: 'var(--text-lo)' }}>{t.assignee ? '@' + t.assignee : '—'}</td>
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