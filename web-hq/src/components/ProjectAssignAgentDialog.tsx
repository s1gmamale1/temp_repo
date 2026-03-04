import { useState, useEffect } from 'react';
import { X, Bot, Loader2, CheckCircle2, AlertCircle, UserPlus } from 'lucide-react';
import { agentsApi, type Agent } from '../services/api';

interface ProjectAssignAgentDialogProps {
  projectName: string;
  onClose: () => void;
  onAssign: (agentId: string, role: 'lead' | 'contributor' | 'observer') => Promise<void>;
}

type AgentRole = 'lead' | 'contributor' | 'observer';

const roleLabels: Record<AgentRole, string> = {
  lead: 'Project Lead',
  contributor: 'Contributor',
  observer: 'Observer',
};

const roleDescriptions: Record<AgentRole, string> = {
  lead: 'Full control over project tasks and team management',
  contributor: 'Can create and complete tasks, participate in discussions',
  observer: 'View-only access to project progress and resources',
};

export default function ProjectAssignAgentDialog({
  projectName,
  onClose,
  onAssign,
}: ProjectAssignAgentDialogProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<AgentRole>('contributor');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetchApprovedAgents();
  }, []);

  const fetchApprovedAgents = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await agentsApi.list({ status: 'approved' });
      setAgents(response.agents || []);
    } catch (err: any) {
      console.error('Failed to fetch agents:', err);
      setError(err.message || 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAgentId) {
      setError('Please select an agent');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      await onAssign(selectedAgentId, selectedRole);
      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('Failed to assign agent:', err);
      setError(err.message || 'Failed to assign agent');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedAgent = agents.find(a => a.id === selectedAgentId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div>
            <h2 className="text-lg font-semibold text-slate-50">Assign Manager Agent</h2>
            <p className="text-sm text-slate-400 mt-0.5">{projectName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {success ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-green-400" />
              </div>
              <h3 className="text-lg font-medium text-slate-200">Agent Assigned!</h3>
              <p className="text-slate-400 mt-1">The agent has been notified.</p>
            </div>
          ) : (
            <>
              {/* Agent Selection */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Select Agent
                </label>
                {loading ? (
                  <div className="flex items-center gap-3 p-4 bg-slate-700/50 rounded-lg">
                    <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                    <span className="text-slate-400">Loading agents...</span>
                  </div>
                ) : agents.length === 0 ? (
                  <div className="p-4 bg-slate-700/50 rounded-lg text-center">
                    <Bot className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                    <p className="text-slate-400">No approved agents available</p>
                  </div>
                ) : (
                  <div className="relative">
                    <select
                      value={selectedAgentId}
                      onChange={(e) => setSelectedAgentId(e.target.value)}
                      className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent appearance-none cursor-pointer"
                    >
                      <option value="" disabled>Choose an agent...</option>
                      {agents.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.name} ({agent.handle}) - {agent.role}
                        </option>
                      ))}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                      <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                )}

                {/* Selected Agent Details */}
                {selectedAgent && (
                  <div className="mt-3 p-3 bg-slate-700/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center">
                        <Bot className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-200">{selectedAgent.name}</p>
                        <p className="text-xs text-slate-400">{selectedAgent.handle}</p>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        selectedAgent.status === 'approved' 
                          ? 'bg-green-500/20 text-green-400' 
                          : 'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {selectedAgent.status}
                      </span>
                    </div>
                    {selectedAgent.skills && selectedAgent.skills.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {selectedAgent.skills.slice(0, 4).map((skill, idx) => (
                          <span key={idx} className="px-2 py-0.5 bg-slate-600/50 text-slate-300 text-xs rounded">
                            {skill}
                          </span>
                        ))}
                        {selectedAgent.skills.length > 4 && (
                          <span className="px-2 py-0.5 text-slate-500 text-xs">
                            +{selectedAgent.skills.length - 4} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Role Selection */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-3">
                  Assign Role
                </label>
                <div className="space-y-2">
                  {(Object.keys(roleLabels) as AgentRole[]).map((role) => (
                    <label
                      key={role}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                        selectedRole === role
                          ? 'bg-indigo-500/10 border-indigo-500/50'
                          : 'bg-slate-700/30 border-slate-700 hover:border-slate-600'
                      }`}
                    >
                      <input
                        type="radio"
                        name="role"
                        value={role}
                        checked={selectedRole === role}
                        onChange={() => setSelectedRole(role)}
                        className="mt-0.5 w-4 h-4 text-indigo-500 bg-slate-700 border-slate-600 focus:ring-indigo-500 focus:ring-offset-slate-800"
                      />
                      <div className="flex-1">
                        <span className={`font-medium ${
                          selectedRole === role ? 'text-indigo-400' : 'text-slate-200'
                        }`}>
                          {roleLabels[role]}
                        </span>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {roleDescriptions[role]}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-slate-300 hover:text-slate-100 hover:bg-slate-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!selectedAgentId || submitting}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Assigning...
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      Assign Agent
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
