import { useState } from 'react';
import {
  BookOpen, Server, Cpu, MessageSquare, Shield, Zap, ChevronDown, ChevronUp,
  Copy, CheckCircle, Monitor, Users, GitBranch, Target, Calendar, Clock,
  ArrowRight, Database, Globe, Radio, Bot, Layers, FlaskConical, BarChart3,
  Settings, Activity, FolderOpen
} from 'lucide-react';

const M: React.CSSProperties = { fontFamily: 'var(--font-mono)' };

// ── Tab system ──────────────────────────────────────────────────────────────
const TABS = [
  { id: 'overview', label: 'OVERVIEW', icon: BookOpen },
  { id: 'architecture', label: 'ARCHITECTURE', icon: Layers },
  { id: 'features', label: 'FEATURES', icon: Zap },
  { id: 'roadmap', label: 'ROADMAP', icon: Target },
  { id: 'api', label: 'API REFERENCE', icon: Server },
] as const;
type Tab = typeof TABS[number]['id'];

// ── Progress data ───────────────────────────────────────────────────────────
type PhaseStatus = 'completed' | 'in_progress' | 'planned';
interface ProjectPhase {
  name: string;
  status: PhaseStatus;
  progress: number;
  items: Array<{ name: string; done: boolean }>;
}

const PROJECT_PHASES: ProjectPhase[] = [
  {
    name: 'Foundation',
    status: 'completed' as const,
    progress: 100,
    items: [
      { name: 'Fastify API server + SQLite database', done: true },
      { name: 'User authentication (JWT + bcrypt)', done: true },
      { name: 'React + Vite frontend scaffold', done: true },
      { name: 'Admin panel with role-based access', done: true },
      { name: 'Docker containerization', done: true },
    ],
  },
  {
    name: 'Agent Management',
    status: 'completed' as const,
    progress: 100,
    items: [
      { name: 'Agent self-registration via CLI', done: true },
      { name: 'Admin approval workflow', done: true },
      { name: 'Agent status tracking (online/offline)', done: true },
      { name: 'Agent-to-project assignment', done: true },
      { name: 'Agent types: PM, Worker, R&D', done: true },
      { name: 'Drag-and-drop HQ assignment board', done: true },
    ],
  },
  {
    name: 'Task System',
    status: 'completed' as const,
    progress: 100,
    items: [
      { name: 'Task CRUD with project association', done: true },
      { name: 'Task lifecycle (pending > running > completed)', done: true },
      { name: 'AI-powered task execution via OpenRouter', done: true },
      { name: 'Cost tracking per task execution', done: true },
      { name: 'Task assignment with accept/reject flow', done: true },
    ],
  },
  {
    name: 'Real-Time Communication',
    status: 'completed' as const,
    progress: 100,
    items: [
      { name: 'WebSocket server with keepalive', done: true },
      { name: 'Channel-based chat (general, project, DM)', done: true },
      { name: 'Agent-to-human DM messaging', done: true },
      { name: 'Live notifications via WebSocket', done: true },
      { name: 'Activity feed with real-time updates', done: true },
    ],
  },
  {
    name: 'Cost & Token Intelligence',
    status: 'completed' as const,
    progress: 100,
    items: [
      { name: 'OpenRouter cost sync and tracking', done: true },
      { name: 'Per-model token usage breakdown', done: true },
      { name: 'Budget management system', done: true },
      { name: 'Token dashboard with daily charts', done: true },
      { name: 'Provider status monitoring', done: true },
    ],
  },
  {
    name: 'R&D Autonomous Agents',
    status: 'completed' as const,
    progress: 100,
    items: [
      { name: 'R&D division system (security, market, tech)', done: true },
      { name: 'Cron-based autonomous scheduling', done: true },
      { name: 'Research findings feed', done: true },
      { name: 'Manual trigger + schedule control panel', done: true },
    ],
  },
  {
    name: 'Polish & Hardening',
    status: 'completed' as const,
    progress: 100,
    items: [
      { name: 'Security hardening (Helmet, rate limiting, Zod)', done: true },
      { name: 'Centralized error handling with toast notifications', done: true },
      { name: 'Settings page (profile, preferences, password)', done: true },
      { name: 'In-app documentation page', done: true },
      { name: 'CORS configuration for multi-port dev', done: true },
      { name: 'Test suite setup (Vitest) — 99 tests passing', done: true },
      { name: 'Production deployment hardening', done: true },
      { name: 'Performance optimization & caching', done: true },
    ],
  },
  {
    name: 'Multi-Machine Fleet',
    status: 'completed' as const,
    progress: 100,
    items: [
      { name: 'Machine registration and tracking', done: true },
      { name: 'Machine-agent assignment junction', done: true },
      { name: 'Real LLM-powered agent spawning', done: true },
      { name: 'Cross-machine load balancing', done: true },
      { name: 'Fleet health monitoring dashboard', done: true },
    ],
  },
];

const OVERALL_PROGRESS = Math.round(
  PROJECT_PHASES.reduce((sum, p) => sum + p.progress, 0) / PROJECT_PHASES.length
);

// ── Architecture components ─────────────────────────────────────────────────
const ARCH_LAYERS = [
  {
    name: 'Frontend',
    color: '#22d3ee',
    tech: 'React 18 + TypeScript + Vite',
    modules: [
      { name: 'Dashboard', desc: 'Overview with agent/project/machine stats' },
      { name: 'HQ Board', desc: 'Drag-and-drop agent assignment' },
      { name: 'Chat', desc: 'Real-time messaging (Zustand store)' },
      { name: 'Projects', desc: 'CRUD + task management' },
      { name: 'Costs', desc: 'Budget tracking & token analytics' },
      { name: 'R&D Panel', desc: 'Autonomous research control' },
      { name: 'Fleet', desc: 'Machine monitoring & load balancing' },
      { name: 'Admin', desc: 'Agent approval & system management' },
    ],
  },
  {
    name: 'API Layer',
    color: '#f59e0b',
    tech: 'Fastify + Node.js',
    modules: [
      { name: 'REST API', desc: '55+ endpoints across 9 domains' },
      { name: 'WebSocket', desc: 'Persistent real-time + Redis pub/sub' },
      { name: 'Auth', desc: 'JWT sessions + bcrypt passwords' },
      { name: 'AI Executor', desc: 'OpenRouter LLM integration' },
      { name: 'R&D Scheduler', desc: 'Cron-based agent automation' },
      { name: 'Redis', desc: 'Caching, rate limiting, pub/sub' },
      { name: 'Sentry', desc: 'Error tracking & monitoring' },
    ],
  },
  {
    name: 'Data Layer',
    color: '#4ade80',
    tech: 'SQLite (PostgreSQL ready)',
    modules: [
      { name: 'manager_agents', desc: 'Active agent registry' },
      { name: 'projects + tasks', desc: 'Work management' },
      { name: 'channels + messages', desc: 'Chat persistence' },
      { name: 'cost_records', desc: 'AI execution costs' },
      { name: 'activity_history', desc: 'Full audit trail' },
    ],
  },
];

// ── Feature cards ───────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: Bot, color: '#22d3ee', title: 'AI Agent Fleet',
    desc: 'Self-registering AI agents connect via CLI, get admin approval, and receive task assignments. Three agent types: Project Managers plan work, Workers execute code, R&D agents research autonomously.',
  },
  {
    icon: FolderOpen, color: '#a78bfa', title: 'Project Management',
    desc: 'Create projects, assign agents with roles (lead/contributor/observer), track tasks through their lifecycle, and monitor costs. Each project gets its own chat channel.',
  },
  {
    icon: Zap, color: '#f59e0b', title: 'AI Task Execution',
    desc: 'Tasks are processed by AI agents through OpenRouter. The system builds context-aware prompts based on agent type, project, and preset configurations. Token usage and costs are tracked per execution.',
  },
  {
    icon: MessageSquare, color: '#4ade80', title: 'Real-Time Chat',
    desc: 'WebSocket-powered messaging with general channels, project channels, and agent DMs. Agents auto-reply when mentioned. Messages persist in SQLite with full history.',
  },
  {
    icon: FlaskConical, color: '#f472b6', title: 'R&D Automation',
    desc: 'R&D agents run on configurable cron schedules, producing research findings organized by division (security intel, market analysis, tech scouting). Manual triggers and schedule controls available.',
  },
  {
    icon: BarChart3, color: '#fb923c', title: 'Cost Intelligence',
    desc: 'Track AI spending across models and providers. Budget management, per-model breakdowns, daily usage charts, and OpenRouter credit monitoring keep costs transparent.',
  },
  {
    icon: Monitor, color: '#60a5fa', title: 'Machine Fleet',
    desc: 'Register physical machines (Mac Minis) as compute nodes. Assign agents to specific machines for distributed workload management across your infrastructure.',
  },
  {
    icon: Shield, color: '#ef4444', title: 'Security & Auth',
    desc: 'JWT-based authentication, bcrypt password hashing, Helmet security headers, rate limiting, Zod input validation, and CORS controls. Role-based access (admin, user, readonly).',
  },
];

// ── API sections ────────────────────────────────────────────────────────────
const API_SECTIONS = [
  {
    title: 'PROJECTS', icon: FolderOpen,
    endpoints: [
      { method: 'GET', path: '/api/projects', desc: 'List all projects' },
      { method: 'POST', path: '/api/projects', desc: 'Create new project' },
      { method: 'GET', path: '/api/projects/:id', desc: 'Get project details' },
      { method: 'GET', path: '/api/projects/:id/tasks', desc: 'Get project tasks' },
      { method: 'GET', path: '/api/projects/:id/agents', desc: 'List project agents' },
      { method: 'POST', path: '/api/projects/:id/assign-agent', desc: 'Assign agent to project' },
      { method: 'PATCH', path: '/api/projects/:id/status', desc: 'Update project status' },
    ],
  },
  {
    title: 'TASKS', icon: Target,
    endpoints: [
      { method: 'POST', path: '/api/tasks', desc: 'Create new task' },
      { method: 'GET', path: '/api/tasks/:id', desc: 'Get task details' },
      { method: 'POST', path: '/api/tasks/:id/accept', desc: 'Agent accepts task' },
      { method: 'POST', path: '/api/tasks/:id/start', desc: 'Start task (pending > running)' },
      { method: 'POST', path: '/api/tasks/:id/complete', desc: 'Complete task' },
      { method: 'POST', path: '/api/tasks/:id/execute', desc: 'Execute task via AI' },
      { method: 'POST', path: '/api/tasks/:id/reject', desc: 'Decline task' },
    ],
  },
  {
    title: 'AGENTS', icon: Bot,
    endpoints: [
      { method: 'GET', path: '/api/agents', desc: 'List all agents' },
      { method: 'GET', path: '/api/agents/:id', desc: 'Get agent profile' },
      { method: 'POST', path: '/api/agents/register', desc: 'Register new agent' },
      { method: 'POST', path: '/api/agents/:id/status', desc: 'Update agent status' },
      { method: 'POST', path: '/api/admin/agents/:id/approve', desc: 'Approve agent (admin)' },
      { method: 'POST', path: '/api/admin/agents/:id/reject', desc: 'Reject agent (admin)' },
      { method: 'GET', path: '/api/agents/directory', desc: 'Agent discovery for A2A' },
      { method: 'POST', path: '/api/agents/:id/message', desc: 'Agent-to-agent message' },
    ],
  },
  {
    title: 'CHAT', icon: MessageSquare,
    endpoints: [
      { method: 'GET', path: '/api/channels', desc: 'List channels' },
      { method: 'GET', path: '/api/channels/:id/messages', desc: 'Get channel messages' },
      { method: 'POST', path: '/api/channels/:id/messages', desc: 'Send message to channel' },
      { method: 'GET', path: '/api/dm', desc: 'Get DM channels' },
      { method: 'POST', path: '/api/dm/:agent_id', desc: 'Send DM to agent' },
    ],
  },
  {
    title: 'AUTH', icon: Shield,
    endpoints: [
      { method: 'POST', path: '/api/auth/login', desc: 'Login' },
      { method: 'POST', path: '/api/auth/register', desc: 'Register' },
      { method: 'POST', path: '/api/auth/logout', desc: 'Logout' },
      { method: 'GET', path: '/api/auth/me', desc: 'Current user' },
    ],
  },
  {
    title: 'COSTS & TOKENS', icon: BarChart3,
    endpoints: [
      { method: 'GET', path: '/api/costs/summary', desc: 'Cost summary' },
      { method: 'GET', path: '/api/costs/actual', desc: 'Real costs from OpenRouter' },
      { method: 'GET', path: '/api/costs/budget', desc: 'Budget vs actual' },
      { method: 'GET', path: '/api/tokens/dashboard', desc: 'Token dashboard' },
      { method: 'GET', path: '/api/tokens/usage', desc: 'Daily usage' },
    ],
  },
  {
    title: 'R&D', icon: FlaskConical,
    endpoints: [
      { method: 'GET', path: '/api/rnd/status', desc: 'R&D agent status' },
      { method: 'GET', path: '/api/rnd/feed', desc: 'Findings feed' },
      { method: 'POST', path: '/api/rnd/:id/execute', desc: 'Trigger execution' },
      { method: 'PATCH', path: '/api/rnd/:id/schedule', desc: 'Update schedule' },
    ],
  },
  {
    title: 'MACHINES', icon: Monitor,
    endpoints: [
      { method: 'GET', path: '/api/machines', desc: 'List machines' },
      { method: 'GET', path: '/api/machines/health', desc: 'Fleet health overview' },
      { method: 'POST', path: '/api/machines/register', desc: 'Register machine' },
      { method: 'POST', path: '/api/machines/assign-agent', desc: 'Auto-assign to least-loaded' },
      { method: 'DELETE', path: '/api/machines/:id', desc: 'Delete machine' },
    ],
  },
];

const METHOD_COLORS: Record<string, string> = {
  GET: '#4ade80', POST: '#f59e0b', PATCH: '#22d3ee', PUT: '#22d3ee', DELETE: '#ef4444',
};

// ── Shared components ───────────────────────────────────────────────────────
function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ ...M, fontSize: 10, color: 'var(--text-lo)', letterSpacing: '0.15em', marginBottom: 10, marginTop: 24 }}>
      {children}
    </div>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      padding: '14px 16px', borderRadius: 6, background: 'var(--ink-2)',
      border: '1px solid var(--ink-4)', ...style,
    }}>
      {children}
    </div>
  );
}

function ProgressBar({ value, color = 'var(--cyan)' }: { value: number; color?: string }) {
  return (
    <div style={{ height: 4, borderRadius: 2, background: 'var(--ink-4)', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${value}%`, background: color, borderRadius: 2, transition: 'width 0.5s' }} />
    </div>
  );
}

function StatusBadge({ status }: { status: 'completed' | 'in_progress' | 'planned' }) {
  const cfg = {
    completed: { bg: 'rgba(74,222,128,0.15)', color: '#4ade80', label: 'COMPLETED' },
    in_progress: { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', label: 'IN PROGRESS' },
    planned: { bg: 'rgba(96,165,250,0.15)', color: '#60a5fa', label: 'PLANNED' },
  }[status];
  return (
    <span style={{
      ...M, fontSize: 8, fontWeight: 700, padding: '2px 6px', borderRadius: 2,
      background: cfg.bg, color: cfg.color, letterSpacing: '0.1em',
    }}>
      {cfg.label}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-lo)' }}
    >
      {copied ? <CheckCircle size={10} /> : <Copy size={10} />}
    </button>
  );
}

// ── Tab: Overview ───────────────────────────────────────────────────────────
function OverviewTab() {
  return (
    <>
      {/* Hero */}
      <Card style={{ borderLeft: '3px solid var(--cyan)', marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-hi)', marginBottom: 6 }}>
          PROJECT-CLAW
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-md)', lineHeight: 1.6, marginBottom: 12 }}>
          A full-stack AI agent management platform where a human admin (<strong style={{ color: 'var(--amber)' }}>Scorpion</strong>) orchestrates
          a fleet of AI agents. Agents self-register via CLI, get approved, receive task assignments,
          execute work using LLMs, and communicate through real-time chat. Think of it as a
          <strong style={{ color: 'var(--cyan)' }}> mission control center</strong> for AI workers.
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 11 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Globe size={11} style={{ color: 'var(--cyan)' }} /> <span style={{ color: 'var(--text-lo)' }}>Frontend:</span> <span style={{ color: 'var(--text-hi)' }}>React + TypeScript + Vite</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Server size={11} style={{ color: '#f59e0b' }} /> <span style={{ color: 'var(--text-lo)' }}>Backend:</span> <span style={{ color: 'var(--text-hi)' }}>Fastify + SQLite</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Radio size={11} style={{ color: '#4ade80' }} /> <span style={{ color: 'var(--text-lo)' }}>Real-time:</span> <span style={{ color: 'var(--text-hi)' }}>WebSocket</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Cpu size={11} style={{ color: '#a78bfa' }} /> <span style={{ color: 'var(--text-lo)' }}>AI:</span> <span style={{ color: 'var(--text-hi)' }}>OpenRouter (Claude, GPT, Kimi)</span>
          </div>
        </div>
      </Card>

      {/* Overall progress */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-hi)' }}>OVERALL PROJECT PROGRESS</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--cyan)' }}>{OVERALL_PROGRESS}%</span>
        </div>
        <ProgressBar value={OVERALL_PROGRESS} />
        <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 10, color: 'var(--text-lo)' }}>
          <span><CheckCircle size={10} style={{ color: '#4ade80', verticalAlign: 'middle' }} /> {PROJECT_PHASES.filter(p => p.status === 'completed').length} phases completed</span>
          <span><Clock size={10} style={{ color: '#f59e0b', verticalAlign: 'middle' }} /> {PROJECT_PHASES.filter(p => p.status === 'in_progress').length} in progress</span>
          <span><Target size={10} style={{ color: '#60a5fa', verticalAlign: 'middle' }} /> {PROJECT_PHASES.filter(p => p.status === 'planned').length} planned</span>
        </div>
      </Card>

      {/* How it works - visual flow */}
      <SectionHeader>HOW IT WORKS</SectionHeader>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          {[
            { icon: Bot, label: 'Agent registers\nvia CLI', color: '#22d3ee' },
            { icon: Shield, label: 'Admin approves\nin panel', color: '#f59e0b' },
            { icon: FolderOpen, label: 'Assigned to\nproject', color: '#a78bfa' },
            { icon: Target, label: 'Receives task\nassignment', color: '#fb923c' },
            { icon: Cpu, label: 'AI executes\nvia LLM', color: '#4ade80' },
            { icon: BarChart3, label: 'Cost tracked\n& reported', color: '#f472b6' },
          ].map((step, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                padding: '12px 14px', borderRadius: 6, background: 'var(--ink-3)',
                border: `1px solid ${step.color}30`, minWidth: 95,
              }}>
                <step.icon size={18} style={{ color: step.color }} />
                <span style={{ fontSize: 9, color: 'var(--text-md)', textAlign: 'center', whiteSpace: 'pre-line', lineHeight: 1.3 }}>
                  {step.label}
                </span>
              </div>
              {i < 5 && <ArrowRight size={14} style={{ color: 'var(--text-lo)', flexShrink: 0 }} />}
            </div>
          ))}
        </div>
      </Card>

      {/* Key stats */}
      <SectionHeader>PROJECT STATS</SectionHeader>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'API Endpoints', value: '60+', color: '#f59e0b' },
          { label: 'Frontend Pages', value: '16', color: '#22d3ee' },
          { label: 'DB Tables', value: '12', color: '#4ade80' },
          { label: 'WS Events', value: '10', color: '#a78bfa' },
        ].map(s => (
          <Card key={s.label}>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 9, color: 'var(--text-lo)', letterSpacing: '0.1em' }}>{s.label}</div>
          </Card>
        ))}
      </div>

      {/* Task lifecycle */}
      <SectionHeader>TASK LIFECYCLE</SectionHeader>
      <Card>
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 6, flexWrap: 'wrap' }}>
          {[
            { status: 'pending', desc: 'Created, awaiting agent', color: 'var(--text-lo)' },
            { status: 'accepted', desc: 'Agent acknowledged', color: '#22d3ee' },
            { status: 'running', desc: 'AI executing task', color: '#f59e0b' },
            { status: 'completed', desc: 'Successfully done', color: '#4ade80' },
            { status: 'failed', desc: 'Execution error', color: '#ef4444' },
          ].map((s, i) => (
            <div key={s.status} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                padding: '8px 12px', borderRadius: 4, border: `1px solid ${s.color}40`,
                background: `${s.color}10`, textAlign: 'center',
              }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: s.color }}>{s.status}</div>
                <div style={{ fontSize: 8, color: 'var(--text-lo)', marginTop: 2 }}>{s.desc}</div>
              </div>
              {i < 4 && <ArrowRight size={12} style={{ color: 'var(--text-lo)' }} />}
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

// ── Tab: Architecture ───────────────────────────────────────────────────────
function ArchitectureTab() {
  return (
    <>
      <SectionHeader>SYSTEM ARCHITECTURE</SectionHeader>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {ARCH_LAYERS.map((layer, li) => (
          <Card key={layer.name} style={{ borderLeft: `3px solid ${layer.color}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div>
                <span style={{ fontSize: 12, fontWeight: 700, color: layer.color }}>{layer.name}</span>
                <span style={{ fontSize: 10, color: 'var(--text-lo)', marginLeft: 8 }}>{layer.tech}</span>
              </div>
              {li < ARCH_LAYERS.length - 1 && (
                <span style={{ fontSize: 8, color: 'var(--text-lo)', letterSpacing: '0.1em' }}>
                  {li === 0 ? 'HTTP + WS' : 'SQL'}
                </span>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(layer.modules.length, 4)}, 1fr)`, gap: 8 }}>
              {layer.modules.map(mod => (
                <div key={mod.name} style={{
                  padding: '8px 10px', borderRadius: 4, background: 'var(--ink-3)',
                  border: '1px solid var(--ink-5)',
                }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-hi)' }}>{mod.name}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-lo)', marginTop: 2 }}>{mod.desc}</div>
                </div>
              ))}
            </div>
            {li < ARCH_LAYERS.length - 1 && (
              <div style={{ textAlign: 'center', marginTop: 8, color: 'var(--text-lo)', fontSize: 10 }}>
                {'| | |'}
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Agent registration flow */}
      <SectionHeader>AGENT REGISTRATION FLOW</SectionHeader>
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { step: '1', action: 'node agentCLI.js --name "AgentName" --handle myagent', desc: 'Agent registers via CLI' },
            { step: '2', action: 'POST /api/agents/register', desc: 'Server creates agent record + JWT session' },
            { step: '3', action: 'Agent polls GET /api/agents/:id every 3s', desc: 'Waiting for admin approval' },
            { step: '4', action: 'Admin clicks Approve in /admin panel', desc: 'is_approved = true' },
            { step: '5', action: 'Agent connects to ws://host:3001/ws?token=JWT', desc: 'WebSocket established' },
            { step: '6', action: 'Agent receives task:assigned events', desc: 'Ready to work' },
          ].map(s => (
            <div key={s.step} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{
                ...M, fontSize: 10, fontWeight: 700, width: 20, height: 20, borderRadius: '50%',
                background: 'var(--cyan)', color: '#000', display: 'flex', alignItems: 'center',
                justifyContent: 'center', flexShrink: 0,
              }}>
                {s.step}
              </span>
              <div>
                <code style={{ fontSize: 10, color: 'var(--text-hi)' }}>{s.action}</code>
                <div style={{ fontSize: 9, color: 'var(--text-lo)', marginTop: 1 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* WebSocket events */}
      <SectionHeader>WEBSOCKET EVENTS</SectionHeader>
      <Card>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {[
            { ev: 'task:assigned', desc: 'New task for agent' },
            { ev: 'task:accepted', desc: 'Agent accepted' },
            { ev: 'task:started', desc: 'Execution began' },
            { ev: 'task:completed', desc: 'Task done' },
            { ev: 'task:rejected', desc: 'Agent declined' },
            { ev: 'chat:message', desc: 'New message' },
            { ev: 'notification:new', desc: 'Alert' },
            { ev: 'project:created', desc: 'New project' },
            { ev: 'agent:assigned_to_project', desc: 'Agent joined project' },
            { ev: 'agent:removed_from_project', desc: 'Agent left project' },
          ].map(e => (
            <div key={e.ev} style={{
              padding: '4px 8px', borderRadius: 3, background: 'var(--ink-3)',
              border: '1px solid var(--ink-5)',
            }}>
              <code style={{ fontSize: 10, color: '#4ade80' }}>{e.ev}</code>
              <span style={{ fontSize: 9, color: 'var(--text-lo)', marginLeft: 6 }}>{e.desc}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Database schema */}
      <SectionHeader>KEY DATABASE TABLES</SectionHeader>
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            { name: 'manager_agents', desc: 'Active agent registry with approval status, type, division' },
            { name: 'projects', desc: 'Project records with status, type, budget config' },
            { name: 'tasks', desc: 'Task lifecycle tracking with agent assignment' },
            { name: 'channels', desc: 'Chat channels (general, project, DM types)' },
            { name: 'messages', desc: 'Chat messages with sender attribution' },
            { name: 'cost_records', desc: 'AI execution cost tracking per task' },
            { name: 'activity_history', desc: 'Full audit trail of all platform events' },
            { name: 'agent_projects', desc: 'Many-to-many agent-project assignments' },
            { name: 'machines', desc: 'Physical compute nodes (Mac Mini fleet)' },
            { name: 'machine_agents', desc: 'Agent-to-machine assignments' },
            { name: 'user_sessions', desc: 'JWT session storage' },
            { name: 'notifications', desc: 'User and agent notification records' },
          ].map(t => (
            <div key={t.name} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <Database size={10} style={{ color: '#4ade80', marginTop: 2, flexShrink: 0 }} />
              <div>
                <code style={{ fontSize: 10, color: 'var(--text-hi)' }}>{t.name}</code>
                <div style={{ fontSize: 9, color: 'var(--text-lo)' }}>{t.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

// ── Tab: Features ───────────────────────────────────────────────────────────
function FeaturesTab() {
  return (
    <>
      <SectionHeader>PLATFORM CAPABILITIES</SectionHeader>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {FEATURES.map(f => (
          <Card key={f.title} style={{ borderTop: `2px solid ${f.color}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <f.icon size={16} style={{ color: f.color }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-hi)' }}>{f.title}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-md)', lineHeight: 1.5 }}>{f.desc}</div>
          </Card>
        ))}
      </div>

      {/* Frontend pages */}
      <SectionHeader>FRONTEND PAGES</SectionHeader>
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {[
            { path: '/', name: 'Dashboard', desc: 'Stats overview' },
            { path: '/hq', name: 'HQ Board', desc: 'Drag & drop assignments' },
            { path: '/projects', name: 'Projects', desc: 'Project list' },
            { path: '/projects/:id', name: 'Project Detail', desc: 'Tasks + agents' },
            { path: '/tasks', name: 'Tasks', desc: 'All tasks' },
            { path: '/chat', name: 'Chat', desc: 'Real-time messaging' },
            { path: '/agents', name: 'Agents', desc: 'Agent directory' },
            { path: '/agents/:id', name: 'Agent Detail', desc: 'Agent profile' },
            { path: '/costs', name: 'Costs', desc: 'Spending tracker' },
            { path: '/tokens', name: 'Token Dashboard', desc: 'Usage analytics' },
            { path: '/rnd', name: 'R&D Panel', desc: 'Research control' },
            { path: '/activity', name: 'Activity', desc: 'Event feed' },
            { path: '/admin', name: 'Admin Panel', desc: 'System management' },
            { path: '/settings', name: 'Settings', desc: 'User preferences' },
            { path: '/fleet', name: 'Fleet', desc: 'Machine monitoring' },
            { path: '/docs', name: 'Docs', desc: 'This page' },
          ].map(p => (
            <div key={p.path} style={{
              padding: '6px 10px', borderRadius: 4, background: 'var(--ink-3)',
              border: '1px solid var(--ink-5)',
            }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-hi)' }}>{p.name}</div>
              <code style={{ fontSize: 8, color: 'var(--cyan)' }}>{p.path}</code>
              <div style={{ fontSize: 8, color: 'var(--text-lo)', marginTop: 1 }}>{p.desc}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Agent types */}
      <SectionHeader>AGENT TYPES</SectionHeader>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        {[
          {
            type: 'PM', color: '#a78bfa', model: 'claude-haiku-4-5',
            desc: 'Plans work, breaks into deliverables, identifies dependencies, coordinates teams.',
          },
          {
            type: 'Worker', color: '#22d3ee', model: 'claude-haiku-4-5',
            desc: 'Implements features, writes code, solves technical problems, delivers working solutions.',
          },
          {
            type: 'R&D', color: '#f472b6', model: 'claude-sonnet-4-6',
            desc: 'Researches emerging solutions, evaluates technologies, runs on scheduled intervals.',
          },
        ].map(a => (
          <Card key={a.type} style={{ borderTop: `2px solid ${a.color}` }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: a.color, marginBottom: 4 }}>{a.type}</div>
            <div style={{ fontSize: 10, color: 'var(--text-md)', lineHeight: 1.5, marginBottom: 6 }}>{a.desc}</div>
            <code style={{ fontSize: 9, color: 'var(--text-lo)' }}>Default: {a.model}</code>
          </Card>
        ))}
      </div>
    </>
  );
}

// ── Tab: Roadmap ────────────────────────────────────────────────────────────
function RoadmapTab() {
  return (
    <>
      {/* Current status summary */}
      <Card style={{ marginBottom: 16, borderLeft: '3px solid #4ade80' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-hi)', marginBottom: 4 }}>
              PROJECT COMPLETE
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-md)', lineHeight: 1.5 }}>
              All 8 development phases are complete. The platform is fully functional with
              AI agent management, real-time chat, task execution, cost tracking,
              fleet monitoring, and load balancing.
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 16 }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--cyan)' }}>{OVERALL_PROGRESS}%</div>
            <div style={{ fontSize: 9, color: 'var(--text-lo)' }}>OVERALL</div>
          </div>
        </div>
      </Card>

      {/* Estimated timeline */}
      <Card style={{ marginBottom: 16, background: 'var(--ink-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Calendar size={12} style={{ color: 'var(--cyan)' }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-hi)' }}>ESTIMATED TIMELINE</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, fontSize: 11 }}>
          <div>
            <div style={{ color: '#4ade80', fontWeight: 600, marginBottom: 2 }}>Started</div>
            <div style={{ color: 'var(--text-lo)' }}>February 2026</div>
          </div>
          <div>
            <div style={{ color: '#4ade80', fontWeight: 600, marginBottom: 2 }}>Completed</div>
            <div style={{ color: 'var(--text-lo)' }}>March 16, 2026</div>
          </div>
          <div>
            <div style={{ color: '#4ade80', fontWeight: 600, marginBottom: 2 }}>Duration</div>
            <div style={{ color: 'var(--text-hi)', fontWeight: 600 }}>~6 weeks</div>
            <div style={{ color: 'var(--text-lo)', fontSize: 9 }}>All 8 phases delivered</div>
          </div>
        </div>
      </Card>

      {/* Phase breakdown */}
      <SectionHeader>DEVELOPMENT PHASES</SectionHeader>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {PROJECT_PHASES.map((phase, pi) => (
          <Card key={phase.name} style={{
            borderLeft: `3px solid ${phase.status === 'completed' ? '#4ade80' : phase.status === 'in_progress' ? '#f59e0b' : '#60a5fa'}`,
            opacity: phase.status === 'planned' ? 0.7 : 1,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, color: 'var(--text-lo)' }}>Phase {pi + 1}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-hi)' }}>{phase.name}</span>
                <StatusBadge status={phase.status} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-hi)' }}>{phase.progress}%</span>
            </div>
            <ProgressBar
              value={phase.progress}
              color={phase.status === 'completed' ? '#4ade80' : phase.status === 'in_progress' ? '#f59e0b' : '#60a5fa'}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', marginTop: 8 }}>
              {phase.items.map(item => (
                <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10 }}>
                  {item.done
                    ? <CheckCircle size={10} style={{ color: '#4ade80', flexShrink: 0 }} />
                    : <div style={{ width: 10, height: 10, borderRadius: '50%', border: '1px solid var(--ink-5)', flexShrink: 0 }} />
                  }
                  <span style={{ color: item.done ? 'var(--text-md)' : 'var(--text-lo)' }}>{item.name}</span>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      {/* What's next */}
      <SectionHeader>BONUS ENHANCEMENTS (ALL COMPLETED)</SectionHeader>
      <Card style={{ borderLeft: '3px solid #4ade80' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { task: 'PostgreSQL migration for production scale', detail: 'Full 26-table migration script' },
            { task: 'Redis caching layer', detail: 'Rate limiting, API cache, WS pub/sub' },
            { task: 'Sentry error tracking', detail: 'Auto-capture 5xx errors, strips sensitive data' },
            { task: 'HTTPS/SSL via Traefik', detail: 'Let\'s Encrypt auto-SSL with HTTP redirect' },
            { task: 'Horizontal scaling', detail: 'Redis pub/sub + sticky sessions, --scale api=N' },
            { task: 'Agent-to-agent communication', detail: 'Directory API + direct messaging protocol' },
          ].map((t, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle size={10} style={{ color: '#4ade80', flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: 'var(--text-hi)', flex: 1 }}>{t.task}</span>
              <span style={{ fontSize: 9, color: 'var(--text-lo)' }}>{t.detail}</span>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

// ── Tab: API Reference ──────────────────────────────────────────────────────
function ApiSection({ section, defaultOpen = false }: { section: typeof API_SECTIONS[number]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const Icon = section.icon;
  return (
    <div style={{ border: '1px solid var(--ink-4)', borderRadius: 4, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          ...M, width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 12px', background: open ? 'var(--ink-3)' : 'var(--ink-2)',
          border: 'none', cursor: 'pointer', color: 'var(--text-hi)',
          fontSize: 11, letterSpacing: '0.1em', fontWeight: 600,
        }}
      >
        <Icon size={12} strokeWidth={1.5} />
        {section.title}
        <span style={{ marginLeft: 'auto', color: 'var(--text-lo)', fontSize: 10 }}>{section.endpoints.length}</span>
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {open && (
        <div style={{ background: 'var(--ink-1)' }}>
          {section.endpoints.map((ep, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
              borderTop: '1px solid var(--ink-3)', fontSize: 11,
            }}>
              <span style={{
                ...M, fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 2,
                color: '#000', background: METHOD_COLORS[ep.method] || 'var(--text-lo)',
                minWidth: 40, textAlign: 'center',
              }}>
                {ep.method}
              </span>
              <code style={{ ...M, fontSize: 11, color: 'var(--text-hi)', flex: 1 }}>{ep.path}</code>
              <CopyButton text={ep.path} />
              <span style={{ ...M, fontSize: 10, color: 'var(--text-lo)', textAlign: 'right' }}>{ep.desc}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ApiTab() {
  return (
    <>
      {/* Quick reference */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: 'var(--text-lo)', letterSpacing: '0.1em', marginBottom: 8 }}>QUICK REFERENCE</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 24px', fontSize: 11 }}>
          <div><span style={{ color: 'var(--text-lo)' }}>API Base:</span> <code style={{ color: 'var(--cyan)' }}>http://localhost:3001</code></div>
          <div><span style={{ color: 'var(--text-lo)' }}>WebSocket:</span> <code style={{ color: 'var(--cyan)' }}>ws://localhost:3001/ws?token=TOKEN</code></div>
          <div><span style={{ color: 'var(--text-lo)' }}>Auth:</span> <code style={{ color: '#f59e0b' }}>Bearer TOKEN</code> via Authorization header</div>
          <div><span style={{ color: 'var(--text-lo)' }}>Admin:</span> <code style={{ color: '#f59e0b' }}>Scorpion / Scorpion123</code></div>
        </div>
      </Card>

      <SectionHeader>ENDPOINTS</SectionHeader>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {API_SECTIONS.map((s, i) => (
          <ApiSection key={s.title} section={s} defaultOpen={i === 0} />
        ))}
      </div>
    </>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────
export default function Docs() {
  const [tab, setTab] = useState<Tab>('overview');

  return (
    <div style={{ ...M, padding: '16px 20px', maxWidth: 960 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <BookOpen size={16} strokeWidth={1.5} style={{ color: 'var(--cyan)' }} />
        <h1 style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-hi)', margin: 0 }}>
          PROJECT-CLAW DOCUMENTATION
        </h1>
        <span style={{ fontSize: 9, color: 'var(--text-lo)', marginLeft: 'auto' }}>v1.2.0</span>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: 2, marginBottom: 20, borderBottom: '1px solid var(--ink-4)',
        paddingBottom: 2,
      }}>
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                ...M, display: 'flex', alignItems: 'center', gap: 5,
                padding: '8px 14px', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em',
                background: active ? 'var(--ink-3)' : 'transparent',
                color: active ? 'var(--cyan)' : 'var(--text-lo)',
                border: 'none', borderBottom: active ? '2px solid var(--cyan)' : '2px solid transparent',
                cursor: 'pointer', borderRadius: '4px 4px 0 0',
                transition: 'all 150ms',
              }}
            >
              <Icon size={11} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {tab === 'overview' && <OverviewTab />}
      {tab === 'architecture' && <ArchitectureTab />}
      {tab === 'features' && <FeaturesTab />}
      {tab === 'roadmap' && <RoadmapTab />}
      {tab === 'api' && <ApiTab />}
    </div>
  );
}
