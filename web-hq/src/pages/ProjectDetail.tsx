import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { projectsApi, projectAgentsApi, chatApi, type Agent } from '../services/api';
import ProjectAssignAgentDialog from '../components/ProjectAssignAgentDialog';
import TaskList from '../components/TaskList';
import {
  ArrowLeft,
  Pause,
  Settings,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  Play,
  AlertTriangle,
  Bot,
  MessageSquare,
  UserX,
  UserPlus,
  MoreVertical,
  Crown,
  Eye,
  Users
} from 'lucide-react';
import { toast } from '../components/Toast';

interface Project {
  id: string;
  name: string;
  type: 'saas' | 'content' | 'ecom' | 'custom';
  status: 'active' | 'standby' | 'offline' | 'setup';
  macMiniId: string;
  stats: {
    activeTasks: number;
    totalTasks: number;
    todayCost: number;
    monthCost: number;
    monthBudget: number;
  };
  lastActivity?: string;
  pmName?: string | null;
}

interface Task {
  id: string;
  title: string;
  project_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  agent?: { id: string; name: string; handle?: string } | null;
  estimated_cost?: number;
  actual_cost?: number;
}

interface ProjectAgent {
  assignment_id: string;
  role: 'lead' | 'contributor' | 'observer';
  status: 'active' | 'inactive' | 'pending';
  assigned_at: string;
  agent: Agent & { id: string };
}

const getStatusBg = (status: string) => {
  switch (status) {
    case 'active':
    case 'completed':
      return 'bg-green-500/20 text-green-400';
    case 'standby':
    case 'running':
      return 'bg-yellow-500/20 text-yellow-400';
    case 'pending':
      return 'bg-blue-500/20 text-blue-400';
    case 'offline':
    case 'failed':
    case 'cancelled':
      return 'bg-red-500/20 text-red-400';
    default:
      return 'bg-slate-700 text-slate-400';
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'active':
    case 'completed':
      return 'text-green-400';
    case 'standby':
    case 'running':
      return 'text-yellow-400';
    case 'pending':
      return 'text-blue-400';
    case 'offline':
    case 'failed':
    case 'cancelled':
      return 'text-red-400';
    default:
      return 'text-slate-400';
  }
};

const getProjectTypeDot = (type: string) => {
  switch (type) {
    case 'saas': return 'bg-violet-500';
    case 'content': return 'bg-pink-500';
    case 'ecom': return 'bg-orange-500';
    case 'custom': return 'bg-cyan-500';
    default: return 'bg-slate-500';
  }
};

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'critical': return 'text-red-400';
    case 'high': return 'text-orange-400';
    case 'medium': return 'text-yellow-400';
    default: return 'text-slate-400';
  }
};

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [projectTasks, setProjectTasks] = useState<Task[]>([]);
  const [projectAgents, setProjectAgents] = useState<ProjectAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    if (id) {
      fetchProjectData();
    }
  }, [id]);

  const fetchProjectData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch project details
      const projectData = await projectsApi.get(id!);
      setProject(projectData.project || projectData || null);
      
      // Fetch project tasks
      const tasksData = await projectsApi.getTasks(id!);
      setProjectTasks(tasksData.tasks || []);
      
      // Fetch project agents
      await fetchProjectAgents();
    } catch (err: any) {
      console.error('Failed to fetch project data:', err);
      setError(err.message || 'Failed to load project');
    } finally {
      setLoading(false);
    }
  };

  const fetchProjectAgents = async () => {
    try {
      setAgentsLoading(true);
      const response = await projectAgentsApi.listByProject(id!);
      setProjectAgents(response.agents || []);
    } catch (err: any) {
      console.error('Failed to fetch project agents:', err);
      // Don't show error for agents, just log it
    } finally {
      setAgentsLoading(false);
    }
  };

  const handleAssignAgent = async (agentId: string, role: 'lead' | 'contributor' | 'observer') => {
    await projectAgentsApi.assign(id!, agentId, role);
    await fetchProjectAgents();
  };

  const handleRemoveAgent = async (agentId: string) => {
    if (!confirm('Are you sure you want to remove this agent from the project?')) return;
    try {
      await projectAgentsApi.remove(id!, agentId);
      await fetchProjectAgents();
    } catch (err: any) {
      alert('Failed to remove agent: ' + err.message);
    }
  };

  const handleUpdateRole = async (agentId: string, newRole: 'lead' | 'contributor' | 'observer') => {
    try {
      await projectAgentsApi.updateRole(id!, agentId, newRole);
      await fetchProjectAgents();
    } catch (err: any) {
      alert('Failed to update role: ' + err.message);
    }
  };

  const handleMessageAgent = async (agentId: string) => {
    try {
      // Create or get DM channel with the agent
      const response = await chatApi.createOrGetDm('me', agentId);
      navigate(`/chat?channel=${response.channel.id}`);
    } catch (err) {
      console.error('Failed to open DM:', err);
      toast.error('DM', 'Failed to open direct message');
      navigate('/chat');
    }
  };

  const handleStatusToggle = async () => {
    if (!project) return;
    const newStatus = project.status === 'active' ? 'standby' : 'active';
    try {
      await projectsApi.updateStatus(project.id, newStatus);
      fetchProjectData();
    } catch (err) {
      console.error('Failed to update status:', err);
      toast.error('Project', 'Failed to update status');
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'lead': return <Crown className="w-4 h-4 text-yellow-400" />;
      case 'observer': return <Eye className="w-4 h-4 text-slate-400" />;
      default: return <Bot className="w-4 h-4 text-indigo-400" />;
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'lead': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'observer': return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
      default: return 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30';
    }
  };

  const getAgentStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'bg-green-500';
      case 'working': return 'bg-yellow-500';
      default: return 'bg-slate-500';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={16} className="animate-spin" style={{ color: 'var(--amber)' }} />
        <span className="ml-3" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-mid)' }}>LOADING PROJECT...</span>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-12">
        <AlertCircle size={32} className="mx-auto mb-4" style={{ color: '#ef4444' }} />
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-mid)' }}>{error || 'Project not found.'}</p>
        <Link to="/projects" className="ops-btn inline-flex mt-4">Back to projects</Link>
      </div>
    );
  }

  const activeTasks = projectTasks.filter(t => t.status === 'running');
  const completedTasks = projectTasks.filter(t => t.status === 'completed');

  return (
    <div className="space-y-4 animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/projects" style={{ color: 'var(--text-lo)', display: 'flex' }}>
            <ArrowLeft size={16} />
          </Link>
          <div>
            <div className="ops-section-header" style={{ marginBottom: 2 }}>Project</div>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${getProjectTypeDot(project.type)}`} />
              <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: 'var(--text-hi)', letterSpacing: '-0.02em' }}>{project.name}</h1>
              <span className={`ops-badge ${project.status === 'active' ? 'ops-badge-green' : project.status === 'standby' ? 'ops-badge-amber' : 'ops-badge-gray'}`}>
                {project.status.toUpperCase()}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleStatusToggle} className="ops-btn">
            {project?.status === 'active' ? <><Pause size={11} /> Pause</> : <><Play size={11} /> Start</>}
          </button>
          <button className="ops-btn"><Settings size={11} /></button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: '1px solid var(--ink-4)', display: 'flex', gap: 0 }}>
        {['overview', 'tasks', 'costs'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em',
              textTransform: 'uppercase', padding: '8px 16px', background: 'none', border: 'none',
              borderBottom: `2px solid ${activeTab === tab ? 'var(--amber)' : 'transparent'}`,
              color: activeTab === tab ? 'var(--amber)' : 'var(--text-lo)', cursor: 'pointer',
              marginBottom: -1, transition: 'color 0.15s'
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="ops-stat">
              <div className="ops-label mb-2">Status</div>
              <div className="ops-value" style={{ fontSize: '1rem', color: project.status === 'active' ? '#10b981' : project.status === 'standby' ? '#f59e0b' : 'var(--text-mid)' }}>
                {project.status.toUpperCase()}
              </div>
            </div>
            <div className="ops-stat">
              <div className="ops-label mb-2">Agents</div>
              <div className="ops-value">{projectAgents.length}</div>
            </div>
            <div className="ops-stat">
              <div className="ops-label mb-2">Tasks Done</div>
              <div className="ops-value" style={{ color: '#10b981' }}>{completedTasks.length}</div>
            </div>
            <div className="ops-stat">
              <div className="ops-label mb-2">In Progress</div>
              <div className="ops-value" style={{ color: '#f59e0b' }}>{activeTasks.length}</div>
            </div>
          </div>

          {/* Manager Agents */}
          <div className="ops-panel p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="ops-section-header" style={{ marginBottom: 0 }}>
                <Users size={11} /> Agents ({projectAgents.length})
              </div>
              <button onClick={() => setShowAssignDialog(true)} className="ops-btn">
                <UserPlus size={11} /> Assign
              </button>
            </div>
            {agentsLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 size={16} className="animate-spin" style={{ color: 'var(--amber)' }} />
              </div>
            ) : projectAgents.length === 0 ? (
              <div className="text-center py-6">
                <Bot size={24} className="mx-auto mb-2" style={{ color: 'var(--text-dim)' }} />
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-lo)' }}>No agents assigned yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {projectAgents.map((pa) => (
                  <div key={pa.assignment_id} className="flex items-center justify-between p-3 group" style={{ background: 'var(--ink-3)', border: '1px solid var(--ink-4)', borderRadius: 2 }}>
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="w-8 h-8 rounded flex items-center justify-center" style={{ background: 'var(--ink-4)' }}>
                          <Bot size={14} style={{ color: 'var(--amber)' }} />
                        </div>
                        <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 ${getAgentStatusColor(pa.agent.status)} rounded-full border-2`} style={{ borderColor: 'var(--ink-3)' }} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--text-hi)' }}>{pa.agent.name}</span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-lo)' }}>@{pa.agent.handle}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`ops-badge ${getRoleBadgeColor(pa.role).includes('yellow') ? 'ops-badge-amber' : getRoleBadgeColor(pa.role).includes('indigo') ? 'ops-badge-purple' : 'ops-badge-gray'}`} style={{ fontSize: 9 }}>
                            {pa.role.toUpperCase()}
                          </span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: pa.status === 'active' ? '#10b981' : 'var(--text-lo)' }}>
                            {pa.status}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleMessageAgent(pa.agent.id)} className="ops-btn" style={{ padding: '3px 8px' }} title="Message">
                        <MessageSquare size={11} />
                      </button>
                      <div className="relative">
                        <button onClick={() => setActiveMenu(activeMenu === pa.assignment_id ? null : pa.assignment_id)} className="ops-btn" style={{ padding: '3px 8px' }}>
                          <MoreVertical size={11} />
                        </button>
                        {activeMenu === pa.assignment_id && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setActiveMenu(null)} />
                            <div className="absolute right-0 top-full mt-1 z-20 py-1" style={{ background: 'var(--ink-2)', border: '1px solid var(--ink-4)', borderRadius: 2, minWidth: 140 }}>
                              {pa.role !== 'lead' && <button key="make-lead" onClick={() => { handleUpdateRole(pa.agent.id, 'lead'); setActiveMenu(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-left" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#fbbf24', background: 'none', border: 'none', cursor: 'pointer' }}><Crown size={11} /> Make Lead</button>}
                              {pa.role !== 'contributor' && <button key="make-contributor" onClick={() => { handleUpdateRole(pa.agent.id, 'contributor'); setActiveMenu(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-left" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#a78bfa', background: 'none', border: 'none', cursor: 'pointer' }}><Bot size={11} /> Contributor</button>}
                              {pa.role !== 'observer' && <button key="make-observer" onClick={() => { handleUpdateRole(pa.agent.id, 'observer'); setActiveMenu(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-left" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-mid)', background: 'none', border: 'none', cursor: 'pointer' }}><Eye size={11} /> Observer</button>}
                              <div key="divider" style={{ borderTop: '1px solid var(--ink-4)', margin: '4px 0' }} />
                              <button key="remove" onClick={() => { handleRemoveAgent(pa.agent.id); setActiveMenu(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-left" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}><UserX size={11} /> Remove</button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Tasks + Costs */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="ops-panel p-4">
              <div className="ops-section-header mb-3"><Clock size={11} /> Recent Tasks</div>
              {projectTasks.length === 0 ? (
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-lo)', textAlign: 'center', padding: '16px 0' }}>No tasks yet</p>
              ) : (
                <div className="space-y-2">
                  {projectTasks.slice(0, 4).map((task) => (
                    <div key={task.id} className="flex items-center justify-between" style={{ padding: '8px 10px', background: 'var(--ink-3)', border: '1px solid var(--ink-4)', borderRadius: 2 }}>
                      <div className="flex items-center gap-2">
                        {task.status === 'completed' ? <CheckCircle2 size={12} style={{ color: '#10b981' }} /> : <Clock size={12} style={{ color: '#f59e0b' }} />}
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-mid)' }}>{task.title}</span>
                      </div>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: getPriorityColor(task.priority).replace('text-', '') === 'red-400' ? '#f87171' : 'var(--text-lo)', textTransform: 'uppercase' }}>{task.priority}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="ops-panel p-4">
              <div className="ops-section-header mb-3"><AlertTriangle size={11} /> Costs</div>
              <div className="space-y-3">
                {[['Today', `$${project.stats?.todayCost?.toFixed(2) || '0.00'}`], ['This Month', `$${project.stats?.monthCost || 0}`]].map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-lo)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{k}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--text-hi)' }}>{v}</span>
                  </div>
                ))}
                <div className="ops-bar-track" style={{ marginTop: 8 }}>
                  <div className="ops-bar-fill" style={{ width: Math.min(((project.stats?.monthCost || 0) / Math.max(project.stats?.monthBudget || 1, 1)) * 100, 100) + '%' }} />
                </div>
              </div>
            </div>
          </div>

          {/* Assign Agent Dialog */}
          {showAssignDialog && project && (
            <ProjectAssignAgentDialog
              projectName={project.name}
              onClose={() => setShowAssignDialog(false)}
              onAssign={handleAssignAgent}
            />
          )}
        </>
      )}

  {/* Tasks Tab */}
  {activeTab === 'tasks' && project && (
    <TaskList
      projectId={project.id}
      projectName={project.name}
    />
  )}
</div>
  );
}
