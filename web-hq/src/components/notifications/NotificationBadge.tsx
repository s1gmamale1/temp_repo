import { useState, useEffect, useRef } from 'react';
import { 
  Bell, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  Clock,
  User,
  Briefcase,
  ArrowRight,
  Settings
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Notification {
  id: string;
  type: 'task_assigned' | 'task_updated' | 'task_completed' | 'mention' | 'system';
  title: string;
  message: string;
  taskId?: string;
  projectId?: string;
  sender?: {
    id: string;
    name: string;
    avatar?: string;
  };
  createdAt: string;
  read: boolean;
}

interface NotificationBadgeProps {
  className?: string;
}

// Mock notifications for now - will be replaced with API calls
const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: '1',
    type: 'task_assigned',
    title: 'New Task Assigned',
    message: 'You have been assigned to "Implement OAuth flow"',
    taskId: 'task-001',
    projectId: 'proj-001',
    sender: {
      id: 'user-001',
      name: 'Leo',
      avatar: undefined
    },
    createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(), // 5 minutes ago
    read: false
  },
  {
    id: '2',
    type: 'task_updated',
    title: 'Task Status Changed',
    message: '"API Documentation" moved to In Progress',
    taskId: 'task-002',
    projectId: 'proj-001',
    sender: {
      id: 'agent-001',
      name: 'Sigma',
      avatar: undefined
    },
    createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(), // 30 minutes ago
    read: false
  },
  {
    id: '3',
    type: 'task_completed',
    title: 'Task Completed',
    message: '"Setup CI/CD pipeline" has been completed',
    taskId: 'task-003',
    projectId: 'proj-002',
    sender: {
      id: 'agent-002',
      name: 'Donnie',
      avatar: undefined
    },
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), // 2 hours ago
    read: true
  },
  {
    id: '4',
    type: 'mention',
    title: 'You were mentioned',
    message: '@sigma check the requirements for this task',
    taskId: 'task-004',
    projectId: 'proj-001',
    sender: {
      id: 'user-001',
      name: 'Leo',
      avatar: undefined
    },
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(), // 4 hours ago
    read: true
  }
];

export default function NotificationBadge({ className = '' }: NotificationBadgeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>(MOCK_NOTIFICATIONS);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch notifications from API
  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen]);

  const fetchNotifications = async () => {
    // TODO: Replace with actual API call
    // const response = await notificationsApi.list();
    // setNotifications(response.notifications);
    setLoading(false);
  };

  const markAsRead = async (notificationId: string) => {
    // TODO: Replace with actual API call
    // await notificationsApi.markAsRead(notificationId);
    setNotifications(prev => 
      prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
    );
  };

  const markAllAsRead = async () => {
    // TODO: Replace with actual API call
    // await notificationsApi.markAllAsRead();
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      markAsRead(notification.id);
    }
    
    if (notification.taskId) {
      navigate(`/tasks/${notification.taskId}`);
    } else if (notification.projectId) {
      navigate(`/projects/${notification.projectId}`);
    }
    
    setIsOpen(false);
  };

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'task_assigned':
        return <User className="w-4 h-4 text-blue-400" />;
      case 'task_completed':
        return <CheckCircle2 className="w-4 h-4 text-green-400" />;
      case 'task_updated':
        return <Clock className="w-4 h-4 text-yellow-400" />;
      case 'mention':
        return <AlertCircle className="w-4 h-4 text-purple-400" />;
      default:
        return <Bell className="w-4 h-4 text-slate-400" />;
    }
  };

  const getNotificationColor = (type: Notification['type']) => {
    switch (type) {
      case 'task_assigned':
        return 'bg-blue-500/10 border-blue-500/30';
      case 'task_completed':
        return 'bg-green-500/10 border-green-500/30';
      case 'task_updated':
        return 'bg-yellow-500/10 border-yellow-500/30';
      case 'mention':
        return 'bg-purple-500/10 border-purple-500/30';
      default:
        return 'bg-slate-700/50 border-slate-600';
    }
  };

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Bell Icon Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        
        {/* Unread Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1.5 bg-red-500 text-white text-xs font-medium rounded-full">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
        
        {/* Pulse animation for new notifications */}
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-96 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-800/50">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-slate-400" />
              <span className="font-medium text-slate-200">Notifications</span>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-full">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="p-1.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded transition-colors"
                  title="Mark all as read"
                >
                  <CheckCircle2 className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => navigate('/settings/notifications')}
                className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded transition-colors"
                title="Notification settings"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Notifications List */}
          <div className="max-h-[400px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Bell className="w-12 h-12 text-slate-600 mb-3" />
                <p className="text-slate-400 text-sm">No notifications yet</p>
                <p className="text-slate-500 text-xs mt-1">
                  We'll notify you when something happens
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-700/50">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={`
                      flex items-start gap-3 p-3 cursor-pointer transition-colors
                      ${notification.read ? 'bg-transparent hover:bg-slate-800/50' : 'bg-slate-700/20 hover:bg-slate-700/40'}
                    `}
                  >
                    {/* Icon */}
                    <div className={`
                      flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center
                      ${getNotificationColor(notification.type)}
                    `}>
                      {getNotificationIcon(notification.type)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm ${notification.read ? 'text-slate-300' : 'text-slate-200 font-medium'}`}>
                          {notification.title}
                        </p>
                        {!notification.read && (
                          <span className="flex-shrink-0 w-2 h-2 bg-primary rounded-full mt-1.5" />
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">
                        {notification.message}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-500">
                        <Clock className="w-3 h-3" />
                        {formatTimeAgo(notification.createdAt)}
                        {notification.sender && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {notification.sender.name}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Action Arrow */}
                    <ArrowRight className="flex-shrink-0 w-4 h-4 text-slate-600 mt-1" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-slate-700 bg-slate-800/50">
            <button
              onClick={() => {
                navigate('/notifications');
                setIsOpen(false);
              }}
              className="w-full py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors text-center"
            >
              View all notifications
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
