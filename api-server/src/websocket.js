// WebSocket connection manager for real-time events
class WebSocketManager {
  constructor() {
    this.clients = new Map(); // Map<connection, {userId, channels, projectIds}>
  }

  register(connection, options = {}) {
    const { userId = null, channels = [], projectIds = [] } = options;

    this.clients.set(connection, {
      userId,
      channels: new Set(channels),
      projectIds: new Set(projectIds),
      isGlobal: channels.length === 0 && projectIds.length === 0
    });

    console.log(`🔌 WebSocket client connected. Total: ${this.clients.size}`);

    // Broadcast online status if authenticated
    if (userId) {
      this.emitUserPresence(userId, true);
    }
  }

  unregister(connection) {
    const client = this.clients.get(connection);
    const userId = client?.userId || null;
    this.clients.delete(connection);
    console.log(`🔌 WebSocket client disconnected. Total: ${this.clients.size}`);

    // Only broadcast offline if this user has no other active connections
    if (userId) {
      const stillConnected = Array.from(this.clients.values()).some(c => c.userId === userId);
      if (!stillConnected) {
        this.emitUserPresence(userId, false);
      }
    }
  }

  subscribeToChannel(connection, channel) {
    const client = this.clients.get(connection);
    if (client) {
      client.channels.add(channel);
    }
  }

  unsubscribeFromChannel(connection, channel) {
    const client = this.clients.get(connection);
    if (client) {
      client.channels.delete(channel);
    }
  }

  subscribeToProject(connection, projectId) {
    const client = this.clients.get(connection);
    if (client) {
      client.projectIds.add(projectId);
    }
  }

  unsubscribeFromProject(connection, projectId) {
    const client = this.clients.get(connection);
    if (client) {
      client.projectIds.delete(projectId);
    }
  }

  // Broadcast to clients based on filters
  broadcast(event, data, filters = {}) {
    const { channel = null, projectId = null, userId = null, isDm = false } = filters;
    const message = JSON.stringify({ event, data, timestamp: new Date().toISOString() });

    for (const [connection, client] of this.clients) {
      try {
        let shouldSend = client.isGlobal;

        // Check channel subscription
        if (channel && client.channels.has(channel)) {
          shouldSend = true;
        }

        // Check project subscription
        if (projectId && client.projectIds.has(projectId)) {
          shouldSend = true;
        }

        // Check user-specific (for DMs)
        if (userId && client.userId === userId) {
          shouldSend = true;
        }

        if (shouldSend && connection.readyState === 1) {
          connection.send(message);
        }
      } catch (err) {
        console.error('WebSocket send error:', err);
      }
    }
  }

  // Specific event emitters
  emitProjectStatusChanged(projectId, oldStatus, newStatus) {
    this.broadcast('project:status_changed', {
      project_id: projectId,
      old_status: oldStatus,
      new_status: newStatus,
      changed_at: new Date().toISOString()
    }, { projectId });
  }

  emitTaskCreated(projectId, task) {
    this.broadcast('task:created', {
      task_id: task.id,
      project_id: projectId,
      title: task.title,
      status: task.status,
      priority: task.priority,
      created_at: task.created_at
    }, { projectId });
  }

  emitCostUpdated(projectId, costData) {
    this.broadcast('cost:updated', {
      project_id: projectId,
      ...costData,
      updated_at: new Date().toISOString()
    }, { projectId });
  }

  // Chat events
  emitMessage(message) {
    const filters = {};

    if (message.is_dm) {
      // For DMs, send to the specific user
      filters.userId = message.user_id;
    } else {
      // For channels, send to channel subscribers
      filters.channel = message.channel;
    }

    this.broadcast('message:new', {
      message_id: message.id,
      user_id: message.user_id,
      agent_id: message.agent_id,
      content: message.content,
      channel: message.channel,
      message_type: message.message_type,
      is_dm: message.is_dm,
      dm_channel_id: message.dm_channel_id,
      created_at: message.created_at
    }, filters);
  }

  emitAgentResponse(message, parentMessageId) {
    const filters = {};

    if (message.is_dm) {
      filters.userId = message.dm_channel_id ? null : message.user_id;
    } else {
      filters.channel = message.channel;
    }

    this.broadcast('message:agent_response', {
      message_id: message.id,
      parent_message_id: parentMessageId,
      agent_id: message.agent_id,
      content: message.content,
      channel: message.channel,
      is_dm: message.is_dm,
      metadata: message.metadata,
      created_at: message.created_at
    }, filters);
  }

  emitMessageUpdated(message) {
    this.broadcast('message:updated', {
      message_id: message.id,
      content: message.content,
      edited_at: message.edited_at
    }, { channel: message.channel });
  }

  emitMessageDeleted(messageId, channel) {
    this.broadcast('message:deleted', {
      message_id: messageId
    }, { channel });
  }

  emitTyping(userId, channel, isTyping = true) {
    this.broadcast('user:typing', {
      user_id: userId,
      channel,
      is_typing: isTyping,
      timestamp: new Date().toISOString()
    }, { channel });
  }

  emitUserPresence(userId, isOnline) {
    this.broadcast('user:presence', {
      user_id: userId,
      is_online: isOnline,
      timestamp: new Date().toISOString()
    }, {});
    // Also update manager_agents status in DB
    try {
      const { getDb } = require('./database');
      getDb().prepare(
        `UPDATE manager_agents SET status = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(isOnline ? 'online' : 'offline', userId);
    } catch (e) { }
  }

  emitUserOnline(userId, isOnline = true) {
    this.broadcast('user:online_status', {
      user_id: userId,
      is_online: isOnline,
      timestamp: new Date().toISOString()
    }, {});
  }

  // ============================================================================
  // NEW CHANNEL-BASED EVENTS (Phase 1)
  // ============================================================================

  emitChannelMessage(message) {
    const payload = {
      message_id: message.id,
      channel_id: message.channel_id,
      sender_id: message.user_id,
      sender_type: message.sender_type || 'user',
      sender_name: message.sender_name,
      sender_avatar: message.sender_avatar,
      content: message.content,
      message_type: message.message_type,
      metadata: message.metadata,
      created_at: message.created_at
    };
    // Broadcast to channel subscribers
    this.broadcast('chat:message', payload, { channel: message.channel_id });
    // Also broadcast to DM recipient by userId (they may not be subscribed to channel yet)
    if (message.dm_recipient_id) {
      this.broadcast('chat:message', payload, { userId: message.dm_recipient_id });
    }
  }

  emitTypingStart(userId, channelId) {
    this.broadcast('chat:typing_start', {
      user_id: userId,
      channel_id: channelId,
      timestamp: new Date().toISOString()
    }, { channel: channelId });
  }

  emitTypingStop(userId, channelId) {
    this.broadcast('chat:typing_stop', {
      user_id: userId,
      channel_id: channelId,
      timestamp: new Date().toISOString()
    }, { channel: channelId });
  }

  emitChannelCreated(channel) {
    this.broadcast('chat:channel_created', {
      channel_id: channel.id,
      name: channel.name,
      type: channel.type,
      project_id: channel.project_id,
      dm_agent_id: channel.dm_agent_id,
      dm_user_id: channel.dm_user_id,
      dm_agent_name: channel.dm_agent_name,
      participant_1_id: channel.participant_1_id,
      participant_2_id: channel.participant_2_id,
      created_at: channel.created_at
    }, {});
  }

  // ============================================================================
  // PROJECT ASSIGNMENT EVENTS (Phase 2)
  // ============================================================================

  emitAgentAssigned(projectId, assignmentData) {
    this.broadcast('agent:assigned', {
      event_type: 'agent_assigned',
      project_id: projectId,
      agent_id: assignmentData.agent_id,
      role: assignmentData.role,
      assigned_by: assignmentData.assigned_by,
      assigned_at: assignmentData.assigned_at,
      project_name: assignmentData.project_name
    }, { projectId });

    // Also send to the specific agent via userId filter
    this.broadcast('agent:assigned_to_project', {
      event_type: 'assigned_to_project',
      project_id: projectId,
      project_name: assignmentData.project_name,
      role: assignmentData.role,
      assigned_by: assignmentData.assigned_by,
      assigned_at: assignmentData.assigned_at
    }, { userId: assignmentData.agent_id });
  }

  emitAgentRemoved(projectId, removalData) {
    this.broadcast('agent:removed', {
      event_type: 'agent_removed',
      project_id: projectId,
      agent_id: removalData.agent_id,
      removed_by: removalData.removed_by,
      removed_at: removalData.removed_at,
      project_name: removalData.project_name
    }, { projectId });

    // Also send to the specific agent
    this.broadcast('agent:removed_from_project', {
      event_type: 'removed_from_project',
      project_id: projectId,
      project_name: removalData.project_name,
      removed_by: removalData.removed_by,
      removed_at: removalData.removed_at
    }, { userId: removalData.agent_id });
  }

  emitAgentRoleUpdated(projectId, updateData) {
    this.broadcast('agent:role_updated', {
      event_type: 'agent_role_updated',
      project_id: projectId,
      agent_id: updateData.agent_id,
      old_role: updateData.old_role,
      new_role: updateData.new_role,
      updated_by: updateData.updated_by,
      updated_at: updateData.updated_at,
      project_name: updateData.project_name
    }, { projectId });

    // Also send to the specific agent
    this.broadcast('agent:project_role_updated', {
      event_type: 'project_role_updated',
      project_id: projectId,
      project_name: updateData.project_name,
      old_role: updateData.old_role,
      new_role: updateData.new_role,
      updated_by: updateData.updated_by,
      updated_at: updateData.updated_at
    }, { userId: updateData.agent_id });
  }

  // ============================================================================
  // TASK ASSIGNMENT EVENTS (Phase 3)
  // ============================================================================

  emitTaskAssigned(projectId, data) {
    this.broadcast('task:assigned', {
      event_type: 'task_assigned',
      task_id: data.task_id,
      project_id: projectId,
      agent_id: data.agent_id,
      previous_agent_id: data.previous_agent_id,
      assigned_by: data.assigned_by,
      assigned_at: new Date().toISOString()
    }, { projectId });

    // Send direct notification to assigned agent
    if (data.agent_id) {
      this.broadcast('agent:task_assigned', {
        event_type: 'task_assigned_to_you',
        task_id: data.task_id,
        project_id: projectId,
        assigned_by: data.assigned_by,
        assigned_at: new Date().toISOString(),
        dm_channel_id: data.dm_channel_id
      }, { userId: data.agent_id });
    }
  }

  emitTaskUnassigned(projectId, data) {
    this.broadcast('task:unassigned', {
      event_type: 'task_unassigned',
      task_id: data.task_id,
      project_id: projectId,
      previous_agent_id: data.previous_agent_id,
      unassigned_by: data.unassigned_by,
      unassigned_at: new Date().toISOString()
    }, { projectId });
  }

  emitTaskAccepted(projectId, data) {
    this.broadcast('task:accepted', {
      event_type: 'task_accepted',
      task_id: data.task_id,
      project_id: projectId,
      agent_id: data.agent_id,
      accepted_at: data.accepted_at
    }, { projectId });
  }

  emitTaskRejected(projectId, data) {
    this.broadcast('task:rejected', {
      event_type: 'task_rejected',
      task_id: data.task_id,
      project_id: projectId,
      agent_id: data.agent_id,
      reason: data.reason,
      rejected_at: data.rejected_at
    }, { projectId });
  }

  emitTaskStarted(projectId, data) {
    this.broadcast('task:started', {
      event_type: 'task_started',
      task_id: data.task_id,
      project_id: projectId,
      agent_id: data.agent_id,
      started_at: data.started_at,
      comment: data.comment
    }, { projectId });
  }

  emitTaskCompleted(projectId, data) {
    this.broadcast('task:completed', {
      event_type: 'task_completed',
      task_id: data.task_id,
      project_id: projectId,
      agent_id: data.agent_id,
      completed_at: data.completed_at,
      comment: data.comment
    }, { projectId });
  }

  emitTaskCancelled(projectId, data) {
    this.broadcast('task:cancelled', {
      event_type: 'task_cancelled',
      task_id: data.task_id,
      project_id: projectId,
      cancelled_by: data.cancelled_by,
      reason: data.reason,
      cancelled_at: data.cancelled_at
    }, { projectId });
  }

  emitTaskUpdated(projectId, data) {
    this.broadcast('task:updated', {
      event_type: 'task_updated',
      task_id: data.task_id,
      project_id: projectId,
      changes: data.changes,
      updated_by: data.updated_by,
      updated_at: new Date().toISOString()
    }, { projectId });
  }

  emitTaskDeleted(projectId, data) {
    this.broadcast('task:deleted', {
      event_type: 'task_deleted',
      task_id: data.task_id,
      project_id: projectId,
      deleted_by: data.deleted_by,
      deleted_at: new Date().toISOString()
    }, { projectId });
  }

  emitCommentAdded(projectId, data) {
    this.broadcast('task:comment_added', {
      event_type: 'comment_added',
      task_id: data.task_id,
      project_id: projectId,
      comment_id: data.comment_id,
      author_id: data.author_id,
      content: data.content,
      created_at: data.created_at
    }, { projectId });
  }

  emitTaskStatusChanged(projectId, data) {
    this.broadcast('task:status_changed', {
      event_type: 'task_status_changed',
      task_id: data.task_id,
      project_id: projectId,
      old_status: data.old_status,
      new_status: data.new_status,
      changed_by: data.changed_by,
      changed_at: data.changed_at || new Date().toISOString()
    }, { projectId });
  }

  emitTaskCreated(projectId, task) {
    this.broadcast('task:created', {
      event_type: 'task_created',
      task_id: task.id,
      project_id: projectId,
      title: task.title,
      status: task.status,
      priority: task.priority,
      agent_id: task.agent_id,
      created_at: task.created_at
    }, { projectId });
  }

  emitTaskCommentAdded(projectId, data) {
    this.broadcast('task:comment_added', {
      event_type: 'comment_added',
      task_id: data.task_id,
      project_id: projectId,
      comment: data.comment,
      created_at: new Date().toISOString()
    }, { projectId });
  }

  emitTaskAssignedToAgent(agentId, data) {
    this.broadcast('agent:task_assigned', {
      event_type: 'task_assigned_to_you',
      task_id: data.task_id,
      project_id: data.project_id,
      project_name: data.project_name,
      title: data.title,
      priority: data.priority,
      due_date: data.due_date,
      assigned_at: new Date().toISOString()
    }, { userId: agentId });
  }

  // ============================================================================
  // NOTIFICATION METHODS
  // ============================================================================

  emitUserNotification(userId, notification) {
    // Find all connections for this user
    for (const [connection, client] of this.clients) {
      if (client.userId === userId && connection.readyState === 1) {
        connection.send(JSON.stringify({
          event: 'notification:new',
          data: { notification }
        }));
      }
    }
  }

  emitAgentNotification(agentId, notification) {
    // Agents use the same client map with their ID
    for (const [connection, client] of this.clients) {
      if (client.userId === agentId && connection.readyState === 1) {
        connection.send(JSON.stringify({
          event: 'notification:new',
          data: { notification }
        }));
      }
    }
  }

  isUserInChannel(userId, channelId) {
    for (const [connection, client] of this.clients) {
      if (client.userId === userId && client.channels.has(channelId)) {
        return true;
      }
    }
    return false;
  }
}



module.exports = new WebSocketManager();