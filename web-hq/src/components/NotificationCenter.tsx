import { useState, useEffect, useRef } from 'react';
import { 
  Bell, 
  Check, 
  X, 
  Target, 
  MessageSquare, 
  UserPlus, 
  AlertTriangle,
  Loader2,
  ExternalLink
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export interface Notification {
  id: string;
  type: 'project_assignment' | 'message' | 'task_assigned' | 'mention' | 'system';
  title: string;
  message: string;
  metadata?: {
    projectId?: string;
    projectName?: string;
    role?: string;
    assignedBy?: string;
    senderName?: string;
    taskId?: string;
    taskTitle?: string;
    channelId?: string;
  };
  read: boolean;
  createdAt: string;
}

// Mock notifications data - in real implementation, this would come from API/WebSocket
const mockNotifications: Notification[] = [
  {
    id: '1',
    type: 'project_assignment',
    title: 'New Project Assignment',
    message: 'You\'ve been assigned to "Notion→Video Pipeline" as Project Lead',
    metadata: {
      projectId: 'proj-123',
      projectName: 'Notion→Video Pipeline',
      role: 'Project Lead',
      assignedBy: 'Scorpion',
    },
    read: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(), // 5 mins ago
  },
  {
    id: '2',
    type: 'message',
    title: 'New Message',
    message: 'Leonardo sent you a message in #general',
    metadata: {
      senderName: 'Leonardo',
      channelId: 'chan-456',
    },
    read: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(), // 30 mins ago
  },
  {
    id: '3',
    type: 'task_assigned',
    title: 'Task Assigned',
    message: 'You have been assigned to "Fix API authentication bug"',
    metadata: {
      taskId: 'task-789',
      taskTitle: 'Fix API authentication bug',
      projectId: 'proj-123',
    },
    read: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), // 2 hours ago
  },
];

export default function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>(mockNotifications);
  const [_loading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const unreadCount = notifications.filter(n => !n.read).length;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch notifications on mount (mock)
  useEffect(() => {
    // In real implementation: fetchNotifications()
  }, []);

  const markAsRead = (id: string) => {
    setNotifications(prev => 
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    );
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const dismissNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const handleNotificationClick = (notification: Notification) => {
    markAsRead(notification.id);
    
    // Navigate based on notification type
    switch (notification.type) {
      case 'project_assignment':
        if (notification.metadata?.projectId) {
          navigate(`/projects/${notification.metadata.projectId}`);
        }
        break;
      case 'message':
        if (notification.metadata?.channelId) {
          navigate(`/chat?channel=${notification.metadata.channelId}`);
        } else {
          navigate('/chat');
        }
        break;
      case 'task_assigned':
        if (notification.metadata?.taskId) {
          navigate(`/tasks?task=${notification.metadata.taskId}`);
        } else {
          navigate('/tasks');
        }
        break;
      default:
        break;
    }
    
    setIsOpen(false);
  };

  const handleAcceptAssignment = (e: React.MouseEvent, notification: Notification) => {
    e.stopPropagation();
    markAsRead(notification.id);
    // In real implementation: API call to accept
    if (notification.metadata?.projectId) {
      navigate(`/projects/${notification.metadata.projectId}`);
    }
    setIsOpen(false);
  };

  const handleDeclineAssignment = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    // In real implementation: API call to decline
    dismissNotification(id);
  };

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'project_assignment':
        return <div className="w-10 h-10 bg-indigo-500/20 rounded-full flex items-center justify-center"><Target className="w-5 h-5 text-indigo-400" /></div>;
      case 'message':
        return <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center"><MessageSquare className="w-5 h-5 text-blue-400" /></div>;
      case 'task_assigned':
        return <div className="w-10 h-10 bg-green-500/20 rounded-full flex items-center justify-center"><UserPlus className="w-5 h-5 text-green-400" /></div>;
      case 'mention':
        return <div className="w-10 h-10 bg-yellow-500/20 rounded-full flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-yellow-400" /></div>;
      default:
        return <div className="w-10 h-10 bg-slate-500/20 rounded-full flex items-center justify-center"><Bell className="w-5 h-5 text-slate-400" /></div>;
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Icon Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded-lg transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-medium rounded-full flex items-center justify-center animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-96 bg-slate-800 rounded-xl border border-slate-700 shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
            <h3 className="font-semibold text-slate-200">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 px-2 py-1 rounded hover:bg-indigo-500/10 transition-colors"
                >
                  <Check className="w-3 h-3" />
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Notifications List */}
          <div className="max-h-96 overflow-y-auto">
            {_loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-8 px-4">
                <Bell className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400">No notifications</p>
                <p className="text-sm text-slate-500 mt-1">You're all caught up!</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-700">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={`p-4 hover:bg-slate-700/50 transition-colors cursor-pointer group ${
                      !notification.read ? 'bg-slate-700/20' : ''
                    }`}
                  >
                    <div className="flex gap-3">
                      {getNotificationIcon(notification.type)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`font-medium text-sm ${!notification.read ? 'text-slate-100' : 'text-slate-300'}`}>
                            {notification.title}
                          </p>
                          <div className="flex items-center gap-1">
                            {!notification.read && (
                              <span className="w-2 h-2 bg-indigo-500 rounded-full" />
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                dismissNotification(notification.id);
                              }}
                              className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-all"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                        <p className="text-sm text-slate-400 mt-1 line-clamp-2">
                          {notification.message}
                        </p>
                        
                        {/* Project Assignment Specific UI */}
                        {notification.type === 'project_assignment' && notification.metadata && (
                          <div className="mt-3 space-y-2">
                            <div className="text-xs text-slate-500">
                              <span className="text-slate-400">Role:</span>{' '}
                              <span className="text-indigo-400">{notification.metadata.role}</span>
                              <span className="mx-2">•</span>
                              <span className="text-slate-400">By:</span>{' '}
                              <span className="text-slate-300">{notification.metadata.assignedBy}</span>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={(e) => handleAcceptAssignment(e, notification)}
                                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded transition-colors"
                              >
                                <ExternalLink className="w-3 h-3" />
                                View Project
                              </button>
                              <button
                                onClick={(e) => handleDeclineAssignment(e, notification.id)}
                                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium rounded transition-colors"
                              >
                                Decline
                              </button>
                            </div>
                          </div>
                        )}
                        
                        <p className="text-xs text-slate-500 mt-2">
                          {formatTime(notification.createdAt)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="px-4 py-3 border-t border-slate-700 bg-slate-800/50">
              <button
                onClick={() => {
                  navigate('/notifications');
                  setIsOpen(false);
                }}
                className="w-full text-center text-sm text-slate-400 hover:text-slate-200 transition-colors"
              >
                View all notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
