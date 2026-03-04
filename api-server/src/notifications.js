/**
 * Notification System - Real-time notifications for users and agents
 */

const { getDb, generateId } = require('./database');
const wsManager = require('./websocket');

// ============================================================================
// NOTIFICATION DATABASE OPERATIONS
// ============================================================================

// Create a notification for a user
function createUserNotification(userId, type, title, content, data = {}) {
    const db = getDb();
    const id = generateId();
    const now = new Date().toISOString();

    try {
        db.prepare(`
      INSERT INTO notifications (id, user_id, type, title, content, data, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, type, title, content, JSON.stringify(data), 0, now);

        // Send real-time notification via WebSocket
        wsManager.emitUserNotification(userId, {
            id,
            type,
            title,
            content,
            data,
            created_at: now,
            is_read: false
        });

        return { id, success: true };
    } catch (err) {
        console.error('Failed to create user notification:', err);
        return { id: null, success: false, error: err.message };
    }
}

// Create a notification for an agent
function createAgentNotification(agentId, type, title, content, data = {}) {
    const db = getDb();
    const id = generateId();
    const now = new Date().toISOString();

    try {
        db.prepare(`
      INSERT INTO agent_notifications (id, agent_id, type, title, content, data, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, agentId, type, title, content, JSON.stringify(data), 0, now);

        // Send real-time notification via WebSocket
        wsManager.emitAgentNotification(agentId, {
            id,
            type,
            title,
            content,
            data,
            created_at: now,
            is_read: false
        });

        return { id, success: true };
    } catch (err) {
        console.error('Failed to create agent notification:', err);
        return { id: null, success: false, error: err.message };
    }
}

// Get unread notifications for a user
function getUserNotifications(userId, { limit = 20, unreadOnly = false } = {}) {
    const db = getDb();
    let query = `SELECT * FROM notifications WHERE user_id = ?`;
    const params = [userId];

    if (unreadOnly) {
        query += ` AND is_read = 0`;
    }

    query += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(limit);

    const notifications = db.prepare(query).all(...params);
    return notifications.map(n => ({
        ...n,
        data: JSON.parse(n.data || '{}'),
        is_read: Boolean(n.is_read)
    }));
}

// Get unread notifications for an agent
function getAgentNotifications(agentId, { limit = 20, unreadOnly = false } = {}) {
    const db = getDb();
    let query = `SELECT * FROM agent_notifications WHERE agent_id = ?`;
    const params = [agentId];

    if (unreadOnly) {
        query += ` AND is_read = 0`;
    }

    query += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(limit);

    const notifications = db.prepare(query).all(...params);
    return notifications.map(n => ({
        ...n,
        data: JSON.parse(n.data || '{}'),
        is_read: Boolean(n.is_read)
    }));
}

// Mark user notification as read
function markUserNotificationRead(notificationId, userId) {
    const db = getDb();
    const result = db.prepare(`
    UPDATE notifications SET is_read = 1, read_at = ?
    WHERE id = ? AND user_id = ?
  `).run(new Date().toISOString(), notificationId, userId);
    return { success: result.changes > 0 };
}

// Mark agent notification as read
function markAgentNotificationRead(notificationId, agentId) {
    const db = getDb();
    const result = db.prepare(`
    UPDATE agent_notifications SET is_read = 1, read_at = ?
    WHERE id = ? AND agent_id = ?
  `).run(new Date().toISOString(), notificationId, agentId);
    return { success: result.changes > 0 };
}

// Mark all notifications as read for a user
function markAllUserNotificationsRead(userId) {
    const db = getDb();
    db.prepare(`
    UPDATE notifications SET is_read = 1, read_at = ?
    WHERE user_id = ? AND is_read = 0
  `).run(new Date().toISOString(), userId);
    return { success: true };
}

// Mark all notifications as read for an agent
function markAllAgentNotificationsRead(agentId) {
    const db = getDb();
    db.prepare(`
    UPDATE agent_notifications SET is_read = 1, read_at = ?
    WHERE agent_id = ? AND is_read = 0
  `).run(new Date().toISOString(), agentId);
    return { success: true };
}

// Get unread count for user
function getUserUnreadCount(userId) {
    const db = getDb();
    const result = db.prepare(`
    SELECT COUNT(*) as count FROM notifications
    WHERE user_id = ? AND is_read = 0
  `).get(userId);
    return result?.count || 0;
}

// Get unread count for agent
function getAgentUnreadCount(agentId) {
    const db = getDb();
    const result = db.prepare(`
    SELECT COUNT(*) as count FROM agent_notifications
    WHERE agent_id = ? AND is_read = 0
  `).get(agentId);
    return result?.count || 0;
}

// ============================================================================
// NOTIFICATION TRIGGERS - Call these when actions happen
// ============================================================================

// Notify when task is assigned
async function notifyTaskAssigned(task, project, agentId, assignedById) {
    const db = getDb();
    const assignedBy = db.prepare('SELECT name FROM users WHERE id = ?').get(assignedById);

    // Notify the agent
    await createAgentNotification(agentId, 'task_assigned', 'New Task Assigned',
        `You've been assigned to "${task.title}" in ${project.name}`, {
        task_id: task.id,
        task_title: task.title,
        project_id: project.id,
        project_name: project.name,
        priority: task.priority,
        assigned_by: assignedBy?.name || assignedById
    });
}

// Notify when task is accepted
async function notifyTaskAccepted(task, project, agentId) {
    const db = getDb();
    const agent = db.prepare('SELECT name FROM manager_agents WHERE id = ?').get(agentId);

    // Notify the assigner if exists
    if (task.assigned_by) {
        await createUserNotification(task.assigned_by, 'task_accepted', 'Task Accepted',
            `${agent?.name || 'Agent'} accepted "${task.title}"`, {
            task_id: task.id,
            task_title: task.title,
            project_id: project.id,
            project_name: project.name,
            agent_id: agentId,
            agent_name: agent?.name
        });
    }
}

// Notify when task is rejected
async function notifyTaskRejected(task, project, agentId, reason) {
    const db = getDb();
    const agent = db.prepare('SELECT name FROM manager_agents WHERE id = ?').get(agentId);

    // Notify the assigner if exists
    if (task.assigned_by) {
        await createUserNotification(task.assigned_by, 'task_rejected', 'Task Rejected',
            `${agent?.name || 'Agent'} rejected "${task.title}"${reason ? `: ${reason}` : ''}`, {
            task_id: task.id,
            task_title: task.title,
            project_id: project.id,
            project_name: project.name,
            agent_id: agentId,
            agent_name: agent?.name,
            reason
        });
    }
}

// Notify when task is completed
async function notifyTaskCompleted(task, project, agentId, result) {
    const db = getDb();
    const agent = db.prepare('SELECT name FROM manager_agents WHERE id = ?').get(agentId);

    // Notify the assigner if exists
    if (task.assigned_by) {
        await createUserNotification(task.assigned_by, 'task_completed', 'Task Completed',
            `${agent?.name || 'Agent'} completed "${task.title}"`, {
            task_id: task.id,
            task_title: task.title,
            project_id: project.id,
            project_name: project.name,
            agent_id: agentId,
            agent_name: agent?.name,
            result_summary: result ? JSON.stringify(result).substring(0, 100) : null
        });
    }
}

// Notify when agent is assigned to project
async function notifyAgentProjectAssigned(agentId, project, role, assignedById) {
    const db = getDb();
    const assignedBy = db.prepare('SELECT name FROM users WHERE id = ?').get(assignedById);

    await createAgentNotification(agentId, 'project_assigned', 'New Project Assignment',
        `You've been assigned to "${project.name}" as ${role}`, {
        project_id: project.id,
        project_name: project.name,
        role,
        assigned_by: assignedBy?.name || assignedById
    });
}

// Notify when agent is removed from project
async function notifyAgentProjectRemoved(agentId, project, removedById) {
    const db = getDb();
    const removedBy = db.prepare('SELECT name FROM users WHERE id = ?').get(removedById);

    await createAgentNotification(agentId, 'project_removed', 'Removed from Project',
        `You have been removed from "${project.name}"`, {
        project_id: project.id,
        project_name: project.name,
        removed_by: removedBy?.name || removedById
    });
}

// Notify when agent role is updated
async function notifyAgentRoleUpdated(agentId, project, oldRole, newRole, updatedById) {
    const db = getDb();
    const updatedBy = db.prepare('SELECT name FROM users WHERE id = ?').get(updatedById);

    await createAgentNotification(agentId, 'role_updated', 'Role Updated',
        `Your role in "${project.name}" changed from ${oldRole} to ${newRole}`, {
        project_id: project.id,
        project_name: project.name,
        old_role: oldRole,
        new_role: newRole,
        updated_by: updatedBy?.name || updatedById
    });
}

// Notify agent when approved
async function notifyAgentApproved(agentId, approvedById) {
    const db = getDb();
    const approvedBy = db.prepare('SELECT name FROM users WHERE id = ?').get(approvedById);

    await createAgentNotification(agentId, 'approved', 'Registration Approved',
        `Your registration has been approved by ${approvedBy?.name || 'Admin'}`, {
        approved_by: approvedBy?.name || approvedById,
        approved_at: new Date().toISOString()
    });
}

// Notify admin when new agent registers
async function notifyNewAgentRegistration(agentId, agentName, adminId) {
    await createUserNotification(adminId, 'agent_registered', 'New Agent Registration',
        `${agentName} has registered and awaits approval`, {
        agent_id: agentId,
        agent_name: agentName
    });
}

// Notify on budget alert
async function notifyBudgetAlert(projectId, projectName, budgetName, spent, limit, percentUsed) {
    const db = getDb();

    // Get all admins and project leads
    const admins = db.prepare(`SELECT id FROM users WHERE role = 'admin'`).all();
    const leads = db.prepare(`
    SELECT u.id FROM users u
    JOIN agent_projects ap ON ap.agent_id = u.id
    WHERE ap.project_id = ? AND ap.role = 'lead'
  `).all(projectId);

    const notifyIds = [...admins, ...leads].map(u => u.id);
    const uniqueIds = [...new Set(notifyIds)];

    for (const userId of uniqueIds) {
        await createUserNotification(userId, 'budget_alert', 'Budget Alert',
            `${budgetName} has reached ${Math.round(percentUsed)}% of budget`, {
            project_id: projectId,
            project_name: projectName,
            budget_name: budgetName,
            spent,
            limit,
            percent_used: percentUsed
        });
    }
}

// Notify on new DM message
async function notifyNewDmMessage(channelId, senderId, senderName, recipientId, content) {
    // Check if recipient is online in this channel
    const isOnline = wsManager.isUserInChannel(recipientId, channelId);

    if (!isOnline) {
        await createUserNotification(recipientId, 'dm_message', 'New Message',
            `${senderName}: ${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`, {
            channel_id: channelId,
            sender_id: senderId,
            sender_name: senderName,
            preview: content.substring(0, 100)
        });
    }
}

module.exports = {
    createUserNotification,
    createAgentNotification,
    getUserNotifications,
    getAgentNotifications,
    markUserNotificationRead,
    markAgentNotificationRead,
    markAllUserNotificationsRead,
    markAllAgentNotificationsRead,
    getUserUnreadCount,
    getAgentUnreadCount,
    // Triggers
    notifyTaskAssigned,
    notifyTaskAccepted,
    notifyTaskRejected,
    notifyTaskCompleted,
    notifyAgentProjectAssigned,
    notifyAgentProjectRemoved,
    notifyAgentRoleUpdated,
    notifyAgentApproved,
    notifyNewAgentRegistration,
    notifyBudgetAlert,
    notifyNewDmMessage
};