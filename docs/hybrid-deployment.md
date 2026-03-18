# PROJECT-CLAW — Hybrid / Mac Mini Deployment Guide

Covers: deploying PROJECT-CLAW in hybrid mode where the Windows dev machine
runs the API server + frontend while a Mac Mini (or any LAN node) runs Ollama
and participates as a remote agent node.

---

## Architecture Overview

```
Windows Dev Box (192.168.1.x)           Mac Mini / LAN Node
┌─────────────────────────────┐         ┌────────────────────────┐
│  api-server  (port 3001)    │ ◄─────► │  agentCLI.js           │
│  web-hq      (port 5173)    │         │  Ollama (port 11434)   │
│  SQLite DB                  │         │  node >= 18            │
└─────────────────────────────┘         └────────────────────────┘
```

The Mac Mini agent connects to the Windows API server over the LAN.
The Windows API server can also call the Mac Mini's Ollama instance directly
by pointing `OLLAMA_BASE_URL` at its LAN IP.

---

## Pre-Deployment Checklist

### Windows API Server

- [ ] Node.js >= 18 installed
- [ ] `cd api-server && npm install` complete
- [ ] `api-server/.env` configured for hybrid mode:
  ```
  AI_PROVIDER=auto
  OLLAMA_BASE_URL=http://<mac-mini-ip>:11434   # if Mac Mini runs Ollama
  ```
- [ ] Port 3001 open in Windows Firewall (inbound TCP)
- [ ] Port 5173 open if remote browsers need the frontend
- [ ] Run `node api-server/scripts/health-check.js` — all green

### Mac Mini / Remote Node

- [ ] Node.js >= 18 installed: `node --version`
- [ ] Ollama installed and model pulled:
  ```bash
  ollama pull qwen2.5-coder:7b
  ollama serve   # runs on 0.0.0.0:11434 by default
  ```
- [ ] Ollama accessible from Windows box:
  ```bash
  # On Windows:
  curl http://<mac-mini-ip>:11434/api/tags
  ```
- [ ] `agentCLI.js` is available (download from API server or copy):
  ```bash
  curl http://<windows-ip>:3001/agentCLI.js -o agentCLI.js
  ```

---

## Configuration Profiles

### Switch to hybrid-auto on Windows API server
```bash
cd api-server
node scripts/switch-env-profile.js hybrid-auto
# Then edit .env to set OLLAMA_BASE_URL to Mac Mini IP
```

### Switch back to local-only
```bash
node scripts/switch-env-profile.js local-ollama
```

See `api-server/env-profiles/README.md` for all profiles and switching steps.

---

## Starting the Stack

### Windows (API + Frontend)
```bash
bash scripts/start-local.sh all
# Or individually:
bash scripts/start-local.sh api
bash scripts/start-local.sh web
```

### Mac Mini (Remote Agent)
```bash
# On Mac Mini terminal:
API_URL=http://<windows-ip>:3001 \
OLLAMA_BASE_URL=http://localhost:11434 \
node agentCLI.js --name "MacMiniAgent" --handle macmini
```

Then approve the agent at `http://<windows-ip>:5173/admin`.

---

## Ollama on Mac Mini — LAN Accessibility

By default `ollama serve` only binds to localhost. To expose it on LAN:

```bash
# macOS (LaunchAgent or direct):
OLLAMA_HOST=0.0.0.0:11434 ollama serve

# Or set permanently in ~/.ollama/config.json:
# { "host": "0.0.0.0:11434" }
```

Verify from Windows:
```bash
curl http://<mac-mini-ip>:11434/api/tags
```

---

## Failure Modes and Recovery

### Mac Mini Ollama unreachable

**Symptom:** Tasks execute in simulation mode. API logs show:
```
[execute] task=xxx provider=simulation(simulation) tokens=0 cost=$0.000000
```

**Cause:** `OLLAMA_BASE_URL` is wrong, Ollama not running, or firewall blocking port 11434.

**Recovery:**
1. On Mac Mini: `ollama serve` (check it binds to 0.0.0.0)
2. Check firewall: Mac `System Settings → Firewall → Allow ollama`
3. Verify from Windows: `curl http://<mac-ip>:11434/api/tags`
4. Update `OLLAMA_BASE_URL` in `api-server/.env` and restart API server

---

### Remote agent disconnects / reconnects loop

**Symptom:** agentCLI.js logs repeated `WS Disconnected — reconnecting in 5s...`

**Cause:** API server restarted, network disruption, or token expired.

**Recovery:**
1. Verify API server is running: `curl http://<windows-ip>:3001/health`
2. If server restarted, the agent token may still be valid — it auto-reconnects
3. If the agent handle was deleted (full reset), re-run `agentCLI.js` — it will re-register
4. Check `logs/api-server.log` on Windows for WS errors

---

### "Handle @xxx already exists" on re-register

**Cause:** Stale record in `manager_agents` from a previous session.

**Recovery (from Windows box):**
```bash
node -e "
const DB = require('better-sqlite3');
const db = new DB('./api-server/data/project-claw.db');
db.prepare(\"DELETE FROM manager_agents WHERE handle = 'macmini'\").run();
console.log('done');
"
```

---

### Windows API server port 3001 blocked on LAN

**Symptom:** Mac Mini agent cannot connect, `curl` from Mac Mini times out.

**Recovery:**
1. Windows PowerShell (admin):
   ```powershell
   New-NetFirewallRule -DisplayName "PROJECT-CLAW API" -Direction Inbound -LocalPort 3001 -Protocol TCP -Action Allow
   ```
2. Verify: `netstat -ano | findstr 3001`
3. Check `HOST=0.0.0.0` in `api-server/.env` (not `127.0.0.1`)

---

### Task stuck in "running" — agent went offline mid-execution

**Symptom:** Task shows `running` in UI but agent is offline.

**Recovery:**
1. In the admin panel, tasks can be manually cancelled
2. Or via API: `curl -X POST http://localhost:3001/api/tasks/<id>/cancel -H "Authorization: Bearer <token>"`
3. Re-assign and re-run the task

---

### Ollama model not found on Mac Mini

**Symptom:** agentCLI.js or AI executor gets error: `model not found`

**Recovery:**
```bash
# On Mac Mini:
ollama pull qwen2.5-coder:7b
ollama list   # verify
```

Update model name in `api-server/.env` if using a different model:
```
OLLAMA_MODEL_PM=<your-model>
OLLAMA_MODEL_WORKER=<your-model>
OLLAMA_MODEL_RND=<your-model>
```

---

## Node Rollout Checklist (Adding More Agents)

When adding additional agent nodes to the LAN:

- [ ] Node has Node.js >= 18
- [ ] Download agentCLI: `curl http://<windows-ip>:3001/agentCLI.js -o agentCLI.js`
- [ ] Choose a unique `--handle` (handles must be unique across all nodes)
- [ ] Set `API_URL=http://<windows-ip>:3001` in the environment
- [ ] Launch: `API_URL=http://<windows-ip>:3001 node agentCLI.js --name "Node2" --handle node2`
- [ ] Approve in admin panel at `http://<windows-ip>:5173/admin`
- [ ] Assign tasks via the Tasks or Project pages
- [ ] Monitor: check agent status at `http://<windows-ip>:5173/agents`

Each agent node operates independently. Multiple nodes can run concurrently.
