#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORKSPACE="${OPENCLAW_WORKSPACE_DIR:-/root/.openclaw/workspace}"
OPS_DIR="$WORKSPACE/projects/ops"
ARCHIVE_DIR="$WORKSPACE/archives/cron_health_rollups"
DATE_ID="$(date +%F)"
OUT="$ARCHIVE_DIR/${DATE_ID}.md"
OPENCLAW_CONTAINER="${OPENCLAW_CONTAINER:-$(docker ps --format '{{.Names}}' | grep -E '^openclaw-runtime$|^openclaw$|openclaw.*gateway' | head -n 1)}"

mkdir -p "$OPS_DIR" "$ARCHIVE_DIR"

if [ -z "$OPENCLAW_CONTAINER" ]; then
  echo "OpenClaw gateway container not found" >&2
  exit 1
fi

HOST_CRONTAB="$(crontab -l 2>/dev/null || true)"
NATIVE_CRONS_JSON="$(docker exec "$OPENCLAW_CONTAINER" sh -lc 'openclaw cron list --all --json' || true)"
NATIVE_RUNS_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$NATIVE_RUNS_DIR"
}
trap cleanup EXIT

printf '%s' "$NATIVE_CRONS_JSON" | jq -r '.jobs[]?.id // empty' | while read -r job_id; do
  [ -n "$job_id" ] || continue
  docker exec "$OPENCLAW_CONTAINER" sh -lc "openclaw cron runs --id $job_id --limit 20" > "$NATIVE_RUNS_DIR/${job_id}.json" || true
done

HOST_CRONTAB="$HOST_CRONTAB" \
NATIVE_CRONS_JSON="$NATIVE_CRONS_JSON" \
NATIVE_RUNS_DIR="$NATIVE_RUNS_DIR" \
WORKSPACE="$WORKSPACE" \
OUT="$OUT" \
DATE_ID="$DATE_ID" \
python3 - <<'PY'
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

out = Path(os.environ["OUT"])
date_id = os.environ["DATE_ID"]
workspace = Path(os.environ["WORKSPACE"])
host_crontab = os.environ["HOST_CRONTAB"]
host_active_crontab = "\n".join(
    line
    for line in host_crontab.splitlines()
    if line.strip() and not line.lstrip().startswith("#")
)
native_crons = json.loads(os.environ["NATIVE_CRONS_JSON"] or "{}").get("jobs", [])
runs_dir = Path(os.environ["NATIVE_RUNS_DIR"])
week_id = datetime.now(timezone.utc).strftime("%G-W%V")

HOST_JOBS = [
    {
        "name": "n8n_sync_check.sh",
        "pattern": "/root/services/openclaw-roles/live/ops/host/n8n_sync_check.sh",
        "schedule": "Daily 09:00 America/Nassau",
        "log": "/root/backups/cron-logs/n8n_sync_check.log",
        "delivery": "not-applicable",
    },
    {
        "name": "db_probe.sh",
        "pattern": "/root/services/openclaw-roles/live/ops/host/db_probe.sh",
        "schedule": "Daily 09:05 America/Nassau",
        "log": "/root/backups/cron-logs/db_probe.log",
        "delivery": "not-applicable",
    },
    {
        "name": "github_digest_telegram.sh",
        "pattern": "/root/services/openclaw-roles/live/ops/github/github_digest_telegram.sh",
        "schedule": "Weekdays 09:10 America/Nassau",
        "log": "/root/backups/cron-logs/github_digest.log",
        "delivery": "telegram-via-chief",
    },
    {
        "name": "cron_health_rollup.sh",
        "pattern": "/root/services/openclaw-roles/live/ops/host/cron_health_rollup.sh",
        "schedule": "Weekdays 09:12 America/Nassau",
        "log": "/root/backups/cron-logs/cron_health_rollup.log",
        "delivery": "not-applicable",
    },
    {
        "name": "memory_soak_db_report.sh",
        "pattern": "/root/.openclaw/workspace/projects/ops/memory_soak_db_report.sh",
        "schedule": "Daily 08:33 America/Nassau",
        "log": "/root/backups/cron-logs/memory_soak_db_report.log",
        "delivery": "not-applicable",
        "retired_by": "VPS consolidation; host crontab lane is disabled and archived logs are not current health evidence",
    },
    {
        "name": "memory_performance_report.sh",
        "pattern": "/root/.openclaw/workspace/projects/ops/memory_performance_report.sh",
        "schedule": "Daily 08:37 America/Nassau",
        "log": "/root/backups/cron-logs/memory_performance_report.log",
        "delivery": "not-applicable",
        "retired_by": "VPS consolidation; host crontab lane is disabled and archived logs are not current health evidence",
    },
    {
        "name": "daily_memory_evidence_rollup.sh",
        "pattern": "/root/.openclaw/workspace/projects/ops/daily_memory_evidence_rollup.sh",
        "schedule": "Daily 08:42 America/Nassau",
        "log": "/root/backups/cron-logs/daily_memory_evidence_rollup.log",
        "delivery": "not-applicable",
        "retired_by": "daily operator review prep now generates the current daily memory evidence artifact",
    },
    {
        "name": "daily_operator_review_prep.sh",
        "pattern": "/root/services/openclaw-roles/live/ops/reviews/daily_operator_review_prep.sh",
        "schedule": "Daily 08:43 America/Nassau",
        "log": "/root/backups/cron-logs/daily_operator_review_prep.log",
        "delivery": "not-applicable",
    },
    {
        "name": "daily_operator_review_sync_artifact.sh",
        "pattern": "/root/services/openclaw-roles/live/ops/reviews/daily_operator_review_sync_artifact.sh",
        "schedule": "Daily 08:47 America/Nassau",
        "log": "/root/backups/cron-logs/daily_operator_review_sync.log",
        "delivery": "not-applicable",
        "artifact": "archives/daily_operator_reviews/{date_id}.md",
        "latest_artifact_glob": "archives/daily_operator_reviews/*.md",
    },
    {
        "name": "n8n_inactive_workflow_review.sh",
        "pattern": "/root/services/openclaw-roles/live/ops/host/n8n_inactive_workflow_review.sh",
        "schedule": "Monday 09:16 America/Nassau",
        "log": "/root/backups/cron-logs/n8n_inactive_workflow_review.log",
        "delivery": "not-applicable",
    },
    {
        "name": "weekly_operator_review_prep.sh",
        "pattern": "/root/services/openclaw-roles/live/ops/reviews/weekly_operator_review_prep.sh",
        "schedule": "Monday 09:18 America/Nassau",
        "log": "/root/backups/cron-logs/weekly_operator_review_prep.log",
        "delivery": "not-applicable",
    },
    {
        "name": "weekly_operator_review_sync_artifact.sh",
        "pattern": "/root/services/openclaw-roles/live/ops/reviews/weekly_operator_review_sync_artifact.sh",
        "schedule": "Monday 09:21 America/Nassau",
        "log": "/root/backups/cron-logs/weekly_operator_review_sync.log",
        "delivery": "not-applicable",
        "artifact": "archives/weekly_operator_reviews/{week_id}.md",
    },
    {
        "name": "weekly_operator_review_telegram_bridge.sh",
        "pattern": "/root/services/openclaw-roles/live/ops/reviews/weekly_operator_review_telegram_bridge.sh",
        "schedule": "Monday 09:23 America/Nassau",
        "log": "/root/backups/cron-logs/weekly_operator_review_telegram.log",
        "delivery": "telegram-via-chief",
    },
]

def fmt_ms(ms):
    if not ms:
        return "none"
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

def host_enabled(pattern: str) -> bool:
    return pattern in host_active_crontab

def host_log_info(path_str: str):
    path = Path(path_str)
    if not path.exists():
        return {
            "last_run_status": "no-log-yet",
            "last_successful_run": "none",
            "consecutive_errors": "unknown-from-log-only",
            "last_delivery_outcome": "unknown",
            "note": "log file not created yet",
        }
    text = path.read_text(errors="replace").strip()
    mtime = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    recent_text = "\n".join(lines[-5:])
    last_line = lines[-1] if lines else ""
    healthy_markers = [
        "Aligned:",
        "1|1|1",
        "status\": \"ok\"",
        "\"status\": \"ok\"",
        "delivered",
        "Weekly Operator Review ",
        "prep wrote:",
        "artifact synced:",
        "preview-only:",
        "roll-up written:",
        "review written:",
        "evidence written:",
    ]
    if not text:
        status = "no-output-yet"
        last_success = "none"
    elif any(marker in recent_text for marker in healthy_markers):
        status = "ok"
        last_success = mtime
    elif re.search(r"\berror\b|\bfailed\b|\bmissing\b|\bproblem\b", recent_text, re.IGNORECASE):
        status = "problem"
        last_success = "unknown-from-log-only"
    else:
        status = "unknown"
        last_success = "unknown-from-log-only"

    delivery = "not-applicable"
    if "telegram" in path.name or "digest" in path.name:
        if (
            "delivered" in recent_text
            or '"status": "ok"' in recent_text
            or "Weekly Operator Review " in recent_text
            or "preview-only:" in recent_text
        ):
            delivery = "delivered-or-ok-bridge-run"
        elif recent_text:
            delivery = "unknown-from-log-only"

    return {
        "last_run_status": status,
        "last_successful_run": last_success,
        "consecutive_errors": "unknown-from-log-only",
        "last_delivery_outcome": delivery,
        "note": f"log mtime {mtime}; last line: {last_line or 'none'}",
    }

def host_artifact_info(job):
    artifact_template = job.get("artifact")
    if not artifact_template:
        return None
    artifact_path = workspace / artifact_template.format(date_id=date_id, week_id=week_id)
    artifact_is_current = True
    if not artifact_path.exists():
        latest_glob = job.get("latest_artifact_glob")
        if not latest_glob:
            return None
        candidates = sorted(
            path
            for path in workspace.glob(latest_glob)
            if path.is_file() and path.stat().st_size > 0 and path.stem <= date_id
        )
        if not candidates:
            return None
        artifact_path = candidates[-1]
        artifact_is_current = False
    mtime = datetime.fromtimestamp(artifact_path.stat().st_mtime, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    relative_path = artifact_path.relative_to(workspace)
    if artifact_path.stat().st_size <= 0:
        return {
            "last_run_status": "problem",
            "last_successful_run": "none",
            "consecutive_errors": "unknown-from-log-only",
            "last_delivery_outcome": "not-applicable",
            "note": f"expected artifact is empty: {relative_path}",
        }
    currency_note = "artifact present" if artifact_is_current else "latest prior artifact present"
    return {
        "last_run_status": "ok",
        "last_successful_run": mtime,
        "consecutive_errors": "unknown-from-log-only",
        "last_delivery_outcome": "not-applicable",
        "note": f"{currency_note}: {relative_path} ({artifact_path.stat().st_size} bytes, mtime {mtime})",
    }

def native_runs(job_id: str):
    file_name = f"{job_id}.json"
    path = runs_dir / file_name
    if not path.exists():
        return []
    data = json.loads(path.read_text())
    return data.get("entries", [])

def last_ok_run(entries):
    for entry in entries:
        if entry.get("status") == "ok":
            return fmt_ms(entry.get("runAtMs"))
    return "none"

host_rows = []
for job in HOST_JOBS:
    enabled = host_enabled(job["pattern"])
    if enabled:
        info = host_artifact_info(job) or host_log_info(job["log"])
        enabled_label = "enabled"
    elif job.get("retired_by"):
        info = {
            "last_run_status": "retired",
            "last_successful_run": "none",
            "consecutive_errors": "not-applicable",
            "last_delivery_outcome": "not-applicable",
            "note": job["retired_by"],
        }
        enabled_label = "retired"
    else:
        info = {
            "last_run_status": "disabled-or-not-installed",
            "last_successful_run": "none",
            "consecutive_errors": "not-applicable",
            "last_delivery_outcome": "not-applicable",
            "note": "not present in active host crontab; archived logs ignored",
        }
        enabled_label = "disabled-or-not-installed"
    host_rows.append({
        "name": job["name"],
        "enabled": enabled_label,
        "schedule": job["schedule"],
        "last_run_status": info["last_run_status"],
        "consecutive_errors": info["consecutive_errors"],
        "last_successful_run": info["last_successful_run"],
        "last_delivery_outcome": info["last_delivery_outcome"],
        "source_inputs": f"host crontab + {job['log']}",
        "note": info["note"],
    })

native_rows = []
for job in native_crons:
    entries = native_runs(job["id"])
    state = job.get("state") or {}
    last_successful_run = (
        fmt_ms(state.get("lastRunAtMs"))
        if state.get("lastRunStatus") == "ok"
        else last_ok_run(entries)
    )
    native_rows.append({
        "name": job["name"],
        "enabled": "enabled" if job.get("enabled") else "disabled",
        "schedule": (
            f"{job.get('schedule', {}).get('expr')} {job.get('schedule', {}).get('tz')}"
            if job.get("schedule", {}).get("kind") == "cron"
            else f"{job.get('schedule', {}).get('kind')} {job.get('schedule', {}).get('at', '')}".strip()
        ),
        "last_run_status": state.get("lastRunStatus", "unknown"),
        "consecutive_errors": state.get("consecutiveErrors", "unknown"),
        "last_successful_run": last_successful_run,
        "last_delivery_outcome": state.get("lastDeliveryStatus", "not-requested"),
        "source_inputs": f"openclaw cron list --all --json + openclaw cron runs --id {job['id']}",
        "note": f"last run {fmt_ms(state.get('lastRunAtMs'))}; next run {fmt_ms(state.get('nextRunAtMs'))}",
    })

lines = [
    f"# Cron Health Roll-Up — {date_id}",
    "",
    f"Generated at: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}",
    "",
    "Scope: host cron jobs plus native OpenClaw cron jobs.",
    "Source inputs: host crontab, OpenClaw native cron state/history, existing cron logs under `/root/backups/cron-logs`.",
    "",
    "## Host Jobs",
    "",
    "| Job | Enabled | Schedule | Last Run Status | Consecutive Errors | Last Successful Run | Last Delivery Outcome |",
    "|---|---|---|---|---|---|---|",
]

for row in host_rows:
    lines.append(
        f"| {row['name']} | {row['enabled']} | {row['schedule']} | {row['last_run_status']} | {row['consecutive_errors']} | {row['last_successful_run']} | {row['last_delivery_outcome']} |"
    )

lines.extend(["", "### Host Notes", ""])
for row in host_rows:
    lines.append(f"- `{row['name']}`: {row['note']} ({row['source_inputs']})")

lines.extend([
    "",
    "## Native OpenClaw Jobs",
    "",
    "| Job | Enabled | Schedule | Last Run Status | Consecutive Errors | Last Successful Run | Last Delivery Outcome |",
    "|---|---|---|---|---|---|---|",
])

for row in native_rows:
    lines.append(
        f"| {row['name']} | {row['enabled']} | {row['schedule']} | {row['last_run_status']} | {row['consecutive_errors']} | {row['last_successful_run']} | {row['last_delivery_outcome']} |"
    )

lines.extend(["", "### Native Notes", ""])
for row in native_rows:
    lines.append(f"- `{row['name']}`: {row['note']} ({row['source_inputs']})")

lines.extend([
    "",
    "## Operator Notes",
    "",
    "- Host jobs remain log-derived in v1. When a host log does not record structured success/error history, `consecutive_errors` and some delivery fields remain `unknown-from-log-only` rather than guessed.",
    "- Native jobs use OpenClaw's runtime state plus run history, so `consecutive_errors`, `last_run_status`, `last_successful_run`, and `last_delivery_outcome` are authoritative there.",
])

out.write_text("\n".join(lines) + "\n")
PY

chown ubuntu:ubuntu "$OUT"
printf 'cron health roll-up written: %s\n' "$OUT"
