#!/usr/bin/env bash
set -euo pipefail

WORKSPACE="${OPENCLAW_WORKSPACE_DIR:-/root/.openclaw/workspace}"
ARCHIVE_DIR="$WORKSPACE/archives/cache_hygiene"
STAMP_ID="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$ARCHIVE_DIR/${STAMP_ID}.md"
APPLY=0
FREE_PRESSURE_GB=30
PNPM_PRUNE_MIN_GB=8
PLAYWRIGHT_STALE_DAYS=30

if [[ "${1:-}" == "--apply" ]]; then
  APPLY=1
elif [[ "${1:-}" != "" ]]; then
  echo "usage: $0 [--apply]" >&2
  exit 2
fi

mkdir -p "$ARCHIVE_DIR"

size_bytes() {
  local target="$1"
  if [[ ! -e "$target" ]]; then
    echo 0
    return
  fi
  du -sb "$target" 2>/dev/null | awk '{print $1}'
}

fmt_gb() {
  python3 - <<'PY' "$1"
import sys
print(f"{int(sys.argv[1]) / (1024**3):.2f}G")
PY
}

dir_age_days() {
  local target="$1"
  if [[ ! -e "$target" ]]; then
    echo 99999
    return
  fi
  python3 - <<'PY' "$target"
import os, sys, time
mtime = os.stat(sys.argv[1]).st_mtime
print(int((time.time() - mtime) // 86400))
PY
}

FREE_BYTES="$(df -B1 / | awk 'NR==2 {print $4}')"
PNPM_STORE="/root/.local/share/pnpm/store"
NPM_CACHE="/root/.npm"
PLAYWRIGHT_CACHE="/root/.cache/ms-playwright"

PNPM_BYTES="$(size_bytes "$PNPM_STORE")"
NPM_BYTES="$(size_bytes "$NPM_CACHE")"
PLAYWRIGHT_BYTES="$(size_bytes "$PLAYWRIGHT_CACHE")"
PLAYWRIGHT_AGE_DAYS="$(dir_age_days "$PLAYWRIGHT_CACHE")"

PNPM_ACTION="keep"
NPM_ACTION="keep"
PLAYWRIGHT_ACTION="keep"

if [[ "$FREE_BYTES" -lt $((FREE_PRESSURE_GB * 1024 * 1024 * 1024)) && "$PNPM_BYTES" -ge $((PNPM_PRUNE_MIN_GB * 1024 * 1024 * 1024)) ]]; then
  PNPM_ACTION="prune-on-pressure"
fi

NPM_ACTION="prune-monthly-or-pressure"

if [[ "$PLAYWRIGHT_AGE_DAYS" -ge "$PLAYWRIGHT_STALE_DAYS" || "$FREE_BYTES" -lt $((FREE_PRESSURE_GB * 1024 * 1024 * 1024)) ]]; then
  PLAYWRIGHT_ACTION="prune-when-stale-or-under-pressure"
fi

REMOVAL_LOG=""

if [[ "$APPLY" == "1" ]]; then
  if [[ "$PNPM_ACTION" == "prune-on-pressure" ]]; then
    REMOVAL_LOG+=$'## pnpm Store Prune\n\n```text\n'
    REMOVAL_LOG+="$(pnpm store prune 2>&1)"$'\n'
    REMOVAL_LOG+=$'```\n\n'
  fi

  REMOVAL_LOG+=$'## npm Cache Maintenance\n\n```text\n'
  REMOVAL_LOG+="$(npm cache clean --force 2>&1)"$'\n'
  REMOVAL_LOG+=$'```\n\n'

  if [[ "$PLAYWRIGHT_ACTION" == "prune-when-stale-or-under-pressure" && -d "$PLAYWRIGHT_CACHE" ]]; then
    REMOVAL_LOG+=$'## Playwright Cache Prune\n\n```text\n'
    rm -rf "$PLAYWRIGHT_CACHE"
    REMOVAL_LOG+="removed $PLAYWRIGHT_CACHE"$'\n'
    REMOVAL_LOG+=$'```\n\n'
  fi
fi

POST_PNPM_BYTES="$(size_bytes "$PNPM_STORE")"
POST_NPM_BYTES="$(size_bytes "$NPM_CACHE")"
POST_PLAYWRIGHT_BYTES="$(size_bytes "$PLAYWRIGHT_CACHE")"

cat > /tmp/cache_hygiene_report.$$ <<EOF
# Cache Hygiene Report

- generated_at_utc: ${STAMP_ID}
- mode: $( [[ "$APPLY" == "1" ]] && echo "apply" || echo "dry-run" )
- free_space_pressure_threshold_gb: ${FREE_PRESSURE_GB}
- pnpm_prune_min_gb: ${PNPM_PRUNE_MIN_GB}
- playwright_stale_days: ${PLAYWRIGHT_STALE_DAYS}

## Pre-Run Cache State

- pnpm_store: $(fmt_gb "$PNPM_BYTES")
- npm_cache: $(fmt_gb "$NPM_BYTES")
- playwright_cache: $(fmt_gb "$PLAYWRIGHT_BYTES")
- playwright_cache_age_days: ${PLAYWRIGHT_AGE_DAYS}

## Policy

- pnpm_store_policy: \`keep by default; prune only on disk pressure and only when the store is large\`
- npm_cache_policy: \`prune monthly or under disk pressure\`
- playwright_cache_policy: \`keep while active; prune when stale or under disk pressure\`

## Current Decisions

- pnpm_store_action: \`${PNPM_ACTION}\`
- npm_cache_action: \`${NPM_ACTION}\`
- playwright_cache_action: \`${PLAYWRIGHT_ACTION}\`

${REMOVAL_LOG}

## Post-Run Cache State

- pnpm_store: $(fmt_gb "$POST_PNPM_BYTES")
- npm_cache: $(fmt_gb "$POST_NPM_BYTES")
- playwright_cache: $(fmt_gb "$POST_PLAYWRIGHT_BYTES")

## Reading

- This script is conservative by design.
- It does not prune the pnpm store unless the host is under space pressure.
- The monthly apply mode is intended mainly for npm cache hygiene and stale Playwright cache cleanup.
EOF

mv /tmp/cache_hygiene_report.$$ "$OUT"
echo "cache hygiene report written: $OUT"
