-- Migration: Add chat and cost tracking tables
-- Run this with: node scripts/migrate-chat-costs.js

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  telegram_id TEXT UNIQUE,
  email TEXT UNIQUE,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin', 'agent')),
  avatar_url TEXT,
  auth_token TEXT UNIQUE,
  token_expires_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_users_auth_token ON users(auth_token);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ============================================
-- AGENTS TABLE (Enhanced)
-- ============================================
ALTER TABLE agents ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS is_active INTEGER DEFAULT 1;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS personality TEXT DEFAULT '{}';

-- ============================================
-- MESSAGES TABLE
-- ============================================
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

CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_agent ON messages(agent_id);
CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel);
CREATE INDEX IF NOT EXISTS idx_messages_dm ON messages(is_dm, dm_channel_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_channel_created ON messages(channel, created_at);

-- ============================================
-- DM CHANNELS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS dm_channels (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_dm_channels_user ON dm_channels(user_id);
CREATE INDEX IF NOT EXISTS idx_dm_channels_agent ON dm_channels(agent_id);

-- ============================================
-- COST TRACKING ENHANCED
-- ============================================
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

CREATE INDEX IF NOT EXISTS idx_cost_records_project ON cost_records(project_id);
CREATE INDEX IF NOT EXISTS idx_cost_records_user ON cost_records(user_id);
CREATE INDEX IF NOT EXISTS idx_cost_records_model ON cost_records(model);
CREATE INDEX IF NOT EXISTS idx_cost_records_recorded ON cost_records(recorded_at);
CREATE INDEX IF NOT EXISTS idx_cost_records_project_recorded ON cost_records(project_id, recorded_at);

-- ============================================
-- BUDGETS TABLE
-- ============================================
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

CREATE INDEX IF NOT EXISTS idx_budgets_project ON budgets(project_id);
CREATE INDEX IF NOT EXISTS idx_budgets_active ON budgets(is_active);

-- ============================================
-- OPENROUTER SYNC STATE
-- ============================================
CREATE TABLE IF NOT EXISTS openrouter_sync (
  id TEXT PRIMARY KEY DEFAULT 'latest',
  last_sync_at TEXT,
  last_request_id TEXT,
  total_records_synced INTEGER DEFAULT 0,
  sync_status TEXT DEFAULT 'idle' CHECK (sync_status IN ('idle', 'syncing', 'error')),
  error_message TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Insert default sync state
INSERT OR IGNORE INTO openrouter_sync (id) VALUES ('latest');

-- ============================================
-- USER SESSIONS TABLE
-- ============================================
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

CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);
