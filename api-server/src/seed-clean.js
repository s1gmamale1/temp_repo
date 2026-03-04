const { initDatabase, getDb, generateId } = require('./database');

function seedData() {
  console.log('🌱 Seeding database with CLEAN data...\n');
  
  initDatabase();
  const db = getDb();
  
  // Clear ALL existing data
  db.exec('DELETE FROM costs');
  db.exec('DELETE FROM tasks');
  db.exec('DELETE FROM agents');
  db.exec('DELETE FROM projects');
  db.exec('DELETE FROM messages'); // Clear messages too
  
  // Create EXACTLY 3 projects
  const projects = [
    {
      id: 'proj-swarm-001',
      name: 'AI Agent Swarm',
      description: 'Multi-agent orchestration system for autonomous task execution',
      status: 'active',
      owner_id: 'leo@tmnt.tech',
      config: JSON.stringify({ max_agents: 10, auto_scale: true })
    },
    {
      id: 'proj-dash-002',
      name: 'Project Claw Dashboard',
      description: 'Real-time monitoring dashboard for agent operations',
      status: 'active',
      owner_id: 'donnie@tmnt.tech',
      config: JSON.stringify({ theme: 'dark', refresh_rate: 5000 })
    },
    {
      id: 'proj-pipe-003',
      name: 'Data Pipeline',
      description: 'ETL pipeline for processing agent telemetry',
      status: 'active',
      owner_id: 'raph@tmnt.tech',
      config: JSON.stringify({ batch_size: 1000, retries: 3 })
    }
  ];
  
  const insertProject = db.prepare(`
    INSERT INTO projects (id, name, description, status, owner_id, config, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);
  
  projects.forEach(p => {
    insertProject.run(p.id, p.name, p.description, p.status, p.owner_id, p.config);
  });
  
  console.log(`✅ Created ${projects.length} projects`);
  
  // Create EXACTLY 6 agents - TMNT Team + Sigma
  const agents = [
    {
      id: 'agent-leo-001',
      project_id: 'proj-swarm-001',
      name: 'Leonardo',
      role: 'coordinator',
      status: 'busy',
      config: JSON.stringify({ 
        version: '1.0.0', 
        capabilities: ['planning', 'leadership', 'task_delegation'],
        specialty: 'Strategy and coordination'
      }),
      avatar: 'leonardo.png',
      last_seen: new Date().toISOString()
    },
    {
      id: 'agent-donnie-002',
      project_id: 'proj-dash-002',
      name: 'Donatello',
      role: 'worker',
      status: 'busy',
      config: JSON.stringify({ 
        version: '1.0.0', 
        capabilities: ['coding', 'analysis', 'architecture'],
        specialty: 'Technical implementation'
      }),
      avatar: 'donatello.png',
      last_seen: new Date().toISOString()
    },
    {
      id: 'agent-raph-003',
      project_id: 'proj-pipe-003',
      name: 'Raphael',
      role: 'analyzer',
      status: 'busy',
      config: JSON.stringify({ 
        version: '1.0.0', 
        capabilities: ['security', 'devops', 'monitoring'],
        specialty: 'Security and operations'
      }),
      avatar: 'raphael.png',
      last_seen: new Date().toISOString()
    },
    {
      id: 'agent-mikey-004',
      project_id: 'proj-swarm-001',
      name: 'Michelangelo',
      role: 'monitor',
      status: 'idle',
      config: JSON.stringify({ 
        version: '1.0.0', 
        capabilities: ['ui_ux', 'testing', 'feedback'],
        specialty: 'User experience and testing'
      }),
      avatar: 'michelangelo.png',
      last_seen: new Date().toISOString()
    },
    {
      id: 'agent-splinter-005',
      project_id: 'proj-dash-002',
      name: 'Splinter',
      role: 'coordinator',
      status: 'busy',
      config: JSON.stringify({ 
        version: '1.0.0', 
        capabilities: ['mentoring', 'review', 'wisdom'],
        specialty: 'Code review and mentoring'
      }),
      avatar: 'splinter.png',
      last_seen: new Date().toISOString()
    },
    {
      id: 'agent-sigma-006',
      project_id: 'proj-pipe-003',
      name: 'Sigma',
      role: 'worker',
      status: 'busy',
      config: JSON.stringify({ 
        version: '1.0.0', 
        capabilities: ['research', 'documentation', 'integration'],
        specialty: 'Research and documentation'
      }),
      avatar: 'sigma.png',
      last_seen: new Date().toISOString()
    }
  ];
  
  const insertAgent = db.prepare(`
    INSERT INTO agents (id, project_id, name, role, status, config, avatar_url, last_seen, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);
  
  agents.forEach(a => {
    insertAgent.run(a.id, a.project_id, a.name, a.role, a.status, a.config, a.avatar, a.last_seen);
  });
  
  console.log(`✅ Created ${agents.length} agents`);
  console.log('   - Leonardo (Coordinator)');
  console.log('   - Donatello (Worker)');
  console.log('   - Raphael (Analyzer)');
  console.log('   - Michelangelo (Monitor)');
  console.log('   - Splinter (Coordinator)');
  console.log('   - Sigma (Worker)');
  
  // Create minimal tasks for each project
  const tasks = [];
  const taskTitles = [
    'Initialize project structure',
    'Setup monitoring dashboard',
    'Configure CI/CD pipeline'
  ];
  
  projects.forEach((project, idx) => {
    const projectAgents = agents.filter(a => a.project_id === project.id);
    tasks.push({
      id: generateId(),
      project_id: project.id,
      agent_id: projectAgents[0]?.id || agents[0].id,
      title: taskTitles[idx],
      description: `Initial setup task for ${project.name}`,
      status: 'completed',
      priority: 5,
      payload: JSON.stringify({ source: 'seed', auto_created: true }),
      result: JSON.stringify({ output: 'Success', status: 'initialized' }),
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  });
  
  const insertTask = db.prepare(`
    INSERT INTO tasks (id, project_id, agent_id, title, description, status, priority, payload, result, started_at, completed_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  tasks.forEach(t => {
    insertTask.run(t.id, t.project_id, t.agent_id, t.title, t.description, t.status, t.priority, 
      t.payload, t.result, t.started_at, t.completed_at, t.created_at, t.updated_at);
  });
  
  console.log(`✅ Created ${tasks.length} initial tasks`);
  
  // Summary
  console.log('\n📊 CLEAN Database Summary:');
  console.log('   Projects:', projects.length, '(target: 3) ✅');
  console.log('   Agents:', agents.length, '(target: 6) ✅');
  console.log('   Tasks:', tasks.length);
  console.log('   Messages: 0 (clean slate) ✅');
  
  console.log('\n✨ Clean seed complete! Database is now pristine.');
  
  db.close();
}

try {
  seedData();
} catch (err) {
  console.error('Seed error:', err);
  process.exit(1);
}
