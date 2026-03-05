import { useState, useEffect, useCallback, useRef } from 'react';
import {
    FolderKanban, Bot, Users, Loader2, RefreshCw, X, Check,
    ChevronDown, AlertCircle, CheckCircle, ArrowRight, Zap
} from 'lucide-react';
import { projectsApi, agentsApi, projectAgentsApi, fetchApi } from '../services/api';

const M: React.CSSProperties = { fontFamily: 'var(--font-mono)' };

const ROLES = ['lead', 'contributor', 'observer'] as const;
type Role = typeof ROLES[number];

const ROLE_COLOR: Record<Role, string> = {
    lead: '#f59e0b',
    contributor: '#10b981',
    observer: '#60a5fa',
};

interface Assignment { agentId: string; agentName: string; role: Role; }

function Toast({ msg, type, onDone }: { msg: string; type: 'ok' | 'err'; onDone: () => void }) {
    useEffect(() => { const t = setTimeout(onDone, 2800); return () => clearTimeout(t); }, []);
    return (
        <div style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 999,
            ...M, fontSize: 11, padding: '10px 16px', borderRadius: 4,
            background: type === 'ok' ? '#10b98120' : '#ef444420',
            border: `1px solid ${type === 'ok' ? '#10b98150' : '#ef444450'}`,
            color: type === 'ok' ? '#10b981' : '#ef4444',
            display: 'flex', alignItems: 'center', gap: 8,
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        }}>
            {type === 'ok' ? <CheckCircle size={13} /> : <AlertCircle size={13} />}
            {msg}
        </div>
    );
}

function RoleSelector({ value, onChange }: { value: Role; onChange: (r: Role) => void }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, []);
    return (
        <div ref={ref} style={{ position: 'relative' }}>
            <button onClick={() => setOpen(o => !o)} style={{
                ...M, fontSize: 9, padding: '3px 8px', border: '1px solid', borderRadius: 2,
                borderColor: ROLE_COLOR[value] + '60', background: ROLE_COLOR[value] + '15',
                color: ROLE_COLOR[value], cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>
                {value} <ChevronDown size={9} />
            </button>
            {open && (
                <div style={{
                    position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 50,
                    background: 'var(--ink-2)', border: '1px solid var(--ink-4)', borderRadius: 3,
                    overflow: 'hidden', minWidth: 110,
                }}>
                    {ROLES.map(r => (
                        <button key={r} onClick={() => { onChange(r); setOpen(false); }} style={{
                            ...M, fontSize: 9, padding: '7px 10px', width: '100%', border: 'none',
                            background: r === value ? 'var(--ink-3)' : 'none', cursor: 'pointer',
                            color: ROLE_COLOR[r], textAlign: 'left', letterSpacing: '0.08em', textTransform: 'uppercase',
                            display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: ROLE_COLOR[r] }} />
                            {r}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function ProjectAssignmentBoard() {
    const [projects, setProjects] = useState<any[]>([]);
    const [agents, setAgents] = useState<any[]>([]);
    const [selectedProject, setSelectedProject] = useState<any | null>(null);
    const [projectAgents, setProjectAgents] = useState<any[]>([]);
    const [pendingAssignments, setPending] = useState<Assignment[]>([]);
    const [dragAgent, setDragAgent] = useState<any | null>(null);
    const [pendingRoles, setPendingRoles] = useState<Record<string, Role>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
    const [agentSearch, setAgentSearch] = useState('');
    const dropZoneRef = useRef<HTMLDivElement>(null);

    const showToast = (msg: string, type: 'ok' | 'err') => setToast({ msg, type });

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [pr, ar] = await Promise.allSettled([projectsApi.list(), agentsApi.list()]);
            const pList = pr.status === 'fulfilled' ? (pr.value.projects || []) : [];
            const aList = ar.status === 'fulfilled' ? (ar.value.agents || []) : [];
            setProjects(pList);
            setAgents(aList);
            if (!selectedProject && pList.length > 0) setSelectedProject(pList[0]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const loadProjectAgents = useCallback(async (projectId: string) => {
        try {
            const data = await fetchApi(`/api/projects/${projectId}/agents`);
            setProjectAgents(data.agents || []);
        } catch { setProjectAgents([]); }
    }, []);

    useEffect(() => {
        if (selectedProject) {
            loadProjectAgents(selectedProject.id);
            setPending([]);
            setPendingRoles({});
        }
    }, [selectedProject, loadProjectAgents]);

    // Already-assigned agent ids
    const assignedIds = new Set([
        ...projectAgents.map((a: any) => a.agent_id || a.id),
        ...pendingAssignments.map(a => a.agentId),
    ]);

    const filteredAgents = agents.filter(a =>
        !assignedIds.has(a.id) &&
        (agentSearch === '' || a.name.toLowerCase().includes(agentSearch.toLowerCase()) || a.handle?.toLowerCase().includes(agentSearch.toLowerCase()))
    );

    // Drag handlers
    const onDragStart = (agent: any) => setDragAgent(agent);
    const onDragEnd = () => setDragAgent(null);
    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        if (!dragAgent || !selectedProject) return;
        setPending(prev => [...prev, { agentId: dragAgent.id, agentName: dragAgent.name, role: 'contributor' }]);
        setDragAgent(null);
    };
    const onDragOver = (e: React.DragEvent) => e.preventDefault();

    const addAgent = (agent: any) => {
        if (!selectedProject) return;
        if (assignedIds.has(agent.id)) return;
        setPending(prev => [...prev, { agentId: agent.id, agentName: agent.name, role: 'contributor' }]);
    };

    const removePending = (agentId: string) => setPending(prev => prev.filter(a => a.agentId !== agentId));

    const updatePendingRole = (agentId: string, role: Role) => {
        setPending(prev => prev.map(a => a.agentId === agentId ? { ...a, role } : a));
    };

    const removeExisting = async (agentId: string) => {
        if (!selectedProject) return;
        try {
            await projectAgentsApi.remove(selectedProject.id, agentId);
            setProjectAgents(prev => prev.filter((a: any) => (a.agent_id || a.id) !== agentId));
            showToast('Agent removed', 'ok');
        } catch (e: any) {
            showToast(e.message || 'Failed to remove', 'err');
        }
    };

    const updateExistingRole = async (agentId: string, role: Role) => {
        if (!selectedProject) return;
        try {
            await projectAgentsApi.updateRole(selectedProject.id, agentId, role);
            setProjectAgents(prev => prev.map((a: any) =>
                (a.agent_id || a.id) === agentId ? { ...a, role } : a
            ));
        } catch (e: any) {
            showToast(e.message || 'Failed to update role', 'err');
        }
    };

    const commitAssignments = async () => {
        if (!selectedProject || pendingAssignments.length === 0) return;
        setSaving(true);
        let ok = 0, fail = 0;
        for (const a of pendingAssignments) {
            try {
                await projectAgentsApi.assign(selectedProject.id, a.agentId, a.role);
                ok++;
            } catch { fail++; }
        }
        await loadProjectAgents(selectedProject.id);
        setPending([]);
        setSaving(false);
        if (fail === 0) showToast(`${ok} agent${ok !== 1 ? 's' : ''} assigned`, 'ok');
        else showToast(`${ok} assigned, ${fail} failed`, 'err');
    };

    const statusColor = (s: string) => s === 'active' ? '#10b981' : s === 'paused' ? '#f59e0b' : 'var(--text-lo)';
    const agentStatusColor = (s: string) => s === 'online' ? '#10b981' : s === 'working' ? '#f59e0b' : 'var(--text-lo)';

    return (
        <div className="space-y-5 animate-fade-up">
            {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <div className="ops-section-header" style={{ marginBottom: 4 }}>Operations</div>
                    <h1 style={{ ...M, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-hi)' }}>ASSIGNMENT BOARD</h1>
                </div>
                <button onClick={load} disabled={loading} className="ops-btn" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Refresh
                </button>
            </div>

            {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, gap: 10 }}>
                    <Loader2 size={18} className="animate-spin" style={{ color: 'var(--amber)' }} />
                    <span style={{ ...M, fontSize: 12, color: 'var(--text-lo)' }}>LOADING...</span>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 280px', gap: 14, alignItems: 'start' }}>

                    {/* ── Project list ─────────────────────────────────────── */}
                    <div>
                        <div className="ops-section-header" style={{ marginBottom: 8, display: 'flex', gap: 5, alignItems: 'center' }}>
                            <FolderKanban size={11} /> PROJECTS
                        </div>
                        <div style={{ background: 'var(--ink-2)', border: '1px solid var(--ink-4)', borderRadius: 4, overflow: 'hidden' }}>
                            {projects.length === 0 ? (
                                <div style={{ padding: 20, textAlign: 'center' }}>
                                    <p style={{ ...M, fontSize: 11, color: 'var(--text-lo)' }}>No projects</p>
                                </div>
                            ) : projects.map((p, i) => (
                                <div key={p.id} onClick={() => setSelectedProject(p)} style={{
                                    padding: '10px 12px', cursor: 'pointer',
                                    borderBottom: i < projects.length - 1 ? '1px solid var(--ink-4)' : 'none',
                                    background: selectedProject?.id === p.id ? 'var(--amber-glow)' : 'transparent',
                                    borderLeft: `2px solid ${selectedProject?.id === p.id ? 'var(--amber)' : 'transparent'}`,
                                    transition: 'background 100ms',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: statusColor(p.status), flexShrink: 0 }} />
                                        <span style={{ ...M, fontSize: 11, fontWeight: selectedProject?.id === p.id ? 700 : 400, color: selectedProject?.id === p.id ? 'var(--amber)' : 'var(--text-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                                    </div>
                                    <div style={{ ...M, fontSize: 9, color: 'var(--text-lo)', marginTop: 3, paddingLeft: 11 }}>
                                        {p.stats?.agentCount || 0} agents
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* ── Drop zone: project assignments ───────────────────── */}
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                            <div className="ops-section-header" style={{ marginBottom: 0, display: 'flex', gap: 5, alignItems: 'center' }}>
                                <Users size={11} /> {selectedProject ? selectedProject.name.toUpperCase() : 'SELECT A PROJECT'}
                            </div>
                            {pendingAssignments.length > 0 && (
                                <button onClick={commitAssignments} disabled={saving} style={{
                                    ...M, fontSize: 9, padding: '5px 12px', borderRadius: 3, cursor: 'pointer', border: 'none',
                                    background: 'var(--amber)', color: '#000', fontWeight: 700, letterSpacing: '0.06em',
                                    display: 'flex', alignItems: 'center', gap: 5,
                                }}>
                                    {saving ? <Loader2 size={10} className="animate-spin" /> : <Zap size={10} />}
                                    ASSIGN {pendingAssignments.length}
                                </button>
                            )}
                        </div>

                        {/* Drop zone */}
                        <div ref={dropZoneRef} onDrop={onDrop} onDragOver={onDragOver}
                            style={{
                                minHeight: 300, background: 'var(--ink-2)', border: `2px dashed ${dragAgent ? 'var(--amber)' : 'var(--ink-4)'}`,
                                borderRadius: 4, transition: 'border-color 150ms, background 150ms',
                                background: dragAgent ? 'var(--amber-glow)' : 'var(--ink-2)',
                            }}
                        >
                            {!selectedProject ? (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
                                    <p style={{ ...M, fontSize: 12, color: 'var(--text-lo)' }}>← Select a project</p>
                                </div>
                            ) : (
                                <div>
                                    {/* Drop hint */}
                                    {dragAgent && (
                                        <div style={{ padding: '12px 16px', ...M, fontSize: 10, color: 'var(--amber)', textAlign: 'center', borderBottom: '1px solid var(--ink-4)' }}>
                                            Drop to assign {dragAgent.name}
                                        </div>
                                    )}

                                    {/* Existing assignments */}
                                    {projectAgents.length === 0 && pendingAssignments.length === 0 && (
                                        <div style={{ padding: '40px 0', textAlign: 'center' }}>
                                            <Users size={24} style={{ color: 'var(--text-dim)', margin: '0 auto 10px', display: 'block' }} />
                                            <p style={{ ...M, fontSize: 11, color: 'var(--text-lo)' }}>No agents assigned</p>
                                            <p style={{ ...M, fontSize: 9, color: 'var(--text-dim)', marginTop: 4 }}>Drag agents here or click + to assign</p>
                                        </div>
                                    )}

                                    {projectAgents.map((a: any, i: number) => (
                                        <div key={a.agent_id || a.id} style={{
                                            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                                            borderBottom: '1px solid var(--ink-4)',
                                        }}>
                                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: agentStatusColor(a.status || 'offline'), flexShrink: 0 }} />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ ...M, fontSize: 11, fontWeight: 600, color: 'var(--text-hi)' }}>{a.agent_name || a.name}</div>
                                                <div style={{ ...M, fontSize: 9, color: 'var(--text-lo)' }}>@{a.handle || '—'}</div>
                                            </div>
                                            <RoleSelector value={(a.role as Role) || 'contributor'}
                                                onChange={r => updateExistingRole(a.agent_id || a.id, r)} />
                                            <button onClick={() => removeExisting(a.agent_id || a.id)} style={{
                                                background: 'none', border: 'none', cursor: 'pointer', padding: 3,
                                                color: 'var(--text-lo)', borderRadius: 2,
                                            }} title="Remove">
                                                <X size={12} />
                                            </button>
                                        </div>
                                    ))}

                                    {/* Pending (not yet saved) */}
                                    {pendingAssignments.map(a => (
                                        <div key={a.agentId} style={{
                                            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                                            borderBottom: '1px solid var(--ink-4)',
                                            background: '#faa81a08', borderLeft: '2px solid var(--amber)',
                                        }}>
                                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--amber)', flexShrink: 0 }} />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ ...M, fontSize: 11, fontWeight: 600, color: 'var(--amber)' }}>{a.agentName}</div>
                                                <div style={{ ...M, fontSize: 8, color: 'var(--amber)', opacity: 0.6 }}>PENDING</div>
                                            </div>
                                            <RoleSelector value={a.role} onChange={r => updatePendingRole(a.agentId, r)} />
                                            <button onClick={() => removePending(a.agentId)} style={{
                                                background: 'none', border: 'none', cursor: 'pointer', padding: 3, color: 'var(--text-lo)', borderRadius: 2,
                                            }}>
                                                <X size={12} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── Available agents ─────────────────────────────────── */}
                    <div>
                        <div className="ops-section-header" style={{ marginBottom: 8, display: 'flex', gap: 5, alignItems: 'center' }}>
                            <Bot size={11} /> AVAILABLE AGENTS
                        </div>
                        <input
                            value={agentSearch}
                            onChange={e => setAgentSearch(e.target.value)}
                            placeholder="Search agents..."
                            style={{
                                ...M, fontSize: 11, width: '100%', padding: '7px 10px', marginBottom: 8,
                                background: 'var(--ink-2)', border: '1px solid var(--ink-4)', borderRadius: 3,
                                color: 'var(--text-hi)', outline: 'none', boxSizing: 'border-box',
                            }}
                        />
                        <div style={{ background: 'var(--ink-2)', border: '1px solid var(--ink-4)', borderRadius: 4, overflow: 'hidden', maxHeight: 480, overflowY: 'auto' }}>
                            {filteredAgents.length === 0 ? (
                                <div style={{ padding: 20, textAlign: 'center' }}>
                                    <p style={{ ...M, fontSize: 11, color: 'var(--text-lo)' }}>
                                        {agents.length === 0 ? 'No agents registered' : 'All agents assigned'}
                                    </p>
                                </div>
                            ) : (
                                filteredAgents.map((agent, i) => (
                                    <div
                                        key={agent.id}
                                        draggable
                                        onDragStart={() => onDragStart(agent)}
                                        onDragEnd={onDragEnd}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                                            borderBottom: i < filteredAgents.length - 1 ? '1px solid var(--ink-4)' : 'none',
                                            cursor: 'grab', userSelect: 'none',
                                            background: dragAgent?.id === agent.id ? 'var(--ink-3)' : 'transparent',
                                            transition: 'background 100ms',
                                        }}
                                        onMouseEnter={e => { if (dragAgent?.id !== agent.id) e.currentTarget.style.background = 'var(--ink-3)'; }}
                                        onMouseLeave={e => { if (dragAgent?.id !== agent.id) e.currentTarget.style.background = 'transparent'; }}
                                    >
                                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: agentStatusColor(agent.status), flexShrink: 0 }} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ ...M, fontSize: 11, fontWeight: 600, color: 'var(--text-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.name}</div>
                                            <div style={{ ...M, fontSize: 9, color: 'var(--text-lo)' }}>@{agent.handle}</div>
                                        </div>
                                        <button onClick={() => addAgent(agent)} title="Add to project" style={{
                                            background: 'none', border: '1px solid var(--ink-4)', cursor: 'pointer', padding: '2px 6px',
                                            borderRadius: 2, color: 'var(--amber)', display: 'flex', alignItems: 'center', gap: 3,
                                            ...M, fontSize: 9,
                                        }}>
                                            <ArrowRight size={9} />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                </div>
            )}
        </div>
    );
}