/**
 * Seed Data for PROJECT-CLAW API
 * Creates demo users, agents, and sample data
 */

const { initDatabase, getDb, generateId } = require('./src/database');

async function seed() {
  console.log('🌱 Seeding database...\n');
  
  await initDatabase();
  const db = getDb();
  
  // ============================================
  // SEED USERS
  // ============================================
  console.log('👤 Creating users...');
  
  const users = [
    {
      id: generateId(),
      name: 'Leonardo (Leo)',
      telegram_id: 'leo_telegram_001',
      role: 'admin',
      avatar_url: '/avatars/leo.png'
    },
    {
      id: generateId(),
      name: 'Donatello (Donnie)',
      telegram_id: 'donnie_telegram_002',
      role: 'admin',
      avatar_url: '/avatars/donnie.png'
    },
    {
      id: generateId(),
      name: 'Raphael (Raph)',
      telegram_id: 'raph_telegram_003',
      role: 'user',
      avatar_url: '/avatars/raph.png'
    },
    {
      id: generateId(),
      name: 'Michelangelo (Mikey)',
      telegram_id: 'mikey_telegram_004',
      role: 'user',
      avatar_url: '/avatars/mikey.png'
    }
  ];
  
  for (const user of users) {
    try {
      db.prepare(`
        INSERT OR IGNORE INTO users (id, name, telegram_id, role, avatar_url, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(user.id, user.name, user.telegram_id, user.role, user.avatar_url);
      console.log(`  ✅ ${user.name}`);
    } catch (err) {
      console.log(`  ⚠️  ${user.name} (may already exist)`);
    }
  }
  
  // ============================================
  // SEED PROJECTS
  // ============================================
  console.log('\n📁 Creating projects...');
  
  const projects = [
    {
      id: generateId(),
      name: 'PROJECT-CLAW Core',
      description: 'Main project management and cost tracking platform',
      owner_id: users[0].id,
      status: 'active'
    },
    {
      id: generateId(),
      name: 'TMNT Agent Network',
      description: 'Multi-agent collaboration system with personality-driven AI',
      owner_id: users[1].id,
      status: 'active'
    },
    {
      id: generateId(),
      name: 'NYC Sewer Infrastructure',
      description: 'Underground base management and logistics',
      owner_id: users[2].id,
      status: 'paused'
    }
  ];
  
  for (const project of projects) {
    try {
      db.prepare(`
        INSERT OR IGNORE INTO projects (id, name, description, owner_id, status, config, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(project.id, project.name, project.description, project.owner_id, project.status, '{}');
      console.log(`  ✅ ${project.name}`);
    } catch (err) {
      console.log(`  ⚠️  ${project.name} (may already exist)`);
    }
  }
  
  // ============================================
  // SEED AGENTS
  // ============================================
  console.log('\n🤖 Creating agents...');
  
  const agents = [
    {
      id: generateId(),
      project_id: projects[1].id,
      name: 'Leonardo',
      role: 'Leader',
      description: 'Tactical leader focused on strategy and coordination',
      personality: JSON.stringify({
        traits: ['disciplined', 'focused', 'strategic'],
        catchphrase: 'Let\'s move out!',
        avatar: '/agents/leo.png'
      })
    },
    {
      id: generateId(),
      project_id: projects[1].id,
      name: 'Donatello',
      role: 'Tech Lead',
      description: 'Technical genius and engineering expert',
      personality: JSON.stringify({
        traits: ['analytical', 'innovative', 'tech-savvy'],
        catchphrase: 'According to my calculations...',
        avatar: '/agents/donnie.png'
      })
    },
    {
      id: generateId(),
      project_id: projects[1].id,
      name: 'Raphael',
      role: 'Warrior',
      description: 'Combat specialist with a fierce attitude',
      personality: JSON.stringify({
        traits: ['passionate', 'direct', 'protective'],
        catchphrase: 'Let\'s bash some heads!',
        avatar: '/agents/raph.png'
      })
    },
    {
      id: generateId(),
      project_id: projects[1].id,
      name: 'Michelangelo',
      role: 'Creative',
      description: 'Creative problem solver with endless enthusiasm',
      personality: JSON.stringify({
        traits: ['enthusiastic', 'creative', 'fun-loving'],
        catchphrase: 'Cowabunga!',
        avatar: '/agents/mikey.png'
      })
    },
    {
      id: generateId(),
      project_id: projects[0].id,
      name: 'Splinter',
      role: 'Mentor',
      description: 'Wise mentor offering guidance and perspective',
      personality: JSON.stringify({
        traits: ['wise', 'patient', 'philosophical'],
        catchphrase: 'Patience, my sons...',
        avatar: '/agents/splinter.png'
      })
    },
    {
      id: generateId(),
      project_id: projects[0].id,
      name: 'April',
      role: 'Researcher',
      description: 'Investigative researcher and information gatherer',
      personality: JSON.stringify({
        traits: ['resourceful', 'brave', 'curious'],
        catchphrase: 'I\'m on it!',
        avatar: '/agents/april.png'
      })
    }
  ];
  
  for (const agent of agents) {
    try {
      db.prepare(`
        INSERT OR IGNORE INTO agents (id, project_id, name, role, description, personality, is_active, status, config, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, 'idle', '{}', datetime('now'))
      `).run(agent.id, agent.project_id, agent.name, agent.role, agent.description, agent.personality);
      console.log(`  ✅ ${agent.name} (${agent.role})`);
    } catch (err) {
      console.log(`  ⚠️  ${agent.name} (may already exist)`);
    }
  }
  
  // ============================================
  // SEED TASKS
  // ============================================
  console.log('\n📋 Creating sample tasks...');
  
  const tasks = [
    {
      id: generateId(),
      project_id: projects[0].id,
      title: 'Implement cost tracking API',
      description: 'Build endpoints for tracking API costs per model and project',
      status: 'completed',
      priority: 5
    },
    {
      id: generateId(),
      project_id: projects[0].id,
      title: 'Add WebSocket support for real-time chat',
      description: 'Enable WebSocket connections for live messaging',
      status: 'running',
      priority: 5
    },
    {
      id: generateId(),
      project_id: projects[0].id,
      title: 'Create agent response system',
      description: 'Implement system to spawn agents when mentioned',
      status: 'pending',
      priority: 4
    },
    {
      id: generateId(),
      project_id: projects[1].id,
      title: 'Train agent personalities',
      description: 'Fine-tune agent responses to match TMNT characters',
      status: 'pending',
      priority: 3
    },
    {
      id: generateId(),
      project_id: projects[2].id,
      title: 'Repair sewer entrance',
      description: 'Fix the damaged entrance to the underground base',
      status: 'pending',
      priority: 2
    }
  ];
  
  for (const task of tasks) {
    try {
      db.prepare(`
        INSERT OR IGNORE INTO tasks (id, project_id, title, description, status, priority, payload, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(task.id, task.project_id, task.title, task.description, task.status, task.priority, '{}');
      console.log(`  ✅ ${task.title}`);
    } catch (err) {
      console.log(`  ⚠️  Task (may already exist)`);
    }
  }
  
  // ============================================
  // SEED BUDGETS
  // ============================================
  console.log('\n💰 Creating budgets...');
  
  const budgets = [
    {
      id: generateId(),
      project_id: projects[0].id,
      name: 'Monthly API Budget',
      budget_amount: 500.00,
      budget_period: 'monthly',
      alert_threshold: 0.8
    },
    {
      id: generateId(),
      project_id: projects[1].id,
      name: 'Agent Training Budget',
      budget_amount: 1000.00,
      budget_period: 'monthly',
      alert_threshold: 0.9
    }
  ];
  
  for (const budget of budgets) {
    try {
      db.prepare(`
        INSERT OR IGNORE INTO budgets (id, project_id, name, budget_amount, budget_period, alert_threshold, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
      `).run(budget.id, budget.project_id, budget.name, budget.budget_amount, budget.budget_period, budget.alert_threshold);
      console.log(`  ✅ ${budget.name} ($${budget.budget_amount})`);
    } catch (err) {
      console.log(`  ⚠️  Budget (may already exist)`);
    }
  }
  
  // ============================================
  // SEED SAMPLE MESSAGES
  // ============================================
  console.log('\n💬 Creating sample messages...');
  
  const messages = [
    {
      id: generateId(),
      user_id: users[0].id,
      content: 'Hey team! The new cost tracking system is live! 🎉',
      channel: 'general',
      message_type: 'text'
    },
    {
      id: generateId(),
      agent_id: agents[1].id, // Donatello
      content: 'Excellent work! I\'ve integrated the OpenRouter API for real-time cost sync.',
      channel: 'general',
      message_type: 'agent_response'
    },
    {
      id: generateId(),
      user_id: users[3].id,
      content: 'Cowabunga! Can\'t wait to see the new chat features! 🍕',
      channel: 'general',
      message_type: 'text'
    },
    {
      id: generateId(),
      agent_id: agents[3].id, // Michelangelo
      content: 'Party on, dude! The chat system is gonna be radical!',
      channel: 'general',
      message_type: 'agent_response'
    }
  ];
  
  for (const msg of messages) {
    try {
      db.prepare(`
        INSERT OR IGNORE INTO messages (id, user_id, agent_id, content, channel, message_type, is_dm, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, '{}', datetime('now'))
      `).run(msg.id, msg.user_id || null, msg.agent_id || null, msg.content, msg.channel, msg.message_type);
      console.log(`  ✅ Message from ${msg.user_id ? 'user' : 'agent'}`);
    } catch (err) {
      console.log(`  ⚠️  Message (may already exist)`);
    }
  }
  
  // ============================================
  // SEED SAMPLE COST RECORDS
  // ============================================
  console.log('\n📊 Creating sample cost records...');
  
  const models = [
    'moonshot/kimi-k2.5',
    'moonshot/kimi-k2-turbo',
    'openai/gpt-5.1',
    'openai/gpt-4o'
  ];
  
  // Generate some sample cost data
  for (let i = 0; i < 20; i++) {
    const model = models[Math.floor(Math.random() * models.length)];
    const promptTokens = Math.floor(Math.random() * 5000) + 500;
    const completionTokens = Math.floor(Math.random() * 2000) + 200;
    const costUsd = (promptTokens + completionTokens) * 0.000002;
    
    try {
      db.prepare(`
        INSERT INTO cost_records (id, project_id, model, provider, prompt_tokens, completion_tokens, total_tokens, cost_usd, recorded_at)
        VALUES (?, ?, ?, 'openrouter', ?, ?, ?, ?, datetime('now', ?))
      `).run(
        generateId(),
        projects[Math.floor(Math.random() * projects.length)].id,
        model,
        promptTokens,
        completionTokens,
        promptTokens + completionTokens,
        costUsd,
        `-${Math.floor(Math.random() * 7)} days`
      );
    } catch (err) {
      // Ignore duplicate errors
    }
  }
  console.log('  ✅ 20 sample cost records created');
  
  // ============================================
  // COMPLETE
  // ============================================
  console.log('\n✨ Seeding complete!\n');
  console.log('Created:');
  console.log(`  👤 ${users.length} users`);
  console.log(`  📁 ${projects.length} projects`);
  console.log(`  🤖 ${agents.length} agents`);
  console.log(`  📋 ${tasks.length} tasks`);
  console.log(`  💰 ${budgets.length} budgets`);
  console.log(`  💬 ${messages.length} messages`);
  console.log('');
  
  // Close database
  db.close();
  process.exit(0);
}

seed().catch(err => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
