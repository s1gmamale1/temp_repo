/**
 * Task Routes - Phase 3 Task Assignment System
 * CRUD operations, assignments, comments, and status management
 */

const { getDb, generateId } = require('./database');
const wsManager = require('./websocket');

// ============================================================================
// TASK CRUD ROUTES
// ============================================================================

// GET /api/projects/:id/tasks - List all tasks for a project
async function listProjectTasks(request, reply) {
  const db = getDb();
  const { id } = request.params;
  const { status, agent_id, priority, limit = 50, offset = 0 } = request.query;

  // Check project exists
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(id);
  if (!project) {
    reply.code(404);
    return { error: 'Project not found' };
  }

  // Build query
  let query = `
    SELECT 
      t.*,
      ma.name as agent_name,
      ma.handle as agent_handle,
      ma.avatar_url as agent_avatar,
      ma.status as agent_status,
      u.name as assigned_by_name
    FROM tasks t
    LEFT JOIN manager_agents ma ON t.agent_id = ma.id
    LEFT JOIN users u ON t.assigned_by = u.id
    WHERE t.project_id = ?
  `;
  const params = [id];

  if (status) {
    query += ' AND t.status = ?';
    params.push(status);
  }

  if (agent_id) {
    query += ' AND t.agent_id = ?';
    params.push(agent_id);
  }

  if (priority) {
    query += ' AND t.priority = ?';
    params.push(parseInt(priority));
  }

  query += ' ORDER BY t.created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  const tasks = db.prepare(query).all(...params);

  // Get total count
  let countQuery = 'SELECT COUNT(*) as total FROM tasks WHERE project_id = ?';
  const countParams = [id];
  if (status) { countQuery += ' AND status = ?'; countParams.push(status); }
  if (agent_id) { countQuery += ' AND agent_id = ?'; countParams.push(agent_id); }
  if (priority) { countQuery += ' AND priority = ?'; countParams.push(parseInt(priority)); }
  const { total } = db.prepare(countQuery).get(...countParams);

  // Get stats
  const stats = db.prepare(`
    SELECT 
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
    FROM tasks WHERE project_id = ?
  `).get(id);

  return {
    tasks: tasks.map(t => ({
      ...t,
      payload: JSON.parse(t.payload || '{}'),
      result: t.result ? JSON.parse(t.result) : null,
      tags: JSON.parse(t.tags || '[]'),
      agent: t.agent_id ? {
        id: t.agent_id,
        name: t.agent_name,
        handle: t.agent_handle,
        avatar_url: t.agent_avatar,
        status: t.agent_status
      } : null
    })),
    total,
    limit: parseInt(limit),
    offset: parseInt(offset),
    stats: {
      pending: stats.pending || 0,
      running: stats.running || 0,
      completed: stats.completed || 0,
      failed: stats.failed || 0,
      cancelled: stats.cancelled || 0
    }
  };
}

// POST /api/projects/:id/tasks - Create new task
async function createTask(request, reply) {
  const db = getDb();
  const { id } = request.params;
  const userId = request.user?.id;
  const {
    title,
    description,
    priority = 2,
    agent_id,
    due_date,
    estimated_hours,
    tags = [],
    payload = {}
  } = request.body;

  if (!title) {
    reply.code(400);
    return { error: 'Title is required' };
  }

  // Check project exists
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!project) {
    reply.code(404);
    return { error: 'Project not found' };
  }

  // If assigning to agent, verify agent exists and is approved
  if (agent_id) {
    const agent = db.prepare('SELECT * FROM manager_agents WHERE id = ? AND is_approved = 1').get(agent_id);
    if (!agent) {
      reply.code(404);
      return { error: 'Agent not found or not approved' };
    }

    // Verify agent is assigned to project
    const projectAssignment = db.prepare(
      'SELECT * FROM agent_projects WHERE agent_id = ? AND project_id = ? AND status = ?'
    ).get(agent_id, id, 'active');
    
    if (!projectAssignment) {
      reply.code(400);
      return { error: 'Agent must be assigned to project before receiving tasks' };
    }
  }

  const taskId = generateId();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO tasks (
      id, project_id, title, description, priority, status,
      agent_id, assigned_by, assigned_at,
      due_date, estimated_hours, tags, payload, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    taskId, id, title, description || null, priority, agent_id ? 'pending' : 'pending',
    agent_id || null, agent_id ? userId : null, agent_id ? now : null,
    due_date || null, estimated_hours || null, JSON.stringify(tags), JSON.stringify(payload),
    now, now
  );

  // If assigned, create history record
  if (agent_id) {
    db.prepare(`
      INSERT INTO task_assignment_history (id, task_id, agent_id, assigned_by, assigned_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(generateId(), taskId, agent_id, userId, now);
  }

  // Get created task with relations
  const task = db.prepare(`
    SELECT 
      t.*,
      ma.name as agent_name,
      ma.handle as agent_handle,
      ma.avatar_url as agent_avatar,
      u.name as assigned_by_name
    FROM tasks t
    LEFT JOIN manager_agents ma ON t.agent_id = ma.id
    LEFT JOIN users u ON t.assigned_by = u.id
    WHERE t.id = ?
  `).get(taskId);

  const result = {
    ...task,
    payload: JSON.parse(task.payload || '{}'),
    tags: JSON.parse(task.tags || '[]'),
    agent: task.agent_id ? {
      id: task.agent_id,
      name: task.agent_name,
      handle: task.agent_handle,
      avatar_url: task.agent_avatar
    } : null
  };

  // WebSocket event
  wsManager.emitTaskCreated(id, result);

  // DM notification if assigned
  let dmChannelId = null;
  let notificationSent = false;
  
  if (agent_id && userId) {
    try {
      const { getOrCreateDMChannel, sendChannelMessage } = require('./chat');
      const dmChannel = await getOrCreateDMChannel(userId, agent_id);
      dmChannelId = dmChannel.id;
      
      const message = formatTaskAssignmentDM(task, project);
      await sendChannelMessage(userId, dmChannel.id, message);
      notificationSent = true;
      
      // WebSocket event to agent
      wsManager.emitTaskAssignedToAgent(agent_id, {
        task_id: taskId,
        project_id: id,
        project_name: project.name,
        title: task.title,
        priority: task.priority,
        due_date: task.due_date
      });
    } catch (err) {
      console.error('Error sending task assignment DM:', err);
    }
  }

  reply.code(201);
  return {
    ...result,
    notification_sent: notificationSent,
    dm_channel_id: dmChannelId
  };
}

// GET /api/tasks/:id - Get task details
async function getTask(request, reply) {
  const db = getDb();
  const { id } = request.params;

  const task = db.prepare(`
    SELECT 
      t.*,
      ma.name as agent_name,
      ma.handle as agent_handle,
      ma.avatar_url as agent_avatar,
      ma.status as agent_status,
      u.name as assigned_by_name,
      p.name as project_name
    FROM tasks t
    LEFT JOIN manager_agents ma ON t.agent_id = ma.id
    LEFT JOIN users u ON t.assigned_by = u.id
    LEFT JOIN projects p ON t.project_id = p.id
    WHERE t.id = ?
  `).get(id);

  if (!task) {
    reply.code(404);
    return { error: 'Task not found' };
  }

  // Get comments
  const comments = db.prepare(`
    SELECT 
      tc.*,
      u.name as author_name,
      u.avatar_url as author_avatar,
      ma.name as author_agent_name,
      ma.avatar_url as author_agent_avatar
    FROM task_comments tc
    LEFT JOIN users u ON tc.author_id = u.id
    LEFT JOIN manager_agents ma ON tc.author_agent_id = ma.id
    WHERE tc.task_id = ?
    ORDER BY tc.created_at ASC
  `).all(id);

  // Get assignment history
  const history = db.prepare(`
    SELECT 
      tah.*,
      ma.name as agent_name,
      ma.handle as agent_handle,
      ub.name as assigned_by_name,
      uu.name as unassigned_by_name
    FROM task_assignment_history tah
    LEFT JOIN manager_agents ma ON tah.agent_id = ma.id
    LEFT JOIN users ub ON tah.assigned_by = ub.id
    LEFT JOIN users uu ON tah.unassigned_by = uu.id
    WHERE tah.task_id = ?
    ORDER BY tah.assigned_at DESC
  `).all(id);

  return {
    ...task,
    payload: JSON.parse(task.payload || '{}'),
    result: task.result ? JSON.parse(task.result) : null,
    tags: JSON.parse(task.tags || '[]'),
    project: {
      id: task.project_id,
      name: task.project_name
    },
    agent: task.agent_id ? {
      id: task.agent_id,
      name: task.agent_name,
      handle: task.agent_handle,
      avatar_url: task.agent_avatar,
      status: task.agent_status
    } : null,
    assigned_by: task.assigned_by ? {
      id: task.assigned_by,
      name: task.assigned_by_name
    } : null,
    comments: comments.map(c => ({
      ...c,
      metadata: JSON.parse(c.metadata || '{}'),
      author: c.author_id ? {
        id: c.author_id,
        name: c.author_name,
        avatar_url: c.author_avatar
      } : c.author_agent_id ? {
        id: c.author_agent_id,
        name: c.author_agent_name,
        avatar_url: c.author_agent_avatar,
        is_agent: true
      } : null
    })),
    assignment_history: history.map(h => ({
      ...h,
      agent: h.agent_id ? {
        id: h.agent_id,
        name: h.agent_name,
        handle: h.agent_handle
      } : null
    }))
  };
}

// PATCH /api/tasks/:id - Update task details
async function updateTask(request, reply) {
  const db = getDb();
  const { id } = request.params;
  const userId = request.user?.id;
  const {
    title,
    description,
    priority,
    due_date,
    estimated_hours,
    tags,
    payload
  } = request.body;

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!task) {
    reply.code(404);
    return { error: 'Task not found' };
  }

  const now = new Date().toISOString();
  const changes = {};

  // Build update dynamically
  const updates = [];
  const params = [];

  if (title !== undefined) { updates.push('title = ?'); params.push(title); changes.title = { from: task.title, to: title }; }
  if (description !== undefined) { updates.push('description = ?'); params.push(description); changes.description = { from: task.description, to: description }; }
  if (priority !== undefined) { updates.push('priority = ?'); params.push(priority); changes.priority = { from: task.priority, to: priority }; }
  if (due_date !== undefined) { updates.push('due_date = ?'); params.push(due_date); changes.due_date = { from: task.due_date, to: due_date }; }
  if (estimated_hours !== undefined) { updates.push('estimated_hours = ?'); params.push(estimated_hours); changes.estimated_hours = { from: task.estimated_hours, to: estimated_hours }; }
  if (tags !== undefined) { updates.push('tags = ?'); params.push(JSON.stringify(tags)); changes.tags = { from: task.tags, to: tags }; }
  if (payload !== undefined) { 
    const mergedPayload = { ...JSON.parse(task.payload || '{}'), ...payload };
    updates.push('payload = ?'); 
    params.push(JSON.stringify(mergedPayload)); 
    changes.payload = { from: task.payload, to: mergedPayload };
  }

  if (updates.length === 0) {
    return { message: 'No changes provided' };
  }

  updates.push('updated_at = ?');
  params.push(now);
  params.push(id);

  db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  // WebSocket event
  wsManager.emitTaskUpdated(task.project_id, {
    task_id: id,
    changes,
    updated_by: userId,
    updated_at: now
  });

  return {
    task_id: id,
    changes,
    updated_at: now
  };
}

// PATCH /api/tasks/:id/status - Update task status
async function updateTaskStatus(request, reply) {
  const db = getDb();
  const { id } = request.params;
  const userId = request.user?.id;
  const { status, comment } = request.body;

  const validStatuses = ['pending', 'running', 'completed', 'failed', 'cancelled'];
  if (!validStatuses.includes(status)) {
    reply.code(400);
    return { error: `Status must be one of: ${validStatuses.join(', ')}` };
  }

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!task) {
    reply.code(404);
    return { error: 'Task not found' };
  }

  const oldStatus = task.status;
  
  // Validate status transitions
  const validTransitions = {
    pending: ['running', 'cancelled'],
    running: ['completed', 'failed'],
    failed: ['pending', 'cancelled'],
    cancelled: ['pending'],
    completed: []
  };

  if (oldStatus !== status && !validTransitions[oldStatus]?.includes(status)) {
    reply.code(400);
    return { error: `Cannot transition from ${oldStatus} to ${status}` };
  }

  const now = new Date().toISOString();
  const updates = ['status = ?', 'updated_at = ?'];
  const params = [status, now];

  // Set timestamps based on status
  if (status === 'running' && oldStatus !== 'running') {
    updates.push('started_at = ?');
    params.push(now);
  }
  if ((status === 'completed' || status === 'failed') && oldStatus !== status) {
    updates.push('completed_at = ?');
    params.push(now);
  }

  params.push(id);
  db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  // Add system comment if provided
  if (comment) {
    db.prepare(`
      INSERT INTO task_comments (id, task_id, author_id, content, is_system, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(generateId(), id, userId, comment, true, now);
  }

  // WebSocket event
  wsManager.emitTaskStatusChanged(task.project_id, {
    task_id: id,
    old_status: oldStatus,
    new_status: status,
    changed_by: userId,
    changed_at: now
  });

  // Notify agent if task is assigned and completed/failed
  if (task.agent_id && (status === 'completed' || status === 'failed')) {
    wsManager.emitTaskCompleted(task.project_id, {
      task_id: id,
      title: task.title,
      status: status,
      completed_by: userId,
      completed_at: now
    });
  }

  return {
    task_id: id,
    old_status: oldStatus,
    new_status: status,
    updated_at: now
  };
}

// POST /api/tasks/:id/assign - Assign or reassign task to agent
async function assignTask(request, reply) {
  const db = getDb();
  const { id } = request.params;
  const userId = request.user?.id;
  const { agent_id, notify = true, message } = request.body;

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!task) {
    reply.code(404);
    return { error: 'Task not found' };
  }

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(task.project_id);

  const previousAgentId = task.agent_id;
  const now = new Date().toISOString();

  // If unassigning
  if (!agent_id) {
    if (previousAgentId) {
      // Update task
      db.prepare('UPDATE tasks SET agent_id = NULL, assigned_by = NULL, assigned_at = NULL, updated_at = ? WHERE id = ?')
        .run(now, id);

      // Close history record
      db.prepare(`
        UPDATE task_assignment_history 
        SET unassigned_by = ?, unassigned_at = ?
        WHERE task_id = ? AND agent_id = ? AND unassigned_at IS NULL
      `).run(userId, now, id, previousAgentId);

      // WebSocket
      wsManager.emitTaskUnassigned(task.project_id, {
        task_id: id,
        previous_agent_id: previousAgentId,
        unassigned_by: userId,
        unassigned_at: now
      });
    }

    return {
      task_id: id,
      agent_id: null,
      unassigned_at: now
    };
  }

  // Verify new agent exists and is approved
  const agent = db.prepare('SELECT * FROM manager_agents WHERE id = ? AND is_approved = 1').get(agent_id);
  if (!agent) {
    reply.code(404);
    return { error: 'Agent not found or not approved' };
  }

  // Verify agent is assigned to project
  const projectAssignment = db.prepare(
    'SELECT * FROM agent_projects WHERE agent_id = ? AND project_id = ? AND status = ?'
  ).get(agent_id, task.project_id, 'active');
  
  if (!projectAssignment) {
    reply.code(400);
    return { error: 'Agent must be assigned to project before receiving tasks' };
  }

  // Update task
  db.prepare('UPDATE tasks SET agent_id = ?, assigned_by = ?, assigned_at = ?, updated_at = ? WHERE id = ?')
    .run(agent_id, userId, now, now, id);

  // Close previous assignment history if exists
  if (previousAgentId) {
    db.prepare(`
      UPDATE task_assignment_history 
      SET unassigned_by = ?, unassigned_at = ?
      WHERE task_id = ? AND agent_id = ? AND unassigned_at IS NULL
    `).run(userId, now, id, previousAgentId);
  }

  // Create new history record
  db.prepare(`
    INSERT INTO task_assignment_history (id, task_id, agent_id, assigned_by, assigned_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(generateId(), id, agent_id, userId, now);

  // WebSocket events
  wsManager.emitTaskAssigned(task.project_id, {
    task_id: id,
    agent_id: agent_id,
    previous_agent_id: previousAgentId,
    assigned_by: userId,
    assigned_at: now
  });

  wsManager.emitTaskAssignedToAgent(agent_id, {
    task_id: id,
    project_id: task.project_id,
    project_name: project.name,
    title: task.title,
    priority: task.priority,
    due_date: task.due_date
  });

  // DM notification
  let dmChannelId = null;
  if (notify && userId) {
    try {
      const { getOrCreateDMChannel, sendChannelMessage } = require('./chat');
      const dmChannel = await getOrCreateDMChannel(userId, agent_id);
      dmChannelId = dmChannel.id;
      
      const isReassignment = previousAgentId && previousAgentId !== agent_id;
      const dmMessage = isReassignment
        ? formatTaskReassignmentDM(task, project, previousAgentId, userId)
        : formatTaskAssignmentDM(task, project, message);
      
      await sendChannelMessage(userId, dmChannel.id, dmMessage);
    } catch (err) {
      console.error('Error sending task assignment DM:', err);
    }
  }

  return {
    task_id: id,
    agent_id,
    previous_agent_id: previousAgentId,
    assigned_by: userId,
    assigned_at: now,
    dm_channel_id: dmChannelId
  };
}

// POST /api/tasks/:id/comments - Add comment to task
async function addTaskComment(request, reply) {
  const db = getDb();
  const { id } = request.params;
  const userId = request.user?.id;
  const { content } = request.body;

  if (!content || !content.trim()) {
    reply.code(400);
    return { error: 'Content is required' };
  }

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!task) {
    reply.code(404);
    return { error: 'Task not found' };
  }

  const commentId = generateId();
  const now = new Date().toISOString();

  // Check if user is an agent (manager_agent)
  const agentCheck = db.prepare('SELECT id FROM manager_agents WHERE id = ?').get(userId);
  const isAgent = !!agentCheck;

  db.prepare(`
    INSERT INTO task_comments (id, task_id, author_id, author_agent_id, content, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    commentId,
    id,
    isAgent ? null : userId,
    isAgent ? userId : null,
    content.trim(),
    now
  );

  // Get author info
  const author = isAgent
    ? db.prepare('SELECT name, avatar_url FROM manager_agents WHERE id = ?').get(userId)
    : db.prepare('SELECT name, avatar_url FROM users WHERE id = ?').get(userId);

  const comment = {
    id: commentId,
    task_id: id,
    content: content.trim(),
    author: {
      id: userId,
      name: author?.name,
      avatar_url: author?.avatar_url,
      is_agent: isAgent
    },
    created_at: now
  };

  // WebSocket event
  wsManager.emitTaskCommentAdded(task.project_id, {
    task_id: id,
    comment
  });

  reply.code(201);
  return comment;
}

// ============================================================================
// AGENT TASK QUEUE ROUTES
// ============================================================================

// GET /api/agents/:id/tasks - Get all tasks for an agent
async function getAgentTasks(request, reply) {
  const db = getDb();
  const { id } = request.params;
  const { status, limit = 50, offset = 0 } = request.query;
  const user = request.user;

  // Check agent exists
  const agent = db.prepare('SELECT * FROM manager_agents WHERE id = ?').get(id);
  if (!agent) {
    reply.code(404);
    return { error: 'Agent not found' };
  }

  // Only admins or the agent itself can view
  const isAdmin = user?.role === 'admin';
  const isSelf = user?.id === id;

  if (!isAdmin && !isSelf) {
    reply.code(403);
    return { error: 'Not authorized to view this agent\'s tasks' };
  }

  let query = `
    SELECT 
      t.*,
      p.name as project_name,
      u.name as assigned_by_name
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    LEFT JOIN users u ON t.assigned_by = u.id
    WHERE t.agent_id = ?
  `;
  const params = [id];

  if (status) {
    query += ' AND t.status = ?';
    params.push(status);
  }

  query += ' ORDER BY t.created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  const tasks = db.prepare(query).all(...params);

  // Get stats
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
    FROM tasks WHERE agent_id = ?
  `).get(id);

  return {
    agent_id: id,
    agent_name: agent.name,
    tasks: tasks.map(t => ({
      ...t,
      payload: JSON.parse(t.payload || '{}'),
      tags: JSON.parse(t.tags || '[]'),
      project: {
        id: t.project_id,
        name: t.project_name
      }
    })),
    stats: {
      total: stats.total || 0,
      pending: stats.pending || 0,
      running: stats.running || 0,
      completed: stats.completed || 0
    }
  };
}

// GET /api/agents/me/tasks - Get current agent's tasks
async function getMyTasks(request, reply) {
  const userId = request.user?.id;
  
  if (!userId) {
    reply.code(401);
    return { error: 'Authentication required' };
  }

  // Check if user is a manager agent
  const db = getDb();
  const agent = db.prepare('SELECT id FROM manager_agents WHERE id = ?').get(userId);
  
  if (!agent) {
    reply.code(403);
    return { error: 'Only manager agents can access task queue' };
  }

  // Reuse getAgentTasks logic
  request.params = { id: userId };
  return getAgentTasks(request, reply);
}

// ============================================================================
// GLOBAL TASK SEARCH
// ============================================================================

// GET /api/tasks - Search tasks across all projects
async function searchTasks(request, reply) {
  const db = getDb();
  const user = request.user;
  const {
    q,
    project_id,
    agent_id,
    status,
    priority,
    tags,
    due_before,
    due_after,
    limit = 50,
    offset = 0
  } = request.query;

  let query = `
    SELECT 
      t.*,
      ma.name as agent_name,
      ma.handle as agent_handle,
      p.name as project_name,
      u.name as assigned_by_name
    FROM tasks t
    LEFT JOIN manager_agents ma ON t.agent_id = ma.id
    LEFT JOIN projects p ON t.project_id = p.id
    LEFT JOIN users u ON t.assigned_by = u.id
    WHERE 1=1
  `;
  const params = [];

  if (q) {
    query += ' AND (t.title LIKE ? OR t.description LIKE ?)';
    params.push(`%${q}%`, `%${q}%`);
  }

  if (project_id) {
    query += ' AND t.project_id = ?';
    params.push(project_id);
  }

  if (agent_id) {
    query += ' AND t.agent_id = ?';
    params.push(agent_id);
  }

  if (status) {
    query += ' AND t.status = ?';
    params.push(status);
  }

  if (priority) {
    query += ' AND t.priority = ?';
    params.push(parseInt(priority));
  }

  if (due_before) {
    query += ' AND t.due_date <= ?';
    params.push(due_before);
  }

  if (due_after) {
    query += ' AND t.due_date >= ?';
    params.push(due_after);
  }

  query += ' ORDER BY t.created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  const tasks = db.prepare(query).all(...params);

  return {
    tasks: tasks.map(t => ({
      ...t,
      payload: JSON.parse(t.payload || '{}'),
      tags: JSON.parse(t.tags || '[]'),
      agent: t.agent_id ? {
        id: t.agent_id,
        name: t.agent_name,
        handle: t.agent_handle
      } : null,
      project: {
        id: t.project_id,
        name: t.project_name
      }
    })),
    count: tasks.length,
    limit: parseInt(limit),
    offset: parseInt(offset)
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatTaskAssignmentDM(task, project, customMessage = null) {
  const priorityEmoji = ['⚪', '🟢', '🟡', '🟠', '🔴'][task.priority - 1] || '⚪';
  const priorityLabel = ['Low', 'Medium', 'High', 'Critical', 'Urgent'][task.priority - 1] || 'Normal';
  
  let message = `🎯 NEW TASK ASSIGNED\n\n`;
  message += `Project: ${project.name}\n`;
  message += `Task: ${task.title}\n`;
  message += `Priority: ${priorityEmoji} ${priorityLabel}\n`;
  
  if (task.due_date) {
    const dueDate = new Date(task.due_date).toLocaleDateString();
    message += `Due: ${dueDate}\n`;
  }
  
  if (task.estimated_hours) {
    message += `Estimated: ${task.estimated_hours} hours\n`;
  }
  
  if (task.description) {
    message += `\n${task.description.substring(0, 200)}${task.description.length > 200 ? '...' : ''}\n`;
  }
  
  if (customMessage) {
    message += `\n💬 ${customMessage}\n`;
  }
  
  message += `\n[View Task] [Accept] [Decline]`;
  
  return message;
}

function formatTaskReassignmentDM(task, project, previousAgentId, reassignedBy) {
  let message = `🔄 TASK REASSIGNED\n\n`;
  message += `Task: ${task.title}\n`;
  message += `Project: ${project.name}\n`;
  message += `Previously assigned to: ${previousAgentId}\n`;
  message += `Reassigned by: ${reassignedBy}\n\n`;
  message += `[View Task]`;
  
  return message;
}

module.exports = {
  // Task CRUD
  listProjectTasks,
  createTask,
  getTask,
  updateTask,
  updateTaskStatus,
  assignTask,
  addTaskComment,
  
  // Agent task queue
  getAgentTasks,
  getMyTasks,
  
  // Global search
  searchTasks
};
