#!/bin/bash
#
# Health check for scheduled data refresh.
# Reads the status JSON written by monthly.sh and exits non-zero if:
# - The last run failed
# - No run has happened in 40 days (indicates launchd not running)
#
# Usage in monitoring tools:
#   scripts/refresh/healthcheck.sh
#   echo "refresh status: $?"
#
set -euo pipefail

STATUS_FILE="$HOME/Library/Logs/global-energy-map/refresh-status.json"

# --- Functions ---
fail() {
  echo "CRITICAL: $*" >&2
  exit 1
}

# --- Main ---

command -v jq >/dev/null 2>&1 || fail "jq is required to parse $STATUS_FILE but was not found on PATH"

if [[ ! -f "$STATUS_FILE" ]]; then
  fail "No refresh status file found at $STATUS_FILE. Refresh has never run?"
fi

if ! status_json=$(cat "$STATUS_FILE" 2>/dev/null); then
  fail "Could not read status file: $STATUS_FILE"
fi

if ! echo "$status_json" | jq -e . >/dev/null 2>&1; then
  fail "Status file is not valid JSON: $STATUS_FILE"
fi

status=$(echo "$status_json" | jq -r '.status // "unknown"')
timestamp=$(echo "$status_json" | jq -r '.timestamp // empty')
step=$(echo "$status_json" | jq -r '.step // "unknown"')
worktree=$(echo "$status_json" | jq -r '.worktree // empty')
worktree_kept=$(echo "$status_json" | jq -r '.worktree_kept // false')

if [[ "$status" != "ok" ]]; then
  extra=""
  if [[ "$worktree_kept" == "true" && -n "$worktree" ]]; then
    extra=" Worktree kept for inspection: $worktree"
  fi
  fail "Last refresh failed at step '$step'. Status: $status. Timestamp: $timestamp.$extra"
fi

if [[ -z "$timestamp" ]]; then
  fail "Could not parse timestamp from status file"
fi

# Convert ISO8601 UTC timestamp ("2026-09-19T14:04:24Z") to epoch seconds.
# macOS `date -j -f` parses in the local timezone by default, so force UTC
# with -u to match how monthly.sh writes the timestamp (`date -u ...`) —
# otherwise every check is off by the local UTC offset.
if ! last_run_epoch=$(TZ=UTC date -j -u -f "%Y-%m-%dT%H:%M:%SZ" "$timestamp" +%s 2>/dev/null); then
  fail "Could not parse timestamp: $timestamp"
fi

now_epoch=$(date +%s)
age_seconds=$((now_epoch - last_run_epoch))
max_age_seconds=$((40 * 86400))  # 40 days

if (( age_seconds > max_age_seconds )); then
  days=$((age_seconds / 86400))
  fail "Last refresh was $days days ago (max allowed: 40). Launchd may not be running."
fi

echo "OK: Last refresh at $timestamp (${age_seconds}s ago). Status: $status."
exit 0
