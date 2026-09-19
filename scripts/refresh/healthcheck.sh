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
warn() {
  echo "WARNING: $*" >&2
}

fail() {
  echo "CRITICAL: $*" >&2
  exit 1
}

# --- Main ---

# Check that the status file exists
if [[ ! -f "$STATUS_FILE" ]]; then
  fail "No refresh status file found at $STATUS_FILE. Refresh has never run?"
fi

# Read the status JSON
if ! status_json=$(cat "$STATUS_FILE" 2>/dev/null); then
  fail "Could not read status file: $STATUS_FILE"
fi

# Parse JSON (simple grep-based parsing for portability)
status=$(echo "$status_json" | grep -o '"status": "[^"]*"' | cut -d'"' -f4 || echo "unknown")
timestamp=$(echo "$status_json" | grep -o '"timestamp": "[^"]*"' | cut -d'"' -f4 || echo "")
step=$(echo "$status_json" | grep -o '"step": "[^"]*"' | cut -d'"' -f4 || echo "unknown")

# Check status
if [[ "$status" != "ok" ]]; then
  fail "Last refresh failed at step '$step'. Status: $status. Timestamp: $timestamp"
fi

# Check age (40 days = 3456000 seconds)
if [[ -z "$timestamp" ]]; then
  fail "Could not parse timestamp from status file"
fi

# Convert ISO8601 timestamp to epoch seconds
if ! last_run_epoch=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$timestamp" +%s 2>/dev/null); then
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
