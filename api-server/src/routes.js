/**
 * API Routes - All Endpoints
 * Projects, Tasks, Costs, Chat, Auth
 */

const { addLog } = require('./log-buffer');

const {
  notifyTaskAssigned,
  notifyTaskAccepted,
  notifyTaskRejected,
  notifyTaskCompleted,
  notifyAgentProjectAssigned,
  notifyAgentProjectRemoved,
  notifyAgentRoleUpdated,
  notifyAgentApproved,
  getUserNotifications,
  getAgentNotifications,
  markUserNotificationRead,
  markAgentNotificationRead,
  markAllUserNotificationsRead,
  markAllAgentNotificationsRead,
  getUserUnreadCount,
  getAgentUnreadCount
} = require('./notifications');

const { getDb, generateId } = require('./database');
const wsManager = require('./websocket');
const {
  syncOpenRouterUsage,
  getActualCosts,
  getBudgetVsActual,
  getModelCosts,
  fetchOpenRouterCredits
} = require('./openrouter');
const { getAllRealCosts } = require('./real-costs');
const {
  sendMessage,
  getChannelHistory,
  getDmHistory,
  getUserDmChannels,
  processIncomingMessage,
  editMessage,
  deleteMessage,
  createChannel,
  getOrCreateDMChannel,
  getChannels,
  getChannelMessages,
  sendChannelMessage
} = require('./chat');
const {
  storeTokenUsage
} = require('./token-dashboard');

const {
  getDashboardSummary,
  getProviderDetails,
  getDailyUsage,
  getModelsBreakdown
} = require('./token-monitoring');
const {
  createUser,
  registerUser,
  getOrCreateUserFromTelegram,
  getUserById,
  getUserByLogin,
  listUsers,
  createSession,
  invalidateSession,
  getUserByToken,
  authenticateUser,
  adminMiddleware,
  requireRole
} = require('./auth');

// ============================================================================
// COST ESTIMATION
// ============================================================================

const AGENT_HOURLY_RATE = { pm: 75, worker: 50, rnd: 60 };
const API_COST_PER_HOUR = {
  'ollama': 0,
  'anthropic/claude-haiku-4-5-20251001': 0.08,
  'anthropic/claude-sonnet-4-6': 0.45,
  'anthropic/claude-opus-4-6': 2.50,
  'openai/gpt-4o': 0.60,
  'openai/gpt-4o-mini': 0.04,
  'openrouter': 0.20,
};

function estimateTaskCost(estimatedHours, agentType, model) {
  const h         = estimatedHours || 1;
  const rate      = AGENT_HOURLY_RATE[agentType] || AGENT_HOURLY_RATE.worker;
  const agentCost = h * rate;
  const apiRate   = (model && API_COST_PER_HOUR[model] !== undefined)
    ? API_COST_PER_HOUR[model]
    : API_COST_PER_HOUR['openrouter'];
  const apiCost   = h * apiRate;
  return {
    hours:      h,
    agent_rate: rate,
    agent_cost: parseFloat(agentCost.toFixed(2)),
    api_cost:   parseFloat(apiCost.toFixed(2)),
    total:      parseFloat((agentCost + apiCost).toFixed(2)),
  };
}

// ============================================================================
// PROJECT ROUTES
// ============================================================================

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

  let countQuery = 'SELECT COUNT(*) as total FROM projects';
  if (status) countQuery += ' WHERE status = ?';
  const { total } = db.prepare(countQuery).get(status ? [status] : []);

  const projectsWithStats = projects.map(p => {
    const taskStats = db.prepare(`
      SELECT
        COUNT(*) as totalTasks,
        SUM(CASE WHEN status IN ('pending','running') THEN 1 ELSE 0 END) as activeTasks,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completedTasks,
        SUM(COALESCE(estimated_cost, 0)) as estimatedCost
      FROM tasks WHERE project_id = ?
    `).get(p.id) || {};
    const costStats = db.prepare(`
      SELECT
        SUM(CASE WHEN date(recorded_at) = date('now') THEN cost_usd ELSE 0 END) as todayCost,
        SUM(CASE WHEN strftime('%Y-%m', recorded_at) = strftime('%Y-%m', 'now') THEN cost_usd ELSE 0 END) as monthCost
      FROM cost_records WHERE project_id = ?
    `).get(p.id) || {};
    const margin = p.company_margin || 30;
    const rawCost = parseFloat((taskStats.estimatedCost || 0).toFixed(2));
    return {
      ...p,
      config: JSON.parse(p.config || '{}'),
      stats: {
        totalTasks:     taskStats.totalTasks     || 0,
        activeTasks:    taskStats.activeTasks    || 0,
        completedTasks: taskStats.completedTasks || 0,
        todayCost:      parseFloat((costStats.todayCost  || 0).toFixed(4)),
        monthCost:      parseFloat((costStats.monthCost  || 0).toFixed(4)),
        monthBudget:    0,
        estimatedCost:  rawCost,
        companyMargin:  margin,
        clientPrice:    parseFloat((rawCost * (1 + margin / 100)).toFixed(2)),
      }
    };
  });

  return {
    projects: projectsWithStats,
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

  const { agent_count } = db.prepare('SELECT COUNT(*) as agent_count FROM agents WHERE project_id = ?').get(id);
  const { task_count } = db.prepare('SELECT COUNT(*) as task_count FROM tasks WHERE project_id = ?').get(id);

  // Get active budgets
  const budgets = db.prepare('SELECT * FROM budgets WHERE project_id = ? AND is_active = 1').all(id);

  return {
    ...project,
    config: JSON.parse(project.config || '{}'),
    agent_count,
    task_count,
    budgets
  };
}

// POST /api/projects - Create new project
async function createProject(request, reply) {
  const db = getDb();
  const { name, description, config = {} } = request.body;
  const owner_id = request.user?.id || 'system';

  if (!name) {
    reply.code(400);
    return { error: 'Name is required' };
  }

  const id = generateId();

  db.prepare(`
    INSERT INTO projects (id, name, description, owner_id, config)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, name, description || null, owner_id, JSON.stringify(config));

  const now = new Date().toISOString();

  // Auto-create project channel
  let channelId;
  try {
    const { createChannel } = require('./chat');
    const channel = await createChannel({
      name: `project-${name}`,
      type: 'project',
      projectId: id,
      createdBy: owner_id
    });
    channelId = channel.id;
  } catch (err) {
    request.log.error({ err }, 'Error creating project channel');
  }

  // Emit project:created WS event (global broadcast)
  wsManager.broadcast('project:created', {
    project_id: id,
    name,
    description,
    status: 'active',
    owner_id,
    channel_id: channelId || null,
    created_at: now
  }, {});

  // Record in activity history
  try {
    db.prepare(`
      INSERT INTO activity_history (event_type, action, entity_id, entity_title, project_id, project_name, user_id, created_at)
      VALUES ('project', 'created', ?, ?, ?, ?, ?, ?)
    `).run(id, name, id, name, owner_id, now);
  } catch (e) { /* activity_history may not exist on very old DBs */ }

  // Global broadcast above already reaches all connected clients (agents + admin)

  reply.code(201);
  return {
    id,
    name,
    description,
    status: 'active',
    owner_id,
    channel_id: channelId || null,
    created_at: now
  };
}

// PATCH /api/projects/:id/status - Update project status
async function updateProjectStatus(request, reply) {
  const db = getDb();
  const { id } = request.params;
  const { status } = request.body;

  const project = db.prepare('SELECT status, name FROM projects WHERE id = ?').get(id);
  if (!project) {
    reply.code(404);
    return { error: 'Project not found' };
  }

  const oldStatus = project.status;
  const now = new Date().toISOString();

  db.prepare('UPDATE projects SET status = ?, updated_at = ? WHERE id = ?')
    .run(status, now, id);

  wsManager.emitProjectStatusChanged(id, oldStatus, status, project.name);

  return { id, old_status: oldStatus, new_status: status, updated_at: now };
}

// ============================================================================
// TASK ROUTES - PHASE 3 IMPLEMENTATION
// ============================================================================

// GET /api/projects/:id/tasks - Get project tasks with full details
async function getProjectTasks(request, reply) {
  const db = getDb();
  const { id } = request.params;
  const { status, agent_id, priority, limit = 50, offset = 0 } = request.query;

  const project = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(id);
  if (!project) {
    reply.code(404);
    return { error: 'Project not found' };
  }

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

  // Get stats
  const statsQuery = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
    FROM tasks WHERE project_id = ?
  `).get(id);

  return {
    tasks: tasks.map(t => ({
      ...t,
      payload: (() => { try { return JSON.parse(t.payload || '{}'); } catch { return {}; } })(),
      result: t.result ? (() => { try { return JSON.parse(t.result); } catch { return t.result; } })() : null,
      tags: (() => { try { return JSON.parse(t.tags || '[]'); } catch { return []; } })(),
      agent: t.agent_id ? {
        id: t.agent_id,
        name: t.agent_name,
        handle: t.agent_handle,
        avatar_url: t.agent_avatar,
        status: t.agent_status
      } : null
    })),
    total: statsQuery.total,
    stats: {
      pending: statsQuery.pending || 0,
      running: statsQuery.running || 0,
      completed: statsQuery.completed || 0,
      cancelled: statsQuery.cancelled || 0
    }
  };
}

// GET /api/projects/:id/report — JSON cost+task report
async function getProjectReport(request, reply) {
  const db = getDb();
  const { id } = request.params;

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!project) { reply.code(404); return { error: 'Project not found' }; }

  const tasks = db.prepare(`
    SELECT t.*, ma.name as agent_name, ma.handle as agent_handle, ma.agent_type
    FROM tasks t
    LEFT JOIN manager_agents ma ON t.agent_id = ma.id
    WHERE t.project_id = ?
    ORDER BY t.created_at ASC
  `).all(id).map(t => ({
    ...t,
    payload: (() => { try { return JSON.parse(t.payload || '{}'); } catch { return {}; } })(),
    tags:    (() => { try { return JSON.parse(t.tags    || '[]'); } catch { return []; } })(),
  }));

  const margin = project.company_margin || 30;
  let totalHours = 0, totalAgentCost = 0, totalApiCost = 0;
  const byStatus = { pending: 0, running: 0, completed: 0, failed: 0, cancelled: 0 };

  for (const t of tasks) {
    const ce = t.payload.cost_estimate || {};
    totalHours     += ce.hours      || t.estimated_hours || 0;
    totalAgentCost += ce.agent_cost || 0;
    totalApiCost   += ce.api_cost   || 0;
    byStatus[t.status] = (byStatus[t.status] || 0) + 1;
  }

  const rawCost      = parseFloat((totalAgentCost + totalApiCost).toFixed(2));
  const marginAmt    = parseFloat((rawCost * margin / 100).toFixed(2));
  const clientPrice  = parseFloat((rawCost + marginAmt).toFixed(2));
  const agentCount   = Math.max(1, new Set(tasks.filter(t => t.agent_id).map(t => t.agent_id)).size);
  const calendarDays = Math.ceil(totalHours / 8 / agentCount);

  return {
    project: { id: project.id, name: project.name, description: project.description, status: project.status, company_margin: margin },
    tasks,
    summary: {
      total_tasks:            tasks.length,
      total_hours:            totalHours,
      agent_cost:             parseFloat(totalAgentCost.toFixed(2)),
      api_cost:               parseFloat(totalApiCost.toFixed(2)),
      raw_cost:               rawCost,
      company_margin_pct:     margin,
      company_margin_amount:  marginAmt,
      client_price:           clientPrice,
      calendar_days_estimate: calendarDays,
      tasks_by_status:        byStatus,
    },
    generated_at: new Date().toISOString(),
  };
}

// GET /api/projects/:id/report.html — Standalone HTML deliverable
async function getProjectReportHtml(request, reply) {
  const report = await getProjectReport(request, reply);
  if (report.error) return;

  const { project, tasks, summary } = report;
  const statusIcon = s => ({ completed: '✅', running: '⚙️', pending: '⏳', failed: '❌', cancelled: '🚫' }[s] || '❓');
  const fmt = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const rows = tasks.map(t => {
    const ce = t.payload.cost_estimate || {};
    return `<tr>
      <td>${t.title}</td>
      <td>${t.agent_name || '<em>unassigned</em>'}</td>
      <td style="text-align:center">${ce.hours || t.estimated_hours || '—'}</td>
      <td style="text-align:right">${ce.agent_cost != null ? fmt(ce.agent_cost) : '—'}</td>
      <td style="text-align:right">${ce.api_cost  != null ? fmt(ce.api_cost)   : '—'}</td>
      <td style="text-align:right"><b>${ce.total   != null ? fmt(ce.total)      : '—'}</b></td>
      <td><span class="badge badge-${t.status}">${statusIcon(t.status)} ${t.status}</span></td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${project.name} — Project Report</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f7fa;color:#1a202c;padding:2rem}
  .container{max-width:960px;margin:0 auto}
  h1{font-size:1.8rem;font-weight:700;margin-bottom:.25rem}
  .meta{color:#718096;margin-bottom:2rem;font-size:.9rem}
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:1rem;margin-bottom:2rem}
  .card{background:#fff;border-radius:10px;padding:1.25rem;box-shadow:0 1px 3px rgba(0,0,0,.08)}
  .card-label{font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;color:#718096;margin-bottom:.4rem}
  .card-value{font-size:1.5rem;font-weight:700}
  .green{color:#38a169}.blue{color:#3182ce}.orange{color:#dd6b20}
  table{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);margin-bottom:2rem}
  th{background:#2d3748;color:#fff;padding:.75rem 1rem;text-align:left;font-size:.78rem;text-transform:uppercase;letter-spacing:.05em}
  td{padding:.7rem 1rem;border-bottom:1px solid #e2e8f0;font-size:.88rem}
  tr:last-child td{border-bottom:none}
  tr:hover td{background:#f7fafc}
  .badge{padding:.2rem .5rem;border-radius:999px;font-size:.7rem;font-weight:600;white-space:nowrap}
  .badge-completed{background:#c6f6d5;color:#276749}
  .badge-running{background:#bee3f8;color:#2a69ac}
  .badge-pending{background:#fefcbf;color:#744210}
  .badge-failed{background:#fed7d7;color:#9b2c2c}
  .badge-cancelled{background:#e2e8f0;color:#4a5568}
  .summary-box{background:#2d3748;color:#fff;border-radius:10px;padding:1.5rem;margin-bottom:2rem}
  .summary-box h2{margin-bottom:1rem;font-size:1rem;opacity:.8}
  .summary-row{display:flex;justify-content:space-between;padding:.4rem 0;border-bottom:1px solid rgba(255,255,255,.08);font-size:.9rem}
  .summary-row:last-child{border-bottom:none;font-size:1.15rem;font-weight:700;padding-top:.8rem;color:#68d391}
  footer{text-align:center;color:#a0aec0;font-size:.78rem;margin-top:2rem}
</style>
</head>
<body>
<div class="container">
  <h1>📋 ${project.name}</h1>
  <p class="meta">${project.description || ''}&nbsp;·&nbsp;Generated ${new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}</p>
  <div class="cards">
    <div class="card"><div class="card-label">Total Tasks</div><div class="card-value blue">${summary.total_tasks}</div></div>
    <div class="card"><div class="card-label">Completed</div><div class="card-value green">${summary.tasks_by_status.completed}</div></div>
    <div class="card"><div class="card-label">Est. Hours</div><div class="card-value">${summary.total_hours}h</div></div>
    <div class="card"><div class="card-label">Timeline</div><div class="card-value orange">~${summary.calendar_days_estimate} days</div></div>
    <div class="card"><div class="card-label">Client Price</div><div class="card-value green">${fmt(summary.client_price)}</div></div>
  </div>
  <table>
    <thead><tr>
      <th>Task</th><th>Agent</th>
      <th style="text-align:center">Hours</th>
      <th style="text-align:right">Agent Cost</th>
      <th style="text-align:right">API Cost</th>
      <th style="text-align:right">Total</th>
      <th>Status</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="summary-box">
    <h2>💰 Cost Breakdown</h2>
    <div class="summary-row"><span>Agent Time (${summary.total_hours}h)</span><span>${fmt(summary.agent_cost)}</span></div>
    <div class="summary-row"><span>API / AI Processing</span><span>${fmt(summary.api_cost)}</span></div>
    <div class="summary-row"><span>Raw Cost</span><span>${fmt(summary.raw_cost)}</span></div>
    <div class="summary-row"><span>Company Margin (${summary.company_margin_pct}%)</span><span>+ ${fmt(summary.company_margin_amount)}</span></div>
    <div class="summary-row"><span>Client Price</span><span>${fmt(summary.client_price)}</span></div>
  </div>
  <footer>Project Claw · AI Agent Management Platform · Report auto-generated</footer>
</div>
</body>
</html>`;

  reply.type('text/html').send(html);
}

// POST /api/tasks - Create new task with optional assignment
async function createTask(request, reply) {
  const db = getDb();
  const userId = request.user?.id;
  const {
    project_id,
    title,
    description,
    priority = 2,
    agent_id,
    due_date,
    estimated_hours,
    tags = [],
    payload = {},
    agent_type: bodyAgentType,
    model: bodyModel,
  } = request.body;

  if (!project_id || !title) {
    reply.code(400);
    return { error: 'project_id and title are required' };
  }

  const project = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(project_id);
  if (!project) {
    reply.code(404);
    return { error: 'Project not found' };
  }

  // Validate agent if provided
  if (agent_id) {
    const agent = db.prepare('SELECT * FROM manager_agents WHERE id = ? AND is_approved = TRUE').get(agent_id);
    if (!agent) {
      reply.code(404);
      return { error: 'Agent not found or not approved' };
    }

    // Check if agent is assigned to project
    const projectAssignment = db.prepare(
      'SELECT * FROM agent_projects WHERE agent_id = ? AND project_id = ? AND status = ?'
    ).get(agent_id, project_id, 'active');

    if (!projectAssignment) {
      reply.code(400);
      return { error: 'Agent is not assigned to this project' };
    }
  }

  const id = generateId();
  const now = new Date().toISOString();

  // Determine agent type for cost estimation
  let agentType = bodyAgentType || 'worker';
  if (!bodyAgentType && agent_id) {
    const agentRow = db.prepare('SELECT agent_type FROM manager_agents WHERE id = ?').get(agent_id);
    if (agentRow) agentType = agentRow.agent_type || 'worker';
  }
  const model = bodyModel || 'ollama';
  const costEstimate = estimateTaskCost(estimated_hours, agentType, model);
  const payloadWithCost = { ...payload, cost_estimate: costEstimate };

  db.prepare(`
    INSERT INTO tasks (
      id, project_id, agent_id, title, description, priority,
      assigned_by, assigned_at, due_date, estimated_hours, tags,
      payload, estimated_cost, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    project_id,
    agent_id || null,
    title,
    description || null,
    priority,
    agent_id ? userId : null,
    agent_id ? now : null,
    due_date || null,
    estimated_hours || null,
    JSON.stringify(tags),
    JSON.stringify(payloadWithCost),
    costEstimate.total,
    now,
    now
  );

  // Create assignment history if assigned
  if (agent_id) {
    db.prepare(`
      INSERT INTO task_assignment_history (id, task_id, agent_id, assigned_by, assigned_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(generateId(), id, agent_id, userId, now);
  }

  const task = {
    id,
    project_id,
    title,
    description,
    status: 'pending',
    priority,
    agent_id: agent_id || null,
    assigned_by: agent_id ? userId : null,
    assigned_at: agent_id ? now : null,
    created_at: now
  };

  wsManager.emitTaskCreated(project_id, task);

  // Best-effort auto-assign for unassigned tasks (non-blocking, never delays response)
  if (!agent_id) {
    setImmediate(() => {
      try {
        const { autoAssignTask } = require('./orchestration-engine');
        Promise.resolve(autoAssignTask(id, { assignedBy: userId }))
          .catch(e => addLog('error', '[Orchestration] Auto-assign failed', { err: e.message }));
      } catch (e) {
        addLog('error', '[Orchestration] Auto-assign hook error', { err: e.message });
      }
    });
  }

  // Send DM notification if task assigned
  let dmChannelId = null;
  if (agent_id) {
    try {
      const { getOrCreateDMChannel, sendChannelMessage } = require('./chat');
      const dmChannel = await getOrCreateDMChannel(userId, agent_id);
      dmChannelId = dmChannel.id;

      const message = formatTaskAssignmentDM({ title, description }, project, null);
      await sendChannelMessage(userId, dmChannel.id, message);

      wsManager.emitTaskAssigned(project_id, {
        task_id: id,
        agent_id,
        assigned_by: userId,
        dm_channel_id: dmChannel.id
      });
    } catch (dmErr) {
      request.log.warn({ err: dmErr }, 'Error sending assignment DM');
    }
  }

  reply.code(201);
  return {
    ...task,
    notification_sent: !!agent_id,
    dm_channel_id: dmChannelId
  };
}

// GET /api/tasks/:id - Get task details
async function getTaskById(request, reply) {
  const db = getDb();
  const { id } = request.params;

  const task = db.prepare(`
    SELECT 
      t.*,
      p.name as project_name,
      ma.name as agent_name,
      ma.handle as agent_handle,
      ma.avatar_url as agent_avatar,
      ma.status as agent_status,
      u.name as assigned_by_name,
      cu.name as cancelled_by_name
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    LEFT JOIN manager_agents ma ON t.agent_id = ma.id
    LEFT JOIN users u ON t.assigned_by = u.id
    LEFT JOIN users cu ON t.cancelled_by = cu.id
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
      ma.handle as author_agent_handle
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
      ab.name as assigned_by_name,
      ub.name as unassigned_by_name
    FROM task_assignment_history tah
    LEFT JOIN manager_agents ma ON tah.agent_id = ma.id
    LEFT JOIN users ab ON tah.assigned_by = ab.id
    LEFT JOIN users ub ON tah.unassigned_by = ub.id
    WHERE tah.task_id = ?
    ORDER BY tah.assigned_at DESC
  `).all(id);

  return {
    ...task,
    payload: (() => { try { return JSON.parse(task.payload || '{}'); } catch { return {}; } })(),
    result: task.result ? (() => { try { return JSON.parse(task.result); } catch { return task.result; } })() : null,
    tags: (() => { try { return JSON.parse(task.tags || '[]'); } catch { return []; } })(),
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
    cancelled_by: task.cancelled_by ? {
      id: task.cancelled_by,
      name: task.cancelled_by_name
    } : null,
    comments: comments.map(c => ({
      ...c,
      metadata: JSON.parse(c.metadata || '{}')
    })),
    assignment_history: history
  };
}

// PATCH /api/tasks/:id - Update task
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
  const updates = [];
  const params = [];
  const changes = {};

  if (title !== undefined) {
    updates.push('title = ?');
    params.push(title);
    changes.title = title;
  }
  if (description !== undefined) {
    updates.push('description = ?');
    params.push(description);
    changes.description = description;
  }
  if (priority !== undefined) {
    updates.push('priority = ?');
    params.push(priority);
    changes.priority = priority;
  }
  if (due_date !== undefined) {
    updates.push('due_date = ?');
    params.push(due_date);
    changes.due_date = due_date;
  }
  if (estimated_hours !== undefined) {
    updates.push('estimated_hours = ?');
    params.push(estimated_hours);
    changes.estimated_hours = estimated_hours;
  }
  if (tags !== undefined) {
    updates.push('tags = ?');
    params.push(JSON.stringify(tags));
    changes.tags = tags;
  }
  if (payload !== undefined) {
    const mergedPayload = { ...JSON.parse(task.payload || '{}'), ...payload };
    updates.push('payload = ?');
    params.push(JSON.stringify(mergedPayload));
    changes.payload = payload;
  }

  if (updates.length === 0) {
    return { message: 'No updates provided' };
  }

  updates.push('updated_at = ?');
  params.push(now);
  params.push(id);

  db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  wsManager.emitTaskUpdated(task.project_id, { task_id: id, changes, updated_by: userId });

  return {
    id,
    changes,
    updated_at: now,
    updated_by: userId
  };
}

// DELETE /api/tasks/:id - Delete task
async function deleteTask(request, reply) {
  const db = getDb();
  const { id } = request.params;
  const user = request.user;

  // Only admins can delete tasks
  if (!user || user.role !== 'admin') {
    reply.code(403);
    return { error: 'Admin access required' };
  }

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!task) {
    reply.code(404);
    return { error: 'Task not found' };
  }

  // Delete related records first
  db.prepare('DELETE FROM task_comments WHERE task_id = ?').run(id);
  db.prepare('DELETE FROM task_assignment_history WHERE task_id = ?').run(id);

  // Delete task
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id);

  wsManager.emitTaskDeleted(task.project_id, { task_id: id, deleted_by: user.id });

  return { success: true, id, deleted_at: new Date().toISOString() };
}

// POST /api/tasks/:id/assign - Assign task to agent
async function assignTask(request, reply) {
  const db = getDb();
  const { id } = request.params;
  const userId = request.user?.id;
  const { agent_id, notify = true, message: customMessage } = request.body;

  if (!agent_id) {
    reply.code(400);
    return { error: 'agent_id is required' };
  }

  const task = db.prepare(`
    SELECT t.*, p.name as project_name 
    FROM tasks t 
    JOIN projects p ON t.project_id = p.id 
    WHERE t.id = ?
  `).get(id);

  if (!task) {
    reply.code(404);
    return { error: 'Task not found' };
  }

  // Validate agent
  const agent = db.prepare('SELECT * FROM manager_agents WHERE id = ? AND is_approved = TRUE').get(agent_id);
  if (!agent) {
    reply.code(404);
    return { error: 'Agent not found or not approved' };
  }

  // Check if agent is assigned to project
  const projectAssignment = db.prepare(
    'SELECT * FROM agent_projects WHERE agent_id = ? AND project_id = ? AND status = ?'
  ).get(agent_id, task.project_id, 'active');

  if (!projectAssignment) {
    reply.code(400);
    return { error: 'Agent is not assigned to this project' };
  }

  const now = new Date().toISOString();
  const previousAgentId = task.agent_id;

  // Update task assignment — reset status to pending if task was failed/cancelled so it can be retried
  const resetStatus = ['failed', 'cancelled'].includes(task.status);
  db.prepare(`
    UPDATE tasks
    SET agent_id = ?, assigned_by = ?, assigned_at = ?, updated_at = ?${resetStatus ? ", status = 'pending', accepted_at = NULL, started_at = NULL, completed_at = NULL" : ''}
    WHERE id = ?
  `).run(agent_id, userId, now, now, id);

  // Close previous assignment history if exists
  if (previousAgentId) {
    db.prepare(`
      UPDATE task_assignment_history 
      SET unassigned_at = ?, unassigned_by = ? 
      WHERE task_id = ? AND agent_id = ? AND unassigned_at IS NULL
    `).run(now, userId, id, previousAgentId);

    wsManager.emitTaskUnassigned(task.project_id, {
      task_id: id,
      previous_agent_id: previousAgentId,
      unassigned_by: userId
    });
  }

  // Create new assignment history
  db.prepare(`
    INSERT INTO task_assignment_history (id, task_id, agent_id, assigned_by, assigned_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(generateId(), id, agent_id, userId, now);

  // Get or create DM channel and send notification
  let dmChannelId = null;
  if (notify) {
    try {
      const { getOrCreateDMChannel, sendChannelMessage } = require('./chat');
      const dmChannel = await getOrCreateDMChannel(userId, agent_id);
      dmChannelId = dmChannel.id;

      const project = { name: task.project_name };
      const message = formatTaskAssignmentDM(task, project, customMessage);
      await sendChannelMessage(userId, dmChannel.id, message);
    } catch (dmErr) {
      request.log.warn({ err: dmErr }, 'Error sending assignment DM');
    }
  }

  wsManager.emitTaskAssigned(task.project_id, {
    task_id: id,
    task_title: task.title,
    agent_id,
    agent_name: db.prepare('SELECT name FROM manager_agents WHERE id = ?').get(agent_id)?.name,
    project_name: task.project_name,
    previous_agent_id: previousAgentId,
    assigned_by: userId,
    dm_channel_id: dmChannelId
  });

  // Persist notification to agent_notifications table
  notifyTaskAssigned(
    { id, title: task.title, project_id: task.project_id },
    { id: task.project_id, name: task.project_name },
    agent_id,
    userId
  ).catch(e => addLog('error', 'notifyTaskAssigned error', { err: e?.message }));

  // Record in activity history
  try {
    db.prepare(`
      INSERT INTO activity_history (event_type, action, entity_id, entity_title, project_id, project_name, agent_id, agent_name, user_id, created_at)
      VALUES ('task', 'assigned', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, task.title, task.project_id, task.project_name, agent_id,
      db.prepare('SELECT name FROM manager_agents WHERE id = ?').get(agent_id)?.name,
      userId, now);
  } catch (e) { /* ignore */ }

  // Update agent statuses: free the previous agent, mark new agent as working
  syncAgentStatus(db, previousAgentId);
  syncAgentStatus(db, agent_id);

  return {
    id,
    agent_id,
    previous_agent_id: previousAgentId,
    assigned_by: userId,
    assigned_at: now,
    notification_sent: notify,
    dm_channel_id: dmChannelId
  };
}

// POST /api/tasks/:id/accept - Agent accepts task
async function acceptTask(request, reply) {
  const db = getDb();
  const { id } = request.params;
  const userId = request.user?.id;

  const task = db.prepare(`
    SELECT t.*, p.name as project_name 
    FROM tasks t 
    JOIN projects p ON t.project_id = p.id 
    WHERE t.id = ?
  `).get(id);

  if (!task) {
    reply.code(404);
    return { error: 'Task not found' };
  }

  // Verify agent is assigned to this task (admin can act on behalf of assigned agent)
  if (task.agent_id !== userId && request.user?.role !== 'admin') {
    reply.code(403);
    return { error: 'Only assigned agent can accept this task' };
  }

  // Validate status — can only accept pending tasks
  if (task.status !== 'pending') {
    reply.code(400);
    return { error: `Cannot accept task from status: ${task.status}` };
  }

  const now = new Date().toISOString();

  db.prepare('UPDATE tasks SET accepted_at = ?, updated_at = ? WHERE id = ?')
    .run(now, now, id);

  // Add system comment
  db.prepare(`
    INSERT INTO task_comments (id, task_id, author_id, content, is_system, created_at)
    VALUES (?, ?, ?, 'Task accepted', TRUE, ?)
  `).run(generateId(), id, userId, now);

  wsManager.emitTaskAccepted(task.project_id, {
    task_id: id,
    task_title: task.title,
    project_name: task.project_name,
    agent_id: userId,
    accepted_at: now
  });

  notifyTaskAccepted(
    { id, title: task.title, project_id: task.project_id, assigned_by: task.assigned_by },
    { id: task.project_id, name: task.project_name },
    userId
  ).catch(e => addLog('error', 'notifyTaskAccepted error', { err: e?.message }));

  try {
    db.prepare(`
      INSERT INTO activity_history (event_type, action, entity_id, entity_title, project_id, project_name, agent_id, created_at)
      VALUES ('task', 'accepted', ?, ?, ?, ?, ?, ?)
    `).run(id, task.title, task.project_id, task.project_name, userId, now);
  } catch (e) { /* ignore */ }

  return {
    id,
    status: task.status,
    accepted_at: now,
    accepted_by: userId
  };
}

// POST /api/tasks/:id/reject - Agent rejects task
async function rejectTask(request, reply) {
  const db = getDb();
  const { id } = request.params;
  const userId = request.user?.id;
  const { reason } = request.body;

  const task = db.prepare(`
    SELECT t.*, p.name as project_name 
    FROM tasks t 
    JOIN projects p ON t.project_id = p.id 
    WHERE t.id = ?
  `).get(id);

  if (!task) {
    reply.code(404);
    return { error: 'Task not found' };
  }

  // Verify agent is assigned to this task
  if (task.agent_id !== userId) {
    reply.code(403);
    return { error: 'Only assigned agent can reject this task' };
  }

  const now = new Date().toISOString();

  // Unassign the task
  db.prepare(`
    UPDATE tasks 
    SET agent_id = NULL, assigned_by = NULL, assigned_at = NULL, updated_at = ? 
    WHERE id = ?
  `).run(now, id);

  // Close assignment history
  db.prepare(`
    UPDATE task_assignment_history 
    SET unassigned_at = ?, unassigned_by = ? 
    WHERE task_id = ? AND agent_id = ? AND unassigned_at IS NULL
  `).run(now, userId, id, userId);

  // Add system comment with rejection reason
  const content = reason ? `Task rejected. Reason: ${reason}` : 'Task rejected';
  db.prepare(`
    INSERT INTO task_comments (id, task_id, author_id, content, is_system, metadata, created_at)
    VALUES (?, ?, ?, ?, TRUE, ?, ?)
  `).run(generateId(), id, userId, content, JSON.stringify({ reason }), now);

  // Notify the original assigner
  if (task.assigned_by) {
    try {
      const { getOrCreateDMChannel, sendChannelMessage } = require('./chat');
      const dmChannel = await getOrCreateDMChannel(userId, task.assigned_by);
      const message = `🚫 TASK REJECTED\n\nTask: ${task.title}\nProject: ${task.project_name}\nRejected by: Agent\n${reason ? `Reason: ${reason}` : ''}`;
      await sendChannelMessage(userId, dmChannel.id, message);
    } catch (dmErr) {
      request.log.warn({ err: dmErr }, 'Error sending rejection DM');
    }
  }

  wsManager.emitTaskRejected(task.project_id, {
    task_id: id,
    task_title: task.title,
    project_name: task.project_name,
    agent_id: userId,
    reason,
    rejected_at: now
  });

  notifyTaskRejected(
    { id, title: task.title, project_id: task.project_id, assigned_by: task.assigned_by },
    { id: task.project_id, name: task.project_name },
    userId,
    reason
  ).catch(e => addLog('error', 'notifyTaskRejected error', { err: e?.message }));

  try {
    db.prepare(`
      INSERT INTO activity_history (event_type, action, entity_id, entity_title, project_id, project_name, agent_id, created_at)
      VALUES ('task', 'rejected', ?, ?, ?, ?, ?, ?)
    `).run(id, task.title, task.project_id, task.project_name, userId, now);
  } catch (e) { /* ignore */ }

  return {
    id,
    agent_id: null,
    rejected_at: now,
    rejected_by: userId,
    reason
  };
}

// POST /api/tasks/:id/start - Agent starts work on task
async function startTask(request, reply) {
  const db = getDb();
  const { id } = request.params;
  const userId = request.user?.id;
  const { comment } = request.body || {};

  const task = db.prepare(`
    SELECT t.*, p.name as project_name 
    FROM tasks t 
    JOIN projects p ON t.project_id = p.id 
    WHERE t.id = ?
  `).get(id);

  if (!task) {
    reply.code(404);
    return { error: 'Task not found' };
  }

  // Verify agent is assigned to this task (admin can act on behalf of assigned agent)
  if (task.agent_id !== userId && request.user?.role !== 'admin') {
    reply.code(403);
    return { error: 'Only assigned agent can start this task' };
  }

  // Validate status transition
  if (task.status !== 'pending') {
    reply.code(400);
    return { error: `Cannot start task from status: ${task.status}` };
  }

  const now = new Date().toISOString();

  // Atomic checkout — prevents two agents from starting the same task simultaneously
  const startResult = db.prepare(`
    UPDATE tasks
    SET status = 'running', started_at = ?, updated_at = ?
    WHERE id = ? AND status = 'pending'
  `).run(now, now, id);

  if (startResult.changes === 0) {
    reply.code(409);
    return { error: 'Task already claimed by another agent' };
  }

  // Agent is now working — update their status + current task tracking
  syncAgentStatus(db, task.agent_id);
  db.prepare(`UPDATE manager_agents SET current_task_id=?, current_task_title=?, current_phase='starting', phase_started_at=? WHERE id=?`)
    .run(id, task.title, now, task.agent_id);

  // Add system comment
  const content = comment ? `Task started. ${comment}` : 'Task started';
  db.prepare(`
    INSERT INTO task_comments (id, task_id, author_id, content, is_system, metadata, created_at)
    VALUES (?, ?, ?, ?, TRUE, ?, ?)
  `).run(generateId(), id, userId, content, JSON.stringify({ comment }), now);

  const agentName = db.prepare('SELECT name FROM manager_agents WHERE id = ?').get(userId)?.name;
  wsManager.emitTaskStarted(task.project_id, {
    task_id: id,
    task_title: task.title,
    project_name: task.project_name,
    agent_id: userId,
    agent_name: agentName,
    started_at: now,
    comment
  });

  // Broadcast phase change for live status box
  wsManager.broadcast('agent:phase', {
    agent_id: task.agent_id,
    agent_name: agentName,
    phase: 'starting',
    task_id: id,
    task_title: task.title,
    started_at: now,
  });

  return {
    id,
    status: 'running',
    started_at: now,
    started_by: userId
  };
}

// POST /api/tasks/:id/complete - Agent completes task
async function completeTask(request, reply) {
  const db = getDb();
  const { id } = request.params;
  const userId = request.user?.id;
  const { result, comment } = request.body || {};

  const task = db.prepare(`
    SELECT t.*, p.name as project_name 
    FROM tasks t 
    JOIN projects p ON t.project_id = p.id 
    WHERE t.id = ?
  `).get(id);

  if (!task) {
    reply.code(404);
    return { error: 'Task not found' };
  }

  // Verify agent is assigned to this task (admin can act on behalf of assigned agent)
  if (task.agent_id !== userId && request.user?.role !== 'admin') {
    reply.code(403);
    return { error: 'Only assigned agent can complete this task' };
  }

  // Validate status transition
  if (task.status !== 'running') {
    reply.code(400);
    return { error: `Cannot complete task from status: ${task.status}` };
  }

  const now = new Date().toISOString();

  db.prepare(`
    UPDATE tasks
    SET status = 'completed', result = ?, completed_at = ?, updated_at = ?
    WHERE id = ?
  `).run(result ? JSON.stringify(result) : null, now, now, id);

  // Clear agent's current task tracking + sync status
  db.prepare(`UPDATE manager_agents SET current_task_id=NULL, current_task_title=NULL, current_phase=NULL, phase_started_at=NULL WHERE id=?`)
    .run(task.agent_id);
  syncAgentStatus(db, task.agent_id);

  const agentName = db.prepare('SELECT name FROM manager_agents WHERE id = ?').get(userId)?.name;

  // Broadcast phase clear
  wsManager.broadcast('agent:phase', {
    agent_id: task.agent_id, agent_name: agentName,
    phase: null, task_id: null, task_title: null,
  });

  // Add system comment
  const content = comment ? `Task completed. ${comment}` : 'Task completed';
  db.prepare(`
    INSERT INTO task_comments (id, task_id, author_id, content, is_system, metadata, created_at)
    VALUES (?, ?, ?, ?, TRUE, ?, ?)
  `).run(generateId(), id, userId, content, JSON.stringify({ result, comment }), now);

  wsManager.emitTaskCompleted(task.project_id, {
    task_id: id,
    task_title: task.title,
    project_name: task.project_name,
    agent_id: userId,
    agent_name: agentName,
    completed_at: now,
    result,
    comment
  });

  notifyTaskCompleted(
    { id, title: task.title, project_id: task.project_id, assigned_by: task.assigned_by },
    { id: task.project_id, name: task.project_name },
    userId,
    result
  ).catch(e => addLog('error', 'notifyTaskCompleted error', { err: e?.message }));

  try {
    db.prepare(`
      INSERT INTO activity_history (event_type, action, entity_id, entity_title, project_id, project_name, agent_id, agent_name, created_at)
      VALUES ('task', 'completed', ?, ?, ?, ?, ?, ?, ?)
    `).run(id, task.title, task.project_id, task.project_name, userId,
      db.prepare('SELECT name FROM manager_agents WHERE id = ?').get(userId)?.name, now);
  } catch (e) { /* ignore */ }

  return {
    id,
    status: 'completed',
    completed_at: now,
    completed_by: userId,
    result
  };
}

// POST /api/tasks/:id/execute - Execute task with AI (agent calls this when task is running)
async function executeTaskRoute(request, reply) {
  const db = getDb();
  const { id } = request.params;
  const user = request.user;

  const task = db.prepare(`
    SELECT t.*, p.name as project_name, p.description as project_description
    FROM tasks t LEFT JOIN projects p ON t.project_id = p.id
    WHERE t.id = ?
  `).get(id);

  if (!task) { reply.code(404); return { error: 'Task not found' }; }
  if (task.status !== 'running') {
    reply.code(400);
    return { error: `Task must be running to execute (current: ${task.status})` };
  }

  const agent = db.prepare('SELECT * FROM manager_agents WHERE id = ?').get(task.agent_id);
  if (!agent) { reply.code(400); return { error: 'No agent assigned to this task' }; }

  // Auth: admin, or the assigned agent's session
  if (user?.role !== 'admin' && user?.id !== task.agent_id) {
    reply.code(403);
    return { error: 'Not authorized' };
  }

  const project = { id: task.project_id, name: task.project_name, description: task.project_description };

  // ── Budget enforcement ────────────────────────────────────────────────────
  if (agent.monthly_budget_usd != null) {
    const monthStart = new Date();
    monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
    const spent = db.prepare(`
      SELECT COALESCE(SUM(cost_usd), 0) as total
      FROM cost_records
      WHERE json_extract(metadata, '$.agent_id') = ? AND recorded_at >= ?
    `).get(agent.id, monthStart.toISOString());
    if (spent.total >= agent.monthly_budget_usd) {
      reply.code(402);
      return { error: `Agent monthly budget exceeded ($${spent.total.toFixed(4)} / $${agent.monthly_budget_usd})` };
    }
  }

  try {
    const { executeTask } = require('./ai-executor');

    // Stream Claude output live to all connected WS clients watching this task
    const onChunk = (chunk) => {
      wsManager.broadcast('task:execution_stream', {
        task_id:   id,
        chunk:     chunk,
        timestamp: new Date().toISOString(),
      });
    };

    const execResult = await executeTask(task, agent, project, onChunk);

    // Log provider used — visible in api-server output for debugging
    const _providerLabel = execResult.skipped
      ? `simulation (${execResult.provider})`
      : `${execResult.provider}${execResult.model ? `/${execResult.model}` : ''}`;
    request.log.info({ taskId: id, provider: _providerLabel, tokens: execResult.tokens?.total ?? 0, cost: execResult.cost?.total_cost?.toFixed(6) ?? '0.000000' }, '[execute] task completed');

    const now = new Date().toISOString();
    const resultText = execResult.result;

    // Complete the task with real AI result + log path
    db.prepare(`UPDATE tasks SET status='completed', result=?, log_path=?, completed_at=?, updated_at=? WHERE id=?`)
      .run(resultText, execResult.log_path || null, now, now, id);

    // Update agent session state — persist task context for future runs
    try {
      const prevState = (() => { try { return JSON.parse(agent.session_state || '{}'); } catch { return {}; } })();
      const recent = prevState.recent_work || [];
      recent.push({
        task:      task.title,
        task_id:   id,
        workspace: execResult.workspace_path || null,
        files:     execResult.files_created  || [],
        done_at:   now,
      });
      const newState = {
        tasks_done:   (prevState.tasks_done || 0) + 1,
        last_updated: now,
        recent_work:  recent.slice(-10), // keep last 10
      };
      db.prepare(`UPDATE manager_agents SET session_state=? WHERE id=?`)
        .run(JSON.stringify(newState), agent.id);
    } catch (e) { request.log.warn({ err: e.message }, '[execute] session update error'); }

    // Clear agent's current task tracking + sync status
    db.prepare(`UPDATE manager_agents SET current_task_id=NULL, current_task_title=NULL, current_phase=NULL, phase_started_at=NULL WHERE id=?`)
      .run(agent.id);
    syncAgentStatus(db, agent.id);

    // Broadcast phase clear for live status box
    wsManager.broadcast('agent:phase', {
      agent_id: agent.id,
      agent_name: agent.name,
      phase: null,
      task_id: null,
      task_title: null,
    });

    // Track token/cost usage in cost_records
    if (!execResult.skipped && execResult.tokens && execResult.cost) {
      try {
        const provider = execResult.provider || 'unknown';
        const pricing = execResult.cost.pricing || { prompt: 0, completion: 0 };
        const metadata = {
          task_id: id,
          task_title: task.title,
          agent_id: agent.id,
          cost_mode: execResult.cost_mode || 'estimated',
          source: 'task_execute'
        };

        db.prepare(`
          INSERT INTO cost_records (id, project_id, user_id, model, provider,
            prompt_tokens, completion_tokens, total_tokens, cost_usd,
            cost_per_1k_prompt, cost_per_1k_completion, request_id, is_cached, metadata, recorded_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
        `).run(
          generateId(), task.project_id, null, execResult.model || 'unknown', provider,
          execResult.tokens.prompt || 0, execResult.tokens.completion || 0, execResult.tokens.total || 0,
          execResult.cost.total_cost || 0,
          (pricing.prompt || 0) / 1000,
          (pricing.completion || 0) / 1000,
          generateId(),
          JSON.stringify(metadata),
          now
        );
      } catch (e) { request.log.warn({ err: e.message }, '[execute] cost tracking error'); }
    }

    // WS broadcast
    wsManager.emitTaskCompleted(task.project_id, {
      task_id: id,
      task_title: task.title,
      project_id: task.project_id,
      project_name: task.project_name,
      agent_id: agent.id,
      agent_name: agent.name,
      completed_at: now,
    });

    // Notify assigner
    if (task.assigned_by) {
      notifyTaskCompleted(
        { id, title: task.title, project_id: task.project_id, assigned_by: task.assigned_by },
        { id: task.project_id, name: task.project_name },
        agent.id, resultText.substring(0, 200)
      ).catch(() => {});
    }

    // Post result to project channel
    try {
      const { sendChannelMessage } = require('./chat');
      const channel = db.prepare('SELECT id FROM channels WHERE project_id = ? AND type = ?')
        .get(task.project_id, 'project');
      if (channel) {
        const preview = resultText.length > 600 ? resultText.substring(0, 600) + '\n\n_[truncated]_' : resultText;
        await sendChannelMessage(null, channel.id,
          `✅ **Task Completed: ${task.title}**\n\n${preview}`,
          { agent_id: agent.id }
        );
      }
    } catch (e) { request.log.warn({ err: e.message }, '[execute] channel post error'); }

    // Activity history
    try {
      db.prepare(`
        INSERT INTO activity_history (event_type, action, entity_id, entity_title, project_id, project_name, agent_id, agent_name, user_id, metadata, created_at)
        VALUES ('task', 'completed', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, task.title, task.project_id, task.project_name, agent.id, agent.name, user?.id,
        JSON.stringify({ model: execResult.model, tokens: execResult.tokens, ai_executed: !execResult.skipped }),
        now
      );
    } catch (e) { /* ignore */ }

    return {
      task_id: id,
      status: 'completed',
      model: execResult.model,
      tokens: execResult.tokens,
      cost_usd: execResult.cost?.total_cost ?? null,
      skipped: execResult.skipped,
      result_preview: resultText.substring(0, 300),
    };

  } catch (err) {
    request.log.error({ err }, '[execute] AI execution error');
    // Mark task failed
    const now = new Date().toISOString();
    db.prepare(`UPDATE tasks SET status='failed', result=?, updated_at=? WHERE id=?`)
      .run(`AI execution failed: ${err.message}`, now, id);
    reply.code(500);
    return { error: err.message };
  }
}

// POST /api/tasks/:id/cancel - Cancel task
async function cancelTask(request, reply) {
  const db = getDb();
  const { id } = request.params;
  const userId = request.user?.id;
  const { reason } = request.body || {};

  const task = db.prepare(`
    SELECT t.*, p.name as project_name 
    FROM tasks t 
    JOIN projects p ON t.project_id = p.id 
    WHERE t.id = ?
  `).get(id);

  if (!task) {
    reply.code(404);
    return { error: 'Task not found' };
  }

  // Only assigned agent, assigner, or admin can cancel
  const isAssignedAgent = task.agent_id === userId;
  const isAssigner = task.assigned_by === userId;
  const isAdmin = request.user?.role === 'admin';

  if (!isAssignedAgent && !isAssigner && !isAdmin) {
    reply.code(403);
    return { error: 'Not authorized to cancel this task' };
  }

  // Validate status transition
  if (task.status === 'completed' || task.status === 'cancelled') {
    reply.code(400);
    return { error: `Cannot cancel task with status: ${task.status}` };
  }

  const now = new Date().toISOString();

  db.prepare(`
    UPDATE tasks
    SET status = 'cancelled', cancelled_at = ?, cancelled_by = ?, updated_at = ?
    WHERE id = ?
  `).run(now, userId, now, id);

  // Check if agent has other running tasks → set idle if none remain
  syncAgentStatus(db, task.agent_id);

  // Add system comment
  const content = reason ? `Task cancelled. Reason: ${reason}` : 'Task cancelled';
  db.prepare(`
    INSERT INTO task_comments (id, task_id, author_id, content, is_system, metadata, created_at)
    VALUES (?, ?, ?, ?, TRUE, ?, ?)
  `).run(generateId(), id, userId, content, JSON.stringify({ reason }), now);

  wsManager.emitTaskCancelled(task.project_id, {
    task_id: id,
    cancelled_by: userId,
    reason,
    cancelled_at: now
  });

  return {
    id,
    status: 'cancelled',
    cancelled_at: now,
    cancelled_by: userId,
    reason
  };
}

// ─── Helper: update agent status based on running task count ─────────────────
function syncAgentStatus(db, agentId) {
  if (!agentId) return;
  try {
    const { count } = db.prepare(
      "SELECT COUNT(*) as count FROM tasks WHERE agent_id = ? AND status IN ('pending', 'running')"
    ).get(agentId);
    const newStatus = count > 0 ? 'working' : 'idle';
    db.prepare("UPDATE manager_agents SET status = ? WHERE id = ?").run(newStatus, agentId);
  } catch (e) { /* non-critical */ }
}

// ─── Helper: priority escalation logic ───────────────────────────────────────
function handlePriorityEscalation(db, task, newPriority, oldPriority, wsManager) {
  const now = new Date().toISOString();

  // Escalation: priority bumped to critical (4) or urgent (5)
  if (newPriority >= 4 && oldPriority < 4) {
    // Find idle agents on the project that are not already on a critical/urgent task
    const idleAgents = db.prepare(`
      SELECT ma.*
      FROM manager_agents ma
      JOIN agent_projects ap ON ap.agent_id = ma.id
      WHERE ap.project_id = ?
        AND ap.status = 'active'
        AND ma.is_approved = 1
        AND ma.status IN ('idle', 'online')
        AND ma.id != ?
        AND ma.id NOT IN (
          SELECT DISTINCT agent_id FROM tasks
          WHERE agent_id IS NOT NULL AND status = 'running' AND priority >= 4
        )
      ORDER BY ma.experience_level DESC
      LIMIT 1
    `).all(task.project_id, task.agent_id || '');

    if (idleAgents.length > 0) {
      const helper = idleAgents[0];
      // Auto-create a helper sub-task
      const { generateId } = require('./database');
      const helperTaskId = generateId();
      db.prepare(`
        INSERT INTO tasks (id, project_id, agent_id, title, description, status, priority, assigned_by, assigned_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'pending', ?, NULL, ?, ?, ?)
      `).run(
        helperTaskId, task.project_id, helper.id,
        `[ESCALATED ASSIST] ${task.title}`,
        `Auto-assigned to assist with escalated task "${task.title}" (priority raised to ${newPriority >= 5 ? 'urgent' : 'critical'})`,
        newPriority, now, now, now
      );

      // Set helper to working
      db.prepare("UPDATE manager_agents SET status = 'working' WHERE id = ?").run(helper.id);

      // WS notify
      try {
        wsManager.emitTaskAssigned(task.project_id, {
          task_id: helperTaskId,
          task_title: `[ESCALATED ASSIST] ${task.title}`,
          project_id: task.project_id,
          agent_id: helper.id,
          agent_name: helper.name,
        });
      } catch (e) { /* ignore */ }

      // Log to activity_history
      try {
        db.prepare(`
          INSERT INTO activity_history (event_type, action, entity_id, entity_title, project_id, agent_id, agent_name, metadata, created_at)
          VALUES ('task', 'escalated_assigned', ?, ?, ?, ?, ?, ?, ?)
        `).run(task.id, task.title, task.project_id, helper.id, helper.name,
          JSON.stringify({ new_priority: newPriority, helper_task_id: helperTaskId }), now);
      } catch (e) { /* ignore */ }

      addLog('info', `[Escalation] Task "${task.title}" escalated to ${newPriority >= 5 ? 'urgent' : 'critical'} → helper ${helper.name} auto-assigned`, { taskId: task.id, helperId: helper.id });
    } else {
      // No idle agent found — emit admin notification
      try {
        wsManager.broadcast('task:needs_agent', {
          task_id: task.id,
          task_title: task.title,
          project_id: task.project_id,
          priority: newPriority,
          reason: 'No idle agent available for escalated task',
        }, {});
      } catch (e) { /* ignore */ }

      // Persist admin notification
      try {
        const { generateId } = require('./database');
        db.prepare(`
          INSERT INTO agent_notifications (id, agent_id, type, title, content, data, created_at)
          VALUES (?, NULL, 'unassigned_task', 'Escalated Task Needs Agent', ?, ?, ?)
        `).run(
          generateId(),
          `Task "${task.title}" was escalated to ${newPriority >= 5 ? 'urgent' : 'critical'} but no idle agent is available.`,
          JSON.stringify({ task_id: task.id, task_title: task.title, project_id: task.project_id, priority: newPriority }),
          now
        );
      } catch (e) { /* ignore */ }

      addLog('warn', `[Escalation] Task "${task.title}" escalated — no idle agent found, admin notified`, { taskId: task.id, priority: newPriority });
    }
  }

  // De-escalation: priority lowered — release a helper agent if task has multiple running agents
  if (newPriority < oldPriority && newPriority < 4) {
    // Find the lowest-priority running task on this project with an agent we can reassign
    const extraAgentTask = db.prepare(`
      SELECT t.id as task_id, t.agent_id, t.title
      FROM tasks t
      WHERE t.project_id = ?
        AND t.status = 'running'
        AND t.agent_id IS NOT NULL
        AND t.id != ?
        AND t.title LIKE '[ESCALATED ASSIST]%'
      ORDER BY t.created_at ASC
      LIMIT 1
    `).get(task.project_id, task.id);

    if (extraAgentTask) {
      // Cancel the escalated helper task
      db.prepare("UPDATE tasks SET status = 'cancelled', cancelled_at = ?, updated_at = ? WHERE id = ?")
        .run(now, now, extraAgentTask.task_id);

      const releasedAgentId = extraAgentTask.agent_id;

      // Update released agent status
      syncAgentStatus(db, releasedAgentId);

      // Reassign released agent to next highest-priority pending task on the project
      const nextTask = db.prepare(`
        SELECT id FROM tasks
        WHERE project_id = ? AND status = 'pending' AND agent_id IS NULL
        ORDER BY priority DESC, created_at ASC
        LIMIT 1
      `).get(task.project_id);

      if (nextTask) {
        db.prepare("UPDATE tasks SET agent_id = ?, assigned_at = ?, updated_at = ? WHERE id = ?")
          .run(releasedAgentId, now, now, nextTask.id);
        db.prepare("UPDATE manager_agents SET status = 'working' WHERE id = ?").run(releasedAgentId);

        try {
          wsManager.emitTaskAssigned(task.project_id, {
            task_id: nextTask.id,
            agent_id: releasedAgentId,
            project_id: task.project_id,
          });
        } catch (e) { /* ignore */ }

        addLog('info', `[De-escalation] Released helper agent ${releasedAgentId} → reassigned to task ${nextTask.id}`, { agentId: releasedAgentId, taskId: nextTask.id });
      } else {
        addLog('info', `[De-escalation] Released helper agent ${releasedAgentId} → no pending tasks, set idle`, { agentId: releasedAgentId });
      }

      // Log to activity_history
      try {
        db.prepare(`
          INSERT INTO activity_history (event_type, action, entity_id, entity_title, project_id, agent_id, metadata, created_at)
          VALUES ('task', 'deescalated', ?, ?, ?, ?, ?, ?)
        `).run(task.id, task.title, task.project_id, releasedAgentId,
          JSON.stringify({ old_priority: oldPriority, new_priority: newPriority }), now);
      } catch (e) { /* ignore */ }
    }
  }
}

// PATCH /api/tasks/:id/priority - Update task priority with escalation logic
async function updateTaskPriority(request, reply) {
  const db = getDb();
  const { id } = request.params;
  const userId = request.user?.id;
  const { priority } = request.body;

  // Validate priority is integer 1-5
  if (priority === undefined || !Number.isInteger(Number(priority)) || Number(priority) < 1 || Number(priority) > 5) {
    reply.code(400);
    return { error: 'priority must be an integer between 1 and 5' };
  }
  const newPriority = Number(priority);

  const task = db.prepare(`
    SELECT t.*, p.name as project_name
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    WHERE t.id = ?
  `).get(id);

  if (!task) {
    reply.code(404);
    return { error: 'Task not found' };
  }

  const oldPriority = task.priority;
  const now = new Date().toISOString();

  // Update priority
  db.prepare('UPDATE tasks SET priority = ?, updated_at = ? WHERE id = ?').run(newPriority, now, id);

  // Emit WS event
  wsManager.broadcast('task:priority_changed', {
    task_id: id,
    task_title: task.title,
    project_id: task.project_id,
    old_priority: oldPriority,
    new_priority: newPriority,
    changed_by: userId,
  }, {});

  // Log to activity_history
  try {
    db.prepare(`
      INSERT INTO activity_history (event_type, action, entity_id, entity_title, project_id, project_name, user_id, metadata, created_at)
      VALUES ('task', 'priority_changed', ?, ?, ?, ?, ?, ?, ?)
    `).run(id, task.title, task.project_id, task.project_name, userId,
      JSON.stringify({ old_priority: oldPriority, new_priority: newPriority }), now);
  } catch (e) { /* ignore */ }

  // Trigger escalation/de-escalation logic
  if (oldPriority !== newPriority) {
    try {
      handlePriorityEscalation(db, task, newPriority, oldPriority, wsManager);
    } catch (e) {
      request.log.error({ err: e }, '[Priority Escalation] Error');
    }
  }

  return {
    id,
    old_priority: oldPriority,
    new_priority: newPriority,
    updated_at: now,
    updated_by: userId
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

  const task = db.prepare(`
    SELECT t.*, p.name as project_name 
    FROM tasks t 
    JOIN projects p ON t.project_id = p.id 
    WHERE t.id = ?
  `).get(id);

  if (!task) {
    reply.code(404);
    return { error: 'Task not found' };
  }

  const now = new Date().toISOString();
  const commentId = generateId();

  // Check if user is a manager agent
  const agent = db.prepare('SELECT id FROM manager_agents WHERE id = ?').get(userId);

  db.prepare(`
    INSERT INTO task_comments (id, task_id, author_id, author_agent_id, content, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(commentId, id, agent ? null : userId, agent ? userId : null, content, now);

  const comment = db.prepare(`
    SELECT 
      tc.*,
      u.name as author_name,
      u.avatar_url as author_avatar,
      ma.name as author_agent_name,
      ma.handle as author_agent_handle
    FROM task_comments tc
    LEFT JOIN users u ON tc.author_id = u.id
    LEFT JOIN manager_agents ma ON tc.author_agent_id = ma.id
    WHERE tc.id = ?
  `).get(commentId);

  wsManager.emitCommentAdded(task.project_id, {
    task_id: id,
    comment_id: commentId,
    author_id: userId,
    content,
    created_at: now
  });

  reply.code(201);
  return {
    ...comment,
    metadata: JSON.parse(comment.metadata || '{}')
  };
}

// GET /api/tasks/:id/updates - Get updates for a task
async function getTaskUpdates(request, reply) {
  const db = getDb();
  const { id } = request.params;
  const { limit = 50, offset = 0 } = request.query;

  const task = db.prepare('SELECT id FROM tasks WHERE id = ?').get(id);
  if (!task) {
    reply.code(404);
    return { error: 'Task not found' };
  }

  const updates = db.prepare(`
    SELECT
      tu.*,
      ma.name as agent_name,
      ma.handle as agent_handle,
      u.name as user_name
    FROM task_updates tu
    LEFT JOIN manager_agents ma ON tu.agent_id = ma.id
    LEFT JOIN users u ON tu.user_id = u.id
    WHERE tu.task_id = ?
    ORDER BY tu.created_at ASC
    LIMIT ? OFFSET ?
  `).all(id, parseInt(limit), parseInt(offset));

  return { updates };
}

// POST /api/tasks/:id/updates - Add an update to a task
async function addTaskUpdate(request, reply) {
  const db = getDb();
  const { id } = request.params;
  const userId = request.user?.id;
  const { content, update_type = 'progress', is_public = true } = request.body;

  if (!content || !content.trim()) {
    reply.code(400);
    return { error: 'Content is required' };
  }

  const task = db.prepare('SELECT id FROM tasks WHERE id = ?').get(id);
  if (!task) {
    reply.code(404);
    return { error: 'Task not found' };
  }

  const validTypes = ['progress', 'question', 'blocker', 'completion', 'system'];
  if (!validTypes.includes(update_type)) {
    reply.code(400);
    return { error: `update_type must be one of: ${validTypes.join(', ')}` };
  }

  const updateId = generateId();
  const now = new Date().toISOString();

  // Determine if author is an agent or a user
  const agent = db.prepare('SELECT id FROM manager_agents WHERE id = ?').get(userId);

  db.prepare(`
    INSERT INTO task_updates (id, task_id, agent_id, user_id, update_type, content, is_public, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(updateId, id, agent ? userId : null, agent ? null : userId, update_type, content.trim(), is_public ? 1 : 0, now);

  const update = db.prepare(`
    SELECT tu.*, ma.name as agent_name, ma.handle as agent_handle, u.name as user_name
    FROM task_updates tu
    LEFT JOIN manager_agents ma ON tu.agent_id = ma.id
    LEFT JOIN users u ON tu.user_id = u.id
    WHERE tu.id = ?
  `).get(updateId);

  reply.code(201);
  return { update };
}

// GET /api/agents/:id/tasks - Get tasks assigned to an agent
async function getAgentTasks(request, reply) {
  const db = getDb();
  const { id } = request.params;
  const { status, limit = 50, offset = 0 } = request.query;

  const agent = db.prepare('SELECT id, name FROM manager_agents WHERE id = ?').get(id);
  if (!agent) {
    reply.code(404);
    return { error: 'Agent not found' };
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
      tags: JSON.parse(t.tags || '[]')
    })),
    stats: {
      total: stats.total || 0,
      pending: stats.pending || 0,
      running: stats.running || 0,
      completed: stats.completed || 0
    }
  };
}

// GET /api/agents/me/tasks - Get tasks for current agent
async function getMyTasks(request, reply) {
  const userId = request.user?.id;
  if (!userId) {
    reply.code(401);
    return { error: 'Authentication required' };
  }

  // Reuse getAgentTasks with the current user's ID
  request.params.id = userId;
  return getAgentTasks(request, reply);
}

// GET /api/tasks - Search tasks across all projects
async function searchTasks(request, reply) {
  const db = getDb();
  const { q, project_id, agent_id, status, priority, limit = 50, offset = 0 } = request.query;

  let query = `
    SELECT 
      t.*,
      p.name as project_name,
      ma.name as agent_name,
      ma.handle as agent_handle,
      u.name as assigned_by_name
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    LEFT JOIN manager_agents ma ON t.agent_id = ma.id
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

  query += ' ORDER BY t.created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  const tasks = db.prepare(query).all(...params);

  return {
    tasks: tasks.map(t => ({
      ...t,
      payload: (() => { try { return JSON.parse(t.payload || '{}'); } catch { return {}; } })(),
      result: t.result ? (() => { try { return JSON.parse(t.result); } catch { return t.result; } })() : null,
      tags: (() => { try { return JSON.parse(t.tags || '[]'); } catch { return []; } })()
    })),
    total: tasks.length,
    limit: parseInt(limit),
    offset: parseInt(offset)
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Format task assignment DM message
function formatTaskAssignmentDM(task, project, customMessage) {
  const priorityEmoji = { 1: '🔵', 2: '🟢', 3: '🟡', 4: '🟠', 5: '🔴' };
  const priorityLabels = { 1: 'Low', 2: 'Normal', 3: 'Medium', 4: 'High', 5: 'Critical' };

  let message = '🎯 **NEW TASK ASSIGNED**\n\n';
  message += `**Project:** ${project.name}\n`;
  message += `**Task:** ${task.title}\n`;
  message += `**Priority:** ${priorityEmoji[task.priority] || '⚪'} ${priorityLabels[task.priority] || 'Unknown'}\n`;

  if (task.due_date) {
    const dueDate = new Date(task.due_date);
    message += `**Due:** ${dueDate.toLocaleDateString()}\n`;
  }

  if (task.estimated_hours) {
    message += `**Estimated:** ${task.estimated_hours} hours\n`;
  }

  message += '\n';

  if (task.description) {
    message += `${task.description.substring(0, 200)}${task.description.length > 200 ? '...' : ''}\n\n`;
  }

  if (customMessage) {
    message += `**Note:** ${customMessage}\n\n`;
  }

  message += '[View Task]';

  return message;
}

// ============================================================================
// COST ROUTES (Legacy - Mock Data)
// ============================================================================

// GET /api/costs - List all costs (now using real-costs.js for live data)
async function getCosts(request, reply) {
  try {
    // Get real costs from providers
    const { getAllRealCosts } = require('./real-costs');
    const realCosts = await getAllRealCosts();

    // Also get database costs for project-specific details
    const db = getDb();
    const { project_id, limit = 50, offset = 0 } = request.query;

    let query = `
      SELECT 
        c.*,
        p.name as project_name,
        a.name as agent_name
      FROM costs c
      LEFT JOIN projects p ON c.project_id = p.id
      LEFT JOIN agents a ON c.agent_id = a.id
      WHERE 1=1
    `;
    const params = [];

    if (project_id) {
      query += ' AND c.project_id = ?';
      params.push(project_id);
    }

    query += ' ORDER BY c.recorded_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const costs = db.prepare(query).all(...params);

    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) as total FROM costs WHERE 1=1';
    if (project_id) countQuery += ' AND project_id = ?';
    const { total } = db.prepare(countQuery).get(project_id ? [project_id] : []);

    // Format database costs
    const formattedCosts = costs.map(c => ({
      id: c.id,
      provider: c.model ? c.model.split('/')[0] || 'unknown' : 'unknown',
      model: c.model,
      tokens_in: c.prompt_tokens || 0,
      tokens_out: c.completion_tokens || 0,
      cost_usd: c.cost_usd || 0,
      timestamp: c.recorded_at,
      project_id: c.project_id,
      project_name: c.project_name,
      agent_id: c.agent_id,
      agent_name: c.agent_name
    }));

    return {
      // Include real provider costs
      providers: realCosts.perModelBreakdown,
      totals: {
        spent: realCosts.totalSpent,
        budget: realCosts.totalBudget,
        remaining: realCosts.budgetRemaining,
        tokens: realCosts.totalTokens,
        lastUpdated: realCosts.lastUpdated
      },
      // Include database costs
      costs: formattedCosts,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    };
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
}

// GET /api/costs/summary - Legacy cost analytics (mock data)
async function getCostSummary(request, reply) {
  const db = getDb();
  const { project_id, from, to, group_by = 'day' } = request.query;

  let dateFormat;
  switch (group_by) {
    case 'week': dateFormat = "%Y-%W"; break;
    case 'month': dateFormat = "%Y-%m"; break;
    default: dateFormat = "%Y-%m-%d";
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

  if (project_id) { query += ' AND project_id = ?'; params.push(project_id); }
  if (from) { query += ' AND recorded_at >= ?'; params.push(from); }
  if (to) { query += ' AND recorded_at <= ?'; params.push(to); }

  query += ` GROUP BY project_id, strftime('${dateFormat}', recorded_at) ORDER BY date DESC`;

  const summary = db.prepare(query).all(...params);

  let totalQuery = `SELECT COUNT(*) as requests, SUM(total_tokens) as tokens, ROUND(SUM(cost_usd), 6) as cost_usd FROM costs WHERE 1=1`;
  if (project_id) totalQuery += ' AND project_id = ?';
  if (from) totalQuery += ' AND recorded_at >= ?';
  if (to) totalQuery += ' AND recorded_at <= ?';

  const grandTotal = db.prepare(totalQuery).get(...params);

  return {
    summary: summary.map(row => ({ ...row })),
    grand_total: {
      requests: grandTotal.requests || 0,
      tokens: grandTotal.tokens || 0,
      cost_usd: grandTotal.cost_usd || 0
    }
  };
}

// POST /api/costs - Record a cost (legacy)
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

  wsManager.emitCostUpdated(project_id, { cost_id: id, model, prompt_tokens: prompt_tokens || 0, completion_tokens: completion_tokens || 0, total_tokens, cost_usd: cost_usd || 0 });

  reply.code(201);
  return { id, project_id, recorded_at: now };
}

// ============================================================================
// REAL COST TRACKING ROUTES
// ============================================================================

// GET /api/costs/actual - Real costs from OpenRouter
async function getActualCostsRoute(request, reply) {
  try {
    const result = await getActualCosts(request.query);
    return result;
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
}

// GET /api/costs/live - Live cost summary from real API providers
async function getLiveCostsRoute(request, reply) {
  try {
    const realCosts = await getAllRealCosts();
    return realCosts;
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
}

// POST /api/costs/sync - Trigger OpenRouter sync
async function syncCostsRoute(request, reply) {
  try {
    const result = await syncOpenRouterUsage(request.body);
    return result;
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
}

// GET /api/costs/budget - Budget vs actual
async function getBudgetVsActualRoute(request, reply) {
  try {
    const result = await getBudgetVsActual(request.query);
    return result;
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
}

// GET /api/costs/models - Per-model breakdown
async function getModelCostsRoute(request, reply) {
  try {
    const result = await getModelCosts(request.query);
    return result;
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
}

// GET /api/costs/credits - OpenRouter credits
async function getCreditsRoute(request, reply) {
  if (!process.env.OPENROUTER_API_KEY) {
    return { credits: null, usage: null, message: 'OPENROUTER_API_KEY not configured' };
  }
  try {
    const result = await fetchOpenRouterCredits();
    return result;
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
}

async function getCostsByAgentRoute(request, reply) {
  const db = getDb();
  try {
    const rows = db.prepare(`
      SELECT
        c.agent_id,
        ma.name   AS agent_name,
        ma.handle AS agent_handle,
        ma.agent_type,
        COUNT(*)                         AS task_count,
        COALESCE(SUM(c.cost_usd), 0)     AS total_cost,
        COALESCE(SUM(c.total_tokens), 0) AS total_tokens
      FROM costs c
      LEFT JOIN manager_agents ma ON ma.id = c.agent_id
      GROUP BY c.agent_id
      ORDER BY total_cost DESC
    `).all();
    return { agents: rows };
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
}

// ============================================================================
// CHANNEL ROUTES
// ============================================================================

// GET /api/channels - List all channels for user
async function listChannelsRoute(request, reply) {
  const db = getDb();
  const userId = request.user?.id;
  const { type } = request.query;

  try {
    let query = `
      SELECT
        c.id, c.name, c.type,
        c.project_id, c.is_dm, c.dm_user_id, c.dm_agent_id,
        c.participant_1_id, c.participant_2_id,
        c.created_by, c.created_at,
        p.name as project_name,
        ma.name as dm_agent_name,
        ma.avatar_url as dm_agent_avatar,
        ma.role as dm_agent_role,
        ma.agent_type as dm_agent_type,
        ma.status as dm_agent_status,
        (
          SELECT COUNT(*) FROM messages m
          WHERE (m.channel_id = c.id OR m.channel = c.name)
          AND m.created_at > COALESCE(
            (SELECT last_read_at FROM channel_members WHERE channel_id = c.id AND user_id = ?),
            '1970-01-01'
          )
        ) as unread_count
      FROM channels c
      LEFT JOIN projects p ON c.project_id = p.id
      LEFT JOIN manager_agents ma ON c.dm_agent_id = ma.id
      WHERE c.is_archived = 0
    `;
    const params = [userId];

    if (type) {
      query += ' AND c.type = ?';
      params.push(type);
    }

    // Non-admins only see channels they belong to (rnd_feed and agent_bus are global)
    if (request.user?.role !== 'admin') {
      query += ` AND (
        c.type = 'general'
        OR c.type = 'rnd_feed'
        OR c.type = 'agent_bus'
        OR c.created_by = ?
        OR c.dm_user_id = ?
        OR c.participant_1_id = ?
        OR c.participant_2_id = ?
        OR EXISTS (
          SELECT 1 FROM channel_members cm
          WHERE cm.channel_id = c.id AND cm.user_id = ?
        )
      )`;
      params.push(userId, userId, userId, userId, userId);
    }

    query += ' ORDER BY c.type, c.name';

    const channels = db.prepare(query).all(...params);

    return {
      channels: channels.map(c => ({
        id: c.id,
        name: c.name,
        type: c.type,
        project_id: c.project_id,
        project_name: c.project_name,
        is_dm: c.is_dm === 1,
        dm_user_id: c.dm_user_id,
        dm_agent_id: c.dm_agent_id,
        dm_agent_name: c.dm_agent_name,
        dm_agent_avatar: c.dm_agent_avatar,
        dm_agent_role: c.dm_agent_role,
        dm_agent_type: c.dm_agent_type,
        dm_agent_status: c.dm_agent_status || 'offline',
        unread_count: c.unread_count || 0,
        created_at: c.created_at,
      })),
      count: channels.length
    };
  } catch (err) {
    request.log.error({ err }, 'listChannelsRoute error');
    reply.code(500);
    return { error: err.message };
  }
}



// GET /api/channels/:id/messages - Get messages from a channel
async function getChannelMessagesByIdRoute(request, reply) {
  const db = getDb();
  const { id } = request.params;
  const { limit = 50, before, after } = request.query;

  // Get channel by ID or name
  const channel = db.prepare('SELECT * FROM channels WHERE id = ? OR name = ?').get(id, id);

  if (!channel) {
    reply.code(404);
    return { error: 'Channel not found' };
  }

  // Build query for messages - check both channel_id (new) and channel (legacy)
  let query = `
    SELECT
      m.*,
      u.name as user_name,
      u.avatar_url as user_avatar,
      a.name as agent_name,
      a.avatar_url as agent_avatar,
      a.role as agent_role
    FROM messages m
    LEFT JOIN users u ON m.user_id = u.id
    LEFT JOIN manager_agents a ON m.agent_id = a.id
    WHERE (m.channel_id = ? OR m.channel = ?)
  `;
  const params = [channel.id, channel.name];

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

  // Mark channel as read for this user
  const userId = request.user?.id;
  if (userId) {
    try { db.updateLastRead(channel.id, userId); } catch (e) { /* non-critical */ }
  }

  return {
    channel: {
      id: channel.id,
      name: channel.name,
      type: channel.type,
      project_id: channel.project_id,
      is_dm: channel.is_dm === 1
    },
    messages: messages.reverse().map(m => ({
      ...m,
      metadata: JSON.parse(m.metadata || '{}'),
      is_dm: m.is_dm === 1
    })),
    count: messages.length
  };
}

// POST /api/channels/:id/messages - Send message to channel
async function sendChannelMessageRoute(request, reply) {
  const db = getDb();
  const { id } = request.params;
  const userId = request.user?.id;

  if (!userId) {
    reply.code(401);
    return { error: 'Authentication required' };
  }

  const { content, metadata = {}, agent_id } = request.body;

  if (!content || !content.trim()) {
    reply.code(400);
    return { error: 'Content is required' };
  }

  // Validate agent_id if provided
  let agentId = null;
  if (agent_id) {
    const agent = db.prepare('SELECT id FROM manager_agents WHERE id = ?').get(agent_id);
    if (!agent) {
      reply.code(400);
      return { error: 'Invalid agent_id' };
    }
    agentId = agent_id;
  }

  // Get channel
  const channel = db.prepare('SELECT * FROM channels WHERE id = ? OR name = ?').get(id, id);

  if (!channel) {
    reply.code(404);
    return { error: 'Channel not found' };
  }

  // Check membership - allow general, rnd_feed, agent_bus, DM participants, and channel members
  if (request.user?.role !== 'admin' && !agentId) {
    const isParticipant =
      channel.type === 'general' ||
      channel.type === 'rnd_feed' ||
      channel.type === 'agent_bus' ||
      channel.created_by === userId ||
      channel.dm_user_id === userId ||
      channel.participant_1_id === userId ||
      channel.participant_2_id === userId ||
      db.prepare('SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?').get(channel.id, userId);

    if (!isParticipant) {
      reply.code(403);
      return { error: 'Not a member of this channel' };
    }
  }

  const { sendChannelMessage } = require('./chat');
  const message = await sendChannelMessage(userId, channel.id, content, {
    metadata: { ...metadata, channel_name: channel.name },
    agentId,
  });

  // Mirror agent_bus messages to their project channel
  if (channel.type === 'agent_bus' && channel.project_id) {
    const projectChannel = db.prepare("SELECT id FROM channels WHERE project_id = ? AND type = 'project'").get(channel.project_id);
    if (projectChannel) {
      const mirrorContent = `**[Internal Bus]** ${message.sender_name || 'Agent'}: ${content}`;
      await sendChannelMessage(userId, projectChannel.id, mirrorContent, {
        metadata: { mirrored_from: channel.id, mirrored_from_type: 'agent_bus', original_message_id: message.id },
        agentId,
      });
    }
  }

  reply.code(201);
  return { message };
}

// POST /api/channels/dm/:userId - Create/get DM channel with user
async function createOrGetDmRoute(request, reply) {
  const db = getDb();
  const currentUserId = request.user?.id;
  const { userId } = request.params;
  const { agent_id } = request.body || {};

  if (!currentUserId) {
    reply.code(401);
    return { error: 'Authentication required' };
  }

  // Check if DM already exists
  let dmChannel;

  if (agent_id) {
    // DM between user and agent - join manager_agents for agent info
    dmChannel = db.prepare(`
      SELECT c.*, ma.name as dm_agent_name, ma.avatar_url as dm_agent_avatar, 
             ma.role as dm_agent_role, ma.status as dm_agent_status
      FROM channels c
      LEFT JOIN manager_agents ma ON c.dm_agent_id = ma.id
      WHERE c.is_dm = 1 AND c.dm_user_id = ? AND c.dm_agent_id = ?
    `).get(currentUserId, agent_id);
  } else {
    // DM between two users (simplified - using userId as other party)
    dmChannel = db.prepare(`
      SELECT c.*, u.name as dm_user_name, u.avatar_url as dm_user_avatar
      FROM channels c
      JOIN users u ON c.dm_user_id = u.id
      WHERE c.is_dm = 1
      AND ((c.created_by = ? AND c.dm_user_id = ?) OR (c.created_by = ? AND c.dm_user_id = ?))
    `).get(currentUserId, userId, userId, currentUserId);
  }

  if (dmChannel) {
    return {
      channel: {
        ...dmChannel,
        is_dm: dmChannel.is_dm === 1
      },
      created: false
    };
  }

  // Create new DM channel
  const id = generateId();
  const now = new Date().toISOString();

  let dmName;
  if (agent_id) {
    const agent = db.prepare('SELECT name FROM manager_agents WHERE id = ?').get(agent_id);
    dmName = `@${agent?.name || 'Agent'}`;
  } else {
    const user = db.prepare('SELECT name FROM users WHERE id = ?').get(userId);
    dmName = `@${user?.name || 'User'}`;
  }

  // Insert WITHOUT pragma - FK constraint was removed in migration
  db.prepare(`
    INSERT INTO channels (id, name, type, is_dm, dm_user_id, dm_agent_id, created_by, created_at)
    VALUES (?, ?, 'dm', 1, ?, ?, ?, ?)
  `).run(id, dmName, agent_id ? currentUserId : userId, agent_id || null, currentUserId, now);

  // Add creator as member
  try {
    db.prepare(`
      INSERT OR IGNORE INTO channel_members (id, channel_id, user_id, joined_at) 
      VALUES (?, ?, ?, ?)
    `).run(generateId(), id, currentUserId, now);
  } catch (e) { /* non-critical: INSERT OR IGNORE handles duplicates */ }

  // Add other user as member (if not agent)
  if (!agent_id) {
    try {
      db.prepare(`
        INSERT OR IGNORE INTO channel_members (id, channel_id, user_id, joined_at)
        VALUES (?, ?, ?, ?)
      `).run(generateId(), id, userId, now);
    } catch (e) { /* non-critical: INSERT OR IGNORE handles duplicates */ }
  }

  // Return created channel with agent info
  const newChannel = db.prepare(`
    SELECT c.*, ma.name as dm_agent_name, ma.avatar_url as dm_agent_avatar, 
           ma.role as dm_agent_role, ma.status as dm_agent_status
    FROM channels c
    LEFT JOIN manager_agents ma ON c.dm_agent_id = ma.id
    WHERE c.id = ?
  `).get(id);

  // Notify connected agents about the new DM channel
  wsManager.emitChannelCreated(newChannel);

  reply.code(201);
  return {
    channel: {
      ...newChannel,
      is_dm: newChannel.is_dm === 1
    },
    created: true
  };
}

// POST /api/channels/project/:projectId - Create project channel
async function createProjectChannelRoute(request, reply) {
  const db = getDb();
  const userId = request.user?.id;
  const { projectId } = request.params;
  const { name, description } = request.body;

  if (!userId) {
    reply.code(401);
    return { error: 'Authentication required' };
  }

  // Verify project exists
  const project = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(projectId);
  if (!project) {
    reply.code(404);
    return { error: 'Project not found' };
  }

  // Generate channel name
  const channelName = `project-${name || project.name}`.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  // Check if channel already exists
  const existing = db.prepare('SELECT id FROM channels WHERE project_id = ?').get(projectId);
  if (existing) {
    return {
      channel: existing,
      created: false
    };
  }

  const id = generateId();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO channels (id, name, type, project_id, created_by, created_at)
    VALUES (?, ?, 'project', ?, ?, ?)
  `).run(id, channelName, projectId, userId, now);

  // Add creator as owner
  try { db.prepare(`INSERT OR IGNORE INTO channel_members (id, channel_id, user_id, joined_at) VALUES (?, ?, ?, ?)`).run(generateId(), id, userId, now); } catch (e) { /* non-critical */ }

  reply.code(201);
  return {
    channel: {
      id,
      name: channelName,
      type: 'project',
      project_id: projectId,
      description: description || `Project channel for ${project.name}`,
      color: '#8b5cf6',
      created_at: now
    },
    created: true
  };
}

// ============================================================================
// CHAT ROUTES
// ============================================================================

// POST /api/messages - Send a message
async function sendMessageRoute(request, reply) {
  try {
    const userId = request.user?.id;
    if (!userId) {
      reply.code(401);
      return { error: 'Authentication required' };
    }

    const { content, channel = 'general', agent_id, is_dm, metadata } = request.body;

    if (!content || !content.trim()) {
      reply.code(400);
      return { error: 'Content is required' };
    }

    const message = await processIncomingMessage(userId, content, {
      channel,
      agentId: agent_id,
      isDm: is_dm,
      metadata
    });

    reply.code(201);
    return message;
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
}

// GET /api/messages/:channel - Get channel history
async function getChannelMessagesRoute(request, reply) {
  try {
    const { channel } = request.params;
    const { limit, before, after } = request.query;

    const messages = await getChannelHistory(channel, { limit, before, after });

    return {
      channel,
      messages,
      count: messages.length
    };
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
}

// GET /api/dm/:agent_id - Get DM history with agent
async function getDmHistoryRoute(request, reply) {
  try {
    const userId = request.user?.id;
    if (!userId) {
      reply.code(401);
      return { error: 'Authentication required' };
    }

    const { agent_id } = request.params;
    const { limit, before } = request.query;

    const result = await getDmHistory(userId, agent_id, { limit, before });

    return result;
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
}

// GET /api/dm - Get all DM channels for user
async function getUserDmChannelsRoute(request, reply) {
  try {
    const userId = request.user?.id;
    if (!userId) {
      reply.code(401);
      return { error: 'Authentication required' };
    }

    const channels = await getUserDmChannels(userId);

    return {
      channels,
      count: channels.length
    };
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
}

// POST /api/dm/:agent_id - Send DM to agent
async function sendDmRoute(request, reply) {
  try {
    const userId = request.user?.id;
    if (!userId) {
      reply.code(401);
      return { error: 'Authentication required' };
    }

    const { agent_id } = request.params;
    const { content, metadata } = request.body;

    if (!content || !content.trim()) {
      reply.code(400);
      return { error: 'Content is required' };
    }

    const message = await processIncomingMessage(userId, content, {
      channel: `dm:${agent_id}`,
      agentId: agent_id,
      isDm: true,
      metadata
    });

    reply.code(201);
    return message;
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
}

// PATCH /api/messages/:id - Edit message
async function editMessageRoute(request, reply) {
  try {
    const userId = request.user?.id;
    if (!userId) {
      reply.code(401);
      return { error: 'Authentication required' };
    }

    const { id } = request.params;
    const { content } = request.body;

    const message = await editMessage(id, userId, content);

    return message;
  } catch (err) {
    reply.code(err.message.includes('not authorized') ? 403 : 404);
    return { error: err.message };
  }
}

// DELETE /api/messages/:id - Delete message
async function deleteMessageRoute(request, reply) {
  try {
    const userId = request.user?.id;
    if (!userId) {
      reply.code(401);
      return { error: 'Authentication required' };
    }

    const { id } = request.params;

    const result = await deleteMessage(id, userId);

    return result;
  } catch (err) {
    reply.code(err.message.includes('Not authorized') ? 403 : 404);
    return { error: err.message };
  }
}

// ============================================================================
// AUTH ROUTES
// ============================================================================

// POST /api/auth/telegram - Authenticate via Telegram
async function telegramAuthRoute(request, reply) {
  try {
    const { telegram_data } = request.body;

    if (!telegram_data || !telegram_data.id) {
      reply.code(400);
      return { error: 'Telegram data required' };
    }

    // Get or create user from Telegram data
    const user = await getOrCreateUserFromTelegram(telegram_data);

    // Create session
    const session = await createSession(
      user.id,
      request.ip,
      request.headers['user-agent']
    );

    return {
      user: {
        id: user.id,
        name: user.name,
        telegram_id: user.telegram_id,
        role: user.role,
        avatar_url: user.avatar_url
      },
      session: {
        token: session.token,
        expires_at: session.expires_at
      }
    };
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
}

// POST /api/auth/login - Login with login/password
async function loginRoute(request, reply) {
  try {
    const { login, password } = request.body;

    if (!login || !password) {
      reply.code(400);
      return { error: 'Login and password required' };
    }

    // Authenticate user
    const user = await authenticateUser(login, password);

    // Create session
    const session = await createSession(
      user.id,
      request.ip,
      request.headers['user-agent']
    );

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        telegram_id: user.telegram_id,
        role: user.role,
        avatar_url: user.avatar_url
      },
      session: {
        token: session.token,
        expires_at: session.expires_at
      }
    };
  } catch (err) {
    reply.code(401);
    return { error: err.message };
  }
}

// POST /api/auth/logout - Logout
async function logoutRoute(request, reply) {
  try {
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      await invalidateSession(token);
    }

    return { success: true, message: 'Logged out successfully' };
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
}

// GET /api/auth/me - Get current user
async function getMeRoute(request, reply) {
  try {
    const user = request.user;

    if (!user) {
      reply.code(401);
      return { error: 'Not authenticated' };
    }

    return {
      id: user.id,
      name: user.name,
      telegram_id: user.telegram_id,
      role: user.role,
      avatar_url: user.avatar_url
    };
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
}

// POST /api/auth/register - Register new user
async function registerRoute(request, reply) {
  try {
    const { login, password, name, email, role = 'user' } = request.body;

    if (!login || !password) {
      reply.code(400);
      return { error: 'Login and password are required' };
    }

    const user = await registerUser({ login, password, name, email, role });

    // Create session for the new user
    const session = await createSession(
      user.id,
      request.ip,
      request.headers['user-agent']
    );

    reply.code(201);
    return {
      user: {
        id: user.id,
        name: user.name,
        login: user.login,
        email: user.email,
        role: user.role
      },
      session: {
        token: session.token,
        expires_at: session.expires_at
      }
    };
  } catch (err) {
    reply.code(400);
    return { error: err.message };
  }
}

// ============================================================================
// AGENT ROUTES
// ============================================================================

// Helper to format agent response with proper boolean values
const formatAgentResponse = (agent) => ({
  ...agent,
  is_approved: Boolean(agent.is_approved),
  // manager_agents has no persisted is_active column in the current schema.
  // Derive activity so approved agents don't get mislabeled as merely registered.
  is_active: agent.is_active !== undefined ? Boolean(agent.is_active) : Boolean(agent.is_approved),
  // Parse JSON fields
  skills: JSON.parse(agent.skills || '[]'),
  specialties: JSON.parse(agent.specialties || '[]'),
  api_keys: JSON.parse(agent.api_keys || '{}')
});

// GET /api/agents - List all manager agents
async function listAgents(request, reply) {
  const db = getDb();
  const { is_approved, role } = request.query;

  let where = 'WHERE 1=1';
  const params = [];

  if (is_approved !== undefined) {
    where += ' AND ma.is_approved = ?';
    params.push(is_approved ? 1 : 0);
  }

  if (role) {
    where += ' AND ma.role = ?';
    params.push(role);
  }

  // Use agent_projects as the source of truth for project assignment.
  // COALESCE: prefer agent_projects assignment, fall back to ma.project_id (CLI-set).
  const query = `
    SELECT ma.*,
      COALESCE(
        (SELECT ap.project_id FROM agent_projects ap
         WHERE ap.agent_id = ma.id AND ap.status = 'active'
         ORDER BY ap.assigned_at DESC LIMIT 1),
        ma.project_id
      ) AS effective_project_id
    FROM manager_agents ma
    ${where}
    ORDER BY ma.created_at DESC
  `;

  const agents = db.prepare(query).all(...params);

  return {
    agents: agents.map(a => ({ ...formatAgentResponse(a), project_id: a.effective_project_id || null })),
    count: agents.length
  };
}

// GET /api/agents/:id - Get agent details (uses manager_agents)
async function getAgent(request, reply) {
  const db = getDb();
  const { id } = request.params;

  const agent = db.prepare('SELECT * FROM manager_agents WHERE id = ?').get(id);

  if (!agent) {
    reply.code(404);
    return { error: 'Agent not found' };
  }

  // Task stats
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'pending'   THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'running'   THEN 1 ELSE 0 END) as running,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'failed'    THEN 1 ELSE 0 END) as failed
    FROM tasks WHERE agent_id = ?
  `).get(id);

  // Recent tasks (last 10)
  const recentTasks = db.prepare(`
    SELECT t.id, t.title, t.status, t.priority, t.created_at, t.updated_at,
           p.name as project_name
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    WHERE t.agent_id = ?
    ORDER BY t.created_at DESC LIMIT 10
  `).all(id);

  // Active projects
  const projects = db.prepare(`
    SELECT p.id, p.name, p.status, ap.role, ap.assigned_at
    FROM agent_projects ap
    JOIN projects p ON ap.project_id = p.id
    WHERE ap.agent_id = ? AND ap.status = 'active'
    ORDER BY ap.assigned_at DESC
  `).all(id);

  return {
    ...agent,
    skills: JSON.parse(agent.skills || '[]'),
    specialties: JSON.parse(agent.specialties || '[]'),
    task_stats: {
      total:     stats.total     || 0,
      pending:   stats.pending   || 0,
      running:   stats.running   || 0,
      completed: stats.completed || 0,
      failed:    stats.failed    || 0,
    },
    recent_tasks: recentTasks,
    projects,
  };
}

// POST /api/agents/register - Agent self-registration (pending approval)
async function registerAgentRoute(request, reply) {
  try {
    const db = getDb();
    const { name, role: agentRole, description, project_id } = request.body;

    if (!name || !agentRole) {
      reply.code(400);
      return { error: 'Name and role are required' };
    }

    const id = generateId();
    const now = new Date().toISOString();

    // Create agent with status='pending'
    db.prepare(`
      INSERT INTO agents (id, project_id, name, role, description, status, is_active, config, created_at)
      VALUES (?, ?, ?, ?, ?, 'idle', 0, ?, ?)
    `).run(id, project_id || null, name, agentRole, description || null, JSON.stringify({ status: 'pending' }), now);

    // Auto-create DM channel with admin
    try {
      const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
      if (admin) {
        const { getOrCreateDMChannel, sendChannelMessage } = require('./chat');
        const dmChannel = await getOrCreateDMChannel(admin.id, id);

        // Send welcome message to admin
        await sendChannelMessage(
          id, // Send as agent
          dmChannel.id,
          `Hello! I'm ${name}, a new ${agentRole} agent. I'm awaiting approval to join the team.`
        );
      }
    } catch (dmErr) {
      request.log.warn({ err: dmErr }, 'Error creating agent DM channel');
    }

    reply.code(201);
    return {
      id,
      name,
      role: agentRole,
      description,
      status: 'pending',
      is_active: false,
      is_approved: false,
      message: 'Agent registration pending approval'
    };
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
}

// POST /api/agents/approve/:id - Approve agent (admin only)
async function approveAgentRoute(request, reply) {
  try {
    const db = getDb();
    const { id } = request.params;
    const user = request.user;

    // Check admin role
    if (!user || user.role !== 'admin') {
      reply.code(403);
      return { error: 'Admin access required' };
    }

    // Check if agent exists
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(id);
    if (!agent) {
      reply.code(404);
      return { error: 'Agent not found' };
    }

    // Update agent status to 'approved' (is_active = 1)
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE agents SET is_active = 1, status = 'idle', updated_at = ?
      WHERE id = ?
    `).run(now, id);

    return {
      id,
      name: agent.name,
      status: 'approved',
      is_active: true,
      is_approved: true,
      message: 'Agent approved successfully'
    };
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
}

// GET /api/admin/agents/pending - List pending manager agents (admin only)
async function listPendingAgentsRoute(request, reply) {
  try {
    const db = getDb();
    const user = request.user;

    // Check admin role
    if (!user || user.role !== 'admin') {
      reply.code(403);
      return { error: 'Admin access required' };
    }

    // Return manager_agents with is_approved = FALSE (pending)
    const agents = db.prepare(`
      SELECT * FROM manager_agents
      WHERE is_approved = FALSE
      ORDER BY created_at DESC
    `).all();

    return {
      agents: agents.map(a => ({
        ...a,
        skills: JSON.parse(a.skills || '[]'),
        specialties: JSON.parse(a.specialties || '[]'),
        api_keys: JSON.parse(a.api_keys || '{}')
      })),
      count: agents.length
    };
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
}

// GET /api/admin/agents/approved - List approved manager agents (admin only)
async function listApprovedAgentsRoute(request, reply) {
  try {
    const db = getDb();
    const user = request.user;

    // Check admin role
    if (!user || user.role !== 'admin') {
      reply.code(403);
      return { error: 'Admin access required' };
    }

    // Return manager_agents with is_approved = TRUE
    const agents = db.prepare(`
      SELECT * FROM manager_agents
      WHERE is_approved = TRUE
      ORDER BY created_at DESC
    `).all();

    return {
      agents: agents.map(a => ({
        ...a,
        skills: JSON.parse(a.skills || '[]'),
        specialties: JSON.parse(a.specialties || '[]'),
        api_keys: JSON.parse(a.api_keys || '{}')
      })),
      count: agents.length
    };
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
}

// ============================================================================
// BUDGET ROUTES
// ============================================================================

// POST /api/budgets - Create budget
async function createBudgetRoute(request, reply) {
  const db = getDb();
  const { project_id, name, budget_amount, budget_period = 'monthly', alert_threshold = 0.8 } = request.body;

  if (!project_id || !name || !budget_amount) {
    reply.code(400);
    return { error: 'project_id, name, and budget_amount are required' };
  }

  const id = generateId();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO budgets (id, project_id, name, budget_amount, budget_period, alert_threshold, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, project_id, name, budget_amount, budget_period, alert_threshold, now, now);

  reply.code(201);
  return {
    id,
    project_id,
    name,
    budget_amount,
    budget_period,
    alert_threshold,
    created_at: now
  };
}

// GET /api/budgets - List budgets
async function listBudgetsRoute(request, reply) {
  const db = getDb();
  const { project_id } = request.query;

  let query = 'SELECT * FROM budgets WHERE is_active = 1';
  const params = [];

  if (project_id) {
    query += ' AND project_id = ?';
    params.push(project_id);
  }

  query += ' ORDER BY created_at DESC';

  const budgets = db.prepare(query).all(...params);

  return {
    budgets,
    count: budgets.length
  };
}

// ============================================================================
// PROJECT ASSIGNMENT ROUTES (Phase 2)
// ============================================================================

// POST /api/projects/:id/assign-agent - Assign agent to project
async function assignAgentToProjectRouteV2(request, reply) {
  const db = getDb();
  const { id } = request.params;
  const { agent_id, role = 'contributor' } = request.body;
  const user = request.user;

  if (!user || user.role !== 'admin') {
    reply.code(403);
    return { error: 'Admin access required' };
  }

  if (!agent_id) {
    reply.code(400);
    return { error: 'agent_id is required' };
  }

  // Validate role
  const validRoles = ['lead', 'contributor', 'observer'];
  if (!validRoles.includes(role)) {
    reply.code(400);
    return { error: `Role must be one of: ${validRoles.join(', ')}` };
  }

  // Check agent exists and is approved
  const agent = db.prepare('SELECT * FROM manager_agents WHERE id = ?').get(agent_id);
  if (!agent) {
    reply.code(404);
    return { error: 'Agent not found' };
  }

  if (!agent.is_approved) {
    reply.code(400);
    return { error: 'Agent must be approved before assignment' };
  }

  // Check project exists
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!project) {
    reply.code(404);
    return { error: 'Project not found' };
  }

  const assignmentId = generateId();
  const now = new Date().toISOString();

  try {
    // Create assignment
    db.prepare(`
      INSERT INTO agent_projects (id, agent_id, project_id, role, status, assigned_by, assigned_at)
      VALUES (?, ?, ?, ?, 'active', ?, ?)
    `).run(assignmentId, agent_id, id, role, user.id, now);

    // Create notification for agent
    db.prepare(`
      INSERT INTO agent_notifications (id, agent_id, type, title, content, data, created_at)
      VALUES (?, ?, 'project_assigned', 'New Project Assignment', ?, ?, ?)
    `).run(generateId(), agent_id, `You've been assigned to "${project.name}" as ${role}`, JSON.stringify({
      project_id: id,
      project_name: project.name,
      role,
      assigned_by: user.id,
      assigned_at: now
    }), now);

    // Add agent to project channel
    const projectChannel = db.prepare('SELECT id FROM channels WHERE project_id = ? AND type = ?').get(id, 'project');
    if (projectChannel) {
      // Add agent as channel member (store agent_id in agent_id column)
      try {
        db.prepare(`
          INSERT INTO channel_members (id, channel_id, agent_id, joined_at)
          VALUES (?, ?, ?, ?)
        `).run(generateId(), projectChannel.id, agent_id, now);
      } catch (err) {
        // Agent might already be a member, ignore
        request.log.info({ msg: err.message }, 'Agent already member of project channel');
      }
    }

    // Send WebSocket event
    const wsManager = require('./websocket');
    wsManager.emitAgentAssigned(id, {
      agent_id,
      project_id: id,
      project_name: project.name,
      role,
      assigned_by: user.id,
      assigned_at: now
    });

    // Send DM notification to agent
    try {
      const { getOrCreateDMChannel, sendChannelMessage } = require('./chat');
      const dmChannel = await getOrCreateDMChannel(user.id, agent_id);
      await sendChannelMessage(user.id, dmChannel.id,
        `🎯 NEW PROJECT ASSIGNMENT\n\n` +
        `Project: ${project.name}\n` +
        `Role: ${role}\n` +
        `Assigned by: ${user.name || user.id}\n\n` +
        `[View Project] [Accept] [Decline]`
      );
    } catch (dmErr) {
      request.log.warn({ err: dmErr }, 'Error sending assignment DM');
    }

    // Persist notification in agent_notifications table
    notifyAgentProjectAssigned(agent_id, project, role, user.id)
      .catch(e => addLog('error', 'notifyAgentProjectAssigned error', { err: e?.message }));

    // Record in activity history
    try {
      db.prepare(`
        INSERT INTO activity_history (event_type, action, entity_id, entity_title, project_id, project_name, agent_id, agent_name, user_id, created_at)
        VALUES ('agent', 'assigned_to_project', ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(agent_id, agent.name, id, project.name, agent_id, agent.name, user.id, now);
    } catch (e) { /* ignore */ }

    // PM Auto-Collect: collect workers FIRST so delegation has agents to assign to
    let collectedWorkers = [];
    if (agent.agent_type === 'pm') {
      try {
        const { autoCollectWorkersForPm } = require('./pm-delegation');
        collectedWorkers = autoCollectWorkersForPm(db, id, agent_id, wsManager);
        if (collectedWorkers.length) {
          addLog('info', '[PM Auto-Collect] Collected ' + collectedWorkers.length + ' workers', { projectId: id });
        }
      } catch (collectErr) {
        addLog('error', '[PM Auto-Collect] Error collecting workers', { err: collectErr.message });
      }
    }

    // PM Automation: if assigned agent is a PM with a current_mode, auto-generate tasks from preset
    // Tasks are created UNASSIGNED (agent_id = NULL) so delegation can pick the right worker
    let generatedTasks = [];
    if (agent.agent_type === 'pm' && agent.current_mode) {
      try {
        const presetsModule = require('./presets');
        const presetContent = presetsModule.loadPresetFile('pm_mode', agent.current_mode);
        if (presetContent) {
          const taskTitles = presetsModule.extractTaskBreakdown(presetContent);

          for (let i = 0; i < taskTitles.length; i++) {
            const taskId = generateId();
            db.prepare(`
              INSERT INTO tasks (id, project_id, agent_id, title, description, status, priority, created_at, updated_at)
              VALUES (?, ?, NULL, ?, ?, 'pending', ?, ?, ?)
            `).run(taskId, id, taskTitles[i], `Auto-generated by PM ${agent.name} (${agent.current_mode} mode)`, Math.min(i + 1, 5), now, now);
            generatedTasks.push({ id: taskId, title: taskTitles[i], priority: Math.min(i + 1, 5) });
          }
          addLog('info', '[PM Automation] Generated tasks', { count: generatedTasks.length, projectId: id, mode: agent.current_mode });
        }
      } catch (pmErr) {
        addLog('error', '[PM Automation] Error generating tasks', { err: pmErr.message });
      }
    }

    // PM Delegation: assign generated tasks to worker agents now in the project
    let delegatedAssignments = [];
    if (generatedTasks.length > 0) {
      try {
        const { delegateTasksToWorkers } = require('./pm-delegation');
        delegatedAssignments = delegateTasksToWorkers(id, generatedTasks, agent_id, db, wsManager);
        if (delegatedAssignments.length) {
          addLog('info', '[PM Delegation] Assigned tasks', { count: delegatedAssignments.length });
        }
      } catch (delErr) {
        addLog('error', '[PM Delegation] Error delegating tasks', { err: delErr.message });
      }
    }

    reply.code(201);
    return {
      assignment_id: assignmentId,
      agent_id,
      project_id: id,
      project_name: project.name,
      role,
      assigned_by: user.id,
      assigned_at: now,
      generated_tasks: generatedTasks.length > 0 ? generatedTasks : undefined,
      delegated_tasks: delegatedAssignments.length > 0 ? delegatedAssignments : undefined,
      collected_workers: collectedWorkers.length > 0 ? collectedWorkers.map(w => ({ id: w.id, name: w.name })) : undefined,
    };
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      reply.code(409);
      return { error: 'Agent already assigned to this project' };
    }
    throw err;
  }
}

// DELETE /api/projects/:id/agents/:agentId - Remove agent from project
async function removeAgentFromProjectRouteV2(request, reply) {
  const db = getDb();
  const { id, agentId } = request.params;
  const user = request.user;

  if (!user || user.role !== 'admin') {
    reply.code(403);
    return { error: 'Admin access required' };
  }

  // Check assignment exists
  const assignment = db.prepare('SELECT * FROM agent_projects WHERE agent_id = ? AND project_id = ?').get(agentId, id);
  if (!assignment) {
    reply.code(404);
    return { error: 'Assignment not found' };
  }

  const now = new Date().toISOString();

  // Get agent and project info for notification
  const agent = db.prepare('SELECT * FROM manager_agents WHERE id = ?').get(agentId);
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);

  // Update assignment status to removed
  db.prepare('UPDATE agent_projects SET status = ?, assigned_at = ? WHERE agent_id = ? AND project_id = ?')
    .run('removed', now, agentId, id);

  // Create notification for agent
  db.prepare(`
    INSERT INTO agent_notifications (id, agent_id, type, title, content, data, created_at)
    VALUES (?, ?, 'project_removed', 'Removed from Project', ?, ?, ?)
  `).run(generateId(), agentId, `You have been removed from "${project?.name || 'a project'}"`, JSON.stringify({
    project_id: id,
    project_name: project?.name
  }), now);

  // Remove agent from project channel
  const projectChannel = db.prepare('SELECT id FROM channels WHERE project_id = ? AND type = ?').get(id, 'project');
  if (projectChannel) {
    db.prepare('DELETE FROM channel_members WHERE channel_id = ? AND agent_id = ?')
      .run(projectChannel.id, agentId);
  }

  // Send WebSocket event
  const wsManager = require('./websocket');
  wsManager.emitAgentRemoved(id, {
    agent_id: agentId,
    project_id: id,
    project_name: project?.name,
    removed_by: user.id,
    removed_at: now
  });

  // Send DM notification
  try {
    const { getOrCreateDMChannel, sendChannelMessage } = require('./chat');
    const dmChannel = await getOrCreateDMChannel(user.id, agentId);
    await sendChannelMessage(user.id, dmChannel.id,
      `🚫 PROJECT ASSIGNMENT REMOVED\n\n` +
      `Project: ${project?.name || 'Unknown'}\n` +
      `Removed by: ${user.name || user.id}`
    );
  } catch (dmErr) {
    request.log.warn({ err: dmErr }, 'Error sending removal DM');
  }

  return {
    success: true,
    agent_id: agentId,
    project_id: id,
    removed_at: now
  };
}

// GET /api/projects/:id/agents - Get all agents assigned to project
async function getProjectAgentsRoute(request, reply) {
  const db = getDb();
  const { id } = request.params;
  const user = request.user;

  // Check project exists
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(id);
  if (!project) {
    reply.code(404);
    return { error: 'Project not found' };
  }

  // Non-admins can only view if they're somehow associated (future enhancement)
  // For now, require auth
  if (!user) {
    reply.code(401);
    return { error: 'Authentication required' };
  }

  const agents = db.prepare(`
    SELECT 
      ap.id as assignment_id,
      ap.agent_id,
      ap.role,
      ap.status as assignment_status,
      ap.assigned_by,
      ap.assigned_at,
      ma.name as agent_name,
      ma.handle,
      ma.avatar_url as agent_avatar,
      ma.status as agent_status,
      ma.role as agent_role,
      u.name as assigned_by_name
    FROM agent_projects ap
    JOIN manager_agents ma ON ap.agent_id = ma.id
    LEFT JOIN users u ON ap.assigned_by = u.id
    WHERE ap.project_id = ? AND ap.status = 'active'
    ORDER BY ap.assigned_at DESC
  `).all(id);

  return {
    project_id: id,
    agents: agents.map(a => ({
      assignment_id: a.assignment_id,
      agent: {
        id: a.agent_id,
        name: a.agent_name,
        handle: a.handle,
        avatar_url: a.agent_avatar,
        status: a.agent_status,
        role: a.agent_role
      },
      role: a.role,
      status: a.assignment_status,
      assigned_by: {
        id: a.assigned_by,
        name: a.assigned_by_name
      },
      assigned_at: a.assigned_at
    })),
    count: agents.length
  };
}

// GET /api/agents/:id/projects - Get all projects assigned to agent
async function getAgentProjectsRoute(request, reply) {
  const db = getDb();
  const { id } = request.params;
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
    return { error: 'Not authorized to view this agent\'s projects' };
  }

  const projects = db.prepare(`
    SELECT 
      ap.id as assignment_id,
      ap.project_id,
      ap.role,
      ap.status as assignment_status,
      ap.assigned_by,
      ap.assigned_at,
      p.name as project_name,
      p.description as project_description,
      p.status as project_status,
      u.name as assigned_by_name
    FROM agent_projects ap
    JOIN projects p ON ap.project_id = p.id
    LEFT JOIN users u ON ap.assigned_by = u.id
    WHERE ap.agent_id = ? AND ap.status = 'active'
    ORDER BY ap.assigned_at DESC
  `).all(id);

  return {
    agent_id: id,
    agent_name: agent.name,
    projects: projects.map(p => ({
      assignment_id: p.assignment_id,
      project: {
        id: p.project_id,
        name: p.project_name,
        description: p.project_description,
        status: p.project_status
      },
      role: p.role,
      status: p.assignment_status,
      assigned_by: {
        id: p.assigned_by,
        name: p.assigned_by_name
      },
      assigned_at: p.assigned_at
    })),
    count: projects.length
  };
}

// PATCH /api/projects/:id/agents/:agentId - Update agent's role in project
async function updateAgentProjectRoleRoute(request, reply) {
  const db = getDb();
  const { id, agentId } = request.params;
  const { role } = request.body;
  const user = request.user;

  if (!user || user.role !== 'admin') {
    reply.code(403);
    return { error: 'Admin access required' };
  }

  // Validate role
  const validRoles = ['lead', 'contributor', 'observer'];
  if (!validRoles.includes(role)) {
    reply.code(400);
    return { error: `Role must be one of: ${validRoles.join(', ')}` };
  }

  // Check assignment exists
  const assignment = db.prepare('SELECT * FROM agent_projects WHERE agent_id = ? AND project_id = ?').get(agentId, id);
  if (!assignment) {
    reply.code(404);
    return { error: 'Assignment not found' };
  }

  const now = new Date().toISOString();

  // Update role
  db.prepare('UPDATE agent_projects SET role = ? WHERE agent_id = ? AND project_id = ?')
    .run(role, agentId, id);

  // Get agent and project info
  const agent = db.prepare('SELECT * FROM manager_agents WHERE id = ?').get(agentId);
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);

  // Create notification for agent
  db.prepare(`
    INSERT INTO agent_notifications (id, agent_id, type, title, content, data, created_at)
    VALUES (?, ?, 'role_updated', 'Project Role Updated', ?, ?, ?)
  `).run(generateId(), agentId, `Your role in "${project?.name}" has been updated to ${role}`, JSON.stringify({
    project_id: id,
    project_name: project?.name,
    old_role: assignment.role,
    new_role: role
  }), now);

  // Send WebSocket event
  const wsManager = require('./websocket');
  wsManager.emitAgentRoleUpdated(id, {
    agent_id: agentId,
    project_id: id,
    project_name: project?.name,
    old_role: assignment.role,
    new_role: role,
    updated_by: user.id,
    updated_at: now
  });

  try {
    const { notifyAgentProjectRemoved } = require('./notifications');
    await notifyAgentProjectRemoved(agentId, project, user.id);
  } catch (err) {
    request.log.warn({ err }, 'Error sending removal notification');
  }
}

// ============================================================================
// MANAGER AGENT ROUTES (NEW)
// ============================================================================

// GET /api/agents - List all manager agents
async function listManagerAgentsRoute(request, reply) {
  const db = getDb();
  const user = request.user;
  const { status, is_approved } = request.query;

  // Only admins can see unapproved agents
  if (!user || user.role !== 'admin') {
    reply.code(403);
    return { error: 'Admin access required' };
  }

  let where = 'WHERE 1=1';
  const params = [];

  if (status) {
    where += ' AND ma.status = ?';
    params.push(status);
  }

  if (is_approved !== undefined) {
    where += ' AND ma.is_approved = ?';
    params.push(is_approved === 'true' ? 1 : 0);
  }

  // Use agent_projects junction table as source of truth for project assignment
  const query = `
    SELECT ma.*,
      COALESCE(
        (SELECT ap.project_id FROM agent_projects ap
         WHERE ap.agent_id = ma.id AND ap.status = 'active'
         ORDER BY ap.assigned_at DESC LIMIT 1),
        ma.project_id
      ) AS effective_project_id
    FROM manager_agents ma
    ${where}
    ORDER BY ma.created_at DESC
  `;

  const agents = db.prepare(query).all(...params);

  return {
    agents: agents.map(a => {
      const formatted = formatAgentResponse(a);
      delete formatted.api_keys;
      formatted.project_id = a.effective_project_id || null;
      return formatted;
    }),
    count: agents.length
  };
}

// GET /api/agents/:id - Get manager agent profile
async function getManagerAgentRoute(request, reply) {
  const db = getDb();
  const { id } = request.params;
  const user = request.user;

  const agent = db.prepare('SELECT * FROM manager_agents WHERE id = ?').get(id);

  if (!agent) {
    reply.code(404);
    return { error: 'Agent not found' };
  }

  // Only admins and the agent itself can see full profile
  const isAdmin = user?.role === 'admin';
  const isSelf = user?.id === id;

  // Get assigned projects (active only)
  const projects = db.prepare(`
    SELECT p.id, p.name, p.status, ap.role, ap.assigned_at
    FROM agent_projects ap
    JOIN projects p ON ap.project_id = p.id
    WHERE ap.agent_id = ? AND ap.status = 'active'
    ORDER BY ap.assigned_at DESC
  `).all(id);

  // Task stats
  const taskStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'pending'   THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'running'   THEN 1 ELSE 0 END) as running,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'failed'    THEN 1 ELSE 0 END) as failed
    FROM tasks WHERE agent_id = ?
  `).get(id);

  // Recent tasks (last 10)
  const recentTasks = db.prepare(`
    SELECT t.id, t.title, t.status, t.priority, t.created_at, t.updated_at,
           p.name as project_name
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    WHERE t.agent_id = ?
    ORDER BY t.created_at DESC LIMIT 10
  `).all(id);

  // Get unread notifications count
  const { unread_count } = db.prepare(`
    SELECT COUNT(*) as unread_count FROM agent_notifications
    WHERE agent_id = ? AND is_read = FALSE
  `).get(id);

  const formattedAgent = formatAgentResponse(agent);
  if (!isAdmin && !isSelf) {
    delete formattedAgent.api_keys;
  }

  return {
    ...formattedAgent,
    projects,
    task_stats: {
      total:     taskStats.total     || 0,
      pending:   taskStats.pending   || 0,
      running:   taskStats.running   || 0,
      completed: taskStats.completed || 0,
      failed:    taskStats.failed    || 0,
    },
    recent_tasks: recentTasks,
    notifications: { unread_count },
  };
}

// POST /api/agents/register - Register new manager agent
async function registerManagerAgentRoute(request, reply) {
  const db = getDb();
  const { name, handle, email, role = 'developer', skills = [], specialties = [], experience_level = 'mid', agent_type = 'worker', rnd_division, current_mode, ollama_host } = request.body;

  if (!name || !handle) {
    reply.code(400);
    return { error: 'Name and handle are required' };
  }

  // Validate name length (min 2 characters)
  if (name.trim().length < 2) {
    reply.code(400);
    return { error: 'Name must be at least 2 characters' };
  }

  // Validate handle format (must start with @)
  const normalizedHandle = handle.startsWith('@') ? handle : `@${handle}`;

  // Validate handle length (min 3 characters after @)
  const handleClean = normalizedHandle.replace('@', '').trim();
  if (handleClean.length < 3) {
    reply.code(400);
    return { error: 'Handle must be at least 3 characters (after @)' };
  }

  // Check if handle already exists
  const existing = db.prepare('SELECT id FROM manager_agents WHERE handle = ?').get(normalizedHandle);
  if (existing) {
    reply.code(409);
    return { error: 'Handle already taken' };
  }

  // Validate preset references
  const presetsModule = require('./presets');
  if (agent_type === 'pm' && current_mode && !presetsModule.validatePreset('pm_mode', current_mode)) {
    reply.code(400);
    return { error: `Invalid PM mode preset: ${current_mode}` };
  }
  if (agent_type === 'rnd' && rnd_division && !presetsModule.validatePreset('rnd_division', rnd_division)) {
    reply.code(400);
    return { error: `Invalid R&D division preset: ${rnd_division}` };
  }
  if (agent_type === 'worker' && current_mode && !presetsModule.validatePreset('worker_dept', current_mode)) {
    reply.code(400);
    return { error: `Invalid worker department preset: ${current_mode}` };
  }

  const id = generateId();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO manager_agents (id, name, handle, email, role, status, skills, specialties, experience_level, agent_type, rnd_division, current_mode, ollama_host, is_approved, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'offline', ?, ?, ?, ?, ?, ?, ?, FALSE, ?, ?)
  `).run(id, name, normalizedHandle, email || null, role, JSON.stringify(skills), JSON.stringify(specialties), experience_level, agent_type, rnd_division || null, current_mode || null, ollama_host || null, now, now);

  // Auto-create a session token so the agent can operate without admin credentials
  const session = await createSession('user-scorpion-001');

  // Notify admin in real-time that a new agent is waiting for approval
  wsManager.emitAgentRegistered({ id, name, handle: normalizedHandle, role, created_at: now });
  const { notifyNewAgentRegistration } = require('./notifications');
  notifyNewAgentRegistration(id, name, 'user-scorpion-001').catch(e => addLog('error', 'notifyNewAgentRegistration error', { err: e?.message }));

  reply.code(201);
  return {
    id,
    name,
    handle: normalizedHandle,
    role,
    status: 'offline',
    is_approved: false,
    token: session.token,
    message: 'Registration submitted. Awaiting admin approval.'
  };
}

// DELETE /api/agents/:id - Permanently delete a manager agent (admin only)
async function deleteManagerAgentRoute(request, reply) {
  const db = getDb();
  const { id } = request.params;
  const user = request.user;

  if (!user || user.role !== 'admin') {
    reply.code(403);
    return { error: 'Admin access required' };
  }

  const agent = db.prepare('SELECT id, name FROM manager_agents WHERE id = ?').get(id);
  if (!agent) {
    reply.code(404);
    return { error: 'Agent not found' };
  }

  // Delete DM channels for this agent (no FK, must be manual; channel messages cascade)
  db.prepare('DELETE FROM channels WHERE dm_agent_id = ?').run(id);

  // Delete the agent (CASCADE handles: agent_projects, agent_notifications, machine_agents)
  // SET NULL handles: messages.author_agent_id, task_assignment_history.agent_id
  db.prepare('DELETE FROM manager_agents WHERE id = ?').run(id);

  return { success: true, message: `Agent ${agent.name} deleted` };
}

// POST /api/agents/:id/approve - Approve manager agent (admin only)
async function approveManagerAgentRoute(request, reply) {
  const db = getDb();
  const { id } = request.params;
  const user = request.user;

  // Check admin role
  if (!user || user.role !== 'admin') {
    reply.code(403);
    return { error: 'Admin access required' };
  }

  const agent = db.prepare('SELECT * FROM manager_agents WHERE id = ?').get(id);
  if (!agent) {
    reply.code(404);
    return { error: 'Agent not found' };
  }

  if (agent.is_approved) {
    reply.code(400);
    return { error: 'Agent already approved' };
  }

  const now = new Date().toISOString();

  // Update agent as approved
  db.prepare(`
    UPDATE manager_agents
    SET is_approved = TRUE, approved_by = ?, approved_at = ?, status = 'online', updated_at = ?
    WHERE id = ?
  `).run(user.id, now, now, id);

  try {
    const { notifyAgentApproved } = require('./notifications');
    await notifyAgentApproved(id, user.id);
  } catch (err) {
    request.log.warn({ err }, 'Error sending approval notification');
  }

  // Auto-create DM channel between agent and admin (Scorpion)
  try {
    const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
    if (admin) {
      const { getOrCreateDMChannel, sendChannelMessage } = require('./chat');
      const dmChannel = await getOrCreateDMChannel(admin.id, id);

      // Send welcome message to agent
      await sendChannelMessage(
        admin.id,
        dmChannel.id,
        `Welcome to the team, ${agent.name}! 🎉\n\nYou've been approved as a ${agent.role} agent. You can now participate in projects and receive task assignments. I'm Scorpion, the admin. Feel free to reach out if you have questions.`
      );

      // Create notification for agent
      db.prepare(`
        INSERT INTO agent_notifications (id, agent_id, type, title, content, data, created_at)
        VALUES (?, ?, 'welcome', 'Welcome to Project Claw!', ?, ?, ?)
      `).run(generateId(), id, 'Your registration has been approved. You can now access projects and receive assignments.', JSON.stringify({ approved_by: user.id, channel_id: dmChannel.id }), now);
    }
  } catch (dmErr) {
    request.log.warn({ err: dmErr }, 'Error creating agent DM channel');
  }

  wsManager.emitAgentApproved({ id, name: agent.name, handle: agent.handle }, user.id);

  return {
    id,
    name: agent.name,
    status: 'online',
    is_approved: true,
    approved_by: user.id,
    approved_at: now,
    message: 'Agent approved successfully'
  };
}

// POST /api/agents/:id/reject - Reject manager agent (admin only)
async function rejectManagerAgentRoute(request, reply) {
  const db = getDb();
  const { id } = request.params;
  const user = request.user;
  const { reason } = request.body || {};

  if (!user || user.role !== 'admin') {
    reply.code(403);
    return { error: 'Admin access required' };
  }

  const agent = db.prepare('SELECT * FROM manager_agents WHERE id = ?').get(id);
  if (!agent) {
    reply.code(404);
    return { error: 'Agent not found' };
  }

  const now = new Date().toISOString();

  db.prepare(`
    UPDATE manager_agents
    SET is_approved = FALSE, status = 'offline', updated_at = ?
    WHERE id = ?
  `).run(now, id);

  db.prepare(`
    INSERT INTO agent_notifications (id, agent_id, type, title, content, data, created_at)
    VALUES (?, ?, 'rejected', 'Registration Not Approved', ?, ?, ?)
  `).run(generateId(), id, reason || 'Your registration was not approved by an administrator.', JSON.stringify({ rejected_by: user.id, reason }), now);

  wsManager.emitAgentRejected({ id, name: agent.name, handle: agent.handle }, user.id, reason);

  return {
    id,
    name: agent.name,
    is_approved: false,
    status: 'offline',
    rejected_by: user.id,
    rejected_at: now,
    message: 'Agent rejected'
  };
}

// POST /api/agents/:id/status - Update agent status
async function updateManagerAgentStatusRoute(request, reply) {
  const db = getDb();
  const { id } = request.params;
  const { status } = request.body;
  const user = request.user;

  const validStatuses = ['online', 'working', 'idle', 'offline'];
  if (!validStatuses.includes(status)) {
    reply.code(400);
    return { error: `Status must be one of: ${validStatuses.join(', ')}` };
  }

  const agent = db.prepare('SELECT * FROM manager_agents WHERE id = ?').get(id);
  if (!agent) {
    reply.code(404);
    return { error: 'Agent not found' };
  }

  // Only admins or the agent itself can update status
  const isAdmin = user?.role === 'admin';
  const isSelf = user?.id === id;

  if (!isAdmin && !isSelf) {
    reply.code(403);
    return { error: 'Not authorized to update this agent' };
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE manager_agents
    SET status = ?, updated_at = ?
    WHERE id = ?
  `).run(status, now, id);

  return {
    id,
    status,
    updated_at: now
  };
}

// PATCH /api/agents/:id - Update agent fields (type, mode, model, rnd_division)
async function patchManagerAgentRoute(request, reply) {
  const db = getDb();
  const { id } = request.params;
  const user = request.user;

  const agent = db.prepare('SELECT * FROM manager_agents WHERE id = ?').get(id);
  if (!agent) {
    reply.code(404);
    return { error: 'Agent not found' };
  }

  const isAdmin = user?.role === 'admin';
  const isSelf = user?.id === id;
  if (!isAdmin && !isSelf) {
    reply.code(403);
    return { error: 'Not authorized' };
  }

  const allowed = ['agent_type', 'current_mode', 'current_model', 'rnd_division', 'rnd_schedule', 'last_heartbeat', 'project_id', 'ollama_host'];
  const updates = {};
  for (const key of allowed) {
    if (key in request.body) {
      updates[key] = request.body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    reply.code(400);
    return { error: 'No valid fields to update' };
  }

  // Validate preset references when updating
  const presetsModule = require('./presets');
  const effectiveType = updates.agent_type || agent.agent_type;
  if (updates.current_mode !== undefined) {
    if (effectiveType === 'pm' && updates.current_mode && !presetsModule.validatePreset('pm_mode', updates.current_mode)) {
      reply.code(400);
      return { error: `Invalid PM mode preset: ${updates.current_mode}` };
    }
    if (effectiveType === 'worker' && updates.current_mode && !presetsModule.validatePreset('worker_dept', updates.current_mode)) {
      reply.code(400);
      return { error: `Invalid worker department preset: ${updates.current_mode}` };
    }
  }
  if (updates.rnd_division !== undefined && updates.rnd_division && !presetsModule.validatePreset('rnd_division', updates.rnd_division)) {
    reply.code(400);
    return { error: `Invalid R&D division preset: ${updates.rnd_division}` };
  }

  const now = new Date().toISOString();
  updates.updated_at = now;

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(updates), id];
  db.prepare(`UPDATE manager_agents SET ${setClauses} WHERE id = ?`).run(...values);

  const updated = db.prepare('SELECT * FROM manager_agents WHERE id = ?').get(id);
  return updated;
}

// POST /api/agents/:id/heartbeat - Agent reports it's alive
async function agentHeartbeatRoute(request, reply) {
  const db = getDb();
  const { id } = request.params;
  const now = new Date().toISOString();

  const agent = db.prepare('SELECT id, status, name FROM manager_agents WHERE id = ?').get(id);
  if (!agent) {
    reply.code(404);
    return { error: 'Agent not found' };
  }

  // Update heartbeat and ensure status is online
  db.prepare('UPDATE manager_agents SET last_heartbeat = ?, status = ?, updated_at = ? WHERE id = ?')
    .run(now, 'online', now, id);

  // If agent was previously offline, broadcast the status change
  if (agent.status !== 'online') {
    const wsManager = require('./websocket');
    wsManager.broadcast('agent:status_changed', { agent_id: id, agent_name: agent.name, status: 'online' });
  }

  return { ok: true, timestamp: now };
}

// POST /api/agents/:id/notifications/:notificationId/read - Mark agent notification as read
async function markAgentNotificationReadRoute(request, reply) {
  const db = getDb();
  const { id, notificationId } = request.params;
  const user = request.user;

  // Only admins or the agent itself can mark notifications as read
  const isAdmin = user?.role === 'admin';
  const isSelf = user?.id === id;

  if (!isAdmin && !isSelf) {
    reply.code(403);
    return { error: 'Not authorized' };
  }

  const notification = db.prepare('SELECT * FROM agent_notifications WHERE id = ? AND agent_id = ?').get(notificationId, id);
  if (!notification) {
    reply.code(404);
    return { error: 'Notification not found' };
  }

  db.prepare('UPDATE agent_notifications SET is_read = 1 WHERE id = ?').run(notificationId);

  return { success: true, notification_id: notificationId };
}

// POST /api/agents/:id/projects/:projectId - Assign agent to project
async function assignAgentToProjectRoute(request, reply) {
  const db = getDb();
  const { id, projectId } = request.params;
  const { role = 'contributor' } = request.body;
  const user = request.user;

  // Check admin role
  if (!user || user.role !== 'admin') {
    reply.code(403);
    return { error: 'Admin access required' };
  }

  const agent = db.prepare('SELECT * FROM manager_agents WHERE id = ?').get(id);
  if (!agent) {
    reply.code(404);
    return { error: 'Agent not found' };
  }

  if (!agent.is_approved) {
    reply.code(400);
    return { error: 'Agent must be approved before assignment' };
  }

  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
  if (!project) {
    reply.code(404);
    return { error: 'Project not found' };
  }

  const assignmentId = generateId();
  const now = new Date().toISOString();

  try {
    db.prepare(`
      INSERT INTO agent_projects (id, agent_id, project_id, role, assigned_by, assigned_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(assignmentId, id, projectId, role, user.id, now);

    // Create notification for agent
    db.prepare(`
      INSERT INTO agent_notifications (id, agent_id, type, title, content, data, created_at)
      VALUES (?, ?, 'project_assigned', 'New Project Assignment', ?, ?, ?)
    `).run(generateId(), id, `You've been assigned to a project as ${role}`, JSON.stringify({ project_id: projectId, role }), now);

    reply.code(201);
    return {
      assignment_id: assignmentId,
      agent_id: id,
      project_id: projectId,
      role,
      assigned_by: user.id,
      assigned_at: now
    };
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      reply.code(409);
      return { error: 'Agent already assigned to this project' };
    }
    throw err;
  }
}

// DELETE /api/agents/:id/projects/:projectId - Remove agent from project
async function removeAgentFromProjectRoute(request, reply) {
  const db = getDb();
  const { id, projectId } = request.params;
  const user = request.user;

  // Check admin role
  if (!user || user.role !== 'admin') {
    reply.code(403);
    return { error: 'Admin access required' };
  }

  const assignment = db.prepare('SELECT * FROM agent_projects WHERE agent_id = ? AND project_id = ?').get(id, projectId);
  if (!assignment) {
    reply.code(404);
    return { error: 'Assignment not found' };
  }

  db.prepare('UPDATE agent_projects SET status = ? WHERE agent_id = ? AND project_id = ?')
    .run('removed', id, projectId);

  // Create notification for agent
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO agent_notifications (id, agent_id, type, title, content, data, created_at)
    VALUES (?, ?, 'project_removed', 'Removed from Project', ?, ?, ?)
  `).run(generateId(), id, 'You have been removed from a project', JSON.stringify({ project_id: projectId }), now);

  return { success: true, agent_id: id, project_id: projectId };
}

// ============================================================================
// MACHINE ROUTES
// ============================================================================

// POST /api/machines/register - Register Mac Mini or other machine
async function registerMachineRoute(request, reply) {
  try {
    const db = getDb();
    const { hostname, ipAddress, ip_address, agent_id, metadata = {} } = request.body;
    const ip = ipAddress || ip_address || null;
    if (!hostname) { reply.code(400); return { error: 'Hostname is required' }; }
    const now = new Date().toISOString();
    const existing = db.prepare('SELECT id FROM machines WHERE hostname = ?').get(hostname);
    let machineId;
    if (existing) {
      machineId = existing.id;
      db.prepare('UPDATE machines SET ip_address = ?, last_seen = ?, updated_at = ?, status = ?, metadata = ? WHERE hostname = ?')
        .run(ip, now, now, 'active', JSON.stringify(metadata), hostname);
    } else {
      machineId = generateId();
      db.prepare('INSERT INTO machines (id, hostname, ip_address, status, last_seen, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(machineId, hostname, ip, 'active', now, JSON.stringify(metadata), now, now);
    }
    if (agent_id) {
      try {
        db.prepare('INSERT OR IGNORE INTO machine_agents (id, machine_id, agent_id, started_at, status) VALUES (?, ?, ?, ?, ?)')
          .run(generateId(), machineId, agent_id, now, 'running');
      } catch (e) { addLog('error', 'machine_agents link failed', { err: e.message }); }
    }
    reply.code(existing ? 200 : 201);
    return { id: machineId, hostname, ip_address: ip, status: 'active', last_seen: now, created: !existing };
  } catch (err) { reply.code(500); return { error: err.message }; }
}

// GET /api/machines - List all machines
async function listMachinesRoute(request, reply) {
  try {
    const db = getDb();
    const machines = db.prepare('SELECT * FROM machines ORDER BY last_seen DESC, created_at DESC').all();

    const result = machines.map(m => {
      let agents = [];
      try {
        agents = db.prepare(`
          SELECT ma.agent_id, ma.started_at, ma.status as link_status,
            mg.name as agent_name, mg.handle, mg.status as agent_status
          FROM machine_agents ma
          LEFT JOIN manager_agents mg ON ma.agent_id = mg.id
          WHERE ma.machine_id = ? AND ma.status = 'running'
        `).all(m.id);
      } catch (e) { addLog('error', 'machine agents query failed', { err: e.message }); }
      return { ...m, metadata: JSON.parse(m.metadata || '{}'), agents };
    });

    return { machines: result, count: result.length };
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
}

// DELETE /api/machines/:id - Delete a machine (admin only)
async function deleteMachineRoute(request, reply) {
  const db = getDb();
  const { id } = request.params;
  const user = request.user;

  if (!user || user.role !== 'admin') {
    reply.code(403);
    return { error: 'Admin access required' };
  }

  const machine = db.prepare('SELECT id FROM machines WHERE id = ?').get(id);
  if (!machine) {
    reply.code(404);
    return { error: 'Machine not found' };
  }

  db.prepare('DELETE FROM machine_agents WHERE machine_id = ?').run(id);
  db.prepare('DELETE FROM machines WHERE id = ?').run(id);

  return { id, deleted: true };
}

// GET /api/machines/health - Fleet health overview with load balancing info
async function fleetHealthRoute(request, reply) {
  try {
    const db = getDb();
    const now = Date.now();
    const machines = db.prepare('SELECT * FROM machines ORDER BY last_seen DESC').all();

    const fleet = machines.map(m => {
      const agents = db.prepare(`
        SELECT ma.agent_id, ma.started_at, ma.status as link_status,
          mg.name as agent_name, mg.handle, mg.status as agent_status, mg.agent_type
        FROM machine_agents ma
        LEFT JOIN manager_agents mg ON ma.agent_id = mg.id
        WHERE ma.machine_id = ? AND ma.status = 'running'
      `).all(m.id);

      const lastSeenMs = m.last_seen ? now - new Date(m.last_seen).getTime() : Infinity;
      const health = lastSeenMs < 5 * 60000 ? 'online' : lastSeenMs < 30 * 60000 ? 'idle' : 'offline';
      const metadata = JSON.parse(m.metadata || '{}');

      return {
        id: m.id,
        hostname: m.hostname,
        ip_address: m.ip_address,
        status: m.status,
        health,
        last_seen: m.last_seen,
        last_seen_ago_ms: lastSeenMs === Infinity ? null : lastSeenMs,
        metadata,
        agents_running: agents.length,
        capacity: metadata.max_agents || 5,
        load_pct: Math.round((agents.length / (metadata.max_agents || 5)) * 100),
        agents,
        created_at: m.created_at,
      };
    });

    const online = fleet.filter(m => m.health === 'online');
    const totalCapacity = fleet.reduce((s, m) => s + m.capacity, 0);
    const totalRunning = fleet.reduce((s, m) => s + m.agents_running, 0);

    return {
      fleet,
      summary: {
        total_machines: fleet.length,
        online: online.length,
        idle: fleet.filter(m => m.health === 'idle').length,
        offline: fleet.filter(m => m.health === 'offline').length,
        total_agents_running: totalRunning,
        total_capacity: totalCapacity,
        fleet_load_pct: totalCapacity > 0 ? Math.round((totalRunning / totalCapacity) * 100) : 0,
      },
    };
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
}

// POST /api/machines/assign-agent - Auto-assign agent to least-loaded machine
async function autoAssignAgentRoute(request, reply) {
  try {
    const db = getDb();
    const { agent_id } = request.body;
    if (!agent_id) { reply.code(400); return { error: 'agent_id is required' }; }

    const agent = db.prepare('SELECT * FROM manager_agents WHERE id = ?').get(agent_id);
    if (!agent) { reply.code(404); return { error: 'Agent not found' }; }

    // Check if agent is already running on a machine
    const existing = db.prepare(
      "SELECT ma.*, m.hostname FROM machine_agents ma JOIN machines m ON ma.machine_id = m.id WHERE ma.agent_id = ? AND ma.status = 'running'"
    ).get(agent_id);
    if (existing) {
      return { assigned: true, already_running: true, machine_id: existing.machine_id, hostname: existing.hostname };
    }

    // Get all online machines with agent counts
    const now = Date.now();
    const machines = db.prepare('SELECT * FROM machines WHERE status = ?').all('active');

    const candidates = machines
      .map(m => {
        const lastSeenMs = m.last_seen ? now - new Date(m.last_seen).getTime() : Infinity;
        if (lastSeenMs > 30 * 60000) return null; // skip offline machines
        const runningCount = db.prepare(
          "SELECT COUNT(*) as cnt FROM machine_agents WHERE machine_id = ? AND status = 'running'"
        ).get(m.id).cnt;
        const maxAgents = JSON.parse(m.metadata || '{}').max_agents || 5;
        return { ...m, running: runningCount, max: maxAgents, available: maxAgents - runningCount };
      })
      .filter(m => m && m.available > 0)
      .sort((a, b) => {
        // Sort by: lowest load percentage, then most available slots
        const loadA = a.running / a.max;
        const loadB = b.running / b.max;
        if (loadA !== loadB) return loadA - loadB;
        return b.available - a.available;
      });

    if (candidates.length === 0) {
      reply.code(503);
      return { error: 'No machines available with capacity. All machines are offline or at capacity.' };
    }

    const target = candidates[0];
    const linkId = generateId();
    const nowIso = new Date().toISOString();

    // Stop any previous assignments
    db.prepare("UPDATE machine_agents SET status = 'stopped', stopped_at = ? WHERE agent_id = ? AND status = 'running'")
      .run(nowIso, agent_id);

    // Assign to least-loaded machine
    db.prepare('INSERT INTO machine_agents (id, machine_id, agent_id, started_at, status) VALUES (?, ?, ?, ?, ?)')
      .run(linkId, target.id, agent_id, nowIso, 'running');

    return {
      assigned: true,
      machine_id: target.id,
      hostname: target.hostname,
      ip_address: target.ip_address,
      agent_id,
      agent_name: agent.name,
      machine_load: `${target.running + 1}/${target.max}`,
    };
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
}

// ============================================================================
// TOKEN DASHBOARD ROUTES
// ============================================================================

// GET /api/tokens/dashboard - Full token dashboard
async function getTokenDashboardRoute(request, reply) {
  try {
    const result = await getDashboardSummary(request.query?.month, request.query?.days);
    return result;
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
}

// GET /api/tokens/providers/:provider - Individual provider usage (backed by token-monitoring)
async function getProviderTokensRoute(request, reply) {
  try {
    const { provider } = request.params;
    const validProviders = ['openai', 'anthropic', 'claude', 'ollama'];
    if (!validProviders.includes(provider)) {
      reply.code(400);
      return { error: 'Unknown provider. Use: openai or anthropic/claude' };
    }
    const result = await getProviderDetails(provider, request.query?.month);
    return result;
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
}

// GET /api/tokens/context - Context token stats (backed by token-monitoring models breakdown)
async function getContextTokensRoute(request, reply) {
  try {
    const result = await getModelsBreakdown(request.query?.month);
    return {
      models: result.models || [],
      daily: [],
      summary: {
        total_tokens: result.models?.reduce((s, m) => s + (m.tokens?.total || 0), 0) || 0,
        total_requests: result.models?.reduce((s, m) => s + (m.requests || 0), 0) || 0,
        avg_tokens_per_request: 0,
      },
    };
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
}

// GET /api/tokens/status - Provider API status (backed by token-monitoring)
async function getTokenStatusRoute(request, reply) {
  try {
    const summary = await getDashboardSummary();
    const status = {};
    for (const p of summary.providers || []) {
      status[p.name] = { provider: p.name, status: p.request_count > 0 ? 'active' : 'no_data', request_count: p.request_count };
    }
    return status;
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
}

// POST /api/tokens/record - Record token usage
async function recordTokenUsageRoute(request, reply) {
  try {
    const result = await storeTokenUsage(request.body);
    if (result.success) {
      reply.code(201);
    } else {
      reply.code(400);
    }
    return result;
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
}

// ============================================================================
// NEW CHANNEL/CHAT ROUTES (Phase 1)
// ============================================================================

// GET /api/channels - List all channels user has access to
async function getChannelsRoute(request, reply) {
  try {
    const userId = request.user?.id;
    if (!userId) {
      reply.code(401);
      return { error: 'Authentication required' };
    }

    const { type } = request.query;
    const channels = await getChannels(userId, { type });

    return {
      channels,
      count: channels.length
    };
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
}

// GET /api/channels/:id/messages - Get messages for a channel
async function getChannelMessagesRouteNew(request, reply) {
  try {
    const userId = request.user?.id;
    if (!userId) {
      reply.code(401);
      return { error: 'Authentication required' };
    }

    const { id } = request.params;
    const { limit = 50, offset = 0 } = request.query;

    const result = await getChannelMessages(userId, id, { limit: parseInt(limit), offset: parseInt(offset) });

    return result;
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
}

// POST /api/channels/:id/messages - Create new message in channel
async function postChannelMessageRoute(request, reply) {
  try {
    const userId = request.user?.id;
    if (!userId) {
      reply.code(401);
      return { error: 'Authentication required' };
    }

    const { id } = request.params;
    const { content, metadata } = request.body;

    if (!content || !content.trim()) {
      reply.code(400);
      return { error: 'Content is required' };
    }

    const message = await sendChannelMessage(userId, id, content, { metadata });

    reply.code(201);
    return message;
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
}

// POST /api/dm - Create or get DM channel with a user
async function createDmRoute(request, reply) {
  try {
    const userId = request.user?.id;
    if (!userId) {
      reply.code(401);
      return { error: 'Authentication required' };
    }

    const { userId: targetUserId } = request.body;

    if (!targetUserId) {
      reply.code(400);
      return { error: 'userId is required' };
    }

    const channel = await getOrCreateDMChannel(userId, targetUserId);

    reply.code(201);
    return channel;
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
}

// POST /api/channels/project/:projectId - Create project channel
async function createProjectChannelRoute(request, reply) {
  try {
    const userId = request.user?.id;
    if (!userId) {
      reply.code(401);
      return { error: 'Authentication required' };
    }

    const { projectId } = request.params;

    const channel = await createChannel({
      type: 'project',
      projectId,
      createdBy: userId
    });

    reply.code(201);
    return channel;
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
}

// ============================================================================
// TOKEN MONITORING ROUTES (NEW - Per Leonardo's Spec)
// ============================================================================

// GET /api/tokens/dashboard - Overall summary across all providers
async function getTokensDashboardRoute(request, reply) {
  try {
    const { month, days } = request.query;
    const result = await getDashboardSummary(month, days);
    return result;
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
}

// GET /api/tokens/providers/:provider - Detailed data for specific provider
async function getTokensProviderRoute(request, reply) {
  try {
    const { provider } = request.params;
    const { month, days } = request.query;
    const result = await getProviderDetails(provider, month, days);

    if (result.error) {
      reply.code(400);
    }
    return result;
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
}

// GET /api/tokens/usage - Daily usage for charts
async function getTokensUsageRoute(request, reply) {
  try {
    const { provider, month, days } = request.query;
    if (!provider) {
      reply.code(400);
      return { error: 'provider query parameter is required' };
    }
    const result = await getDailyUsage(provider, month, days);
    return result;
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
}

// GET /api/tokens/models - Per-model breakdown
async function getTokensModelsRoute(request, reply) {
  try {
    const { month, days } = request.query;
    const result = await getModelsBreakdown(month, days);
    return result;
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
}

// GET /api/tokens/monthly - Monthly aggregated data for all providers
async function getTokensMonthlyRoute(request, reply) {
  try {
    const { month } = request.query; // Format: YYYY-MM

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      reply.code(400);
      return { error: 'month parameter required (format: YYYY-MM)' };
    }

    const db = getDb();

    // Get monthly totals for each provider
    const monthlyData = db.prepare(`
      SELECT 
        provider,
        SUM(total_tokens) as total_tokens,
        SUM(prompt_tokens) as input_tokens,
        SUM(completion_tokens) as output_tokens,
        SUM(cost_usd) as total_cost,
        COUNT(*) as request_count
      FROM cost_records
      WHERE strftime('%Y-%m', recorded_at) = ?
      GROUP BY provider
    `).all(month);

    // Get daily breakdown for the month
    const dailyBreakdown = db.prepare(`
      SELECT 
        date(recorded_at) as date,
        provider,
        SUM(total_tokens) as tokens,
        SUM(cost_usd) as cost
      FROM cost_records
      WHERE strftime('%Y-%m', recorded_at) = ?
      GROUP BY date(recorded_at), provider
      ORDER BY date(recorded_at)
    `).all(month);

    // Get model breakdown for the month
    const modelBreakdown = db.prepare(`
      SELECT 
        provider,
        model,
        SUM(total_tokens) as tokens,
        SUM(cost_usd) as cost,
        COUNT(*) as requests
      FROM cost_records
      WHERE strftime('%Y-%m', recorded_at) = ?
      GROUP BY provider, model
      ORDER BY cost DESC
    `).all(month);

    return {
      month,
      providers: monthlyData,
      daily: dailyBreakdown,
      models: modelBreakdown
    };
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
}

// GET /api/tokens/live - Real live data: Kimi balance + per-agent model breakdown from DB
async function getTokensLiveRoute(request, reply) {
  try {
    const db = getDb();
    const { month } = request.query;
    const now = month ? new Date(month + '-01') : new Date();
    const start = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-01T00:00:00.000Z';
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const end = nextMonth.getFullYear() + '-' + String(nextMonth.getMonth() + 1).padStart(2, '0') + '-01T00:00:00.000Z';

    let kimiBalance = null;
    if (process.env.MOONSHOT_API_KEY) {
      try { kimiBalance = await getKimiLiveBalance(); } catch (e) { /* non-critical: external API may be unavailable */ }
    }

    const agentRows = db.prepare(`
      SELECT
        COALESCE(cr.user_id, 'unknown') AS agent_id,
        COALESCE(u.name, cr.user_id, 'Unknown Agent') AS agent_name,
        cr.provider, cr.model,
        SUM(cr.total_tokens) AS total_tokens,
        SUM(cr.prompt_tokens) AS input_tokens,
        SUM(cr.completion_tokens) AS output_tokens,
        SUM(cr.cost_usd) AS cost_usd,
        COUNT(*) AS requests,
        MAX(cr.recorded_at) AS last_used
      FROM cost_records cr
      LEFT JOIN users u ON u.id = cr.user_id
      WHERE cr.recorded_at >= ? AND cr.recorded_at < ?
      GROUP BY cr.user_id, cr.provider, cr.model
      ORDER BY cost_usd DESC
    `).all(start, end);

    const providerRows = db.prepare(`
      SELECT provider,
        SUM(cost_usd) AS cost_usd, SUM(total_tokens) AS total_tokens,
        SUM(prompt_tokens) AS input_tokens, SUM(completion_tokens) AS output_tokens,
        COUNT(*) AS requests
      FROM cost_records WHERE recorded_at >= ? AND recorded_at < ?
      GROUP BY provider
    `).all(start, end);

    const totals = db.prepare(`
      SELECT SUM(cost_usd) AS total_cost, SUM(total_tokens) AS total_tokens,
        COUNT(*) AS total_requests,
        COUNT(DISTINCT COALESCE(user_id,'unknown')) AS unique_agents
      FROM cost_records WHERE recorded_at >= ? AND recorded_at < ?
    `).get(start, end);

    return {
      period: month || (now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0')),
      kimi: kimiBalance ? {
        cashBalance: kimiBalance.cashBalance || 0,
        voucherBalance: kimiBalance.voucherBalance || 0,
        totalBalance: kimiBalance.totalBalance || 0,
        currency: kimiBalance.currency || 'CNY',
      } : null,
      totals: {
        cost: parseFloat((totals?.total_cost || 0).toFixed(4)),
        tokens: totals?.total_tokens || 0,
        requests: totals?.total_requests || 0,
        agents: totals?.unique_agents || 0,
      },
      providers: providerRows.map(p => ({
        provider: p.provider,
        cost: parseFloat((p.cost_usd || 0).toFixed(4)),
        tokens: p.total_tokens || 0,
        input: p.input_tokens || 0,
        output: p.output_tokens || 0,
        requests: p.requests || 0,
      })),
      agents: agentRows.map(r => ({
        agentId: r.agent_id, agentName: r.agent_name,
        provider: r.provider, model: r.model,
        tokens: r.total_tokens || 0, input: r.input_tokens || 0,
        output: r.output_tokens || 0,
        cost: parseFloat((r.cost_usd || 0).toFixed(4)),
        requests: r.requests || 0, lastUsed: r.last_used,
      })),
    };
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
}


// GET /api/agents/chat - Get all approved manager agents with online status for chat
async function getAgentsForChatRoute(request, reply) {
  try {
    const db = getDb();
    const agents = db.prepare(`
      SELECT id, name, handle, avatar_url, role, status, skills, experience_level
      FROM manager_agents
      WHERE is_approved = 1
      ORDER BY status DESC, name ASC
    `).all();

    return {
      agents: agents.map(a => ({
        ...a,
        skills: JSON.parse(a.skills || '[]'),
        status: a.status || 'offline',
      }))
    };
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
}



// GET /api/agents/live-status - Compact live status for all approved agents (no auth)
async function getAgentsLiveStatusRoute(request, reply) {
  try {
    const db = getDb();
    const agents = db.prepare(`
      SELECT id, name, handle, agent_type, role, status,
             status_text, current_phase, current_task_id, current_task_title, last_heartbeat
      FROM manager_agents
      WHERE is_approved = 1
      ORDER BY name ASC
    `).all();

    const now = Date.now();
    return agents.map(a => {
      let derivedStatus = 'offline';
      if (a.last_heartbeat) {
        const msSince = now - new Date(a.last_heartbeat).getTime();
        if (msSince <= 5 * 60 * 1000) derivedStatus = 'online';
        else if (msSince <= 30 * 60 * 1000) derivedStatus = 'idle';
      }
      return {
        id: a.id,
        name: a.name,
        handle: a.handle,
        type: a.agent_type || null,
        role: a.role || null,
        status: derivedStatus,
        status_text: a.status_text || null,
        current_phase: a.current_phase || null,
        current_task_id: a.current_task_id || null,
        current_task_title: a.current_task_title || null,
        last_heartbeat: a.last_heartbeat || null,
      };
    });
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
}

// GET /api/admin/users - List all users (admin only)
async function listUsersRoute(request, reply) {
  const user = request.user;
  if (!user || user.role !== 'admin') {
    reply.code(403);
    return { error: 'Admin access required' };
  }
  try {
    const { role, limit, offset } = request.query;
    const result = await listUsers({ role, limit, offset });
    return result;
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
}

async function listPendingUsersRoute(request, reply) {
  const user = request.user;
  if (!user || user.role !== 'admin') { reply.code(403); return { error: 'Admin access required' }; }
  try {
    const db = getDb();
    const users = db.prepare(`SELECT id, name, login, email, role, created_at FROM users WHERE is_active = FALSE AND id != 'user-scorpion-001' ORDER BY created_at DESC`).all();
    return { users };
  } catch (err) { reply.code(500); return { error: err.message }; }
}

async function approveUserRoute(request, reply) {
  const user = request.user;
  if (!user || user.role !== 'admin') { reply.code(403); return { error: 'Admin access required' }; }
  try {
    const db = getDb();
    const { id } = request.params;
    const target = db.prepare('SELECT id, name, login FROM users WHERE id = ?').get(id);
    if (!target) { reply.code(404); return { error: 'User not found' }; }
    db.prepare('UPDATE users SET is_active = TRUE WHERE id = ?').run(id);
    wsManager.broadcast('user:approved', { user: { id: target.id, name: target.name, login: target.login } });
    return { success: true, message: `User ${target.login} approved` };
  } catch (err) { reply.code(500); return { error: err.message }; }
}

async function rejectUserRoute(request, reply) {
  const user = request.user;
  if (!user || user.role !== 'admin') { reply.code(403); return { error: 'Admin access required' }; }
  try {
    const db = getDb();
    const { id } = request.params;
    const target = db.prepare('SELECT id, login FROM users WHERE id = ?').get(id);
    if (!target) { reply.code(404); return { error: 'User not found' }; }
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    return { success: true, message: `User ${target.login} rejected and removed` };
  } catch (err) { reply.code(500); return { error: err.message }; }
}

// ============================================================================
// ACTIVITY HISTORY ROUTE
// ============================================================================

// GET /api/activity - Get activity history feed
async function getActivityRoute(request, reply) {
  try {
    const db = getDb();
    const { type, project_id, agent_id, limit = 50, offset = 0 } = request.query;

    let sql = `
      SELECT ah.*,
        p.name as project_name_resolved,
        ma.name as agent_name_resolved
      FROM activity_history ah
      LEFT JOIN projects p ON ah.project_id = p.id
      LEFT JOIN manager_agents ma ON ah.agent_id = ma.id
      WHERE 1=1
    `;
    const params = [];

    if (type) {
      sql += ' AND ah.event_type = ?';
      params.push(type);
    }
    if (project_id) {
      sql += ' AND ah.project_id = ?';
      params.push(project_id);
    }
    if (agent_id) {
      sql += ' AND ah.agent_id = ?';
      params.push(agent_id);
    }

    sql += ' ORDER BY ah.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const activities = db.prepare(sql).all(...params);

    const countSql = `SELECT COUNT(*) as total FROM activity_history ah WHERE 1=1${
      type ? ' AND ah.event_type = ?' : ''
    }${project_id ? ' AND ah.project_id = ?' : ''}${agent_id ? ' AND ah.agent_id = ?' : ''}`;
    const countParams = [];
    if (type) countParams.push(type);
    if (project_id) countParams.push(project_id);
    if (agent_id) countParams.push(agent_id);
    const { total } = db.prepare(countSql).get(...countParams);

    return {
      activities: activities.map(a => ({
        ...a,
        project_name: a.project_name || a.project_name_resolved,
        agent_name: a.agent_name || a.agent_name_resolved,
        metadata: a.metadata ? JSON.parse(a.metadata) : null,
      })),
      total,
      limit: parseInt(limit),
      offset: parseInt(offset),
    };
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
}

// ============================================================================
// PRESET ROUTES
// ============================================================================

// GET /api/presets - List all presets grouped by type
async function listPresetsRoute(request, reply) {
  const presets = require('./presets');
  return presets.listAllPresets();
}

// GET /api/presets/:type - List presets by type
async function listPresetsByTypeRoute(request, reply) {
  const presets = require('./presets');
  const { type } = request.params;

  const validTypes = ['pm_mode', 'worker_dept', 'rnd_division'];
  if (!validTypes.includes(type)) {
    reply.code(400);
    return { error: `Invalid type. Must be one of: ${validTypes.join(', ')}` };
  }

  return { type, presets: presets.listPresets(type) };
}

// GET /api/presets/:type/:name - Get full preset content
async function getPresetRoute(request, reply) {
  const presetsModule = require('./presets');
  const { type, name } = request.params;

  const preset = presetsModule.getPreset(type, name);
  if (!preset) {
    reply.code(404);
    return { error: 'Preset not found' };
  }

  return preset;
}

// ── Workspace routes ──────────────────────────────────────────────────────────
const _fs   = require('fs');
const _path = require('path');
const WORKSPACES_DIR = _path.resolve(__dirname, '../../workspaces');
const EXEC_LOGS_DIR  = _path.resolve(__dirname, '../../logs/executions');

// GET /api/tasks/:id/workspace — list files in task workspace
async function getTaskWorkspace(request, reply) {
  const { id } = request.params;
  const workspacePath = _path.join(WORKSPACES_DIR, id);

  if (!_fs.existsSync(workspacePath)) {
    return { files: [], workspace_path: null };
  }

  function listFiles(dir, base = '') {
    let results = [];
    for (const entry of _fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '__pycache__') continue;
      const rel = base ? `${base}/${entry.name}` : entry.name;
      const full = _path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results = results.concat(listFiles(full, rel));
      } else {
        const stat = _fs.statSync(full);
        results.push({ name: rel, size: stat.size, modified: stat.mtime.toISOString() });
      }
    }
    return results;
  }

  return { files: listFiles(workspacePath), workspace_path: workspacePath };
}

// GET /api/tasks/:id/workspace/file?name=<relpath> — read a file from workspace
async function getWorkspaceFile(request, reply) {
  const { id } = request.params;
  const { name } = request.query;
  if (!name) { reply.code(400); return { error: 'name query param required' }; }

  // Prevent path traversal
  const workspacePath = _path.join(WORKSPACES_DIR, id);
  const filePath = _path.resolve(workspacePath, name);
  if (!filePath.startsWith(workspacePath)) { reply.code(403); return { error: 'Forbidden' }; }

  if (!_fs.existsSync(filePath)) { reply.code(404); return { error: 'File not found' }; }

  const content = _fs.readFileSync(filePath, 'utf8');
  return { name, content, size: Buffer.byteLength(content) };
}

// GET /api/tasks/:id/log — get execution log
async function getTaskLog(request, reply) {
  const { id } = request.params;

  // Try log_path from DB first
  const db = getDb();
  const task = db.prepare('SELECT log_path FROM tasks WHERE id = ?').get(id);
  const logPath = task?.log_path || _path.join(EXEC_LOGS_DIR, `${id}.log`);

  if (!_fs.existsSync(logPath)) { return { log: null }; }
  const log = _fs.readFileSync(logPath, 'utf8');
  return { log, size: log.length, log_path: logPath };
}

// POST /api/presets/sync - Sync filesystem presets to database
async function syncPresetsRoute(request, reply) {
  const presets = require('./presets');
  const synced = presets.syncPresetsToDb();
  return { success: true, synced };
}

module.exports = {
  // Projects
  listProjects,
  getProject,
  createProject,
  updateProjectStatus,
  getProjectReport,
  getProjectReportHtml,

  // Tasks - Phase 3
  getProjectTasks,
  createTask,
  getTaskById,
  updateTask,
  deleteTask,
  assignTask,
  acceptTask,
  rejectTask,
  startTask,
  completeTask,
  executeTaskRoute,
  cancelTask,
  addTaskComment,
  getTaskWorkspace,
  getWorkspaceFile,
  getTaskLog,
  getTaskUpdates,
  addTaskUpdate,
  getAgentTasks,
  getMyTasks,
  searchTasks,
  updateTaskPriority,

  // Legacy Costs
  getCosts,
  getCostSummary,
  recordCost,

  // Real Costs
  getActualCostsRoute,
  getLiveCostsRoute,
  syncCostsRoute,
  getBudgetVsActualRoute,
  getModelCostsRoute,
  getCreditsRoute,
  getCostsByAgentRoute,

  // Token Dashboard (Legacy)
  getTokenDashboardRoute,
  getProviderTokensRoute,
  getContextTokensRoute,
  getTokenStatusRoute,
  recordTokenUsageRoute,

  // Token Monitoring (NEW - Per Spec)
  getTokensDashboardRoute,
  getTokensLiveRoute,
  getAgentsForChatRoute,
  getTokensProviderRoute,
  getTokensUsageRoute,
  getTokensModelsRoute,
  getTokensMonthlyRoute,

  // Chat (Legacy)
  sendMessageRoute,
  getChannelMessagesRoute,
  getDmHistoryRoute,
  getUserDmChannelsRoute,
  sendDmRoute,
  editMessageRoute,
  deleteMessageRoute,

  // Channels
  listChannelsRoute,
  getChannelMessagesByIdRoute,
  sendChannelMessageRoute,
  createOrGetDmRoute,
  createProjectChannelRoute,

  // Auth
  telegramAuthRoute,
  loginRoute,
  logoutRoute,
  getMeRoute,
  registerRoute,

  // Agents
  listAgents,
  getAgent,
  registerAgentRoute,
  approveAgentRoute,
  listPendingAgentsRoute,
  listApprovedAgentsRoute,

  // Budgets
  createBudgetRoute,
  listBudgetsRoute,

  // Machines
  registerMachineRoute,
  listMachinesRoute,
  deleteMachineRoute,
  fleetHealthRoute,
  autoAssignAgentRoute,

  // Project Assignment (Phase 2)
  assignAgentToProjectRouteV2,
  removeAgentFromProjectRouteV2,
  getProjectAgentsRoute,
  getAgentProjectsRoute,
  updateAgentProjectRoleRoute,

  // Manager Agents (New)
  listManagerAgentsRoute,
  getManagerAgentRoute,
  registerManagerAgentRoute,
  approveManagerAgentRoute,
  rejectManagerAgentRoute,
  deleteManagerAgentRoute,
  updateManagerAgentStatusRoute,
  patchManagerAgentRoute,
  agentHeartbeatRoute,
  getAgentNotificationsRoute,
  markAgentNotificationReadRoute,
  assignAgentToProjectRoute,
  removeAgentFromProjectRoute,

  // User Notifications
  getNotificationsRoute,
  listUsersRoute,
  listPendingUsersRoute,
  approveUserRoute,
  rejectUserRoute,
  markNotificationReadRoute,
  markAllNotificationsReadRoute,

  // Activity
  getActivityRoute,

  // Presets
  listPresetsRoute,
  listPresetsByTypeRoute,
  getPresetRoute,
  syncPresetsRoute,

  // Agent Live Logs & Phase
  postAgentLogRoute,
  getAgentLogsRoute,
  postAgentPhaseRoute,
  postAgentStatusTextRoute,
  getAgentSoulRoute,
};

// ============================================================================
// AGENT LIVE LOGS & PHASE ROUTES
// ============================================================================

// POST /api/agents/:id/logs — agent submits a log entry
async function postAgentLogRoute(request, reply) {
  const db = getDb();
  const { id } = request.params;
  const { level = 'info', message, task_id, metadata } = request.body || {};

  if (!message) { reply.code(400); return { error: 'message required' }; }

  const agent = db.prepare('SELECT id, name FROM manager_agents WHERE id = ?').get(id);
  if (!agent) { reply.code(404); return { error: 'Agent not found' }; }

  const now = new Date().toISOString();
  db.prepare(`INSERT INTO agent_logs (agent_id, level, message, task_id, metadata, created_at) VALUES (?,?,?,?,?,?)`)
    .run(id, level, message, task_id || null, JSON.stringify(metadata || {}), now);

  // Broadcast to all WS clients for live log panel
  const wsManager = require('./websocket');
  wsManager.broadcast('agent:log', {
    agent_id: id,
    agent_name: agent.name,
    level,
    message,
    task_id: task_id || null,
    created_at: now,
  });

  return { ok: true };
}

// GET /api/agents/:id/logs — fetch recent logs for an agent
async function getAgentLogsRoute(request, reply) {
  const db = getDb();
  const { id } = request.params;
  const { limit = 50, since } = request.query;

  let query = 'SELECT * FROM agent_logs WHERE agent_id = ?';
  const params = [id];

  if (since) {
    query += ' AND created_at > ?';
    params.push(since);
  }

  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(Math.min(Number(limit) || 50, 200));

  const logs = db.prepare(query).all(...params);
  return { logs: logs.reverse() };
}

// POST /api/agents/:id/phase — agent reports current execution phase
async function postAgentPhaseRoute(request, reply) {
  const db = getDb();
  const { id } = request.params;
  const { phase, task_id, task_title, status_text } = request.body || {};

  const agent = db.prepare('SELECT id, name FROM manager_agents WHERE id = ?').get(id);
  if (!agent) { reply.code(404); return { error: 'Agent not found' }; }

  const now = new Date().toISOString();
  db.prepare(`UPDATE manager_agents SET current_phase=?, current_task_id=?, current_task_title=?, phase_started_at=?, status_text=? WHERE id=?`)
    .run(phase || null, task_id || null, task_title || null, phase ? now : null, status_text || null, id);

  const wsManager = require('./websocket');
  wsManager.broadcast('agent:phase', {
    agent_id: id,
    agent_name: agent.name,
    phase: phase || null,
    task_id: task_id || null,
    task_title: task_title || null,
    status_text: status_text || null,
    started_at: phase ? now : null,
  });

  // Also log it
  if (phase) {
    db.prepare(`INSERT INTO agent_logs (agent_id, level, message, task_id, created_at) VALUES (?,?,?,?,?)`)
      .run(id, 'phase', `Phase: ${phase}${task_title ? ` — ${task_title}` : ''}${status_text ? ` | ${status_text}` : ''}`, task_id || null, now);
  }

  return { ok: true };
}

// POST /api/agents/:id/status-text — agent reports what it's currently doing in natural language
async function postAgentStatusTextRoute(request, reply) {
  const db = getDb();
  const { id } = request.params;
  const { status_text } = request.body || {};

  const agent = db.prepare('SELECT id, name FROM manager_agents WHERE id = ?').get(id);
  if (!agent) { reply.code(404); return { error: 'Agent not found' }; }

  const now = new Date().toISOString();
  db.prepare(`UPDATE manager_agents SET status_text=?, updated_at=? WHERE id=?`)
    .run(status_text || null, now, id);

  const wsManager = require('./websocket');
  wsManager.broadcast('agent:status_text', {
    agent_id: id,
    agent_name: agent.name,
    status_text: status_text || null,
    updated_at: now,
  });

  return { ok: true };
}

// GET /api/agents/:id/soul — get agent's soul.md content
async function getAgentSoulRoute(request, reply) {
  const db = getDb();
  const { id } = request.params;
  const agent = db.prepare('SELECT id, name, soul_path FROM manager_agents WHERE id = ?').get(id);
  if (!agent) { reply.code(404); return { error: 'Agent not found' }; }
  if (!agent.soul_path) { return { soul_path: null, content: null }; }

  const path = require('path');
  const fs = require('fs');
  const fullPath = path.resolve(__dirname, '..', agent.soul_path);
  try {
    const content = fs.readFileSync(fullPath, 'utf-8');
    return { soul_path: agent.soul_path, content };
  } catch (e) {
    return { soul_path: agent.soul_path, content: null, error: 'File not found' };
  }
}

// ============================================================================
// MACHINE-AGENT LINK ROUTES
// ============================================================================

async function linkMachineAgentRoute(request, reply) {
  try {
    const db = getDb();
    const { machineId, agentId } = request.params;
    const now = new Date().toISOString();

    const machine = db.prepare('SELECT id FROM machines WHERE id = ?').get(machineId);
    if (!machine) { reply.code(404); return { error: 'Machine not found' }; }

    const agent = db.prepare('SELECT id FROM manager_agents WHERE id = ?').get(agentId);
    if (!agent) { reply.code(404); return { error: 'Agent not found' }; }

    try {
      const id = generateId();
      db.prepare('INSERT INTO machine_agents (id, machine_id, agent_id, started_at, status) VALUES (?, ?, ?, ?, ?)')
        .run(id, machineId, agentId, now, 'running');
      reply.code(201);
      return { id, machine_id: machineId, agent_id: agentId, started_at: now, status: 'running' };
    } catch (e) {
      if (e.message.includes('UNIQUE')) { reply.code(409); return { error: 'Agent already linked to this machine' }; }
      throw e;
    }
  } catch (err) { reply.code(500); return { error: err.message }; }
}

async function unlinkMachineAgentRoute(request, reply) {
  try {
    const db = getDb();
    const { machineId, agentId } = request.params;
    const now = new Date().toISOString();

    const link = db.prepare('SELECT id FROM machine_agents WHERE machine_id = ? AND agent_id = ?').get(machineId, agentId);
    if (!link) { reply.code(404); return { error: 'Link not found' }; }

    db.prepare('UPDATE machine_agents SET status = ?, stopped_at = ? WHERE machine_id = ? AND agent_id = ?')
      .run('stopped', now, machineId, agentId);

    return { success: true, machine_id: machineId, agent_id: agentId, stopped_at: now };
  } catch (err) { reply.code(500); return { error: err.message }; }
}

// ============================================================================
// NOTIFICATION ROUTES
// ============================================================================

// GET /api/notifications - Get current user's notifications
async function getNotificationsRoute(request, reply) {
  const userId = request.user?.id;
  if (!userId) {
    reply.code(401);
    return { error: 'Authentication required' };
  }

  const { unread_only, limit } = request.query;
  try {
    const notifications = await getUserNotifications(userId, {
      unreadOnly: unread_only === 'true',
      limit: parseInt(limit) || 20
    });
    const unreadCount = await getUserUnreadCount(userId);
    return {
      notifications,
      unread_count: unreadCount
    };
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
}

// POST /api/notifications/:id/read - Mark notification as read
async function markNotificationReadRoute(request, reply) {
  const userId = request.user?.id;
  const { id } = request.params;
  if (!userId) {
    reply.code(401);
    return { error: 'Authentication required' };
  }

  try {
    const result = await markUserNotificationRead(id, userId);
    return result;
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
}

// POST /api/notifications/read-all - Mark all as read
async function markAllNotificationsReadRoute(request, reply) {
  const userId = request.user?.id;
  if (!userId) {
    reply.code(401);
    return { error: 'Authentication required' };
  }

  try {
    const result = await markAllUserNotificationsRead(userId);
    return result;
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
}

// GET /api/agents/:id/notifications - Get agent notifications
async function getAgentNotificationsRoute(request, reply) {
  const db = getDb();
  const { id } = request.params;
  const user = request.user;
  const { limit = 50, unread_only, type } = request.query;

  const agent = db.prepare('SELECT id, name FROM manager_agents WHERE id = ?').get(id);
  if (!agent) { reply.code(404); return { error: 'Agent not found' }; }

  const isAdmin = user?.role === 'admin';
  const isSelf = user?.id === id;
  if (!isAdmin && !isSelf) { reply.code(403); return { error: 'Not authorized' }; }

  let q = 'SELECT * FROM agent_notifications WHERE agent_id = ?';
  const params = [id];
  if (unread_only === 'true') { q += ' AND is_read = 0'; }
  if (type) { q += ' AND type = ?'; params.push(type); }
  q += ' ORDER BY created_at DESC LIMIT ?';
  params.push(parseInt(limit));

  const rows = db.prepare(q).all(...params);
  const unread = db.prepare('SELECT COUNT(*) as c FROM agent_notifications WHERE agent_id = ? AND is_read = 0').get(id);

  return {
    agent: { id: agent.id, name: agent.name },
    notifications: rows.map(n => ({ ...n, data: JSON.parse(n.data || '{}') })),
    unread_count: unread.c,
    total: rows.length
  };
}

// GET /api/notifications/agents/feed - Aggregated all-agent notification feed (admin only)
async function getAgentsFeedRoute(request, reply) {
  const db = getDb();
  const user = request.user;
  if (!user || user.role !== 'admin') { reply.code(403); return { error: 'Admin access required' }; }

  const { limit = 100, agent_id, type, unread_only } = request.query;

  let q = `
    SELECT an.*, ma.name as agent_name, ma.agent_type, ma.handle as agent_handle
    FROM agent_notifications an
    LEFT JOIN manager_agents ma ON an.agent_id = ma.id
    WHERE 1=1
  `;
  const params = [];
  if (agent_id) { q += ' AND an.agent_id = ?'; params.push(agent_id); }
  if (type) { q += ' AND an.type = ?'; params.push(type); }
  if (unread_only === 'true') { q += ' AND an.is_read = 0'; }
  q += ' ORDER BY an.created_at DESC LIMIT ?';
  params.push(parseInt(limit));

  const rows = db.prepare(q).all(...params);

  // Unread count per agent
  const agentCounts = db.prepare(`
    SELECT agent_id, COUNT(*) as unread, ma.name as agent_name
    FROM agent_notifications an
    LEFT JOIN manager_agents ma ON an.agent_id = ma.id
    WHERE an.is_read = 0
    GROUP BY an.agent_id
  `).all();

  return {
    notifications: rows.map(n => ({ ...n, data: JSON.parse(n.data || '{}') })),
    total: rows.length,
    unread_by_agent: agentCounts
  };
}

module.exports.linkMachineAgentRoute = linkMachineAgentRoute;
module.exports.unlinkMachineAgentRoute = unlinkMachineAgentRoute;
module.exports.getAgentNotificationsRoute = getAgentNotificationsRoute;
module.exports.markAgentNotificationReadRoute = markAgentNotificationReadRoute;
module.exports.getAgentsFeedRoute = getAgentsFeedRoute;

// ============================================================================
// PROFILE & PREFERENCES ROUTES
// ============================================================================

// PATCH /api/auth/me — Update profile
async function updateProfileRoute(request, reply) {
  try {
    const userId = request.user.id;
    const { name, email } = request.body;
    const db = getDb();

    // Build dynamic update
    const updates = [];
    const values = [];

    if (name !== undefined) {
      if (!name || name.trim().length < 1) {
        reply.code(400);
        return { error: 'Name cannot be empty' };
      }
      updates.push('name = ?');
      values.push(name.trim());
    }

    if (email !== undefined) {
      if (email) {
        // Check email uniqueness
        const existing = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, userId);
        if (existing) {
          reply.code(409);
          return { error: 'Email already in use' };
        }
      }
      updates.push('email = ?');
      values.push(email || null);
    }

    if (updates.length === 0) {
      reply.code(400);
      return { error: 'No fields to update' };
    }

    updates.push("updated_at = datetime('now')");
    values.push(userId);

    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    // Return updated user
    const user = db.prepare('SELECT id, name, login, email, role, avatar_url, created_at FROM users WHERE id = ?').get(userId);

    return { success: true, user };
  } catch (err) {
    request.log.error({ err }, 'Update profile error');
    reply.code(500);
    return { error: 'Failed to update profile' };
  }
}

// GET /api/user/preferences — Get preferences
async function getPreferencesRoute(request, reply) {
  try {
    const db = getDb();
    const user = db.prepare('SELECT preferences FROM users WHERE id = ?').get(request.user.id);

    if (!user) {
      reply.code(404);
      return { error: 'User not found' };
    }

    const defaults = {
      notify_tasks: true,
      notify_messages: true,
      notify_agents: false
    };

    let preferences = defaults;
    try {
      if (user.preferences) {
        preferences = { ...defaults, ...JSON.parse(user.preferences) };
      }
    } catch (e) {
      // Invalid JSON, use defaults
    }

    return { preferences };
  } catch (err) {
    request.log.error({ err }, 'Get preferences error');
    reply.code(500);
    return { error: 'Failed to get preferences' };
  }
}

// PUT /api/user/preferences — Save preferences
async function updatePreferencesRoute(request, reply) {
  try {
    const db = getDb();
    const { notify_tasks, notify_messages, notify_agents } = request.body;

    const preferences = JSON.stringify({
      notify_tasks: notify_tasks !== undefined ? Boolean(notify_tasks) : true,
      notify_messages: notify_messages !== undefined ? Boolean(notify_messages) : true,
      notify_agents: notify_agents !== undefined ? Boolean(notify_agents) : false
    });

    db.prepare("UPDATE users SET preferences = ?, updated_at = datetime('now') WHERE id = ?")
      .run(preferences, request.user.id);

    return { success: true, preferences: JSON.parse(preferences) };
  } catch (err) {
    request.log.error({ err }, 'Update preferences error');
    reply.code(500);
    return { error: 'Failed to save preferences' };
  }
}

module.exports.updateProfileRoute = updateProfileRoute;
module.exports.getPreferencesRoute = getPreferencesRoute;
module.exports.updatePreferencesRoute = updatePreferencesRoute;

// ============================================================================
// R&D CONTROL ROUTES
// ============================================================================

// GET /api/rnd/status — Get all R&D agents with schedule info
async function getRndStatusRoute(request, reply) {
  try {
    const { getSchedulerStatus } = require('./rnd-scheduler');
    const agents = getSchedulerStatus();
    return { agents, count: agents.length };
  } catch (err) {
    reply.code(500);
    return { error: 'Failed to get R&D status' };
  }
}

// POST /api/rnd/:id/execute — Manually trigger R&D research
async function executeRndRoute(request, reply) {
  try {
    const { id } = request.params;
    const db = getDb();

    const agent = db.prepare('SELECT * FROM manager_agents WHERE id = ? AND agent_type = ?').get(id, 'rnd');
    if (!agent) {
      reply.code(404);
      return { error: 'R&D agent not found' };
    }

    if (!agent.is_approved) {
      reply.code(400);
      return { error: 'Agent must be approved before execution' };
    }

    const { executeRndResearch } = require('./rnd-scheduler');
    const wsManager = request.server.websocketManager;
    const result = await executeRndResearch(id, wsManager);

    return { success: true, ...result };
  } catch (err) {
    request.log.error({ err }, 'R&D execution error');
    reply.code(500);
    return { error: 'R&D execution failed' };
  }
}

// PATCH /api/rnd/:id/schedule — Update R&D agent schedule
async function updateRndScheduleRoute(request, reply) {
  try {
    const { id } = request.params;
    const { schedule } = request.body;
    const db = getDb();

    const agent = db.prepare('SELECT * FROM manager_agents WHERE id = ? AND agent_type = ?').get(id, 'rnd');
    if (!agent) {
      reply.code(404);
      return { error: 'R&D agent not found' };
    }

    db.prepare("UPDATE manager_agents SET rnd_schedule = ?, updated_at = datetime('now') WHERE id = ?")
      .run(schedule, id);

    // Refresh this agent's schedule
    const { scheduleAgent } = require('./rnd-scheduler');
    const updatedAgent = db.prepare('SELECT * FROM manager_agents WHERE id = ?').get(id);
    const wsManager = request.server.websocketManager;
    scheduleAgent(updatedAgent, wsManager);

    return { success: true, agent_id: id, schedule };
  } catch (err) {
    request.log.error({ err }, 'R&D schedule update error');
    reply.code(500);
    return { error: 'Failed to update schedule' };
  }
}

// GET /api/rnd/:id/findings — Get R&D findings history
async function getRndFindingsRoute(request, reply) {
  try {
    const { id } = request.params;
    const db = getDb();
    const limit = parseInt(request.query.limit) || 20;
    const offset = parseInt(request.query.offset) || 0;

    const agent = db.prepare('SELECT * FROM manager_agents WHERE id = ? AND agent_type = ?').get(id, 'rnd');
    if (!agent) {
      reply.code(404);
      return { error: 'R&D agent not found' };
    }

    // Get rnd_feed channel
    const feedChannel = db.prepare("SELECT id FROM channels WHERE type = 'rnd_feed'").get();
    if (!feedChannel) {
      return { findings: [], total: 0 };
    }

    const findings = db.prepare(`
      SELECT id, content, metadata, created_at
      FROM messages
      WHERE channel_id = ? AND agent_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(feedChannel.id, id, limit, offset);

    const total = db.prepare(`
      SELECT COUNT(*) as count FROM messages WHERE channel_id = ? AND agent_id = ?
    `).get(feedChannel.id, id);

    return {
      findings: findings.map(f => ({
        ...f,
        metadata: f.metadata ? JSON.parse(f.metadata) : {},
      })),
      total: total.count,
      limit,
      offset,
    };
  } catch (err) {
    request.log.error({ err }, 'R&D findings error');
    reply.code(500);
    return { error: 'Failed to get findings' };
  }
}

// GET /api/rnd/feed — Get all R&D feed messages
async function getRndFeedRoute(request, reply) {
  try {
    const db = getDb();
    const limit = parseInt(request.query.limit) || 50;
    const offset = parseInt(request.query.offset) || 0;

    const feedChannel = db.prepare("SELECT id FROM channels WHERE type = 'rnd_feed'").get();
    if (!feedChannel) {
      return { messages: [], total: 0 };
    }

    const messages = db.prepare(`
      SELECT m.id, m.content, m.metadata, m.created_at, m.agent_id,
             a.name as agent_name, a.rnd_division
      FROM messages m
      LEFT JOIN manager_agents a ON m.agent_id = a.id
      WHERE m.channel_id = ?
      ORDER BY m.created_at DESC
      LIMIT ? OFFSET ?
    `).all(feedChannel.id, limit, offset);

    const total = db.prepare('SELECT COUNT(*) as count FROM messages WHERE channel_id = ?').get(feedChannel.id);

    return {
      messages: messages.map(m => ({
        ...m,
        metadata: m.metadata ? JSON.parse(m.metadata) : {},
      })),
      total: total.count,
      limit,
      offset,
    };
  } catch (err) {
    request.log.error({ err }, 'R&D feed error');
    reply.code(500);
    return { error: 'Failed to get R&D feed' };
  }
}

module.exports.getRndStatusRoute = getRndStatusRoute;
module.exports.executeRndRoute = executeRndRoute;
module.exports.updateRndScheduleRoute = updateRndScheduleRoute;
module.exports.getRndFindingsRoute = getRndFindingsRoute;
module.exports.getRndFeedRoute = getRndFeedRoute;

// ─── News cache (in-memory, refreshed on demand or every 10 min) ──────────────
let _newsCache = null;
let _newsCacheAt = 0;
const NEWS_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function getOrFetchNews(force = false) {
  const now = Date.now();
  if (!force && _newsCache && (now - _newsCacheAt) < NEWS_CACHE_TTL_MS) {
    return { ..._newsCache, cached: true, age_seconds: Math.floor((now - _newsCacheAt) / 1000) };
  }
  const { fetchAllNews } = require('./news-fetcher');
  _newsCache = await fetchAllNews();
  _newsCacheAt = Date.now();
  return { ..._newsCache, cached: false, age_seconds: 0 };
}

// GET /api/rnd/news — Fetch real-time news from HackerNews, Reddit, Lobsters, GitHub
async function getRndNewsRoute(request, reply) {
  try {
    const force = request.query.refresh === 'true' || request.query.force === 'true';
    const source = request.query.source; // optional filter: hackernews|reddit|web|github
    const division = request.query.division;

    let data;
    if (division) {
      const { fetchNewsForDivision } = require('./news-fetcher');
      data = await fetchNewsForDivision(division);
      data.cached = false;
      data.age_seconds = 0;
    } else {
      data = await getOrFetchNews(force);
    }

    // Apply source filter if requested
    if (source && ['hackernews', 'reddit', 'web', 'github'].includes(source)) {
      return {
        items: data[source] || [],
        total: (data[source] || []).length,
        source,
        fetched_at: data.fetched_at,
        cached: data.cached,
        age_seconds: data.age_seconds,
      };
    }

    // Return all sources with totals
    return {
      hackernews: data.hackernews || [],
      reddit: data.reddit || [],
      web: data.web || [],
      github: data.github || [],
      totals: {
        hackernews: (data.hackernews || []).length,
        reddit: (data.reddit || []).length,
        web: (data.web || []).length,
        github: (data.github || []).length,
      },
      fetched_at: data.fetched_at,
      cached: data.cached,
      age_seconds: data.age_seconds,
    };
  } catch (err) {
    request.log.error({ err }, 'R&D news fetch error');
    reply.code(500);
    return { error: 'Failed to fetch news: ' + err.message };
  }
}

module.exports.getRndNewsRoute = getRndNewsRoute;

// ============================================================================
// AGENT-TO-AGENT COMMUNICATION
// ============================================================================

// GET /api/agents/directory - Discover other agents for communication
async function agentDirectoryRoute(request, reply) {
  try {
    const db = getDb();
    const agents = db.prepare(`
      SELECT id, name, handle, agent_type, status, current_mode, current_model, project_id, rnd_division
      FROM manager_agents WHERE is_approved = 1
      ORDER BY status DESC, name ASC
    `).all();

    return {
      agents: agents.map(a => ({
        id: a.id,
        name: a.name,
        handle: a.handle,
        type: a.agent_type,
        status: a.status,
        mode: a.current_mode,
        project_id: a.project_id,
        division: a.rnd_division,
        available: a.status === 'online',
      })),
      count: agents.length,
      online: agents.filter(a => a.status === 'online').length,
    };
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
}

// POST /api/agents/:id/message - Send agent-to-agent or user-to-agent message
async function agentMessageRoute(request, reply) {
  try {
    const db = getDb();
    const { id } = request.params;
    const { content, sender_agent_id } = request.body || {};

    if (!content) { reply.code(400); return { error: 'content is required' }; }

    const target = db.prepare('SELECT * FROM manager_agents WHERE id = ? AND is_approved = 1').get(id);
    if (!target) { reply.code(404); return { error: 'Target agent not found' }; }

    // Determine sender info
    let senderName, senderType, senderId;
    if (sender_agent_id) {
      const sender = db.prepare('SELECT * FROM manager_agents WHERE id = ?').get(sender_agent_id);
      if (!sender) { reply.code(404); return { error: 'Sender agent not found' }; }
      senderName = sender.name;
      senderType = 'agent';
      senderId = sender.id;
    } else {
      senderName = request.user?.name || 'System';
      senderType = 'user';
      senderId = request.user?.id;
    }

    // Store as notification for the target agent
    const notifId = generateId();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO agent_notifications (id, agent_id, type, title, content, is_read, data, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(notifId, id, 'agent_message', `Message from ${senderName}`, content, 0,
      JSON.stringify({ sender_id: senderId, sender_type: senderType, sender_name: senderName }), now);

    // Broadcast via WebSocket
    const wsManager = request.server.websocketManager;
    if (wsManager) {
      wsManager.broadcast('agent:message', {
        target_agent_id: id,
        target_agent_name: target.name,
        sender_id: senderId,
        sender_name: senderName,
        sender_type: senderType,
        content,
        notification_id: notifId,
        timestamp: now,
      }, { userId: id });
    }

    return {
      delivered: true,
      notification_id: notifId,
      target: { id: target.id, name: target.name },
      sender: { id: senderId, name: senderName, type: senderType },
    };
  } catch (err) {
    reply.code(500);
    return { error: err.message };
  }
}

// ============================================================================
// ADMIN CHAT CLEANUP ROUTE
// ============================================================================

// DELETE /api/admin/chat/cleanup - Clean up broken/empty chat data (admin only)
function adminChatCleanupRoute(request, reply) {
  const user = request.user;

  if (!user || user.role !== 'admin') {
    reply.code(403);
    return { error: 'Admin access required' };
  }

  const db = getDb();
  const now = new Date().toISOString();

  // 1. Delete all messages where content is empty OR content IS NULL
  const deletedMessages = db.prepare(
    "DELETE FROM messages WHERE content IS NULL OR content = ''"
  ).run().changes;

  // 2. Delete channels with zero messages, type != 'general', and is_archived = 1
  const deletedChannels = db.prepare(`
    DELETE FROM channels
    WHERE type != 'general'
      AND is_archived = 1
      AND id NOT IN (SELECT DISTINCT channel_id FROM messages WHERE channel_id IS NOT NULL)
  `).run().changes;

  // 3. Delete expired typing indicators
  const deletedTyping = db.prepare(
    'DELETE FROM typing_indicators WHERE expires_at < ?'
  ).run(now).changes;

  request.log.info({ deletedMessages, deletedChannels, deletedTyping }, '[Chat Cleanup] Deleted records');

  return { deletedMessages, deletedChannels, deletedTyping };
}

module.exports.adminChatCleanupRoute = adminChatCleanupRoute;
module.exports.agentDirectoryRoute = agentDirectoryRoute;
module.exports.agentMessageRoute = agentMessageRoute;
module.exports.getRndFeedRoute = getRndFeedRoute;