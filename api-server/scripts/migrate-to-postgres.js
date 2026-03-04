#!/usr/bin/env node
/**
 * Database Migration Tool
 * PROJECT-CLAW API Server
 * 
 * Supports: SQLite → PostgreSQL migration
 * Usage: npm run migrate:pg
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { Client } = require('pg');

// ANSI colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// PostgreSQL schema creation SQL
const POSTGRES_SCHEMA = `
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Projects table
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

-- Agents table
CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(100) NOT NULL,
  status VARCHAR(20) DEFAULT 'idle' CHECK (status IN ('idle', 'busy', 'error', 'offline')),
  config JSONB DEFAULT '{}',
  last_seen TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agents_project ON agents(project_id);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);

-- Tasks table
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

-- Costs table
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
CREATE INDEX IF NOT EXISTS idx_costs_task ON costs(task_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tasks_updated_at ON tasks;
CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
`;

async function migrateSqliteToPostgres() {
  log('🐢 PROJECT-CLAW Database Migration Tool', 'cyan');
  log('========================================\n', 'cyan');
  
  // Configuration
  const sqlitePath = process.env.SQLITE_PATH || path.join(__dirname, '../data/project-claw.db');
  const pgUrl = process.env.DATABASE_URL;
  
  if (!pgUrl) {
    log('❌ Error: DATABASE_URL environment variable is not set', 'red');
    log('\nPlease set your PostgreSQL connection URL:', 'yellow');
    log('  export DATABASE_URL="postgresql://user:password@host:port/database"\n', 'yellow');
    process.exit(1);
  }
  
  if (!fs.existsSync(sqlitePath)) {
    log(`❌ Error: SQLite database not found at ${sqlitePath}`, 'red');
    process.exit(1);
  }
  
  log(`📁 SQLite Source: ${sqlitePath}`, 'blue');
  log(`🐘 PostgreSQL Target: ${pgUrl.replace(/:.*@/, ':****@')}\n`, 'blue');
  
  // Connect to databases
  let sqlite, pg;
  
  try {
    log('🔌 Connecting to SQLite...', 'yellow');
    sqlite = new Database(sqlitePath);
    log('✅ Connected to SQLite\n', 'green');
    
    log('🔌 Connecting to PostgreSQL...', 'yellow');
    pg = new Client({ connectionString: pgUrl, ssl: { rejectUnauthorized: false } });
    await pg.connect();
    log('✅ Connected to PostgreSQL\n', 'green');
  } catch (err) {
    log(`❌ Connection error: ${err.message}`, 'red');
    process.exit(1);
  }
  
  // Create PostgreSQL schema
  try {
    log('🏗️  Creating PostgreSQL schema...', 'yellow');
    await pg.query(POSTGRES_SCHEMA);
    log('✅ Schema created\n', 'green');
  } catch (err) {
    log(`❌ Schema error: ${err.message}`, 'red');
    process.exit(1);
  }
  
  // Migration statistics
  const stats = {
    projects: 0,
    agents: 0,
    tasks: 0,
    costs: 0
  };
  
  // Migrate projects
  try {
    log('📦 Migrating projects...', 'yellow');
    const projects = sqlite.prepare('SELECT * FROM projects').all();
    
    for (const project of projects) {
      await pg.query(`
        INSERT INTO projects (id, name, description, status, owner_id, config, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          status = EXCLUDED.status,
          owner_id = EXCLUDED.owner_id,
          config = EXCLUDED.config,
          updated_at = EXCLUDED.updated_at
      `, [
        project.id,
        project.name,
        project.description,
        project.status,
        project.owner_id,
        project.config || '{}',
        project.created_at,
        project.updated_at
      ]);
      stats.projects++;
    }
    log(`✅ Migrated ${stats.projects} projects\n`, 'green');
  } catch (err) {
    log(`❌ Projects migration error: ${err.message}`, 'red');
  }
  
  // Migrate agents
  try {
    log('🤖 Migrating agents...', 'yellow');
    const agents = sqlite.prepare('SELECT * FROM agents').all();
    
    for (const agent of agents) {
      await pg.query(`
        INSERT INTO agents (id, project_id, name, role, status, config, last_seen, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO UPDATE SET
          project_id = EXCLUDED.project_id,
          name = EXCLUDED.name,
          role = EXCLUDED.role,
          status = EXCLUDED.status,
          config = EXCLUDED.config,
          last_seen = EXCLUDED.last_seen
      `, [
        agent.id,
        agent.project_id,
        agent.name,
        agent.role,
        agent.status,
        agent.config || '{}',
        agent.last_seen,
        agent.created_at
      ]);
      stats.agents++;
    }
    log(`✅ Migrated ${stats.agents} agents\n`, 'green');
  } catch (err) {
    log(`❌ Agents migration error: ${err.message}`, 'red');
  }
  
  // Migrate tasks
  try {
    log('📋 Migrating tasks...', 'yellow');
    const tasks = sqlite.prepare('SELECT * FROM tasks').all();
    
    for (const task of tasks) {
      await pg.query(`
        INSERT INTO tasks (id, project_id, agent_id, title, description, status, priority, payload, result, started_at, completed_at, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (id) DO UPDATE SET
          project_id = EXCLUDED.project_id,
          agent_id = EXCLUDED.agent_id,
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          status = EXCLUDED.status,
          priority = EXCLUDED.priority,
          payload = EXCLUDED.payload,
          result = EXCLUDED.result,
          started_at = EXCLUDED.started_at,
          completed_at = EXCLUDED.completed_at
      `, [
        task.id,
        task.project_id,
        task.agent_id,
        task.title,
        task.description,
        task.status,
        task.priority,
        task.payload || '{}',
        task.result || null,
        task.started_at,
        task.completed_at,
        task.created_at,
        task.updated_at
      ]);
      stats.tasks++;
    }
    log(`✅ Migrated ${stats.tasks} tasks\n`, 'green');
  } catch (err) {
    log(`❌ Tasks migration error: ${err.message}`, 'red');
  }
  
  // Migrate costs
  try {
    log('💰 Migrating costs...', 'yellow');
    const costs = sqlite.prepare('SELECT * FROM costs').all();
    
    for (const cost of costs) {
      await pg.query(`
        INSERT INTO costs (id, project_id, task_id, agent_id, model, prompt_tokens, completion_tokens, total_tokens, cost_usd, recorded_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO UPDATE SET
          project_id = EXCLUDED.project_id,
          task_id = EXCLUDED.task_id,
          agent_id = EXCLUDED.agent_id,
          model = EXCLUDED.model,
          prompt_tokens = EXCLUDED.prompt_tokens,
          completion_tokens = EXCLUDED.completion_tokens,
          total_tokens = EXCLUDED.total_tokens,
          cost_usd = EXCLUDED.cost_usd
      `, [
        cost.id,
        cost.project_id,
        cost.task_id,
        cost.agent_id,
        cost.model,
        cost.prompt_tokens || 0,
        cost.completion_tokens || 0,
        cost.total_tokens || 0,
        cost.cost_usd || 0,
        cost.recorded_at
      ]);
      stats.costs++;
    }
    log(`✅ Migrated ${stats.costs} costs\n`, 'green');
  } catch (err) {
    log(`❌ Costs migration error: ${err.message}`, 'red');
  }
  
  // Close connections
  sqlite.close();
  await pg.end();
  
  // Summary
  log('\n========================================', 'cyan');
  log('🎉 Migration Complete!', 'cyan');
  log('========================================', 'cyan');
  log(`📊 Total records migrated:`, 'green');
  log(`   Projects: ${stats.projects}`, 'green');
  log(`   Agents: ${stats.agents}`, 'green');
  log(`   Tasks: ${stats.tasks}`, 'green');
  log(`   Costs: ${stats.costs}`, 'green');
  log('\n📝 Next steps:', 'yellow');
  log('   1. Update .env: DB_TYPE=postgresql', 'yellow');
  log('   2. Set DATABASE_URL in production', 'yellow');
  log('   3. Restart the server\n', 'yellow');
}

// Run migration
migrateSqliteToPostgres().catch(err => {
  log(`❌ Fatal error: ${err.message}`, 'red');
  process.exit(1);
});
