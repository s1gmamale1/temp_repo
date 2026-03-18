'use strict';

/**
 * Orchestration Engine v1 — automatic PM-led task assignment
 *
 * Functions:
 *   inferTaskRole(task)                     → string (role label)
 *   selectCandidateAgents({ role, projectId }) → agent[] ranked best-first
 *   autoAssignTask(taskId, opts?)           → { success, ... }
 *   runAutoAssignmentSweep()                → { scanned, assigned, skipped, errors, details }
 */

const { getDb, generateId } = require('./database');

// ---------------------------------------------------------------------------
// Role keyword map — order matters: first role with highest keyword hit wins
// ---------------------------------------------------------------------------
const ROLE_KEYWORDS = {
  frontend:  ['frontend', 'ui', 'react', 'vue', 'angular', 'css', 'html', 'interface', 'component', 'button', 'form', 'layout', 'page', 'render', 'browser', 'dom'],
  backend:   ['backend', 'api', 'server', 'rest', 'graphql', 'endpoint', 'route', 'middleware', 'express', 'fastify', 'node', 'python', 'django', 'flask', 'service'],
  devops:    ['deploy', 'deployment', 'docker', 'kubernetes', 'k8s', 'ci', 'cd', 'pipeline', 'infrastructure', 'terraform', 'ansible', 'nginx', 'aws', 'gcp', 'azure', 'cloud', 'helm', 'container'],
  qa:        ['test', 'testing', 'qa', 'quality', 'bug', 'regression', 'unittest', 'e2e', 'integration', 'spec', 'assertion', 'coverage', 'flaky'],
  database:  ['database', ' db ', 'sql', 'query', 'migration', 'schema', 'sqlite', 'postgres', 'mysql', 'mongo', 'redis', 'index', 'table', 'orm'],
  security:  ['security', 'auth', 'authentication', 'authorization', 'oauth', 'jwt', 'vulnerability', 'penetration', 'audit', 'encrypt', 'decrypt', 'ssl', 'tls', 'xss', 'csrf'],
  mobile:    ['mobile', 'ios', 'android', 'react native', 'flutter', 'swift', 'kotlin', 'app store', 'push notification'],
  uiux:      ['figma', 'wireframe', 'prototype', 'ux', 'user experience', 'accessibility', 'a11y', 'visual', 'branding', 'mockup', 'user flow'],
};

/**
 * Infer the most appropriate agent role/mode from a task's title + description.
 * Returns one of the keys in ROLE_KEYWORDS, defaulting to 'backend'.
 */
function inferTaskRole(task) {
  const text = ` ${task.title || ''} ${task.description || ''} `.toLowerCase();

  let bestRole = 'backend';
  let bestScore = 0;

  for (const [role, keywords] of Object.entries(ROLE_KEYWORDS)) {
    const score = keywords.reduce((acc, kw) => acc + (text.includes(kw) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      bestRole = role;
    }
  }

  return bestRole;
}

/**
 * Return agents eligible for a task, ranked best-first.
 * Eligibility: approved, not offline, assigned to the project.
 * Ranking: online status > skill/mode keyword match > lower active task load.
 */
function selectCandidateAgents({ role, projectId }) {
  const db = getDb();

  const agents = db.prepare(`
    SELECT ma.*,
           COUNT(t.id) AS active_task_count
    FROM   manager_agents ma
    JOIN   agent_projects ap
           ON  ap.agent_id   = ma.id
           AND ap.project_id = ?
           AND ap.status     = 'active'
    LEFT JOIN tasks t
           ON  t.agent_id = ma.id
           AND t.status   IN ('pending', 'running')
    WHERE  ma.is_approved = TRUE
      AND  ma.status != 'offline'
      AND  ma.agent_type != 'pm'
    GROUP BY ma.id
  `).all(projectId);

  const scored = agents.map(agent => {
    let score = 0;

    // Status bonus
    if      (agent.status === 'online')  score += 10;
    else if (agent.status === 'idle')    score += 7;
    else if (agent.status === 'working') score += 3;

    // Active task load penalty
    score -= (agent.active_task_count || 0) * 2;

    // Skills array match
    let skills = [];
    try { skills = JSON.parse(agent.skills || '[]'); } catch {}
    if (skills.some(s => typeof s === 'string' && (s.toLowerCase().includes(role) || role.includes(s.toLowerCase())))) {
      score += 5;
    }

    // current_mode field match
    if (agent.current_mode && agent.current_mode.toLowerCase().includes(role)) score += 3;

    // role field match
    if (agent.role && agent.role.toLowerCase().includes(role)) score += 3;

    return { ...agent, _score: score };
  });

  return scored.sort((a, b) => b._score - a._score);
}

/**
 * Assign a single pending/unassigned task to the best available agent.
 * Writes to DB, logs activity, and emits WebSocket events.
 * Returns a result object — never throws.
 *
 * @param {string} taskId
 * @param {{ assignedBy?: string }} [opts]
 */
function autoAssignTask(taskId, opts = {}) {
  const db = getDb();

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  if (!task) {
    console.log(`[Orchestration] Task ${taskId} not found`);
    return { success: false, reason: 'task_not_found' };
  }

  if (task.agent_id) {
    console.log(`[Orchestration] Task ${taskId} already assigned — skipping`);
    return { success: false, reason: 'already_assigned' };
  }

  if (task.status !== 'pending') {
    console.log(`[Orchestration] Task ${taskId} status="${task.status}" — skipping`);
    return { success: false, reason: 'wrong_status' };
  }

  const role = inferTaskRole(task);
  console.log(`[Orchestration] Task "${task.title}" (${taskId}) → inferred role: ${role}`);

  const candidates = selectCandidateAgents({ role, projectId: task.project_id });

  if (candidates.length === 0) {
    console.log(`[Orchestration] No eligible agents for task ${taskId} (role=${role}, project=${task.project_id})`);
    return { success: false, reason: 'no_candidates', role };
  }

  const agent = candidates[0];
  const now = new Date().toISOString();
  const assignedBy = opts.assignedBy || 'user-scorpion-001';

  console.log(`[Orchestration] Assigning task ${taskId} → agent "${agent.name}" (score=${agent._score})`);

  // Persist assignment
  db.prepare(`
    UPDATE tasks
    SET    agent_id    = ?,
           assigned_by = ?,
           assigned_at = ?,
           updated_at  = ?
    WHERE  id = ?
  `).run(agent.id, assignedBy, now, now, taskId);

  // Assignment history (best-effort)
  try {
    db.prepare(`
      INSERT INTO task_assignment_history (id, task_id, agent_id, assigned_by, assigned_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(generateId(), taskId, agent.id, assignedBy, now);
  } catch (e) {
    console.warn('[Orchestration] task_assignment_history insert failed:', e.message);
  }

  // Activity history (best-effort)
  try {
    const project = db.prepare('SELECT name FROM projects WHERE id = ?').get(task.project_id);
    db.prepare(`
      INSERT INTO activity_history
        (id, event_type, action, entity_id, entity_title, project_id, project_name, agent_id, agent_name, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      generateId(),
      'task', 'auto_assigned',
      taskId, task.title,
      task.project_id, project?.name || null,
      agent.id, agent.name,
      JSON.stringify({ inferred_role: role, score: agent._score, engine: 'orchestration-v1' }),
      now
    );
  } catch (e) {
    console.warn('[Orchestration] activity_history insert failed:', e.message);
  }

  // WebSocket broadcast (best-effort — wsManager may not be ready in tests)
  try {
    const wsManager = require('./websocket');
    const project = db.prepare('SELECT name FROM projects WHERE id = ?').get(task.project_id);
    wsManager.emitTaskAssigned(task.project_id, {
      task_id:      taskId,
      task_title:   task.title,
      project_name: project?.name || null,
      agent_id:     agent.id,
      agent_name:   agent.name,
      assigned_by:  assignedBy,
    });
  } catch (e) {
    console.warn('[Orchestration] WS emit failed:', e.message);
  }

  return {
    success:    true,
    task_id:    taskId,
    task_title: task.title,
    agent_id:   agent.id,
    agent_name: agent.name,
    role,
    score:      agent._score,
  };
}

/**
 * Scan all pending/unassigned tasks across all projects and attempt assignment.
 * Returns aggregate summary.
 */
function runAutoAssignmentSweep() {
  const db = getDb();

  const unassigned = db.prepare(`
    SELECT * FROM tasks
    WHERE  status   = 'pending'
      AND  agent_id IS NULL
    ORDER BY priority ASC, created_at ASC
  `).all();

  console.log(`[Orchestration] Sweep started — ${unassigned.length} unassigned pending tasks`);

  const results = {
    scanned:  unassigned.length,
    assigned: 0,
    skipped:  0,
    errors:   0,
    details:  [],
  };

  for (const task of unassigned) {
    try {
      const result = autoAssignTask(task.id);
      if (result.success) {
        results.assigned++;
        results.details.push({
          task_id:    task.id,
          task_title: task.title,
          status:     'assigned',
          agent_name: result.agent_name,
          role:       result.role,
        });
      } else {
        results.skipped++;
        results.details.push({
          task_id:    task.id,
          task_title: task.title,
          status:     'skipped',
          reason:     result.reason,
        });
      }
    } catch (e) {
      results.errors++;
      console.error(`[Orchestration] Unexpected error on task ${task.id}:`, e.message);
      results.details.push({ task_id: task.id, task_title: task.title, status: 'error', error: e.message });
    }
  }

  console.log(`[Orchestration] Sweep done — assigned=${results.assigned} skipped=${results.skipped} errors=${results.errors}`);
  return results;
}

module.exports = { inferTaskRole, selectCandidateAgents, autoAssignTask, runAutoAssignmentSweep };
