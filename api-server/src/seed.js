const { initDatabase, getDb, generateId } = require('./database');

function seedData() {
  console.log('🌱 Seeding database with mock data...\n');
  
  initDatabase();
  const db = getDb();
  
  // Clear existing data
  db.exec('DELETE FROM costs');
  db.exec('DELETE FROM tasks');
  db.exec('DELETE FROM agents');
  db.exec('DELETE FROM projects');
  
  // Create projects
  const projects = [
    {
      id: generateId(),
      name: 'AI Agent Swarm',
      description: 'Multi-agent orchestration system for autonomous task execution',
      status: 'active',
      owner_id: 'leo@tmnt.tech',
      config: JSON.stringify({ max_agents: 10, auto_scale: true })
    },
    {
      id: generateId(),
      name: 'Project Claw Dashboard',
      description: 'Real-time monitoring dashboard for agent operations',
      status: 'active',
      owner_id: 'donnie@tmnt.tech',
      config: JSON.stringify({ theme: 'dark', refresh_rate: 5000 })
    },
    {
      id: generateId(),
      name: 'Data Pipeline',
      description: 'ETL pipeline for processing agent telemetry',
      status: 'paused',
      owner_id: 'raph@tmnt.tech',
      config: JSON.stringify({ batch_size: 1000, retries: 3 })
    },
    {
      id: generateId(),
      name: 'Model Fine-tuning',
      description: 'Fine-tuning LLMs for specific agent behaviors',
      status: 'completed',
      owner_id: 'mikey@tmnt.tech',
      config: JSON.stringify({ base_model: 'gpt-4', epochs: 3 })
    }
  ];
  
  const insertProject = db.prepare(`
    INSERT INTO projects (id, name, description, status, owner_id, config, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now', '-' || ? || ' days'), datetime('now', '-' || ? || ' days'))
  `);
  
  projects.forEach((p, i) => {
    insertProject.run(p.id, p.name, p.description, p.status, p.owner_id, p.config, i * 7, i * 7);
  });
  
  console.log(`✅ Created ${projects.length} projects`);
  
  // Create agents
  const agents = [];
  const agentRoles = ['coordinator', 'worker', 'analyzer', 'monitor'];
  const agentStatuses = ['idle', 'busy', 'error', 'offline'];
  
  projects.forEach(project => {
    const numAgents = Math.floor(Math.random() * 3) + 2; // 2-4 agents per project
    for (let i = 0; i < numAgents; i++) {
      agents.push({
        id: generateId(),
        project_id: project.id,
        name: `${project.name.split(' ')[0]}-Agent-${i + 1}`,
        role: agentRoles[Math.floor(Math.random() * agentRoles.length)],
        status: agentStatuses[Math.floor(Math.random() * agentStatuses.length)],
        config: JSON.stringify({ version: '1.0.0', capabilities: ['text', 'code'] }),
        last_seen: new Date(Date.now() - Math.random() * 3600000).toISOString()
      });
    }
  });
  
  const insertAgent = db.prepare(`
    INSERT INTO agents (id, project_id, name, role, status, config, last_seen, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);
  
  agents.forEach(a => {
    insertAgent.run(a.id, a.project_id, a.name, a.role, a.status, a.config, a.last_seen);
  });
  
  console.log(`✅ Created ${agents.length} agents`);
  
  // Create tasks
  const tasks = [];
  const taskStatuses = ['pending', 'running', 'completed', 'failed', 'cancelled'];
  const taskTitles = [
    'Process user query',
    'Generate report',
    'Analyze sentiment',
    'Execute code review',
    'Summarize document',
    'Translate content',
    'Extract entities',
    'Classify image',
    'Generate test cases',
    'Optimize query'
  ];
  
  projects.forEach(project => {
    const projectAgents = agents.filter(a => a.project_id === project.id);
    const numTasks = Math.floor(Math.random() * 10) + 5; // 5-14 tasks per project
    
    for (let i = 0; i < numTasks; i++) {
      const status = taskStatuses[Math.floor(Math.random() * taskStatuses.length)];
      const agent = projectAgents[Math.floor(Math.random() * projectAgents.length)];
      const createdAt = new Date(Date.now() - Math.random() * 7 * 24 * 3600000);
      
      tasks.push({
        id: generateId(),
        project_id: project.id,
        agent_id: Math.random() > 0.3 ? agent.id : null, // 70% have an agent assigned
        title: taskTitles[Math.floor(Math.random() * taskTitles.length)],
        description: `Task ${i + 1} for ${project.name}`,
        status,
        priority: Math.floor(Math.random() * 5) + 1,
        payload: JSON.stringify({ source: 'api', user_id: 'user_' + i }),
        result: status === 'completed' ? JSON.stringify({ output: 'Success', tokens: Math.floor(Math.random() * 1000) }) : null,
        started_at: status !== 'pending' ? new Date(createdAt.getTime() + 60000).toISOString() : null,
        completed_at: ['completed', 'failed', 'cancelled'].includes(status) 
          ? new Date(createdAt.getTime() + 300000).toISOString() 
          : null,
        created_at: createdAt.toISOString(),
        updated_at: new Date(createdAt.getTime() + 300000).toISOString()
      });
    }
  });
  
  const insertTask = db.prepare(`
    INSERT INTO tasks (id, project_id, agent_id, title, description, status, priority, payload, result, started_at, completed_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  tasks.forEach(t => {
    insertTask.run(t.id, t.project_id, t.agent_id, t.title, t.description, t.status, t.priority, 
      t.payload, t.result, t.started_at, t.completed_at, t.created_at, t.updated_at);
  });
  
  console.log(`✅ Created ${tasks.length} tasks`);
  
  // Create costs
  const models = ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo', 'claude-3-opus', 'claude-3-sonnet'];
  const costs = [];
  
  tasks.forEach(task => {
    if (task.status === 'completed' && Math.random() > 0.3) {
      const numCosts = Math.floor(Math.random() * 3) + 1;
      for (let i = 0; i < numCosts; i++) {
        const promptTokens = Math.floor(Math.random() * 2000) + 100;
        const completionTokens = Math.floor(Math.random() * 1000) + 50;
        const model = models[Math.floor(Math.random() * models.length)];
        const costPer1k = model.includes('gpt-4') ? 0.03 : 0.002;
        const costUSD = ((promptTokens + completionTokens) / 1000) * costPer1k;
        
        costs.push({
          id: generateId(),
          project_id: task.project_id,
          task_id: task.id,
          agent_id: task.agent_id,
          model,
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens,
          cost_usd: parseFloat(costUSD.toFixed(6)),
          recorded_at: new Date(new Date(task.completed_at).getTime() + i * 1000).toISOString()
        });
      }
    }
  });
  
  const insertCost = db.prepare(`
    INSERT INTO costs (id, project_id, task_id, agent_id, model, prompt_tokens, completion_tokens, total_tokens, cost_usd, recorded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  costs.forEach(c => {
    insertCost.run(c.id, c.project_id, c.task_id, c.agent_id, c.model, 
      c.prompt_tokens, c.completion_tokens, c.total_tokens, c.cost_usd, c.recorded_at);
  });
  
  console.log(`✅ Created ${costs.length} cost records`);
  
  // Summary
  console.log('\n📊 Seeded Data Summary:');
  console.log('   Projects:', projects.length);
  console.log('   Agents:', agents.length);
  console.log('   Tasks:', tasks.length);
  console.log('   Costs:', costs.length);
  
  // Calculate total cost
  const { total } = db.prepare('SELECT ROUND(SUM(cost_usd), 4) as total FROM costs').get();
  console.log('   Total Cost: $' + (total || 0));
  
  console.log('\n✨ Seed complete! Run `npm run dev` to start the server.');
  
  db.close();
}

try {
  seedData();
} catch (err) {
  console.error('Seed error:', err);
  process.exit(1);
}
