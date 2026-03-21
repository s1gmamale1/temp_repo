import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DndContext, DragOverlay, useDraggable, useDroppable,
  PointerSensor, useSensor, useSensors
} from '@dnd-kit/core';
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import {
  Bot, Zap, RefreshCw, Loader2, MessageSquare, X,
  ChevronRight, Cpu, Activity, Radio, CheckCircle, Clock, AlertCircle
} from 'lucide-react';
import { agentsApi, projectsApi, fetchApi, wsClient, presetsApi } from '../services/api';
import type { PresetsResponse } from '../services/api';
import { toast } from '../components/Toast';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Agent {
  id: string;
  name: string;
  handle: string;
  status: string;
  is_active?: boolean;
  agent_type: 'pm' | 'worker' | 'rnd';
  current_mode: string | null;
  current_model: string | null;
  project_id: string | null;
  rnd_division: string | null;
  rnd_schedule: string | null;
  rnd_last_run: string | null;
  last_heartbeat: string | null;
  skills?: string[];
  taskCount?: number;
  currentTask?: string | null;
}

interface Project {
  id: string;
  name: string;
  status: string;
  mode?: string;
  stats?: { activeTasks: number; agentCount: number };
}

interface ActivityItem {
  id: string;
  text: string;
  type: 'task' | 'agent' | 'system';
  ts: number;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const DEPT_META: Record<string, { color: string; icon: string; short: string }> = {
  frontend:        { color: '#60a5fa', icon: '◧', short: 'FE' },
  backend:         { color: '#34d399', icon: '◨', short: 'BE' },
  devops:          { color: '#f472b6', icon: '◩', short: 'DO' },
  database:        { color: '#a78bfa', icon: '◫', short: 'DB' },
  mobile:          { color: '#fb923c', icon: '◪', short: 'MB' },
  security:        { color: '#f87171', icon: '◬', short: 'SC' },
  qa:              { color: '#4ade80', icon: '◮', short: 'QA' },
  uiux:            { color: '#c084fc', icon: '◐', short: 'UX' },
  data_engineering:{ color: '#22d3ee', icon: '⬢', short: 'DE' },
  ml_engineering:  { color: '#e879f9', icon: '⬠', short: 'ML' },
  api_integration: { color: '#38bdf8', icon: '◭', short: 'AI' },
  performance:     { color: '#fbbf24', icon: '◕', short: 'PF' },
  content_docs:    { color: '#86efac', icon: '◒', short: 'CD' },
  release_eng:     { color: '#fb7185', icon: '◖', short: 'RE' },
};

const PM_MODES: Record<string, { icon: string; label: string }> = {
  webstore:      { icon: '🛒', label: 'Web Store' },
  saas:          { icon: '☁️', label: 'SaaS' },
  mobile_app:    { icon: '📱', label: 'Mobile App' },
  data_pipeline: { icon: '🔄', label: 'Data Pipeline' },
  ai_ml_product: { icon: '🧠', label: 'AI/ML' },
  api_platform:  { icon: '🔌', label: 'API Platform' },
  cms:           { icon: '📝', label: 'CMS' },
  internal_tools:{ icon: '🔧', label: 'Internal Tools' },
  gaming:        { icon: '🎮', label: 'Gaming' },
  iot_system:    { icon: '📡', label: 'IoT' },
};

const RND_META: Record<string, { color: string; icon: string; schedule: string }> = {
  ai_ml_research:   { color: '#ef4444', icon: '⟐', schedule: 'Every 6h' },
  tech_frameworks:  { color: '#ef4444', icon: '⟑', schedule: 'Daily' },
  security_intel:   { color: '#f97316', icon: '⟒', schedule: 'Every 4h' },
  oss_scout:        { color: '#ef4444', icon: '⟓', schedule: 'Daily' },
  tooling_infra:    { color: '#ef4444', icon: '⟔', schedule: 'Weekly' },
  competitive_intel:{ color: '#ef4444', icon: '⟕', schedule: 'Weekly' },
};

function getTypeColor(type: string) {
  if (type === 'pm')     return '#f59e0b';
  if (type === 'worker') return '#3b82f6';
  if (type === 'rnd')    return '#ef4444';
  return 'var(--text-lo)';
}

function normalizeAgentStatus(agent: Agent): 'registered' | 'online' | 'working' | 'offline' {
  const s = String(agent.status || '').toLowerCase();
  const active = agent.is_active !== false;
  if (!active && ['online', 'idle', 'busy', 'working'].includes(s)) return 'registered';
  if (s === 'working' || s === 'running' || s === 'busy') return 'working';
  if (s === 'online' || s === 'idle') return 'online';
  return 'offline';
}

function getStatusDot(status: string) {
  if (status === 'registered') return 'ops-dot ops-dot-amber';
  if (status === 'online')  return 'ops-dot ops-dot-green ops-dot-pulse';
  if (status === 'working') return 'ops-dot ops-dot-amber ops-dot-pulse';
  if (status === 'offline') return 'ops-dot ops-dot-gray';
  return 'ops-dot ops-dot-gray';
}

function fmtTime(ts: string | null) {
  if (!ts) return '—';
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

// ─── Draggable Agent Card ─────────────────────────────────────────────────────

function AgentCard({ agent, dragging = false, inProject = false, collecting = false, justJoined = false }: { agent: Agent; dragging?: boolean; inProject?: boolean; collecting?: boolean; justJoined?: boolean }) {
  const typeColor = getTypeColor(agent.agent_type);
  const dept = agent.current_mode ? DEPT_META[agent.current_mode] : null;
  const pmMode = agent.current_mode ? PM_MODES[agent.current_mode] : null;
  const isAssigned = !!agent.current_mode;

  const collectingStyle = collecting ? {
    border: `1px solid #f59e0b`,
    borderLeft: `2px solid #f59e0b`,
    boxShadow: '0 0 14px rgba(245,158,11,0.45)',
    animation: 'hq-recruit-pulse 0.6s ease-in-out infinite alternate',
  } : {};
  const joinedStyle = justJoined ? {
    border: `1px solid #10b981`,
    borderLeft: `2px solid #10b981`,
    boxShadow: '0 0 18px rgba(16,185,129,0.5)',
    animation: 'hq-join-glow 0.4s ease-out',
  } : {};

  return (
    <div style={{
      background: dragging ? 'var(--ink-3)' : 'var(--ink-2)',
      border: `1px solid ${isAssigned ? `${typeColor}30` : 'var(--ink-4)'}`,
      borderLeft: `2px solid ${typeColor}`,
      borderRadius: 4,
      padding: inProject ? '8px 10px' : '10px 12px',
      cursor: 'grab',
      userSelect: 'none',
      opacity: dragging ? 0.5 : 1,
      boxShadow: dragging ? `0 0 20px ${typeColor}20` : 'none',
      transition: 'border-color 200ms, box-shadow 200ms',
      minWidth: inProject ? 120 : 160,
      position: 'relative',
      ...collectingStyle,
      ...joinedStyle,
    }}>
      {/* Collecting overlay */}
      {collecting && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          borderRadius: 4, pointerEvents: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(245,158,11,0.08)',
          zIndex: 2,
        }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: '#f59e0b', letterSpacing: '0.12em', fontWeight: 700 }}>RECRUITING →</span>
        </div>
      )}
      {justJoined && (
        <div style={{
          position: 'absolute', top: -8, right: -4,
          background: '#10b981', color: '#000', fontSize: 7,
          fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.1em',
          padding: '2px 5px', borderRadius: 2, pointerEvents: 'none',
          animation: 'hq-badge-pop 0.3s ease-out',
        }}>NEW</div>
      )}
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Type indicator */}
          <div style={{
            width: 22, height: 22, borderRadius: 3, flexShrink: 0,
            background: `${typeColor}15`, border: `1px solid ${typeColor}25`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: dept ? 12 : 10,
          }}>
            {dept ? dept.icon : pmMode ? pmMode.icon : <Bot size={10} style={{ color: typeColor }} />}
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: inProject ? 10 : 11, fontWeight: 700, color: 'var(--text-hi)', lineHeight: 1 }}>
              {agent.name}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-lo)', marginTop: 1 }}>
              @{agent.handle}
            </div>
          </div>
        </div>
        <span className={getStatusDot(normalizeAgentStatus(agent))} />
      </div>

      {/* Mode badge */}
      {isAssigned ? (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '2px 6px', borderRadius: 2,
          background: dept ? `${dept.color}12` : `${typeColor}12`,
          border: `1px solid ${dept ? `${dept.color}25` : `${typeColor}25`}`,
          fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 600,
          color: dept ? dept.color : typeColor, letterSpacing: '0.06em',
          marginBottom: 4,
        }}>
          {dept ? `${dept.icon} ${agent.current_mode?.toUpperCase().replace(/_/g, ' ')}` :
           pmMode ? `${pmMode.icon} ${pmMode.label}` : agent.current_mode}
        </div>
      ) : (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: 4 }}>
          {normalizeAgentStatus(agent) === 'registered' ? 'REGISTERED ⠿ ready to assign' : 'FREE ⠿ drag to assign'}
        </div>
      )}

      {/* Model + type footer */}
      {!inProject && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 7,
            padding: '1px 5px', borderRadius: 2,
            background: `${typeColor}10`, border: `1px solid ${typeColor}20`,
            color: typeColor, letterSpacing: '0.08em', textTransform: 'uppercase',
          }}>
            {agent.agent_type}
          </span>
          {agent.current_model && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: 'var(--text-lo)' }}>
              {agent.current_model.includes('sonnet') ? 'S' : agent.current_model.includes('haiku') ? 'H' : agent.current_model.includes('opus') ? 'O' : '?'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Draggable Wrapper ────────────────────────────────────────────────────────

function DraggableAgent({ agent, inProject = false, collecting = false, justJoined = false }: { agent: Agent; inProject?: boolean; collecting?: boolean; justJoined?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: agent.id, data: { agent } });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ touchAction: 'none', userSelect: 'none' }}
    >
      <AgentCard agent={agent} dragging={isDragging} inProject={inProject} collecting={collecting} justJoined={justJoined} />
    </div>
  );
}

// ─── Droppable Zone ───────────────────────────────────────────────────────────

function DroppableZone({ id, children, label, color = 'var(--cyan)' }: {
  id: string; children: React.ReactNode; label?: string; color?: string;
}) {
  const { isOver, setNodeRef } = useDroppable({ id });
  return (
    <div ref={setNodeRef} style={{
      border: `2px dashed ${isOver ? color : 'var(--ink-5)'}`,
      borderRadius: 6,
      padding: 12,
      background: isOver ? `${color}10` : 'transparent',
      transition: 'border-color 80ms, background 80ms, box-shadow 80ms',
      minHeight: 90,
      boxShadow: isOver ? `0 0 20px ${color}20, inset 0 0 20px ${color}05` : 'none',
    }}>
      {label && (
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 8,
          color: isOver ? color : 'var(--text-dim)',
          letterSpacing: '0.14em', textTransform: 'uppercase',
          marginBottom: 8, textAlign: 'center',
          transition: 'color 80ms',
        }}>
          {isOver ? '⬇  DROP HERE' : label}
        </div>
      )}
      {children}
    </div>
  );
}

// ─── Assignment Modal ─────────────────────────────────────────────────────────

function AssignModal({ agent, project, onConfirm, onCancel, presets }: {
  agent: Agent; project: Project;
  onConfirm: (dept: string, model: string) => void;
  onCancel: () => void;
  presets: PresetsResponse | null;
}) {
  const [dept, setDept] = useState('');
  const [model, setModel] = useState('claude-sonnet-4-6');
  const isPM = agent.agent_type === 'pm';

  const MODELS = ['claude-sonnet-4-6', 'claude-haiku-4-5', 'claude-opus-4-6'];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--ink-2)', border: '1px solid var(--ink-5)',
        borderRadius: 8, padding: 24, width: 480, maxWidth: '90vw',
        boxShadow: '0 0 40px rgba(34,211,238,0.1)',
        position: 'relative',
      }}>
        {/* Top cyan line */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(34,211,238,0.5), transparent)', borderRadius: '8px 8px 0 0' }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--cyan)', letterSpacing: '0.15em', marginBottom: 4 }}>// ASSIGN AGENT</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--text-hi)' }}>
              {agent.name} → {project.name}
            </div>
          </div>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-lo)', padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        {isPM ? (
          <>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--amber)', letterSpacing: '0.1em', marginBottom: 10 }}>SELECT PROJECT MODE</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginBottom: 20 }}>
              {(presets?.pm_modes || Object.entries(PM_MODES).map(([id, m]) => ({ name: id, title: m.label, description: '', type: 'pm_modes' }))).map(mode => {
                const pmMeta = PM_MODES[mode.name];
                const icon = pmMeta?.icon || '📋';
                const label = mode.title || pmMeta?.label || mode.name;
                return (
                  <button key={mode.name} onClick={() => setDept(mode.name)} style={{
                    background: dept === mode.name ? 'rgba(245,158,11,0.12)' : 'var(--ink-3)',
                    border: `1px solid ${dept === mode.name ? 'rgba(245,158,11,0.4)' : 'var(--ink-4)'}`,
                    borderRadius: 4, padding: '8px 4px', cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    color: dept === mode.name ? '#f59e0b' : 'var(--text-mid)',
                    transition: 'all 120ms',
                  }}>
                    <span style={{ fontSize: 16 }}>{icon}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8 }}>{label}</span>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--blue)', letterSpacing: '0.1em', marginBottom: 10 }}>SELECT DEPARTMENT</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5, marginBottom: 20 }}>
              {(presets?.departments || Object.entries(DEPT_META).map(([id, d]) => ({ name: id, title: d.short, description: '', type: 'departments' }))).map(deptItem => {
                const deptMeta = DEPT_META[deptItem.name];
                const color = deptMeta?.color || '#3b82f6';
                const icon = deptMeta?.icon || '◧';
                const short = deptMeta?.short || deptItem.title || deptItem.name.slice(0, 2).toUpperCase();
                return (
                  <button key={deptItem.name} onClick={() => setDept(deptItem.name)} style={{
                    background: dept === deptItem.name ? `${color}15` : 'var(--ink-3)',
                    border: `1px solid ${dept === deptItem.name ? `${color}50` : 'var(--ink-4)'}`,
                    borderRadius: 4, padding: '7px 3px', cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                    color: dept === deptItem.name ? color : 'var(--text-lo)',
                    transition: 'all 120ms',
                    boxShadow: dept === deptItem.name ? `0 0 10px ${color}20` : 'none',
                  }}>
                    <span style={{ fontSize: 13, color: dept === deptItem.name ? color : 'var(--text-lo)' }}>{icon}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 7 }}>{short}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-lo)', letterSpacing: '0.1em', marginBottom: 8 }}>AI MODEL</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
          {MODELS.map(m => (
            <button key={m} onClick={() => setModel(m)} style={{
              flex: 1, padding: '7px 8px',
              background: model === m ? 'var(--glow-cyan)' : 'var(--ink-3)',
              border: `1px solid ${model === m ? 'rgba(34,211,238,0.4)' : 'var(--ink-4)'}`,
              borderRadius: 3, cursor: 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: 9,
              color: model === m ? 'var(--cyan)' : 'var(--text-lo)',
            }}>
              {m.split('-').slice(-2).join('-')}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} className="ops-btn" style={{ flex: 1, justifyContent: 'center' }}>Cancel</button>
          <button
            onClick={() => dept && onConfirm(dept, model)}
            disabled={!dept}
            className="ops-btn ops-btn-primary"
            style={{ flex: 2, justifyContent: 'center', opacity: dept ? 1 : 0.4 }}
          >
            <Zap size={11} /> Assign Agent
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main HQ Page ─────────────────────────────────────────────────────────────

export default function HQ() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [modal, setModal] = useState<{ agent: Agent; project: Project } | null>(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pm' | 'worker' | 'rnd'>('all');
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [confirmUnload, setConfirmUnload] = useState<Agent | null>(null);
  const [presets, setPresets] = useState<PresetsResponse | null>(null);
  const [collectingWorkers, setCollectingWorkers] = useState<Set<string>>(new Set());
  const [newlyJoined, setNewlyJoined] = useState<Set<string>>(new Set());
  const [recruitingProject, setRecruitingProject] = useState<string | null>(null);
  const collectTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const pushActivity = useCallback((text: string, type: ActivityItem['type'] = 'system') => {
    setActivity(prev => [{ id: Math.random().toString(36).slice(2), text, type, ts: Date.now() }, ...prev].slice(0, 30));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ar, pr] = await Promise.allSettled([agentsApi.list(), projectsApi.list()]);
      const agentList: Agent[] = ar.status === 'fulfilled' ? (ar.value.agents || []) : [];
      const projectList: Project[] = pr.status === 'fulfilled' ? (pr.value.projects || []) : [];

      // Enrich each agent with their current running task title
      const enriched = await Promise.all(agentList.map(async (a: Agent) => {
        try {
          const td = await fetchApi(`/api/agents/${a.id}/tasks?status=running&limit=1`);
          const running = td.tasks?.[0];
          return { ...a, taskCount: td.tasks?.length || 0, currentTask: running?.title || null };
        } catch { return { ...a, taskCount: 0, currentTask: null }; }
      }));

      setAgents(enriched);
      setProjects(projectList.filter((p: Project) => p.status === 'active'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Load presets for dynamic department/mode/division info
  useEffect(() => {
    presetsApi.list().then(setPresets).catch(() => { /* presets are optional */ });
  }, []);

  // WS: live activity feed + agent refresh
  useEffect(() => {
    const onTaskStarted   = (d: any) => { pushActivity(`▶ ${d.agent_name || 'Agent'} started: ${d.task_title || d.title}`, 'task'); load(); };
    const onTaskCompleted = (d: any) => { pushActivity(`✓ ${d.agent_name || 'Agent'} completed: ${d.task_title || d.title}`, 'task'); load(); };
    const onTaskAssigned  = (d: any) => { pushActivity(`⚡ Task assigned to ${d.agent_name || 'Agent'}: ${d.task_title || d.title}`, 'task'); load(); };
    const onAgentOnline   = (d: any) => { pushActivity(`● ${d.name || d.agent_name || 'Agent'} came online`, 'agent'); load(); };
    const onAgentOffline  = (d: any) => { pushActivity(`○ ${d.name || d.agent_name || 'Agent'} went offline`, 'agent'); load(); };
    const onStatusChanged = (d: any) => {
      const label = d.status === 'online' ? '●' : '○';
      pushActivity(`${label} ${d.agent_name || 'Agent'} is now ${d.status}`, 'agent');
      load();
    };
    const onAssigned      = (d: any) => { pushActivity(`→ ${d.agent_name || 'Agent'} assigned to project`, 'agent'); load(); };
    const onRemoved       = (d: any) => { pushActivity(`← ${d.agent_name || 'Agent'} removed from project`, 'agent'); load(); };

    wsClient.on('task:started',            onTaskStarted);
    wsClient.on('task:completed',          onTaskCompleted);
    wsClient.on('task:assigned',           onTaskAssigned);
    wsClient.on('agent:task_assigned',     onTaskAssigned);
    wsClient.on('agent:online',            onAgentOnline);
    wsClient.on('agent:offline',           onAgentOffline);
    wsClient.on('agent:status_changed',    onStatusChanged);
    wsClient.on('agent:assigned',          onAssigned);
    wsClient.on('agent:assigned_to_project', onAssigned);
    wsClient.on('agent:removed',           onRemoved);
    wsClient.on('agent:removed_from_project', onRemoved);

    return () => {
      wsClient.off('task:started',            onTaskStarted);
      wsClient.off('task:completed',          onTaskCompleted);
      wsClient.off('task:assigned',           onTaskAssigned);
      wsClient.off('agent:task_assigned',     onTaskAssigned);
      wsClient.off('agent:online',            onAgentOnline);
      wsClient.off('agent:offline',           onAgentOffline);
      wsClient.off('agent:status_changed',    onStatusChanged);
      wsClient.off('agent:assigned',          onAssigned);
      wsClient.off('agent:assigned_to_project', onAssigned);
      wsClient.off('agent:removed',           onRemoved);
      wsClient.off('agent:removed_from_project', onRemoved);
    };
  }, [load, pushActivity]);

  const activeAgent = activeId ? agents.find(a => a.id === activeId) : null;

  // ── Derived lists ──────────────────────────────────────────────────────────
  const freeAgents     = agents.filter(a => !a.project_id && a.agent_type !== 'rnd');
  const rndAgents      = agents.filter(a => a.agent_type === 'rnd');
  // Per-project: filter by project_id column
  const getProjectAgents = (projectId: string) =>
    agents.filter(a => a.project_id === projectId && a.agent_type !== 'rnd');

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { over, active } = e;
    if (!over) return;

    const agent = agents.find(a => a.id === String(active.id));
    if (!agent) return;

    const overId = String(over.id);

    // Dropped on free pool → queue confirm (never block drag end with confirm())
    if (overId === 'free-pool') {
      if (agent.project_id) setConfirmUnload(agent);
      return;
    }

    // Dropped on a project zone
    const project = projects.find(p => p.id === overId);
    if (project && agent.agent_type !== 'rnd') {
      // Don't re-open modal if already in that project
      if (agent.project_id === project.id) return;
      setModal({ agent, project });
    }
  }

  async function handleAssign(dept: string, model: string) {
    if (!modal) return;
    setSaving(true);
    const targetProject = modal.project;
    const assignedAgent = modal.agent;
    setModal(null);
    try {
      // 1. Update agent mode/model
      await fetchApi(`/api/agents/${assignedAgent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_mode: dept, current_model: model, project_id: targetProject.id }),
      });

      // 2. Assign to project — may auto-collect workers if PM
      let collectedWorkers: { id: string; name: string }[] = [];
      try {
        const resp = await fetchApi(`/api/projects/${targetProject.id}/assign-agent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agent_id: assignedAgent.id }),
        });
        collectedWorkers = resp.collected_workers || [];
      } catch { /* already assigned — ignore */ }

      // 3. Move PM into project immediately
      setAgents(prev => prev.map(a =>
        a.id === assignedAgent.id
          ? { ...a, current_mode: dept, current_model: model, project_id: targetProject.id }
          : a
      ));

      // 4. If workers were collected — run recruitment animation
      if (collectedWorkers.length > 0) {
        const workerIds = new Set(collectedWorkers.map(w => w.id));
        collectTimers.current.forEach(clearTimeout);

        // Phase 1 (0ms): pulse workers in free pool
        setCollectingWorkers(workerIds);
        setRecruitingProject(targetProject.id);
        pushActivity(`⚡ ${assignedAgent.name} recruiting ${collectedWorkers.length} worker${collectedWorkers.length > 1 ? 's' : ''} for ${targetProject.name}`, 'agent');

        // Phase 2 (900ms): move workers into project + slide-in glow
        const t1 = setTimeout(() => {
          setAgents(prev => prev.map(a =>
            workerIds.has(a.id) ? { ...a, project_id: targetProject.id } : a
          ));
          setNewlyJoined(workerIds);
          setCollectingWorkers(new Set());
          setRecruitingProject(null);
          pushActivity(`✓ ${collectedWorkers.map(w => w.name).join(', ')} joined ${targetProject.name}`, 'agent');
        }, 900);

        // Phase 3 (2400ms): clear glow
        const t2 = setTimeout(() => setNewlyJoined(new Set()), 2400);
        collectTimers.current = [t1, t2];
      } else {
        pushActivity(`→ ${assignedAgent.name} assigned to ${targetProject.name} as ${dept}`, 'agent');
      }
    } catch (e: any) {
      console.error(e);
      toast.error('Assignment Failed', e?.message || 'Could not assign agent');
    } finally {
      setSaving(false);
    }
  }

  async function handleUnload(agent: Agent) {
    try {
      await fetchApi(`/api/agents/${agent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_mode: null, current_model: null, project_id: null }),
      });
      setAgents(prev => prev.map(a =>
        a.id === agent.id ? { ...a, current_mode: null, current_model: null, project_id: null } : a
      ));
      pushActivity(`← ${agent.name} released to free pool`, 'agent');
    } catch (e: any) { console.error(e); toast.error('Unload Failed', e?.message || 'Could not release agent'); }
  }

  const filteredFree = filter === 'all' ? freeAgents : freeAgents.filter(a => a.agent_type === filter);

  // Stats
  const assignedAgents = agents.filter(a => a.project_id && a.agent_type !== 'rnd');
  const stats = {
    total: agents.filter(a => a.agent_type !== 'rnd').length,
    free: freeAgents.length,
    assigned: assignedAgents.length,
    pm: agents.filter(a => a.agent_type === 'pm').length,
    worker: agents.filter(a => a.agent_type === 'worker').length,
    rnd: rndAgents.length,
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, gap: 10 }}>
      <Loader2 size={16} className="animate-spin" style={{ color: 'var(--cyan)' }} />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-lo)', letterSpacing: '0.1em' }}>LOADING INVENTORY...</span>
    </div>
  );

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <style>{`
        @keyframes hq-recruit-pulse {
          from { opacity: 0.7; box-shadow: 0 0 8px rgba(245,158,11,0.3); }
          to   { opacity: 1;   box-shadow: 0 0 20px rgba(245,158,11,0.7); }
        }
        @keyframes hq-join-glow {
          0%   { box-shadow: 0 0 0px rgba(16,185,129,0); transform: scale(0.92); opacity: 0.4; }
          60%  { box-shadow: 0 0 24px rgba(16,185,129,0.7); transform: scale(1.04); opacity: 1; }
          100% { box-shadow: 0 0 18px rgba(16,185,129,0.4); transform: scale(1); }
        }
        @keyframes hq-slide-in {
          from { transform: translateX(-18px); opacity: 0; }
          to   { transform: translateX(0);     opacity: 1; }
        }
        @keyframes hq-badge-pop {
          from { transform: scale(0.5); opacity: 0; }
          to   { transform: scale(1);   opacity: 1; }
        }
      `}</style>
      <div className="animate-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--cyan)', letterSpacing: '0.18em', opacity: 0.7, marginBottom: 4 }}>// Agent Inventory</div>
            <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: 'var(--text-hi)', letterSpacing: '0.05em' }}>HQ</h1>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={() => navigate('/agents/register')} className="ops-btn ops-btn-primary" style={{ fontSize: 10 }}>
              <Cpu size={10} /> New Agent
            </button>
            <button onClick={load} className="ops-btn" style={{ fontSize: 10 }}>
              <RefreshCw size={10} /> Refresh
            </button>
          </div>
        </div>

        {/* Stat strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
          {[
            { label: 'Total Agents', value: stats.total, color: 'var(--cyan)' },
            { label: 'Free', value: stats.free, color: '#10b981' },
            { label: 'Assigned', value: stats.assigned, color: '#f59e0b' },
            { label: 'PM Agents', value: stats.pm, color: '#f59e0b' },
            { label: 'Workers', value: stats.worker, color: '#3b82f6' },
            { label: 'R&D', value: stats.rnd, color: '#ef4444' },
          ].map(({ label, value, color }) => (
            <div key={label} className="neon-card" style={{ padding: '10px 12px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.8, marginBottom: 4 }}>{label}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color, textShadow: `0 0 16px ${color}40` }}>{value}</div>
            </div>
          ))}
        </div>

        {/* ── FREE POOL ──────────────────────────────────────────────────── */}
        <div className="neon-card neon-card-cyan" style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--cyan)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
                // FREE POOL — {freeAgents.length} agents available
              </div>
            </div>
            {/* Type filters */}
            <div style={{ display: 'flex', gap: 4 }}>
              {(['all', 'pm', 'worker'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)} style={{
                  fontFamily: 'var(--font-mono)', fontSize: 8, padding: '3px 8px', borderRadius: 2,
                  border: `1px solid ${filter === f ? 'var(--cyan)' : 'var(--ink-5)'}`,
                  background: filter === f ? 'var(--glow-cyan)' : 'var(--ink-3)',
                  color: filter === f ? 'var(--cyan)' : 'var(--text-lo)',
                  cursor: 'pointer', letterSpacing: '0.08em', textTransform: 'uppercase',
                }}>{f === 'all' ? 'All' : f.toUpperCase()}</button>
              ))}
            </div>
          </div>

          <DroppableZone id="free-pool" label="drop here to release agent" color="var(--cyan)">
            {filteredFree.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>
                {freeAgents.length === 0 ? 'No free agents — all assigned' : 'No agents of this type'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {filteredFree.map(agent => (
                  <DraggableAgent key={agent.id} agent={agent} collecting={collectingWorkers.has(agent.id)} />
                ))}
              </div>
            )}
          </DroppableZone>
        </div>

        {/* ── ACTIVE PROJECTS ────────────────────────────────────────────── */}
        <div className="neon-card" style={{ padding: '14px 16px', borderColor: 'rgba(59,130,246,0.15)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--blue)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 14 }}>
            // ACTIVE PROJECTS — drag agents here to assign
          </div>

          {projects.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '28px 0', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>
              No active projects.{' '}
              <span onClick={() => navigate('/new-project')} style={{ color: 'var(--cyan)', cursor: 'pointer' }}>Create one →</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {projects.map(project => {
                const projectAgents = getProjectAgents(project.id);
                const runningCount = projectAgents.filter(a => normalizeAgentStatus(a) === 'working').length;
                return (
                  <div key={project.id} style={{
                    background: 'var(--ink-1)', border: '1px solid var(--ink-4)',
                    borderRadius: 6, padding: 14,
                  }}>
                    {/* Recruiting banner */}
                    {recruitingProject === project.id && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '5px 10px', marginBottom: 10, borderRadius: 3,
                        background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)',
                        fontFamily: 'var(--font-mono)', fontSize: 9, color: '#f59e0b',
                        letterSpacing: '0.1em', animation: 'hq-recruit-pulse 0.7s ease-in-out infinite alternate',
                      }}>
                        <Zap size={10} /> RECRUITING WORKERS...
                      </div>
                    )}
                    {/* Project header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--text-hi)' }}>{project.name}</span>
                        <span className="ops-badge ops-badge-green" style={{ fontSize: 8 }}>ACTIVE</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-lo)' }}>
                          {projectAgents.length} agent{projectAgents.length !== 1 ? 's' : ''}
                          {runningCount > 0 && <span style={{ color: '#f59e0b', marginLeft: 4 }}>· {runningCount} working</span>}
                        </span>
                      </div>
                      <button onClick={() => navigate(`/projects/${project.id}`)} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--text-lo)', display: 'flex', alignItems: 'center', gap: 3,
                        fontFamily: 'var(--font-mono)', fontSize: 9,
                      }}>
                        Open <ChevronRight size={10} />
                      </button>
                    </div>

                    {/* Assigned agents + drop zone */}
                    <DroppableZone id={project.id} label={`+ drop agent into ${project.name}`} color="var(--blue)">
                      {projectAgents.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {projectAgents.map(agent => (
                            <div key={agent.id} style={{ position: 'relative', animation: newlyJoined.has(agent.id) ? 'hq-slide-in 0.35s ease-out' : undefined }}>
                              <DraggableAgent agent={agent} inProject justJoined={newlyJoined.has(agent.id)} />
                              {/* Release button */}
                              <button
                                onClick={() => setConfirmUnload(agent)}
                                title="Release agent"
                                style={{
                                  position: 'absolute', top: -4, right: -4,
                                  width: 14, height: 14, borderRadius: '50%',
                                  background: 'var(--ink-4)', border: '1px solid var(--ink-5)',
                                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  color: 'var(--text-lo)', padding: 0,
                                }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#ef4444'; (e.currentTarget as HTMLElement).style.color = '#fff'; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--ink-4)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-lo)'; }}
                              >
                                <X size={8} />
                              </button>
                              {/* Live task indicator */}
                              {agent.currentTask && (
                                <div style={{
                                  position: 'absolute', bottom: -18, left: 0, right: 0,
                                  fontFamily: 'var(--font-mono)', fontSize: 7,
                                  color: '#f59e0b', whiteSpace: 'nowrap', overflow: 'hidden',
                                  textOverflow: 'ellipsis', maxWidth: 140,
                                  textShadow: '0 0 8px rgba(245,158,11,0.4)',
                                }}>
                                  ▶ {agent.currentTask}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', textAlign: 'center', padding: '8px 0' }}>
                          No agents assigned — drag from Free Pool above
                        </div>
                      )}
                    </DroppableZone>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── R&D PANEL ──────────────────────────────────────────────────── */}
        <div className="neon-card neon-card-rnd" style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--red)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
              // R&D AGENTS — always on
            </div>
            <span className="ops-dot ops-dot-red ops-dot-live" />
          </div>

          {rndAgents.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>
              No R&D agents registered.{' '}
              <span onClick={() => navigate('/agents/register')} style={{ color: 'var(--red)', cursor: 'pointer' }}>Register one →</span>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
              {rndAgents.map(agent => {
                const div = agent.rnd_division ? RND_META[agent.rnd_division] : null;
                return (
                  <div key={agent.id} style={{
                    background: 'var(--ink-2)', border: '1px solid rgba(239,68,68,0.15)',
                    borderRadius: 4, padding: '10px 12px', position: 'relative', overflow: 'hidden',
                  }}>
                    {/* Scan line */}
                    <div style={{
                      position: 'absolute', top: 0, left: 0, right: 0, height: 1,
                      background: 'linear-gradient(90deg, transparent, rgba(239,68,68,0.5), transparent)',
                      backgroundSize: '200% 100%', animation: 'ops-scan 3s linear infinite',
                    }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <span style={{ fontSize: 14, color: '#ef4444' }}>{div?.icon || '⟐'}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, color: 'var(--text-hi)' }}>{agent.name}</span>
                      <span className="ops-dot ops-dot-red ops-dot-live" style={{ marginLeft: 'auto' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: '#ef4444', opacity: 0.7 }}>
                        {agent.rnd_division?.replace(/_/g, ' ').toUpperCase() || 'GENERAL'}
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-lo)' }}>
                        {div?.schedule || 'scheduled'}
                      </span>
                    </div>
                    <div style={{ marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-lo)' }}>
                      Last run: {fmtTime(agent.rnd_last_run)}
                    </div>
                    <button
                      onClick={() => navigate('/chat')}
                      style={{
                        marginTop: 8, width: '100%',
                        background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                        borderRadius: 3, padding: '4px 0', cursor: 'pointer',
                        fontFamily: 'var(--font-mono)', fontSize: 8, color: '#ef4444',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                      }}>
                      <Radio size={9} /> View Feed
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── LIVE ACTIVITY FEED ─────────────────────────────────────────── */}
        <div className="neon-card" style={{ padding: '14px 16px', borderColor: 'rgba(16,185,129,0.15)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#10b981', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
                // LIVE ACTIVITY
              </div>
              <span className="ops-dot ops-dot-green ops-dot-pulse" />
            </div>
            {activity.length > 0 && (
              <button onClick={() => setActivity([])} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-lo)' }}>
                clear
              </button>
            )}
          </div>

          {activity.length === 0 ? (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', padding: '12px 0', textAlign: 'center' }}>
              Waiting for agent activity... events will appear here in real-time.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
              {activity.map(item => {
                const color = item.type === 'task' ? '#f59e0b' : item.type === 'agent' ? 'var(--cyan)' : 'var(--text-lo)';
                const Icon = item.type === 'task'
                  ? (item.text.startsWith('✓') ? CheckCircle : item.text.startsWith('▶') ? Activity : Clock)
                  : item.type === 'agent' ? Bot : AlertCircle;
                const ago = Math.floor((Date.now() - item.ts) / 1000);
                const agoStr = ago < 60 ? `${ago}s ago` : `${Math.floor(ago/60)}m ago`;
                return (
                  <div key={item.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '5px 8px', borderRadius: 3,
                    background: 'var(--ink-2)', borderLeft: `2px solid ${color}`,
                    animation: 'animate-fade-up 200ms ease-out',
                  }}>
                    <Icon size={10} style={{ color, flexShrink: 0 }} />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-mid)', flex: 1 }}>
                      {item.text}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-lo)', flexShrink: 0 }}>
                      {agoStr}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick nav */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          {[
            { label: 'Projects', icon: Activity, path: '/projects' },
            { label: 'Assign Board', icon: Cpu, path: '/assign' },
            { label: 'Chat / Comms', icon: MessageSquare, path: '/chat' },
            { label: 'Admin Panel', icon: Bot, path: '/admin' },
          ].map(({ label, icon: Icon, path }) => (
            <button key={label} onClick={() => navigate(path)} className="ops-btn" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 6, padding: 10, fontSize: 10,
            }}>
              <Icon size={11} /> {label}
            </button>
          ))}
        </div>

      </div>

      {/* Drag overlay — pointerEvents:none so it doesn't block drop zones */}
      <DragOverlay dropAnimation={null}>
        {activeAgent && (
          <div style={{ pointerEvents: 'none', opacity: 0.9, transform: 'rotate(2deg)', filter: `drop-shadow(0 0 12px ${activeAgent.agent_type === 'pm' ? '#f59e0b' : activeAgent.agent_type === 'rnd' ? '#ef4444' : '#3b82f6'}60)` }}>
            <AgentCard agent={activeAgent} dragging />
          </div>
        )}
      </DragOverlay>

      {/* Assignment modal */}
      {modal && (
        <AssignModal
          agent={modal.agent}
          project={modal.project}
          onConfirm={handleAssign}
          onCancel={() => setModal(null)}
          presets={presets}
        />
      )}

      {/* Confirm unload dialog */}
      {confirmUnload && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'var(--ink-2)', border: '1px solid var(--ink-5)',
            borderRadius: 8, padding: '24px 28px', minWidth: 320,
            boxShadow: '0 0 30px rgba(239,68,68,0.1)',
          }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#ef4444', letterSpacing: '0.15em', marginBottom: 10 }}>// RELEASE AGENT</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-hi)', marginBottom: 6 }}>
              Release <span style={{ color: 'var(--cyan)' }}>{confirmUnload.name}</span>?
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-lo)', marginBottom: 20 }}>
              Agent will return to Free Pool and lose their current assignment.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="ops-btn" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setConfirmUnload(null)}>Cancel</button>
              <button
                className="ops-btn"
                style={{ flex: 1, justifyContent: 'center', borderColor: 'rgba(239,68,68,0.4)', color: '#ef4444' }}
                onClick={() => { handleUnload(confirmUnload); setConfirmUnload(null); }}
              >
                Release
              </button>
            </div>
          </div>
        </div>
      )}

      {saving && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 2000,
          background: 'var(--ink-2)', border: '1px solid var(--cyan)30',
          borderRadius: 6, padding: '10px 16px',
          display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: '0 0 20px rgba(34,211,238,0.15)',
        }}>
          <Loader2 size={12} className="animate-spin" style={{ color: 'var(--cyan)' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-mid)' }}>Assigning...</span>
        </div>
      )}
    </DndContext>
  );
}
