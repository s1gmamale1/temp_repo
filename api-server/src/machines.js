/**
 * Machine Management Module
 * Mac Mini registration and tracking
 */

const { getDb, generateId } = require('./database');

// ============================================================================
// MACHINE REGISTRATION
// ============================================================================

/**
 * Register a new machine (Mac Mini, server, etc.)
 * @param {Object} machineData - Machine registration data
 * @returns {Promise<Object>} Created machine
 */
async function registerMachine(machineData) {
  const db = getDb();
  const { 
    hostname, 
    ip_address, 
    mac_address,
    machine_type = 'mac_mini',
    specs = {}
  } = machineData;
  
  if (!hostname) {
    throw new Error('Hostname is required');
  }
  
  // Check if machine with same MAC already exists
  if (mac_address) {
    const existing = db.prepare('SELECT id FROM machines WHERE mac_address = ?').get(mac_address);
    if (existing) {
      // Update existing machine
      const now = new Date().toISOString();
      db.prepare(`
        UPDATE machines 
        SET hostname = ?, ip_address = ?, status = ?, specs = ?, last_seen = ?, updated_at = ?
        WHERE id = ?
      `).run(
        hostname,
        ip_address || null,
        'online',
        JSON.stringify(specs),
        now,
        now,
        existing.id
      );
      
      return {
        id: existing.id,
        hostname,
        ip_address,
        mac_address,
        status: 'online',
        updated: true,
        last_seen: now
      };
    }
  }
  
  // Create new machine
  const id = generateId();
  const now = new Date().toISOString();
  
  db.prepare(`
    INSERT INTO machines (
      id, hostname, ip_address, mac_address, 
      status, machine_type, specs, last_seen, registered_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    hostname,
    ip_address || null,
    mac_address || null,
    'online',
    machine_type,
    JSON.stringify(specs),
    now,
    now,
    now
  );
  
  return {
    id,
    hostname,
    ip_address,
    mac_address,
    status: 'online',
    machine_type,
    specs,
    registered_at: now,
    last_seen: now
  };
}

/**
 * Update machine heartbeat/status
 * @param {string} machineId - Machine ID
 * @param {Object} statusData - Status update data
 * @returns {Promise<Object>} Updated machine
 */
async function updateMachineHeartbeat(machineId, statusData = {}) {
  const db = getDb();
  const { ip_address, status = 'online', specs } = statusData;
  
  const machine = db.prepare('SELECT id FROM machines WHERE id = ?').get(machineId);
  
  if (!machine) {
    throw new Error('Machine not found');
  }
  
  const now = new Date().toISOString();
  const updates = [];
  const params = [];
  
  if (ip_address) {
    updates.push('ip_address = ?');
    params.push(ip_address);
  }
  
  updates.push('status = ?');
  params.push(status);
  
  if (specs) {
    updates.push('specs = ?');
    params.push(JSON.stringify(specs));
  }
  
  updates.push('last_seen = ?');
  updates.push('updated_at = ?');
  params.push(now, now);
  params.push(machineId);
  
  db.prepare(`
    UPDATE machines SET ${updates.join(', ')} WHERE id = ?
  `).run(...params);
  
  return {
    id: machineId,
    status,
    last_seen: now
  };
}

// ============================================================================
// MACHINE LISTING
// ============================================================================

/**
 * List all machines (excluding templates)
 * @param {Object} filters - Query filters
 * @returns {Promise<Object>} Machines list
 */
async function listMachines(filters = {}) {
  const db = getDb();
  const { status, machine_type, limit = 50, offset = 0 } = filters;
  
  let query = `
    SELECT m.*,
           COUNT(ma.agent_id) as agent_count,
           GROUP_CONCAT(DISTINCT a.name) as running_agents
    FROM machines m
    LEFT JOIN machine_agents ma ON m.id = ma.machine_id AND ma.status = 'running'
    LEFT JOIN agents a ON ma.agent_id = a.id
    WHERE m.machine_type != 'template'
  `;
  const params = [];
  
  if (status) {
    query += ' AND m.status = ?';
    params.push(status);
  }
  
  if (machine_type) {
    query += ' AND m.machine_type = ?';
    params.push(machine_type);
  }
  
  query += ' GROUP BY m.id ORDER BY m.last_seen DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));
  
  const machines = db.prepare(query).all(...params);
  
  return {
    machines: machines.map(m => ({
      id: m.id,
      hostname: m.hostname,
      ip_address: m.ip_address,
      status: m.status,
      machine_type: m.machine_type,
      specs: JSON.parse(m.specs || '{}'),
      agents_running: m.agent_count || 0,
      running_agents: m.running_agents ? m.running_agents.split(',') : [],
      last_seen: m.last_seen,
      registered_at: m.registered_at
    })),
    count: machines.length
  };
}

/**
 * Get machine by ID
 * @param {string} machineId - Machine ID
 * @returns {Promise<Object>} Machine details
 */
async function getMachineById(machineId) {
  const db = getDb();
  
  const machine = db.prepare('SELECT * FROM machines WHERE id = ?').get(machineId);
  
  if (!machine) {
    throw new Error('Machine not found');
  }
  
  // Get running agents on this machine
  const agents = db.prepare(`
    SELECT a.id, a.name, a.role, a.status, ma.started_at
    FROM machine_agents ma
    JOIN agents a ON ma.agent_id = a.id
    WHERE ma.machine_id = ? AND ma.status = 'running'
  `).all(machineId);
  
  return {
    ...machine,
    specs: JSON.parse(machine.specs || '{}'),
    agents: agents
  };
}

// ============================================================================
// AGENT ASSIGNMENT
// ============================================================================

/**
 * Start an agent on a machine
 * @param {string} machineId - Machine ID
 * @param {string} agentId - Agent ID
 * @returns {Promise<Object>} Assignment record
 */
async function startAgentOnMachine(machineId, agentId) {
  const db = getDb();
  
  // Verify machine exists
  const machine = db.prepare('SELECT id FROM machines WHERE id = ?').get(machineId);
  if (!machine) {
    throw new Error('Machine not found');
  }
  
  // Verify agent exists and is approved
  const agent = db.prepare('SELECT id, approval_status FROM agents WHERE id = ?').get(agentId);
  if (!agent) {
    throw new Error('Agent not found');
  }
  if (agent.approval_status !== 'approved') {
    throw new Error('Agent must be approved before starting');
  }
  
  const id = generateId();
  const now = new Date().toISOString();
  
  // Check if already running
  const existing = db.prepare(`
    SELECT id FROM machine_agents 
    WHERE machine_id = ? AND agent_id = ? AND status = 'running'
  `).get(machineId, agentId);
  
  if (existing) {
    return {
      id: existing.id,
      machine_id: machineId,
      agent_id: agentId,
      status: 'running',
      started_at: now,
      message: 'Agent already running on this machine'
    };
  }
  
  // Stop any existing running instances of this agent
  db.prepare(`
    UPDATE machine_agents 
    SET status = 'stopped', stopped_at = ?
    WHERE agent_id = ? AND status = 'running'
  `).run(now, agentId);
  
  // Create new assignment
  db.prepare(`
    INSERT INTO machine_agents (id, machine_id, agent_id, started_at, status)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, machineId, agentId, now, 'running');
  
  // Update agent status
  db.prepare(`
    UPDATE agents SET status = ?, last_seen = ? WHERE id = ?
  `).run('idle', now, agentId);
  
  return {
    id,
    machine_id: machineId,
    agent_id: agentId,
    status: 'running',
    started_at: now
  };
}

/**
 * Stop an agent on a machine
 * @param {string} machineId - Machine ID
 * @param {string} agentId - Agent ID
 * @returns {Promise<Object>} Updated assignment
 */
async function stopAgentOnMachine(machineId, agentId) {
  const db = getDb();
  const now = new Date().toISOString();
  
  db.prepare(`
    UPDATE machine_agents 
    SET status = 'stopped', stopped_at = ?
    WHERE machine_id = ? AND agent_id = ? AND status = 'running'
  `).run(now, machineId, agentId);
  
  // Update agent status
  db.prepare(`
    UPDATE agents SET status = ? WHERE id = ?
  `).run('offline', agentId);
  
  return {
    machine_id: machineId,
    agent_id: agentId,
    status: 'stopped',
    stopped_at: now
  };
}

// ============================================================================
// MACHINE REMOVAL
// ============================================================================

/**
 * Remove a machine
 * @param {string} machineId - Machine ID to remove
 * @returns {Promise<Object>} Removal result
 */
async function removeMachine(machineId) {
  const db = getDb();
  
  const machine = db.prepare('SELECT id FROM machines WHERE id = ?').get(machineId);
  if (!machine) {
    throw new Error('Machine not found');
  }
  
  // Stop all agents on this machine
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE machine_agents 
    SET status = 'stopped', stopped_at = ?
    WHERE machine_id = ? AND status = 'running'
  `).run(now, machineId);
  
  // Delete machine (cascade will handle junction table)
  db.prepare('DELETE FROM machines WHERE id = ?').run(machineId);
  
  return {
    id: machineId,
    removed: true,
    agents_stopped: true
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Registration
  registerMachine,
  updateMachineHeartbeat,
  
  // Listing
  listMachines,
  getMachineById,
  
  // Agent assignment
  startAgentOnMachine,
  stopAgentOnMachine,
  
  // Removal
  removeMachine
};
