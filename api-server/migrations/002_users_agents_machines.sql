-- Migration: Users with password hash, Agents with approval flow, and Machines tables

-- ============================================================================
-- UPDATE: Add password_hash to users table
-- ============================================================================
ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN login TEXT UNIQUE;

-- Update existing users with login if not set
UPDATE users SET login = COALESCE(login, email, telegram_id, id) WHERE login IS NULL;

-- ============================================================================
-- UPDATE: Add approval status to agents table
-- ============================================================================
ALTER TABLE agents ADD COLUMN approval_status TEXT DEFAULT 'approved' CHECK (approval_status IN ('pending', 'approved', 'rejected'));
ALTER TABLE agents ADD COLUMN registered_by TEXT;
ALTER TABLE agents ADD COLUMN approved_at TEXT;
ALTER TABLE agents ADD COLUMN approved_by TEXT;

-- ============================================================================
-- CREATE: Machines table for Mac Mini registration
-- ============================================================================
CREATE TABLE IF NOT EXISTS machines (
  id TEXT PRIMARY KEY,
  hostname TEXT NOT NULL,
  ip_address TEXT,
  mac_address TEXT UNIQUE,
  status TEXT DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'busy', 'error')),
  machine_type TEXT DEFAULT 'mac_mini' CHECK (machine_type IN ('mac_mini', 'server', 'vm', 'template')),
  specs TEXT DEFAULT '{}',
  last_seen TEXT,
  registered_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_machines_status ON machines(status);
CREATE INDEX IF NOT EXISTS idx_machines_type ON machines(machine_type);
CREATE INDEX IF NOT EXISTS idx_machines_hostname ON machines(hostname);

-- ============================================================================
-- CREATE: Machine Agents junction table
-- ============================================================================
CREATE TABLE IF NOT EXISTS machine_agents (
  id TEXT PRIMARY KEY,
  machine_id TEXT NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  started_at TEXT DEFAULT (datetime('now')),
  stopped_at TEXT,
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'stopped', 'error')),
  UNIQUE(machine_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_machine_agents_machine ON machine_agents(machine_id);
CREATE INDEX IF NOT EXISTS idx_machine_agents_agent ON machine_agents(agent_id);

-- ============================================================================
-- SEED: Create default users
-- ============================================================================

-- Note: Passwords should be hashed in the application layer
-- These are placeholders - the app will hash them on registration

-- Check if users exist before inserting
INSERT OR IGNORE INTO users (id, name, login, password_hash, role, created_at, updated_at)
VALUES (
  'user-scorpion-admin',
  'Scorpion',
  'Scorpion',
  '$2b$12$Scorpionboy0.HashedPlaceholderForNow',
  'admin',
  datetime('now'),
  datetime('now')
);

INSERT OR IGNORE INTO users (id, name, login, password_hash, role, created_at, updated_at)
VALUES (
  'user-beta-readonly',
  'Beta User',
  'BetaUser',
  '$2b$12$ClassA98.HashedPlaceholderForNow',
  'readonly',
  datetime('now'),
  datetime('now')
);
