const { getDb, generateId } = require('./database');
const wsManager = require('./websocket');

// GET /api/projects - List all projects
async function listProjects(request, reply) {
  const db = getDb();
  const { status, limit = 20, offset = 0 } = request.query;
  
  let query = 'SELECT * FROM projects';
  const params = [];
  
  if (status) {
    query += ' WHERE status = ?';
    params.push(status);
  }
  
  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));
  
  const projects = db.prepare(query).all(...params);
  
  // Get total count
  let countQuery = 'SELECT COUNT(*) as total FROM projects';
  if (status) {
    countQuery += ' WHERE status = ?';
  }
  const { total } = db.prepare(countQuery).get(status ? [status] : []);
  
  return {
    projects: projects.map(p => ({
      ...p,
      config: JSON.parse(p.config || '{}')
    })),
    total,
    limit: parseInt(limit),
    offset: parseInt(offset)
  };
}

// GET /api/projects/:id - Get project details
async function getProject(request, reply) {
  const db = getDb();
  const { id } = request.params;
  
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  
  if (!project) {
    reply.code(404);
    return { error: 'Project not found' };
  }
  
  // Get counts
  const { agent_count } = db.prepare('SELECT COUNT(*) as agent_count FROM agents WHERE project_id = ?').get(id);
  const { task_count } = db.prepare('SELECT COUNT(*) as task_count FROM tasks WHERE project_id = ?').get(id);
  
  return {
    ...project,
    config: JSON.parse(project.config || '{}'),
    agent_count,
    task_count
  };
}

// POST /api/projects - Create new project
async function createProject(request, reply) {
  const db = getDb();
  const { name, description, config = {} } = request.body;
  
  if (!name) {
    reply.code(400);
    return { error: 'Name is required' };
  }
  
  const id = generateId();
  const owner_id = 'system'; // In real app, get from auth
  
  db.prepare(`
    INSERT INTO projects (id, name, description, owner_id, config)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, name, description || null, owner_id, JSON.stringify(config));
  
  reply.code(201);
  return { 
    id, 
    name, 
    description, 
    status: 'active',
    owner_id,
    created_at: new Date().toISOString()
  };
}

// GET /api/projects/:id/tasks - Get project tasks
async function getProjectTasks(request, reply) {
  const db = getDb();
  const { id } = request.params;
  const { status, agent_id, limit = 50, offset = 0 } = request.query;
  
  // Check project exists
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(id);
  if (!project) {
    reply.code(404);
    return { error: 'Project not found' };
  }
  
  let query = 'SELECT * FROM tasks WHERE project_id = ?';
  const params = [id];
  
  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }
  
  if (agent_id) {
    query += ' AND agent_id = ?';
    params.push(agent_id);
  }
  
  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));
  
  const tasks = db.prepare(query).all(...params);
  
  // Get total count
  let countQuery = 'SELECT COUNT(*) as total FROM tasks WHERE project_id = ?';
  if (status) countQuery += ' AND status = ?';
  if (agent_id) countQuery += ' AND agent_id = ?';
  const { total } = db.prepare(countQuery).get(params.slice(0, -2));
  
  return {
    tasks: tasks.map(t => ({
      ...t,
      payload: JSON.parse(t.payload || '{}'),
      result: t.result ? JSON.parse(t.result) : null
    })),
    total
  };
}

// POST /api/tasks - Create new task
async function createTask(request, reply) {
  const db = getDb();
  const { project_id, title, description, priority = 2, payload = {} } = request.body;
  
  if (!project_id || !title) {
    reply.code(400);
    return { error: 'project_id and title are required' };
  }
  
  // Check project exists
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(project_id);
  if (!project) {
    reply.code(404);
    return { error: 'Project not found' };
  }
  
  const id = generateId();
  const now = new Date().toISOString();
  
  db.prepare(`
    INSERT INTO tasks (id, project_id, title, description, priority, payload, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, project_id, title, description || null, priority, JSON.stringify(payload), now, now);
  
  const task = {
    id,
    project_id,
    title,
    description,
    status: 'pending',
    priority,
    created_at: now
  };
  
  // Emit WebSocket event
  wsManager.emitTaskCreated(project_id, task);
  
  reply.code(201);
  return task;
}

// PATCH /api/projects/:id/status - Update project status (triggers WS event)
async function updateProjectStatus(request, reply) {
  const db = getDb();
  const { id } = request.params;
  const { status } = request.body;
  
  if (!['active', 'paused', 'completed', 'archived'].includes(status)) {
    reply.code(400);
    return { error: 'Invalid status' };
  }
  
  const project = db.prepare('SELECT status FROM projects WHERE id = ?').get(id);
  if (!project) {
    reply.code(404);
    return { error: 'Project not found' };
  }
  
  const oldStatus = project.status;
  const now = new Date().toISOString();
  
  db.prepare('UPDATE projects SET status = ?, updated_at = ? WHERE id = ?')
    .run(status, now, id);
  
  // Emit WebSocket event
  wsManager.emitProjectStatusChanged(id, oldStatus, status);
  
  return { id, old_status: oldStatus, new_status: status, updated_at: now };
}

// GET /api/costs/summary - Cost analytics
async function getCostSummary(request, reply) {
  const db = getDb();
  const { project_id, from, to, group_by = 'day' } = request.query;
  
  let dateFormat;
  switch (group_by) {
    case 'week':
      dateFormat = "%Y-%W";
      break;
    case 'month':
      dateFormat = "%Y-%m";
      break;
    case 'day':
    default:
      dateFormat = "%Y-%m-%d";
  }
  
  let query = `
    SELECT 
      project_id,
      strftime('${dateFormat}', recorded_at) as date,
      COUNT(*) as request_count,
      SUM(prompt_tokens) as total_prompt_tokens,
      SUM(completion_tokens) as total_completion_tokens,
      SUM(total_tokens) as total_tokens,
      ROUND(SUM(cost_usd), 6) as total_cost_usd
    FROM costs
    WHERE 1=1
  `;
  const params = [];
  
  if (project_id) {
    query += ' AND project_id = ?';
    params.push(project_id);
  }
  
  if (from) {
    query += ' AND recorded_at >= ?';
    params.push(from);
  }
  
  if (to) {
    query += ' AND recorded_at <= ?';
    params.push(to);
  }
  
  query += ` GROUP BY project_id, strftime('${dateFormat}', recorded_at) ORDER BY date DESC`;
  
  const summary = db.prepare(query).all(...params);
  
  // Calculate grand total
  let totalQuery = `
    SELECT 
      COUNT(*) as requests,
      SUM(total_tokens) as tokens,
      ROUND(SUM(cost_usd), 6) as cost_usd
    FROM costs
    WHERE 1=1
  `;
  if (project_id) totalQuery += ' AND project_id = ?';
  if (from) totalQuery += ' AND recorded_at >= ?';
  if (to) totalQuery += ' AND recorded_at <= ?';
  
  const grandTotal = db.prepare(totalQuery).get(...params);
  
  return {
    summary: summary.map(row => ({
      ...row,
      total_prompt_tokens: row.total_prompt_tokens || 0,
      total_completion_tokens: row.total_completion_tokens || 0,
      total_tokens: row.total_tokens || 0,
      total_cost_usd: row.total_cost_usd || 0
    })),
    grand_total: {
      requests: grandTotal.requests || 0,
      tokens: grandTotal.tokens || 0,
      cost_usd: grandTotal.cost_usd || 0
    }
  };
}

// POST /api/costs - Record a cost (for testing/seed)
async function recordCost(request, reply) {
  const db = getDb();
  const { project_id, task_id, agent_id, model, prompt_tokens, completion_tokens, cost_usd } = request.body;
  
  if (!project_id || !model) {
    reply.code(400);
    return { error: 'project_id and model are required' };
  }
  
  const id = generateId();
  const total_tokens = (prompt_tokens || 0) + (completion_tokens || 0);
  const now = new Date().toISOString();
  
  db.prepare(`
    INSERT INTO costs (id, project_id, task_id, agent_id, model, prompt_tokens, completion_tokens, total_tokens, cost_usd, recorded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, project_id, task_id || null, agent_id || null, model, 
    prompt_tokens || 0, completion_tokens || 0, total_tokens, cost_usd || 0, now);
  
  // Emit cost updated event
  wsManager.emitCostUpdated(project_id, {
    cost_id: id,
    model,
    prompt_tokens: prompt_tokens || 0,
    completion_tokens: completion_tokens || 0,
    total_tokens,
    cost_usd: cost_usd || 0
  });
  
  reply.code(201);
  return { id, project_id, recorded_at: now };
}

// Chat Routes

// GET /api/chat/channels - List all channels for a user
async function listChannels(request, reply) {
  const db = getDb();
  const { user_id, type } = request.query;
  
  let query = 'SELECT * FROM chat_channels WHERE 1=1';
  const params = [];
  
  if (type) {
    query += ' AND type = ?';
    params.push(type);
  }
  
  // For DMs, only show channels where user is a participant
  if (user_id) {
    query += ' AND (type != "dm" OR participant_1_id = ? OR participant_2_id = ?)';
    params.push(user_id, user_id);
  }
  
  query += ' ORDER BY updated_at DESC';
  
  const channels = db.prepare(query).all(...params);
  
  // Get unread counts for each channel
  const channelsWithMeta = channels.map(channel => {
    const { message_count } = db.prepare(
      'SELECT COUNT(*) as message_count FROM chat_messages WHERE channel_id = ?'
    ).get(channel.id);
    
    const { last_message } = db.prepare(
      `SELECT content as last_message FROM chat_messages 
       WHERE channel_id = ? ORDER BY created_at DESC LIMIT 1`
    ).get(channel.id) || { last_message: null };
    
    return {
      ...channel,
      message_count,
      last_message
    };
  });
  
  return { channels: channelsWithMeta };
}

// POST /api/chat/channels - Create a new channel (DM or project channel)
async function createChannel(request, reply) {
  const db = getDb();
  const { name, type, project_id, participant_1_id, participant_2_id } = request.body;
  
  if (!name || !type) {
    reply.code(400);
    return { error: 'name and type are required' };
  }
  
  // For DM channels, check if one already exists between these participants
  if (type === 'dm' && participant_1_id && participant_2_id) {
    const existingDm = db.prepare(
      `SELECT * FROM chat_channels 
       WHERE type = 'dm' 
       AND ((participant_1_id = ? AND participant_2_id = ?) 
            OR (participant_1_id = ? AND participant_2_id = ?))`
    ).get(participant_1_id, participant_2_id, participant_2_id, participant_1_id);
    
    if (existingDm) {
      return { channel: existingDm, existing: true };
    }
  }
  
  const id = generateId();
  const now = new Date().toISOString();
  
  db.prepare(`
    INSERT INTO chat_channels (id, name, type, project_id, participant_1_id, participant_2_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, type, project_id || null, participant_1_id || null, participant_2_id || null, now, now);
  
  reply.code(201);
  return { 
    id, 
    name, 
    type, 
    project_id, 
    participant_1_id, 
    participant_2_id,
    created_at: now 
  };
}

// GET /api/chat/channels/:id/messages - Get messages for a channel
async function getChannelMessages(request, reply) {
  const db = getDb();
  const { id } = request.params;
  const { limit = 50, before } = request.query;
  
  // Check channel exists
  const channel = db.prepare('SELECT id FROM chat_channels WHERE id = ?').get(id);
  if (!channel) {
    reply.code(404);
    return { error: 'Channel not found' };
  }
  
  let query = `
    SELECT m.*, 
      CASE 
        WHEN m.sender_type = 'agent' THEN (SELECT name FROM chat_agents WHERE id = m.sender_id)
        ELSE (SELECT display_name FROM users WHERE id = m.sender_id)
      END as sender_name,
      CASE 
        WHEN m.sender_type = 'agent' THEN (SELECT avatar_url FROM chat_agents WHERE id = m.sender_id)
        ELSE (SELECT avatar_url FROM users WHERE id = m.sender_id)
      END as sender_avatar
    FROM chat_messages m
    WHERE m.channel_id = ?
  `;
  const params = [id];
  
  if (before) {
    query += ' AND m.created_at < ?';
    params.push(before);
  }
  
  query += ' ORDER BY m.created_at DESC LIMIT ?';
  params.push(parseInt(limit));
  
  const messages = db.prepare(query).all(...params);
  
  return { 
    messages: messages.reverse(), // Return oldest first
    channel_id: id 
  };
}

// POST /api/chat/channels/:id/messages - Send a message
async function sendMessage(request, reply) {
  const db = getDb();
  const { id } = request.params;
  const { content, sender_id, sender_type = 'user' } = request.body;
  
  if (!content || !sender_id) {
    reply.code(400);
    return { error: 'content and sender_id are required' };
  }
  
  // Check channel exists
  const channel = db.prepare('SELECT * FROM chat_channels WHERE id = ?').get(id);
  if (!channel) {
    reply.code(404);
    return { error: 'Channel not found' };
  }
  
  const messageId = generateId();
  const now = new Date().toISOString();
  
  db.prepare(`
    INSERT INTO chat_messages (id, channel_id, sender_id, sender_type, content, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(messageId, id, sender_id, sender_type, content, now);
  
  // Update channel's updated_at
  db.prepare('UPDATE chat_channels SET updated_at = ? WHERE id = ?').run(now, id);
  
  // Get sender info
  let senderInfo;
  if (sender_type === 'agent') {
    senderInfo = db.prepare('SELECT name, avatar_url, role, privilege FROM chat_agents WHERE id = ?').get(sender_id);
  } else {
    senderInfo = db.prepare('SELECT display_name as name, avatar_url, role FROM users WHERE id = ?').get(sender_id);
  }
  
  const message = {
    id: messageId,
    channel_id: id,
    sender_id,
    sender_type,
    content,
    created_at: now,
    sender_name: senderInfo?.name || sender_id,
    sender_avatar: senderInfo?.avatar_url,
    sender_role: senderInfo?.role,
    sender_privilege: senderInfo?.privilege
  };
  
  // Broadcast via WebSocket
  wsManager.broadcast('chat_message', { message }, channel.project_id || id);
  
  reply.code(201);
  return { message };
}

// GET /api/chat/agents - List all chat agents
async function listAgents(request, reply) {
  const db = getDb();
  const { status } = request.query;
  
  let query = 'SELECT * FROM chat_agents';
  const params = [];
  
  if (status) {
    query += ' WHERE status = ?';
    params.push(status);
  }
  
  query += ' ORDER BY name';
  
  const agents = db.prepare(query).all(...params);
  return { agents };
}

// GET /api/chat/users/:id - Get user by ID
async function getUser(request, reply) {
  const db = getDb();
  const { id } = request.params;
  
  const user = db.prepare('SELECT id, username, display_name, avatar_url, role, status, last_seen, created_at FROM users WHERE id = ?').get(id);
  
  if (!user) {
    reply.code(404);
    return { error: 'User not found' };
  }
  
  return { user };
}

// POST /api/chat/users - Create or login user
async function createUser(request, reply) {
  const db = getDb();
  const { username, display_name, avatar_url } = request.body;
  
  if (!username) {
    reply.code(400);
    return { error: 'username is required' };
  }
  
  // Check if user exists
  const existingUser = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (existingUser) {
    // Update last seen
    const now = new Date().toISOString();
    db.prepare('UPDATE users SET last_seen = ?, status = ? WHERE id = ?').run(now, 'online', existingUser.id);
    return { user: { ...existingUser, last_seen: now, status: 'online' }, existing: true };
  }
  
  const id = generateId();
  const now = new Date().toISOString();
  
  db.prepare(`
    INSERT INTO users (id, username, display_name, avatar_url, status, last_seen, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, username, display_name || username, avatar_url || null, 'online', now, now);
  
  reply.code(201);
  return { 
    user: {
      id,
      username,
      display_name: display_name || username,
      avatar_url,
      status: 'online',
      last_seen: now,
      created_at: now
    }
  };
}

// POST /api/chat/typing - Update typing indicator
async function updateTyping(request, reply) {
  const db = getDb();
  const { channel_id, user_id, is_typing } = request.body;
  
  if (is_typing) {
    db.prepare(`
      INSERT OR REPLACE INTO typing_indicators (channel_id, user_id, started_at)
      VALUES (?, ?, datetime('now'))
    `).run(channel_id, user_id);
  } else {
    db.prepare('DELETE FROM typing_indicators WHERE channel_id = ? AND user_id = ?').run(channel_id, user_id);
  }
  
  // Broadcast typing status
  wsManager.broadcast('typing', { channel_id, user_id, is_typing }, channel_id);
  
  return { success: true };
}

module.exports = {
  listProjects,
  getProject,
  createProject,
  getProjectTasks,
  createTask,
  updateProjectStatus,
  getCostSummary,
  recordCost,
  // Chat exports
  listChannels,
  createChannel,
  getChannelMessages,
  sendMessage,
  listAgents,
  getUser,
  createUser,
  updateTyping
};
