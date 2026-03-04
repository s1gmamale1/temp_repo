// API Service for PROJECT-CLAW Web HQ
// Replaces mockData with real API calls

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001/ws';

// Generic fetch wrapper with error handling
export async function fetchApi(endpoint: string, options?: RequestInit) {
  const url = `${API_BASE}${endpoint}`;

  // Get auth token from localStorage
  const token = localStorage.getItem('claw_token');

  const headers: Record<string, string> = {
    ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
    ...options?.headers as Record<string, string>,
  };

  // Add auth header if token exists
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else {
    console.warn(`[fetchApi] No auth token found for ${endpoint}`);
  }

  console.log(`[fetchApi] ${options?.method || 'GET'} ${url} - Auth: ${token ? 'present' : 'missing'}`);

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    let error;
    try {
      error = JSON.parse(errorText);
    } catch {
      error = { error: errorText || `HTTP ${response.status}` };
    }
    console.error(`[fetchApi] Error ${response.status} for ${endpoint}:`, error);
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// Projects API
export const projectsApi = {
  list: (params?: { status?: string; limit?: number; offset?: number }) => {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return fetchApi(`/api/projects${query ? `?${query}` : ''}`);
  },

  get: (id: string) => fetchApi(`/api/projects/${id}`),

  create: (data: { name: string; description?: string; config?: object }) =>
    fetchApi('/api/projects', { method: 'POST', body: JSON.stringify(data) }),

  getTasks: (id: string, params?: { status?: string; agent_id?: string }) => {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return fetchApi(`/api/projects/${id}/tasks${query ? `?${query}` : ''}`);
  },

  updateStatus: (id: string, status: string) =>
    fetchApi(`/api/projects/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
};

// Tasks API - Phase 3 Task Assignment System
export interface Task {
  id: string;
  title: string;
  description: string;
  project_id: string;
  status: 'draft' | 'pending' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  created_by: string;
  created_at: string;
  updated_at: string;
  due_date?: string;
  estimated_hours?: number;
  tags?: string[];
  assigned_agent?: {
    id: string;
    name: string;
    avatar_url?: string;
  };
  assignment?: {
    id: string;
    status: 'pending' | 'accepted' | 'declined' | 'completed';
    assigned_at: string;
    accepted_at?: string;
    declined_at?: string;
    declined_reason?: string;
  };
}

export interface TaskUpdate {
  id: string;
  task_id: string;
  agent_id: string;
  agent_name: string;
  update_type: 'progress' | 'question' | 'blocker' | 'completion' | 'system';
  content: string;
  created_at: string;
  is_public: boolean;
  reply_count?: number;
}

export const tasksApi = {
  // Create a new task
  create: (projectId: string, data: {
    title: string;
    description?: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    due_date?: string;
    estimated_hours?: number;
    tags?: string[];
  }) => fetchApi(`/api/projects/${projectId}/tasks`, {
    method: 'POST',
    body: JSON.stringify(data)
  }),

  // Get all tasks for a project
  list: (projectId: string, params?: {
    status?: string;
    assigned_to?: string;
    priority?: string;
  }) => {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return fetchApi(`/api/projects/${projectId}/tasks${query ? `?${query}` : ''}`);
  },

  // Get single task details
  get: (taskId: string) => fetchApi(`/api/tasks/${taskId}`),

  // Assign task to agent
  assign: (taskId: string, agentId: string, message?: string) =>
    fetchApi(`/api/tasks/${taskId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ agent_id: agentId, message })
    }),

  // Accept task assignment
  accept: (taskId: string, message?: string) =>
    fetchApi(`/api/tasks/${taskId}/accept`, {
      method: 'POST',
      body: JSON.stringify(message ? { message } : {})
    }),

  // Decline task assignment
  decline: (taskId: string, reason?: string) =>
    fetchApi(`/api/tasks/${taskId}/decline`, {
      method: 'POST',
      body: JSON.stringify(reason ? { reason } : {})
    }),

  // Add update to task
  addUpdate: (taskId: string, content: string, updateType: TaskUpdate['update_type'] = 'progress', isPublic = true) =>
    fetchApi(`/api/tasks/${taskId}/updates`, {
      method: 'POST',
      body: JSON.stringify({ content, update_type: updateType, is_public: isPublic })
    }),

  // Get task updates
  getUpdates: (taskId: string, params?: { limit?: number; offset?: number }) => {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return fetchApi(`/api/tasks/${taskId}/updates${query ? `?${query}` : ''}`);
  },

  // Complete task
  complete: (taskId: string) =>
    fetchApi(`/api/tasks/${taskId}/complete`, { method: 'POST' }),

  // Update task
  update: (taskId: string, data: Partial<Task>) =>
    fetchApi(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    }),

  // Delete task
  delete: (taskId: string) =>
    fetchApi(`/api/tasks/${taskId}`, { method: 'DELETE' }),
};

// Costs API
export const costsApi = {
  getSummary: (params?: {
    project_id?: string;
    from?: string;
    to?: string;
    group_by?: 'day' | 'week' | 'month';
  }) => {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return fetchApi(`/api/costs/live${query ? `?${query}` : ''}`);
  },

  record: (data: {
    project_id: string;
    task_id?: string;
    agent_id?: string;
    model: string;
    prompt_tokens?: number;
    completion_tokens?: number;
    cost_usd?: number;
  }) => fetchApi('/api/costs', { method: 'POST', body: JSON.stringify(data) }),
};

// Chat API - Updated for new channel system
export const chatApi = {
  // Channels
  listChannels: (params?: { type?: string }) => {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return fetchApi(`/api/channels${query ? `?${query}` : ''}`);
  },

  createProjectChannel: (projectId: string, data: { name?: string; description?: string }) => {
    return fetchApi(`/api/channels/project/${projectId}`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  createOrGetDm: (userId: string, agentId?: string) => {
    return fetchApi(`/api/dm/${userId}`, {
      method: 'POST',
      body: JSON.stringify(agentId ? { agent_id: agentId } : {})
    });
  },

  // Messages - New channel-based endpoints
  getChannelMessages: (channelId: string, params?: { limit?: number; before?: string }) => {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return fetchApi(`/api/channels/${channelId}/messages${query ? `?${query}` : ''}`);
  },

  sendMessage: (channelId: string, data: { content: string; metadata?: object }) => {
    return fetchApi(`/api/channels/${channelId}/messages`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  // Legacy endpoints (for backward compatibility)
  getMessages: (channelId: string, params?: { limit?: number; before?: string }) => {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return fetchApi(`/api/messages/${channelId}${query ? `?${query}` : ''}`);
  },

  // DM Methods
  getDMChannels: () => fetchApi(`/api/dm`),

  getDMMessages: (agentId: string) => fetchApi(`/api/dm/${agentId}`),

  sendDM: (agentId: string, content: string) =>
    fetchApi(`/api/dm/${agentId}`, {
      method: 'POST',
      body: JSON.stringify({ content })
    }),

  // Agents
  listAgents: (params?: { status?: string }) => {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return fetchApi(`/api/agents${query ? `?${query}` : ''}`);
  },

  // Users
  getUser: (id: string) => {
    const currentUser = userSession.getUser();
    if (currentUser && currentUser.id === id) {
      return fetchApi(`/api/auth/me`);
    }
    throw new Error('User lookup by ID not supported');
  },

  createUser: (data: {
    username: string;
    display_name?: string;
    avatar_url?: string;
  }) => fetchApi('/api/auth/register', {
    method: 'POST', body: JSON.stringify({
      login: data.username,
      name: data.display_name || data.username,
      avatar_url: data.avatar_url
    })
  }),
};

// Health check
export const healthApi = {
  check: () => fetchApi('/health'),
};

// Machines API
export const machinesApi = {
  list: () => fetchApi('/api/machines'),
  get: (id: string) => fetchApi(`/api/machines/${id}`),
};

// Agent Types
export interface AgentRegistration {
  name: string;
  handle: string;
  email?: string;
  role: 'Task Lead' | 'Researcher' | 'Developer' | 'Designer' | 'QA' | 'DevOps';
  skills: string[];
  specialties?: string;
  experience: 'Junior' | 'Mid' | 'Senior' | 'Expert';
  apiKeys?: {
    openai?: string;
    moonshot?: string;
  };
}

export interface Agent {
  id: string;
  name: string;
  handle: string;
  email?: string;
  role: string;
  // New runtime status values + legacy for compatibility
  status: 'online' | 'working' | 'idle' | 'offline' | 'approved' | 'pending' | 'rejected' | 'inactive';
  skills: string[];
  specialties: string[];
  experience_level: string;
  // Boolean flags (all actual booleans)
  is_approved: boolean;
  is_active: boolean;
  avatar_url?: string;
  created_at: string;
  // Legacy field support
  experience?: string;
}

// Agents API
export const agentsApi = {
  register: (data: AgentRegistration) =>
    fetchApi('/api/agents/register', { method: 'POST', body: JSON.stringify(data) }),
  list: (params?: { status?: string; role?: string }) => {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return fetchApi(`/api/agents${query ? `?${query}` : ''}`);
  },
  getById: (id: string) => fetchApi(`/api/agents/${id}`),
  updateStatus: (id: string, status: string) =>
    fetchApi(`/api/agents/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
  approve: (id: string) => fetchApi(`/api/agents/${id}/approve`, { method: 'POST' }),
  reject: (id: string) => fetchApi(`/api/agents/${id}/reject`, { method: 'POST' }),
  sendMessage: (id: string, content: string) =>
    fetchApi(`/api/agents/${id}/message`, { method: 'POST', body: JSON.stringify({ content }) }),
  assignToProject: (agentId: string, projectId: string) =>
    fetchApi(`/api/agents/${agentId}/projects`, { method: 'POST', body: JSON.stringify({ project_id: projectId }) }),
};

// Admin API
export const adminApi = {
  // Pending agent registrations
  getPendingAgents: () => fetchApi('/api/admin/agents/pending'),

  // Approve agent
  approveAgent: (agentId: string) =>
    fetchApi(`/api/admin/agents/${agentId}/approve`, { method: 'POST' }),

  // Reject agent
  rejectAgent: (agentId: string) =>
    fetchApi(`/api/admin/agents/${agentId}/reject`, { method: 'POST' }),

  // List all approved agents
  getApprovedAgents: () => fetchApi('/api/admin/agents/approved'),

  // Get all users
  getUsers: () => fetchApi('/api/admin/users'),
};

// Credits API for token usage (deprecated - use tokensApi instead)
export const creditsApi = {
  // Get credits by provider
  getByProvider: () => fetchApi('/api/costs/credits'),

  // Get detailed usage stats
  getUsage: (params?: { from?: string; to?: string }) => {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return fetchApi(`/api/costs/actual${query ? `?${query}` : ''}`);
  },

  // Get per-agent usage
  getAgentUsage: () => fetchApi('/api/costs/agents'),
};

// Tokens API - NEW working endpoints
export const tokensApi = {
  // Get dashboard summary
  getDashboard: () => fetchApi('/api/tokens/dashboard'),

  // Get provider details
  getProvider: (provider: string) => fetchApi(`/api/tokens/providers/${provider}`),

  // Get usage data with time period
  getUsage: (params?: { days?: number; from?: string; to?: string }) => {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return fetchApi(`/api/tokens/usage${query ? `?${query}` : ''}`);
  },

  // Get usage data by specific provider
  getUsageByProvider: (provider: string, params?: { days?: number; from?: string; to?: string }) => {
    const query = new URLSearchParams();
    if (params?.days) query.append('days', params.days.toString());
    if (params?.from) query.append('from', params.from);
    if (params?.to) query.append('to', params.to);
    return fetchApi(`/api/tokens/usage?provider=${provider}&${query.toString()}`);
  },

  // Get all models
  getAllModels: () => fetchApi('/api/tokens/models'),
};

// WebSocket client
export class WebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectInterval = 3000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private projectIds: string[] = [];
  private channelIds: string[] = [];
  private messageHandlers: Map<string, ((data: any) => void)[]> = new Map();
  private currentUserId: string | undefined = undefined;

  connect(projectIds: string[] = [], userId?: string) {
    this.projectIds = projectIds;
    this.currentUserId = userId;
    const token = localStorage.getItem('claw_token') || '';
    const params = new URLSearchParams();
    if (token) params.set('token', token);
    if (projectIds.length > 0) params.set('projects', projectIds.join(','));
    const url = `${WS_URL}${params.toString() ? '?' + params.toString() : ''}`;

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      this.emit('connected', {});

      // Re-subscribe to channels after reconnect
      this.channelIds.forEach(channelId => {
        this.sendMessage({
          action: 'subscribe_channel',
          channel_id: channelId
        });
      });
    };

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      this.emit(message.event, message.data);
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected, reconnecting...');
      this.emit('disconnected', {});
      this.reconnectTimer = setTimeout(() => this.connect(this.projectIds, this.currentUserId), this.reconnectInterval);
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.emit('error', error);
    };
  }

  subscribe(projectId: string) {
    this.sendMessage({ action: 'subscribe', project_id: projectId });
  }

  unsubscribe(projectId: string) {
    this.sendMessage({ action: 'unsubscribe', project_id: projectId });
  }

  subscribeToChannel(channelId: string) {
    if (!this.channelIds.includes(channelId)) {
      this.channelIds.push(channelId);
    }
    this.sendMessage({ action: 'subscribe_channel', channel_id: channelId });
  }

  unsubscribeFromChannel(channelId: string) {
    this.channelIds = this.channelIds.filter(id => id !== channelId);
    this.sendMessage({ action: 'unsubscribe_channel', channel_id: channelId });
  }

  send(data: object) {
    this.sendMessage(data);
  }

  sendChatMessage(channelId: string, content: string, senderType: 'agent' | 'user' = 'user') {
    this.sendMessage({
      action: 'chat_message',
      channel_id: channelId,
      content,
      sender_id: this.currentUserId || 'anonymous',
      sender_type: senderType
    });
  }

  sendTyping(channelId: string, isTyping: boolean) {
    this.sendMessage({
      action: 'typing',
      channel_id: channelId,
      user_id: this.currentUserId || 'anonymous',
      is_typing: isTyping
    });
  }

  private sendMessage(data: object) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  on(event: string, handler: (data: any) => void) {
    if (!this.messageHandlers.has(event)) {
      this.messageHandlers.set(event, []);
    }
    this.messageHandlers.get(event)!.push(handler);
  }

  off(event: string, handler: (data: any) => void) {
    const handlers = this.messageHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) handlers.splice(index, 1);
    }
  }

  private emit(event: string, data: any) {
    const handlers = this.messageHandlers.get(event);
    handlers?.forEach((handler) => handler(data));
  }

  setUserId(userId: string) {
    this.currentUserId = userId;
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.ws?.close();
  }
}

// Export singleton instances
export const wsClient = new WebSocketClient();

// Auth API
export const authApi = {
  login: async (credentials: { login: string; password: string } | string, password?: string) => {
    const login = typeof credentials === 'object' ? credentials.login : credentials;
    const pwd = typeof credentials === 'object' ? credentials.password : password;
    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login, password: pwd }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Login failed' }));
      throw new Error(error.error || 'Login failed');
    }

    return response.json();
  },

  register: async (username: string, password: string, display_name?: string) => {
    const response = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, display_name }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Registration failed' }));
      throw new Error(error.error || 'Registration failed');
    }

    return response.json();
  },

  registerAgent: async (data: { name: string; role: string; description: string }) => {
    const response = await fetch(`${API_BASE}/api/agents/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Agent registration failed' }));
      throw new Error(error.error || 'Agent registration failed');
    }

    return response.json();
  },

  me: async (token: string) => {
    const response = await fetch(`${API_BASE}/api/auth/me`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
    });

    if (!response.ok) {
      throw new Error('Session expired');
    }

    return response.json();
  }
};

// Project Agents API
export const projectAgentsApi = {
  assign: (projectId: string, agentId: string, role: string) =>
    fetchApi(`/api/projects/${projectId}/assign-agent`, {
      method: 'POST',
      body: JSON.stringify({ agent_id: agentId, role })
    }),
  remove: (projectId: string, agentId: string) =>
    fetchApi(`/api/projects/${projectId}/agents/${agentId}`, { method: 'DELETE' }),
  updateRole: (projectId: string, agentId: string, role: string) =>
    fetchApi(`/api/projects/${projectId}/agents/${agentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role })
    }),
  listByProject: (projectId: string) =>
    fetchApi(`/api/projects/${projectId}/agents`),
  listByAgent: (agentId: string) =>
    fetchApi(`/api/agents/${agentId}/projects`),
};

// User session management
export const userSession = {
  getUser: () => {
    const userJson = localStorage.getItem('claw_user');
    return userJson ? JSON.parse(userJson) : null;
  },

  getToken: () => {
    return localStorage.getItem('claw_token');
  },

  setUser: (user: { id: string; name: string; email?: string; avatar_url?: string }, token?: string) => {
    localStorage.setItem('claw_user', JSON.stringify(user));
    if (token) {
      localStorage.setItem('claw_token', token);
    }
    wsClient.setUserId(user.id);
  },

  clearUser: () => {
    localStorage.removeItem('claw_user');
    localStorage.removeItem('claw_token');
    wsClient.setUserId('anonymous');
  },

  isLoggedIn: () => {
    return !!localStorage.getItem('claw_token');
  }
};