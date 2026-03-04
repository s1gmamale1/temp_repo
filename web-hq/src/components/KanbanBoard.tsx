import { useState, useEffect } from 'react';
import { 
  Plus, 
  MoreHorizontal, 
  Calendar, 
  Clock, 
  AlertCircle,
  CheckCircle2,
  Circle,
  Loader2,
  User,
  Filter,
  GripVertical
} from 'lucide-react';
import { tasksApi, type Task } from '../services/api';
import TaskCreationForm from './TaskCreationForm';
import TaskDetailView from './TaskDetailView';
import TaskAssignmentDialog from './TaskAssignmentDialog';

interface KanbanBoardProps {
  projectId: string;
  projectName: string;
}

interface TaskColumn {
  id: Task['status'];
  title: string;
  color: string;
  icon: React.ElementType;
}

const COLUMNS: TaskColumn[] = [
  { id: 'draft', title: 'Draft', color: 'bg-slate-500', icon: Circle },
  { id: 'pending', title: 'Pending', color: 'bg-yellow-500', icon: Clock },
  { id: 'assigned', title: 'Assigned', color: 'bg-blue-500', icon: User },
  { id: 'in_progress', title: 'In Progress', color: 'bg-indigo-500', icon: Loader2 },
  { id: 'completed', title: 'Completed', color: 'bg-green-500', icon: CheckCircle2 },
  { id: 'cancelled', title: 'Cancelled', color: 'bg-red-500', icon: AlertCircle },
];

export default function KanbanBoard({ projectId, projectName }: KanbanBoardProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPriority, setFilterPriority] = useState<string>('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [viewingTask, setViewingTask] = useState<Task | null>(null);
  const [assigningTask, setAssigningTask] = useState<Task | null>(null);
  const [draggingTask, setDraggingTask] = useState<string | null>(null);

  useEffect(() => {
    fetchTasks();
  }, [projectId, filterPriority]);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params: { priority?: string } = {};
      if (filterPriority) params.priority = filterPriority;

      const response = await tasksApi.list(projectId, params);
      setTasks(response.tasks || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  };

  const handleDragStart = (taskId: string) => {
    setDraggingTask(taskId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, status: Task['status']) => {
    e.preventDefault();
    if (!draggingTask) return;

    const task = tasks.find(t => t.id === draggingTask);
    if (!task || task.status === status) {
      setDraggingTask(null);
      return;
    }

    try {
      // Optimistic update
      setTasks(prev => prev.map(t => 
        t.id === draggingTask ? { ...t, status } : t
      ));
      
      await tasksApi.update(task.id, { status });
    } catch (err: any) {
      // Revert on error
      setError(err.message || 'Failed to update task status');
      fetchTasks();
    } finally {
      setDraggingTask(null);
    }
  };

  const getTasksByStatus = (status: Task['status']) => {
    return tasks.filter(task => {
      if (task.status !== status) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          task.title.toLowerCase().includes(query) ||
          task.description?.toLowerCase().includes(query)
        );
      }
      return true;
    });
  };

  const getPriorityColor = (priority: Task['priority']) => {
    switch (priority) {
      case 'critical': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-slate-500';
      default: return 'bg-slate-500';
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const now = new Date();
    const isOverdue = date < now;
    return { date: date.toLocaleDateString(), isOverdue };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
        <span className="ml-3 text-slate-400">Loading board...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-50">Kanban Board</h2>
          <p className="text-sm text-slate-400">
            {tasks.length} tasks • Drag to change status
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreateForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Task
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tasks..."
            className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
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

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          <AlertCircle className="w-4 h-4" />
          {error}
          <button onClick={fetchTasks} className="ml-auto underline">Retry</button>
        </div>
      )}

      {/* Kanban Board */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map((column) => {
          const columnTasks = getTasksByStatus(column.id);
          const ColumnIcon = column.icon;
          
          return (
            <div
              key={column.id}
              className="flex-shrink-0 w-80"
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, column.id)}
            >
              {/* Column Header */}
              <div className={`flex items-center justify-between p-3 rounded-t-lg bg-slate-800 border-b-2 ${column.color.replace('bg-', 'border-')}`}>
                <div className="flex items-center gap-2">
                  <ColumnIcon className={`w-4 h-4 ${column.color.replace('bg-', 'text-')}`} />
                  <span className="font-medium text-slate-200">{column.title}</span>
                  <span className="text-xs text-slate-500 bg-slate-700 px-2 py-0.5 rounded-full">
                    {columnTasks.length}
                  </span>
                </div>
                <button className="p-1 text-slate-500 hover:text-slate-300 rounded">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>

              {/* Column Content */}
              <div className="bg-slate-800/50 rounded-b-lg p-2 space-y-2 min-h-[200px]">
                {columnTasks.map((task) => {
                  const dueDate = formatDate(task.due_date);
                  
                  return (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={() => handleDragStart(task.id)}
                      onClick={() => setViewingTask(task)}
                      className={`
                        group p-3 bg-slate-800 rounded-lg border border-slate-700 
                        hover:border-slate-600 cursor-pointer transition-all
                        ${draggingTask === task.id ? 'opacity-50' : ''}
                      `}
                    >
                      {/* Priority Bar */}
                      <div className={`h-1 w-full rounded-full mb-2 ${getPriorityColor(task.priority)}`} />
                      
                      {/* Title */}
                      <h4 className="font-medium text-slate-200 text-sm mb-2 line-clamp-2">
                        {task.title}
                      </h4>

                      {/* Meta Info */}
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <div className="flex items-center gap-2">
                          {task.estimated_hours && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {task.estimated_hours}h
                            </span>
                          )}
                          {dueDate && (
                            <span className={`flex items-center gap-1 ${dueDate.isOverdue ? 'text-red-400' : ''}`}>
                              <Calendar className="w-3 h-3" />
                              {dueDate.date}
                            </span>
                          )}
                        </div>
                        
                        {/* Assignee Avatar */}
                        {task.assigned_agent ? (
                          <div className="w-6 h-6 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center">
                            <span className="text-xs font-medium text-white">
                              {task.assigned_agent.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setAssigningTask(task);
                            }}
                            className="p-1 text-slate-500 hover:text-primary hover:bg-primary/10 rounded transition-colors"
                          >
                            <User className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      {/* Tags */}
                      {task.tags && task.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {task.tags.slice(0, 2).map((tag, i) => (
                            <span key={i} className="text-xs px-1.5 py-0.5 bg-slate-700 rounded text-slate-400">
                              {tag}
                            </span>
                          ))}
                          {task.tags.length > 2 && (
                            <span className="text-xs text-slate-500">+{task.tags.length - 2}</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Add Task Button */}
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="w-full p-2 border border-dashed border-slate-700 rounded-lg text-slate-500 hover:text-slate-300 hover:border-slate-500 hover:bg-slate-800/50 transition-all text-sm flex items-center justify-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  Add Task
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modals */}
      {showCreateForm && (
        <TaskCreationForm
          projectId={projectId}
          projectName={projectName}
          onClose={() => setShowCreateForm(false)}
          onCreated={fetchTasks}
        />
      )}

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

      {assigningTask && (
        <TaskAssignmentDialog
          taskId={assigningTask.id}
          taskTitle={assigningTask.title}
          onClose={() => setAssigningTask(null)}
          onAssigned={fetchTasks}
        />
      )}
    </div>
  );
}
