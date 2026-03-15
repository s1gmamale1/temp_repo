import { describe, it, expect, beforeEach } from 'vitest';
import { useNotificationStore } from './notificationStore';
import type { Notification } from './notificationStore';

describe('notificationStore', () => {
  beforeEach(() => {
    // Reset to initial state
    useNotificationStore.setState({
      notifications: [],
      unreadCount: 0,
      loading: false,
      isOpen: false,
    });
  });

  describe('initial state', () => {
    it('has empty notifications', () => {
      const state = useNotificationStore.getState();
      expect(state.notifications).toEqual([]);
    });

    it('has zero unread count', () => {
      const state = useNotificationStore.getState();
      expect(state.unreadCount).toBe(0);
    });

    it('is not open', () => {
      const state = useNotificationStore.getState();
      expect(state.isOpen).toBe(false);
    });

    it('is not loading', () => {
      const state = useNotificationStore.getState();
      expect(state.loading).toBe(false);
    });
  });

  describe('_addLive', () => {
    it('adds a notification to the list', () => {
      const notification: Notification = {
        id: 'notif-1',
        type: 'task_assigned',
        title: 'New Task',
        content: 'You have a new task',
        is_read: false,
        created_at: new Date().toISOString(),
      };

      useNotificationStore.getState()._addLive(notification);

      const state = useNotificationStore.getState();
      expect(state.notifications).toHaveLength(1);
      expect(state.notifications[0].id).toBe('notif-1');
      expect(state.notifications[0].title).toBe('New Task');
    });

    it('increments unread count', () => {
      const notification: Notification = {
        id: 'notif-2',
        type: 'info',
        title: 'Info',
        content: 'Some info',
        is_read: false,
        created_at: new Date().toISOString(),
      };

      useNotificationStore.getState()._addLive(notification);
      expect(useNotificationStore.getState().unreadCount).toBe(1);

      useNotificationStore.getState()._addLive({
        ...notification,
        id: 'notif-3',
      });
      expect(useNotificationStore.getState().unreadCount).toBe(2);
    });

    it('prepends new notifications (newest first)', () => {
      useNotificationStore.getState()._addLive({
        id: 'first',
        type: 'info',
        title: 'First',
        content: '',
        is_read: false,
        created_at: new Date().toISOString(),
      });
      useNotificationStore.getState()._addLive({
        id: 'second',
        type: 'info',
        title: 'Second',
        content: '',
        is_read: false,
        created_at: new Date().toISOString(),
      });

      const state = useNotificationStore.getState();
      expect(state.notifications[0].id).toBe('second');
      expect(state.notifications[1].id).toBe('first');
    });
  });

  describe('markAsRead', () => {
    it('updates notification is_read status', async () => {
      useNotificationStore.setState({
        notifications: [
          {
            id: 'n1',
            type: 'info',
            title: 'Test',
            content: 'Content',
            is_read: false,
            created_at: new Date().toISOString(),
          },
        ],
        unreadCount: 1,
      });

      // markAsRead calls the API but we don't need it to succeed for state test
      await useNotificationStore.getState().markAsRead('n1');

      const state = useNotificationStore.getState();
      expect(state.notifications[0].is_read).toBe(true);
    });

    it('decrements unread count', async () => {
      useNotificationStore.setState({
        notifications: [
          {
            id: 'n1',
            type: 'info',
            title: 'Test',
            content: '',
            is_read: false,
            created_at: new Date().toISOString(),
          },
          {
            id: 'n2',
            type: 'info',
            title: 'Test 2',
            content: '',
            is_read: false,
            created_at: new Date().toISOString(),
          },
        ],
        unreadCount: 2,
      });

      await useNotificationStore.getState().markAsRead('n1');

      expect(useNotificationStore.getState().unreadCount).toBe(1);
    });

    it('does not go below zero unread count', async () => {
      useNotificationStore.setState({
        notifications: [
          {
            id: 'n1',
            type: 'info',
            title: 'Test',
            content: '',
            is_read: false,
            created_at: new Date().toISOString(),
          },
        ],
        unreadCount: 0,
      });

      await useNotificationStore.getState().markAsRead('n1');

      expect(useNotificationStore.getState().unreadCount).toBe(0);
    });
  });

  describe('markAllAsRead', () => {
    it('marks all notifications as read', async () => {
      useNotificationStore.setState({
        notifications: [
          { id: 'n1', type: 'info', title: 'A', content: '', is_read: false, created_at: '' },
          { id: 'n2', type: 'info', title: 'B', content: '', is_read: false, created_at: '' },
          { id: 'n3', type: 'info', title: 'C', content: '', is_read: true, created_at: '' },
        ],
        unreadCount: 2,
      });

      await useNotificationStore.getState().markAllAsRead();

      const state = useNotificationStore.getState();
      expect(state.notifications.every((n) => n.is_read)).toBe(true);
      expect(state.unreadCount).toBe(0);
    });
  });

  describe('dismiss', () => {
    it('removes notification from list', () => {
      useNotificationStore.setState({
        notifications: [
          { id: 'n1', type: 'info', title: 'A', content: '', is_read: false, created_at: '' },
          { id: 'n2', type: 'info', title: 'B', content: '', is_read: true, created_at: '' },
        ],
        unreadCount: 1,
      });

      useNotificationStore.getState().dismiss('n1');

      const state = useNotificationStore.getState();
      expect(state.notifications).toHaveLength(1);
      expect(state.notifications[0].id).toBe('n2');
    });

    it('decrements unread count when dismissing unread notification', () => {
      useNotificationStore.setState({
        notifications: [
          { id: 'n1', type: 'info', title: 'A', content: '', is_read: false, created_at: '' },
        ],
        unreadCount: 1,
      });

      useNotificationStore.getState().dismiss('n1');

      expect(useNotificationStore.getState().unreadCount).toBe(0);
    });

    it('does not change unread count when dismissing read notification', () => {
      useNotificationStore.setState({
        notifications: [
          { id: 'n1', type: 'info', title: 'A', content: '', is_read: true, created_at: '' },
        ],
        unreadCount: 0,
      });

      useNotificationStore.getState().dismiss('n1');

      expect(useNotificationStore.getState().unreadCount).toBe(0);
    });
  });

  describe('setIsOpen', () => {
    it('sets isOpen to true', () => {
      useNotificationStore.getState().setIsOpen(true);
      expect(useNotificationStore.getState().isOpen).toBe(true);
    });

    it('sets isOpen to false', () => {
      useNotificationStore.getState().setIsOpen(true);
      useNotificationStore.getState().setIsOpen(false);
      expect(useNotificationStore.getState().isOpen).toBe(false);
    });
  });
});
