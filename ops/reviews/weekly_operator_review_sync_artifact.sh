#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORKSPACE="${OPENCLAW_WORKSPACE_DIR:-/root/.openclaw/workspace}"
source "$REPO_ROOT/ops/host/lib/report_sessions.sh"
WEEK_ID="$(date +%G-W%V)"
ARTIFACT="$WORKSPACE/archives/weekly_operator_reviews/${WEEK_ID}.md"

mkdir -p "$(dirname "$ARTIFACT")"

SESSION_JSONL="$(report_operator_review_session_jsonl_path weekly)"

WEEK_ID="$WEEK_ID" SESSION_JSONL="$SESSION_JSONL" ARTIFACT="$ARTIFACT" python3 - <<'PY'
import json
import os
from pathlib import Path

week_id = os.environ["WEEK_ID"]
session_jsonl = os.environ["SESSION_JSONL"]
artifact = os.environ["ARTIFACT"]

needle = f"# Weekly Operator Review — {week_id}"
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
    raise SystemExit(f"weekly review artifact text not found for {week_id}")

Path(artifact).write_text(match)
PY

chown ubuntu:ubuntu "$ARTIFACT"
printf 'weekly operator review artifact synced: %s\n' "$ARTIFACT"
