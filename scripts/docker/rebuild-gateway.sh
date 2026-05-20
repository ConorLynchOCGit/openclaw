#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BUILDER_UNTIL="${OPENCLAW_DOCKER_BUILDER_UNTIL:-2h}"
RESERVED_SPACE="${OPENCLAW_DOCKER_RESERVED_SPACE:-${OPENCLAW_DOCKER_KEEP_STORAGE:-25GB}}"

if [[ "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Usage: scripts/docker/rebuild-gateway.sh

Rebuilds and recreates the live openclaw-gateway service, waits for health,
then runs bounded Docker hygiene cleanup.

Environment overrides:
  OPENCLAW_DOCKER_BUILDER_UNTIL
  OPENCLAW_DOCKER_RESERVED_SPACE
EOF
  exit 0
fi

if [[ $# -gt 0 ]]; then
  echo "Unknown argument: $1" >&2
  exit 2
fi

cd "$ROOT_DIR"

echo "==> Rebuilding and recreating openclaw-gateway"
docker compose up -d --build --force-recreate openclaw-gateway

echo "==> Waiting for gateway health"
for attempt in $(seq 1 90); do
  if curl -sf http://127.0.0.1:28789/healthz >/dev/null 2>&1; then
    break
  fi
  if [[ "$attempt" == "90" ]]; then
    echo "Gateway did not become healthy after rebuild." >&2
    docker logs --tail 120 openclaw-runtime >&2 || true
    exit 1
  fi
  sleep 1
done

curl -sf http://127.0.0.1:28789/healthz
echo

echo "==> Pruning safe stale Docker residue"
bash "$ROOT_DIR/scripts/docker/hygiene.sh" \
  --apply \
  --builder-until "$BUILDER_UNTIL" \
  --reserved-space "$RESERVED_SPACE"
