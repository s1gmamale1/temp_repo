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
API_PID_FILE="$LOG_DIR/api-server.pid"
WEB_PID_FILE="$LOG_DIR/web-hq.pid"
AGENT_PID_FILE="$LOG_DIR/agent.pid"

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
  if (( maj < 18 )); then
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

# ── Start Agent ───────────────────────────────────────────────────────────────
start_agent() {
  local name="${2:-TestAgent}"
  local handle="${3:-testagent}"
  if [[ -f "$AGENT_PID_FILE" ]] && kill -0 "$(cat "$AGENT_PID_FILE")" 2>/dev/null; then
    warn "Agent already running (PID $(cat "$AGENT_PID_FILE"))"
    return
  fi
  log "Starting test agent @$handle..."
  cd "$REPO_ROOT/api-server"
  node agentCLI.js --name "$name" --handle "$handle" >> "$AGENT_LOG" 2>&1 &
  echo $! > "$AGENT_PID_FILE"
  sleep 1
  if kill -0 "$(cat "$AGENT_PID_FILE")" 2>/dev/null; then
    ok "Agent started  (PID $(cat "$AGENT_PID_FILE"))  — approve at http://localhost:5173/admin"
    ok "Agent log: $AGENT_LOG"
  else
    fail "Agent failed to start — check $AGENT_LOG"
  fi
}

# ── Stop ──────────────────────────────────────────────────────────────────────
stop_all() {
  log "Stopping services..."
  for pf in "$API_PID_FILE" "$WEB_PID_FILE" "$AGENT_PID_FILE"; do
    if [[ -f "$pf" ]]; then
      local pid
      pid=$(cat "$pf")
      if kill -0 "$pid" 2>/dev/null; then
        kill "$pid" && ok "Stopped PID $pid"
      fi
      rm -f "$pf"
    fi
  done
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
    echo ""
    ok "Stack is up. Open http://localhost:5173"
    ok "API logs: $API_LOG"
    ok "Web logs: $WEB_LOG"
    ;;
  api)    start_api   ;;
  web)    start_web   ;;
  agent)  start_agent "$@" ;;
  stop)   stop_all    ;;
  status) show_status ;;
  *)
    echo "Usage: bash scripts/start-local.sh [all|api|web|agent|stop|status]"
    exit 1
    ;;
esac
