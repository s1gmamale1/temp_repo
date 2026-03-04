import { useState, useEffect } from 'react';
import { 
  X, 
  Plus, 
  Calendar, 
  Clock, 
  Tag, 
  Paperclip, 
  AlertCircle,
  CheckCircle2,
  Loader2,
  ChevronDown,
  User,
  Briefcase,
  Flag
} from 'lucide-react';
import { tasksApi, projectsApi, agentsApi, type Agent } from '../../services/api';

interface TaskCreationModalProps {
  projectId?: string;
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

interface Project {
  id: string;
  name: string;
}

const PRIORITIES = [
  { value: 'low', label: 'Low', color: 'bg-slate-500', icon: Flag },
  { value: 'medium', label: 'Medium', color: 'bg-blue-500', icon: Flag },
  { value: 'high', label: 'High', color: 'bg-orange-500', icon: Flag },
  { value: 'urgent', label: 'Urgent', color: 'bg-red-500', icon: AlertCircle },
];

export default function TaskCreationModal({ 
  projectId: initialProjectId, 
  isOpen, 
  onClose, 
  onCreated 
}: TaskCreationModalProps) {
  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [dueDate, setDueDate] = useState('');
  const [estimatedHours, setEstimatedHours] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId || '');
  const [selectedAssigneeId, setSelectedAssigneeId] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  
  // Data state
  const [projects, setProjects] = useState<Project[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [projectAgents, setProjectAgents] = useState<Agent[]>([]);
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [showAssigneeDropdown, setShowAssigneeDropdown] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedProjectId) {
      fetchProjectAgents(selectedProjectId);
    } else {
      setProjectAgents([]);
    }
  }, [selectedProjectId]);

  const fetchData = async () => {
    try {
      setFetchingData(true);
      const [projectsRes, agentsRes] = await Promise.all([
        projectsApi.list(),
        agentsApi.list({ status: 'online' })
      ]);
      setProjects(projectsRes.projects || []);
      setAgents(agentsRes.agents || []);
    } catch (err: any) {
      setError('Failed to load data: ' + err.message);
    } finally {
      setFetchingData(false);
    }
  };

  const fetchProjectAgents = async (pid: string) => {
    try {
      const res = await projectsApi.get(pid);
      // Get agents assigned to this project
      const projectAgentIds = res.agents?.map((a: any) => a.id) || [];
      const filteredAgents = agents.filter(a => projectAgentIds.includes(a.id));
      setProjectAgents(filteredAgents);
    } catch (err) {
      setProjectAgents([]);
    }
  };

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      if (!tags.includes(tagInput.trim())) {
        setTags([...tags, tagInput.trim()]);
      }
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setAttachments([...attachments, ...Array.from(e.target.files)]);
    }
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachments(attachments.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    if (!selectedProjectId) {
      setError('Please select a project');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const taskData: any = {
        title: title.trim(),
        description: description.trim(),
        priority,
        due_date: dueDate || undefined,
        estimated_hours: estimatedHours ? parseInt(estimatedHours) : undefined,
        tags: tags.length > 0 ? tags : undefined,
      };

      // Create task first
      const response = await tasksApi.create(selectedProjectId, taskData);
      
      // If assignee selected, assign the task
      if (selectedAssigneeId && response.task?.id) {
        await tasksApi.assign(response.task.id, selectedAssigneeId);
      }

      // Reset form
      resetForm();
      
      // Notify parent
      onCreated?.();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create task');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setPriority('medium');
    setDueDate('');
    setEstimatedHours('');
    setTags([]);
    setTagInput('');
    setSelectedAssigneeId('');
    setAttachments([]);
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const selectedPriority = PRIORITIES.find(p => p.value === priority);
  const PriorityIcon = selectedPriority?.icon || Flag;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary to-purple-600 rounded-lg flex items-center justify-center">
              <Plus className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-50">Create New Task</h2>
              <p className="text-sm text-slate-400">Add a task to your project</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Project Selection */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-300">
              Project <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowProjectDropdown(!showProjectDropdown)}
                disabled={!!initialProjectId || fetchingData}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-slate-400" />
                  <span>
                    {selectedProjectId 
                      ? projects.find(p => p.id === selectedProjectId)?.name || 'Select Project'
                      : 'Select a project...'
                    }
                  </span>
                </div>
                {!initialProjectId && <ChevronDown className="w-4 h-4 text-slate-400" />}
              </button>
              
              {showProjectDropdown && !initialProjectId && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-10 max-h-48 overflow-y-auto">
                  {projects.map(project => (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => {
                        setSelectedProjectId(project.id);
                        setShowProjectDropdown(false);
                        setSelectedAssigneeId(''); // Reset assignee when project changes
                      }}
                      className="w-full px-4 py-2 text-left text-slate-200 hover:bg-slate-800 flex items-center gap-2"
                    >
                      {selectedProjectId === project.id && (
                        <CheckCircle2 className="w-4 h-4 text-primary" />
                      )}
                      <span className={selectedProjectId === project.id ? 'ml-0' : 'ml-6'}>
                        {project.name}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-300">
              Task Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter a clear, actionable title..."
              className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50"
              disabled={loading}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-300">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the task requirements, acceptance criteria, and any relevant details..."
              rows={4}
              className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              disabled={loading}
            />
          </div>

          {/* Priority & Due Date Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Priority */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-300">
                Priority
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowPriorityDropdown(!showPriorityDropdown)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <div className="flex items-center gap-2">
                    <PriorityIcon className={`w-4 h-4 ${selectedPriority?.color.replace('bg-', 'text-')}`} />
                    <span>{selectedPriority?.label}</span>
                  </div>
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                </button>
                
                {showPriorityDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-10">
                    {PRIORITIES.map(p => {
                      const Icon = p.icon;
                      return (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => {
                            setPriority(p.value as any);
                            setShowPriorityDropdown(false);
                          }}
                          className="w-full px-4 py-2 text-left text-slate-200 hover:bg-slate-800 flex items-center gap-2"
                        >
                          <Icon className={`w-4 h-4 ${p.color.replace('bg-', 'text-')}`} />
                          <span>{p.label}</span>
                          {priority === p.value && (
                            <CheckCircle2 className="w-4 h-4 text-primary ml-auto" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Due Date */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-300">
                Due Date
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="datetime-local"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/50 [color-scheme:dark]"
                  disabled={loading}
                />
              </div>
            </div>
          </div>

          {/* Estimated Hours & Assignee Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Estimated Hours */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-300">
                Estimated Hours
              </label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={estimatedHours}
                  onChange={(e) => setEstimatedHours(e.target.value)}
                  placeholder="e.g., 8"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  disabled={loading}
                />
              </div>
            </div>

            {/* Assignee */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-300">
                Assign To
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowAssigneeDropdown(!showAssigneeDropdown)}
                  disabled={!selectedProjectId}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-slate-400" />
                    <span>
                      {selectedAssigneeId 
                        ? (projectAgents.find(a => a.id === selectedAssigneeId)?.name || agents.find(a => a.id === selectedAssigneeId)?.name || 'Select Agent')
                        : 'Unassigned'
                      }
                    </span>
                  </div>
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                </button>
                
                {showAssigneeDropdown && selectedProjectId && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-10 max-h-48 overflow-y-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedAssigneeId('');
                        setShowAssigneeDropdown(false);
                      }}
                      className="w-full px-4 py-2 text-left text-slate-200 hover:bg-slate-800 flex items-center gap-2"
                    >
                      <span className="text-slate-400">Unassigned</span>
                      {!selectedAssigneeId && (
                        <CheckCircle2 className="w-4 h-4 text-primary ml-auto" />
                      )}
                    </button>
                    {projectAgents.map(agent => (
                      <button
                        key={agent.id}
                        type="button"
                        onClick={() => {
                          setSelectedAssigneeId(agent.id);
                          setShowAssigneeDropdown(false);
                        }}
                        className="w-full px-4 py-2 text-left text-slate-200 hover:bg-slate-800 flex items-center gap-2"
                      >
                        <div className="w-6 h-6 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center">
                          <span className="text-xs font-medium text-white">
                            {agent.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <span>{agent.name}</span>
                        {selectedAssigneeId === agent.id && (
                          <CheckCircle2 className="w-4 h-4 text-primary ml-auto" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selectedProjectId && projectAgents.length === 0 && (
                <p className="text-xs text-amber-400">
                  No agents assigned to this project yet.
                </p>
              )}
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-300">
              Tags
            </label>
            <div className="relative">
              <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleAddTag}
                placeholder="Type and press Enter to add tags..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50"
                disabled={loading}
              />
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {tags.map((tag, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-slate-700 text-slate-200 text-sm rounded-full"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="p-0.5 hover:bg-slate-600 rounded-full transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Attachments */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-300">
              Attachments
            </label>
            <div className="relative">
              <input
                type="file"
                onChange={handleFileSelect}
                multiple
                className="hidden"
                id="task-attachments"
                disabled={loading}
              />
              <label
                htmlFor="task-attachments"
                className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-slate-700 rounded-lg text-slate-400 hover:text-slate-300 hover:border-slate-500 cursor-pointer transition-colors"
              >
                <Paperclip className="w-4 h-4" />
                <span>Click to upload files or drag and drop</span>
              </label>
            </div>
            {attachments.length > 0 && (
              <div className="space-y-2 mt-2">
                {attachments.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg"
                  >
                    <div className="flex items-center gap-2 text-sm text-slate-300">
                      <Paperclip className="w-4 h-4 text-slate-400" />
                      <span className="truncate max-w-[200px]">{file.name}</span>
                      <span className="text-slate-500">({(file.size / 1024).toFixed(1)} KB)</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveAttachment(index)}
                      className="p-1 text-slate-400 hover:text-red-400 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-700 bg-slate-800/50">
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            className="px-4 py-2 text-slate-300 hover:text-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={loading || !title.trim() || !selectedProjectId}
            className="flex items-center gap-2 px-6 py-2 bg-primary hover:bg-primary/90 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium rounded-lg transition-colors"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Create Task
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
