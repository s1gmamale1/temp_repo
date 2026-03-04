import { useState, useEffect } from 'react';
import { 
  X, 
  Bot, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Zap, 
  UserCheck,
  BarChart3,
  TrendingUp,
  Activity,
  Search,
  Filter,
  Loader2,
  MessageSquare
} from 'lucide-react';
import { tasksApi, agentsApi, projectAgentsApi, type Agent } from '../../services/api';

interface TaskAssignmentDialogProps {
  taskId: string;
  taskTitle: string;
  projectId?: string;
  onClose: () => void;
  onAssigned: () => void;
}

interface AgentWithWorkload extends Agent {
  workload?: {
    total: number;
    pending: number;
    running: number;
    completed: number;
  };
  availability: 'available' | 'busy' | 'overloaded' | 'offline';
  lastActive?: string;
  skillsMatch?: number; // 0-100 score
}

export default function TaskAssignmentDialog({ 
  taskId, 
  taskTitle, 
  projectId,
  onClose, 
  onAssigned 
}: TaskAssignmentDialogProps) {
  const [agents, setAgents] = useState<AgentWithWorkload[]>([]);
  const [filteredAgents, setFilteredAgents] = useState<AgentWithWorkload[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingAgents, setFetchingAgents] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAvailability, setFilterAvailability] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'availability' | 'workload' | 'skills'>('availability');

  useEffect(() => {
    fetchAgents();
  }, []);

  useEffect(() => {
    // Filter and sort agents
    let filtered = agents;

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(a => 
        a.name.toLowerCase().includes(query) ||
        a.handle.toLowerCase().includes(query) ||
        a.skills?.some(s => s.toLowerCase().includes(query))
      );
    }

    // Availability filter
    if (filterAvailability !== 'all') {
      filtered = filtered.filter(a => a.availability === filterAvailability);
    }

    // Sort
    filtered = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'availability':
          const availOrder = { available: 0, busy: 1, overloaded: 2, offline: 3 };
          return availOrder[a.availability] - availOrder[b.availability];
        case 'workload':
          return (a.workload?.total || 0) - (b.workload?.total || 0);
        case 'skills':
          return (b.skillsMatch || 0) - (a.skillsMatch || 0);
        default:
          return 0;
      }
    });

    setFilteredAgents(filtered);
  }, [agents, searchQuery, filterAvailability, sortBy]);

  const fetchAgents = async () => {
    try {
      setFetchingAgents(true);
      
      // Get agents - either project agents or all online agents
      let agentList: Agent[] = [];
      if (projectId) {
        try {
          const res = await projectAgentsApi.listByProject(projectId);
          agentList = res.agents || [];
        } catch {
          // Fallback to all agents
          const res = await agentsApi.list({ status: 'online' });
          agentList = res.agents || [];
        }
      } else {
        const res = await agentsApi.list({ status: 'online' });
        agentList = res.agents || [];
      }

      // Enhance with mock workload data for now
      // In production, this would come from the API
      const enhancedAgents: AgentWithWorkload[] = await Promise.all(
        agentList.map(async (agent: Agent) => {
          try {
            // Try to fetch agent tasks for workload
            const tasksRes = await agentsApi.getById(agent.id);
            const tasks = tasksRes.tasks || [];
            
            const workload = {
              total: tasks.length,
              pending: tasks.filter((t: any) => t.status === 'pending').length,
              running: tasks.filter((t: any) => t.status === 'running').length,
              completed: tasks.filter((t: any) => t.status === 'completed').length,
            };

            // Determine availability based on workload
            let availability: AgentWithWorkload['availability'] = 'available';
            if (agent.status === 'offline') {
              availability = 'offline';
            } else if (workload.running >= 3) {
              availability = 'overloaded';
            } else if (workload.running >= 1 || workload.pending >= 3) {
              availability = 'busy';
            }

            return {
              ...agent,
              workload,
              availability,
              lastActive: new Date(Date.now() - Math.random() * 3600000).toISOString(), // Mock
              skillsMatch: Math.floor(Math.random() * 40) + 60, // Mock 60-100%
            };
          } catch {
            return {
              ...agent,
              workload: { total: 0, pending: 0, running: 0, completed: 0 },
              availability: agent.status === 'online' ? 'available' : 'offline',
              skillsMatch: 50,
            };
          }
        })
      );
      
      setAgents(enhancedAgents);
    } catch (err: any) {
      setError('Failed to load agents: ' + err.message);
    } finally {
      setFetchingAgents(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedAgentId) {
      setError('Please select an agent');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      await tasksApi.assign(taskId, selectedAgentId, message.trim() || undefined);
      onAssigned();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to assign task');
    } finally {
      setLoading(false);
    }
  };

  const getAvailabilityColor = (availability: AgentWithWorkload['availability']) => {
    switch (availability) {
      case 'available': return 'bg-green-500';
      case 'busy': return 'bg-yellow-500';
      case 'overloaded': return 'bg-orange-500';
      case 'offline': return 'bg-slate-500';
      default: return 'bg-slate-500';
    }
  };

  const getAvailabilityLabel = (availability: AgentWithWorkload['availability']) => {
    switch (availability) {
      case 'available': return 'Available';
      case 'busy': return 'Busy';
      case 'overloaded': return 'Overloaded';
      case 'offline': return 'Offline';
      default: return 'Unknown';
    }
  };

  const getWorkloadBarColor = (workload: number) => {
    if (workload === 0) return 'bg-slate-600';
    if (workload <= 2) return 'bg-green-500';
    if (workload <= 4) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const selectedAgent = agents.find(a => a.id === selectedAgentId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary to-purple-600 rounded-lg flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-50">Assign Task</h2>
              <p className="text-sm text-slate-400 truncate max-w-[300px]">{taskTitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
          {error && (
            <div className="mx-4 mt-4 flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Filters */}
          <div className="p-4 border-b border-slate-700 space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search agents..."
                  className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                />
              </div>
              <select
                value={filterAvailability}
                onChange={(e) => setFilterAvailability(e.target.value)}
                className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="all">All Status</option>
                <option value="available">Available</option>
                <option value="busy">Busy</option>
                <option value="overloaded">Overloaded</option>
              </select>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="availability">Sort by Availability</option>
                <option value="workload">Sort by Workload</option>
                <option value="skills">Sort by Skills</option>
              </select>
            </div>
          </div>

          {/* Agent List */}
          <div className="flex-1 overflow-y-auto p-4">
            {fetchingAgents ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
              </div>
            ) : filteredAgents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Bot className="w-12 h-12 text-slate-600 mb-3" />
                <p className="text-slate-400">No agents found</p>
                <p className="text-slate-500 text-sm mt-1">
                  {searchQuery ? 'Try adjusting your search' : 'No agents available for assignment'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredAgents.map((agent) => (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => setSelectedAgentId(agent.id)}
                    className={`
                      w-full flex items-start gap-3 p-3 rounded-lg border transition-all text-left
                      ${selectedAgentId === agent.id
                        ? 'bg-primary/10 border-primary/50 ring-1 ring-primary'
                        : 'bg-slate-700/30 border-slate-700 hover:bg-slate-700/50'
                      }
                    `}
                  >
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                      <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center">
                        <Bot className="w-6 h-6 text-white" />
                      </div>
                      <div className={`
                        absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 
                        ${getAvailabilityColor(agent.availability)} 
                        rounded-full border-2 border-slate-800
                      `} />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-200">{agent.name}</span>
                        <span className="text-xs text-slate-500">@{agent.handle}</span>
                        {selectedAgentId === agent.id && (
                          <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
                        )}
                      </div>
                      
                      <div className="flex items-center gap-3 mt-1">
                        <span className={`
                          text-xs font-medium
                          ${agent.availability === 'available' ? 'text-green-400' : 
                            agent.availability === 'busy' ? 'text-yellow-400' :
                            agent.availability === 'overloaded' ? 'text-orange-400' : 'text-slate-400'}
                        `}>
                          {getAvailabilityLabel(agent.availability)}
                        </span>
                        <span className="text-xs text-slate-500">{agent.experience_level}</span>
                        <span className="text-xs text-slate-500">{agent.role}</span>
                      </div>

                      {/* Workload Bar */}
                      {agent.workload && (
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                            <span className="flex items-center gap-1">
                              <BarChart3 className="w-3 h-3" />
                              Workload
                            </span>
                            <span>{agent.workload.running} running / {agent.workload.total} total</span>
                          </div>
                          <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                            <div 
                              className={`h-full ${getWorkloadBarColor(agent.workload.running)} transition-all`}
                              style={{ width: `${Math.min((agent.workload.running / 5) * 100, 100)}%` }}
                            />
                          </div>
                        </div>
                      )}
                      
                      {/* Skills */}
                      {agent.skills && agent.skills.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {agent.skills.slice(0, 4).map((skill, idx) => (
                            <span 
                              key={idx} 
                              className="text-[10px] px-1.5 py-0.5 bg-slate-600/50 rounded text-slate-300"
                            >
                              {skill}
                            </span>
                          ))}
                          {agent.skills.length > 4 && (
                            <span className="text-[10px] text-slate-500">+{agent.skills.length - 4}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Selected Agent & Message */}
          <div className="p-4 border-t border-slate-700 space-y-3">
            {selectedAgent && (
              <div className="p-3 bg-indigo-500/10 border border-indigo-500/30 rounded-lg">
                <div className="flex items-center gap-2 text-sm">
                  <UserCheck className="w-4 h-4 text-indigo-400" />
                  <span className="text-indigo-300">
                    Will assign to <strong className="text-indigo-200">{selectedAgent.name}</strong>
                  </span>
                </div>
                {selectedAgent.workload && selectedAgent.workload.running > 0 && (
                  <p className="text-xs text-amber-400 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    This agent has {selectedAgent.workload.running} running tasks
                  </p>
                )}
              </div>
            )}

            {/* Optional Message */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-1">
                <MessageSquare className="w-4 h-4 text-slate-400" />
                Assignment Message (optional)
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Add context or instructions for the agent..."
                rows={2}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none text-sm"
                disabled={loading}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-700 bg-slate-800/50">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-300 hover:text-slate-100 transition-colors"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAssign}
              disabled={loading || !selectedAgentId || filteredAgents.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium rounded-lg transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Assigning...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  Assign Task
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
