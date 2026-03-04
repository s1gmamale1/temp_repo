import { create } from 'zustand';
import { chatApi, wsClient } from '../services/api';

// ── Types ─────────────────────────────────────────────────────────────────

export interface Message {
  id: string;
  channel_id: string;
  content: string;
  created_at: string;
  message_type?: string;
  sender_id?: string;
  sender_name?: string;
  sender_type?: 'user' | 'agent';
  user_id?: string;
  user_name?: string;
  agent_id?: string;
  agent_name?: string;
  agent_role?: string;
  metadata?: Record<string, any>;
  isOptimistic?: boolean;
}

export interface Channel {
  id: string;
  name: string;
  type: 'general' | 'project' | 'dm';
  description?: string;
  color?: string;
  project_id?: string;
  project_name?: string;
  is_dm?: boolean;
  dm_agent_id?: string;
  dm_agent_name?: string;
  dm_agent_role?: string;
  dm_agent_status?: 'online' | 'offline';
  dm_user_id?: string;
  unread_count?: number;
}

export interface Agent {
  id: string;
  name: string;
  handle?: string;
  role: string;
  status: 'online' | 'offline';
  avatar_url?: string;
}

// ── Normalise raw message from any source ─────────────────────────────────

function norm(raw: any, cid?: string): Message {
  const channel_id = raw.channel_id || cid || raw.channel || '';
  return {
    id: raw.id,
    channel_id,
    content: raw.content,
    created_at: raw.created_at,
    message_type: raw.message_type || 'text',
    sender_id: raw.sender_id || raw.user_id || raw.agent_id || '',
    sender_name: raw.sender_name || raw.user_name || raw.agent_name || 'Unknown',
    sender_type: raw.sender_type ?? (raw.agent_id ? 'agent' : 'user'),
    user_id: raw.user_id,
    user_name: raw.user_name,
    agent_id: raw.agent_id,
    agent_name: raw.agent_name,
    agent_role: raw.agent_role,
    metadata: typeof raw.metadata === 'string'
      ? (() => { try { return JSON.parse(raw.metadata); } catch { return {}; } })()
      : raw.metadata || {},
  };
}

// ── Store ─────────────────────────────────────────────────────────────────

interface State {
  messages: Record<string, Message>;
  channelMessages: Record<string, string[]>;
  channels: Record<string, Channel>;
  currentChannelId: string | null;
  agents: Agent[];
  isConnected: boolean;
  loading: boolean;
  error: string | null;
  typingUsers: Set<string>;
}

interface Actions {
  setCurrentChannel: (id: string) => void;
  fetchChannels: () => Promise<void>;
  fetchMessages: (channelId: string) => Promise<void>;
  sendMessage: (channelId: string, content: string, user?: { id: string; name: string }) => Promise<void>;
  fetchAgents: () => Promise<void>;
  openDm: (agentId: string, userId: string) => Promise<string | null>;
  setIsConnected: (v: boolean) => void;
  clearError: () => void;
  // Internal (used by WS listeners)
  _putMessage: (msg: Message) => void;
  _putChannel: (ch: Channel) => void;
  _agentPresence: (agentId: string, online: boolean) => void;
  _setTyping: (name: string, typing: boolean) => void;
}

type ChatStore = State & Actions;

const API = () => (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001';
const token = () => localStorage.getItem('claw_token') || '';

export const useChatStore = create<ChatStore>()((set, get) => ({
  // ── State ────────────────────────────────────────────────────────────────
  messages: {},
  channelMessages: {},
  channels: { general: { id: 'general', name: 'general', type: 'general', description: 'General discussion' } },
  currentChannelId: null,
  agents: [],
  isConnected: false,
  loading: false,
  error: null,
  typingUsers: new Set(),

  // ── Actions ──────────────────────────────────────────────────────────────

  setCurrentChannel: (id) => {
    set(s => ({
      currentChannelId: id,
      // Clear unread badge immediately on open
      channels: s.channels[id]
        ? { ...s.channels, [id]: { ...s.channels[id], unread_count: 0 } }
        : s.channels,
    }));
    get().fetchMessages(id); // always refresh on select (also triggers updateLastRead)
    wsClient.subscribeToChannel(id);
  },

  fetchChannels: async () => {
    set({ loading: true, error: null });
    try {
      const data = await chatApi.listChannels();
      const list: Channel[] = data?.channels || [];
      const map: Record<string, Channel> = {};
      for (const ch of list) map[ch.id] = ch;
      if (!map['general']) {
        map['general'] = { id: 'general', name: 'general', type: 'general', description: 'General discussion' };
      }
      set({ channels: map });
      // Subscribe to all channels
      for (const id of Object.keys(map)) wsClient.subscribeToChannel(id);
    } catch (err) {
      console.error('fetchChannels:', err);
      set({ error: 'Failed to load channels' });
    } finally {
      set({ loading: false });
    }
  },

  fetchMessages: async (channelId) => {
    try {
      const data = await chatApi.getChannelMessages(channelId);
      const raw: any[] = data?.messages || [];
      const msgs = raw.map(m => norm(m, channelId));
      const byId: Record<string, Message> = {};
      for (const m of msgs) byId[m.id] = m;
      set(s => ({
        messages: { ...s.messages, ...byId },
        channelMessages: { ...s.channelMessages, [channelId]: msgs.map(m => m.id) },
      }));
    } catch (err) {
      console.error('fetchMessages:', err);
    }
  },

  sendMessage: async (channelId, content, currentUser) => {
    const tempId = `temp-${Date.now()}`;
    get()._putMessage({
      id: tempId, channel_id: channelId, content,
      created_at: new Date().toISOString(), message_type: 'text',
      sender_id: currentUser?.id, sender_name: currentUser?.name || 'You',
      sender_type: 'user', isOptimistic: true,
    });
    try {
      const res = await chatApi.sendMessage(channelId, { content });
      const real = res?.message;
      if (real) {
        const m = norm(real, channelId);
        set(s => {
          const ids = (s.channelMessages[channelId] || []).map(id => id === tempId ? m.id : id);
          const msgs = { ...s.messages, [m.id]: m };
          delete msgs[tempId];
          return { messages: msgs, channelMessages: { ...s.channelMessages, [channelId]: ids } };
        });
      }
    } catch (err: any) {
      console.error('sendMessage failed:', err);
      set(s => ({
        messages: { ...s.messages, [tempId]: { ...s.messages[tempId], isOptimistic: false } },
        error: 'Message failed to send',
      }));
    }
  },

  fetchAgents: async () => {
    try {
      const res = await fetch(`${API()}/api/agents/chat`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      set({ agents: data?.agents || [] });
    } catch (err) {
      console.error('fetchAgents:', err);
    }
  },

  openDm: async (agentId, userId) => {
    try {
      const res = await fetch(`${API()}/api/channels/dm/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ agent_id: agentId }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const ch: Channel = data?.channel;
      if (ch) {
        get()._putChannel(ch);
        wsClient.subscribeToChannel(ch.id);
        return ch.id;
      }
    } catch (err) {
      console.error('openDm:', err);
    }
    return null;
  },

  setIsConnected: (v) => set({ isConnected: v }),
  clearError: () => set({ error: null }),

  _putMessage: (msg) => set(s => {
    const cid = msg.channel_id;
    if (!cid) return s;
    const ids = s.channelMessages[cid] || [];
    if (ids.includes(msg.id)) return s;
    return {
      messages: { ...s.messages, [msg.id]: msg },
      channelMessages: { ...s.channelMessages, [cid]: [...ids, msg.id] },
    };
  }),

  _putChannel: (ch) => set(s => ({ channels: { ...s.channels, [ch.id]: ch } })),

  _agentPresence: (agentId, online) => set(s => ({
    agents: s.agents.map(a =>
      a.id === agentId ? { ...a, status: online ? 'online' : 'offline' } : a
    ),
    channels: Object.fromEntries(
      Object.entries(s.channels).map(([id, ch]) =>
        ch.dm_agent_id === agentId
          ? [id, { ...ch, dm_agent_status: (online ? 'online' : 'offline') as 'online' | 'offline' }]
          : [id, ch]
      )
    ),
  })),

  _setTyping: (name, typing) => set(s => {
    const t = new Set(s.typingUsers);
    typing ? t.add(name) : t.delete(name);
    return { typingUsers: t };
  }),
}));

// ── Wire WebSocket events ─────────────────────────────────────────────────

wsClient.on('connected', () => {
  const s = useChatStore.getState();
  s.setIsConnected(true);
  // Re-subscribe to all channels after reconnect
  for (const id of Object.keys(s.channels)) wsClient.subscribeToChannel(id);
});

wsClient.on('disconnected', () => {
  useChatStore.getState().setIsConnected(false);
});

// New message (from HTTP route broadcast via emitChannelMessage)
wsClient.on('chat:message', (data: any) => {
  if (!data?.channel_id) return;
  useChatStore.getState()._putMessage(norm(data));
});

// Legacy event name
wsClient.on('message:new', (data: any) => {
  const cid = data?.channel_id || data?.channel;
  if (!cid) return;
  useChatStore.getState()._putMessage(norm(data, cid));
});

// New channel created (project, DM)
wsClient.on('chat:channel_created', (data: any) => {
  if (!data?.channel_id) return;
  const ch: Channel = {
    id: data.channel_id,
    name: data.name,
    type: data.type || 'general',
    project_id: data.project_id,
    dm_agent_id: data.dm_agent_id,
    dm_agent_name: data.dm_agent_name,
  };
  useChatStore.getState()._putChannel(ch);
  wsClient.subscribeToChannel(ch.id);
});

// Agent online/offline presence
wsClient.on('user:presence', (d: any) => {
  if (d?.user_id) useChatStore.getState()._agentPresence(d.user_id, !!d.is_online);
});
wsClient.on('user:online_status', (d: any) => {
  if (d?.user_id) useChatStore.getState()._agentPresence(d.user_id, !!d.is_online);
});

// Typing indicators
const typing = (d: any, isTyping: boolean) => {
  if (!d?.user_id) return;
  const s = useChatStore.getState();
  const name = s.agents.find(a => a.id === d.user_id)?.name || d.user_id;
  s._setTyping(name, isTyping);
  if (isTyping) setTimeout(() => s._setTyping(name, false), 4000);
};
wsClient.on('chat:typing_start', (d: any) => typing(d, true));
wsClient.on('chat:typing_stop', (d: any) => typing(d, false));
wsClient.on('user:typing', (d: any) => typing(d, d?.is_typing ?? true));