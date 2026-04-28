#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORKSPACE="${OPENCLAW_WORKSPACE_DIR:-/root/.openclaw/workspace}"
source "$REPO_ROOT/ops/host/lib/report_sessions.sh"
TODAY="${DATE_ID:-$(date +%F)}"
ARTIFACT="$WORKSPACE/archives/daily_operator_reviews/${TODAY}.md"
RUN_LOG="/root/.openclaw/cron/runs/${DAILY_OPERATOR_REVIEW_JOB_ID}.jsonl"

mkdir -p "$(dirname "$ARTIFACT")"

SESSION_JSONL="$(report_operator_review_session_jsonl_path daily)"

TODAY="$TODAY" SESSION_JSONL="$SESSION_JSONL" RUN_LOG="$RUN_LOG" ARTIFACT="$ARTIFACT" python3 - <<'PY'
import json
import os
from pathlib import Path

today = os.environ["TODAY"]
session_jsonl = os.environ["SESSION_JSONL"]
run_log = os.environ["RUN_LOG"]
artifact = os.environ["ARTIFACT"]

needle = f"# Daily Operator Review — {today}"
match = None

def extract_from_session(path: Path) -> str | None:
    if not path.exists():
        return None
    for line in reversed(path.read_text().splitlines()):
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            continue
        message = payload.get("message") or {}
        if message.get("role") != "assistant":
            continue
        for chunk in message.get("content", []):
            if not isinstance(chunk, dict) or chunk.get("type") != "text":
                continue
            text = chunk.get("text", "")
            if isinstance(text, str) and needle in text:
                return text[text.index(needle) :].strip() + "\n"
    return None

def extract_from_run_log(path: Path) -> str | None:
    if not path.exists():
        return None
    for line in reversed(path.read_text().splitlines()):
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            continue
        if payload.get("status") != "ok":
            continue
        text = payload.get("summary", "")
        if isinstance(text, str) and needle in text:
            return text[text.index(needle) :].strip() + "\n"
    return None

match = extract_from_session(Path(session_jsonl)) or extract_from_run_log(Path(run_log))

if not match:
    raise SystemExit(f"daily operator review artifact text not found for {today}")

Path(artifact).write_text(match)
PY

chown ubuntu:ubuntu "$ARTIFACT"
printf 'daily operator review artifact synced: %s\n' "$ARTIFACT"
