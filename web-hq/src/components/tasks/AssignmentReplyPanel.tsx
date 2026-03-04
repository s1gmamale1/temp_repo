import { useState } from 'react';
import { 
  CheckCircle2, 
  XCircle, 
  HelpCircle, 
  Users,
  Send,
  Loader2,
  MessageSquare,
  AlertCircle,
  Bot
} from 'lucide-react';
import { tasksApi } from '../../services/api';

type ReplyAction = 'ACCEPT' | 'REJECT' | 'CLARIFICATION' | 'DELEGATE';

interface AssignmentReplyPanelProps {
  taskId: string;
  taskTitle: string;
  onReplied?: (action: ReplyAction, message?: string) => void;
  className?: string;
}

interface ActionConfig {
  id: ReplyAction;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  borderColor: string;
  hoverBg: string;
  placeholder: string;
  showComment: boolean;
}

const ACTIONS: ActionConfig[] = [
  {
    id: 'ACCEPT',
    label: 'ACCEPT',
    description: 'Take ownership of this task',
    icon: CheckCircle2,
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
    hoverBg: 'hover:bg-green-500/20',
    placeholder: 'Add a message about your approach (optional)...',
    showComment: true
  },
  {
    id: 'REJECT',
    label: 'REJECT',
    description: 'Decline this assignment',
    icon: XCircle,
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
    hoverBg: 'hover:bg-red-500/20',
    placeholder: 'Reason for declining (optional but recommended)...',
    showComment: true
  },
  {
    id: 'CLARIFICATION',
    label: 'CLARIFICATION',
    description: 'Ask for more information',
    icon: HelpCircle,
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/30',
    hoverBg: 'hover:bg-yellow-500/20',
    placeholder: 'What information do you need?',
    showComment: true
  },
  {
    id: 'DELEGATE',
    label: 'DELEGATE',
    description: 'Suggest another agent',
    icon: Users,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    hoverBg: 'hover:bg-blue-500/20',
    placeholder: 'Suggest who should handle this instead...',
    showComment: true
  }
];

export default function AssignmentReplyPanel({ 
  taskId, 
  taskTitle,
  onReplied,
  className = '' 
}: AssignmentReplyPanelProps) {
  const [selectedAction, setSelectedAction] = useState<ReplyAction | null>(null);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleActionSelect = (action: ReplyAction) => {
    setSelectedAction(action);
    setError(null);
    setSuccess(null);
    // Clear comment when switching actions unless it's the same action
    if (selectedAction !== action) {
      setComment('');
    }
  };

  const handleSubmit = async () => {
    if (!selectedAction) return;

    try {
      setLoading(true);
      setError(null);

      switch (selectedAction) {
        case 'ACCEPT':
          await tasksApi.accept(taskId, comment.trim() || undefined);
          setSuccess('Task accepted successfully!');
          break;
        case 'REJECT':
          await tasksApi.decline(taskId, comment.trim() || undefined);
          setSuccess('Task declined. Reason recorded.');
          break;
        case 'CLARIFICATION':
          // For clarification, we add a comment/update
          await tasksApi.addUpdate(taskId, comment.trim(), 'question', true);
          setSuccess('Clarification request sent.');
          break;
        case 'DELEGATE':
          // For delegate, we add a suggestion comment
          await tasksApi.addUpdate(taskId, `DELEGATION SUGGESTION: ${comment.trim()}`, 'system', true);
          setSuccess('Delegation suggestion recorded.');
          break;
      }

      onReplied?.(selectedAction, comment.trim() || undefined);
      
      // Reset after success
      setTimeout(() => {
        setSelectedAction(null);
        setComment('');
        setSuccess(null);
      }, 2000);
    } catch (err: any) {
      setError(err.message || `Failed to ${selectedAction.toLowerCase()} task`);
    } finally {
      setLoading(false);
    }
  };

  const selectedConfig = ACTIONS.find(a => a.id === selectedAction);

  return (
    <div className={`bg-slate-800 border border-slate-700 rounded-xl overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700 bg-slate-800/50">
        <div className="w-8 h-8 bg-gradient-to-br from-primary to-purple-600 rounded-lg flex items-center justify-center">
          <Bot className="w-4 h-4 text-white" />
        </div>
        <div>
          <h3 className="font-medium text-slate-200">Assignment Response</h3>
          <p className="text-xs text-slate-400 truncate max-w-[250px]">{taskTitle}</p>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Error/Success Messages */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-green-400 text-sm">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            {success}
          </div>
        )}

        {/* Action Buttons Grid */}
        <div className="grid grid-cols-2 gap-2">
          {ACTIONS.map((action) => {
            const Icon = action.icon;
            const isSelected = selectedAction === action.id;
            
            return (
              <button
                key={action.id}
                onClick={() => handleActionSelect(action.id)}
                disabled={loading || !!success}
                className={`
                  flex flex-col items-center gap-2 p-3 rounded-lg border transition-all
                  ${isSelected 
                    ? `${action.bgColor} ${action.borderColor} ring-1 ring-offset-1 ring-offset-slate-800 ${action.color.replace('text-', 'ring-')}` 
                    : 'bg-slate-700/30 border-slate-700 hover:bg-slate-700/50'
                  }
                  ${loading || success ? 'opacity-50 cursor-not-allowed' : ''}
                `}
              >
                <Icon className={`w-6 h-6 ${isSelected ? action.color : 'text-slate-400'}`} />
                <div className="text-center">
                  <span className={`block text-sm font-semibold ${isSelected ? action.color : 'text-slate-300'}`}>
                    {action.label}
                  </span>
                  <span className="text-xs text-slate-500">
                    {action.description}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Comment Input (shown when action selected) */}
        {selectedAction && selectedConfig?.showComment && (
          <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-300">
              <MessageSquare className="w-4 h-4 text-slate-400" />
              Comment {selectedAction === 'CLARIFICATION' && <span className="text-red-400">*</span>}
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={selectedConfig.placeholder}
              rows={3}
              disabled={loading || !!success}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none text-sm"
            />
            
            {/* Character count */}
            <div className="flex justify-end">
              <span className={`text-xs ${comment.length > 500 ? 'text-red-400' : 'text-slate-500'}`}>
                {comment.length}/1000
              </span>
            </div>
          </div>
        )}

        {/* Submit Button */}
        {selectedAction && (
          <button
            onClick={handleSubmit}
            disabled={loading || !!success || (selectedAction === 'CLARIFICATION' && !comment.trim())}
            className={`
              w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all
              ${selectedConfig 
                ? `${selectedConfig.bgColor} ${selectedConfig.color} ${selectedConfig.borderColor} ${selectedConfig.hoverBg} border` 
                : 'bg-primary text-white hover:bg-primary/90'
              }
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing...
              </>
            ) : success ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Done!
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                {selectedConfig?.label} Task
              </>
            )}
          </button>
        )}

        {/* Helper Text */}
        {!selectedAction && (
          <div className="text-center text-sm text-slate-500">
            Select an action above to respond to this assignment
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="px-4 py-2 bg-slate-900/50 border-t border-slate-700">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Task ID: {taskId.slice(0, 8)}...</span>
          <span>Your response will be recorded</span>
        </div>
      </div>
    </div>
  );
}
