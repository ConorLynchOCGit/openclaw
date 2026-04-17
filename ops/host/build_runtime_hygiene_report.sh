#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORKSPACE="${OPENCLAW_WORKSPACE_DIR:-/root/.openclaw/workspace}"
ARCHIVE_DIR="$WORKSPACE/archives/build_runtime_hygiene"
DATE_ID="$(date +%F)"
STAMP_ID="$(date -u +%Y%m%dT%H%M%SZ)"
JSON_OUT="$ARCHIVE_DIR/${DATE_ID}.json"
MD_OUT="$ARCHIVE_DIR/${DATE_ID}.md"
TMP_VERIFY="$(mktemp)"

cleanup() {
  rm -f "$TMP_VERIFY"
}
trap cleanup EXIT

mkdir -p "$ARCHIVE_DIR"

node "$REPO_ROOT/scripts/build_runtime_inventory.mjs" --out "$JSON_OUT" --compact >/dev/null

if node "$REPO_ROOT/scripts/verify_build_runtime_hygiene.mjs" >"$TMP_VERIFY" 2>&1; then
  VERIFY_STATUS="pass"
else
  VERIFY_STATUS="fail"
fi

python3 - <<'PY' "$JSON_OUT" "$MD_OUT" "$STAMP_ID" "$VERIFY_STATUS" "$TMP_VERIFY"
import json
import sys
from pathlib import Path

json_path = Path(sys.argv[1])
md_path = Path(sys.argv[2])
stamp_id = sys.argv[3]
verify_status = sys.argv[4]
verify_path = Path(sys.argv[5])

inventory = json.loads(json_path.read_text())
live = inventory.get("liveRuntime") or {}
docker = inventory.get("docker") or {}
volumes = docker.get("volumes") or {}
lines = [
    "# Build Runtime Hygiene Report",
    "",
    f"- generated_at_utc: {stamp_id}",
    f"- verification_status: `{verify_status}`",
    f"- live_runtime_container: `{live.get('containerName', 'missing')}`",
    f"- live_runtime_service: `{live.get('service', 'missing')}`",
    f"- live_runtime_health: `{live.get('health', 'missing')}`",
    f"- dangling_anonymous_volume_count: `{volumes.get('danglingAnonymousCount', 'unknown')}`",
    f"- dangling_anonymous_volume_bytes: `{volumes.get('danglingAnonymousBytes', 'unknown')}`",
    "",
    "## Verification Output",
    "",
    "```text",
    verify_path.read_text().strip() or "(no verifier output)",
    "```",
    "",
    "## Docker Summary",
    "",
]

for row in docker.get("systemDf", []):
    lines.append(
        f"- {row.get('Type')}: total={row.get('TotalCount')} active={row.get('Active')} size={row.get('Size')} reclaimable={row.get('Reclaimable')}"
    )

lines.extend(
    [
        "",
        "## Reading",
        "",
        f"- canonical inventory JSON: `{json_path}`",
        "- use this report as the scheduled dry-run hygiene snapshot",
    ]
)

md_path.write_text("\n".join(lines) + "\n")
PY

echo "build/runtime hygiene report written: $MD_OUT"
