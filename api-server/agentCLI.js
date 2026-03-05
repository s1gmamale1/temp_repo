#!/usr/bin/env node
/**
 * agent-cli.js — PROJECT-CLAW test agent
 *
 * Usage:
 *   node agent-cli.js --name "Sigma" --handle sigma
 *   node agent-cli.js --name "Sigma" --handle sigma --login Scorpion --password admin123
 */

const http = require('http');
const https = require('https');
const net = require('net');
const tls = require('tls');
const readline = require('readline');
const { URL } = require('url');

const BASE = process.env.API_URL || 'http://localhost:3001';
const WS_BASE = BASE.replace(/^http/, 'ws');

const args = process.argv.slice(2);
const get = (f, d) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : d; };

const AGENT_NAME = get('--name', 'TestAgent');
const AGENT_HANDLE = get('--handle', 'testagent');
const AGENT_SKILLS = get('--skills', 'general,testing').split(',').map(s => s.trim());
const ADMIN_LOGIN = get('--login', process.env.ADMIN_LOGIN || null);
const ADMIN_PASS = get('--password', process.env.ADMIN_PASS || null);

const C = { G: '\x1b[32m', Y: '\x1b[33m', C: '\x1b[36m', R: '\x1b[31m', B: '\x1b[1m', X: '\x1b[0m', A: '\x1b[33m' };
const log = (tag, msg, c = C.X) => console.log(`${c}[${new Date().toLocaleTimeString()}] [${tag}]${C.X} ${msg}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── HTTP ─────────────────────────────────────────────────────────────────────
function req(method, path, body, token) {
    return new Promise((resolve, reject) => {
        const u = new URL(BASE + path);
        const lib = u.protocol === 'https:' ? https : http;
        const data = body ? JSON.stringify(body) : null;
        const r = lib.request({
            hostname: u.hostname, port: u.port || 80, path: u.pathname + u.search, method,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
            },
        }, res => {
            let raw = '';
            res.on('data', d => raw += d);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
                catch { resolve({ status: res.statusCode, body: raw }); }
            });
        });
        r.on('error', reject);
        if (data) r.write(data);
        r.end();
    });
}

// ── Prompt ───────────────────────────────────────────────────────────────────
function prompt(question, secret = false) {
    return new Promise(resolve => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        if (secret) {
            process.stdout.write(question);
            process.stdin.setRawMode?.(true);
            let pw = '';
            process.stdin.resume();
            process.stdin.setEncoding('utf8');
            const onData = ch => {
                if (ch === '\n' || ch === '\r' || ch === '\u0003') {
                    process.stdin.setRawMode?.(false);
                    process.stdin.pause();
                    process.stdin.removeListener('data', onData);
                    console.log('');
                    rl.close();
                    resolve(pw);
                } else if (ch === '\u007f') {
                    pw = pw.slice(0, -1);
                } else {
                    pw += ch;
                    process.stdout.write('*');
                }
            };
            process.stdin.on('data', onData);
        } else {
            rl.question(question, ans => { rl.close(); resolve(ans.trim()); });
        }
    });
}

// ── WebSocket ─────────────────────────────────────────────────────────────────
function wsConnect(agentId, userToken, onMsg) {
    const u = new URL(`${WS_BASE}/ws?token=${encodeURIComponent(userToken)}`);
    const lib = u.protocol === 'wss:' ? tls : net;
    const port = parseInt(u.port) || (u.protocol === 'wss:' ? 443 : 80);
    const key = Buffer.from(Math.random().toString(36)).toString('base64');

    const sock = lib.connect({ host: u.hostname, port }, () => {
        sock.write(
            `GET ${u.pathname}${u.search} HTTP/1.1\r\nHost: ${u.hostname}:${port}\r\n` +
            `Upgrade: websocket\r\nConnection: Upgrade\r\n` +
            `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`
        );
    });

    let upgraded = false, buf = Buffer.alloc(0);

    sock.on('data', chunk => {
        if (!upgraded) {
            if (chunk.toString().includes('101')) {
                upgraded = true;
                log('WS', 'Connected ✓', C.G);
            }
            return;
        }
        buf = Buffer.concat([buf, chunk]);
        while (buf.length >= 2) {
            const opcode = buf[0] & 0x0f;
            let len = buf[1] & 0x7f, off = 2;
            if (len === 126) { len = buf.readUInt16BE(2); off = 4; }
            if (buf.length < off + len) break;
            const payload = buf.slice(off, off + len);
            buf = buf.slice(off + len);
            if (opcode === 1) { try { onMsg(JSON.parse(payload.toString())); } catch { } }
            if (opcode === 9) wsSend(sock, '', 10);
        }
    });

    sock.on('error', e => log('WS', e.message, C.R));
    sock.on('close', () => {
        log('WS', 'Disconnected — reconnecting in 5s...', C.Y);
        setTimeout(() => wsConnect(agentId, userToken, onMsg), 5000);
    });
}

function wsSend(sock, data, opcode = 1) {
    const p = Buffer.from(data);
    if (p.length < 126) sock.write(Buffer.concat([Buffer.from([opcode | 0x80, p.length]), p]));
    else sock.write(Buffer.concat([Buffer.from([opcode | 0x80, 126, p.length >> 8, p.length & 0xff]), p]));
}

// ── Task handling ─────────────────────────────────────────────────────────────
async function handleTask(data, agentId, userToken) {
    const id = data.task_id || data.id;
    const title = data.task_title || data.title || id;
    log('TASK', `📋 Assigned: "${title}"`, C.A);
    await sleep(1000);

    const acc = await req('POST', `/api/tasks/${id}/accept`, {}, userToken);
    if (acc.status === 200) log('TASK', '✓ Accepted', C.G);
    else { log('TASK', `Accept failed (${acc.status}): ${JSON.stringify(acc.body)}`, C.R); return; }

    await sleep(500);
    await req('POST', `/api/tasks/${id}/start`, {}, userToken);
    log('TASK', '✓ Started — simulating 5s of work...', C.C);
    await sleep(5000);

    const done = await req('POST', `/api/tasks/${id}/complete`, {
        result: `"${title}" completed by agent ${AGENT_NAME}.`
    }, userToken);
    if (done.status === 200) log('TASK', `✅ Completed: "${title}"`, C.G);
    else log('TASK', `Complete failed: ${JSON.stringify(done.body)}`, C.R);
}

// ── Notification poll ─────────────────────────────────────────────────────────
async function pollNotifications(agentId, userToken) {
    try {
        const r = await req('GET', `/api/agents/${agentId}/notifications`, null, userToken);
        if (r.status === 200) {
            for (const n of (r.body.notifications || []).filter(n => !n.is_read)) {
                log('NOTIF', `🔔 ${n.title}: ${n.content}`, C.Y);
                await req('POST', `/api/agents/${agentId}/notifications/${n.id}/read`, {}, userToken);
            }
        }
    } catch { }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
    console.log(`\n${C.B}╔══════════════════════════════════════╗`);
    console.log(`║    PROJECT-CLAW  AGENT  CLI  v3      ║`);
    console.log(`╚══════════════════════════════════════╝${C.X}\n`);

    // ── Step 1: Admin login ───────────────────────────────────────────────────
    log('AUTH', 'Admin credentials needed to authenticate this agent session.', C.C);
    const login = ADMIN_LOGIN || await prompt('  Admin login: ');
    const password = ADMIN_PASS || await prompt('  Password:    ', true);

    const loginRes = await req('POST', '/api/auth/login', { login, password });
    if (loginRes.status !== 200) {
        log('AUTH', `Login failed: ${JSON.stringify(loginRes.body)}`, C.R);
        process.exit(1);
    }
    const userToken = loginRes.body.token || loginRes.body.session?.token;
    if (!userToken) {
        log('AUTH', `No token in login response: ${JSON.stringify(loginRes.body)}`, C.R);
        process.exit(1);
    }
    log('AUTH', `✓ Logged in as ${login}`, C.G);

    // ── Step 2: Register agent ────────────────────────────────────────────────
    log('INIT', `Registering agent "${AGENT_NAME}" @${AGENT_HANDLE}...`, C.C);
    const regRes = await req('POST', '/api/agents/register', {
        name: AGENT_NAME, handle: AGENT_HANDLE,
        description: `CLI agent — ${AGENT_NAME}`,
        skills: AGENT_SKILLS, preferred_model: 'gpt-4o', experience_level: 'expert',
    });

    let agentId;
    if (regRes.status === 201 || regRes.status === 200) {
        agentId = regRes.body.id || regRes.body.agent?.id;
        log('INIT', `✓ Registered. ID: ${agentId}`, C.G);
    } else if (regRes.status === 409) {
        log('INIT', `Handle @${AGENT_HANDLE} already exists — run node reset-db.js first.`, C.R);
        process.exit(1);
    } else {
        log('INIT', `Registration failed (${regRes.status}): ${JSON.stringify(regRes.body)}`, C.R);
        process.exit(1);
    }

    // ── Step 3: Wait for approval ─────────────────────────────────────────────
    log('INIT', ``, C.X);
    log('INIT', `${C.B}Waiting for admin approval...${C.X}`, C.Y);
    log('INIT', `Go to: ${C.C}http://localhost:5173/admin${C.X} → approve @${AGENT_HANDLE}`, C.X);

    let approved = false;
    while (!approved) {
        await sleep(3000);
        const check = await req('GET', `/api/agents/${agentId}`, null, userToken);
        const a = check.body?.agent || check.body;
        approved = a?.is_approved === true || a?.is_approved === 1;
        process.stdout.write('.');
    }
    console.log('');
    log('INIT', '✅ Agent approved!', C.G);

    // ── Step 4: Go online ──────────────────────────────────────────────────────
    const onlineRes = await req('POST', `/api/agents/${agentId}/status`, { status: 'online' }, userToken);
    if (onlineRes.status === 200) log('INIT', '✅ Status set to ONLINE', C.G);
    else log('INIT', `Status update: ${JSON.stringify(onlineRes.body)}`, C.Y);

    // ── Step 5: WebSocket ──────────────────────────────────────────────────────
    const activeTasks = new Set();

    wsConnect(agentId, userToken, async msg => {
        const ev = msg.event || msg.type;
        const data = msg.data || msg;

        if (ev === 'task:assigned' || ev === 'agent:task_assigned') {
            // Accept tasks assigned to this specific agent
            const tid = data?.task_id || data?.id;
            if (tid && data?.agent_id === agentId && !activeTasks.has(tid)) {
                activeTasks.add(tid);
                handleTask(data, agentId, userToken).finally(() => activeTasks.delete(tid));
            }
        }

        if (ev === 'notification:new' || ev === 'agent:notification') {
            log('NOTIF', `🔔 ${data?.title || ev}: ${data?.content || data?.message || ''}`, C.Y);
        }

        if (ev === 'chat:message' || ev === 'message:new') {
            const isMine = data?.sender_id === agentId;
            if (!isMine && data?.content) {
                log('MSG', `💬 ${data?.sender_name || '?'}: ${data.content}`, C.C);
            }
        }
    });

    // Notification fallback poll every 15s
    setInterval(() => pollNotifications(agentId, userToken), 15000);

    console.log(`\n${C.B}${C.G}╔══════════════════════════════════════╗`);
    console.log(`║  ${AGENT_NAME} is ONLINE  ║`);
    console.log(`╚══════════════════════════════════════╝${C.X}`);
    log('AGENT', `Assign tasks from Admin panel or Tasks page.`, C.C);
    log('AGENT', `Ctrl+C to disconnect.\n`, C.Y);
}

main().catch(e => { console.error(`\n${C.R}Fatal:${C.X}`, e.message); process.exit(1); });