#!/usr/bin/env bash
set -euo pipefail

WORKSPACE="${OPENCLAW_WORKSPACE_DIR:-/root/.openclaw/workspace}"
ARCHIVE_DIR="$WORKSPACE/archives/cron_session_hygiene"
OUT="$ARCHIVE_DIR/$(date +%F).md"
TMP_NATIVE="$(mktemp)"
TMP_HOST="$(mktemp)"

cleanup() {
  rm -f "$TMP_NATIVE" "$TMP_HOST"
}
trap cleanup EXIT

mkdir -p "$ARCHIVE_DIR"

OPENCLAW_CONTAINER="${OPENCLAW_CONTAINER:-$(docker ps --format '{{.Names}}' | grep -E '^openclaw-runtime$|^openclaw$|openclaw.*gateway' | head -n 1)}"

if [ -z "$OPENCLAW_CONTAINER" ]; then
  echo "OpenClaw gateway container not found" >&2
  exit 1
fi

docker exec "$OPENCLAW_CONTAINER" sh -lc 'openclaw cron list --all --json' > "$TMP_NATIVE"
crontab -l > "$TMP_HOST"

python3 - <<'PY' "$TMP_NATIVE" "$TMP_HOST" "$OUT"
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

native_path = Path(sys.argv[1])
host_path = Path(sys.argv[2])
out_path = Path(sys.argv[3])

THRESHOLD_TOTAL = 12
THRESHOLD_PER_AGENT = 5

def classify_session(agent: str, key: str) -> str:
    normalized = (key or "").strip().lower()
    if not normalized:
        return "other"
    canonical = {
        "agent:main:main",
        "agent:chief:main",
        "agent:chief:telegram:direct:7756506076",
        "agent:builder:main",
        "agent:writer:main",
        "agent:x-manager:main",
        "agent:web-researcher:main",
    }
    if normalized in canonical:
        return "canonical operational"
    if ":cron:" in normalized:
        return "cron"
    if any(token in normalized for token in ["proof", "dry-run", "dry_run", "smoke", "phase10", "openaicodex"]):
        return "proof/test"
    if (
        "dashboard:w" in normalized
        or re.search(r"(^|[:.-])w(?:5|6|6d|8|9|10|11|14|15|16)[0-9a-z-]*(?:[:.-]|$)", normalized)
        or any(token in normalized for token in ["delegate", "fresh", "routing-verification"])
        or re.search(r"g-agent-[^:]*-w[0-9a-z-]+", normalized)
        or any(token in normalized for token in [":example:", ":clawhub:", ":react:", ":docs:"])
    ):
        return "delegation/temp verification"
    if ":direct:" in normalized or ":group:" in normalized or ":channel:" in normalized:
        return "transport/direct"
    return "other"

native = json.loads(native_path.read_text())
jobs = native.get("jobs", [])
host_lines = [line.rstrip() for line in host_path.read_text().splitlines() if line.strip()]

enabled_jobs = [job for job in jobs if job.get("enabled")]
disabled_jobs = [job for job in jobs if not job.get("enabled")]
disabled_residue = [
    job for job in disabled_jobs
    if any(token in (job.get("name") or "").lower() for token in ["proof", "dry run", "dry-run", "smoke", "verification", "openaicodex"])
]

operator_host_jobs = []
for line in host_lines:
    if line.startswith("CRON_TZ="):
        continue
    if any(token in line for token in [
        "n8n_sync_check.sh",
        "db_probe.sh",
        "github_digest_telegram.sh",
        "cron_health_rollup.sh",
        "weekly_operator_review_prep.sh",
        "weekly_operator_review_sync_artifact.sh",
        "weekly_operator_review_telegram_bridge.sh",
        "cron_session_hygiene_report.sh",
    ]):
        schedule, command = line.split(" ", 5)[:5], line.split(" ", 5)[5]
        operator_host_jobs.append({
            "schedule": " ".join(schedule),
            "command": command,
        })

agents = ["main", "chief", "builder", "writer", "x-manager", "web-researcher"]
agent_counts = {}
class_counts = Counter()
flagged_agents = []

for agent in agents:
    sessions_path = Path(f"/root/.openclaw/agents/{agent}/sessions/sessions.json")
    try:
        data = json.loads(sessions_path.read_text())
    except FileNotFoundError:
        agent_counts[agent] = {"total": 0, "classes": {}}
        continue
    per_agent = Counter()
    for key in data.keys():
        cls = classify_session(agent, key)
        per_agent[cls] += 1
        class_counts[cls] += 1
    total = sum(per_agent.values())
    agent_counts[agent] = {"total": total, "classes": dict(per_agent)}
    if (
        per_agent["proof/test"] + per_agent["delegation/temp verification"] > THRESHOLD_PER_AGENT
    ):
        flagged_agents.append(agent)

temp_total = class_counts["proof/test"] + class_counts["delegation/temp verification"]
flag_temp = temp_total > THRESHOLD_TOTAL or bool(flagged_agents)
flag_disabled_native = len(disabled_residue) > 0

lines = []
lines.append("# Cron / Session Hygiene Report")
lines.append("")
lines.append(f"- generated_at_utc: {datetime.now(timezone.utc).isoformat()}")
lines.append(f"- clutter_threshold_total: {THRESHOLD_TOTAL}")
lines.append(f"- clutter_threshold_per_agent: {THRESHOLD_PER_AGENT}")
lines.append("")
lines.append("## Native Cron Summary")
lines.append(f"- enabled_operational_jobs: {len(enabled_jobs)}")
lines.append(f"- disabled_proof_test_dry_run_jobs: {len(disabled_residue)}")
if disabled_residue:
    for job in disabled_residue:
        lines.append(f"  - {job.get('name')} ({job.get('id')})")
lines.append("")
lines.append("## Host Cron Summary")
lines.append(f"- cron_tz_present: {'yes' if any(line == 'CRON_TZ=America/Nassau' for line in host_lines) else 'no'}")
lines.append("- operator_stack_jobs:")
for job in operator_host_jobs:
    lines.append(f"  - `{job['schedule']}` -> `{job['command']}`")
lines.append("")
lines.append("## Session Counts By Agent")
for agent in agents:
    info = agent_counts[agent]
    lines.append(f"- {agent}: total={info['total']}")
    for cls in [
        "canonical operational",
        "cron",
        "proof/test",
        "delegation/temp verification",
        "transport/direct",
        "other",
    ]:
        lines.append(f"  - {cls}: {info['classes'].get(cls, 0)}")
lines.append("")
lines.append("## Session Counts By Class")
for cls in [
    "canonical operational",
    "cron",
    "proof/test",
    "delegation/temp verification",
    "transport/direct",
    "other",
]:
    lines.append(f"- {cls}: {class_counts.get(cls, 0)}")
lines.append("")
lines.append("## Flags")
lines.append(f"- temp_or_proof_clutter_flag: {'yes' if flag_temp else 'no'}")
lines.append(f"- disabled_native_proof_job_flag: {'yes' if flag_disabled_native else 'no'}")
if flagged_agents:
    lines.append(f"- agents_over_threshold: {', '.join(flagged_agents)}")
else:
    lines.append("- agents_over_threshold: none")
lines.append("")
lines.append("## Practical Reading")
if flag_disabled_native:
    lines.append("- Disabled native proof/test cron residue exists and should be reviewed.")
else:
    lines.append("- No disabled native proof/test cron jobs detected.")
if flag_temp:
    lines.append("- Temp/proof/delegation session clutter is above the reporting threshold.")
else:
    lines.append("- Temp/proof/delegation session clutter is within the reporting threshold.")
lines.append("- This report is non-destructive. No cleanup was performed.")

out_path.write_text("\n".join(lines) + "\n")
PY

echo "cron/session hygiene report written: $OUT"
