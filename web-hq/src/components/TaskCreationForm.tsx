import { useState, useEffect } from 'react';
import { X, AlertCircle, Calendar, Clock, Tag, Users, Loader2, Plus, X as XIcon } from 'lucide-react';
import { tasksApi, agentsApi, type Agent } from '../services/api';

interface TaskCreationFormProps {
  projectId: string;
  projectName: string;
  onClose: () => void;
  onCreated: () => void;
}

const COMMON_LABELS = [
  'bug', 'feature', 'frontend', 'backend', 'api', 'ui', 'ux', 
  'docs', 'testing', 'security', 'performance', 'refactor'
];

export default function TaskCreationForm({ projectId, projectName, onClose, onCreated }: TaskCreationFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [dueDate, setDueDate] = useState('');
  const [estimatedHours, setEstimatedHours] = useState('');
  const [labels, setLabels] = useState<string[]>([]);
  const [customLabel, setCustomLabel] = useState('');
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load available agents on mount
  useEffect(() => {
    loadAgents();
  }, []);

  const loadAgents = async () => {
    try {
      setLoadingAgents(true);
      const response = await agentsApi.list({ status: 'online' });
      setAgents(response.agents || []);
    } catch (err) {
      console.error('Failed to load agents:', err);
    } finally {
      setLoadingAgents(false);
    }
  };

  const toggleLabel = (label: string) => {
    setLabels(prev => 
      prev.includes(label) 
        ? prev.filter(l => l !== label)
        : [...prev, label]
    );
  };

  const addCustomLabel = () => {
    if (customLabel.trim() && !labels.includes(customLabel.trim())) {
      setLabels([...labels, customLabel.trim()]);
      setCustomLabel('');
    }
  };

  const removeLabel = (label: string) => {
    setLabels(prev => prev.filter(l => l !== label));
  };

  const toggleAssignee = (agentId: string) => {
    setSelectedAssignees(prev => 
      prev.includes(agentId)
        ? prev.filter(id => id !== agentId)
        : [...prev, agentId]
    );
  };

  const priorityOptions = [
    { value: 'low', label: 'Low', color: 'bg-slate-500/20 text-slate-400 border-slate-500/30' },
    { value: 'medium', label: 'Medium', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
    { value: 'high', label: 'High', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
    { value: 'critical', label: 'Critical', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) {
      setError('Task title is required');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const taskData: {
        title: string;
        description?: string;
        priority: string;
        due_date?: string;
        estimated_hours?: number;
        labels?: string[];
        assignee_ids?: string[];
      } = {
        title: title.trim(),
        description: description.trim(),
        priority,
      };

      if (dueDate) {
        taskData.due_date = new Date(dueDate).toISOString();
      }
      if (estimatedHours) {
        taskData.estimated_hours = parseInt(estimatedHours);
      }
      if (labels.length > 0) {
        taskData.labels = labels;
      }
      if (selectedAssignees.length > 0) {
        taskData.assignee_ids = selectedAssignees;
      }

      await tasksApi.create(projectId, taskData);
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create task');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div>
            <h2 className="text-lg font-semibold text-slate-50">Create New Task</h2>
            <p className="text-sm text-slate-400">in {projectName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Task Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Implement authentication middleware"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
              disabled={loading}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what needs to be done..."
              rows={4}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary resize-none"
              disabled={loading}
            />
          </div>

          {/* Priority */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Priority
            </label>
            <div className="grid grid-cols-4 gap-2">
              {priorityOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setPriority(option.value as typeof priority)}
                  className={`px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                    priority === option.value
                      ? option.color + ' ring-2 ring-offset-1 ring-offset-slate-800 ring-current'
                      : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:bg-slate-700'
                  }`}
                  disabled={loading}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Due Date & Estimated Hours */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  Due Date
                </span>
              </label>
              <input
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  Est. Hours
                </span>
              </label>
              <input
                type="number"
                min="1"
                value={estimatedHours}
                onChange={(e) => setEstimatedHours(e.target.value)}
                placeholder="8"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                disabled={loading}
              />
            </div>
          </div>

          {/* Labels */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              <span className="flex items-center gap-1">
                <Tag className="w-4 h-4" />
                Labels
              </span>
            </label>
            
            {/* Common Labels */}
            <div className="flex flex-wrap gap-2 mb-3">
              {COMMON_LABELS.map((label) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => toggleLabel(label)}
                  className={`px-2 py-1 text-xs font-medium rounded-full border transition-all ${
                    labels.includes(label)
                      ? 'bg-primary/20 text-primary border-primary/50'
                      : 'bg-slate-700/50 text-slate-400 border-slate-600 hover:bg-slate-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Custom Label Input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCustomLabel();
                  }
                }}
                placeholder="Add custom label..."
                className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-sm"
                disabled={loading}
              />
              <button
                type="button"
                onClick={addCustomLabel}
                disabled={!customLabel.trim()}
                className="px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-300 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Selected Labels */}
            {labels.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {labels.map((label) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary text-xs font-medium rounded-full border border-primary/30"
                  >
                    {label}
                    <button
                      type="button"
                      onClick={() => removeLabel(label)}
                      className="hover:text-red-400"
                    >
                      <XIcon className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Assignees */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              <span className="flex items-center gap-1">
                <Users className="w-4 h-4" />
                Assign To
              </span>
            </label>
            
            {loadingAgents ? (
              <div className="flex items-center gap-2 p-3 bg-slate-900 rounded-lg text-slate-500 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading agents...
              </div>
            ) : agents.length === 0 ? (
              <div className="p-3 bg-slate-900 rounded-lg text-slate-500 text-sm">
                No agents available
              </div>
            ) : (
              <div className="space-y-2 max-h-40 overflow-y-auto bg-slate-900 rounded-lg p-2 border border-slate-700">
                {agents.map((agent) => (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => toggleAssignee(agent.id)}
                    className={`w-full flex items-center gap-3 p-2 rounded-lg transition-all text-left ${
                      selectedAssignees.includes(agent.id)
                        ? 'bg-primary/10 border border-primary/30'
                        : 'hover:bg-slate-800'
                    }`}
                  >
                    <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center">
                      <span className="text-xs font-medium text-white">
                        {agent.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-200 text-sm">{agent.name}</p>
                      <p className="text-xs text-slate-500">@{agent.handle}</p>
                    </div>
                    {selectedAssignees.includes(agent.id) && (
                      <div className="w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                        <CheckCircle2 className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
            
            {selectedAssignees.length > 0 && (
              <p className="text-xs text-slate-500 mt-2">
                {selectedAssignees.length} agent{selectedAssignees.length !== 1 ? 's' : ''} selected
              </p>
            )}
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
              type="submit"
              disabled={loading || !title.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium rounded-lg transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Task'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
