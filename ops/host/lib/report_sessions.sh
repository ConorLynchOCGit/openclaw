#!/usr/bin/env bash

readonly DAILY_OPERATOR_REVIEW_SESSION_ID="daily-operator-review"
readonly DAILY_OPERATOR_REVIEW_SESSION_KEY="agent:main:${DAILY_OPERATOR_REVIEW_SESSION_ID}"
readonly DAILY_OPERATOR_REVIEW_SESSION_LABEL="Daily Operator Review"
readonly DAILY_OPERATOR_REVIEW_JOB_ID="dc4d04bb-9794-4af6-be68-a52de9886d05"

readonly WEEKLY_OPERATOR_REVIEW_SESSION_ID="weekly-operator-review"
readonly WEEKLY_OPERATOR_REVIEW_SESSION_KEY="agent:main:${WEEKLY_OPERATOR_REVIEW_SESSION_ID}"
readonly WEEKLY_OPERATOR_REVIEW_SESSION_LABEL="Weekly Operator Review"
readonly WEEKLY_OPERATOR_REVIEW_JOB_ID="9ed2aa1e-dc0d-4793-948a-10714aaafcf6"

readonly WEEKLY_MAINTENANCE_DEBT_GUARD_SESSION_ID="weekly-maintenance-debt-guard"
readonly WEEKLY_MAINTENANCE_DEBT_GUARD_SESSION_KEY="agent:chief:${WEEKLY_MAINTENANCE_DEBT_GUARD_SESSION_ID}"
readonly WEEKLY_MAINTENANCE_DEBT_GUARD_SESSION_LABEL="Weekly Maintenance Debt Guard"

report_session_store_path() {
  local agent_id="$1"
  printf '/root/.openclaw/agents/%s/sessions/sessions.json' "$agent_id"
}

report_session_jsonl_path() {
  local store_key="$1"

  python3 - "$store_key" <<'PY'
import json
import sys
from pathlib import Path

store_key = sys.argv[1]
parts = store_key.split(":", 2)
if len(parts) < 3 or parts[0] != "agent":
    raise SystemExit(f"invalid session key: {store_key}")

agent_id = parts[1]
store_path = Path(f"/root/.openclaw/agents/{agent_id}/sessions/sessions.json")
if not store_path.exists():
    raise SystemExit(f"missing session store: {store_path}")

store = json.loads(store_path.read_text())
entry = store.get(store_key)
if not isinstance(entry, dict):
    raise SystemExit(f"missing session entry for {store_key}")

session_id = entry.get("sessionId")
if not isinstance(session_id, str) or not session_id.strip():
    raise SystemExit(f"missing session id for {store_key}")

session_jsonl = store_path.parent / f"{session_id}.jsonl"
if not session_jsonl.exists():
    raise SystemExit(f"missing session log: {session_jsonl}")

print(session_jsonl)
PY
}

report_latest_cron_run_session_jsonl_path() {
  local job_id="$1"
  local agent_id="$2"

  python3 - "$job_id" "$agent_id" <<'PY'
import json
import sys
from pathlib import Path

job_id = sys.argv[1]
agent_id = sys.argv[2]
run_log_path = Path(f"/root/.openclaw/cron/runs/{job_id}.jsonl")
if not run_log_path.exists():
    raise SystemExit(f"missing cron run log: {run_log_path}")

session_id = None
for line in reversed(run_log_path.read_text().splitlines()):
    try:
        payload = json.loads(line)
    except json.JSONDecodeError:
        continue
    if payload.get("action") != "finished" or payload.get("status") != "ok":
        continue
    candidate = payload.get("sessionId")
    if isinstance(candidate, str) and candidate.strip():
        session_id = candidate
        break

if not session_id:
    raise SystemExit(f"no successful cron run session id found for {job_id}")

session_jsonl = Path(f"/root/.openclaw/agents/{agent_id}/sessions/{session_id}.jsonl")
if not session_jsonl.exists():
    raise SystemExit(f"missing session log for cron run: {session_jsonl}")

print(session_jsonl)
PY
}

report_operator_review_session_jsonl_path() {
  local cadence="$1"

  case "$cadence" in
    daily)
      report_latest_cron_run_session_jsonl_path "$DAILY_OPERATOR_REVIEW_JOB_ID" "main" \
        || report_session_jsonl_path "$DAILY_OPERATOR_REVIEW_SESSION_KEY"
      ;;
    weekly)
      report_latest_cron_run_session_jsonl_path "$WEEKLY_OPERATOR_REVIEW_JOB_ID" "main" \
        || report_session_jsonl_path "$WEEKLY_OPERATOR_REVIEW_SESSION_KEY"
      ;;
    *)
      echo "unsupported operator review cadence: $cadence" >&2
      return 1
      ;;
  esac
}
