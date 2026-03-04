import { useState } from 'react';
import { 
  CheckCircle2, 
  XCircle, 
  HelpCircle, 
  Users,
  Send,
  Loader2,
  AlertCircle,
  MessageSquare
} from 'lucide-react';
import { tasksApi, agentsApi, type Agent } from '../services/api';

export type ReplyType = 'ACCEPT' | 'REJECT' | 'CLARIFICATION' | 'DELEGATE';

interface AssignmentReplyPanelProps {
  taskId: string;
  taskTitle: string;
  currentAgentId?: string;
  onReplySubmitted: () => void;
  onCancel?: () => void;
}

interface ReplyOption {
  type: ReplyType;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  borderColor: string;
}

const REPLY_OPTIONS: ReplyOption[] = [
  {
    type: 'ACCEPT',
    label: 'Accept Task',
    description: 'I\'ll take this on and start working on it',
    icon: CheckCircle2,
    color: 'text-green-400',
    bgColor: 'bg-green-500/20',
    borderColor: 'border-green-500/30',
  },
  {
    type: 'REJECT',
    label: 'Decline',
    description: 'I can\'t take this task right now',
    icon: XCircle,
    color: 'text-red-400',
    bgColor: 'bg-red-500/20',
    borderColor: 'border-red-500/30',
  },
  {
    type: 'CLARIFICATION',
    label: 'Need Clarification',
    description: 'I have questions before I can accept',
    icon: HelpCircle,
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/20',
    borderColor: 'border-yellow-500/30',
  },
  {
    type: 'DELEGATE',
    label: 'Delegate',
    description: 'Pass this to another agent who\'s better suited',
    icon: Users,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
    borderColor: 'border-blue-500/30',
  },
];

export default function AssignmentReplyPanel({ 
  taskId, 
  taskTitle,
  currentAgentId,
  onReplySubmitted,
  onCancel 
}: AssignmentReplyPanelProps) {
  const [selectedType, setSelectedType] = useState<ReplyType | null>(null);
  const [message, setMessage] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [delegateTo, setDelegateTo] = useState('');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedOption = REPLY_OPTIONS.find(o => o.type === selectedType);

  const handleTypeSelect = async (type: ReplyType) => {
    setSelectedType(type);
    setError(null);

    // Load agents if delegating
    if (type === 'DELEGATE') {
      setLoadingAgents(true);
      try {
        const response = await agentsApi.list({ status: 'online' });
        // Filter out current agent
        setAgents((response.agents || []).filter((a: Agent) => a.id !== currentAgentId));
      } catch (err) {
        console.error('Failed to load agents:', err);
      } finally {
        setLoadingAgents(false);
      }
    }
  };

  const handleSubmit = async () => {
    if (!selectedType) {
      setError('Please select a response type');
      return;
    }

    // Validation based on type
    if (selectedType === 'REJECT' && !rejectionReason.trim()) {
      setError('Please provide a reason for declining');
      return;
    }

    if (selectedType === 'DELEGATE' && !delegateTo) {
      setError('Please select an agent to delegate to');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const replyData: {
        reply_type: ReplyType;
        message?: string;
        rejection_reason?: string;
        delegate_to?: string;
      } = {
        reply_type: selectedType,
      };

      if (message.trim()) {
        replyData.message = message.trim();
      }

      if (selectedType === 'REJECT' && rejectionReason.trim()) {
        replyData.rejection_reason = rejectionReason.trim();
      }

      if (selectedType === 'DELEGATE' && delegateTo) {
        replyData.delegate_to = delegateTo;
      }

      // Note: This endpoint needs to be implemented by Donatello
      const token = localStorage.getItem('claw_token');
      const response = await fetch(`/api/tasks/${taskId}/reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(replyData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to submit reply' }));
        throw new Error(errorData.error || 'Failed to submit reply');
      }

      onReplySubmitted();
    } catch (err: any) {
      setError(err.message || 'Failed to submit reply');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="w-5 h-5 text-indigo-400" />
        <h3 className="font-semibold text-slate-200">Respond to Assignment</h3>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Reply Type Selection */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {REPLY_OPTIONS.map((option) => {
          const Icon = option.icon;
          const isSelected = selectedType === option.type;
          
          return (
            <button
              key={option.type}
              onClick={() => handleTypeSelect(option.type)}
              className={`
                flex items-start gap-3 p-3 rounded-lg border text-left transition-all
                ${isSelected 
                  ? `${option.bgColor} ${option.borderColor} ring-2 ring-offset-1 ring-offset-slate-800 ring-current` 
                  : 'bg-slate-700/30 border-slate-700 hover:bg-slate-700/50'
                }
              `}
            >
              <div className={`p-2 rounded-lg ${isSelected ? option.bgColor : 'bg-slate-700'}`}>
                <Icon className={`w-5 h-5 ${isSelected ? option.color : 'text-slate-400'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`font-medium text-sm ${isSelected ? 'text-slate-200' : 'text-slate-300'}`}>
                  {option.label}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {option.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Dynamic Form Fields based on selection */}
      {selectedType && (
        <div className="space-y-4 pt-4 border-t border-slate-700">
          {/* Rejection Reason */}
          {selectedType === 'REJECT' && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Reason for Declining <span className="text-red-400">*</span>
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Explain why you can't take this task..."
                rows={3}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary resize-none text-sm"
              />
            </div>
          )}

          {/* Delegate Selection */}
          {selectedType === 'DELEGATE' && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Delegate To <span className="text-red-400">*</span>
              </label>
              {loadingAgents ? (
                <div className="flex items-center gap-2 p-3 bg-slate-900 rounded-lg text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading agents...
                </div>
              ) : agents.length === 0 ? (
                <div className="p-3 bg-slate-900 rounded-lg text-slate-500 text-sm">
                  No other agents available
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {agents.map((agent) => (
                    <button
                      key={agent.id}
                      onClick={() => setDelegateTo(agent.id)}
                      className={`
                        w-full flex items-center gap-3 p-2 rounded-lg border text-left transition-all
                        ${delegateTo === agent.id
                          ? 'bg-primary/10 border-primary/50'
                          : 'bg-slate-900 border-slate-700 hover:bg-slate-800'
                        }
                      `}
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
                      {delegateTo === agent.id && (
                        <CheckCircle2 className="w-4 h-4 text-primary" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Message (optional for all types) */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Message (optional)
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                selectedType === 'ACCEPT' ? "Add any notes about your approach..." :
                selectedType === 'CLARIFICATION' ? "What do you need to know?" :
                "Add an optional message..."
              }
              rows={3}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary resize-none text-sm"
            />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-700">
        {onCancel && (
          <button
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-2 text-slate-300 hover:text-slate-100 transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          onClick={handleSubmit}
          disabled={submitting || !selectedType}
          className={`
            flex items-center gap-2 px-4 py-2 font-medium rounded-lg transition-colors
            ${selectedOption 
              ? `${selectedOption.bgColor} ${selectedOption.color} hover:brightness-110` 
              : 'bg-slate-700 text-slate-500'
            }
            disabled:opacity-50 disabled:cursor-not-allowed
          `}
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              {selectedOption ? selectedOption.label : 'Select Response'}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
