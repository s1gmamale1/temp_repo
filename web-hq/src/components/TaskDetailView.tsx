import { useState, useEffect } from 'react';
import { 
  X, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  User, 
  Calendar, 
  Tag, 
  MessageSquare,
  Send,
  AlertCircle,
  Loader2,
  Bot,
  ArrowRight,
  CheckCheck,
  Reply,
  Users
} from 'lucide-react';
import { tasksApi, type Task, type TaskUpdate } from '../services/api';
import AssignmentReplyPanel from './AssignmentReplyPanel';
import { toast } from './Toast';

interface TaskDetailViewProps {
  task: Task;
  projectName: string;
  onClose: () => void;
  onUpdate: () => void;
  onAssign: () => void;
}

interface TaskReply {
  id: string;
  agent_id: string;
  agent_name: string;
  reply_type: 'ACCEPT' | 'REJECT' | 'CLARIFICATION' | 'DELEGATE';
  message?: string;
  rejection_reason?: string;
  delegate_to?: string;
  created_at: string;
}

export default function TaskDetailView({ task, projectName, onClose, onUpdate, onAssign }: TaskDetailViewProps) {
  const [updates, setUpdates] = useState<TaskUpdate[]>([]);
  const [replies, setReplies] = useState<TaskReply[]>([]);
  const [newUpdate, setNewUpdate] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [submittingUpdate, setSubmittingUpdate] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showReplyPanel, setShowReplyPanel] = useState(false);

  useEffect(() => {
    fetchUpdates();
    fetchReplies();
  }, [task.id]);

  const fetchUpdates = async () => {
    try {
      setLoading(true);
      const response = await tasksApi.getUpdates(task.id, { limit: 50 });
      setUpdates(response.updates || []);
    } catch (err: any) {
      console.error('Failed to load updates:', err);
      toast.error('Task', 'Failed to load task updates');
    } finally {
      setLoading(false);
    }
  };

  const fetchReplies = async () => {
    try {
      setLoadingReplies(true);
      const token = localStorage.getItem('claw_token');
      const response = await fetch(`/api/tasks/${task.id}/replies`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setReplies(data.replies || []);
      }
    } catch (err) {
      console.error('Failed to load replies:', err);
      toast.error('Task', 'Failed to load replies');
    } finally {
      setLoadingReplies(false);
    }
  };

  const handleAddUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUpdate.trim()) return;

    try {
      setSubmittingUpdate(true);
      setError(null);
      await tasksApi.addUpdate(task.id, newUpdate.trim());
      setNewUpdate('');
      await fetchUpdates();
      onUpdate();
    } catch (err: any) {
      setError(err.message || 'Failed to post update');
    } finally {
      setSubmittingUpdate(false);
    }
  };

  const handleAccept = async () => {
    try {
      setActionLoading('accept');
      setError(null);
      await tasksApi.accept(task.id);
      onUpdate();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to accept task');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDecline = async () => {
    const reason = prompt('Please provide a reason for declining:');
    if (reason === null) return; // Cancelled

    try {
      setActionLoading('decline');
      setError(null);
      await tasksApi.decline(task.id, reason || undefined);
      onUpdate();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to decline task');
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusConfig = (status: Task['status']) => {
    switch (status) {
      case 'pending':
        return { color: 'text-yellow-400', bg: 'bg-yellow-500/20', icon: Clock };
      case 'running':
        return { color: 'text-indigo-400', bg: 'bg-indigo-500/20', icon: Loader2 };
      case 'completed':
        return { color: 'text-green-400', bg: 'bg-green-500/20', icon: CheckCircle2 };
      case 'failed':
        return { color: 'text-orange-400', bg: 'bg-orange-500/20', icon: XCircle };
      case 'cancelled':
        return { color: 'text-red-400', bg: 'bg-red-500/20', icon: XCircle };
      default:
        return { color: 'text-slate-400', bg: 'bg-slate-500/20', icon: Clock };
    }
  };

  const getPriorityColor = (priority: Task['priority']) => {
    switch (priority) {
      case 'critical': return 'text-red-400 bg-red-500/20 border-red-500/30';
      case 'high': return 'text-orange-400 bg-orange-500/20 border-orange-500/30';
      case 'medium': return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30';
      case 'low': return 'text-slate-400 bg-slate-500/20 border-slate-500/30';
      default: return 'text-slate-400 bg-slate-500/20';
    }
  };

  const statusConfig = getStatusConfig(task.status);
  const StatusIcon = statusConfig.icon;
  const canPostUpdate = ['pending', 'running'].includes(task.status);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const getReplyTypeConfig = (replyType: TaskReply['reply_type']) => {
    switch (replyType) {
      case 'ACCEPT':
        return { color: 'text-green-400 bg-green-500/20 border-green-500/30', icon: CheckCircle2, label: 'Accepted' };
      case 'REJECT':
        return { color: 'text-red-400 bg-red-500/20 border-red-500/30', icon: XCircle, label: 'Declined' };
      case 'CLARIFICATION':
        return { color: 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30', icon: MessageSquare, label: 'Needs Clarification' };
      case 'DELEGATE':
        return { color: 'text-blue-400 bg-blue-500/20 border-blue-500/30', icon: Reply, label: 'Delegated' };
      default:
        return { color: 'text-slate-400 bg-slate-500/20', icon: MessageSquare, label: replyType };
    }
  };

  // Check if current agent can reply (if they're assigned and pending)
  const currentAgentId = localStorage.getItem('claw_agent_id');
  const canReply = task.status === 'pending' && task.assigned_agent?.id === currentAgentId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-slate-700">
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center gap-2 mb-1">
              <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${getPriorityColor(task.priority)}`}>
                {task.priority.toUpperCase()}
              </span>
              <span className={`flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${statusConfig.bg} ${statusConfig.color}`}>
                <StatusIcon className={`w-3 h-3 ${task.status === 'running' ? 'animate-spin' : ''}`} />
                {task.status.replace('_', ' ')}
              </span>
            </div>
            <h2 className="text-xl font-semibold text-slate-50">{task.title}</h2>
            <p className="text-sm text-slate-400">{projectName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          {/* Task Info */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2 text-slate-400">
              <Calendar className="w-4 h-4" />
              <span>Created: {formatDate(task.created_at)}</span>
            </div>
            {task.due_date && (
              <div className="flex items-center gap-2 text-slate-400">
                <Clock className="w-4 h-4" />
                <span>Due: {formatDate(task.due_date)}</span>
              </div>
            )}
            {task.estimated_hours && (
              <div className="flex items-center gap-2 text-slate-400">
                <Clock className="w-4 h-4" />
                <span>Est: {task.estimated_hours} hours</span>
              </div>
            )}
          </div>

          {/* Description */}
          {task.description && (
            <div className="p-3 bg-slate-700/30 rounded-lg">
              <h3 className="text-sm font-medium text-slate-300 mb-2">Description</h3>
              <p className="text-slate-400 text-sm whitespace-pre-wrap">{task.description}</p>
            </div>
          )}

          {/* Labels/Tags */}
          {((task.labels?.length ?? 0) + (task.tags?.length ?? 0)) > 0 && (
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-slate-500" />
              <div className="flex flex-wrap gap-1">
                {(task.labels || task.tags || []).map((label, i) => (
                  <span key={i} className="px-2 py-0.5 bg-slate-700 rounded text-xs text-slate-300">
                    {label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Assigned Agents */}
          {task.assigned_agent ? (
            <div className="p-3 bg-indigo-500/10 border border-indigo-500/30 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-indigo-400" />
                <span className="text-sm font-medium text-indigo-300">Assigned To</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center">
                  <span className="text-sm font-medium text-white">
                    {task.assigned_agent.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="font-medium text-slate-200">{task.assigned_agent.name}</p>
                  <p className="text-sm text-indigo-400">Primary Assignee</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3 bg-slate-700/30 rounded-lg">
              <div className="w-10 h-10 bg-slate-600 rounded-full flex items-center justify-center">
                <User className="w-5 h-5 text-slate-400" />
              </div>
              <div className="flex-1">
                <p className="text-slate-400">No agent assigned</p>
              </div>
              <button
                onClick={onAssign}
                className="flex items-center gap-1 px-3 py-1.5 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Bot className="w-4 h-4" />
                Assign
              </button>
            </div>
          )}

          {/* Assignment Reply Panel */}
          {canReply && showReplyPanel && (
            <AssignmentReplyPanel
              taskId={task.id}
              taskTitle={task.title}
              currentAgentId={currentAgentId || undefined}
              onReplySubmitted={() => {
                fetchReplies();
                onUpdate();
                setShowReplyPanel(false);
              }}
              onCancel={() => setShowReplyPanel(false)}
            />
          )}

          {/* Reply Button (if can reply but panel not shown) */}
          {canReply && !showReplyPanel && (
            <button
              onClick={() => setShowReplyPanel(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/30 rounded-lg text-yellow-400 font-medium transition-colors"
            >
              <Reply className="w-4 h-4" />
              Respond to Assignment
            </button>
          )}

          {/* Task Replies History */}
          {replies.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2">
                <Reply className="w-4 h-4" />
                Assignment Responses
              </h3>
              <div className="space-y-2">
                {replies.map((reply) => {
                  const config = getReplyTypeConfig(reply.reply_type);
                  const Icon = config.icon;
                  return (
                    <div key={reply.id} className={`p-3 rounded-lg border ${config.color}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className="w-4 h-4" />
                        <span className="font-medium text-sm">{config.label}</span>
                        <span className="text-xs opacity-70">by {reply.agent_name}</span>
                        <span className="text-xs opacity-50 ml-auto">{formatDate(reply.created_at)}</span>
                      </div>
                      {reply.message && (
                        <p className="text-sm opacity-90">{reply.message}</p>
                      )}
                      {reply.rejection_reason && (
                        <p className="text-sm opacity-90 mt-1">
                          <span className="font-medium">Reason:</span> {reply.rejection_reason}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Updates Timeline */}
          <div>
            <h3 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Updates & Comments
            </h3>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
              </div>
            ) : updates.length === 0 ? (
              <div className="text-center py-6 bg-slate-700/30 rounded-lg">
                <MessageSquare className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                <p className="text-slate-400 text-sm">No updates yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {updates.map((update) => (
                  <div key={update.id} className="flex gap-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-slate-600 to-slate-700 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-medium text-white">
                        {update.agent_name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-slate-300 text-sm">{update.agent_name}</span>
                        <span className="text-xs text-slate-500">{formatDate(update.created_at)}</span>
                        {update.update_type !== 'progress' && (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            update.update_type === 'question' ? 'bg-yellow-500/20 text-yellow-400' :
                            update.update_type === 'blocker' ? 'bg-red-500/20 text-red-400' :
                            update.update_type === 'completion' ? 'bg-green-500/20 text-green-400' :
                            'bg-slate-600 text-slate-300'
                          }`}>
                            {update.update_type}
                          </span>
                        )}
                      </div>
                      <p className="text-slate-400 text-sm whitespace-pre-wrap">{update.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer - Add Update */}
        {canPostUpdate && (
          <div className="p-4 border-t border-slate-700">
            <form onSubmit={handleAddUpdate} className="flex gap-2">
              <input
                type="text"
                value={newUpdate}
                onChange={(e) => setNewUpdate(e.target.value)}
                placeholder="Add an update..."
                className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                disabled={submittingUpdate}
              />
              <button
                type="submit"
                disabled={submittingUpdate || !newUpdate.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium rounded-lg transition-colors"
              >
                {submittingUpdate ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Post
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
