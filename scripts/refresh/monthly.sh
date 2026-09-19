#!/bin/bash
#
# Monthly data refresh: GIE, UN Comtrade, and EIA STEO.
#
# Runs entirely in a disposable `git worktree` under
# ~/Library/Caches/global-energy-map/ — the maintainer's own checkout and
# whatever branch they have checked out are never touched. On success the
# worktree is removed; on failure it is left in place for inspection (its
# path is in the status JSON). Opens a PR against origin/main; never pushes
# main and never merges.
#
# Usage:
#   scripts/refresh/monthly.sh              # run the refresh
#   scripts/refresh/monthly.sh --dry-run    # print the plan; no network or
#                                            # git operations, no worktree
#                                            # is created
#
set -euo pipefail

# launchd gives child processes a minimal PATH; make sure uv/gh/git are
# findable even if the plist's own PATH is ever out of date.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

DRY_RUN=0
for arg in "$@"; do
  if [[ "$arg" == "--dry-run" ]]; then
    DRY_RUN=1
  fi
done

# --- Configuration ---
MAINT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOG_DIR="$HOME/Library/Logs/global-energy-map"
CACHE_DIR="$HOME/Library/Caches/global-energy-map"
STATUS_FILE="$LOG_DIR/refresh-status.json"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
RUN_TAG=$(date -u +"%Y%m%d-%H%M%S")
LOG_FILE="$LOG_DIR/refresh-$RUN_TAG.log"
BRANCH_DATE=$(date +"%Y-%m")
BRANCH_NAME="refresh/$BRANCH_DATE"
WORKTREE_DIR="$CACHE_DIR/refresh-$BRANCH_DATE"

# Files scripts.build_all is allowed to touch (see scripts/transform/build_catalog.py
# and scripts/build_all.py's module docstring for the full list of writers).
# Anything else changing means something unexpected happened upstream.
ALLOWED_PREFIXES=("public/data/" "src/lib/export/citations.generated.json")

CURRENT_STEP="preflight"

# Dry-run touches nothing on disk beyond stdout: no log dir, no cache dir, no
# pruning, no worktree.
if [[ $DRY_RUN -eq 0 ]]; then
  mkdir -p "$LOG_DIR" "$CACHE_DIR"

  # Prune logs older than ~12 months so this directory doesn't grow forever.
  find "$LOG_DIR" -maxdepth 1 -name 'refresh-*.log' -mtime +366 -delete 2>/dev/null || true

  # Tee everything to a timestamped log file, in addition to whatever launchd
  # redirects stdout/stderr to (StandardOutPath/StandardErrorPath in the
  # plist) — the timestamped file is the one that survives after this run is
  # overwritten by the next.
  exec > >(tee -a "$LOG_FILE") 2>&1
fi

# --- Functions ---
log() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"
}

# Writes the status JSON. Always valid JSON (built with jq, not string
# interpolation) so a message containing quotes or newlines can't corrupt it.
write_status() {
  local status="$1" step="$2"
  mkdir -p "$LOG_DIR"
  jq -n \
    --arg status "$status" \
    --arg timestamp "$TIMESTAMP" \
    --arg step "$step" \
    --arg branch "$BRANCH_NAME" \
    --arg log "$LOG_FILE" \
    --arg worktree "$WORKTREE_DIR" \
    --argjson worktree_exists "$([[ -d "$WORKTREE_DIR" ]] && echo true || echo false)" \
    '{status: $status, timestamp: $timestamp, step: $step, branch: $branch,
      log: $log, worktree: $worktree, worktree_kept: $worktree_exists}' \
    > "$STATUS_FILE"
}

fail() {
  log "ERROR: $*"
  if [[ $DRY_RUN -eq 0 ]]; then
    write_status "failed" "$1"
  fi
  exit 1
}

# Always leaves a status record behind, including for failures before secrets
# load or before the worktree exists (write_status handles both fine — the
# worktree fields just reflect whatever state existed at the time).
on_exit() {
  local code=$?
  if [[ $code -ne 0 && $DRY_RUN -eq 0 ]]; then
    write_status "failed" "$CURRENT_STEP"
    log "Left worktree in place for inspection: $WORKTREE_DIR"
    log "Remove it with: git -C '$MAINT_ROOT' worktree remove '$WORKTREE_DIR' --force"
  fi
}
trap on_exit EXIT

for tool in git gh uv jq; do
  command -v "$tool" >/dev/null 2>&1 || fail "required tool not found on PATH: $tool"
done

log "=== Scheduled data refresh: $TIMESTAMP ==="
log "Branch: $BRANCH_NAME"
log "Worktree: $WORKTREE_DIR"

# --- Secrets ---
CURRENT_STEP="load-secrets"
if [[ $DRY_RUN -eq 0 ]]; then
  set +u
  # shellcheck source=/dev/null
  set -a
  source "$HOME/.config/secrets.env"
  set +a
  set -u

  for key in GIE_API_KEY COMTRADE_API_KEY EIA_API_KEY; do
    if [[ -z "${!key:-}" ]]; then
      fail "$key not set in ~/.config/secrets.env"
    fi
  done
else
  log "(dry-run: skipping secrets check, network and git operations)"
fi

# --- Worktree + branch setup ---
CURRENT_STEP="worktree-setup"
if [[ $DRY_RUN -eq 0 ]]; then
  if [[ -e "$WORKTREE_DIR" ]]; then
    fail "stale worktree already at $WORKTREE_DIR (likely from a previous failed run). \
Inspect it, then remove it with 'git -C $MAINT_ROOT worktree remove $WORKTREE_DIR --force' \
before retrying."
  fi

  log "Fetching origin/main..."
  git -C "$MAINT_ROOT" fetch origin main

  # Reuse the branch if a refresh already ran this month (re-run in the same
  # month, or a previous run that got as far as pushing before failing);
  # otherwise cut a fresh one from origin/main.
  REMOTE_BRANCH_EXISTS=0
  if git -C "$MAINT_ROOT" ls-remote --exit-code --heads origin "$BRANCH_NAME" >/dev/null 2>&1; then
    REMOTE_BRANCH_EXISTS=1
    log "Branch $BRANCH_NAME already exists on origin; reusing it."
    git -C "$MAINT_ROOT" fetch origin "$BRANCH_NAME"
  fi

  if [[ $REMOTE_BRANCH_EXISTS -eq 1 ]]; then
    git -C "$MAINT_ROOT" worktree add "$WORKTREE_DIR" "$BRANCH_NAME" \
      || fail "Failed to add worktree for existing branch $BRANCH_NAME"
  else
    log "Creating branch $BRANCH_NAME..."
    git -C "$MAINT_ROOT" worktree add -b "$BRANCH_NAME" "$WORKTREE_DIR" origin/main \
      || fail "Failed to create worktree/branch"
  fi

  # data/raw/ is gitignored (a build-time cache of upstream downloads); share
  # the maintainer's copy instead of re-downloading everything from scratch.
  rm -rf "$WORKTREE_DIR/data/raw"
  ln -s "$MAINT_ROOT/data/raw" "$WORKTREE_DIR/data/raw"

  log "Installing Python deps (uv sync)..."
  ( cd "$WORKTREE_DIR" && uv sync ) || fail "uv sync"
else
  log "(dry-run: would fetch origin/main and create a worktree at $WORKTREE_DIR for $BRANCH_NAME)"
fi

run_step() {
  local name="$1"
  shift
  CURRENT_STEP="$name"
  log "Running: $*"
  if [[ $DRY_RUN -eq 1 ]]; then
    log "(dry-run: would run '$*' in $WORKTREE_DIR)"
    return 0
  fi
  ( cd "$WORKTREE_DIR" && "$@" ) || fail "$name"
}

# Opens a PR for $BRANCH_NAME if origin doesn't already have an open one, and
# origin's copy of the branch actually has commits main doesn't. Called both
# after a fresh push and from the no-op path, so a run that pushed a commit
# but then died before opening the PR (a narrow window, but a real one) isn't
# left with a pushed branch and no PR once the next run finds nothing new to
# commit.
ensure_pr() {
  CURRENT_STEP="pr-create"
  if ! git -C "$WORKTREE_DIR" ls-remote --exit-code --heads origin "$BRANCH_NAME" >/dev/null 2>&1; then
    return 0
  fi
  git -C "$WORKTREE_DIR" fetch origin "$BRANCH_NAME" main >/dev/null 2>&1 || true
  local ahead
  ahead="$(git -C "$WORKTREE_DIR" rev-list --count "origin/main..origin/$BRANCH_NAME" 2>/dev/null || echo 0)"
  if [[ "$ahead" -eq 0 ]]; then
    return 0
  fi

  local existing_pr
  existing_pr="$(gh pr list --repo narendranag/global-energy-map --head "$BRANCH_NAME" \
    --state open --json number --jq '.[0].number // empty' 2>/dev/null || true)"

  if [[ -n "$existing_pr" ]]; then
    log "PR #$existing_pr is already open for $BRANCH_NAME; pushed an update, not opening a new PR."
    return 0
  fi

  log "Opening PR..."
  gh pr create --repo narendranag/global-energy-map --title "Data refresh: $BRANCH_DATE" \
    --head "$BRANCH_NAME" --base main \
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
)" || fail "pr-create"
}

# --- Data refresh ---
log "Starting data ingests..."

# GIE AGSI + ALSI (daily gas storage and LNG send-out). No per-day files —
# each (dataset, country) file covers the whole pinned range, so --force
# refetches all of it every month (~48 calls; see scripts/ingest/gie_daily.py).
run_step "GIE ingest" \
  uv run python -m scripts.ingest.gie_daily --to "$(date +%F)" --force

# UN Comtrade (monthly crude + LNG imports). Comtrade months arrive thin and
# backfill over roughly six months, so --force is needed to pick up revisions
# to months already on disk (see docs/refresh.md). Bound the forced window to
# the last ~7 months rather than the whole series, or a cron run would
# refetch years of history every time (each call is ~50s).
COMTRADE_FROM="$(date -v-6m +%Y%m)"
COMTRADE_TO="$(date -v-1m +%Y%m)"
run_step "Comtrade ingest" \
  uv run python -m scripts.ingest.comtrade_monthly --from "$COMTRADE_FROM" --to "$COMTRADE_TO" --force

# EIA STEO (shale regions). --force also refetches the static DPR county list
# and Census counties files every run; that's a few extra small requests, not
# worth a second flag to special-case (see docs/refresh.md).
run_step "EIA STEO ingest" \
  uv run python -m scripts.ingest.eia_steo --force

log "Data ingests complete."

# --- Build ---
log "Building public/data/..."
run_step "build_all" \
  uv run python -m scripts.build_all

# --- Tests ---
log "Running tests..."
run_step "pytest" \
  uv run python -m pytest tests/python -q

# --- Commit and PR ---
if [[ $DRY_RUN -eq 0 ]]; then
  CURRENT_STEP="diff-check"
  log "Checking what changed..."

  # Every tracked file the build touched, staged or not (status --porcelain
  # covers both modified-tracked and new-untracked paths).
  mapfile -t CHANGED_FILES < <(git -C "$WORKTREE_DIR" status --porcelain=v1 | sed -E 's/^.{3}//')

  if [[ ${#CHANGED_FILES[@]} -eq 0 ]]; then
    log "Build is byte-identical to origin/main; nothing to refresh this month."
    ensure_pr
    CURRENT_STEP="cleanup"
    git -C "$MAINT_ROOT" worktree remove "$WORKTREE_DIR" --force
    write_status "ok" "no changes"
    log "=== Refresh finished at $(date -u +'%Y-%m-%dT%H:%M:%SZ') (no-op) ==="
    trap - EXIT
    exit 0
  fi

  UNEXPECTED=()
  for f in "${CHANGED_FILES[@]}"; do
    allowed=0
    for prefix in "${ALLOWED_PREFIXES[@]}"; do
      if [[ "$f" == "$prefix"* || "$f" == "$prefix" ]]; then
        allowed=1
        break
      fi
    done
    [[ $allowed -eq 1 ]] || UNEXPECTED+=("$f")
  done

  if [[ ${#UNEXPECTED[@]} -gt 0 ]]; then
    fail "build_all touched file(s) outside the expected public/data/ + \
src/lib/export/citations.generated.json set: ${UNEXPECTED[*]}"
  fi

  log "Staging generated files..."
  git -C "$WORKTREE_DIR" add -- public/data src/lib/export/citations.generated.json

  if git -C "$WORKTREE_DIR" diff --cached --quiet; then
    log "Nothing staged after filtering; treating as no-op."
    ensure_pr
    CURRENT_STEP="cleanup"
    git -C "$MAINT_ROOT" worktree remove "$WORKTREE_DIR" --force
    write_status "ok" "no changes"
    trap - EXIT
    exit 0
  fi

  CURRENT_STEP="commit"
  log "Committing data refresh..."
  git -C "$WORKTREE_DIR" commit -m "$(cat <<'COMMIT_MSG'
Data refresh: GIE, Comtrade, EIA STEO

- GIE AGSI/ALSI updated to latest
- UN Comtrade monthly crude + LNG imports backfilled
- EIA STEO shale region production refreshed
- Public data rebuilt and tested
COMMIT_MSG
)" || fail "commit"

  CURRENT_STEP="push"
  log "Pushing branch..."
  git -C "$WORKTREE_DIR" push -u origin "$BRANCH_NAME" || fail "push"

  ensure_pr

  CURRENT_STEP="cleanup"
  log "Removing worktree..."
  git -C "$MAINT_ROOT" worktree remove "$WORKTREE_DIR" --force \
    || log "WARNING: could not remove worktree at $WORKTREE_DIR; remove it by hand."

  write_status "ok" "complete"
  log "Refresh complete. PR opened/updated."
else
  log "(dry-run: would ingest, build, test, commit, push, and open/update a PR)"
fi

log "=== Refresh finished at $(date -u +'%Y-%m-%dT%H:%M:%SZ') ==="
trap - EXIT
