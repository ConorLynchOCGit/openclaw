#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WEBHOOK_GATEWAY_ROOT="${WEBHOOK_GATEWAY_ROOT:-/root/services/webhook-gateway}"
WORKSPACE="${OPENCLAW_WORKSPACE_DIR:-/root/.openclaw/workspace}"

cd "$WEBHOOK_GATEWAY_ROOT"

N8N_CID="$(docker compose ps -q n8n)"
EXPORT_NAME="sync-check-latest"
CONTAINER_EXPORT="/home/node/.n8n/${EXPORT_NAME}"
HOST_EXPORT="/root/data/n8n/${EXPORT_NAME}"
SEND_HELPER="${REPO_ROOT}/ops/telegram/send_chief_telegram.sh"

send_alert() {
  "${SEND_HELPER}" "$1" >/dev/null
}

if [ -z "${N8N_CID}" ]; then
  send_alert "OpenClaw n8n sync-check alert: n8n container not found on $(hostname)."
  exit 1
fi

rm -rf "${HOST_EXPORT}"

if ! docker exec "${N8N_CID}" sh -lc "rm -rf '${CONTAINER_EXPORT}' && mkdir -p '${CONTAINER_EXPORT}' && n8n export:workflow --all --pretty --separate --output='${CONTAINER_EXPORT}'" >/tmp/n8n_sync_check_export.log 2>&1; then
  send_alert "OpenClaw n8n sync-check alert: live export failed on $(hostname) at $(date -Is)."
  cat /tmp/n8n_sync_check_export.log
  exit 1
fi

set +e
REPORT="$(
EXPORT_DIR_ON_HOST="${HOST_EXPORT}" WORKSPACE="${WORKSPACE}" python3 - <<'PY'
import json, os, re, sys
from pathlib import Path

workspace = Path(os.environ["WORKSPACE"])
live_dir = Path(os.environ["EXPORT_DIR_ON_HOST"])

DROP_TOP = {
    "id","versionId","createdAt","updatedAt","meta","pinData","staticData",
    "shared","tags","scopes","activeVersionId","description","isArchived",
    "triggerCount","versionCounter","versionMetadata",
}
DROP_NODE = {"id"}

def load_json(path: Path):
    return json.loads(path.read_text())

def norm(value):
    if isinstance(value, dict):
        return {k: norm(v) for k, v in sorted(value.items())}
    if isinstance(value, list):
        return [norm(v) for v in value]
    return value

def normalize_workflow(wf):
    out = {}
    for k, v in wf.items():
        if k in DROP_TOP:
            continue
        if k == "nodes" and isinstance(v, list):
            nodes = []
            for node in v:
                if isinstance(node, dict):
                    cleaned = {nk: nv for nk, nv in node.items() if nk not in DROP_NODE}
                    nodes.append(cleaned)
                else:
                    nodes.append(node)
            out[k] = sorted(nodes, key=lambda n: (str(n.get("name","")), str(n.get("type",""))))
            continue
        out[k] = v
    return norm(out)

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
        canonical[name] = (p, load_json(p))

live = {}
for p in live_dir.glob("*.json"):
    name = read_name(p)
    if name:
        live[name] = (p, load_json(p))

matched = sorted(set(canonical) & set(live))
missing_live = sorted(set(canonical) - set(live))
unmanaged = sorted(set(live) - set(canonical))

aligned = []
drift = []
for name in matched:
    c_path, c_raw = canonical[name]
    l_path, l_raw = live[name]
    if normalize_workflow(c_raw) == normalize_workflow(l_raw):
        aligned.append(name)
    else:
        drift.append(name)

unmanaged_active = []
unmanaged_inactive = []
for name in unmanaged:
    _, raw = live[name]
    if raw.get("active"):
        unmanaged_active.append(name)
    else:
        unmanaged_inactive.append(name)

lines = []
lines.append(f"n8n sync-check @ {Path('/').resolve()}")
lines.append("Aligned: " + (", ".join(aligned) if aligned else "none"))
if unmanaged_active:
    lines.append("Unmanaged active: " + ", ".join(unmanaged_active))
if unmanaged_inactive:
    lines.append("Unmanaged inactive: " + ", ".join(unmanaged_inactive))
if missing_live:
    lines.append("Canonical missing live match: " + ", ".join(missing_live))
if drift:
    lines.append("True semantic drift: " + ", ".join(drift))

issues = bool(unmanaged_active or missing_live or drift)
print("\n".join(lines))
sys.exit(1 if issues else 0)
PY
)"
STATUS=$?
set -e

echo "${REPORT}"

if [ "${STATUS}" -ne 0 ]; then
  ISSUE_DIR="/root/backups/n8n-sync-alert-$(date +%F-%H%M%S)"
  mkdir -p "${ISSUE_DIR}"
  cp -R "${HOST_EXPORT}" "${ISSUE_DIR}/live-export"
  cat > "${ISSUE_DIR}/README.txt" <<TXT
n8n sync-check alert snapshot
Created: $(date -Is)
TXT
  send_alert "OpenClaw n8n sync-check alert on $(hostname): ${REPORT}"
  exit 1
fi

exit 0
