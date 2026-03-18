# PROJECT-CLAW — Local Mode Operational Runbook

Covers: startup, shutdown, health checks, and common recovery steps for
**local Ollama mode** (no external API keys required).

---

## Prerequisites

- Node.js >= 18.0.0
- Ollama installed and running (`ollama serve`)
- A model pulled: `ollama pull qwen2.5-coder:7b`

---

## Startup Sequence

Start services **in this order**:

### 1. Ollama (if not already running)
```bash
ollama serve
# Verify: curl http://localhost:11434/api/tags
```

### 2. API Server
```bash
cd api-server
npm run dev
# Ready when you see: Server listening at http://0.0.0.0:3001
```

### 3. Frontend (separate terminal)
```bash
cd web-hq
npm run dev
# Ready when you see: Local: http://localhost:5173/
```

### 4. Test Agent (optional, separate terminal)
```bash
cd api-server
node agentCLI.js --name "TestAgent" --handle testagent
# Then approve the agent at http://localhost:5173/admin
```

---

## Shutdown Procedure

1. `Ctrl+C` in the agent CLI terminal (if running)
2. `Ctrl+C` in the frontend terminal
3. `Ctrl+C` in the API server terminal
4. Ollama can remain running (it is stateless)

---

## Health Checks

### Quick reachability check (run from repo root)
```bash
node api-server/scripts/health-check.js
```

### Manual checks
```bash
# API server
curl http://localhost:3001/health

# Ollama
curl http://localhost:11434/api/tags

# Frontend (expect HTML)
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/
```

### WebSocket connectivity
```bash
# Expects 101 Switching Protocols
curl -i --no-buffer -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  -H "Sec-WebSocket-Version: 13" \
  http://localhost:3001/ws
```

---

## Environment Profile

Active profile is set in `api-server/.env`. To switch profiles:
```bash
cd api-server
node scripts/switch-env-profile.js local-ollama
# or
node scripts/switch-env-profile.js hybrid-auto
```

Current profile contents are in `api-server/env-profiles/`.

---

## Database

| Operation | Command |
|-----------|---------|
| Reset all data (keep admin user) | `cd api-server && node resetDB.js` |
| Seed mock data | `cd api-server && npm run seed` |
| Remove stale agent handle | See below |

**Remove a stale agent handle** (e.g. `Handle @testagent already exists`):
```bash
node -e "
const DB = require('better-sqlite3');
const db = new DB('./api-server/data/project-claw.db');
db.prepare(\"DELETE FROM manager_agents WHERE handle = 'testagent'\").run();
console.log('done');
"
```
No server restart needed.

---

## Log Levels

Set `LOG_LEVEL` in `api-server/.env`:
- `info` (default) — startup, requests, errors
- `debug` — verbose request/response details
- `warn` — warnings only
- `error` — errors only

---

## Common Issues

### "Port 3001 already in use"
```bash
# Find and kill the process
# Windows (PowerShell):
netstat -ano | findstr :3001
taskkill /PID <PID> /F

# Linux/Mac:
lsof -ti:3001 | xargs kill -9
```

### "Ollama unreachable — execution simulated"
- Ensure Ollama is running: `ollama serve`
- Check `OLLAMA_BASE_URL` in `api-server/.env` (default: `http://127.0.0.1:11434`)
- Verify model is pulled: `ollama list`

### Agent stuck in approval loop
- Open `http://localhost:5173/admin` and approve the agent manually
- Or check if the API server is running (`curl http://localhost:3001/health`)

### "Handle @xxx already exists" on re-register
- Remove the stale record (see Database section above)
- Or run `node api-server/resetDB.js` for a full reset

### Frontend shows blank page / API errors
- Check `web-hq/.env`: `VITE_API_URL` must point to running API server
- Ensure API server is started before opening the frontend
- Hard-refresh browser: `Ctrl+Shift+R`

### Task stays in "pending" after agent accepts
- Backend requires `status=pending` → `start` → `execute`
- Verify the agent CLI is running and connected (watch its terminal output)
- Check the API server logs for route errors

---

## Admin Credentials

| Field | Value |
|-------|-------|
| Username | `Scorpion` |
| Password | `Scorpion123` |
| User ID | `user-scorpion-001` |

---

## Key Endpoints Reference

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Server health + DB status |
| `GET /ready` | Readiness probe |
| `GET /live` | Liveness probe |
| `POST /api/agents/register` | Agent self-registration |
| `POST /api/auth/login` | Admin login |
| `GET /api/channels` | List channels |
| `POST /api/tasks/:id/execute` | Trigger AI task execution |
