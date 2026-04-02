#!/usr/bin/env bash
# backup-db.sh — Backup SQLite database with rotation
#
# Usage:
#   bash scripts/backup-db.sh              # one-shot backup
#   bash scripts/backup-db.sh --schedule   # run every 6 hours (foreground loop)
#
# Keeps last 7 days of backups (28 files at 6h intervals).
# Uses SQLite .backup command for safe online backup (no corruption risk).

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_PATH="$REPO_ROOT/api-server/data/project-claw.db"
BACKUP_DIR="$REPO_ROOT/backups"
KEEP_DAYS=7
INTERVAL_HOURS=6

C_G='\033[0;32m' C_Y='\033[0;33m' C_R='\033[0;31m' C_C='\033[0;36m' C_X='\033[0m'

log()  { echo -e "${C_C}[BACKUP]${C_X} [$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
ok()   { echo -e "${C_G}[BACKUP]${C_X} [$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
warn() { echo -e "${C_Y}[BACKUP]${C_X} [$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
err()  { echo -e "${C_R}[BACKUP]${C_X} [$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

mkdir -p "$BACKUP_DIR"

do_backup() {
  if [[ ! -f "$DB_PATH" ]]; then
    err "Database not found: $DB_PATH"
    return 1
  fi

  local ts
  ts=$(date '+%Y%m%d_%H%M%S')
  local backup_file="$BACKUP_DIR/project-claw_${ts}.db"

  # Use SQLite's .backup for safe online backup
  if command -v sqlite3 &>/dev/null; then
    sqlite3 "$DB_PATH" ".backup '$backup_file'"
  else
    # Fallback: copy with WAL checkpoint first
    # Node.js approach — uses better-sqlite3 backup API
    node -e "
      const Database = require('better-sqlite3');
      const db = new Database('$DB_PATH', { readonly: true });
      db.backup('$backup_file').then(() => {
        console.log('Backup complete');
        db.close();
      }).catch(err => {
        // Fallback to simple copy
        require('fs').copyFileSync('$DB_PATH', '$backup_file');
        console.log('Backup complete (copy)');
        db.close();
      });
    " 2>/dev/null || cp "$DB_PATH" "$backup_file"
  fi

  if [[ -f "$backup_file" ]]; then
    local size
    size=$(du -h "$backup_file" | cut -f1)
    ok "Created: $(basename "$backup_file") ($size)"
  else
    err "Backup failed — no file created"
    return 1
  fi

  # ── Prune old backups ────────────────────────────────────────────────────
  local cutoff_sec=$((KEEP_DAYS * 86400))
  local now_sec
  now_sec=$(date +%s)
  local pruned=0

  for f in "$BACKUP_DIR"/project-claw_*.db; do
    [[ -f "$f" ]] || continue
    local file_sec
    file_sec=$(date -r "$f" +%s 2>/dev/null || stat -c %Y "$f" 2>/dev/null || echo 0)
    if [[ $((now_sec - file_sec)) -gt $cutoff_sec ]]; then
      rm -f "$f"
      ((pruned++))
    fi
  done

  if [[ $pruned -gt 0 ]]; then
    log "Pruned $pruned backup(s) older than ${KEEP_DAYS} days"
  fi

  local total
  total=$(ls -1 "$BACKUP_DIR"/project-claw_*.db 2>/dev/null | wc -l)
  log "Total backups: $total"
}

# ── Main ──────────────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--schedule" ]]; then
  log "Scheduled mode — backing up every ${INTERVAL_HOURS}h, keeping ${KEEP_DAYS} days"
  while true; do
    do_backup
    sleep $((INTERVAL_HOURS * 3600))
  done
else
  do_backup
fi
