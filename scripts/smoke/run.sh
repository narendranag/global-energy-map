#!/usr/bin/env bash
# scripts/smoke/run.sh — the same post-deploy smoke the workflow runs, locally.
#
#   scripts/smoke/run.sh                                   # production
#   scripts/smoke/run.sh https://<deployment>.vercel.app   # any deployment
#
# Needs `pnpm install` and `pnpm exec playwright install chromium` once.
# Optional: VERCEL_AUTOMATION_BYPASS_SECRET for protected preview URLs.
set -euo pipefail

URL="${1:-https://energymap.marain.space}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "== HTTP checks"
node scripts/smoke/smoke.mjs "$URL"

echo
echo "== Browser check"
SMOKE_URL="$URL" pnpm exec playwright test -c scripts/smoke/playwright.config.ts
