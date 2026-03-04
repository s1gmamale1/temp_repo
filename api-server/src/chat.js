/**
 * Chat System - Messages, DM Channels, Agent Responses
 */

const { getDb, generateId } = require('./database');
const wsManager = require('./websocket');

/**
 * Send a message
 */
async function sendMessage(userId, content, options = {}) {
  const db = getDb();
  const {
    channel = 'general',
    agentId = null,
    isDm = false,
    dmChannelId = null,
    messageType = 'text',
    metadata = {},
    parentMessageId = null
  } = options;

  const id = generateId();
  const now = new Date().toISOString();

  // If DM, ensure dm_channel_id is set
  let finalDmChannelId = dmChannelId;
  if (isDm && !dmChannelId && agentId) {
    // Find or create DM channel
    const dmChannel = await getOrCreateDmChannel(userId, agentId);
    finalDmChannelId = dmChannel.id;
  }

  db.prepare(`
    INSERT INTO messages (
      id, user_id, agent_id, content, channel, message_type,
      metadata, is_dm, dm_channel_id, parent_message_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    userId,
    agentId,
    content,
    channel,
    messageType,
    JSON.stringify(metadata),
    isDm ? 1 : 0,
    finalDmChannelId,
    parentMessageId,
    now
  );

  const message = {
    id,
    user_id: userId,
    agent_id: agentId,
    content,
    channel,
    message_type: messageType,
    metadata,
    is_dm: isDm,
    dm_channel_id: finalDmChannelId,
    parent_message_id: parentMessageId,
    created_at: now
  };

  // Broadcast via WebSocket
  wsManager.emitMessage(message);

  return message;
}

/**
 * Get or create DM channel between user and agent
 */
async function getOrCreateDmChannel(userId, agentId) {
  const db = getDb();

  // Check if exists
  let channel = db.prepare(`
    SELECT * FROM dm_channels WHERE user_id = ? AND agent_id = ?
  `).get(userId, agentId);

  if (channel) {
    // Update last activity
    db.prepare(`
      UPDATE dm_channels SET updated_at = datetime('now') WHERE id = ?
    `).run(channel.id);
    return channel;
  }

  // Create new channel
  const id = generateId();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO dm_channels (id, user_id, agent_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, userId, agentId, now, now);

  return {
    id,
    user_id: userId,
    agent_id: agentId,
    created_at: now,
    updated_at: now
  };
}

/**
 * Get channel message history
 */
async function getChannelHistory(channel, options = {}) {
  const db = getDb();
  const { limit = 50, before = null, after = null } = options;

  // Check if channel is an ID or name - query both channel_id and channel columns
  let query = `
    SELECT
      m.*,
      u.name as user_name,
      u.avatar_url as user_avatar,
      a.name as agent_name,
      a.avatar_url as agent_avatar
    FROM messages m
    LEFT JOIN users u ON m.user_id = u.id
    LEFT JOIN agents a ON m.agent_id = a.id
    WHERE (m.channel_id = ? OR m.channel = ?) AND m.is_dm = 0
  `;
  const params = [channel, channel];

  if (before) {
    query += ' AND m.created_at < ?';
    params.push(before);
  }

  if (after) {
    query += ' AND m.created_at > ?';
    params.push(after);
  }

  query += ' ORDER BY m.created_at DESC LIMIT ?';
  params.push(parseInt(limit));

  const messages = db.prepare(query).all(...params);

  return messages.map(m => ({
    ...m,
    metadata: JSON.parse(m.metadata || '{}')
  })).reverse(); // Return oldest first
}

/**
 * Get DM history between user and agent
 */
async function getDmHistory(userId, agentId, options = {}) {
  const db = getDb();
  const { limit = 50, before = null } = options;

  // Get DM channel
  const channel = db.prepare(`
    SELECT id FROM dm_channels WHERE user_id = ? AND agent_id = ?
  `).get(userId, agentId);

  if (!channel) {
    return { messages: [], channel_id: null };
  }

  let query = `
    SELECT 
      m.*,
      u.name as user_name,
      u.avatar_url as user_avatar,
      a.name as agent_name,
      a.avatar_url as agent_avatar
    FROM messages m
    LEFT JOIN users u ON m.user_id = u.id
    LEFT JOIN agents a ON m.agent_id = a.id
    WHERE m.dm_channel_id = ?
  `;
  const params = [channel.id];

  if (before) {
    query += ' AND m.created_at < ?';
    params.push(before);
  }

  query += ' ORDER BY m.created_at DESC LIMIT ?';
  params.push(parseInt(limit));

  const messages = db.prepare(query).all(...params);

  return {
    channel_id: channel.id,
    messages: messages.map(m => ({
      ...m,
      metadata: JSON.parse(m.metadata || '{}')
    })).reverse()
  };
}

/**
 * Get all DM channels for a user
 */
async function getUserDmChannels(userId) {
  const db = getDb();

  const channels = db.prepare(`
    SELECT 
      dc.*,
      a.name as agent_name,
      a.avatar_url as agent_avatar,
      a.role as agent_role,
      (
        SELECT content 
        FROM messages 
        WHERE dm_channel_id = dc.id 
        ORDER BY created_at DESC LIMIT 1
      ) as last_message,
      (
        SELECT created_at 
        FROM messages 
        WHERE dm_channel_id = dc.id 
        ORDER BY created_at DESC LIMIT 1
      ) as last_message_at
    FROM dm_channels dc
    JOIN agents a ON dc.agent_id = a.id
    WHERE dc.user_id = ?
    ORDER BY dc.updated_at DESC
  `).all(userId);

  return channels;
}

/**
 * Check if message mentions an agent
 */
function extractMentions(content) {
  const mentionRegex = /@(\w+)/g;
  const mentions = [];
  let match;

  while ((match = mentionRegex.exec(content)) !== null) {
    mentions.push(match[1]);
  }

  return mentions;
}

/**
 * Check if content should trigger agent response
 */
function shouldTriggerAgentResponse(content, channel, isDm) {
  // Always respond in DMs
  if (isDm) return true;

  // Check for @agent mentions
  const mentions = extractMentions(content);
  if (mentions.length > 0) return true;

  // Check for specific keywords that trigger agents
  const triggerKeywords = ['hey', 'hello', 'help', 'question', 'agent'];
  const lowerContent = content.toLowerCase();

  for (const keyword of triggerKeywords) {
    if (lowerContent.includes(keyword)) return true;
  }

  return false;
}

/**
 * Get agent by name or identifier
 */
async function getAgentByIdentifier(identifier) {
  const db = getDb();

  // Try exact match on name
  let agent = db.prepare('SELECT * FROM agents WHERE name = ? AND is_active = 1').get(identifier);

  if (agent) return agent;

  // Try case-insensitive match
  agent = db.prepare('SELECT * FROM agents WHERE LOWER(name) = LOWER(?) AND is_active = 1').get(identifier);

  if (agent) return agent;

  // Try ID match
  agent = db.prepare('SELECT * FROM agents WHERE id = ? AND is_active = 1').get(identifier);

  return agent;
}

/**
 * Spawn agent sub-agent to respond
 */
async function spawnAgentResponse(userId, message, channel, agentId = null) {
  const { spawnSubAgent } = require('./subagents');

  // If no specific agent, find one from mentions or default
  let targetAgentId = agentId;

  if (!targetAgentId) {
    const mentions = extractMentions(message.content);
    if (mentions.length > 0) {
      const agent = await getAgentByIdentifier(mentions[0]);
      if (agent) targetAgentId = agent.id;
    }
  }

  // Use default agent if none found
  if (!targetAgentId) {
    const db = getDb();
    const defaultAgent = db.prepare(`
      SELECT * FROM agents WHERE is_active = 1 ORDER BY created_at LIMIT 1
    `).get();
    if (defaultAgent) targetAgentId = defaultAgent.id;
  }

  if (!targetAgentId) {
    console.warn('No agent found to handle message');
    return null;
  }

  // Spawn sub-agent for response
  try {
    const response = await spawnSubAgent({
      agentId: targetAgentId,
      userId,
      message: message.content,
      channel,
      context: {
        message_id: message.id,
        is_dm: message.is_dm,
        dm_channel_id: message.dm_channel_id
      }
    });

    return response;
  } catch (err) {
    console.error('Error spawning agent response:', err);
    return null;
  }
}

/**
 * Process incoming message - save, check for agent trigger, respond
 */
async function processIncomingMessage(userId, content, options = {}) {
  const db = getDb();

  // 1. Save message to database
  const message = await sendMessage(userId, content, options);

  // 2. Check if should trigger agent response
  const shouldTrigger = shouldTriggerAgentResponse(
    content,
    options.channel,
    options.isDm
  );

  if (shouldTrigger) {
    // 3. Spawn agent response asynchronously
    spawnAgentResponse(userId, message, options.channel, options.agentId)
      .then(async (agentResponse) => {
        if (agentResponse) {
          // 4. Save agent response
          const responseMessage = await sendMessage(
            null, // No user - it's an agent
            agentResponse.content,
            {
              channel: options.channel,
              agentId: agentResponse.agentId,
              isDm: options.isDm,
              dmChannelId: message.dm_channel_id,
              messageType: 'agent_response',
              parentMessageId: message.id,
              metadata: {
                agent_name: agentResponse.agentName,
                response_time_ms: agentResponse.responseTime
              }
            }
          );

          // 5. Emit agent response event
          wsManager.emitAgentResponse(responseMessage, message.id);
        }
      })
      .catch(err => {
        console.error('Agent response error:', err);
      });
  }

  return message;
}

/**
 * Edit a message
 */
async function editMessage(messageId, userId, newContent) {
  const db = getDb();

  // Verify ownership
  const message = db.prepare('SELECT * FROM messages WHERE id = ? AND user_id = ?').get(messageId, userId);

  if (!message) {
    throw new Error('Message not found or not authorized');
  }

  const now = new Date().toISOString();

  db.prepare(`
    UPDATE messages 
    SET content = ?, edited_at = ?, metadata = json_set(metadata, '$.edited', true)
    WHERE id = ?
  `).run(newContent, now, messageId);

  const updated = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);

  // Broadcast update
  wsManager.emitMessageUpdated(updated);

  return updated;
}

/**
 * Delete a message
 */
async function deleteMessage(messageId, userId) {
  const db = getDb();

  // Verify ownership (or admin)
  const message = db.prepare(`
    SELECT m.*, u.role as user_role 
    FROM messages m
    JOIN users u ON m.user_id = u.id
    WHERE m.id = ?
  `).get(messageId);

  if (!message) {
    throw new Error('Message not found');
  }

  if (message.user_id !== userId && message.user_role !== 'admin') {
    throw new Error('Not authorized to delete this message');
  }

  db.prepare('DELETE FROM messages WHERE id = ?').run(messageId);

  // Broadcast deletion
  wsManager.emitMessageDeleted(messageId, message.channel);

  return { success: true, message_id: messageId };
}

// ============================================================================
// NEW CHANNEL-BASED FUNCTIONS (Phase 1)
// ============================================================================

/**
 * Create a new channel
 */
async function createChannel({ name, type, createdBy, projectId, participant1Id, participant2Id }) {
  const db = getDb();

  // Generate channel name if not provided
  let channelName = name;
  if (!channelName && type === 'project' && projectId) {
    const project = db.prepare('SELECT name FROM projects WHERE id = ?').get(projectId);
    channelName = project ? `project-${project.name}` : `project-${projectId}`;
  }
  if (!channelName && type === 'dm') {
    channelName = 'dm-channel';
  }
  if (!channelName) {
    channelName = 'untitled-channel';
  }

  const channel = db.createChannel({
    name: channelName,
    type,
    createdBy,
    projectId,
    participant1Id,
    participant2Id
  });

  // Add creator as member if it's a user
  if (createdBy) {
    db.addChannelMember(channel.id, { userId: createdBy });
  }

  // Add participants as members for DM
  if (type === 'dm') {
    if (participant1Id) db.addChannelMember(channel.id, { userId: participant1Id });
    if (participant2Id) db.addChannelMember(channel.id, { userId: participant2Id });
  }

  // Broadcast channel creation
  wsManager.emitChannelCreated(channel);

  return channel;
}

/**
 * Get or create DM channel between two users
 */
async function getOrCreateDMChannel(userId1, agentOrUserId2) {
  const db = getDb();

  // Determine if second party is a manager_agent or a user
  const isAgent = !!db.prepare('SELECT id FROM manager_agents WHERE id = ?').get(agentOrUserId2);

  // Check if DM channel already exists
  let existing;
  if (isAgent) {
    existing = db.prepare(`
      SELECT c.*, ma.name as dm_agent_name, ma.avatar_url as dm_agent_avatar, ma.role as dm_agent_role, ma.status as dm_agent_status
      FROM channels c
      JOIN manager_agents ma ON c.dm_agent_id = ma.id
      WHERE c.type = 'dm' AND c.dm_user_id = ? AND c.dm_agent_id = ?
    `).get(userId1, agentOrUserId2);
  } else {
    existing = db.prepare(`
      SELECT * FROM channels
      WHERE type = 'dm' AND is_dm = 1
      AND ((participant_1_id = ? AND participant_2_id = ?) OR (participant_1_id = ? AND participant_2_id = ?))
    `).get(userId1, agentOrUserId2, agentOrUserId2, userId1);
  }

  if (existing) return existing;

  // Create new DM channel
  const { generateId } = require('./database');
  const id = generateId();
  const now = new Date().toISOString();

  if (isAgent) {
    const agent = db.prepare('SELECT name FROM manager_agents WHERE id = ?').get(agentOrUserId2);
    const agentName = agent?.name || 'Agent';
    db.prepare(`
      INSERT INTO channels (id, name, type, is_dm, dm_user_id, dm_agent_id, created_by, created_at)
      VALUES (?, ?, 'dm', 1, ?, ?, ?, ?)
    `).run(id, `@${agentName}`, userId1, agentOrUserId2, userId1, now);

    // Add user as member
    try {
      db.prepare(`INSERT OR IGNORE INTO channel_members (id, channel_id, user_id, joined_at) VALUES (?, ?, ?, ?)`).run(generateId(), id, userId1, now);
    } catch (e) { }

    // Emit channel created
    const wsManager = require('./websocket');
    wsManager.emitChannelCreated({ id, name: `@${agentName}`, type: 'dm', dm_agent_id: agentOrUserId2, dm_user_id: userId1, created_at: now });

    return db.prepare(`
      SELECT c.*, ma.name as dm_agent_name, ma.avatar_url as dm_agent_avatar, ma.role as dm_agent_role
      FROM channels c JOIN manager_agents ma ON c.dm_agent_id = ma.id
      WHERE c.id = ?
    `).get(id);
  } else {
    const user2 = db.prepare('SELECT name FROM users WHERE id = ?').get(agentOrUserId2);
    const name2 = user2?.name || agentOrUserId2;
    db.prepare(`
      INSERT INTO channels (id, name, type, is_dm, participant_1_id, participant_2_id, created_by, created_at)
      VALUES (?, ?, 'dm', 1, ?, ?, ?, ?)
    `).run(id, `@${name2}`, userId1, agentOrUserId2, userId1, now);

    try {
      db.prepare(`INSERT OR IGNORE INTO channel_members (id, channel_id, user_id, joined_at) VALUES (?, ?, ?, ?)`).run(generateId(), id, userId1, now);
      db.prepare(`INSERT OR IGNORE INTO channel_members (id, channel_id, user_id, joined_at) VALUES (?, ?, ?, ?)`).run(generateId(), id, agentOrUserId2, now);
    } catch (e) { }

    return db.prepare('SELECT * FROM channels WHERE id = ?').get(id);
  }
}

/**
 * Get all channels for a user with unread counts
 */
async function getChannels(userId, options = {}) {
  const db = getDb();
  const { type } = options;

  const channels = db.getChannelsForUser(userId, { type });

  return channels.map(c => ({
    id: c.id,
    name: c.name,
    type: c.type,
    created_by: c.created_by,
    project_id: c.project_id,
    project_name: c.project_name,
    participant_1_id: c.participant_1_id,
    participant_2_id: c.participant_2_id,
    participant_1_name: c.participant_1_name,
    participant_2_name: c.participant_2_name,
    is_archived: c.is_archived,
    unread_count: c.unread_count || 0,
    created_at: c.created_at
  }));
}

/**
 * Get messages for a channel with sender info
 */
async function getChannelMessages(userId, channelId, options = {}) {
  const db = getDb();
  const { limit = 50, offset = 0 } = options;

  // Verify user has access to this channel
  const channel = db.getChannelById(channelId);
  if (!channel) {
    throw new Error('Channel not found');
  }

  // Check access
  const hasAccess =
    channel.type === 'general' ||
    channel.created_by === userId ||
    channel.participant_1_id === userId ||
    channel.participant_2_id === userId ||
    channel.dm_user_id === userId ||
    channel.dm_agent_id === userId ||
    db.prepare('SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?').get(channelId, userId);

  if (!hasAccess) {
    throw new Error('Access denied to this channel');
  }

  // Update last read
  db.updateLastRead(channelId, userId);

  // Get messages
  const messages = db.getMessagesForChannel(channelId, { limit, offset });

  // Get total count
  const { count } = db.prepare('SELECT COUNT(*) as count FROM messages WHERE channel_id = ?').get(channelId);

  return {
    channel_id: channelId,
    messages: messages.map(m => ({
      id: m.id,
      channel_id: m.channel_id,
      content: m.content,
      sender_id: m.user_id || m.agent_id,
      sender_type: m.agent_id ? 'agent' : 'user',
      sender_name: m.agent_name || m.user_name || 'Unknown',
      sender_avatar: m.agent_avatar || m.user_avatar,
      message_type: m.message_type,
      metadata: JSON.parse(m.metadata || '{}'),
      parent_message_id: m.parent_message_id,
      created_at: m.created_at,
      edited_at: m.edited_at
    })),
    pagination: {
      total: count,
      limit: parseInt(limit),
      offset: parseInt(offset),
      has_more: parseInt(offset) + messages.length < count
    }
  };
}

/**
 * Send a message to a channel
 */
async function sendChannelMessage(userId, channelId, content, options = {}) {
  const db = getDb();
  const { metadata = {} } = options;

  // Verify user has access to this channel
  const channel = db.getChannelById(channelId);
  if (!channel) {
    throw new Error('Channel not found');
  }

  // Check access
  const hasAccess =
    channel.type === 'general' ||
    channel.created_by === userId ||
    channel.participant_1_id === userId ||
    channel.participant_2_id === userId ||
    channel.dm_user_id === userId ||
    channel.dm_agent_id === userId ||
    db.prepare('SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?').get(channelId, userId);

  if (!hasAccess) {
    throw new Error('Access denied to this channel');
  }

  // Create message
  const message = db.createMessage({
    channelId,
    userId,
    content,
    metadata
  });

  // Get sender info
  const user = db.prepare('SELECT name, avatar_url FROM users WHERE id = ?').get(userId);

  // Determine DM recipient for direct delivery
  let dmRecipientId = null;
  if (channel.type === 'dm') {
    if (channel.dm_user_id && channel.dm_user_id !== userId) {
      dmRecipientId = channel.dm_user_id;
    } else if (channel.participant_1_id && channel.participant_1_id !== userId) {
      dmRecipientId = channel.participant_1_id;
    } else if (channel.participant_2_id && channel.participant_2_id !== userId) {
      dmRecipientId = channel.participant_2_id;
    }
  }

  const fullMessage = {
    ...message,
    channel_id: channelId,
    sender_name: user?.name || 'Unknown',
    sender_avatar: user?.avatar_url,
    sender_type: 'user',
    dm_recipient_id: dmRecipientId,
  };

  // Broadcast via WebSocket
  wsManager.emitChannelMessage(fullMessage);

  return fullMessage;
}

/**
 * Set typing indicator for a channel
 */
async function setTypingIndicator(userId, channelId, isTyping) {
  const db = getDb();

  if (isTyping) {
    db.setTypingIndicator(channelId, { userId });
    wsManager.emitTypingStart(userId, channelId);
  } else {
    db.clearTypingIndicator(channelId, { userId });
    wsManager.emitTypingStop(userId, channelId);
  }
}

module.exports = {
  // Legacy functions
  sendMessage,
  getChannelHistory,
  getDmHistory,
  getUserDmChannels,
  getOrCreateDmChannel,
  processIncomingMessage,
  spawnAgentResponse,
  extractMentions,
  shouldTriggerAgentResponse,
  editMessage,
  deleteMessage,

  // New channel-based functions
  createChannel,
  getOrCreateDMChannel,
  getChannels,
  getChannelMessages,
  sendChannelMessage,
  setTypingIndicator
};