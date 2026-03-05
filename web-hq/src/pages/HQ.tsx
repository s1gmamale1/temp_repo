import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Cpu, Bot, Zap, FolderKanban, CheckSquare, MessageSquare,
    Wifi, WifiOff, Loader2, RefreshCw, ArrowRight, AlertCircle,
    Activity, TrendingUp, Users
} from 'lucide-react';
import { agentsApi, projectsApi, fetchApi, wsClient } from '../services/api';

const M: React.CSSProperties = { fontFamily: 'var(--font-mono)' };

function fmtTime(ts: string) {
    if (!ts) return '—';
    const d = Date.now() - new Date(ts).getTime();
    const m = Math.floor(d / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(d / 3600000);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

interface LiveEvent {
    id: string;
    type: 'task' | 'agent' | 'project' | 'message';
    text: string;
    time: string;
}

// ── Agent Card ───────────────────────────────────────────────────────────────
function AgentCard({ agent, onMessage, onView }: { agent: any; onMessage: () => void; onView: () => void }) {
    const isOnline = agent.status === 'online' || agent.status === 'working';
    const isBusy = agent.status === 'working';

    const statusColor = isBusy ? '#f59e0b' : isOnline ? '#10b981' : 'var(--text-lo)';
    const statusLabel = isBusy ? 'BUSY' : isOnline ? 'ONLINE' : 'OFFLINE';
    const dotClass = isBusy ? 'ops-dot ops-dot-amber ops-dot-pulse' : isOnline ? 'ops-dot ops-dot-green ops-dot-pulse' : 'ops-dot ops-dot-red';

    return (
        <div style={{
            background: 'var(--ink-2)', border: '1px solid var(--ink-4)', borderRadius: 4,
            padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
            borderLeft: `2px solid ${statusColor}`,
        }}>
            {/* Top row */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                        width: 32, height: 32, borderRadius: 3, flexShrink: 0,
                        background: `${statusColor}15`, border: `1px solid ${statusColor}30`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <Bot size={14} style={{ color: statusColor }} />
                    </div>
                    <div>
                        <div style={{ ...M, fontSize: 12, fontWeight: 700, color: 'var(--text-hi)' }}>{agent.name}</div>
                        <div style={{ ...M, fontSize: 9, color: 'var(--text-lo)' }}>@{agent.handle}</div>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span className={dotClass} />
                    <span style={{ ...M, fontSize: 8, color: statusColor, letterSpacing: '0.1em' }}>{statusLabel}</span>
                </div>
            </div>

            {/* Stats */}
            <div style={{ display: 'flex', gap: 8 }}>
                {[
                    { label: 'Tasks', value: agent.taskCount ?? '—' },
                    { label: 'Projects', value: agent.projectCount ?? '—' },
                    { label: 'Seen', value: fmtTime(agent.last_seen) },
                ].map(({ label, value }) => (
                    <div key={label} style={{ flex: 1, background: 'var(--ink-1)', borderRadius: 3, padding: '5px 8px', textAlign: 'center' }}>
                        <div style={{ ...M, fontSize: 14, fontWeight: 700, color: 'var(--text-hi)' }}>{value}</div>
                        <div style={{ ...M, fontSize: 8, color: 'var(--text-lo)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</div>
                    </div>
                ))}
            </div>

            {/* Skills */}
            {agent.skills?.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {agent.skills.slice(0, 3).map((s: string) => (
                        <span key={s} style={{ ...M, fontSize: 8, padding: '2px 6px', background: 'var(--ink-3)', border: '1px solid var(--ink-4)', borderRadius: 2, color: 'var(--text-lo)' }}>{s}</span>
                    ))}
                    {agent.skills.length > 3 && <span style={{ ...M, fontSize: 8, color: 'var(--text-dim)' }}>+{agent.skills.length - 3}</span>}
                </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 6, paddingTop: 6, borderTop: '1px solid var(--ink-4)' }}>
                <button onClick={onMessage} className="ops-btn" style={{ flex: 1, justifyContent: 'center', display: 'flex', gap: 4, fontSize: 9 }}>
                    <MessageSquare size={10} /> DM
                </button>
                <button onClick={onView} className="ops-btn" style={{ flex: 1, justifyContent: 'center', display: 'flex', gap: 4, fontSize: 9 }}>
                    <ArrowRight size={10} /> View
                </button>
            </div>
        </div>
    );
}

// ── Project Row ──────────────────────────────────────────────────────────────
function ProjectRow({ project, navigate }: { project: any; navigate: (p: string) => void }) {
    const statusColor = project.status === 'active' ? '#10b981' : project.status === 'paused' ? '#f59e0b' : 'var(--text-lo)';
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 14px', borderBottom: '1px solid var(--ink-4)',
            cursor: 'pointer',
        }}
            onClick={() => navigate(`/projects/${project.id}`)}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--ink-3)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...M, fontSize: 12, fontWeight: 600, color: 'var(--text-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</div>
                <div style={{ ...M, fontSize: 9, color: 'var(--text-lo)' }}>
                    {project.stats?.activeTasks || 0} active tasks · {project.stats?.agentCount || 0} agents
                </div>
            </div>
            <span style={{ ...M, fontSize: 8, color: statusColor, letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0 }}>{project.status}</span>
            <ArrowRight size={11} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
        </div>
    );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function HQ() {
    const navigate = useNavigate();
    const [agents, setAgents] = useState<any[]>([]);
    const [projects, setProjects] = useState<any[]>([]);
    const [stats, setStats] = useState({ online: 0, busy: 0, offline: 0, activeProjects: 0, activeTasks: 0 });
    const [feed, setFeed] = useState<LiveEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [agentFilter, setAgentFilter] = useState<'all' | 'online' | 'busy' | 'offline'>('all');
    const feedRef = useRef<HTMLDivElement>(null);

    const addEvent = useCallback((ev: Omit<LiveEvent, 'id' | 'time'>) => {
        setFeed(prev => [{ ...ev, id: String(Date.now() + Math.random()), time: 'just now' }, ...prev].slice(0, 50));
    }, []);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [agentsRes, projectsRes] = await Promise.allSettled([
                agentsApi.list(),
                projectsApi.list(),
            ]);

            const agentList = agentsRes.status === 'fulfilled' ? (agentsRes.value.agents || []) : [];
            const projectList = projectsRes.status === 'fulfilled' ? (projectsRes.value.projects || []) : [];

            // Enrich agents with real task + project counts
            const enriched = await Promise.all(agentList.map(async (a: any) => {
                let taskCount = 0, projectCount = 0;
                try {
                    const [td, pd] = await Promise.allSettled([
                        fetchApi(`/api/agents/${a.id}/tasks?status=running&limit=50`),
                        fetchApi(`/api/agents/${a.id}/projects`),
                    ]);
                    taskCount = td.status === 'fulfilled' ? (td.value.tasks?.length || 0) : 0;
                    projectCount = pd.status === 'fulfilled' ? (pd.value.projects?.length || 0) : 0;
                } catch { }
                return { ...a, taskCount, projectCount };
            }));

            setAgents(enriched);
            setProjects(projectList);

            const online = enriched.filter((a: any) => a.status === 'online').length;
            const busy = enriched.filter((a: any) => a.status === 'working').length;
            const offline = enriched.length - online - busy;
            const activeTasks = projectList.reduce((s: number, p: any) => s + (p.stats?.activeTasks || 0), 0);

            setStats({ online, busy, offline, activeProjects: projectList.filter((p: any) => p.status === 'active').length, activeTasks });
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    // Live WS feed
    useEffect(() => {
        const h = {
            'task:created': (d: any) => addEvent({ type: 'task', text: `Task created: ${d?.task?.title || d?.task_id || '—'}` }),
            'task:assigned': (d: any) => addEvent({ type: 'task', text: `Task assigned to ${d?.agent_name || 'agent'}` }),
            'task:completed': (d: any) => addEvent({ type: 'task', text: `Task completed: ${d?.task_title || d?.task_id || '—'}` }),
            'task:started': (d: any) => addEvent({ type: 'task', text: `Task started by ${d?.agent_name || 'agent'}` }),
            'task:rejected': (d: any) => addEvent({ type: 'task', text: `Task rejected: ${d?.task_title || '—'}` }),
            'agent:assigned': (d: any) => addEvent({ type: 'agent', text: `Agent ${d?.agent_name || '—'} assigned to project` }),
            'agent:removed': (d: any) => addEvent({ type: 'agent', text: `Agent removed from project` }),
            'project:status_changed': (d: any) => addEvent({ type: 'project', text: `Project status → ${d?.status || '—'}` }),
            'user:presence': (d: any) => addEvent({ type: 'agent', text: `Agent ${d?.userId || '—'} ${d?.isOnline ? 'came online' : 'went offline'}` }),
            'chat:message': (d: any) => d?.is_dm && addEvent({ type: 'message', text: `New DM from ${d?.sender_name || 'agent'}` }),
        } as Record<string, (d: any) => void>;

        Object.entries(h).forEach(([ev, fn]) => wsClient.on(ev, fn));
        return () => Object.entries(h).forEach(([ev, fn]) => wsClient.off(ev, fn));
    }, [addEvent]);

    // Navigate to DM with agent
    const goToAgentDM = (agent: any) => navigate(`/chat?dm=${agent.id}`);

    const visibleAgents = agentFilter === 'all' ? agents
        : agentFilter === 'online' ? agents.filter(a => a.status === 'online')
            : agentFilter === 'busy' ? agents.filter(a => a.status === 'working')
                : agents.filter(a => a.status !== 'online' && a.status !== 'working');

    const activeProjects = projects.filter(p => p.status === 'active');

    const feedColors: Record<string, string> = { task: '#faa81a', agent: '#10b981', project: '#60a5fa', message: '#ec4899' };

    return (
        <div className="space-y-5 animate-fade-up">
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <div className="ops-section-header" style={{ marginBottom: 4 }}>Command Center</div>
                    <h1 style={{ ...M, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-hi)' }}>HQ</h1>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {error && <span style={{ ...M, fontSize: 10, color: '#ef4444', display: 'flex', gap: 4, alignItems: 'center' }}><AlertCircle size={11} />{error}</span>}
                    <button onClick={load} disabled={loading} className="ops-btn" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Refresh
                    </button>
                </div>
            </div>

            {/* Stat strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                {[
                    { label: 'Online', value: stats.online, color: '#10b981', icon: Wifi },
                    { label: 'Busy', value: stats.busy, color: '#f59e0b', icon: Activity },
                    { label: 'Offline', value: stats.offline, color: 'var(--text-lo)', icon: WifiOff },
                    { label: 'Active Projects', value: stats.activeProjects, color: '#60a5fa', icon: FolderKanban },
                    { label: 'Active Tasks', value: stats.activeTasks, color: '#a78bfa', icon: CheckSquare },
                ].map(({ label, value, color, icon: Icon }) => (
                    <div key={label} className="ops-stat" style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                            <span style={{ ...M, fontSize: 9, color: 'var(--text-lo)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</span>
                            <Icon size={11} style={{ color }} />
                        </div>
                        <div style={{ ...M, fontSize: 22, fontWeight: 700, color }}>{loading ? '—' : value}</div>
                    </div>
                ))}
            </div>

            {/* Main grid: agents + right panel */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, alignItems: 'start' }}>

                {/* Agent Fleet */}
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <div className="ops-section-header" style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Users size={11} /> AGENT FLEET ({agents.length})
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                            {(['all', 'online', 'busy', 'offline'] as const).map(f => (
                                <button key={f} onClick={() => setAgentFilter(f)} style={{
                                    ...M, fontSize: 9, padding: '3px 8px', borderRadius: 2, cursor: 'pointer',
                                    border: '1px solid', letterSpacing: '0.06em', textTransform: 'uppercase',
                                    borderColor: agentFilter === f ? 'var(--amber)' : 'var(--ink-4)',
                                    background: agentFilter === f ? 'var(--amber-glow)' : 'var(--ink-2)',
                                    color: agentFilter === f ? 'var(--amber)' : 'var(--text-lo)',
                                }}>{f}</button>
                            ))}
                        </div>
                    </div>

                    {loading ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, gap: 10 }}>
                            <Loader2 size={16} className="animate-spin" style={{ color: 'var(--amber)' }} />
                            <span style={{ ...M, fontSize: 11, color: 'var(--text-lo)' }}>LOADING AGENTS...</span>
                        </div>
                    ) : visibleAgents.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '48px 0', background: 'var(--ink-2)', border: '1px solid var(--ink-4)', borderRadius: 4 }}>
                            <Bot size={28} style={{ color: 'var(--text-dim)', margin: '0 auto 10px', display: 'block' }} />
                            <p style={{ ...M, fontSize: 12, color: 'var(--text-lo)' }}>No agents {agentFilter !== 'all' ? `with status: ${agentFilter}` : 'registered'}</p>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                            {visibleAgents.map(agent => (
                                <AgentCard key={agent.id} agent={agent}
                                    onMessage={() => goToAgentDM(agent)}
                                    onView={() => navigate(`/agents/${agent.id}`)}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* Right panel: Active Ops + Live Feed */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                    {/* Active Operations */}
                    <div>
                        <div className="ops-section-header" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <FolderKanban size={11} /> ACTIVE OPS ({activeProjects.length})
                        </div>
                        <div style={{ background: 'var(--ink-2)', border: '1px solid var(--ink-4)', borderRadius: 4, overflow: 'hidden' }}>
                            {activeProjects.length === 0 ? (
                                <div style={{ padding: '24px 0', textAlign: 'center' }}>
                                    <p style={{ ...M, fontSize: 11, color: 'var(--text-lo)' }}>No active projects</p>
                                </div>
                            ) : (
                                activeProjects.slice(0, 6).map(p => (
                                    <ProjectRow key={p.id} project={p} navigate={navigate} />
                                ))
                            )}
                            {activeProjects.length > 0 && (
                                <div style={{ padding: '8px 14px', borderTop: '1px solid var(--ink-4)', textAlign: 'center' }}>
                                    <button onClick={() => navigate('/projects')} style={{
                                        ...M, fontSize: 9, background: 'none', border: 'none', cursor: 'pointer',
                                        color: 'var(--text-lo)', letterSpacing: '0.06em',
                                    }}>VIEW ALL PROJECTS →</button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Live Feed */}
                    <div>
                        <div className="ops-section-header" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Zap size={11} /> LIVE FEED
                            <span style={{ ...M, fontSize: 8, color: 'var(--green)', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 3 }}>
                                <span className="ops-dot ops-dot-green ops-dot-pulse" /> LIVE
                            </span>
                        </div>
                        <div ref={feedRef} style={{
                            background: 'var(--ink-2)', border: '1px solid var(--ink-4)', borderRadius: 4,
                            maxHeight: 340, overflowY: 'auto',
                        }}>
                            {feed.length === 0 ? (
                                <div style={{ padding: '28px 0', textAlign: 'center' }}>
                                    <TrendingUp size={20} style={{ color: 'var(--text-dim)', margin: '0 auto 8px', display: 'block' }} />
                                    <p style={{ ...M, fontSize: 10, color: 'var(--text-lo)' }}>Waiting for events...</p>
                                </div>
                            ) : (
                                feed.map((ev, i) => (
                                    <div key={ev.id} style={{
                                        padding: '7px 12px', borderBottom: i < feed.length - 1 ? '1px solid var(--ink-4)' : 'none',
                                        display: 'flex', gap: 8, alignItems: 'flex-start',
                                        opacity: i === 0 ? 1 : Math.max(0.4, 1 - i * 0.04),
                                    }}>
                                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: feedColors[ev.type], flexShrink: 0, marginTop: 5 }} />
                                        <div style={{ flex: 1 }}>
                                            <div style={{ ...M, fontSize: 10, color: 'var(--text-mid)', lineHeight: 1.4 }}>{ev.text}</div>
                                            <div style={{ ...M, fontSize: 8, color: 'var(--text-dim)', marginTop: 2 }}>{ev.time}</div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Quick links */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        {[
                            { label: 'New Project', icon: FolderKanban, path: '/new-project' },
                            { label: 'Register Agent', icon: Bot, path: '/agents/register' },
                            { label: 'Assign Agents', icon: Users, path: '/assign' },
                            { label: 'Chat', icon: MessageSquare, path: '/chat' },
                        ].map(({ label, icon: Icon, path }) => (
                            <button key={label} onClick={() => navigate(path)} className="ops-btn" style={{
                                display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center',
                                padding: '8px', fontSize: 10,
                            }}>
                                <Icon size={11} /> {label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}