#!/bin/bash
#
# Monthly data refresh: GIE, UN Comtrade, and EIA STEO.
# Creates a PR branch (never pushes main), logs to ~/Library/Logs/global-energy-map/.
# Usage:
#   scripts/refresh/monthly.sh              # run the refresh
#   scripts/refresh/monthly.sh --dry-run    # print steps without network/git writes
#
set -euo pipefail

DRY_RUN=0
for arg in "$@"; do
  if [[ "$arg" == "--dry-run" ]]; then
    DRY_RUN=1
  fi
done

# --- Configuration ---
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOG_DIR="$HOME/Library/Logs/global-energy-map"
STATUS_FILE="$LOG_DIR/refresh-status.json"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
BRANCH_DATE=$(date +"%Y-%m")
BRANCH_NAME="refresh/$BRANCH_DATE"

# --- Functions ---
log() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"
}

fail() {
  log "ERROR: $*"
  if [[ $DRY_RUN -eq 0 ]]; then
    write_status "failed" "$1"
  fi
  exit 1
}

write_status() {
  local status=$1
  local step=${2:-"unknown"}
  mkdir -p "$LOG_DIR"
  cat > "$STATUS_FILE" <<EOF
{
  "status": "$status",
  "timestamp": "$TIMESTAMP",
  "step": "$step",
  "branch": "$BRANCH_NAME"
}
EOF
}

run_step() {
  local step_name=$1
  shift
  local cmd=("$@")

  log "Running: ${cmd[*]}"
  if [[ $DRY_RUN -eq 0 ]]; then
    "${cmd[@]}" || fail "$step_name"
  fi
}

# --- Pre-flight checks ---
log "=== Scheduled data refresh: $TIMESTAMP ==="
log "Branch: $BRANCH_NAME"

if [[ $DRY_RUN -eq 0 ]]; then
  # Check for dirty tree
  if ! git -C "$REPO_ROOT" diff-index --quiet HEAD --; then
    fail "Working tree has uncommitted changes. Stash or commit first."
  fi

  # Load secrets
  set +u
  # shellcheck source=/dev/null
  set -a
  source "$HOME/.config/secrets.env"
  set +a
  set -u

  # Check required keys
  if [[ -z "${GIE_API_KEY:-}" ]]; then
    fail "GIE_API_KEY not set in ~/.config/secrets.env"
  fi
  if [[ -z "${COMTRADE_API_KEY:-}" ]]; then
    fail "COMTRADE_API_KEY not set in ~/.config/secrets.env"
  fi
  if [[ -z "${EIA_API_KEY:-}" ]]; then
    fail "EIA_API_KEY not set in ~/.config/secrets.env"
  fi

  # Fetch latest main
  log "Fetching origin/main..."
  git -C "$REPO_ROOT" fetch origin main

  # Create branch from origin/main
  log "Creating branch $BRANCH_NAME..."
  git -C "$REPO_ROOT" checkout -b "$BRANCH_NAME" "origin/main" || fail "Failed to create branch"
else
  log "(dry-run: skipping git/network operations)"
fi

# --- Data refresh ---
log "Starting data ingests..."

# GIE AGSI + ALSI (daily gas storage and LNG send-out)
run_step "GIE ingest" \
  bash -c "cd '$REPO_ROOT' && uv run python -m scripts.ingest.gie_daily --to \$(date +%F) --force"

# UN Comtrade (monthly crude + LNG imports, backfills)
run_step "Comtrade ingest" \
  bash -c "cd '$REPO_ROOT' && uv run python -m scripts.ingest.comtrade_monthly --to \$(date -v-3m +%Y%m)"

# EIA STEO (shale regions)
run_step "EIA STEO ingest" \
  bash -c "cd '$REPO_ROOT' && uv run python -m scripts.ingest.eia_steo --force"

log "Data ingests complete."

# --- Build ---
log "Building public/data/..."
run_step "build_all" \
  bash -c "cd '$REPO_ROOT' && uv run python -m scripts.build_all"

# --- Tests ---
log "Running tests..."
run_step "pytest" \
  bash -c "cd '$REPO_ROOT' && uv run python -m pytest tests/python -q"

# --- Commit and PR ---
if [[ $DRY_RUN -eq 0 ]]; then
  log "Checking for changes..."
  git -C "$REPO_ROOT" add -A -- public/data src/lib/export/citations.generated.json 2>/dev/null || true

  if git -C "$REPO_ROOT" diff --cached --quiet; then
    log "No data changes; skipping commit."
  else
    log "Committing data refresh..."
    git -C "$REPO_ROOT" commit -m "$(cat <<'COMMIT_MSG'
Data refresh: GIE, Comtrade, EIA STEO

- GIE AGSI/ALSI updated to latest
- UN Comtrade monthly crude + LNG imports backfilled
- EIA STEO shale region production refreshed
- Public data rebuilt and tested

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
COMMIT_MSG
)" || fail "Failed to commit"
  fi

  log "Pushing branch..."
  git -C "$REPO_ROOT" push -u origin "$BRANCH_NAME" || fail "Failed to push branch"

  log "Opening PR..."
  cd "$REPO_ROOT"
  gh pr create --title "Data refresh: $BRANCH_DATE" \
    --body "$(cat <<'PR_BODY'
## Summary
Monthly refresh of free data sources:
- GIE AGSI/ALSI (gas storage and LNG send-out)
- UN Comtrade (crude and LNG imports, backfills)
- EIA STEO (US shale region production)

## Pins that may need attention
- [ ] **EIA STEO release/as_of**: check https://www.eia.gov/outlooks/steo/ for new release date
- [ ] **history_through_year**: if January, bump the pin to the current year

See `docs/refresh.md` for the refresh runbook.
PR_BODY
)" || fail "Failed to open PR"

  write_status "ok" "complete"
  log "Refresh complete. PR opened."
else
  log "(dry-run: would commit, push, and open PR)"
fi

log "=== Refresh finished at $(date -u +'%Y-%m-%dT%H:%M:%SZ') ==="
