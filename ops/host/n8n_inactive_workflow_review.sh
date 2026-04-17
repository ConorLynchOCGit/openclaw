#!/usr/bin/env bash
set -euo pipefail

WEBHOOK_GATEWAY_ROOT="${WEBHOOK_GATEWAY_ROOT:-/root/services/webhook-gateway}"
WORKSPACE="${OPENCLAW_WORKSPACE_DIR:-/root/.openclaw/workspace}"

cd "$WEBHOOK_GATEWAY_ROOT"
ARCHIVE_DIR="$WORKSPACE/archives/workflow_inactive_reviews"
DATE_ID="$(date +%F)"
OUT="$ARCHIVE_DIR/${DATE_ID}.md"
EXPORT_NAME="inactive-review-latest"
CONTAINER_EXPORT="/home/node/.n8n/${EXPORT_NAME}"
HOST_EXPORT="/root/data/n8n/${EXPORT_NAME}"
N8N_CID="$(docker compose ps -q n8n)"

mkdir -p "$ARCHIVE_DIR"

if [ -z "${N8N_CID}" ]; then
  echo "n8n container not found" >&2
  exit 1
fi

rm -rf "${HOST_EXPORT}"

docker exec "${N8N_CID}" sh -lc "rm -rf '${CONTAINER_EXPORT}' && mkdir -p '${CONTAINER_EXPORT}' && n8n export:workflow --all --pretty --separate --output='${CONTAINER_EXPORT}'" >/tmp/n8n_inactive_review_export.log 2>&1

WORKSPACE="${WORKSPACE}" \
EXPORT_DIR_ON_HOST="${HOST_EXPORT}" \
OUT="${OUT}" \
DATE_ID="${DATE_ID}" \
python3 - <<'PY'
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

workspace = Path(os.environ["WORKSPACE"])
live_dir = Path(os.environ["EXPORT_DIR_ON_HOST"])
out = Path(os.environ["OUT"])
date_id = os.environ["DATE_ID"]

DEFAULT_REMOVE_NAMES = {
    "my workflow",
    "new workflow",
    "untitled workflow",
    "test workflow",
}


def load_json(path: Path):
    return json.loads(path.read_text())


def read_name(path: Path):
    try:
        return load_json(path).get("name")
    except Exception:
        return None


canonical = {}
for p in workspace.glob("projects/*/workflows/*.json"):
    if re.search(r"-\d{4}-\d{2}-\d{2}\.json$", p.name):
        continue
    name = read_name(p)
    if name:
        canonical[name] = p

records = []
for p in sorted(live_dir.glob("*.json")):
    raw = load_json(p)
    name = raw.get("name")
    if not name or name in canonical or raw.get("active"):
        continue

    normalized_name = name.strip().lower()
    if normalized_name in DEFAULT_REMOVE_NAMES:
        recommendation = "remove"
        rationale = "Default or placeholder-style unmanaged inactive workflow with no canonical ownership."
    else:
        recommendation = "archive"
        rationale = "Unmanaged inactive workflow should be preserved before any live removal or adoption decision."

    records.append(
        {
            "name": name,
            "workflow_id": raw.get("id", "unknown"),
            "active_state": "inactive",
            "canonical_status": "unmanaged",
            "recommended_action": recommendation,
            "rationale": rationale,
            "export_file": p.name,
        }
    )

lines = [
    f"# Inactive Workflow Review — {date_id}",
    "",
    f"- generated_at_utc: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}",
    f"- live_export_dir: {live_dir}",
    "- mode: report-only",
    "",
    "## Summary",
    f"- unmanaged_inactive_count: {len(records)}",
]

if records:
    recommendation_counts = {}
    for record in records:
        recommendation_counts[record["recommended_action"]] = recommendation_counts.get(record["recommended_action"], 0) + 1
    lines.append("- recommendation_breakdown:")
    for key in sorted(recommendation_counts):
        lines.append(f"  - {key}: {recommendation_counts[key]}")
else:
    lines.append("- recommendation_breakdown: none")

lines.extend(
    [
        "",
        "## Decision Rules",
        "- `remove`: default/placeholder unmanaged inactive workflow with no plausible durable ownership signal.",
        "- `archive`: preserve exported definition first, then decide later whether to adopt or remove.",
        "- This report does not mutate live workflows.",
        "",
        "## Findings",
    ]
)

if not records:
    lines.append("- No unmanaged inactive workflows detected in the live export.")
else:
    for record in records:
        lines.extend(
            [
                f"### {record['name']}",
                f"- workflow_id: `{record['workflow_id']}`",
                f"- active_state: {record['active_state']}",
                f"- canonical_status: {record['canonical_status']}",
                f"- recommended_action: {record['recommended_action']}",
                f"- rationale: {record['rationale']}",
                f"- live_export_file: `{record['export_file']}`",
                "",
            ]
        )

out.write_text("\n".join(lines).rstrip() + "\n")
PY

chown ubuntu:ubuntu "$OUT"
echo "inactive workflow review written: $OUT"
