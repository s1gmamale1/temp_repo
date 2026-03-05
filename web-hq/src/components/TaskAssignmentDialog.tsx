import { useState, useEffect } from 'react';
import { X, Bot, AlertCircle, CheckCircle2, Clock, Zap, UserCheck, Loader2 } from 'lucide-react';
import { tasksApi, agentsApi, fetchApi, type Agent } from '../services/api';

interface TaskAssignmentDialogProps {
  taskId: string;
  taskTitle: string;
  onClose: () => void;
  onAssigned: () => void;
}

interface AgentWithAvailability extends Agent {
  availability?: 'available' | 'busy' | 'offline';
  currentTasks?: number;
}

export default function TaskAssignmentDialog({ taskId, taskTitle, onClose, onAssigned }: TaskAssignmentDialogProps) {
  const [agents, setAgents] = useState<AgentWithAvailability[]>([]);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [notifyAgents, setNotifyAgents] = useState(true);
  const [loading, setLoading] = useState(false);
  const [fetchingAgents, setFetchingAgents] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    try {
      setFetchingAgents(true);
      const response = await agentsApi.list({ status: 'online' });
      const agentList: Agent[] = response.agents || [];

      // Fetch real task counts for each agent in parallel
      const withTasks = await Promise.all(
        agentList.map(async (agent: Agent) => {
          let currentTasks = 0;
          try {
            const taskData = await fetchApi(`/api/agents/${agent.id}/tasks?status=running&limit=50`);
            currentTasks = (taskData.tasks || []).length;
          } catch { }
          return {
            ...agent,
            availability: agent.status === 'online' ? 'available' :
              agent.status === 'working' ? 'busy' : 'offline',
            currentTasks,
          };
        })
      );
      setAgents(withTasks);
    } catch (err: any) {
      setError('Failed to load agents: ' + err.message);
    } finally {
      setFetchingAgents(false);
    }
  };

  const handleAssign = async () => {
    if (selectedAgentIds.length === 0) {
      setError('Please select at least one agent');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Support multiple assignments
      for (const agentId of selectedAgentIds) {
        await tasksApi.assign(taskId, agentId, message.trim() || undefined);
      }

      onAssigned();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to assign task');
    } finally {
      setLoading(false);
    }
  };

  const toggleAgentSelection = (agentId: string) => {
    setSelectedAgentIds(prev =>
      prev.includes(agentId)
        ? prev.filter(id => id !== agentId)
        : [...prev, agentId]
    );
  };

  const getAvailabilityColor = (availability?: string) => {
    switch (availability) {
      case 'available': return 'bg-green-500';
      case 'busy': return 'bg-yellow-500';
      default: return 'bg-slate-500';
    }
  };

  const getAvailabilityLabel = (availability?: string) => {
    switch (availability) {
      case 'available': return 'Available';
      case 'busy': return 'Busy';
      default: return 'Offline';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div>
            <h2 className="text-lg font-semibold text-slate-50">Assign Task</h2>
            <p className="text-sm text-slate-400 truncate max-w-[280px]">{taskTitle}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          {/* Agent Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Select Agents <span className="text-red-400">*</span>
              <span className="text-slate-500 text-xs ml-2">({selectedAgentIds.length} selected)</span>
            </label>

            {fetchingAgents ? (
              <div className="flex items-center justify-center py-8">
                <span className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            ) : agents.length === 0 ? (
              <div className="text-center py-6 bg-slate-700/30 rounded-lg">
                <Bot className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                <p className="text-slate-400 text-sm">No agents available</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto bg-slate-900/50 rounded-lg p-2 border border-slate-700">
                {agents.map((agent) => (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => toggleAgentSelection(agent.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left ${selectedAgentIds.includes(agent.id)
                        ? 'bg-primary/10 border-primary/50 ring-1 ring-primary'
                        : 'bg-slate-800 border-slate-700 hover:bg-slate-700/50'
                      }`}
                  >
                    {/* Selection Checkbox */}
                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${selectedAgentIds.includes(agent.id)
                        ? 'bg-primary border-primary'
                        : 'border-slate-500'
                      }`}>
                      {selectedAgentIds.includes(agent.id) && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                      )}
                    </div>

                    {/* Avatar */}
                    <div className="relative">
                      <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center">
                        <Bot className="w-5 h-5 text-white" />
                      </div>
                      <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 ${getAvailabilityColor(agent.availability)} rounded-full border-2 border-slate-800`} />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-200 truncate">{agent.name}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span>@{agent.handle}</span>
                        <span>•</span>
                        <span className={agent.availability === 'available' ? 'text-green-400' : 'text-yellow-400'}>
                          {getAvailabilityLabel(agent.availability)}
                        </span>
                      </div>

                      {/* Skills */}
                      {agent.skills && agent.skills.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {agent.skills.slice(0, 2).map((skill, idx) => (
                            <span key={idx} className="text-xs px-1.5 py-0.5 bg-slate-600/50 rounded text-slate-300">
                              {skill}
                            </span>
                          ))}
                          {agent.skills.length > 2 && (
                            <span className="text-xs text-slate-500">+{agent.skills.length - 2}</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Current Load */}
                    <div className="text-right text-xs text-slate-500">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {agent.currentTasks} tasks
                      </div>
                      <div className="mt-0.5">{agent.experience_level}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Selected Agents Summary */}
          {selectedAgentIds.length > 0 && (
            <div className="p-3 bg-indigo-500/10 border border-indigo-500/30 rounded-lg">
              <div className="flex items-center gap-2 text-sm text-indigo-300">
                <UserCheck className="w-4 h-4" />
                <span>
                  Will assign to <strong className="text-indigo-200">
                    {selectedAgentIds.length === 1
                      ? agents.find(a => a.id === selectedAgentIds[0])?.name
                      : `${selectedAgentIds.length} agents`
                    }
                  </strong>
                </span>
              </div>
            </div>
          )}

          {/* Optional Message */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Message (optional)
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Add a personal message to the agents..."
              rows={3}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary resize-none text-sm"
              disabled={loading}
            />
          </div>

          {/* Notify Option */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="notify"
              checked={notifyAgents}
              onChange={(e) => setNotifyAgents(e.target.checked)}
              className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-primary focus:ring-primary"
            />
            <label htmlFor="notify" className="text-sm text-slate-300 cursor-pointer">
              Send DM notification to assigned agents
            </label>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-700">
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
              disabled={loading || selectedAgentIds.length === 0 || agents.length === 0}
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
                  Assign to {selectedAgentIds.length || 0} Agent{selectedAgentIds.length !== 1 ? 's' : ''}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}