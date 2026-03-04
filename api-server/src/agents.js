/**
 * Agent Management Module
 * Registration, approval workflow, and agent tracking
 */

const { getDb, generateId } = require('./database');

// ============================================================================
// AGENT REGISTRATION
// ============================================================================

/**
 * Register a new agent (pending approval)
 * @param {Object} agentData - Agent registration data
 * @returns {Promise<Object>} Created agent
 */
async function registerAgent(agentData) {
  const db = getDb();
  const { 
    name, 
    role, 
    description, 
    project_id = null,
    config = {},
    personality = {},
    registered_by = null,
    avatar_url = null
  } = agentData;
  
  if (!name || !role) {
    throw new Error('Name and role are required');
  }
  
  const id = generateId();
  const now = new Date().toISOString();
  
  db.prepare(`
    INSERT INTO agents (
      id, project_id, name, role, description, avatar_url,
      status, config, personality, is_active, 
      approval_status, registered_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    project_id,
    name,
    role,
    description || null,
    avatar_url || null,
    'offline',
    JSON.stringify(config),
    JSON.stringify(personality),
    0, // not active until approved
    'pending',
    registered_by,
    now
  );
  
  return {
    id,
    name,
    role,
    description,
    project_id,
    status: 'offline',
    approval_status: 'pending',
    registered_by,
    created_at: now
  };
}

/**
 * Approve a pending agent
 * @param {string} agentId - Agent ID to approve
 * @param {string} approvedBy - User ID who approved
 * @returns {Promise<Object>} Updated agent
 */
async function approveAgent(agentId, approvedBy) {
  const db = getDb();
  
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId);
  
  if (!agent) {
    throw new Error('Agent not found');
  }
  
  if (agent.approval_status !== 'pending') {
    throw new Error(`Agent is already ${agent.approval_status}`);
  }
  
  const now = new Date().toISOString();
  
  db.prepare(`
    UPDATE agents 
    SET approval_status = ?, is_active = ?, approved_at = ?, approved_by = ?, updated_at = ?
    WHERE id = ?
  `).run('approved', 1, now, approvedBy, now, agentId);
  
  return {
    id: agentId,
    name: agent.name,
    approval_status: 'approved',
    approved_at: now,
    approved_by: approvedBy
  };
}

/**
 * Reject a pending agent
 * @param {string} agentId - Agent ID to reject
 * @param {string} rejectedBy - User ID who rejected
 * @returns {Promise<Object>} Updated agent
 */
async function rejectAgent(agentId, rejectedBy) {
  const db = getDb();
  
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId);
  
  if (!agent) {
    throw new Error('Agent not found');
  }
  
  if (agent.approval_status !== 'pending') {
    throw new Error(`Agent is already ${agent.approval_status}`);
  }
  
  const now = new Date().toISOString();
  
  db.prepare(`
    UPDATE agents 
    SET approval_status = ?, is_active = ?, approved_by = ?, updated_at = ?
    WHERE id = ?
  `).run('rejected', 0, rejectedBy, now, agentId);
  
  return {
    id: agentId,
    name: agent.name,
    approval_status: 'rejected',
    rejected_by: rejectedBy
  };
}

// ============================================================================
// AGENT LISTING
// ============================================================================

/**
 * List pending agents (for admin approval)
 * @param {Object} filters - Query filters
 * @returns {Promise<Object>} Pending agents list
 */
async function listPendingAgents(filters = {}) {
  const db = getDb();
  const { limit = 50, offset = 0 } = filters;
  
  const agents = db.prepare(`
    SELECT a.*, u.name as registered_by_name
    FROM agents a
    LEFT JOIN users u ON a.registered_by = u.id
    WHERE a.approval_status = 'pending'
    ORDER BY a.created_at DESC
    LIMIT ? OFFSET ?
  `).all(parseInt(limit), parseInt(offset));
  
  const { count } = db.prepare(`
    SELECT COUNT(*) as count FROM agents WHERE approval_status = 'pending'
  `).get();
  
  return {
    agents: agents.map(a => ({
      ...a,
      config: JSON.parse(a.config || '{}'),
      personality: a.personality ? JSON.parse(a.personality) : null
    })),
    total: count,
    limit: parseInt(limit),
    offset: parseInt(offset)
  };
}

/**
 * List approved agents
 * @param {Object} filters - Query filters
 * @returns {Promise<Object>} Approved agents list
 */
async function listApprovedAgents(filters = {}) {
  const db = getDb();
  const { project_id, status, limit = 50, offset = 0 } = filters;
  
  let query = `
    SELECT a.*, u.name as approved_by_name
    FROM agents a
    LEFT JOIN users u ON a.approved_by = u.id
    WHERE a.approval_status = 'approved'
  `;
  const params = [];
  
  if (project_id) {
    query += ' AND a.project_id = ?';
    params.push(project_id);
  }
  
  if (status) {
    query += ' AND a.status = ?';
    params.push(status);
  }
  
  query += ' ORDER BY a.approved_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));
  
  const agents = db.prepare(query).all(...params);
  
  let countQuery = 'SELECT COUNT(*) as count FROM agents WHERE approval_status = ?';
  const countParams = ['approved'];
  
  if (project_id) {
    countQuery += ' AND project_id = ?';
    countParams.push(project_id);
  }
  
  if (status) {
    countQuery += ' AND status = ?';
    countParams.push(status);
  }
  
  const { count } = db.prepare(countQuery).get(...countParams);
  
  return {
    agents: agents.map(a => ({
      ...a,
      config: JSON.parse(a.config || '{}'),
      personality: a.personality ? JSON.parse(a.personality) : null
    })),
    total: count,
    limit: parseInt(limit),
    offset: parseInt(offset)
  };
}

/**
 * List all agents with filtering
 * @param {Object} filters - Query filters
 * @returns {Promise<Object>} Agents list
 */
async function listAgents(filters = {}) {
  const db = getDb();
  const { project_id, approval_status, status, limit = 50, offset = 0 } = filters;
  
  let query = `
    SELECT a.*, 
           u_register.name as registered_by_name,
           u_approve.name as approved_by_name
    FROM agents a
    LEFT JOIN users u_register ON a.registered_by = u_register.id
    LEFT JOIN users u_approve ON a.approved_by = u_approve.id
    WHERE 1=1
  `;
  const params = [];
  
  if (project_id) {
    query += ' AND a.project_id = ?';
    params.push(project_id);
  }
  
  if (approval_status) {
    query += ' AND a.approval_status = ?';
    params.push(approval_status);
  }
  
  if (status) {
    query += ' AND a.status = ?';
    params.push(status);
  }
  
  query += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));
  
  const agents = db.prepare(query).all(...params);
  
  return {
    agents: agents.map(a => ({
      ...a,
      config: JSON.parse(a.config || '{}'),
      personality: a.personality ? JSON.parse(a.personality) : null
    })),
    count: agents.length
  };
}

/**
 * Get agent by ID
 * @param {string} agentId - Agent ID
 * @returns {Promise<Object>} Agent details
 */
async function getAgentById(agentId) {
  const db = getDb();
  
  const agent = db.prepare(`
    SELECT a.*, 
           u_register.name as registered_by_name,
           u_approve.name as approved_by_name
    FROM agents a
    LEFT JOIN users u_register ON a.registered_by = u_register.id
    LEFT JOIN users u_approve ON a.approved_by = u_approve.id
    WHERE a.id = ?
  `).get(agentId);
  
  if (!agent) {
    throw new Error('Agent not found');
  }
  
  // Get recent messages
  const messages = db.prepare(`
    SELECT * FROM messages 
    WHERE agent_id = ? 
    ORDER BY created_at DESC 
    LIMIT 10
  `).all(agentId);
  
  return {
    ...agent,
    config: JSON.parse(agent.config || '{}'),
    personality: agent.personality ? JSON.parse(agent.personality) : null,
    recent_messages: messages.map(m => ({
      ...m,
      metadata: JSON.parse(m.metadata || '{}')
    }))
  };
}

/**
 * Update agent status
 * @param {string} agentId - Agent ID
 * @param {string} status - New status
 * @returns {Promise<Object>} Updated agent
 */
async function updateAgentStatus(agentId, status) {
  const db = getDb();
  
  const validStatuses = ['idle', 'busy', 'error', 'offline'];
  if (!validStatuses.includes(status)) {
    throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
  }
  
  const now = new Date().toISOString();
  
  db.prepare(`
    UPDATE agents 
    SET status = ?, last_seen = ?
    WHERE id = ?
  `).run(status, now, agentId);
  
  return { id: agentId, status, last_seen: now };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Registration
  registerAgent,
  approveAgent,
  rejectAgent,
  
  // Listing
  listPendingAgents,
  listApprovedAgents,
  listAgents,
  getAgentById,
  
  // Updates
  updateAgentStatus
};
