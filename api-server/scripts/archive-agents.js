const Database = require('better-sqlite3');

const db = new Database('./data/project-claw.db');
const keep = new Set(['@testagent2', '@pmatlas']);

const rows = db.prepare('SELECT id, handle FROM manager_agents').all();
let archived = 0;
for (const row of rows) {
  if (keep.has(row.handle)) continue;
  const r = db.prepare("UPDATE manager_agents SET status='offline', is_approved=0, project_id=NULL, updated_at=datetime('now') WHERE id=?").run(row.id);
  archived += r.changes;
}

const current = db.prepare('SELECT handle,status,is_approved,agent_type,project_id FROM manager_agents ORDER BY created_at DESC').all();
console.log(`Archived ${archived} agents.`);
console.log(JSON.stringify(current, null, 2));
