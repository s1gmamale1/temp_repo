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
  GripVertical,
  Search,
  Archive
} from 'lucide-react';
import { tasksApi, type Task } from '../../services/api';
import TaskCreationModal from './TaskCreationModal';
import TaskDetailView from '../TaskDetailView';
import TaskAssignmentDialog from './TaskAssignmentDialog';

interface KanbanBoardProps {
  projectId: string;
  projectName: string;
}

interface TaskColumn {
  id: TaskStatus;
  title: string;
  color: string;
  icon: React.ElementType;
  description: string;
}

type TaskStatus = 'backlog' | 'pending' | 'running' | 'completed' | 'cancelled';

// Phase 3 columns per spec
const COLUMNS: TaskColumn[] = [
  { 
    id: 'backlog', 
    title: 'BACKLOG', 
    color: 'bg-slate-500', 
    icon: Archive,
    description: 'Tasks waiting to be started'
  },
  { 
    id: 'pending', 
    title: 'PENDING', 
    color: 'bg-yellow-500', 
    icon: Clock,
    description: 'Tasks ready to start'
  },
  { 
    id: 'running', 
    title: 'RUNNING', 
    color: 'bg-blue-500', 
    icon: Loader2,
    description: 'Tasks in progress'
  },
  { 
    id: 'completed', 
    title: 'COMPLETED', 
    color: 'bg-green-500', 
    icon: CheckCircle2,
    description: 'Finished tasks'
  },
  { 
    id: 'cancelled', 
    title: 'CANCELLED', 
    color: 'bg-red-500', 
    icon: AlertCircle,
    description: 'Cancelled or dropped tasks'
  },
];

export default function KanbanBoard({ projectId, projectName }: KanbanBoardProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPriority, setFilterPriority] = useState<string>('');
  const [filterAssignee, setFilterAssignee] = useState<string>('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [viewingTask, setViewingTask] = useState<Task | null>(null);
  const [assigningTask, setAssigningTask] = useState<Task | null>(null);
  const [draggingTask, setDraggingTask] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);

  useEffect(() => {
    fetchTasks();
  }, [projectId, filterPriority, filterAssignee]);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params: { priority?: string; assigned_to?: string } = {};
      if (filterPriority) params.priority = filterPriority;
      if (filterAssignee) params.assigned_to = filterAssignee;

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

  const handleDragOver = (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    setDragOverColumn(status);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = async (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    setDragOverColumn(null);
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

  const getTasksByStatus = (status: TaskStatus) => {
    return tasks.filter(task => {
      if (task.status !== status) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          task.title.toLowerCase().includes(query) ||
          task.description?.toLowerCase().includes(query) ||
          task.tags?.some(tag => tag.toLowerCase().includes(query))
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

  const getPriorityLabel = (priority: Task['priority']) => {
    switch (priority) {
      case 'critical': return 'Critical';
      case 'high': return 'High';
      case 'medium': return 'Medium';
      case 'low': return 'Low';
      default: return 'Normal';
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const now = new Date();
    const isOverdue = date < now;
    return { date: date.toLocaleDateString(), isOverdue };
  };

  const getColumnTaskCount = (status: TaskStatus) => {
    return tasks.filter(t => t.status === status).length;
  };

  if (loading && tasks.length === 0) {
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
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-50">Task Board</h2>
          <p className="text-sm text-slate-400">
            {tasks.length} tasks • Drag to change status
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Task
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tasks..."
            className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <div className="flex gap-2">
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
          <select
            value={filterAssignee}
            onChange={(e) => setFilterAssignee(e.target.value)}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="">All Assignees</option>
            <option value="unassigned">Unassigned</option>
            <option value="me">Assigned to me</option>
          </select>
        </div>
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
      <div className="flex gap-4 overflow-x-auto pb-4 min-h-[500px]">
        {COLUMNS.map((column) => {
          const columnTasks = getTasksByStatus(column.id);
          const ColumnIcon = column.icon;
          const isDragOver = dragOverColumn === column.id;
          
          return (
            <div
              key={column.id}
              className={`flex-shrink-0 w-80 transition-all ${isDragOver ? 'scale-[1.02]' : ''}`}
              onDragOver={(e) => handleDragOver(e, column.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, column.id)}
            >
              {/* Column Header */}
              <div className={`
                flex items-center justify-between p-3 rounded-t-lg border-b-2 
                ${column.color.replace('bg-', 'border-')}
                ${isDragOver ? 'bg-slate-700/50' : 'bg-slate-800'}
                transition-colors
              `}>
                <div className="flex items-center gap-2">
                  <ColumnIcon className={`w-4 h-4 ${column.color.replace('bg-', 'text-')}`} />
                  <span className="font-semibold text-slate-200 tracking-wide">{column.title}</span>
                  <span className={`
                    text-xs px-2 py-0.5 rounded-full font-medium
                    ${column.color.replace('bg-', 'bg-')}/20 ${column.color.replace('bg-', 'text-')}
                  `}>
                    {getColumnTaskCount(column.id)}
                  </span>
                </div>
                <button className="p-1 text-slate-500 hover:text-slate-300 rounded">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>

              {/* Column Content */}
              <div className={`
                bg-slate-800/30 rounded-b-lg p-2 space-y-2 min-h-[400px]
                ${isDragOver ? 'bg-slate-700/30 ring-2 ring-primary/30' : ''}
                transition-all
              `}>
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
                        hover:border-slate-500 hover:shadow-lg cursor-pointer transition-all
                        ${draggingTask === task.id ? 'opacity-50 rotate-2' : ''}
                      `}
                    >
                      {/* Priority & Status Bar */}
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`h-1.5 flex-1 rounded-full ${getPriorityColor(task.priority)}`} />
                        <span className={`
                          text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded
                          ${getPriorityColor(task.priority).replace('bg-', 'bg-')}/20 
                          ${getPriorityColor(task.priority).replace('bg-', 'text-')}
                        `}>
                          {getPriorityLabel(task.priority)}
                        </span>
                      </div>
                      
                      {/* Title */}
                      <h4 className="font-medium text-slate-200 text-sm mb-2 line-clamp-2">
                        {task.title}
                      </h4>

                      {/* Description Preview */}
                      {task.description && (
                        <p className="text-xs text-slate-500 mb-2 line-clamp-2">
                          {task.description}
                        </p>
                      )}

                      {/* Meta Info */}
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <div className="flex items-center gap-3">
                          {task.estimated_hours && (
                            <span className="flex items-center gap-1" title="Estimated hours">
                              <Clock className="w-3 h-3" />
                              {task.estimated_hours}h
                            </span>
                          )}
                          {dueDate && (
                            <span 
                              className={`flex items-center gap-1 ${dueDate.isOverdue ? 'text-red-400 font-medium' : ''}`}
                              title={dueDate.isOverdue ? 'Overdue' : 'Due date'}
                            >
                              <Calendar className="w-3 h-3" />
                              {dueDate.isOverdue && '!'}
                              {dueDate.date}
                            </span>
                          )}
                        </div>
                        
                        {/* Assignee Avatar */}
                        {task.assigned_agent ? (
                          <div 
                            className="w-6 h-6 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center"
                            title={`Assigned to ${task.assigned_agent.name}`}
                          >
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
                            title="Assign task"
                          >
                            <User className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      {/* Tags */}
                      {task.tags && task.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {task.tags.slice(0, 3).map((tag, i) => (
                            <span 
                              key={i} 
                              className="text-[10px] px-1.5 py-0.5 bg-slate-700 rounded text-slate-400"
                            >
                              #{tag}
                            </span>
                          ))}
                          {task.tags.length > 3 && (
                            <span className="text-[10px] text-slate-500">+{task.tags.length - 3}</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Empty State */}
                {columnTasks.length === 0 && !loading && (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <ColumnIcon className="w-8 h-8 text-slate-600 mb-2" />
                    <p className="text-xs text-slate-500">No {column.title.toLowerCase()} tasks</p>
                  </div>
                )}

                {/* Add Task Button */}
                <button
                  onClick={() => setShowCreateModal(true)}
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
      <TaskCreationModal
        projectId={projectId}
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={fetchTasks}
      />

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
          projectId={projectId}
          onClose={() => setAssigningTask(null)}
          onAssigned={fetchTasks}
        />
      )}
    </div>
  );
}
