-- Migration: phase3_task_assignment.sql
-- Phase 3: Task Assignment System
-- Date: 2026-03-01

-- ============================================================================
-- TASKS TABLE ENHANCEMENTS
-- ============================================================================

-- Add new columns to existing tasks table
ALTER TABLE tasks ADD COLUMN assigned_by TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN assigned_at TEXT;
ALTER TABLE tasks ADD COLUMN accepted_at TEXT;
ALTER TABLE tasks ADD COLUMN due_date TEXT;
ALTER TABLE tasks ADD COLUMN estimated_hours INTEGER;
ALTER TABLE tasks ADD COLUMN tags TEXT DEFAULT '[]'; -- JSON array
ALTER TABLE tasks ADD COLUMN parent_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL;

-- Add task_status column for more granular status tracking
ALTER TABLE tasks ADD COLUMN cancelled_at TEXT;
ALTER TABLE tasks ADD COLUMN cancelled_by TEXT REFERENCES users(id) ON DELETE SET NULL;

-- Create indexes for task assignment queries
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_agent ON tasks(agent_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_by ON tasks(assigned_by);

-- ============================================================================
-- TASK COMMENTS TABLE (NEW)
-- ============================================================================

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

CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_created ON task_comments(created_at);

-- ============================================================================
-- TASK ASSIGNMENT HISTORY TABLE (NEW)
-- ============================================================================

CREATE TABLE IF NOT EXISTS task_assignment_history (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  agent_id TEXT REFERENCES manager_agents(id) ON DELETE SET NULL,
  assigned_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  unassigned_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TEXT DEFAULT (datetime('now')),
  unassigned_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_task_history_task ON task_assignment_history(task_id);
CREATE INDEX IF NOT EXISTS idx_task_history_agent ON task_assignment_history(agent_id);

-- ============================================================================
-- TASK ATTACHMENTS TABLE (NEW - Optional for Phase 3)
-- ============================================================================

CREATE TABLE IF NOT EXISTS task_attachments (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  uploaded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_task_attachments_task ON task_attachments(task_id);

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
