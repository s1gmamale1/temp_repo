import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, RefreshCw, Bot, AlertTriangle, CheckCircle, Info, Zap, Filter, Radio, Activity } from 'lucide-react';
import { useChatStore } from '../store/chatStore';
import { wsClient } from '../services/api';

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001';

async function apiFetch(path: string) {
  const token = localStorage.getItem('claw_token');
  const r = await fetch(API_BASE + path, {
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

const TYPE_CFG: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  task_assigned:    { color: '#60a5fa', icon: <Zap size={10} />,          label: 'Task Assigned'    },
  task_accepted:    { color: '#10b981', icon: <CheckCircle size={10} />,  label: 'Task Accepted'    },
  task_completed:   { color: '#10b981', icon: <CheckCircle size={10} />,  label: 'Task Completed'   },
  task_rejected:    { color: '#ef4444', icon: <AlertTriangle size={10} />,label: 'Task Rejected'    },
  task_failed:      { color: '#ef4444', icon: <AlertTriangle size={10} />,label: 'Task Failed'      },
  project_assigned: { color: 'var(--amber)', icon: <Bot size={10} />,     label: 'Project Assigned' },
  agent_message:    { color: 'var(--cyan)', icon: <Radio size={10} />,    label: 'Agent Message'    },
};
const defaultType = { color: '#64748b', icon: <Info size={10} />, label: 'Event' };
const getTypeCfg = (t: string) => TYPE_CFG[t] || defaultType;

const AGENT_COLORS = ['#60a5fa','var(--amber)','#10b981','var(--cyan)','#a78bfa','#f472b6','#fb923c'];
const agentColor = (id: string) => AGENT_COLORS[Math.abs(id?.split('').reduce((a, c) => a + c.charCodeAt(0), 0) || 0) % AGENT_COLORS.length];

// Per-agent live phase state — updated by WS without full re-fetch
type AgentPhaseState = {
  phase: string | null;
  task_id: string | null;
  task_title: string | null;
  status_text: string | null;
  phase_started_at: string | null;
};

export default function LiveReport() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [agentPhases, setAgentPhases] = useState<Record<string, AgentPhaseState>>({});
  const [unreadByAgent, setUnreadByAgent] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterAgent, setFilterAgent] = useState('');
  const [filterType, setFilterType] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [liveCount, setLiveCount] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchFeed = useCallback(async () => {
    try {
      setError(null);
      const params = new URLSearchParams({ limit: '200' });
      if (filterAgent) params.set('agent_id', filterAgent);
      if (filterType) params.set('type', filterType);
      if (unreadOnly) params.set('unread_only', 'true');
      const d = await apiFetch('/api/notifications/agents/feed?' + params);
      setNotifications(d.notifications || []);
      setUnreadByAgent(d.unread_by_agent || []);
      setLastUpdate(new Date());
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [filterAgent, filterType, unreadOnly]);

  const fetchAgents = useCallback(async () => {
    try {
      const d = await apiFetch('/api/agents');
      const list: any[] = Array.isArray(d) ? d : (d?.agents || []);
      setAgents(list);
      // Seed initial phase state from agent data
      setAgentPhases(prev => {
        const next = { ...prev };
        list.forEach((a: any) => {
          if (!next[a.id]) {
            next[a.id] = {
              phase: a.current_phase || null,
              task_id: a.current_task_id || null,
              task_title: a.current_task_title || null,
              status_text: a.status_text || null,
              phase_started_at: a.phase_started_at || null,
            };
          }
        });
        return next;
      });
    } catch {}
  }, []);

  useEffect(() => { fetchFeed(); fetchAgents(); }, [fetchFeed, fetchAgents]);

  // Auto-refresh every 15s
  useEffect(() => {
    const id = setInterval(fetchFeed, 15000);
    return () => clearInterval(id);
  }, [fetchFeed]);

  // Live WS updates — notification feed
  useEffect(() => {
    const handler = (data: any) => {
      setLiveCount(c => c + 1);
      fetchFeed();
    };
    wsClient.on('notification:new', handler);
    wsClient.on('agent:message', handler);
    wsClient.on('task:assigned', handler);
    wsClient.on('task:completed', handler);
    return () => {
      wsClient.off('notification:new', handler);
      wsClient.off('agent:message', handler);
      wsClient.off('task:assigned', handler);
      wsClient.off('task:completed', handler);
    };
  }, [fetchFeed]);

  // Live WS updates — agent phase/status grid (no full re-fetch needed)
  useEffect(() => {
    const phaseHandler = (data: any) => {
      if (!data?.agent_id) return;
      setLiveCount(c => c + 1);
      setAgentPhases(prev => ({
        ...prev,
        [data.agent_id]: {
          phase: data.phase ?? prev[data.agent_id]?.phase ?? null,
          task_id: data.task_id ?? prev[data.agent_id]?.task_id ?? null,
          task_title: data.task_title ?? prev[data.agent_id]?.task_title ?? null,
          status_text: prev[data.agent_id]?.status_text ?? null,
          phase_started_at: data.started_at ?? prev[data.agent_id]?.phase_started_at ?? null,
        },
      }));
    };
    const statusTextHandler = (data: any) => {
      if (!data?.agent_id) return;
      setAgentPhases(prev => ({
        ...prev,
        [data.agent_id]: {
          ...(prev[data.agent_id] || { phase: null, task_id: null, task_title: null, phase_started_at: null }),
          status_text: data.status_text ?? null,
        },
      }));
    };
    const taskCompletedHandler = (data: any) => {
      if (!data?.agent_id) return;
      setAgentPhases(prev => ({
        ...prev,
        [data.agent_id]: {
          ...(prev[data.agent_id] || { phase: null, task_id: null, task_title: null, phase_started_at: null, status_text: null }),
          phase: null,
          task_id: null,
          task_title: null,
          status_text: null,
        },
      }));
    };
    wsClient.on('agent:phase', phaseHandler);
    wsClient.on('agent:status_text', statusTextHandler);
    wsClient.on('task:completed', taskCompletedHandler);
    wsClient.on('task:failed', taskCompletedHandler);
    return () => {
      wsClient.off('agent:phase', phaseHandler);
      wsClient.off('agent:status_text', statusTextHandler);
      wsClient.off('task:completed', taskCompletedHandler);
      wsClient.off('task:failed', taskCompletedHandler);
    };
  }, []);

  const totalUnread = unreadByAgent.reduce((s, a) => s + (a.unread || 0), 0);

  const uniqueTypes = [...new Set(notifications.map(n => n.type))].filter(Boolean);

  return (
    <div className="space-y-5 animate-fade-up">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="ops-section-header" style={{ marginBottom: 4 }}>Operations</div>
          <div className="flex items-center gap-3">
            <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-hi)' }}>LIVE REPORT</h1>
            <span style={{
              display: 'flex', alignItems: 'center', gap: 5,
              fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em',
              padding: '3px 8px', borderRadius: 2,
              background: 'rgba(34,211,238,0.08)', color: 'var(--cyan)',
              border: '1px solid rgba(34,211,238,0.2)',
            }}>
              <span className="ops-dot ops-dot-green ops-dot-pulse" style={{ background: 'var(--cyan)' }} />
              LIVE {liveCount > 0 && `· ${liveCount} new`}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdate && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-lo)' }}>
              {lastUpdate.toLocaleTimeString()}
            </span>
          )}
          <button onClick={fetchFeed} disabled={loading} className="ops-btn flex items-center gap-1">
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Agent Status Grid — live per-agent current work */}
      {agents.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Activity size={10} style={{ color: 'var(--text-lo)' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', color: 'var(--text-lo)' }}>
              AGENT STATUS
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {agents.map((a: any) => {
              const ps = agentPhases[a.id];
              const color = agentColor(a.id);
              const isActive = !!(ps?.phase || ps?.task_title);
              const statusOnline = a.status === 'online';
              return (
                <div key={a.id} className="ops-panel" style={{
                  padding: '10px 12px',
                  border: isActive ? `1px solid ${color}30` : '1px solid var(--ink-3)',
                  background: isActive ? `${color}05` : undefined,
                  cursor: 'pointer',
                }} onClick={() => setFilterAgent(filterAgent === a.id ? '' : a.id)}>
                  {/* Agent name row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                      background: statusOnline ? color : 'var(--text-lo)',
                      boxShadow: isActive ? `0 0 5px ${color}80` : undefined,
                    }} />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, color: 'var(--text-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.name}
                    </span>
                    <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.08em', color: statusOnline ? color : 'var(--text-lo)', flexShrink: 0 }}>
                      {statusOnline ? 'ONLINE' : 'OFFLINE'}
                    </span>
                  </div>

                  {/* Current task */}
                  {ps?.task_title ? (
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-mid)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}
                      title={ps.task_title}>
                      {ps.task_title}
                    </div>
                  ) : (
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-lo)' }}>idle</div>
                  )}

                  {/* Phase badge */}
                  {ps?.phase && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span className="ops-dot ops-dot-green ops-dot-pulse" style={{ background: color }} />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.08em', color }}>
                        {ps.phase.toUpperCase()}
                        {ps.phase_started_at && ` · ${timeAgo(ps.phase_started_at)}`}
                      </span>
                    </div>
                  )}
                  {ps?.status_text && !ps?.phase && (
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-lo)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ps.status_text}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Unread summary */}
      {unreadByAgent.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {unreadByAgent.slice(0, 4).map((a: any) => (
            <div key={a.agent_id} className="ops-stat" style={{ cursor: 'pointer', border: filterAgent === a.agent_id ? `1px solid ${agentColor(a.agent_id)}` : undefined }}
              onClick={() => setFilterAgent(filterAgent === a.agent_id ? '' : a.agent_id)}>
              <div className="flex items-center gap-2 mb-2">
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: agentColor(a.agent_id), display: 'inline-block', flexShrink: 0 }} />
                <span className="ops-label" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.agent_name || a.agent_id}</span>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: agentColor(a.agent_id) }}>{a.unread}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-lo)', marginTop: 2 }}>UNREAD</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="ops-panel p-3 flex flex-wrap items-center gap-3">
        <Filter size={11} style={{ color: 'var(--text-lo)', flexShrink: 0 }} />

        <select value={filterAgent} onChange={e => setFilterAgent(e.target.value)} className="ops-input" style={{ width: 'auto', fontSize: 10 }}>
          <option value="">All agents</option>
          {agents.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>

        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="ops-input" style={{ width: 'auto', fontSize: 10 }}>
          <option value="">All types</option>
          {uniqueTypes.map(t => <option key={t} value={t}>{TYPE_CFG[t]?.label || t}</option>)}
        </select>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-mid)' }}>
          <input type="checkbox" checked={unreadOnly} onChange={e => setUnreadOnly(e.target.checked)} style={{ accentColor: 'var(--amber)' }} />
          Unread only
        </label>

        {(filterAgent || filterType || unreadOnly) && (
          <button onClick={() => { setFilterAgent(''); setFilterType(''); setUnreadOnly(false); }}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.08em' }}>
            CLEAR
          </button>
        )}

        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-lo)' }}>
          {notifications.length} events · {totalUnread} unread
        </span>
      </div>

      {/* Feed */}
      {loading && !notifications.length ? (
        <div className="flex items-center justify-center h-40 gap-3">
          <Loader2 size={14} className="animate-spin" style={{ color: 'var(--amber)' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-lo)' }}>LOADING...</span>
        </div>
      ) : error ? (
        <div className="ops-panel p-6 text-center">
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#ef4444' }}>ERR: {error}</p>
        </div>
      ) : notifications.length === 0 ? (
        <div className="ops-panel p-10 text-center">
          <Radio size={20} style={{ color: 'var(--text-lo)', margin: '0 auto 10px' }} />
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-lo)' }}>— no agent activity recorded —</p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-lo)', opacity: 0.6, marginTop: 6 }}>
            Activity appears here when agents receive task assignments, completions, and messages
          </p>
        </div>
      ) : (
        <div className="ops-panel p-0" style={{ overflow: 'hidden' }}>
          <div style={{ overflowY: 'auto', maxHeight: 600 }}>
            {notifications.map((n: any, i: number) => {
              const cfg = getTypeCfg(n.type);
              const color = agentColor(n.agent_id);
              return (
                <div key={n.id} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '10px 16px',
                  borderBottom: '1px solid var(--ink-3)',
                  background: n.is_read ? 'transparent' : 'rgba(255,255,255,0.01)',
                  borderLeft: n.is_read ? '2px solid transparent' : `2px solid ${cfg.color}`,
                  transition: 'background 100ms',
                }}>
                  {/* Agent color dot */}
                  <div style={{ marginTop: 2, flexShrink: 0 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'block' }} />
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 2 }}>
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.1em',
                        padding: '2px 5px', borderRadius: 2,
                        background: `${cfg.color}15`, color: cfg.color,
                        border: `1px solid ${cfg.color}25`,
                        display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0,
                      }}>
                        {cfg.icon} {cfg.label.toUpperCase()}
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: color, fontWeight: 600 }}>
                        {n.agent_name || n.agent_id}
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-lo)' }}>
                        @{n.agent_handle}
                      </span>
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-hi)', marginBottom: 2 }}>
                      {n.title}
                    </div>
                    {n.content && (
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-mid)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {n.content}
                      </div>
                    )}
                  </div>

                  {/* Time */}
                  <div style={{ flexShrink: 0, textAlign: 'right' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-lo)' }}>
                      {timeAgo(n.created_at)}
                    </div>
                    {!n.is_read && (
                      <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: cfg.color, marginTop: 3 }} />
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        </div>
      )}

    </div>
  );
}
