import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { projectsApi, projectAgentsApi, chatApi, type Agent } from '../services/api';
import ProjectAssignAgentDialog from '../components/ProjectAssignAgentDialog';
import TaskList from '../components/TaskList';
import { 
  ArrowLeft, 
  Edit, 
  Pause, 
  Settings, 
  Cpu, 
  HardDrive, 
  Wifi,
  Github,
  Cloud,
  CreditCard,
  Rocket,
  FileText,
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
  projectId: string;
  projectName: string;
  projectColor: string;
  status: 'backlog' | 'in_progress' | 'review' | 'done';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assignee?: string;
  estimatedCost?: number;
  actualCost: number;
}

interface ProjectAgent {
  id: string;
  agent_id: string;
  role: 'lead' | 'contributor' | 'observer';
  status: 'active' | 'inactive' | 'pending';
  joined_at: string;
  agent: Agent;
}

const getStatusBg = (status: string) => {
  switch (status) {
    case 'active':
    case 'done':
      return 'bg-green-500/20 text-green-400';
    case 'standby':
    case 'in_progress':
    case 'review':
      return 'bg-yellow-500/20 text-yellow-400';
    case 'offline':
    case 'backlog':
      return 'bg-red-500/20 text-red-400';
    default:
      return 'bg-slate-700 text-slate-400';
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'active':
    case 'done':
      return 'text-green-400';
    case 'standby':
    case 'in_progress':
    case 'review':
      return 'text-yellow-400';
    case 'offline':
    case 'backlog':
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
    case 'urgent': return 'text-red-400';
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
      case 'active': return 'bg-green-500';
      case 'working': return 'bg-yellow-500';
      default: return 'bg-slate-500';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
        <span className="ml-3 text-slate-400">Loading project...</span>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-slate-50">Project not found</h1>
        <p className="text-slate-400 mt-2">{error || 'The project you are looking for does not exist.'}</p>
        <Link to="/projects" className="text-primary hover:underline mt-4 inline-block">
          Back to projects
        </Link>
      </div>
    );
  }

  const activeTasks = projectTasks.filter(t => t.status === 'in_progress');
  const completedTasks = projectTasks.filter(t => t.status === 'done');

  return (
    <div className="space-y-6">
      {/* Breadcrumb & Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/projects" className="text-slate-400 hover:text-slate-200">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${getProjectTypeDot(project.type)}`} />
            <h1 className="text-2xl font-bold text-slate-50">{project.name}</h1>
          </div>
          <span className={`text-sm px-3 py-1 rounded-full ${getStatusBg(project.status)}`}>
            {project.status}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-slate-200 px-4 py-2 rounded-lg transition-colors">
            <Edit className="w-4 h-4" />
            Edit
          </button>
          <button 
            onClick={handleStatusToggle}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              project?.status === 'active' 
                ? 'bg-slate-700 hover:bg-slate-600 text-yellow-400' 
                : 'bg-slate-700 hover:bg-slate-600 text-green-400'
            }`}
          >
            {project?.status === 'active' ? (
              <><Pause className="w-4 h-4" /> Pause</>
            ) : (
              <><Play className="w-4 h-4" /> Start</>
            )}
          </button>
          <button className="p-2 bg-slate-700 hover:bg-slate-600 text-slate-400 rounded-lg transition-colors">
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Subheader Info */}
      <div className="flex items-center gap-4 text-slate-400 text-sm">
        <span>{project.macMiniId}</span>
        <span>•</span>
        <span>{project.pmName || 'No PM assigned'}</span>
        <span>•</span>
        <span className={getStatusColor(project.status)}>● {project.status}</span>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-700">
        <nav className="flex gap-6">
          {['overview', 'tasks', 'workers', 'costs', 'resources', 'logs'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors capitalize ${
                activeTab === tab
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <>
          {/* Overview Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Status Board */}
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
              <h3 className="font-semibold text-slate-50 mb-4">Status Board</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Status</span>
                  <span className={`flex items-center gap-2 ${getStatusColor(project.status)}`}>
                    <span className="w-2 h-2 rounded-full bg-current" />
                    {project.status.charAt(0).toUpperCase() + project.status.slice(1)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Uptime</span>
                  <span className="text-slate-200">14 days</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Last Activity</span>
                  <span className="text-slate-200">{project.lastActivity || 'Never'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Workers</span>
                  <span className="text-slate-200">2/5 active</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Tasks</span>
                  <span className="text-slate-200">{completedTasks.length} done / {activeTasks.length} ongoing</span>
                </div>
              </div>
            </div>

        {/* Manager Agents */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-50 flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-400" />
              Manager Agents ({projectAgents.length})
            </h3>
            <button
              onClick={() => setShowAssignDialog(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              Assign
            </button>
          </div>
          
          {agentsLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
            </div>
          ) : projectAgents.length === 0 ? (
            <div className="text-center py-6">
              <Bot className="w-10 h-10 text-slate-600 mx-auto mb-2" />
              <p className="text-slate-500">No agents assigned yet</p>
              <p className="text-sm text-slate-600 mt-1">Assign agents to help manage this project</p>
            </div>
          ) : (
            <div className="space-y-3">
              {projectAgents.map((pa) => (
                <div key={pa.id} className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg group hover:bg-slate-700 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center">
                        <Bot className="w-5 h-5 text-white" />
                      </div>
                      <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 ${getAgentStatusColor(pa.status)} rounded-full border-2 border-slate-800`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-200">{pa.agent.name}</span>
                        <span className="text-xs text-slate-500">@{pa.agent.handle}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs border ${getRoleBadgeColor(pa.role)}`}>
                          {getRoleIcon(pa.role)}
                          {pa.role.charAt(0).toUpperCase() + pa.role.slice(1)}
                        </span>
                        <span className="text-xs text-slate-500">|</span>
                        <span className={`text-xs ${
                          pa.status === 'active' ? 'text-green-400' : 'text-slate-400'
                        }`}>
                          {pa.status === 'active' ? 'Working' : pa.status}
                        </span>
                      </div>
                      {pa.agent.skills && pa.agent.skills.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {pa.agent.skills.slice(0, 3).map((skill, idx) => (
                            <span key={idx} className="text-xs text-slate-400">{skill}{idx < Math.min(pa.agent.skills.length, 3) - 1 ? ',' : ''}</span>
                          ))}
                          {pa.agent.skills.length > 3 && (
                            <span className="text-xs text-slate-500">+{pa.agent.skills.length - 3}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleMessageAgent(pa.agent_id)}
                      className="p-2 text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-colors"
                      title="Send Message"
                    >
                      <MessageSquare className="w-4 h-4" />
                    </button>
                    <div className="relative">
                      <button
                        onClick={() => setActiveMenu(activeMenu === pa.id ? null : pa.id)}
                        className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded-lg transition-colors"
                        title="More options"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      {activeMenu === pa.id && (
                        <>
                          <div 
                            className="fixed inset-0 z-10" 
                            onClick={() => setActiveMenu(null)}
                          />
                          <div className="absolute right-0 top-full mt-1 w-40 bg-slate-800 rounded-lg border border-slate-700 shadow-xl z-20 py-1">
                            {pa.role !== 'lead' && (
                              <button
                                onClick={() => {
                                  handleUpdateRole(pa.agent_id, 'lead');
                                  setActiveMenu(null);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-yellow-400 hover:bg-slate-700 transition-colors text-left"
                              >
                                <Crown className="w-4 h-4" />
                                Make Lead
                              </button>
                            )}
                            {pa.role !== 'contributor' && (
                              <button
                                onClick={() => {
                                  handleUpdateRole(pa.agent_id, 'contributor');
                                  setActiveMenu(null);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-indigo-400 hover:bg-slate-700 transition-colors text-left"
                              >
                                <Bot className="w-4 h-4" />
                                Make Contributor
                              </button>
                            )}
                            {pa.role !== 'observer' && (
                              <button
                                onClick={() => {
                                  handleUpdateRole(pa.agent_id, 'observer');
                                  setActiveMenu(null);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:bg-slate-700 transition-colors text-left"
                              >
                                <Eye className="w-4 h-4" />
                                Make Observer
                              </button>
                            )}
                            <div className="border-t border-slate-700 my-1" />
                            <button
                              onClick={() => {
                                handleRemoveAgent(pa.agent_id);
                                setActiveMenu(null);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors text-left"
                            >
                              <UserX className="w-4 h-4" />
                              Remove
                            </button>
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

        {/* Resource Usage */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
          <h3 className="font-semibold text-slate-50 mb-4">Resource Usage</h3>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-slate-400 flex items-center gap-2">
                  <Cpu className="w-4 h-4" /> CPU
                </span>
                <span className="text-slate-200">45%</span>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full" style={{ width: '45%' }} />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-slate-400 flex items-center gap-2">
                  <HardDrive className="w-4 h-4" /> RAM
                </span>
                <span className="text-slate-200">60%</span>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-yellow-400 rounded-full" style={{ width: '60%' }} />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-slate-400 flex items-center gap-2">
                  <HardDrive className="w-4 h-4" /> Disk
                </span>
                <span className="text-slate-200">34%</span>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-green-400 rounded-full" style={{ width: '34%' }} />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-slate-400 flex items-center gap-2">
                  <Wifi className="w-4 h-4" /> Network
                </span>
                <span className="text-slate-200">12 MB/s</span>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-blue-400 rounded-full" style={{ width: '25%' }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Connected Resources */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
        <h3 className="font-semibold text-slate-50 mb-4">Connected Resources</h3>
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 bg-slate-700/50 px-4 py-2 rounded-lg">
            <Github className="w-4 h-4 text-slate-300" />
            <span className="text-slate-200">GitHub</span>
            <CheckCircle2 className="w-4 h-4 text-green-400" />
          </div>
          <div className="flex items-center gap-2 bg-slate-700/50 px-4 py-2 rounded-lg">
            <Cloud className="w-4 h-4 text-slate-300" />
            <span className="text-slate-200">AWS</span>
            <CheckCircle2 className="w-4 h-4 text-green-400" />
          </div>
          <div className="flex items-center gap-2 bg-slate-700/50 px-4 py-2 rounded-lg">
            <CreditCard className="w-4 h-4 text-slate-300" />
            <span className="text-slate-200">Stripe</span>
            <CheckCircle2 className="w-4 h-4 text-green-400" />
          </div>
          <div className="flex items-center gap-2 bg-slate-700/50 px-4 py-2 rounded-lg">
            <Rocket className="w-4 h-4 text-slate-300" />
            <span className="text-slate-200">Vercel</span>
            <CheckCircle2 className="w-4 h-4 text-green-400" />
          </div>
          <div className="flex items-center gap-2 bg-slate-700/50 px-4 py-2 rounded-lg">
            <FileText className="w-4 h-4 text-slate-300" />
            <span className="text-slate-200">Notion</span>
            <AlertCircle className="w-4 h-4 text-red-400" />
          </div>
        </div>
      </div>

      {/* Active Workers & Recent Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
          <h3 className="font-semibold text-slate-50 mb-4">Active Workers</h3>
          {activeTasks.length === 0 ? (
            <p className="text-slate-500 text-center py-4">No active workers</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center">
                    <Cpu className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-200">CodeDev-1</p>
                    <p className="text-sm text-slate-400">T-{activeTasks[0]?.id || '121'} • 45m</p>
                  </div>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-400">Active</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-yellow-500/20 rounded-full flex items-center justify-center">
                    <Cpu className="w-4 h-4 text-yellow-400" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-200">CodeReview-1</p>
                    <p className="text-sm text-slate-400">T-{activeTasks[0]?.id || '122'} • 12m</p>
                  </div>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-400">Active</span>
              </div>
            </div>
          )}
        </div>

        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
          <h3 className="font-semibold text-slate-50 mb-4">Recent Tasks</h3>
          {projectTasks.length === 0 ? (
            <p className="text-slate-500 text-center py-4">No tasks yet</p>
          ) : (
            <div className="space-y-3">
              {projectTasks.slice(0, 3).map((task) => (
                <div key={task.id} className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
                  <div>
                    <p className="font-medium text-slate-200 flex items-center gap-2">
                      {task.status === 'done' ? (
                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                      ) : (
                        <Clock className="w-4 h-4 text-yellow-400" />
                      )}
                      {task.id}: {task.title}
                    </p>
                  </div>
                  <span className={`text-xs ${getPriorityColor(task.priority)}`}>
                    {task.priority}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Budget Overview */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
        <h3 className="font-semibold text-slate-50 mb-4">Budget Overview</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-700/30 rounded-lg p-4">
            <p className="text-sm text-slate-400">Today's Cost</p>
            <p className="text-2xl font-bold text-slate-50">${project.stats?.todayCost?.toFixed(2) || '0.00'}</p>
          </div>
          <div className="bg-slate-700/30 rounded-lg p-4">
            <p className="text-sm text-slate-400">This Month</p>
            <p className="text-2xl font-bold text-slate-50">${project.stats?.monthCost || 0}</p>
            <p className="text-xs text-slate-500">of ${project.stats?.monthBudget || 0} budget</p>
          </div>
          <div className="bg-slate-700/30 rounded-lg p-4">
            <p className="text-sm text-slate-400">Budget Usage</p>
            <div className="flex items-center gap-2">
              <p className="text-2xl font-bold text-slate-50">
                {Math.round(((project.stats?.monthCost || 0) / (project.stats?.monthBudget || 1)) * 100)}%
              </p>
              {((project.stats?.monthCost || 0) / (project.stats?.monthBudget || 1)) > 0.8 && (
                <AlertTriangle className="w-5 h-5 text-yellow-400" />
              )}
            </div>
            <div className="mt-2 h-2 bg-slate-700 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full ${
                  ((project.stats?.monthCost || 0) / (project.stats?.monthBudget || 1)) > 0.8 ? 'bg-yellow-400' : 'bg-green-400'
                }`}
                style={{ width: `${Math.min(((project.stats?.monthCost || 0) / (project.stats?.monthBudget || 1)) * 100, 100)}%` }}
              />
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
