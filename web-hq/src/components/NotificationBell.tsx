import { useEffect, useRef, useState } from 'react';
import { Bell, Check, CheckCheck, X } from 'lucide-react';
import { useNotificationStore, type Notification } from '../store/notificationStore';
import { useNavigate } from 'react-router-dom';

const M: React.CSSProperties = { fontFamily: 'var(--font-mono)' };

const formatTime = (ts: string) => {
    const date = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
};

const getNotificationIcon = (type: string) => {
    const colors: Record<string, string> = {
        task_assigned: '#3b82f6',
        task_accepted: '#10b981',
        task_rejected: '#ef4444',
        task_completed: '#8b5cf6',
        project_assigned: '#f59e0b',
        project_removed: '#ef4444',
        role_updated: '#6366f1',
        approved: '#10b981',
        dm_message: '#ec4899',
        budget_alert: '#f97316',
        default: '#6b7280'
    };
    return colors[type] || colors.default;
};

const getNotificationLink = (notification: Notification) => {
    const { type, data } = notification;
    if (type === 'task_assigned' || type === 'task_accepted' || type === 'task_rejected' || type === 'task_completed') {
        return data?.task_id ? `/projects/${data.project_id}/tasks/${data.task_id}` : null;
    }
    if (type === 'project_assigned' || type === 'project_removed' || type === 'role_updated') {
        return data?.project_id ? `/projects/${data.project_id}` : null;
    }
    if (type === 'dm_message') {
        return data?.channel_id ? `/chat?channel=${data.channel_id}` : null;
    }
    return null;
};

export default function NotificationBell() {
    const {
        notifications,
        unreadCount,
        isOpen,
        setIsOpen,
        markAsRead,
        markAllAsRead,
        fetchNotifications
    } = useNotificationStore();

    const navigate = useNavigate();
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 30000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [setIsOpen]);

    const handleNotificationClick = (notification: Notification) => {
        if (!notification.is_read) {
            markAsRead(notification.id);
        }
        const link = getNotificationLink(notification);
        if (link) {
            navigate(link);
            setIsOpen(false);
        }
    };

    if (!mounted) return null;

    return (
        <div ref={dropdownRef} style={{ position: 'relative' }}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '8px 12px',
                    borderRadius: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    position: 'relative',
                    color: unreadCount > 0 ? 'var(--amber)' : 'var(--text-mid)',
                    transition: 'color 150ms',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--amber)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = unreadCount > 0 ? 'var(--amber)' : 'var(--text-mid)'; }}
            >
                <Bell size={16} />
                {unreadCount > 0 && (
                    <span style={{
                        ...M,
                        position: 'absolute',
                        top: 4,
                        right: 4,
                        background: '#ef4444',
                        color: '#fff',
                        fontSize: 9,
                        fontWeight: 700,
                        padding: '1px 4px',
                        borderRadius: 8,
                        minWidth: 14,
                        height: 14,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}>
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    right: 0,
                    width: 360,
                    maxHeight: 480,
                    background: 'var(--ink-2)',
                    border: '1px solid var(--ink-4)',
                    borderRadius: 2,
                    boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
                    zIndex: 1000,
                    display: 'flex',
                    flexDirection: 'column',
                }}>
                    <div style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid var(--ink-4)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                    }}>
                        <span style={{ ...M, fontSize: 12, fontWeight: 700, color: 'var(--text-hi)' }}>
                            Notifications {unreadCount > 0 && `(${unreadCount})`}
                        </span>
                        <div style={{ display: 'flex', gap: 8 }}>
                            {unreadCount > 0 && (
                                <button
                                    onClick={markAllAsRead}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        padding: 4,
                                        borderRadius: 2,
                                        color: 'var(--text-lo)',
                                        display: 'flex',
                                        alignItems: 'center',
                                    }}
                                    title="Mark all as read"
                                >
                                    <CheckCheck size={14} />
                                </button>
                            )}
                            <button
                                onClick={() => setIsOpen(false)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    padding: 4,
                                    borderRadius: 2,
                                    color: 'var(--text-lo)',
                                }}
                            >
                                <X size={14} />
                            </button>
                        </div>
                    </div>

                    <div style={{
                        flex: 1,
                        overflowY: 'auto',
                        padding: '8px 0',
                    }}>
                        {notifications.length === 0 ? (
                            <div style={{
                                padding: '40px 20px',
                                textAlign: 'center',
                                color: 'var(--text-lo)',
                            }}>
                                <Bell size={32} style={{ marginBottom: 12, opacity: 0.3 }} />
                                <div style={{ ...M, fontSize: 12 }}>No notifications yet</div>
                            </div>
                        ) : (
                            notifications.map((notification, idx) => {
                                const color = getNotificationIcon(notification.type);
                                const link = getNotificationLink(notification);
                                return (
                                    <div
                                        key={`${notification.id}-${idx}`}
                                        onClick={() => handleNotificationClick(notification)}
                                        style={{
                                            padding: '12px 16px',
                                            borderBottom: '1px solid var(--ink-4)',
                                            cursor: link ? 'pointer' : 'default',
                                            background: notification.is_read ? 'transparent' : 'var(--ink-3)',
                                            opacity: notification.is_read ? 0.7 : 1,
                                            transition: 'background 150ms',
                                            display: 'flex',
                                            gap: 12,
                                        }}
                                        onMouseEnter={e => { if (link) e.currentTarget.style.background = 'var(--ink-4)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = notification.is_read ? 'transparent' : 'var(--ink-3)'; }}
                                    >
                                        <div style={{
                                            flexShrink: 0,
                                            width: 8,
                                            height: 8,
                                            borderRadius: '50%',
                                            background: color,
                                            marginTop: 6,
                                        }} />

                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{
                                                ...M,
                                                fontSize: 11,
                                                fontWeight: 600,
                                                color: 'var(--text-hi)',
                                                marginBottom: 4,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 8,
                                            }}>
                                                {notification.title}
                                                {!notification.is_read && (
                                                    <span style={{
                                                        ...M,
                                                        fontSize: 8,
                                                        background: '#3b82f6',
                                                        color: '#fff',
                                                        padding: '1px 4px',
                                                        borderRadius: 2,
                                                    }}>
                                                        NEW
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ ...M, fontSize: 10, color: 'var(--text-mid)', lineHeight: 1.5 }}>
                                                {notification.content}
                                            </div>
                                            <div style={{ ...M, fontSize: 9, color: 'var(--text-lo)', marginTop: 6 }}>
                                                {formatTime(notification.created_at)}
                                            </div>
                                        </div>

                                        {!notification.is_read && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    markAsRead(notification.id);
                                                }}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    padding: 4,
                                                    borderRadius: 2,
                                                    color: 'var(--text-lo)',
                                                    flexShrink: 0,
                                                    alignSelf: 'center',
                                                }}
                                                title="Mark as read"
                                            >
                                                <Check size={14} />
                                            </button>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}