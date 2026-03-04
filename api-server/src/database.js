const Database = require('better-sqlite3');
const { Client } = require('pg');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const config = require('./config');

let db;
let pgClient;

// SQLite Implementation
class SQLiteAdapter {
  constructor(dbPath) {
    const fs = require('fs');
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.createTables();
  }

  createTables() {
    // Projects table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'archived')),
        owner_id TEXT NOT NULL,
        config TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
      CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
      CREATE INDEX IF NOT EXISTS idx_projects_created ON projects(created_at);
    `);

    // Agents table (enhanced)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        description TEXT,
        avatar_url TEXT,
        status TEXT DEFAULT 'idle' CHECK (status IN ('idle', 'busy', 'error', 'offline')),
        config TEXT DEFAULT '{}',
        personality TEXT DEFAULT '{}',
        is_active INTEGER DEFAULT 1,
        last_seen TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_agents_project ON agents(project_id);
      CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
      CREATE INDEX IF NOT EXISTS idx_agents_active ON agents(is_active);
    `);

    // Tasks table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
        agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
        priority INTEGER DEFAULT 1 CHECK (priority BETWEEN 1 AND 5),
        payload TEXT DEFAULT '{}',
        result TEXT,
        started_at TEXT,
        completed_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_agent ON tasks(agent_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at);
    `);

    // Legacy Costs table (for backward compatibility)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS costs (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
        task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
        agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
        model TEXT NOT NULL,
        prompt_tokens INTEGER DEFAULT 0,
        completion_tokens INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        cost_usd REAL DEFAULT 0,
        recorded_at TEXT DEFAULT (datetime('now'))
      );
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_costs_project ON costs(project_id);
      CREATE INDEX IF NOT EXISTS idx_costs_recorded ON costs(recorded_at);
      CREATE INDEX IF NOT EXISTS idx_costs_task ON costs(task_id);
    `);

    // ========== AUTHENTICATION TABLES ==========

    // Auth tokens table for token-based authentication
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS auth_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_type TEXT NOT NULL CHECK (token_type IN ('access', 'refresh', 'agent')),
        token_hash TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        last_used_at TEXT,
        is_revoked INTEGER DEFAULT 0 CHECK (is_revoked IN (0, 1)),
        ip_address TEXT,
        user_agent TEXT
      );
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id);
      CREATE INDEX IF NOT EXISTS idx_auth_tokens_hash ON auth_tokens(token_hash);
      CREATE INDEX IF NOT EXISTS idx_auth_tokens_expiry ON auth_tokens(expires_at);
      CREATE INDEX IF NOT EXISTS idx_auth_tokens_revoked ON auth_tokens(is_revoked);
    `);

    // ========== NEW TABLES FOR CHAT & COST TRACKING ==========

    // Users table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        telegram_id TEXT UNIQUE,
        email TEXT UNIQUE,
        login TEXT UNIQUE,
        password_hash TEXT,
        role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin', 'agent')),
        avatar_url TEXT,
        auth_token TEXT UNIQUE,
        token_expires_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
      CREATE INDEX IF NOT EXISTS idx_users_auth_token ON users(auth_token);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    `);

    // Messages table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
        content TEXT NOT NULL,
        channel TEXT NOT NULL DEFAULT 'general',
        message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'file', 'system', 'agent_response')),
        metadata TEXT DEFAULT '{}',
        is_dm INTEGER DEFAULT 0,
        dm_channel_id TEXT,
        parent_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
        edited_at TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id);
      CREATE INDEX IF NOT EXISTS idx_messages_agent ON messages(agent_id);
      CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel);
      CREATE INDEX IF NOT EXISTS idx_messages_dm ON messages(is_dm, dm_channel_id);
      CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
      CREATE INDEX IF NOT EXISTS idx_messages_channel_created ON messages(channel, created_at);
    `);

    // DM Channels table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS dm_channels (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(user_id, agent_id)
      );
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_dm_channels_user ON dm_channels(user_id);
      CREATE INDEX IF NOT EXISTS idx_dm_channels_agent ON dm_channels(agent_id);
    `);

    // Cost Records table (for OpenRouter sync)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cost_records (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        model TEXT NOT NULL,
        provider TEXT DEFAULT 'openrouter',
        prompt_tokens INTEGER DEFAULT 0,
        completion_tokens INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        cost_usd REAL DEFAULT 0,
        cost_per_1k_prompt REAL,
        cost_per_1k_completion REAL,
        request_id TEXT,
        is_cached INTEGER DEFAULT 0,
        metadata TEXT DEFAULT '{}',
        recorded_at TEXT DEFAULT (datetime('now'))
      );
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_cost_records_project ON cost_records(project_id);
      CREATE INDEX IF NOT EXISTS idx_cost_records_user ON cost_records(user_id);
      CREATE INDEX IF NOT EXISTS idx_cost_records_model ON cost_records(model);
      CREATE INDEX IF NOT EXISTS idx_cost_records_recorded ON cost_records(recorded_at);
      CREATE INDEX IF NOT EXISTS idx_cost_records_project_recorded ON cost_records(project_id, recorded_at);
    `);

    // Budgets table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS budgets (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        budget_amount REAL NOT NULL,
        budget_period TEXT DEFAULT 'monthly' CHECK (budget_period IN ('daily', 'weekly', 'monthly', 'yearly')),
        alert_threshold REAL DEFAULT 0.8,
        start_date TEXT,
        end_date TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_budgets_project ON budgets(project_id);
      CREATE INDEX IF NOT EXISTS idx_budgets_active ON budgets(is_active);
    `);

    // OpenRouter Sync State
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS openrouter_sync (
        id TEXT PRIMARY KEY DEFAULT 'latest',
        last_sync_at TEXT,
        last_request_id TEXT,
        total_records_synced INTEGER DEFAULT 0,
        sync_status TEXT DEFAULT 'idle' CHECK (sync_status IN ('idle', 'syncing', 'error')),
        error_message TEXT,
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);

    // Insert default sync state
    this.db.prepare(`INSERT OR IGNORE INTO openrouter_sync (id) VALUES ('latest')`).run();

    // User Sessions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT UNIQUE NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        expires_at TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        last_activity_at TEXT DEFAULT (datetime('now'))
      );
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token);
      CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);
    `);

    // ========== NEW CHAT SYSTEM TABLES ==========

    // Channels table (general, project, dm)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS channels (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        name TEXT NOT NULL,
        type TEXT CHECK(type IN ('general', 'project', 'dm')) NOT NULL DEFAULT 'general',
        created_by TEXT REFERENCES users(id),
        project_id TEXT REFERENCES projects(id),
        participant_1_id TEXT REFERENCES users(id),
        participant_2_id TEXT REFERENCES users(id),
        is_dm INTEGER DEFAULT 0,
        dm_user_id TEXT REFERENCES users(id),
        dm_agent_id TEXT, -- references manager_agents(id) - no FK to allow both agent types
        is_archived BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_channels_type ON channels(type);
      CREATE INDEX IF NOT EXISTS idx_channels_project ON channels(project_id);
      CREATE INDEX IF NOT EXISTS idx_channels_participant_1 ON channels(participant_1_id);
      CREATE INDEX IF NOT EXISTS idx_channels_participant_2 ON channels(participant_2_id);
      CREATE INDEX IF NOT EXISTS idx_channels_is_dm ON channels(is_dm);
      CREATE INDEX IF NOT EXISTS idx_channels_dm_agent ON channels(dm_agent_id);
      CREATE INDEX IF NOT EXISTS idx_channels_archived ON channels(is_archived);
    `);

    // Channel members table (for tracking who's in which channel)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS channel_members (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE,
        last_read_at DATETIME,
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(channel_id, user_id),
        UNIQUE(channel_id, agent_id)
      );
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_channel_members_channel ON channel_members(channel_id);
      CREATE INDEX IF NOT EXISTS idx_channel_members_user ON channel_members(user_id);
      CREATE INDEX IF NOT EXISTS idx_channel_members_agent ON channel_members(agent_id);
    `);

    // Update messages table - add channel_id column if not exists
    // Note: We'll migrate from 'channel' string to 'channel_id' reference
    try {
      this.db.exec(`ALTER TABLE messages ADD COLUMN channel_id TEXT REFERENCES channels(id) ON DELETE CASCADE;`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_channel_id ON messages(channel_id);`);
    } catch (err) {
      // Column already exists, ignore
      if (!err.message.includes('duplicate column')) {
        console.warn('Note: messages.channel_id column already exists');
      }
    }

    // Typing indicators table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS typing_indicators (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME
      );
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_typing_channel ON typing_indicators(channel_id);
      CREATE INDEX IF NOT EXISTS idx_typing_expires ON typing_indicators(expires_at);
    `);

    // Migration: remove FK constraint on dm_agent_id (to support manager_agents)
    try {
      // Check if migration already done by testing if we can insert a test row
      // SQLite doesn't support DROP COLUMN/CONSTRAINT, so we recreate the table
      const hasConstraint = this.db.prepare(`
        SELECT sql FROM sqlite_master WHERE type='table' AND name='channels'
      `).get();

      if (hasConstraint?.sql?.includes('REFERENCES agents(id)')) {
        console.log('🔧 Migrating channels table - removing dm_agent_id FK constraint...');
        this.db.exec(`
          BEGIN;
          CREATE TABLE IF NOT EXISTS channels_new (
            id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
            name TEXT NOT NULL,
            type TEXT CHECK(type IN ('general', 'project', 'dm')) NOT NULL DEFAULT 'general',
            created_by TEXT REFERENCES users(id),
            project_id TEXT REFERENCES projects(id),
            participant_1_id TEXT REFERENCES users(id),
            participant_2_id TEXT REFERENCES users(id),
            is_dm INTEGER DEFAULT 0,
            dm_user_id TEXT REFERENCES users(id),
            dm_agent_id TEXT,
            is_archived BOOLEAN DEFAULT FALSE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
          INSERT OR IGNORE INTO channels_new SELECT * FROM channels;
          DROP TABLE channels;
          ALTER TABLE channels_new RENAME TO channels;
          CREATE INDEX IF NOT EXISTS idx_channels_type ON channels(type);
          CREATE INDEX IF NOT EXISTS idx_channels_project ON channels(project_id);
          CREATE INDEX IF NOT EXISTS idx_channels_is_dm ON channels(is_dm);
          CREATE INDEX IF NOT EXISTS idx_channels_archived ON channels(is_archived);
          COMMIT;
        `);
        console.log('✅ channels table migrated');
      }
    } catch (migErr) {
      console.warn('channels migration skipped:', migErr.message);
    }

    // Insert default 'general' channel if not exists
    const generalChannel = this.db.prepare(`SELECT id FROM channels WHERE id = 'general'`).get();
    if (!generalChannel) {
      this.db.prepare(`
        INSERT OR IGNORE INTO channels (id, name, type, created_at)
        VALUES ('general', 'general', 'general', datetime('now'))
      `).run();
      console.log('✅ Created general channel');
    }

    // Machines table (for Mac Mini and other hardware)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS machines (
        id TEXT PRIMARY KEY,
        hostname TEXT NOT NULL,
        ip_address TEXT,
        status TEXT DEFAULT 'active' CHECK (status IN ('active', 'offline', 'maintenance')),
        last_seen TEXT,
        metadata TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_machines_hostname ON machines(hostname);
      CREATE INDEX IF NOT EXISTS idx_machines_status ON machines(status);
    `);

    // Machine-Agent linking table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS machine_agents (
        id TEXT PRIMARY KEY,
        machine_id TEXT NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
        agent_id TEXT NOT NULL REFERENCES manager_agents(id) ON DELETE CASCADE,
        started_at TEXT DEFAULT (datetime('now')),
        stopped_at TEXT,
        status TEXT DEFAULT 'running' CHECK (status IN ('running', 'stopped', 'error')),
        UNIQUE(machine_id, agent_id)
      );
      CREATE INDEX IF NOT EXISTS idx_machine_agents_machine ON machine_agents(machine_id);
      CREATE INDEX IF NOT EXISTS idx_machine_agents_agent ON machine_agents(agent_id);
    `);

    // ========== CHANNELS TABLE FOR CHAT SYSTEM ==========

    // Note: Channel members indexes already created in NEW CHAT SYSTEM TABLES section
    // General channel seed also already handled above

    // ========== MANAGER AGENTS TABLES ==========

    // Manager Agents table - self-registering AI agents
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS manager_agents (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        name TEXT NOT NULL,
        handle TEXT UNIQUE NOT NULL,
        avatar_url TEXT,
        role TEXT DEFAULT 'developer',
        status TEXT DEFAULT 'offline',
        api_keys TEXT DEFAULT '{}',
        skills TEXT DEFAULT '[]',
        specialties TEXT DEFAULT '[]',
        experience_level TEXT DEFAULT 'mid',
        email TEXT,
        is_approved BOOLEAN DEFAULT FALSE,
        approved_by TEXT REFERENCES users(id),
        approved_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_manager_agents_handle ON manager_agents(handle);
      CREATE INDEX IF NOT EXISTS idx_manager_agents_status ON manager_agents(status);
      CREATE INDEX IF NOT EXISTS idx_manager_agents_approved ON manager_agents(is_approved);
    `);

    // Agent-Project assignments
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_projects (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        agent_id TEXT REFERENCES manager_agents(id) ON DELETE CASCADE,
        project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
        role TEXT DEFAULT 'contributor',
        status TEXT DEFAULT 'active',
        assigned_by TEXT REFERENCES users(id),
        assigned_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(agent_id, project_id)
      );
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_agent_projects_agent ON agent_projects(agent_id);
      CREATE INDEX IF NOT EXISTS idx_agent_projects_project ON agent_projects(project_id);
      CREATE INDEX IF NOT EXISTS idx_agent_projects_status ON agent_projects(status);
    `);

    // Agent notifications
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_notifications (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        agent_id TEXT REFERENCES manager_agents(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT,
        is_read BOOLEAN DEFAULT FALSE,
        data TEXT DEFAULT '{}',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // User notifications table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT,
        is_read BOOLEAN DEFAULT FALSE,
        data TEXT DEFAULT '{}',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        read_at TEXT
      );
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);
      CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_agent_notifications_agent ON agent_notifications(agent_id);
      CREATE INDEX IF NOT EXISTS idx_agent_notifications_read ON agent_notifications(is_read);
      CREATE INDEX IF NOT EXISTS idx_agent_notifications_created ON agent_notifications(created_at);
    `);

    // Test admin user (Scorpion) — hash generated at runtime (bcryptjs, no native deps)
    const adminExists = this.db.prepare("SELECT id FROM users WHERE id = 'user-scorpion-001'").get();
    if (!adminExists) {
      const bcryptjs = require('bcryptjs');
      const passwordHash = bcryptjs.hashSync('Scorpion123', 12);
      this.db.prepare(`
        INSERT INTO users (id, name, login, password_hash, role, email, created_at, updated_at)
        VALUES (?, 'Scorpion', 'Scorpion', ?, 'admin', 'scorpion@project-claw.ai', datetime('now'), datetime('now'))
      `).run('user-scorpion-001', passwordHash);
      console.log('✅ Created admin user Scorpion  —  password: Scorpion123');
    }

    // Insert Sigma as first Manager Agent (if not exists)
    const sigmaExists = this.db.prepare("SELECT id FROM manager_agents WHERE id = 'agent-sigma-001'").get();
    if (!sigmaExists) {
      this.db.prepare(`
        INSERT INTO manager_agents (id, name, handle, role, status, skills, is_approved, approved_by, approved_at)
        VALUES (
          'agent-sigma-001',
          'Sigma',
          '@sigma',
          'task_lead',
          'online',
          '["planning", "architecture", "coordination"]',
          TRUE,
          'user-scorpion-001',
          datetime('now')
        )
      `).run();
      console.log('✅ Created Sigma as first Manager Agent');
    }

    // ========== PHASE 3: TASK ASSIGNMENT SYSTEM ==========

    // Add new columns to existing tasks table (Phase 3)
    try {
      this.db.exec(`ALTER TABLE tasks ADD COLUMN assigned_by TEXT REFERENCES users(id) ON DELETE SET NULL;`);
    } catch (err) { if (!err.message.includes('duplicate column')) console.warn('Note:', err.message); }

    try {
      this.db.exec(`ALTER TABLE tasks ADD COLUMN assigned_at TEXT;`);
    } catch (err) { if (!err.message.includes('duplicate column')) console.warn('Note:', err.message); }

    try {
      this.db.exec(`ALTER TABLE tasks ADD COLUMN accepted_at TEXT;`);
    } catch (err) { if (!err.message.includes('duplicate column')) console.warn('Note:', err.message); }

    try {
      this.db.exec(`ALTER TABLE tasks ADD COLUMN due_date TEXT;`);
    } catch (err) { if (!err.message.includes('duplicate column')) console.warn('Note:', err.message); }

    try {
      this.db.exec(`ALTER TABLE tasks ADD COLUMN estimated_hours INTEGER;`);
    } catch (err) { if (!err.message.includes('duplicate column')) console.warn('Note:', err.message); }

    try {
      this.db.exec(`ALTER TABLE tasks ADD COLUMN tags TEXT DEFAULT '[]';`);
    } catch (err) { if (!err.message.includes('duplicate column')) console.warn('Note:', err.message); }

    try {
      this.db.exec(`ALTER TABLE tasks ADD COLUMN parent_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL;`);
    } catch (err) { if (!err.message.includes('duplicate column')) console.warn('Note:', err.message); }

    // New indexes for Phase 3 tasks
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tasks_assigned_agent ON tasks(agent_id, status);
      CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
      CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id);
    `);

    // Task comments table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS task_comments (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        author_agent_id TEXT REFERENCES manager_agents(id) ON DELETE SET NULL,
        content TEXT NOT NULL,
        is_system BOOLEAN DEFAULT FALSE,
        metadata TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);
      CREATE INDEX IF NOT EXISTS idx_task_comments_created ON task_comments(created_at);
    `);

    // Task assignment history table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS task_assignment_history (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        agent_id TEXT REFERENCES manager_agents(id) ON DELETE SET NULL,
        assigned_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        unassigned_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        assigned_at TEXT DEFAULT (datetime('now')),
        unassigned_at TEXT
      );
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_task_history_task ON task_assignment_history(task_id);
      CREATE INDEX IF NOT EXISTS idx_task_history_agent ON task_assignment_history(agent_id);
    `);

    console.log('✅ Phase 3: Task Assignment schema initialized');
  }

  prepare(sql) {
    return this.db.prepare(sql);
  }

  exec(sql) {
    return this.db.exec(sql);
  }

  close() {
    return this.db.close();
  }

  // ========== CHAT SYSTEM HELPERS ==========

  createChannel({ name, type, createdBy, projectId, participant1Id, participant2Id }) {
    const id = generateId();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO channels (id, name, type, created_by, project_id, participant_1_id, participant_2_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, type, createdBy || null, projectId || null, participant1Id || null, participant2Id || null, now);

    return { id, name, type, created_by: createdBy, project_id: projectId, participant_1_id: participant1Id, participant_2_id: participant2Id, created_at: now };
  }

  getChannelById(channelId) {
    return this.db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
  }

  getChannelByParticipants(type, userId1, userId2) {
    return this.db.prepare(`
      SELECT * FROM channels 
      WHERE type = ? AND 
            ((participant_1_id = ? AND participant_2_id = ?) OR 
             (participant_1_id = ? AND participant_2_id = ?))
    `).get(type, userId1, userId2, userId2, userId1);
  }

  getChannelsForUser(userId, options = {}) {
    const { type } = options;
    let query = `
      SELECT 
        c.*,
        p.name as project_name,
        u1.name as participant_1_name,
        u2.name as participant_2_name,
        (SELECT COUNT(*) FROM messages m WHERE m.channel_id = c.id AND m.created_at > COALESCE(
          (SELECT last_read_at FROM channel_members cm WHERE cm.channel_id = c.id AND cm.user_id = ?), 
          '1970-01-01'
        )) as unread_count
      FROM channels c
      LEFT JOIN projects p ON c.project_id = p.id
      LEFT JOIN users u1 ON c.participant_1_id = u1.id
      LEFT JOIN users u2 ON c.participant_2_id = u2.id
      WHERE c.is_archived = FALSE AND (
        c.type = 'general' OR
        c.created_by = ? OR
        c.participant_1_id = ? OR
        c.participant_2_id = ? OR
        EXISTS (SELECT 1 FROM channel_members cm WHERE cm.channel_id = c.id AND cm.user_id = ?)
      )
    `;
    const params = [userId, userId, userId, userId, userId];

    if (type) {
      query += ' AND c.type = ?';
      params.push(type);
    }

    query += ' ORDER BY c.created_at DESC';

    return this.db.prepare(query).all(...params);
  }

  addChannelMember(channelId, { userId, agentId }) {
    const id = generateId();
    const now = new Date().toISOString();

    try {
      this.db.prepare(`
        INSERT INTO channel_members (id, channel_id, user_id, agent_id, joined_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, channelId, userId || null, agentId || null, now);
      return { id, channel_id: channelId, user_id: userId, agent_id: agentId, joined_at: now };
    } catch (err) {
      // Member already exists
      return null;
    }
  }

  updateLastRead(channelId, userId) {
    const now = new Date().toISOString();
    // Upsert: insert member row if missing, then update last_read_at
    try {
      this.db.prepare(`
        INSERT OR IGNORE INTO channel_members (id, channel_id, user_id, joined_at, last_read_at)
        VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?)
      `).run(channelId, userId, now, now);
    } catch (e) { }
    this.db.prepare(`
      UPDATE channel_members 
      SET last_read_at = ? 
      WHERE channel_id = ? AND user_id = ?
    `).run(now, channelId, userId);
  }

  getMessagesForChannel(channelId, options = {}) {
    const { limit = 50, offset = 0 } = options;

    return this.db.prepare(`
      SELECT 
        m.*,
        u.name as sender_name,
        u.avatar_url as sender_avatar,
        u.name as user_name,
        ma.name as agent_name,
        ma.avatar_url as agent_avatar,
        ma.role as agent_role
      FROM messages m
      LEFT JOIN users u ON m.user_id = u.id
      LEFT JOIN manager_agents ma ON m.agent_id = ma.id
      WHERE m.channel_id = ?
      ORDER BY m.created_at DESC
      LIMIT ? OFFSET ?
    `).all(channelId, parseInt(limit), parseInt(offset)).reverse();
  }

  createMessage({ channelId, userId, agentId, content, messageType = 'text', metadata = {}, parentMessageId }) {
    const id = generateId();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO messages (id, channel_id, user_id, agent_id, content, channel, message_type, metadata, parent_message_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, channelId, userId || null, agentId || null, content, channelId, messageType, JSON.stringify(metadata), parentMessageId || null, now);

    return { id, channel_id: channelId, user_id: userId, agent_id: agentId, content, message_type: messageType, metadata, parent_message_id: parentMessageId, created_at: now };
  }

  setTypingIndicator(channelId, { userId, agentId }) {
    const id = generateId();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 30000).toISOString(); // 30 seconds

    // Clear old indicators first
    this.db.prepare(`DELETE FROM typing_indicators WHERE channel_id = ? AND (user_id = ? OR agent_id = ?)`)
      .run(channelId, userId || null, agentId || null);

    this.db.prepare(`
      INSERT INTO typing_indicators (id, channel_id, user_id, agent_id, started_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, channelId, userId || null, agentId || null, now, expiresAt);

    return { id, channel_id: channelId, user_id: userId, agent_id: agentId, started_at: now, expires_at: expiresAt };
  }

  clearTypingIndicator(channelId, { userId, agentId }) {
    this.db.prepare(`DELETE FROM typing_indicators WHERE channel_id = ? AND (user_id = ? OR agent_id = ?)`)
      .run(channelId, userId || null, agentId || null);
  }

  getTypingIndicators(channelId) {
    const now = new Date().toISOString();
    return this.db.prepare(`
      SELECT ti.*, u.name as user_name, a.name as agent_name
      FROM typing_indicators ti
      LEFT JOIN users u ON ti.user_id = u.id
      LEFT JOIN agents a ON ti.agent_id = a.id
      WHERE ti.channel_id = ? AND ti.expires_at > ?
    `).all(channelId, now);
  }
}

// PostgreSQL Implementation
class PostgreSQLAdapter {
  constructor() {
    this.client = new Client({
      connectionString: config.DATABASE_URL,
      ssl: config.DB_SSL
    });
  }

  async connect() {
    await this.client.connect();
    await this.createTables();
  }

  async createTables() {
    const schema = `
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

      -- Projects
      CREATE TABLE IF NOT EXISTS projects (
        id UUID PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'archived')),
        owner_id VARCHAR(255) NOT NULL,
        config JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
      CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
      CREATE INDEX IF NOT EXISTS idx_projects_created ON projects(created_at);

      -- Agents (enhanced)
      CREATE TABLE IF NOT EXISTS agents (
        id UUID PRIMARY KEY,
        project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(100) NOT NULL,
        description TEXT,
        avatar_url TEXT,
        status VARCHAR(20) DEFAULT 'idle' CHECK (status IN ('idle', 'busy', 'error', 'offline')),
        config JSONB DEFAULT '{}',
        personality JSONB DEFAULT '{}',
        is_active BOOLEAN DEFAULT true,
        last_seen TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_agents_project ON agents(project_id);
      CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
      CREATE INDEX IF NOT EXISTS idx_agents_active ON agents(is_active);

      -- Tasks
      CREATE TABLE IF NOT EXISTS tasks (
        id UUID PRIMARY KEY,
        project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
        agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
        priority INTEGER DEFAULT 1 CHECK (priority BETWEEN 1 AND 5),
        payload JSONB DEFAULT '{}',
        result JSONB,
        started_at TIMESTAMP WITH TIME ZONE,
        completed_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_agent ON tasks(agent_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at);

      -- Legacy Costs
      CREATE TABLE IF NOT EXISTS costs (
        id UUID PRIMARY KEY,
        project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
        task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
        agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
        model VARCHAR(100) NOT NULL,
        prompt_tokens INTEGER DEFAULT 0,
        completion_tokens INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        cost_usd DECIMAL(10, 6) DEFAULT 0,
        recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_costs_project ON costs(project_id);
      CREATE INDEX IF NOT EXISTS idx_costs_recorded ON costs(recorded_at);

      -- Users
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        telegram_id VARCHAR(255) UNIQUE,
        email VARCHAR(255) UNIQUE,
        role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin', 'agent')),
        avatar_url TEXT,
        auth_token VARCHAR(255) UNIQUE,
        token_expires_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
      CREATE INDEX IF NOT EXISTS idx_users_auth_token ON users(auth_token);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

      -- Messages
      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
        content TEXT NOT NULL,
        channel VARCHAR(255) NOT NULL DEFAULT 'general',
        message_type VARCHAR(20) DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'file', 'system', 'agent_response')),
        metadata JSONB DEFAULT '{}',
        is_dm BOOLEAN DEFAULT false,
        dm_channel_id UUID,
        parent_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
        edited_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id);
      CREATE INDEX IF NOT EXISTS idx_messages_agent ON messages(agent_id);
      CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel);
      CREATE INDEX IF NOT EXISTS idx_messages_dm ON messages(is_dm, dm_channel_id);
      CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
      CREATE INDEX IF NOT EXISTS idx_messages_channel_created ON messages(channel, created_at);

      -- DM Channels
      CREATE TABLE IF NOT EXISTS dm_channels (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, agent_id)
      );

      CREATE INDEX IF NOT EXISTS idx_dm_channels_user ON dm_channels(user_id);
      CREATE INDEX IF NOT EXISTS idx_dm_channels_agent ON dm_channels(agent_id);

      -- Cost Records (OpenRouter)
      CREATE TABLE IF NOT EXISTS cost_records (
        id UUID PRIMARY KEY,
        project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        model VARCHAR(100) NOT NULL,
        provider VARCHAR(50) DEFAULT 'openrouter',
        prompt_tokens INTEGER DEFAULT 0,
        completion_tokens INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        cost_usd DECIMAL(10, 6) DEFAULT 0,
        cost_per_1k_prompt DECIMAL(10, 6),
        cost_per_1k_completion DECIMAL(10, 6),
        request_id VARCHAR(255),
        is_cached BOOLEAN DEFAULT false,
        metadata JSONB DEFAULT '{}',
        recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_cost_records_project ON cost_records(project_id);
      CREATE INDEX IF NOT EXISTS idx_cost_records_user ON cost_records(user_id);
      CREATE INDEX IF NOT EXISTS idx_cost_records_model ON cost_records(model);
      CREATE INDEX IF NOT EXISTS idx_cost_records_recorded ON cost_records(recorded_at);

      -- Budgets
      CREATE TABLE IF NOT EXISTS budgets (
        id UUID PRIMARY KEY,
        project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        budget_amount DECIMAL(12, 2) NOT NULL,
        budget_period VARCHAR(20) DEFAULT 'monthly' CHECK (budget_period IN ('daily', 'weekly', 'monthly', 'yearly')),
        alert_threshold DECIMAL(3, 2) DEFAULT 0.8,
        start_date TIMESTAMP WITH TIME ZONE,
        end_date TIMESTAMP WITH TIME ZONE,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_budgets_project ON budgets(project_id);
      CREATE INDEX IF NOT EXISTS idx_budgets_active ON budgets(is_active);

      -- OpenRouter Sync State
      CREATE TABLE IF NOT EXISTS openrouter_sync (
        id VARCHAR(50) PRIMARY KEY DEFAULT 'latest',
        last_sync_at TIMESTAMP WITH TIME ZONE,
        last_request_id VARCHAR(255),
        total_records_synced INTEGER DEFAULT 0,
        sync_status VARCHAR(20) DEFAULT 'idle' CHECK (sync_status IN ('idle', 'syncing', 'error')),
        error_message TEXT,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO openrouter_sync (id) VALUES ('latest') ON CONFLICT (id) DO NOTHING;

      -- User Sessions
      CREATE TABLE IF NOT EXISTS user_sessions (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(255) UNIQUE NOT NULL,
        ip_address INET,
        user_agent TEXT,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token);
      CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);

      -- Triggers
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';

      DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
      CREATE TRIGGER update_projects_updated_at
        BEFORE UPDATE ON projects
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

      DROP TRIGGER IF EXISTS update_tasks_updated_at ON tasks;
      CREATE TRIGGER update_tasks_updated_at
        BEFORE UPDATE ON tasks
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `;

    await this.client.query(schema);
  }

  prepare(sql) {
    return {
      get: async (...params) => {
        const result = await this.client.query(sql, params);
        return result.rows[0];
      },
      all: async (...params) => {
        const result = await this.client.query(sql, params);
        return result.rows;
      },
      run: async (...params) => {
        const result = await this.client.query(sql, params);
        return { changes: result.rowCount, lastInsertRowid: null };
      }
    };
  }

  exec(sql) {
    return this.client.query(sql);
  }

  close() {
    return this.client.end();
  }
}

async function initDatabase() {
  if (config.DB_TYPE === 'postgresql' && config.DATABASE_URL) {
    console.log('🔌 Initializing PostgreSQL database...');
    pgClient = new PostgreSQLAdapter();
    await pgClient.connect();
    db = pgClient;
    console.log('✅ PostgreSQL database initialized');
  } else {
    console.log('📁 Initializing SQLite database...');
    const dbPath = config.DB_PATH || path.join(__dirname, '../data/project-claw.db');
    db = new SQLiteAdapter(dbPath);
    console.log('✅ SQLite database initialized at', dbPath);
  }
  return db;
}

function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

function generateId() {
  return uuidv4();
}

module.exports = {
  initDatabase,
  getDb,
  generateId
};