import { useState, useEffect, useCallback } from 'react';
import { Activity as ActivityIcon, Loader2, RefreshCw, Zap, CheckSquare, Bot, FolderKanban, AlertCircle } from 'lucide-react';
import { fetchApi, wsClient } from '../services/api';

interface ActivityItem {
  id: string;
  type: 'task' | 'agent' | 'project' | 'system';
  action: string;
  target: string;
  detail?: string;
  project?: string;
  agent?: string;
  time: string;
  raw_time: string;
}

const TYPE_COLOR: Record<string, string> = {
  task: '#faa81a',
  agent: '#10b981',
  project: '#60a5fa',
  system: 'var(--text-lo)',
};

const TYPE_ICON: Record<string, any> = {
  task: CheckSquare,
  agent: Bot,
  project: FolderKanban,
  system: Zap,
};

function fmtTime(ts: string) {
  const d = Date.now() - new Date(ts).getTime();
  const m = Math.floor(d / 60000);
  const h = Math.floor(d / 3600000);
  const dy = Math.floor(d / 86400000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (dy < 7) return `${dy}d ago`;
  return new Date(ts).toLocaleDateString();
}

function taskToActivity(t: any): ActivityItem {
  const statusLabels: Record<string, string> = {
    pending: 'created',
    running: 'started',
    completed: 'completed',
    failed: 'failed',
    cancelled: 'cancelled',
  };
  return {
    id: t.id,
    type: 'task',
    action: `Task ${statusLabels[t.status] || t.status}`,
    target: t.title,
    detail: t.status,
    project: t.project_name || t.project_id,
    agent: t.agent_name || undefined,
    time: fmtTime(t.updated_at || t.created_at),
    raw_time: t.updated_at || t.created_at,
  };
}

const FILTER_OPTIONS = ['all', 'task', 'agent', 'project'] as const;
type Filter = typeof FILTER_OPTIONS[number];

export default function Activity() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [liveCount, setLiveCount] = useState(0);

  const M: React.CSSProperties = { fontFamily: 'var(--font-mono)' };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchApi('/api/tasks?limit=50');
      const tasks: ActivityItem[] = (data.tasks || []).map(taskToActivity);
      tasks.sort((a, b) => new Date(b.raw_time).getTime() - new Date(a.raw_time).getTime());
      setItems(tasks);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Live WS events
  useEffect(() => {
    const addLive = (item: ActivityItem) => {
      setItems(prev => [item, ...prev].slice(0, 100));
      setLiveCount(c => c + 1);
    };

    const onTaskCreated = (d: any) => d?.task && addLive({ ...taskToActivity(d.task), action: 'Task created', time: 'just now', raw_time: new Date().toISOString() });
    const onTaskAssigned = (d: any) => addLive({ id: d?.task_id || String(Date.now()), type: 'task', action: 'Task assigned', target: d?.task_title || d?.task_id || 'task', project: d?.project_name, agent: d?.agent_name, time: 'just now', raw_time: new Date().toISOString() });
    const onTaskCompleted = (d: any) => addLive({ id: d?.task_id || String(Date.now()), type: 'task', action: 'Task completed', target: d?.task_title || d?.task_id || 'task', project: d?.project_name, agent: d?.agent_name, time: 'just now', raw_time: new Date().toISOString() });
    const onTaskStarted = (d: any) => addLive({ id: d?.task_id || String(Date.now()), type: 'task', action: 'Task started', target: d?.task_title || 'task', project: d?.project_name, agent: d?.agent_name, time: 'just now', raw_time: new Date().toISOString() });
    const onAgentAssigned = (d: any) => addLive({ id: String(Date.now()), type: 'agent', action: 'Agent assigned', target: d?.agent_name || 'agent', project: d?.project_name, time: 'just now', raw_time: new Date().toISOString() });
    const onProjectChanged = (d: any) => addLive({ id: String(Date.now()), type: 'project', action: 'Project updated', target: d?.project_id || 'project', detail: d?.status, time: 'just now', raw_time: new Date().toISOString() });

    wsClient.on('task:created', onTaskCreated);
    wsClient.on('task:assigned', onTaskAssigned);
    wsClient.on('task:completed', onTaskCompleted);
    wsClient.on('task:started', onTaskStarted);
    wsClient.on('agent:assigned', onAgentAssigned);
    wsClient.on('project:status_changed', onProjectChanged);

    return () => {
      wsClient.off('task:created', onTaskCreated);
      wsClient.off('task:assigned', onTaskAssigned);
      wsClient.off('task:completed', onTaskCompleted);
      wsClient.off('task:started', onTaskStarted);
      wsClient.off('agent:assigned', onAgentAssigned);
      wsClient.off('project:status_changed', onProjectChanged);
    };
  }, []);

  const filtered = filter === 'all' ? items : items.filter(i => i.type === filter);

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="ops-section-header" style={{ marginBottom: 4 }}>Operations</div>
          <h1 style={{ ...M, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-hi)' }}>
            ACTIVITY LOG
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {liveCount > 0 && (
            <span style={{ ...M, fontSize: 9, color: 'var(--green)', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span className="ops-dot ops-dot-green ops-dot-pulse" />
              {liveCount} LIVE
            </span>
          )}
          <button onClick={load} disabled={loading} className="ops-btn" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4 }}>
        {FILTER_OPTIONS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            ...M, fontSize: 10, padding: '4px 12px', borderRadius: 3, cursor: 'pointer',
            border: '1px solid',
            borderColor: filter === f ? 'var(--amber)' : 'var(--ink-4)',
            background: filter === f ? 'var(--amber-glow)' : 'var(--ink-2)',
            color: filter === f ? 'var(--amber)' : 'var(--text-lo)',
            letterSpacing: '0.08em', textTransform: 'uppercase',
          }}>
            {f}
          </button>
        ))}
        <span style={{ ...M, fontSize: 10, color: 'var(--text-lo)', marginLeft: 'auto', alignSelf: 'center' }}>
          {filtered.length} events
        </span>
      </div>

      {/* List */}
      <div className="ops-panel p-0 overflow-hidden">
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--ink-4)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Zap size={11} style={{ color: 'var(--amber)' }} />
          <span style={{ ...M, fontSize: 10, color: 'var(--text-mid)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            {filter === 'all' ? 'All Events' : `${filter} Events`}
          </span>
          <span style={{ ...M, fontSize: 9, color: 'var(--green)', marginLeft: 'auto' }}>● LIVE</span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, gap: 10 }}>
            <Loader2 size={14} className="animate-spin" style={{ color: 'var(--amber)' }} />
            <span style={{ ...M, fontSize: 11, color: 'var(--text-lo)' }}>LOADING...</span>
          </div>
        ) : error ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, gap: 8, color: '#ef4444' }}>
            <AlertCircle size={14} />
            <span style={{ ...M, fontSize: 11 }}>{error}</span>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '56px 0', textAlign: 'center' }}>
            <ActivityIcon size={28} style={{ color: 'var(--text-lo)', margin: '0 auto 12px', opacity: 0.4, display: 'block' }} />
            <p style={{ ...M, fontSize: 12, color: 'var(--text-lo)' }}>— no activity yet —</p>
            <p style={{ ...M, fontSize: 10, color: 'var(--text-lo)', marginTop: 6, opacity: 0.6 }}>Events will appear here in real time</p>
          </div>
        ) : (
          filtered.map((item, i) => {
            const Icon = TYPE_ICON[item.type] || Zap;
            return (
              <div key={`${item.id}-${i}`} style={{
                padding: '10px 16px',
                borderBottom: i < filtered.length - 1 ? '1px solid var(--ink-4)' : 'none',
                display: 'flex', alignItems: 'flex-start', gap: 12,
              }}>
                <div style={{
                  width: 24, height: 24, borderRadius: 3, flexShrink: 0, marginTop: 1,
                  background: `${TYPE_COLOR[item.type]}15`,
                  border: `1px solid ${TYPE_COLOR[item.type]}30`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={11} style={{ color: TYPE_COLOR[item.type] }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ ...M, fontSize: 11, color: 'var(--text-lo)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{item.action}</span>
                    <span style={{ ...M, fontSize: 12, color: 'var(--text-hi)', fontWeight: 600 }}>{item.target}</span>
                  </div>
                  <div style={{ ...M, fontSize: 9, color: 'var(--text-lo)', marginTop: 3, display: 'flex', gap: 8 }}>
                    {item.project && <span>📁 {item.project}</span>}
                    {item.agent && <span>🤖 {item.agent}</span>}
                    <span style={{ marginLeft: 'auto' }}>{item.time}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}