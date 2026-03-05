import { create } from 'zustand';
import { notificationsApi, wsClient } from '../services/api';

export interface Notification {
    id: string;
    type: string;
    title: string;
    content: string;
    data?: Record<string, any>;
    is_read: boolean;
    created_at: string;
}

interface NotificationState {
    notifications: Notification[];
    unreadCount: number;
    loading: boolean;
    isOpen: boolean;

    fetchNotifications: () => Promise<void>;
    markAsRead: (id: string) => Promise<void>;
    markAllAsRead: () => Promise<void>;
    dismiss: (id: string) => void;
    setIsOpen: (open: boolean) => void;
    _addLive: (n: Notification) => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
    notifications: [],
    unreadCount: 0,
    loading: false,
    isOpen: false,

    setIsOpen: (open) => set({ isOpen: open }),

    fetchNotifications: async () => {
        set({ loading: true });
        try {
            const data = await notificationsApi.list({ limit: 30 });
            set({
                notifications: data?.notifications || [],
                unreadCount: data?.unread_count ?? 0,
            });
        } catch (e) {
            console.error('fetchNotifications:', e);
        } finally {
            set({ loading: false });
        }
    },

    markAsRead: async (id: string) => {
        set(s => ({
            notifications: s.notifications.map(n => n.id === id ? { ...n, is_read: true } : n),
            unreadCount: Math.max(0, s.unreadCount - 1),
        }));
        try { await notificationsApi.markRead(id); } catch { }
    },

    markAllAsRead: async () => {
        set(s => ({
            notifications: s.notifications.map(n => ({ ...n, is_read: true })),
            unreadCount: 0,
        }));
        try { await notificationsApi.markAllRead(); } catch { }
    },

    dismiss: (id: string) => {
        set(s => {
            const n = s.notifications.find(n => n.id === id);
            return {
                notifications: s.notifications.filter(n => n.id !== id),
                unreadCount: n && !n.is_read ? Math.max(0, s.unreadCount - 1) : s.unreadCount,
            };
        });
    },

    _addLive: (n: Notification) => {
        set(s => ({
            notifications: [n, ...s.notifications],
            unreadCount: s.unreadCount + 1,
        }));
    },
}));

// Wire up WebSocket events once at module level
wsClient.on('notification:new', (data: any) => pushNotification(data));
wsClient.on('user:notification', (data: any) => pushNotification(data));

function pushNotification(data: any) {
    if (!data) return;
    useNotificationStore.getState()._addLive({
        id: data.id,
        type: data.type,
        title: data.title,
        content: data.content ?? data.message ?? '',
        data: data.data ?? {},
        is_read: false,
        created_at: data.created_at ?? new Date().toISOString(),
    });
}