/**
 * PM Delegation — auto-assigns PM-generated tasks to worker agents on the project
 * Called after PM automation creates tasks in assignAgentToProjectRouteV2
 */

// ── Keyword → agent role mapping ─────────────────────────────────────────────
// The more keywords that match a task title, the higher the score for that role
const ROLE_KEYWORDS = {
  frontend:         ['frontend', 'ui', 'ux', 'dashboard', 'interface', 'component', 'page', 'layout',
                     'form', 'react', 'vue', 'angular', 'css', 'html', 'onboarding', 'flow', 'visual',
                     'admin panel', 'settings', 'view'],
  backend:          ['backend', 'server', 'service', 'api', 'auth', 'authentication', 'session', 'token',
                     'webhook', 'email', 'notification', 'billing', 'subscription', 'payment', 'logic',
                     'endpoint', 'middleware', 'handler', 'worker', 'queue', 'job'],
  database:         ['database', 'db', 'sql', 'data isolation', 'multi-tenant', 'tenant', 'schema',
                     'migration', 'query', 'index', 'storage', 'table', 'relation', 'orm'],
  security:         ['security', 'oauth', 'mfa', 'encryption', 'vulnerability', 'audit', 'compliance',
                     'penetration', 'firewall', 'rbac', 'permission', 'access control', 'secret'],
  devops:           ['devops', 'deploy', 'ci', 'cd', 'pipeline', 'infrastructure', 'docker', 'kubernetes',
                     'k8s', 'monitoring', 'cloud', 'scaling', 'server', 'environment', 'release'],
  uiux:             ['design', 'ux', 'user experience', 'wireframe', 'prototype', 'accessibility',
                     'branding', 'typography', 'color', 'mockup', 'figma', 'usability'],
  qa:               ['test', 'qa', 'quality', 'bug', 'validation', 'e2e', 'coverage', 'regression',
                     'integration test', 'unit test', 'spec', 'mock', 'fixture'],
  data_engineering: ['analytics', 'tracking', 'data pipeline', 'etl', 'reporting', 'metrics', 'usage',
                     'telemetry', 'event', 'log', 'aggregation', 'warehouse', 'stream'],
  api_integration:  ['api', 'integration', 'webhook', 'rate limit', 'versioning', 'sdk', 'third-party',
                     'external', 'connector', 'adapter', 'openapi', 'swagger'],
  performance:      ['performance', 'optimization', 'cache', 'speed', 'load', 'latency', 'throughput',
                     'profiling', 'bottleneck', 'memory', 'cpu', 'benchmark'],
  mobile:           ['mobile', 'ios', 'android', 'react native', 'flutter', 'app store', 'push notification',
                     'offline', 'native'],
  ml_engineering:   ['ml', 'machine learning', 'ai', 'model', 'training', 'inference', 'embedding',
                     'vector', 'llm', 'fine-tune', 'dataset', 'prediction'],
};

// Auth is special — both backend and security cover it; backend wins if no security worker
const AUTH_KEYWORDS = ['auth', 'login', 'signup', 'register', 'oauth', 'mfa', 'jwt', 'password'];

// Experience level ordering for senior preference
const EXPERIENCE_RANK = { expert: 4, senior: 3, mid: 2, junior: 1 };

/**
 * Score a worker agent for a given task title.
 * Returns 0-100 where higher = better match.
 */
function scoreWorker(taskTitle, worker) {
  const title = taskTitle.toLowerCase();
  const role  = (worker.role || '').toLowerCase().replace(/[^a-z_]/g, '');

  // Get keywords for this worker's role
  const roleKeys = ROLE_KEYWORDS[role] || [];

  let score = 0;
  for (const kw of roleKeys) {
    if (title.includes(kw)) score += (kw.includes(' ') ? 3 : 1); // multi-word phrases score higher
  }

  // Bonus: auth keywords match both backend and security
  if (AUTH_KEYWORDS.some(k => title.includes(k)) && (role === 'backend' || role === 'security')) {
    score += 2;
  }

  return score;
}

/**
 * Pick the best worker for a task from the available pool.
 * Applies:
 *   - Status preference: idle/online > working
 *   - Experience preference for high/critical priority tasks: senior > mid > junior
 *   - Load balancing: skip agents with 3+ running tasks; penalise loaded agents
 *
 * @param {string}  taskTitle
 * @param {Array}   workers       - full worker rows from manager_agents
 * @param {object}  taskCounts    - { agentId: number } batch-assignment count
 * @param {number}  taskPriority  - task priority integer (1-5)
 * @param {object}  db            - better-sqlite3 instance (for live running-task counts)
 */
function pickWorker(taskTitle, workers, taskCounts, taskPriority, db) {
  if (!workers.length) return null;

  // Filter out overloaded agents (3+ running tasks)
  const available = workers.filter(w => {
    const runningCount = db
      ? (db.prepare("SELECT COUNT(*) as c FROM tasks WHERE agent_id = ? AND status = 'running'").get(w.id)?.c || 0)
      : 0;
    return runningCount < 3;
  });

  // If all agents are overloaded, fall back to the full pool to avoid leaving tasks unassigned
  const pool = available.length > 0 ? available : workers;

  let best = null;
  let bestScore = -1;

  for (const w of pool) {
    const keywordScore = scoreWorker(taskTitle, w);
    const load = taskCounts[w.id] || 0;

    // Status preference: idle/online agents get a bonus
    const statusBonus = (w.status === 'idle' || w.status === 'online') ? 5 : 0;

    // Experience preference for high-priority (>= 3) tasks
    let experienceBonus = 0;
    if (taskPriority >= 3) {
      const expLevel = (w.experience_level || '').toLowerCase();
      experienceBonus = (EXPERIENCE_RANK[expLevel] || 0) * 2;
    }

    // Normalise load into a small penalty (max 5 tasks = -0.5 score)
    const effective = keywordScore + statusBonus + experienceBonus - (load * 0.1);

    if (effective > bestScore) {
      bestScore = effective;
      best = w;
    }
  }

  return best; // may return a worker with score=0 if that's the only option
}

/**
 * Main delegation function.
 * Called after PM automation generates tasks.
 *
 * @param {string}   projectId     - project the PM was just assigned to
 * @param {Array}    tasks         - [{id, title}] generated by PM automation
 * @param {string}   pmAgentId     - PM agent id (excluded from worker pool)
 * @param {object}   db            - better-sqlite3 db instance
 * @param {object}   wsManager     - websocket manager
 * @returns {Array}  assignments   - [{task_id, task_title, worker_id, worker_name}]
 */
function delegateTasksToWorkers(projectId, tasks, pmAgentId, db, wsManager) {
  if (!tasks.length) return [];

  // Get all approved WORKER agents on this project (exclude PM and R&D)
  // Prefer idle/online agents — ORDER BY status so idle comes first
  const workers = db.prepare(`
    SELECT ma.*
    FROM manager_agents ma
    JOIN agent_projects ap ON ap.agent_id = ma.id
    WHERE ap.project_id = ?
      AND ap.status = 'active'
      AND ma.is_approved = 1
      AND ma.agent_type = 'worker'
      AND ma.id != ?
    ORDER BY CASE ma.status WHEN 'idle' THEN 0 WHEN 'online' THEN 1 ELSE 2 END ASC
  `).all(projectId, pmAgentId);

  if (!workers.length) {
    console.log(`[PM Delegation] No worker agents on project ${projectId} — tasks left unassigned`);
    return [];
  }

  console.log(`[PM Delegation] ${workers.length} worker(s) available for ${tasks.length} tasks`);

  // Track how many tasks each worker gets in this batch (for load balancing)
  const taskCounts = {};
  workers.forEach(w => { taskCounts[w.id] = 0; });

  const now = new Date().toISOString();
  const assignments = [];

  for (const task of tasks) {
    const taskPriority = task.priority || 2;
    const worker = pickWorker(task.title, workers, taskCounts, taskPriority, db);

    if (!worker) {
      // No suitable worker — create admin notification
      try {
        const notifId = require('./database').generateId();
        db.prepare(`
          INSERT INTO agent_notifications (id, agent_id, type, title, content, data, created_at)
          VALUES (?, NULL, 'unassigned_task', 'Task needs assignment', ?, ?, ?)
        `).run(
          notifId,
          `Task "${task.title}" could not be auto-assigned — no eligible worker found.`,
          JSON.stringify({ task_id: task.id, task_title: task.title, project_id: projectId }),
          now
        );
      } catch (e) { /* ignore */ }
      console.log(`[PM Delegation] No suitable worker for "${task.title}" — admin notified`);
      continue;
    }

    // Assign task to worker in DB (assigned_by is NULL — automated PM delegation, no direct user)
    db.prepare(`UPDATE tasks SET agent_id = ?, assigned_by = NULL, assigned_at = ?, updated_at = ? WHERE id = ?`)
      .run(worker.id, now, now, task.id);

    taskCounts[worker.id] = (taskCounts[worker.id] || 0) + 1;

    // Update worker status to 'working'
    try {
      db.prepare("UPDATE manager_agents SET status = 'working' WHERE id = ?").run(worker.id);
    } catch (e) { /* ignore */ }

    // Create agent notification for the worker
    try {
      const notifId = require('./database').generateId();
      db.prepare(`
        INSERT INTO agent_notifications (id, agent_id, type, title, content, data, created_at)
        VALUES (?, ?, 'task_assigned', 'New Task Assigned by PM', ?, ?, ?)
      `).run(
        notifId, worker.id,
        `Task: "${task.title}" has been assigned to you by the PM`,
        JSON.stringify({ task_id: task.id, task_title: task.title, project_id: projectId, assigned_by: pmAgentId }),
        now
      );
    } catch (e) { /* ignore dup */ }

    // WS: notify the assigned worker (they get task:assigned event)
    try {
      wsManager.emitTaskAssigned(projectId, {
        task_id:      task.id,
        task_title:   task.title,
        project_id:   projectId,
        agent_id:     worker.id,
        agent_name:   worker.name,
        assigned_by:  pmAgentId,
        assigned_at:  now,
      });
      wsManager.emitTaskAssignedToAgent(worker.id, {
        task_id:     task.id,
        task_title:  task.title,
        project_id:  projectId,
        agent_id:    worker.id,
        agent_name:  worker.name,
      });
    } catch (e) { /* ignore */ }

    assignments.push({
      task_id:     task.id,
      task_title:  task.title,
      worker_id:   worker.id,
      worker_name: worker.name,
      worker_role: worker.role,
    });

    console.log(`[PM Delegation] "${task.title}" → ${worker.name} (${worker.role})`);
  }

  return assignments;
}

module.exports = { delegateTasksToWorkers, scoreWorker, pickWorker, ROLE_KEYWORDS };
