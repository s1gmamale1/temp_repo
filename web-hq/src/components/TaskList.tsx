import { useState, useEffect } from 'react';
import { 
  Plus, 
  Filter, 
  Search, 
  AlertCircle, 
  Clock, 
  CheckCircle2, 
  Circle, 
  User, 
  Calendar,
  ArrowUpCircle,
  ArrowRight,
  MoreVertical,
  Loader2
} from 'lucide-react';
import { tasksApi, type Task } from '../services/api';
import TaskCreationForm from './TaskCreationForm';
import TaskAssignmentDialog from './TaskAssignmentDialog';
import TaskDetailView from './TaskDetailView';

interface TaskListProps {
  projectId: string;
  projectName: string;
}

export default function TaskList({ projectId, projectName }: TaskListProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterPriority, setFilterPriority] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [assigningTask, setAssigningTask] = useState<Task | null>(null);
  const [viewingTask, setViewingTask] = useState<Task | null>(null);

  useEffect(() => {
    fetchTasks();
  }, [projectId, filterStatus, filterPriority]);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params: { status?: string; priority?: string } = {};
      if (filterStatus) params.status = filterStatus;
      if (filterPriority) params.priority = filterPriority;

      const response = await tasksApi.list(projectId, params);
      setTasks(response.tasks || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: Task['status']) => {
    switch (status) {
      case 'pending':
        return { icon: Clock, class: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', label: 'Pending' };
      case 'running':
        return { icon: Loader2, class: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30', label: 'Running' };
      case 'completed':
        return { icon: CheckCircle2, class: 'bg-green-500/20 text-green-400 border-green-500/30', label: 'Completed' };
      case 'failed':
        return { icon: AlertCircle, class: 'bg-orange-500/20 text-orange-400 border-orange-500/30', label: 'Failed' };
      case 'cancelled':
        return { icon: AlertCircle, class: 'bg-red-500/20 text-red-400 border-red-500/30', label: 'Cancelled' };
      default:
        return { icon: Circle, class: 'bg-slate-500/20 text-slate-400', label: status };
    }
  };

  const getPriorityBadge = (priority: Task['priority']) => {
    switch (priority) {
      case 'critical':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'high':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'medium':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'low':
        return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
      default:
        return 'bg-slate-500/20 text-slate-400';
    }
  };

  const filteredTasks = tasks.filter(task => 
    searchQuery === '' || 
    task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    task.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (dateStr: string | undefined, status: Task['status']) => {
    if (!dateStr) return 'No due date';
    const date = new Date(dateStr);
    const now = new Date();
    const isOverdue = date < now && !['completed', 'cancelled'].includes(status);
    
    return (
      <span className={isOverdue ? 'text-red-400' : 'text-slate-400'}>
        {date.toLocaleDateString()}
        {isOverdue && ' (Overdue)'}
      </span>
    );
  };

  return (
    <>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-50">Tasks</h2>
            <p className="text-sm text-slate-400">
              {tasks.length} total • {tasks.filter(t => t.status === 'running').length} running
            </p>
          </div>
          <button
            onClick={() => setShowCreateForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Task
          </button>
        </div>

        {/* Filters & Search */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tasks..."
              className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
            />
          </div>
          
          <div className="flex gap-2">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="running">Running</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">All Priorities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
            <AlertCircle className="w-5 h-5" />
            {error}
            <button onClick={fetchTasks} className="ml-auto text-sm underline">Retry</button>
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="text-center py-12 bg-slate-800/50 rounded-xl border border-slate-700/50">
            <div className="w-16 h-16 bg-slate-700/50 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-slate-500" />
            </div>
            <h3 className="text-lg font-medium text-slate-300">No tasks found</h3>
            <p className="text-slate-500 mt-1">
              {searchQuery || filterStatus || filterPriority
                ? 'Try adjusting your filters'
                : 'Create your first task to get started'}
            </p>
            {!searchQuery && !filterStatus && !filterPriority && (
              <button
                onClick={() => setShowCreateForm(true)}
                className="mt-4 px-4 py-2 bg-primary hover:bg-primary/90 text-white font-medium rounded-lg transition-colors"
              >
                Create Task
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredTasks.map((task) => {
              const statusBadge = getStatusBadge(task.status);
              const StatusIcon = statusBadge.icon;
              
              return (
                <div
                  key={task.id}
                  onClick={() => setViewingTask(task)}
                  className="group flex items-center gap-4 p-4 bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-slate-600 rounded-xl cursor-pointer transition-all"
                >
                  {/* Priority Indicator */}
                  <div className={`w-1 h-12 rounded-full ${
                    task.priority === 'critical' ? 'bg-red-500' :
                    task.priority === 'high' ? 'bg-orange-500' :
                    task.priority === 'medium' ? 'bg-yellow-500' :
                    'bg-slate-500'
                  }`} />

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-slate-200 truncate group-hover:text-primary transition-colors">
                        {task.title}
                      </h3>
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${getPriorityBadge(task.priority)}`}>
                        {task.priority}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500 truncate">
                      {task.description || 'No description'}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(task.due_date, task.status)}
                      </span>
                      {task.estimated_hours && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {task.estimated_hours}h
                        </span>
                      )}
                      {task.tags && task.tags.length > 0 && (
                        <span className="flex items-center gap-1">
                          {task.tags.slice(0, 3).map((tag, i) => (
                            <span key={i} className="px-1.5 py-0.5 bg-slate-700 rounded text-slate-300">
                              {tag}
                            </span>
                          ))}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div className="hidden sm:flex items-center gap-2">
                    <span className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full border ${statusBadge.class}`}>
                      <StatusIcon className={`w-4 h-4 ${task.status === 'running' ? 'animate-spin' : ''}`} />
                      {statusBadge.label}
                    </span>
                  </div>

                  {/* Assigned Agent */}
                  <div className="flex items-center gap-2">
                    {task.assigned_agent ? (
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center">
                          <span className="text-xs font-medium text-white">
                            {task.assigned_agent.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setAssigningTask(task);
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm text-slate-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                      >
                        <User className="w-4 h-4" />
                        Assign
                      </button>
                    )}
                  </div>

                  {/* Arrow */}
                  <ArrowRight className="w-5 h-5 text-slate-600 group-hover:text-slate-400 transition-colors" />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Task Form */}
      {showCreateForm && (
        <TaskCreationForm
          projects={[{ id: projectId, name: projectName }]}
          defaultProjectId={projectId}
          onClose={() => setShowCreateForm(false)}
          onCreated={fetchTasks}
        />
      )}

      {/* Assign Task Dialog */}
      {assigningTask && (
        <TaskAssignmentDialog
          taskId={assigningTask.id}
          taskTitle={assigningTask.title}
          onClose={() => setAssigningTask(null)}
          onAssigned={fetchTasks}
        />
      )}

      {/* Task Detail View */}
      {viewingTask && (
        <TaskDetailView
          task={viewingTask}
          projectName={projectName}
          onClose={() => setViewingTask(null)}
          onUpdate={fetchTasks}
          onAssign={() => {
            setViewingTask(null);
            setAssigningTask(viewingTask);
          }}
        />
      )}
    </>
  );
}
