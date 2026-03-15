import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { agentsApi, wsClient, presetsApi } from '../services/api';
import type { PresetDetail } from '../services/api';
import {
  Bot, Cpu, Radio, ArrowLeft, Loader2, AlertCircle,
  MessageSquare, CheckCircle, Clock, Play, XCircle,
  Folder, Calendar, Activity, Zap, ChevronDown, ChevronRight, FileText,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface TaskStat { total: number; pending: number; running: number; completed: number; failed: number }
interface RecentTask { id: string; title: string; status: string; priority: number; created_at: string; project_name: string }
interface AgentProject { id: string; name: string; status: string; role: string; assigned_at: string }

interface ManagerAgent {
  id: string; name: string; handle: string; role: string;
  status: string; agent_type: string; current_mode?: string;
  current_model?: string; rnd_division?: string;
  is_approved: boolean; email?: string;
  experience_level?: string; last_heartbeat?: string;
  created_at: string; updated_at: string;
  skills: string[]; specialties: string[];
  task_stats: TaskStat;
  recent_tasks: RecentTask[];
  projects: AgentProject[];
}

// ── Constants ────────────────────────────────────────────────────────────────

const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)' };

const TYPE_META: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  pm:     { icon: <Cpu size={10} />,   color: '#f59e0b', label: 'PM' },
  worker: { icon: <Bot size={10} />,   color: '#3b82f6', label: 'WORKER' },
  rnd:    { icon: <Radio size={10} />, color: '#ef4444', label: 'R&D' },
};
const getTypeMeta = (t?: string) => TYPE_META[t ?? ''] ?? TYPE_META['worker'];

const STATUS_COLOR: Record<string, string> = {
  online: '#10b981', offline: 'var(--text-lo)', working: '#3b82f6', idle: '#faa81a',
};
const TASK_STATUS_COLOR: Record<string, string> = {
  pending: '#faa81a', running: '#3b82f6', completed: '#10b981', failed: '#ef4444', cancelled: 'var(--text-lo)',
};
const TASK_STATUS_ICON: Record<string, React.ReactNode> = {
  pending:   <Clock size={10} />,
  running:   <Play size={10} />,
  completed: <CheckCircle size={10} />,
  failed:    <XCircle size={10} />,
  cancelled: <XCircle size={10} />,
};

// ── Component ────────────────────────────────────────────────────────────────

export default function AgentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [agent, setAgent] = useState<ManagerAgent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'tasks' | 'projects'>('tasks');
  const [presetOpen, setPresetOpen] = useState(false);
  const [presetContent, setPresetContent] = useState<PresetDetail | null>(null);
  const [presetLoading, setPresetLoading] = useState(false);

  useEffect(() => {
    if (id) load(id);
  }, [id]);

  // Live status update via WS
  useEffect(() => {
    const handler = (data: any) => {
      if (data?.agent_id === id) {
        setAgent(prev => prev ? { ...prev, status: data.status } : prev);
      }
    };
    wsClient.on('agent:status_changed', handler);
    return () => wsClient.off('agent:status_changed', handler);
  }, [id]);

  const load = async (agentId: string) => {
    setLoading(true); setError(null);
    try {
      const data = await agentsApi.getById(agentId);
      setAgent(data);
    } catch (e: any) {
      setError(e.message || 'Failed to load agent');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-40 gap-3">
      <Loader2 size={14} className="animate-spin" style={{ color: 'var(--amber)' }} />
      <span style={{ ...mono, fontSize: 11, color: 'var(--text-lo)' }}>LOADING AGENT...</span>
    </div>
  );

  if (error || !agent) return (
    <div style={{ ...mono, fontSize: 11, color: '#ef4444', background: 'var(--ink-2)', border: '1px solid #7f1d1d', borderRadius: 2, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
      <AlertCircle size={13} />
      {error || 'Agent not found'}
      <button onClick={() => navigate('/agents')} style={{ marginLeft: 'auto', color: 'var(--text-lo)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', ...mono, fontSize: 10 }}>← back</button>
    </div>
  );

  const tm = getTypeMeta(agent.agent_type);
  const sc = STATUS_COLOR[agent.status] || 'var(--text-lo)';
  const initials = agent.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const { task_stats: ts } = agent;

  return (
    <div className="space-y-4 animate-fade-up" style={{ maxWidth: 780 }}>

      {/* Back */}
      <button onClick={() => navigate('/agents')} style={{ ...mono, fontSize: 10, color: 'var(--text-lo)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
        <ArrowLeft size={11} /> AGENTS
      </button>

      {/* Header card */}
      <div className="ops-panel" style={{ padding: '20px 22px' }}>
        <div className="flex items-start gap-4">

          {/* Avatar */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{ width: 56, height: 56, borderRadius: 4, background: 'linear-gradient(135deg,var(--amber-dark),var(--amber))', display: 'flex', alignItems: 'center', justifyContent: 'center', ...mono, fontSize: 18, fontWeight: 700, color: '#000' }}>
              {initials}
            </div>
            {/* Status dot */}
            <div style={{ position: 'absolute', bottom: -3, right: -3, width: 12, height: 12, borderRadius: '50%', background: sc, border: '2px solid var(--ink-1)' }} />
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="flex items-center gap-3 flex-wrap">
              <span style={{ ...mono, fontSize: 18, fontWeight: 700, color: 'var(--text-hi)', letterSpacing: '-0.02em' }}>{agent.name}</span>
              <span style={{ ...mono, fontSize: 11, color: 'var(--text-lo)' }}>@{agent.handle}</span>
              {/* Type badge */}
              <span style={{ ...mono, fontSize: 9, color: tm.color, background: `${tm.color}15`, border: `1px solid ${tm.color}44`, borderRadius: 2, padding: '2px 8px', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 4 }}>
                {tm.icon} {tm.label}
              </span>
              {/* Status badge */}
              <span style={{ ...mono, fontSize: 9, color: sc, border: `1px solid ${sc}44`, borderRadius: 2, padding: '2px 7px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {agent.status}
              </span>
            </div>

            <div style={{ ...mono, fontSize: 10, color: 'var(--text-lo)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 4 }}>
              {agent.role}
              {agent.current_mode && <> · <span style={{ color: 'var(--amber)' }}>{agent.current_mode}</span></>}
              {agent.current_model && <> · <span style={{ color: '#818cf8' }}>{agent.current_model}</span></>}
              {agent.rnd_division && <> · <span style={{ color: '#ef4444' }}>{agent.rnd_division}</span></>}
            </div>

            {/* Skills */}
            {agent.skills?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-3">
                {agent.skills.map(s => (
                  <span key={s} style={{ ...mono, fontSize: 9, color: 'var(--text-lo)', background: 'var(--ink-3)', border: '1px solid var(--ink-4)', borderRadius: 2, padding: '2px 6px' }}>{s}</span>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2" style={{ flexShrink: 0 }}>
            <button onClick={() => navigate(`/chat?agent=${agent.id}`)} className="ops-btn flex items-center gap-1" style={{ whiteSpace: 'nowrap' }}>
              <MessageSquare size={10} /> Message
            </button>
          </div>
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap gap-4 mt-4 pt-4" style={{ borderTop: '1px solid var(--ink-4)' }}>
          {agent.email && (
            <span style={{ ...mono, fontSize: 10, color: 'var(--text-lo)' }}>✉ {agent.email}</span>
          )}
          {agent.experience_level && (
            <span style={{ ...mono, fontSize: 10, color: 'var(--text-lo)' }}>
              <Activity size={9} style={{ display: 'inline', marginRight: 4 }} />
              {agent.experience_level}
            </span>
          )}
          {agent.last_heartbeat && (
            <span style={{ ...mono, fontSize: 10, color: 'var(--text-lo)' }}>
              <Zap size={9} style={{ display: 'inline', marginRight: 4 }} />
              heartbeat {timeSince(agent.last_heartbeat)}
            </span>
          )}
          <span style={{ ...mono, fontSize: 10, color: 'var(--text-lo)' }}>
            <Calendar size={9} style={{ display: 'inline', marginRight: 4 }} />
            joined {new Date(agent.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
          </span>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'TOTAL',     value: ts.total,     color: 'var(--text-hi)' },
          { label: 'RUNNING',   value: ts.running,   color: '#3b82f6' },
          { label: 'COMPLETED', value: ts.completed, color: '#10b981' },
          { label: 'FAILED',    value: ts.failed,    color: '#ef4444' },
        ].map(stat => (
          <div key={stat.label} className="ops-panel" style={{ padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ ...mono, fontSize: 22, fontWeight: 700, color: stat.color, lineHeight: 1 }}>{stat.value}</div>
            <div style={{ ...mono, fontSize: 9, color: 'var(--text-lo)', letterSpacing: '0.1em', marginTop: 4 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Preset Info */}
      {agent.agent_type === 'pm' && agent.current_mode && (
        <PresetSection
          label="PM Mode"
          type="pm_modes"
          name={agent.current_mode}
          color="#f59e0b"
          open={presetOpen}
          onToggle={() => {
            const willOpen = !presetOpen;
            setPresetOpen(willOpen);
            if (willOpen && !presetContent) {
              setPresetLoading(true);
              presetsApi.get('pm_modes', agent.current_mode!).then(setPresetContent).catch(() => {}).finally(() => setPresetLoading(false));
            }
          }}
          content={presetContent}
          loading={presetLoading}
        />
      )}
      {agent.agent_type === 'worker' && agent.current_mode && (
        <PresetSection
          label="Department"
          type="departments"
          name={agent.current_mode}
          color="#3b82f6"
          open={presetOpen}
          onToggle={() => {
            const willOpen = !presetOpen;
            setPresetOpen(willOpen);
            if (willOpen && !presetContent) {
              setPresetLoading(true);
              presetsApi.get('departments', agent.current_mode!).then(setPresetContent).catch(() => {}).finally(() => setPresetLoading(false));
            }
          }}
          content={presetContent}
          loading={presetLoading}
        />
      )}
      {agent.agent_type === 'rnd' && agent.rnd_division && (
        <PresetSection
          label="R&D Division"
          type="rnd_division"
          name={agent.rnd_division}
          color="#ef4444"
          open={presetOpen}
          onToggle={() => {
            const willOpen = !presetOpen;
            setPresetOpen(willOpen);
            if (willOpen && !presetContent) {
              setPresetLoading(true);
              presetsApi.get('rnd_division', agent.rnd_division!).then(setPresetContent).catch(() => {}).finally(() => setPresetLoading(false));
            }
          }}
          content={presetContent}
          loading={presetLoading}
        />
      )}

      {/* Tabs */}
      <div>
        <div className="flex gap-1 mb-3">
          {(['tasks', 'projects'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ ...mono, fontSize: 10, letterSpacing: '0.08em', padding: '5px 14px', borderRadius: 2, cursor: 'pointer', border: 'none', textTransform: 'uppercase',
                background: tab === t ? 'var(--amber)' : 'var(--ink-3)',
                color:      tab === t ? '#000'         : 'var(--text-lo)',
              }}>
              {t === 'tasks' ? `TASKS (${ts.total})` : `PROJECTS (${agent.projects.length})`}
            </button>
          ))}
        </div>

        {tab === 'tasks' && (
          <div className="ops-panel" style={{ padding: 0, overflow: 'hidden' }}>
            {agent.recent_tasks.length === 0 ? (
              <div style={{ ...mono, fontSize: 11, color: 'var(--text-lo)', padding: '24px', textAlign: 'center' }}>— no tasks —</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--ink-4)' }}>
                    {['TASK', 'PROJECT', 'STATUS', 'DATE'].map(h => (
                      <th key={h} style={{ ...mono, fontSize: 9, color: 'var(--text-lo)', letterSpacing: '0.1em', padding: '10px 14px', textAlign: 'left', fontWeight: 400 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {agent.recent_tasks.map((task, i) => {
                    const tc = TASK_STATUS_COLOR[task.status] || 'var(--text-lo)';
                    return (
                      <tr key={task.id} style={{ borderBottom: i < agent.recent_tasks.length - 1 ? '1px solid var(--ink-4)' : 'none' }}>
                        <td style={{ ...mono, fontSize: 11, color: 'var(--text-hi)', padding: '10px 14px', maxWidth: 260 }}>
                          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</span>
                        </td>
                        <td style={{ ...mono, fontSize: 10, color: 'var(--text-lo)', padding: '10px 14px', whiteSpace: 'nowrap' }}>
                          <Folder size={9} style={{ display: 'inline', marginRight: 4 }} />{task.project_name}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ ...mono, fontSize: 9, color: tc, border: `1px solid ${tc}44`, borderRadius: 2, padding: '2px 7px', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            {TASK_STATUS_ICON[task.status]} {task.status}
                          </span>
                        </td>
                        <td style={{ ...mono, fontSize: 9, color: 'var(--text-lo)', padding: '10px 14px', whiteSpace: 'nowrap' }}>
                          {new Date(task.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === 'projects' && (
          <div className="ops-panel" style={{ padding: 0, overflow: 'hidden' }}>
            {agent.projects.length === 0 ? (
              <div style={{ ...mono, fontSize: 11, color: 'var(--text-lo)', padding: '24px', textAlign: 'center' }}>— not assigned to any projects —</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--ink-4)' }}>
                    {['PROJECT', 'ROLE', 'STATUS', 'SINCE'].map(h => (
                      <th key={h} style={{ ...mono, fontSize: 9, color: 'var(--text-lo)', letterSpacing: '0.1em', padding: '10px 14px', textAlign: 'left', fontWeight: 400 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {agent.projects.map((proj, i) => (
                    <tr key={proj.id} style={{ borderBottom: i < agent.projects.length - 1 ? '1px solid var(--ink-4)' : 'none', cursor: 'pointer' }}
                      onClick={() => navigate(`/projects/${proj.id}`)}>
                      <td style={{ ...mono, fontSize: 11, color: 'var(--text-hi)', padding: '10px 14px' }}>{proj.name}</td>
                      <td style={{ ...mono, fontSize: 10, color: 'var(--text-lo)', padding: '10px 14px', textTransform: 'capitalize' }}>{proj.role}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ ...mono, fontSize: 9, color: proj.status === 'active' ? '#10b981' : 'var(--text-lo)', border: `1px solid ${proj.status === 'active' ? '#10b98133' : 'var(--ink-4)'}`, borderRadius: 2, padding: '2px 7px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                          {proj.status}
                        </span>
                      </td>
                      <td style={{ ...mono, fontSize: 9, color: 'var(--text-lo)', padding: '10px 14px', whiteSpace: 'nowrap' }}>
                        {new Date(proj.assigned_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

    </div>
  );
}

// ── Preset Section ────────────────────────────────────────────────────────────

function PresetSection({ label, type, name, color, open, onToggle, content, loading: isLoading }: {
  label: string; type: string; name: string; color: string;
  open: boolean; onToggle: () => void;
  content: PresetDetail | null; loading: boolean;
}) {
  const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)' };
  return (
    <div className="ops-panel" style={{ padding: 0, overflow: 'hidden' }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', padding: '12px 16px', background: 'none', border: 'none',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
          textAlign: 'left',
        }}
      >
        <FileText size={12} style={{ color, flexShrink: 0 }} />
        <span style={{ ...mono, fontSize: 10, color, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {label}
        </span>
        <span style={{ ...mono, fontSize: 10, color: 'var(--text-hi)', fontWeight: 600 }}>
          {name.replace(/_/g, ' ')}
        </span>
        <span style={{ ...mono, fontSize: 9, color: 'var(--text-lo)', marginLeft: 'auto' }}>
          {open ? 'collapse' : 'view preset'}
        </span>
        {open ? <ChevronDown size={12} style={{ color: 'var(--text-lo)' }} /> : <ChevronRight size={12} style={{ color: 'var(--text-lo)' }} />}
      </button>
      {open && (
        <div style={{ borderTop: '1px solid var(--ink-4)', padding: '14px 16px' }}>
          {isLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
              <Loader2 size={12} className="animate-spin" style={{ color }} />
              <span style={{ ...mono, fontSize: 10, color: 'var(--text-lo)' }}>Loading preset...</span>
            </div>
          ) : content ? (
            <div>
              <div style={{ ...mono, fontSize: 12, fontWeight: 700, color: 'var(--text-hi)', marginBottom: 4 }}>
                {content.title}
              </div>
              {content.description && (
                <div style={{ ...mono, fontSize: 10, color: 'var(--text-lo)', marginBottom: 12 }}>
                  {content.description}
                </div>
              )}
              <pre style={{
                ...mono, fontSize: 10, color: 'var(--text-mid)', lineHeight: 1.7,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                background: 'var(--ink-1)', border: '1px solid var(--ink-4)',
                borderRadius: 4, padding: '12px 14px', maxHeight: 320, overflowY: 'auto',
              }}>
                {content.content}
              </pre>
            </div>
          ) : (
            <div style={{ ...mono, fontSize: 10, color: 'var(--text-lo)', padding: '8px 0' }}>
              Preset content not available.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeSince(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}
