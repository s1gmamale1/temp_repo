#!/usr/bin/env bash
# agent-supervisor.sh — Monitors agent processes and auto-restarts crashed ones
#
# Usage:
#   bash scripts/agent-supervisor.sh          # start supervisor (runs in foreground)
#   bash scripts/agent-supervisor.sh stop     # stop supervisor
#
# Checks every 15s if agent PIDs are alive. If dead, restarts them.
# Also monitors API server — if API is down, skip agent restarts until it recovers.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENTS_DIR="$REPO_ROOT/logs/agents"
PID_DIR="$REPO_ROOT/logs/pids"
SUPERVISOR_PID_FILE="$PID_DIR/supervisor.pid"
# Agent PIDs live in AGENTS_DIR (same as start-local.sh)
CHECK_INTERVAL=15
MAX_RESTARTS=5          # max restarts per agent per hour
RESTART_WINDOW=3600     # 1 hour in seconds

C_R='\033[0;31m' C_G='\033[0;32m' C_Y='\033[0;33m' C_C='\033[0;36m' C_X='\033[0m'

log()  { echo -e "${C_C}[SUPERVISOR]${C_X} [$(date +%H:%M:%S)] $*"; }
warn() { echo -e "${C_Y}[SUPERVISOR]${C_X} [$(date +%H:%M:%S)] $*"; }
err()  { echo -e "${C_R}[SUPERVISOR]${C_X} [$(date +%H:%M:%S)] $*"; }
ok()   { echo -e "${C_G}[SUPERVISOR]${C_X} [$(date +%H:%M:%S)] $*"; }

mkdir -p "$PID_DIR" "$AGENTS_DIR"

# Agent definitions: "name|handle|type"
AGENTS=(
  "Kotlet PM|kotlet_pm|pm"
  "Kotlet Ops Tester|kotlet_ops|worker"
  "TestAgent|testagent|worker"
)

# Track restart counts per agent: associative array handle→"count:first_restart_epoch"
declare -A RESTART_TRACKER

is_api_up() {
  curl -sf http://localhost:3001/health > /dev/null 2>&1
}

is_pid_alive() {
  local pid=$1
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

start_agent() {
  local name="$1" handle="$2" type="$3"
  local log_file="$AGENTS_DIR/${handle}.log"
  local pid_file="$AGENTS_DIR/${handle}.pid"

  cd "$REPO_ROOT/api-server" || return 1

  node agentCLI.js --name "$name" --handle "$handle" --type "$type" >> "$log_file" 2>&1 &
  local new_pid=$!
  echo "$new_pid" > "$pid_file"

  sleep 1
  if is_pid_alive "$new_pid"; then
    ok "Restarted agent @${handle} (PID $new_pid)"
    return 0
  else
    err "Failed to restart agent @${handle}"
    return 1
  fi
}

check_restart_limit() {
  local handle="$1"
  local now
  now=$(date +%s)
  local tracker="${RESTART_TRACKER[$handle]:-0:0}"
  local count="${tracker%%:*}"
  local first="${tracker##*:}"

  # Reset window if expired
  if [ "$first" -eq 0 ] || [ $((now - first)) -gt $RESTART_WINDOW ]; then
    RESTART_TRACKER[$handle]="1:$now"
    return 0  # allowed
  fi

  if [ "$count" -ge "$MAX_RESTARTS" ]; then
    return 1  # rate limited
  fi

  RESTART_TRACKER[$handle]="$((count + 1)):$first"
  return 0
}

do_stop() {
  if [ -f "$SUPERVISOR_PID_FILE" ]; then
    local pid
    pid=$(cat "$SUPERVISOR_PID_FILE")
    if is_pid_alive "$pid"; then
      kill "$pid" 2>/dev/null
      ok "Stopped supervisor (PID $pid)"
    fi
    rm -f "$SUPERVISOR_PID_FILE"
  else
    warn "No supervisor PID file found"
  fi
  exit 0
}

# Handle stop command
if [ "${1:-}" = "stop" ]; then
  do_stop
fi

# Write our PID
echo $$ > "$SUPERVISOR_PID_FILE"
log "Started (PID $$) — checking every ${CHECK_INTERVAL}s, max ${MAX_RESTARTS} restarts/hour per agent"

# Trap SIGTERM/SIGINT for clean exit
trap 'log "Shutting down..."; rm -f "$SUPERVISOR_PID_FILE"; exit 0' SIGTERM SIGINT

while true; do
  if ! is_api_up; then
    warn "API server is down — skipping agent checks"
    sleep "$CHECK_INTERVAL"
    continue
  fi

  for agent_def in "${AGENTS[@]}"; do
    IFS='|' read -r name handle type <<< "$agent_def"
    local_pid_file="$AGENTS_DIR/${handle}.pid"

    if [ ! -f "$local_pid_file" ]; then
      warn "No PID file for @${handle} — starting fresh"
      start_agent "$name" "$handle" "$type"
      continue
    fi

    pid=$(cat "$local_pid_file" 2>/dev/null)

    if ! is_pid_alive "$pid"; then
      warn "Agent @${handle} (PID $pid) is dead"

      if check_restart_limit "$handle"; then
        start_agent "$name" "$handle" "$type"
      else
        err "Agent @${handle} hit restart limit (${MAX_RESTARTS}/${RESTART_WINDOW}s) — not restarting"
      fi
    fi
  done

  sleep "$CHECK_INTERVAL"
done
