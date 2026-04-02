/**
 * Task Watchdog — detects stuck tasks and stale agents, takes corrective action.
 *
 * Runs as a setInterval inside the API server.
 * - Tasks stuck in "running" for > TASK_TIMEOUT_MIN → marked failed, re-queued
 * - Tasks stuck in "pending" with assigned agent offline > PENDING_TIMEOUT_MIN → unassigned
 * - Agents with no heartbeat for > AGENT_STALE_MIN → marked offline
 */

const TASK_TIMEOUT_MIN    = parseInt(process.env.WATCHDOG_TASK_TIMEOUT_MIN || '10', 10);
const PENDING_TIMEOUT_MIN = parseInt(process.env.WATCHDOG_PENDING_TIMEOUT_MIN || '15', 10);
const AGENT_STALE_MIN     = parseInt(process.env.WATCHDOG_AGENT_STALE_MIN || '5', 10);
const INTERVAL_SEC        = parseInt(process.env.WATCHDOG_INTERVAL_SEC || '60', 10);

let db = null;
let wsManager = null;
let intervalHandle = null;

function log(level, msg) {
  const ts = new Date().toISOString().slice(11, 19);
  const prefix = level === 'warn' ? '\x1b[33m[WATCHDOG]\x1b[0m' :
                 level === 'error' ? '\x1b[31m[WATCHDOG]\x1b[0m' :
                 '\x1b[36m[WATCHDOG]\x1b[0m';
  console.log(`${prefix} [${ts}] ${msg}`);
}

function tick() {
  if (!db) return;
  const now = new Date().toISOString();

  try {
    // ── 1. Stuck running tasks ──────────────────────────────────────────────
    const cutoff = new Date(Date.now() - TASK_TIMEOUT_MIN * 60 * 1000).toISOString();
    const stuckTasks = db.prepare(`
      SELECT t.id, t.title, t.agent_id, t.project_id, t.started_at
      FROM tasks t
      WHERE t.status = 'running' AND t.started_at < ?
    `).all(cutoff);

    for (const task of stuckTasks) {
      const elapsed = Math.round((Date.now() - new Date(task.started_at).getTime()) / 60000);
      log('warn', `Task "${task.title}" stuck running for ${elapsed}min → marking failed & re-queuing`);

      // Mark failed
      db.prepare(`
        UPDATE tasks SET status = 'failed', completed_at = ?, updated_at = ?
        WHERE id = ?
      `).run(now, now, task.id);

      // Create a re-queued copy
      const newId = require('crypto').randomUUID();
      const original = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id);
      if (original) {
        db.prepare(`
          INSERT INTO tasks (id, project_id, title, description, priority, status, created_by, created_at, updated_at, payload)
          VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
        `).run(newId, original.project_id, original.title, original.description, original.priority,
               original.created_by, now, now, original.payload || '{}');

        log('warn', `Re-queued as ${newId.slice(0, 8)}...`);
      }

      // Clear agent phase
      if (task.agent_id) {
        db.prepare(`
          UPDATE manager_agents SET current_phase = NULL, current_task_id = NULL, current_task_title = NULL, phase_started_at = NULL, status_text = 'Task timed out — re-queued'
          WHERE id = ?
        `).run(task.agent_id);
      }

      // Broadcast
      if (wsManager) {
        wsManager.broadcast('task:failed', {
          task_id: task.id, task_title: task.title, reason: 'watchdog_timeout',
          requeued_as: newId,
        });
        wsManager.broadcast('watchdog:action', {
          action: 'task_timeout', task_id: task.id, task_title: task.title,
          elapsed_min: elapsed, new_task_id: newId,
        });
      }

      // Log it
      if (task.agent_id) {
        try {
          db.prepare(`INSERT INTO agent_logs (agent_id, level, message, task_id, created_at) VALUES (?,?,?,?,?)`)
            .run(task.agent_id, 'warn', `Watchdog: task "${task.title}" timed out after ${elapsed}min — re-queued`, task.id, now);
        } catch (_) {}
      }
    }

    // ── 2. Stale agents (no heartbeat) ──────────────────────────────────────
    const agentCutoff = new Date(Date.now() - AGENT_STALE_MIN * 60 * 1000).toISOString();
    const staleAgents = db.prepare(`
      SELECT id, name, handle, status, last_heartbeat
      FROM manager_agents
      WHERE status IN ('online', 'working', 'busy', 'idle')
        AND last_heartbeat IS NOT NULL
        AND last_heartbeat < ?
    `).all(agentCutoff);

    for (const agent of staleAgents) {
      const elapsed = Math.round((Date.now() - new Date(agent.last_heartbeat).getTime()) / 60000);
      log('warn', `Agent ${agent.name} (${agent.handle}) no heartbeat for ${elapsed}min → marking offline`);

      db.prepare(`UPDATE manager_agents SET status = 'offline', status_text = 'Lost heartbeat — marked offline by watchdog' WHERE id = ?`)
        .run(agent.id);

      if (wsManager) {
        wsManager.broadcast('agent:status_changed', {
          agent_id: agent.id, agent_name: agent.name, status: 'offline', reason: 'watchdog_heartbeat',
        });
        wsManager.broadcast('watchdog:action', {
          action: 'agent_offline', agent_id: agent.id, agent_name: agent.name,
          last_heartbeat: agent.last_heartbeat, elapsed_min: elapsed,
        });
      }
    }

    // ── 3. Pending tasks with offline agents ────────────────────────────────
    const pendingCutoff = new Date(Date.now() - PENDING_TIMEOUT_MIN * 60 * 1000).toISOString();
    const orphanedTasks = db.prepare(`
      SELECT t.id, t.title, t.agent_id, ma.status AS agent_status, ma.name AS agent_name
      FROM tasks t
      JOIN manager_agents ma ON ma.id = t.agent_id
      WHERE t.status = 'pending'
        AND t.assigned_at IS NOT NULL
        AND t.assigned_at < ?
        AND ma.status IN ('offline', 'registered')
    `).all(pendingCutoff);

    for (const task of orphanedTasks) {
      log('warn', `Task "${task.title}" pending with offline agent ${task.agent_name} → unassigning`);

      db.prepare(`UPDATE tasks SET agent_id = NULL, assigned_at = NULL, updated_at = ? WHERE id = ?`)
        .run(now, task.id);

      if (wsManager) {
        wsManager.broadcast('watchdog:action', {
          action: 'task_unassigned', task_id: task.id, task_title: task.title,
          agent_name: task.agent_name, reason: 'agent_offline',
        });
      }
    }

  } catch (err) {
    log('error', `Watchdog tick error: ${err.message}`);
  }
}

function start(database, ws) {
  db = database;
  wsManager = ws;

  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = setInterval(tick, INTERVAL_SEC * 1000);

  log('info', `Started — checking every ${INTERVAL_SEC}s | task timeout: ${TASK_TIMEOUT_MIN}min | agent stale: ${AGENT_STALE_MIN}min`);

  // Run first tick after 10s to let system settle
  setTimeout(tick, 10000);
}

function stop() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    log('info', 'Stopped');
  }
}

module.exports = { start, stop, tick };
