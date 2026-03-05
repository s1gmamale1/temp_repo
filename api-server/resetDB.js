/**
 * resetDB.js — Wipes all operational data, keeps admin user.
 * Uses raw SQLite directly — no initDatabase() call so no seed re-runs.
 */
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'data/project-claw.db');
console.log('🗑️  Resetting:', dbPath, '\n');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = OFF');  // disable FK checks so order doesn't matter

const tables = [
    'agent_notifications',
    'notifications',
    'task_comments',
    'task_assignment_history',
    'costs',
    'cost_records',
    'openrouter_sync',
    'typing_indicators',
    'messages',
    'channel_members',
    'channels',
    'dm_channels',
    'machine_agents',
    'machines',
    'agent_projects',
    'tasks',
    'budgets',
    'manager_agents',
    'agents',
    'projects',
    'auth_tokens',
    'user_sessions',
];

for (const t of tables) {
    try {
        const r = db.prepare(`DELETE FROM ${t}`).run();
        if (r.changes > 0) console.log(`  ✓ ${t}: removed ${r.changes} rows`);
    } catch {
        // table doesn't exist in this schema — skip
    }
}

// Keep only the admin user
const del = db.prepare(`DELETE FROM users WHERE id != 'user-scorpion-001'`).run();
if (del.changes > 0) console.log(`  ✓ users: removed ${del.changes} non-admin row(s)`);

db.pragma('foreign_keys = ON');

const admin = db.prepare(`SELECT id, name, login, role FROM users WHERE id = 'user-scorpion-001'`).get();
if (admin) {
    console.log(`\n✅ Admin preserved: ${admin.name} (${admin.login}) [${admin.role}]`);
} else {
    console.log(`\n⚠️  Admin not found — server will recreate on next start`);
}

db.close();
console.log('\n✅ Done. All agents, DMs, tasks and projects wiped.\n');