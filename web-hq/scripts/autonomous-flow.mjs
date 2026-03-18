import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = 'http://127.0.0.1:5173';
const API_BASE = 'http://127.0.0.1:3001';
const OUT_DIR = path.resolve('artifacts', 'autonomous-flow');

async function shot(page, name) {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`📸 ${file}`);
}

async function loginIfNeeded(page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  const loginInput = page.getByPlaceholder('Enter identifier...');
  if (await loginInput.isVisible().catch(() => false)) {
    console.log('🔐 Logging in as Scorpion...');
    await loginInput.fill('Scorpion');
    await page.getByPlaceholder('Enter key...').fill('Scorpion123');
    await page.getByRole('button', { name: /authenticate/i }).click();
    await page.waitForTimeout(1200);
  }
}

async function getToken(page) {
  const token = await page.evaluate(() => localStorage.getItem('claw_token'));
  if (!token) throw new Error('No claw_token found after login');
  return token;
}

async function createDemoData(page, token) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const projectName = `AUTO-FLOW-${stamp}`;
  const payload = await page.evaluate(async ({ API_BASE, token, projectName }) => {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };

    const projRes = await fetch(`${API_BASE}/api/projects`, {
      method: 'POST', headers,
      body: JSON.stringify({ name: projectName, description: 'Created by autonomous UI flow', status: 'active', priority: 'high' }),
    });
    const projBody = await projRes.json();
    const projectId = projBody?.id || projBody?.project?.id;

    let taskBody = null;
    if (projectId) {
      const taskRes = await fetch(`${API_BASE}/api/tasks`, {
        method: 'POST', headers,
        body: JSON.stringify({
          project_id: projectId,
          title: `Auto task ${projectName}`,
          description: 'Autonomous flow validation task',
          priority: 3,
        }),
      });
      taskBody = await taskRes.json();
    }

    // optional DM trigger path
    const agentRes = await fetch(`${API_BASE}/api/agents/chat`, { headers });
    const agentBody = await agentRes.json();

    return {
      projectName,
      projectId,
      taskId: taskBody?.id || taskBody?.task?.id || null,
      firstAgent: agentBody?.agents?.[0] || null,
    };
  }, { API_BASE, token, projectName });

  console.log('🧪 Demo data:', payload);
  return payload;
}

async function navigateAndShow(page, data) {
  // Projects
  const projectsLink = page.getByRole('link', { name: /projects/i }).first();
  if (await projectsLink.isVisible().catch(() => false)) {
    await projectsLink.click();
    await page.waitForTimeout(1200);
    await shot(page, '01-projects');
  }

  // Try search field if present
  const search = page.getByPlaceholder(/search/i).first();
  if (await search.isVisible().catch(() => false)) {
    await search.fill(data.projectName);
    await page.waitForTimeout(900);
    await shot(page, '02-project-search');
  }

  // Tasks
  const tasksLink = page.getByRole('link', { name: /tasks/i }).first();
  if (await tasksLink.isVisible().catch(() => false)) {
    await tasksLink.click();
    await page.waitForTimeout(1200);
    await shot(page, '03-tasks');
  }

  // Chat
  const chatLink = page.getByRole('link', { name: /chat/i }).first();
  if (await chatLink.isVisible().catch(() => false)) {
    await chatLink.click();
    await page.waitForTimeout(1200);
    await shot(page, '04-chat');
  }
}

async function sendAgentPing(page, token, data) {
  if (!data.firstAgent?.id) {
    console.log('ℹ️ No chat agent available for DM ping step.');
    return;
  }

  const result = await page.evaluate(async ({ API_BASE, token, agentId }) => {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };

    // Legacy DM endpoint is still the most reliable path for agent direct chat
    const dmRes = await fetch(`${API_BASE}/api/dm/${agentId}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ content: 'Autonomous flow ping from UI automation' }),
    });
    const dm = await dmRes.json();

    return { ok: dmRes.ok, step: 'dm-send', dm };
  }, { API_BASE, token, agentId: data.firstAgent.id });

  console.log('💬 DM result:', result.ok ? 'ok' : 'failed', result.step);
}

async function run() {
  const browser = await chromium.launch({ headless: false, slowMo: 220 });
  const context = await browser.newContext({ viewport: { width: 1480, height: 920 } });
  const page = await context.newPage();

  try {
    console.log('🚀 Starting autonomous flow...');
    await loginIfNeeded(page);
    await shot(page, '00-home');

    const token = await getToken(page);
    const data = await createDemoData(page, token);

    await navigateAndShow(page, data);
    await sendAgentPing(page, token, data);

    await shot(page, '05-final');
    console.log('✅ Autonomous flow complete. Artifacts in web-hq/artifacts/autonomous-flow');
    await page.waitForTimeout(15000);
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('❌ Autonomous flow failed:', err);
  process.exit(1);
});
