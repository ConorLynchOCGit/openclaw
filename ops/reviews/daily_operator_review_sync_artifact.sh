#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORKSPACE="${OPENCLAW_WORKSPACE_DIR:-/root/.openclaw/workspace}"
source "$REPO_ROOT/ops/host/lib/report_sessions.sh"
TODAY="$(date +%F)"
ARTIFACT="$WORKSPACE/archives/daily_operator_reviews/${TODAY}.md"

mkdir -p "$(dirname "$ARTIFACT")"

SESSION_JSONL="$(report_operator_review_session_jsonl_path daily)"

TODAY="$TODAY" SESSION_JSONL="$SESSION_JSONL" ARTIFACT="$ARTIFACT" python3 - <<'PY'
import json
import os
from pathlib import Path

today = os.environ["TODAY"]
session_jsonl = os.environ["SESSION_JSONL"]
artifact = os.environ["ARTIFACT"]

needle = f"# Daily Operator Review — {today}"
lines = Path(session_jsonl).read_text().splitlines()
match = None

for line in reversed(lines):
    try:
        payload = json.loads(line)
    except json.JSONDecodeError:
        continue
    message = payload.get("message") or {}
    if message.get("role") != "assistant":
        continue
    for chunk in message.get("content", []):
        if chunk.get("type") != "text":
            continue
        text = chunk.get("text", "")
        if needle in text:
            start = text.index(needle)
            match = text[start:].strip() + "\n"
            break
    if match:
        break

if not match:
    raise SystemExit(f"daily operator review artifact text not found for {today}")

Path(artifact).write_text(match)
PY

chown ubuntu:ubuntu "$ARTIFACT"
printf 'daily operator review artifact synced: %s\n' "$ARTIFACT"
