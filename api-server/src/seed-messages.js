const { initDatabase, getDb, generateId } = require('./database');

function seedMessages() {
  console.log('💬 Seeding messages for general channel...\n');
  
  initDatabase();
  const db = getDb();
  
  // Initial welcome messages for general channel
  const messages = [
    {
      id: generateId(),
      user_id: 'system',
      agent_id: null,
      content: 'Welcome to PROJECT-CLAW!',
      channel: 'general',
      message_type: 'system',
      is_dm: 0,
      metadata: JSON.stringify({ type: 'welcome', seed: true }),
      created_at: new Date().toISOString(),
      edited_at: null
    },
    {
      id: generateId(),
      user_id: 'agent-sigma-006',
      agent_id: 'agent-sigma-006',
      content: 'Sigma AI: System initialized',
      channel: 'general',
      message_type: 'agent',
      is_dm: 0,
      metadata: JSON.stringify({ agent: 'Sigma', type: 'status', seed: true }),
      created_at: new Date(Date.now() + 1000).toISOString(),
      edited_at: null
    },
    {
      id: generateId(),
      user_id: 'agent-leo-001',
      agent_id: 'agent-leo-001',
      content: 'Leonardo: Task force ready',
      channel: 'general',
      message_type: 'agent',
      is_dm: 0,
      metadata: JSON.stringify({ agent: 'Leonardo', type: 'status', seed: true }),
      created_at: new Date(Date.now() + 2000).toISOString(),
      edited_at: null
    }
  ];
  
  const insertMessage = db.prepare(`
    INSERT INTO messages (id, user_id, agent_id, content, channel, message_type, is_dm, metadata, created_at, edited_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  // Check if messages already exist in general channel
  const existingCount = db.prepare('SELECT COUNT(*) as count FROM messages WHERE channel = ?').get('general');
  
  if (existingCount.count > 0) {
    console.log(`⚠️  ${existingCount.count} messages already exist in general channel`);
    console.log('   Skipping seed to avoid duplicates');
    db.close();
    return;
  }
  
  messages.forEach(m => {
    insertMessage.run(
      m.id,
      m.user_id,
      m.agent_id,
      m.content,
      m.channel,
      m.message_type,
      m.is_dm,
      m.metadata,
      m.created_at,
      m.edited_at
    );
  });
  
  console.log(`✅ Created ${messages.length} messages in general channel:`);
  messages.forEach(m => {
    console.log(`   - "${m.content}"`);
  });
  
  console.log('\n✨ Message seed complete!');
  
  db.close();
}

try {
  seedMessages();
} catch (err) {
  console.error('Message seed error:', err);
  process.exit(1);
}
