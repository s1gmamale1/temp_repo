#!/usr/bin/env bash
# start-local.sh — Start PROJECT-CLAW in local Ollama mode
#
# Usage (from repo root):
#   bash scripts/start-local.sh           # start API + frontend in background
#   bash scripts/start-local.sh api       # API only
#   bash scripts/start-local.sh web       # frontend only
#   bash scripts/start-local.sh agent     # register and start a test agent
#   bash scripts/start-local.sh stop      # kill all local processes
#   bash scripts/start-local.sh status    # check if services are up
#
# Logs are written to logs/ in the repo root.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$REPO_ROOT/logs"
mkdir -p "$LOG_DIR"

API_LOG="$LOG_DIR/api-server.log"
WEB_LOG="$LOG_DIR/web-hq.log"
AGENT_LOG="$LOG_DIR/agent.log"
NOTIFIER_LOG="$LOG_DIR/notifier.log"
API_PID_FILE="$LOG_DIR/api-server.pid"
WEB_PID_FILE="$LOG_DIR/web-hq.pid"
AGENT_PID_FILE="$LOG_DIR/agent.pid"
NOTIFIER_PID_FILE="$LOG_DIR/notifier.pid"
SUPERVISOR_PID_FILE="$LOG_DIR/pids/supervisor.pid"
AGENTS_DIR="$LOG_DIR/agents"

C_G='\033[0;32m'
C_Y='\033[0;33m'
C_R='\033[0;31m'
C_B='\033[1m'
C_X='\033[0m'

log()  { echo -e "${C_B}[$(date +%T)]${C_X} $*"; }
ok()   { echo -e "${C_G}✓${C_X}  $*"; }
fail() { echo -e "${C_R}✗${C_X}  $*"; }
warn() { echo -e "${C_Y}⚠${C_X}  $*"; }

# ── Check Node ────────────────────────────────────────────────────────────────
check_node() {
  if ! command -v node &>/dev/null; then
    fail "Node.js not found. Install Node.js >= 18.0.0"
    exit 1
  fi
  local ver
  ver=$(node -e "process.stdout.write(process.version)")
  local major=${ver//[^0-9.]*/}
  local maj=${major%%.*}
  maj=${maj//v/}
  if [ "$maj" -lt 18 ] 2>/dev/null; then
    warn "Node.js $ver detected. Requires >= 18.0.0"
  fi
}

# ── Check Ollama ──────────────────────────────────────────────────────────────
check_ollama() {
  if curl -sf http://localhost:11434/api/tags > /dev/null 2>&1; then
    ok "Ollama is reachable"
  else
    warn "Ollama not reachable at localhost:11434"
    warn "Run: ollama serve   (and: ollama pull qwen2.5-coder:7b)"
    warn "AI tasks will fall back to simulation mode."
  fi
}

# ── Start API ─────────────────────────────────────────────────────────────────
start_api() {
  if [[ -f "$API_PID_FILE" ]] && kill -0 "$(cat "$API_PID_FILE")" 2>/dev/null; then
    warn "API server already running (PID $(cat "$API_PID_FILE"))"
    return
  fi
  log "Starting API server..."
  cd "$REPO_ROOT/api-server"
  if [[ ! -d node_modules ]]; then
    log "Installing api-server dependencies..."
    npm install
  fi
  NODE_ENV=development node src/server.js >> "$API_LOG" 2>&1 &
  echo $! > "$API_PID_FILE"
  # Wait for API to be ready (up to 15s)
  local i=0
  while (( i < 30 )); do
    if curl -sf http://localhost:3001/health > /dev/null 2>&1; then
      ok "API server ready  (PID $(cat "$API_PID_FILE"))  → http://localhost:3001"
      return
    fi
    sleep 0.5
    (( i++ ))
  done
  fail "API server did not become ready within 15s — check $API_LOG"
}

# ── Start Web ─────────────────────────────────────────────────────────────────
start_web() {
  if [[ -f "$WEB_PID_FILE" ]] && kill -0 "$(cat "$WEB_PID_FILE")" 2>/dev/null; then
    warn "Frontend already running (PID $(cat "$WEB_PID_FILE"))"
    return
  fi
  log "Starting frontend (Vite)..."
  cd "$REPO_ROOT/web-hq"
  if [[ ! -d node_modules ]]; then
    log "Installing web-hq dependencies..."
    npm install
  fi
  npm run dev >> "$WEB_LOG" 2>&1 &
  echo $! > "$WEB_PID_FILE"
  sleep 3
  if kill -0 "$(cat "$WEB_PID_FILE")" 2>/dev/null; then
    ok "Frontend started  (PID $(cat "$WEB_PID_FILE"))  → http://localhost:5173"
  else
    fail "Frontend failed to start — check $WEB_LOG"
  fi
}

# ── Start a single named agent ────────────────────────────────────────────────
start_one_agent() {
  local name="$1"
  local handle="$2"
  local type="${3:-worker}"
  local extra_args="${4:-}"
  mkdir -p "$AGENTS_DIR"
  local pid_file="$AGENTS_DIR/${handle}.pid"
  local log_file="$AGENTS_DIR/${handle}.log"

  if [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
    warn "Agent @$handle already running (PID $(cat "$pid_file"))"
    return
  fi
  cd "$REPO_ROOT/api-server"
  node agentCLI.js --name "$name" --handle "$handle" --type "$type" $extra_args >> "$log_file" 2>&1 &
  echo $! > "$pid_file"
  sleep 1
  if kill -0 "$(cat "$pid_file")" 2>/dev/null; then
    ok "Agent @$handle started  (PID $(cat "$pid_file"))  log: $log_file"
  else
    warn "Agent @$handle failed to start — check $log_file"
  fi
}

# ── Start all platform agents ─────────────────────────────────────────────────
start_agents() {
  log "Starting platform agents..."
  start_one_agent "Kotlet PM"         "kotlet_pm"  "pm"
  start_one_agent "Kotlet Ops Tester" "kotlet_ops" "worker"
  start_one_agent "TestAgent"         "testagent"  "worker"
  # Seer is an OpenClaw agent (uses OpenAI via OpenClaw) — trigger via: acpx seer exec "run research"
}

# ── Start a single ad-hoc agent (legacy one-shot) ─────────────────────────────
start_agent() {
  local name="${2:-TestAgent}"
  local handle="${3:-testagent}"
  start_one_agent "$name" "$handle" "worker"
}

# ── Start Notifier ────────────────────────────────────────────────────────────
start_notifier() {
  if [[ -f "$NOTIFIER_PID_FILE" ]] && kill -0 "$(cat "$NOTIFIER_PID_FILE")" 2>/dev/null; then
    warn "Notifier already running (PID $(cat "$NOTIFIER_PID_FILE"))"
    return
  fi
  local NOTIFIER_SCRIPT="$REPO_ROOT/scripts/notifier.js"
  if [[ ! -f "$NOTIFIER_SCRIPT" ]]; then
    warn "notifier.js not found — skipping Telegram notifications"
    return
  fi
  log "Starting task notifier..."
  node "$NOTIFIER_SCRIPT" >> "$NOTIFIER_LOG" 2>&1 &
  echo $! > "$NOTIFIER_PID_FILE"
  sleep 1
  if kill -0 "$(cat "$NOTIFIER_PID_FILE")" 2>/dev/null; then
    ok "Notifier started  (PID $(cat "$NOTIFIER_PID_FILE"))  — Telegram notifications active"
  else
    warn "Notifier failed to start — check $NOTIFIER_LOG"
  fi
}

# ── Respawn Claude ACP ────────────────────────────────────────────────────────
respawn_claude() {
  # On Git Bash, $HOME may be /home/user — use USERPROFILE (Windows path) instead
  local WIN_HOME
  WIN_HOME="$(cmd //c "echo %USERPROFILE%" 2>/dev/null | tr -d '\r')"
  local RESPAWN_SCRIPT="${WIN_HOME}/.openclaw/workspace/scripts/respawn-claude.js"
  if [[ ! -f "$RESPAWN_SCRIPT" ]]; then
    warn "respawn-claude.js not found at $RESPAWN_SCRIPT — skipping Claude ACP setup"
    return
  fi
  log "Setting up Claude ACP session for Telegram..."
  if node "$RESPAWN_SCRIPT"; then
    ok "Claude ACP session ready"
  else
    warn "Claude ACP session setup failed — Telegram will use fallback agent"
  fi
}

# ── Start Agent Supervisor ────────────────────────────────────────────────────
start_supervisor() {
  if [[ -f "$SUPERVISOR_PID_FILE" ]] && kill -0 "$(cat "$SUPERVISOR_PID_FILE")" 2>/dev/null; then
    warn "Supervisor already running (PID $(cat "$SUPERVISOR_PID_FILE"))"
    return
  fi
  mkdir -p "$LOG_DIR/pids"
  nohup bash "$REPO_ROOT/scripts/agent-supervisor.sh" >> "$LOG_DIR/supervisor.log" 2>&1 &
  sleep 1
  if [[ -f "$SUPERVISOR_PID_FILE" ]] && kill -0 "$(cat "$SUPERVISOR_PID_FILE")" 2>/dev/null; then
    ok "Agent supervisor started (PID $(cat "$SUPERVISOR_PID_FILE")) — auto-restarts crashed agents"
  else
    warn "Agent supervisor may not have started — check $LOG_DIR/supervisor.log"
  fi
}

# ── Stop ──────────────────────────────────────────────────────────────────────
stop_all() {
  log "Stopping services..."
  for pf in "$API_PID_FILE" "$WEB_PID_FILE" "$AGENT_PID_FILE" "$NOTIFIER_PID_FILE" "$LOG_DIR/backup.pid"; do
    if [[ -f "$pf" ]]; then
      local pid
      pid=$(cat "$pf")
      if kill -0 "$pid" 2>/dev/null; then
        kill "$pid" && ok "Stopped PID $pid"
      fi
      rm -f "$pf"
    fi
  done
  # Stop supervisor
  if [[ -f "$SUPERVISOR_PID_FILE" ]]; then
    local pid
    pid=$(cat "$SUPERVISOR_PID_FILE")
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" && ok "Stopped supervisor PID $pid"
    fi
    rm -f "$SUPERVISOR_PID_FILE"
  fi
  # Stop all named agents
  if [[ -d "$AGENTS_DIR" ]]; then
    for pf in "$AGENTS_DIR"/*.pid; do
      [[ -f "$pf" ]] || continue
      local pid
      pid=$(cat "$pf")
      if kill -0 "$pid" 2>/dev/null; then
        kill "$pid" && ok "Stopped agent PID $pid"
      fi
      rm -f "$pf"
    done
  fi
}

# ── Status ────────────────────────────────────────────────────────────────────
show_status() {
  log "Service status:"
  node "$REPO_ROOT/api-server/scripts/health-check.js" \
    --api http://localhost:3001 \
    --web http://localhost:5173 || true
}

# ── Main ──────────────────────────────────────────────────────────────────────
check_node
CMD="${1:-all}"

case "$CMD" in
  all)
    echo -e "\n${C_B}PROJECT-CLAW — Local Mode Startup${C_X}"
    check_ollama
    start_api
    start_web
    start_agents
    start_notifier
    start_supervisor
    # One-shot backup on startup + scheduled backups in background
    bash "$REPO_ROOT/scripts/backup-db.sh" 2>/dev/null
    nohup bash "$REPO_ROOT/scripts/backup-db.sh" --schedule >> "$LOG_DIR/backup.log" 2>&1 &
    echo $! > "$LOG_DIR/backup.pid"
    respawn_claude
    echo ""
    ok "Stack is up. Open http://localhost:5173"
    ok "API logs:      $API_LOG"
    ok "Web logs:      $WEB_LOG"
    ok "Notifier logs: $NOTIFIER_LOG"
    ok "Agent logs:    $AGENTS_DIR/"
    ;;
  api)      start_api      ;;
  web)      start_web      ;;
  agents)   start_agents   ;;
  agent)    start_agent "$@" ;;
  notifier) start_notifier ;;
  stop)     stop_all       ;;
  status)   show_status    ;;
  *)
    echo "Usage: bash scripts/start-local.sh [all|api|web|agents|agent|notifier|stop|status]"
    exit 1
    ;;
esac
