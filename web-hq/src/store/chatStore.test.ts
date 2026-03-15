import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore } from './chatStore';
import type { Message, Channel } from './chatStore';

describe('chatStore', () => {
  beforeEach(() => {
    // Reset the store to initial state before each test
    useChatStore.setState({
      messages: {},
      channelMessages: {},
      channels: {
        general: {
          id: 'general',
          name: 'general',
          type: 'general',
          description: 'General discussion',
        },
      },
      currentChannelId: null,
      agents: [],
      isConnected: false,
      loading: false,
      error: null,
      typingUsers: new Set(),
      openingDm: null,
    });
  });

  describe('initial state', () => {
    it('has a default general channel', () => {
      const state = useChatStore.getState();
      expect(state.channels).toHaveProperty('general');
      expect(state.channels['general'].name).toBe('general');
    });

    it('has empty messages', () => {
      const state = useChatStore.getState();
      expect(Object.keys(state.messages)).toHaveLength(0);
    });

    it('has empty channelMessages', () => {
      const state = useChatStore.getState();
      expect(Object.keys(state.channelMessages)).toHaveLength(0);
    });

    it('has no active channel', () => {
      const state = useChatStore.getState();
      expect(state.currentChannelId).toBeNull();
    });

    it('is not connected', () => {
      const state = useChatStore.getState();
      expect(state.isConnected).toBe(false);
    });
  });

  describe('_putMessage', () => {
    it('adds a message to the correct channel', () => {
      const msg: Message = {
        id: 'msg-1',
        channel_id: 'general',
        content: 'Hello world',
        created_at: new Date().toISOString(),
        sender_id: 'user-1',
        sender_name: 'Test User',
        sender_type: 'user',
      };

      useChatStore.getState()._putMessage(msg);

      const state = useChatStore.getState();
      expect(state.messages['msg-1']).toBeDefined();
      expect(state.messages['msg-1'].content).toBe('Hello world');
      expect(state.channelMessages['general']).toContain('msg-1');
    });

    it('does not add message with empty channel_id', () => {
      const msg: Message = {
        id: 'msg-2',
        channel_id: '',
        content: 'No channel',
        created_at: new Date().toISOString(),
      };

      useChatStore.getState()._putMessage(msg);

      const state = useChatStore.getState();
      expect(state.messages['msg-2']).toBeUndefined();
    });

    it('deduplicates messages with the same ID', () => {
      const msg: Message = {
        id: 'msg-dup',
        channel_id: 'general',
        content: 'First version',
        created_at: new Date().toISOString(),
        sender_id: 'user-1',
        sender_name: 'Test User',
      };

      useChatStore.getState()._putMessage(msg);
      useChatStore.getState()._putMessage({
        ...msg,
        content: 'Second version',
      });

      const state = useChatStore.getState();
      // Should keep the first version since ID already exists
      expect(state.messages['msg-dup'].content).toBe('First version');
      // Channel messages should only have one entry
      expect(state.channelMessages['general'].filter((id) => id === 'msg-dup')).toHaveLength(1);
    });

    it('adds multiple messages to the same channel', () => {
      const msg1: Message = {
        id: 'msg-a',
        channel_id: 'general',
        content: 'First',
        created_at: new Date().toISOString(),
      };
      const msg2: Message = {
        id: 'msg-b',
        channel_id: 'general',
        content: 'Second',
        created_at: new Date().toISOString(),
      };

      useChatStore.getState()._putMessage(msg1);
      useChatStore.getState()._putMessage(msg2);

      const state = useChatStore.getState();
      expect(state.channelMessages['general']).toHaveLength(2);
      expect(state.channelMessages['general']).toContain('msg-a');
      expect(state.channelMessages['general']).toContain('msg-b');
    });
  });

  describe('_putChannel', () => {
    it('adds a new channel', () => {
      const channel: Channel = {
        id: 'project-1',
        name: 'Project Alpha',
        type: 'project',
        project_id: 'p1',
      };

      useChatStore.getState()._putChannel(channel);

      const state = useChatStore.getState();
      expect(state.channels['project-1']).toBeDefined();
      expect(state.channels['project-1'].name).toBe('Project Alpha');
    });

    it('does not overwrite an existing channel', () => {
      const channel: Channel = {
        id: 'general',
        name: 'New General',
        type: 'general',
      };

      useChatStore.getState()._putChannel(channel);

      const state = useChatStore.getState();
      // Should keep original name since channel ID 'general' already exists
      expect(state.channels['general'].name).toBe('general');
    });
  });

  describe('setIsConnected', () => {
    it('updates the connection status to true', () => {
      useChatStore.getState().setIsConnected(true);
      expect(useChatStore.getState().isConnected).toBe(true);
    });

    it('updates the connection status to false', () => {
      useChatStore.getState().setIsConnected(true);
      useChatStore.getState().setIsConnected(false);
      expect(useChatStore.getState().isConnected).toBe(false);
    });
  });

  describe('clearError', () => {
    it('clears the error state', () => {
      useChatStore.setState({ error: 'Something went wrong' });
      useChatStore.getState().clearError();
      expect(useChatStore.getState().error).toBeNull();
    });
  });

  describe('_agentPresence', () => {
    it('updates agent online status', () => {
      useChatStore.setState({
        agents: [
          { id: 'agent-1', name: 'Agent One', role: 'Developer', status: 'offline' },
        ],
      });

      useChatStore.getState()._agentPresence('agent-1', true);

      const state = useChatStore.getState();
      expect(state.agents[0].status).toBe('online');
    });

    it('updates DM channel agent status', () => {
      useChatStore.setState({
        channels: {
          'dm-1': {
            id: 'dm-1',
            name: 'DM with Agent',
            type: 'dm',
            dm_agent_id: 'agent-1',
            dm_agent_status: 'offline',
          },
        },
      });

      useChatStore.getState()._agentPresence('agent-1', true);

      const state = useChatStore.getState();
      expect(state.channels['dm-1'].dm_agent_status).toBe('online');
    });
  });

  describe('_setTyping', () => {
    it('adds a typing user', () => {
      useChatStore.getState()._setTyping('Alice', true);
      expect(useChatStore.getState().typingUsers.has('Alice')).toBe(true);
    });

    it('removes a typing user', () => {
      useChatStore.getState()._setTyping('Alice', true);
      useChatStore.getState()._setTyping('Alice', false);
      expect(useChatStore.getState().typingUsers.has('Alice')).toBe(false);
    });
  });
});
