#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SERVICE="${OPENCLAW_GATEWAY_COMPOSE_SERVICE:-openclaw-gateway}"
CONTAINER="${OPENCLAW_GATEWAY_CONTAINER:-openclaw-runtime}"
LOCAL_HEALTH="${OPENCLAW_GATEWAY_LOCAL_HEALTH_URL:-http://127.0.0.1:28789/healthz}"
LOCAL_READY="${OPENCLAW_GATEWAY_LOCAL_READY_URL:-http://127.0.0.1:28789/readyz}"
ARTIFACT_DIR="${OPENCLAW_GATEWAY_RELOAD_ARTIFACT_DIR:-$ROOT_DIR/.artifacts/docker-gateway-reload}"
ALLOW_DIRTY_RUNTIME_SHAPE=0
SKIP_BUILD=0

usage() {
  cat <<'EOF'
Usage: scripts/docker/reload-gateway-dist.sh [--allow-dirty-runtime-shape] [--skip-build]

Fast reloads gateway/runtime TypeScript code without rebuilding the Docker image:
  1. record local pre-health
  2. run pnpm build:docker unless --skip-build is supplied
  3. copy local dist/ into openclaw-runtime:/app/dist
  4. docker compose restart openclaw-gateway
  5. record local post-health and write bounded evidence

Allowed for:
  - TypeScript/JavaScript gateway, Execution Platform, workflow, router, worker, and script changes
  - proof-loop fixes where dependencies, Dockerfile, compose env, ports, auth, pairing, and native addons are unchanged

Use full scripts/docker/rebuild-gateway.sh instead for:
  - Dockerfile or docker-compose changes
  - package.json, pnpm-lock.yaml, patch, native-addon, or runtime dependency changes
  - UI/QA asset image proofs
  - env/port/auth/pairing/container-shape changes
  - final production image proof

--allow-dirty-runtime-shape is an explicit operator override for dirty files that
the current reload does not depend on. It records the dirty runtime-shape paths
in the evidence artifact instead of silently ignoring them.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h)
      usage
      exit 0
      ;;
    --allow-dirty-runtime-shape)
      ALLOW_DIRTY_RUNTIME_SHAPE=1
      shift
      ;;
    --skip-build)
      SKIP_BUILD=1
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

cd "$ROOT_DIR"
mkdir -p "$ARTIFACT_DIR"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
artifact="$ARTIFACT_DIR/${timestamp}.json"
tmp_artifact="${artifact}.tmp"

json_escape() {
  node -e 'process.stdout.write(JSON.stringify(process.argv[1] ?? ""))' "$1"
}

json_array_from_lines() {
  node -e '
const fs = require("fs");
const text = fs.readFileSync(0, "utf8");
const lines = text.split(/\r?\n/u).filter(Boolean);
process.stdout.write(JSON.stringify(lines));
'
}

env_file_value() {
  local name="$1"
  awk -F= -v key="$name" '
    $1 == key {
      value = substr($0, index($0, "=") + 1)
    }
    END {
      if (value != "") {
        print value
      }
    }
  ' "$ROOT_DIR/.env" 2>/dev/null | sed -e 's/^"//' -e 's/"$//'
}

container_env_value() {
  local name="$1"
  docker exec "$CONTAINER" sh -lc "printenv '$name' 2>/dev/null || true" | tail -n 1
}

health_json() {
  local url="$1"
  local started
  started="$(date +%s%3N)"
  local body status duration ok
  body="$(curl -fsS --max-time 5 "$url" 2>/tmp/openclaw-reload-curl.err || true)"
  status=$?
  duration="$(( $(date +%s%3N) - started ))"
  if [[ "$status" == "0" ]]; then
    ok=true
  else
    ok=false
    body="$(cat /tmp/openclaw-reload-curl.err 2>/dev/null || true)"
  fi
  printf '{"url":%s,"ok":%s,"durationMs":%s,"bodyHash":%s,"rawResponseStored":false}' \
    "$(json_escape "$url")" \
    "$ok" \
    "$duration" \
    "$(json_escape "$(printf '%s' "$body" | sha256sum | awk '{print $1}')")"
}

dirty_shape_paths="$(
  git status --short -- Dockerfile docker-compose.yml docker-compose.extra.yml package.json pnpm-lock.yaml patches scripts/docker 2>/dev/null \
    | awk '{print $2}' \
    | sort -u
)"

if [[ -n "$dirty_shape_paths" && "$ALLOW_DIRTY_RUNTIME_SHAPE" != "1" ]]; then
  {
    printf '{\n'
    printf '  "artifactKind": "gateway_dist_reload_evidence",\n'
    printf '  "status": "blocked_dirty_runtime_shape",\n'
    printf '  "generatedAt": %s,\n' "$(json_escape "$(date -u +%Y-%m-%dT%H:%M:%SZ)")"
    printf '  "dirtyRuntimeShapePaths": %s,\n' "$(printf '%s\n' "$dirty_shape_paths" | json_array_from_lines)"
    printf '  "useFullRebuildCommand": "scripts/docker/rebuild-gateway.sh",\n'
    printf '  "rawPromptStored": false,\n'
    printf '  "rawResponseStored": false,\n'
    printf '  "rawLogsStored": false\n'
    printf '}\n'
  } >"$artifact"
  echo "Narrow reload blocked because runtime-shape files are dirty:" >&2
  printf '%s\n' "$dirty_shape_paths" >&2
  echo "Use full rebuild, or rerun with --allow-dirty-runtime-shape if these paths are unrelated." >&2
  echo "Evidence: $artifact" >&2
  exit 3
fi

pre_health="$(health_json "$LOCAL_HEALTH")"
pre_ready="$(health_json "$LOCAL_READY")"

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  echo "Container $CONTAINER not found; use scripts/docker/rebuild-gateway.sh." >&2
  exit 4
fi

stale_env_lines=""
for env_name in \
  OPENCLAW_INTENT_FRONT_DOOR_ADVANCED_ROUTER_MODEL_REF \
  OPENCLAW_INTENT_FRONT_DOOR_ADVANCED_ROUTER_FALLBACK_MODEL_REF \
  OPENCLAW_INTENT_FRONT_DOOR_ADVANCED_ROUTER_REQUIRED_MODEL_REF
do
  expected_value="$(env_file_value "$env_name")"
  container_value="$(container_env_value "$env_name")"
  if [[ -n "$expected_value" && "$container_value" != "$expected_value" ]]; then
    stale_env_lines="${stale_env_lines}${env_name} expected=${expected_value} actual=${container_value}"$'\n'
  fi
done

if [[ -n "$stale_env_lines" ]]; then
  {
    printf '{\n'
    printf '  "artifactKind": "gateway_dist_reload_evidence",\n'
    printf '  "status": "blocked_stale_gateway_env",\n'
    printf '  "generatedAt": %s,\n' "$(json_escape "$(date -u +%Y-%m-%dT%H:%M:%SZ)")"
    printf '  "service": %s,\n' "$(json_escape "$SERVICE")"
    printf '  "container": %s,\n' "$(json_escape "$CONTAINER")"
    printf '  "staleEnv": %s,\n' "$(printf '%s' "$stale_env_lines" | json_array_from_lines)"
    printf '  "useFullRebuildCommand": "scripts/docker/rebuild-gateway.sh",\n'
    printf '  "gatewayEnvChanged": true,\n'
    printf '  "rawPromptStored": false,\n'
    printf '  "rawResponseStored": false,\n'
    printf '  "rawLogsStored": false\n'
    printf '}\n'
  } >"$artifact"
  echo "Narrow reload blocked because gateway container env is stale relative to .env:" >&2
  printf '%s\n' "$stale_env_lines" >&2
  echo "Use full rebuild/recreate so Docker receives current env." >&2
  echo "Evidence: $artifact" >&2
  exit 6
fi

build_status="skipped"
if [[ "$SKIP_BUILD" != "1" ]]; then
  echo "==> Building local dist runtime"
  pnpm build:docker
  build_status="completed"
fi

if [[ ! -f "$ROOT_DIR/dist/index.js" ]]; then
  echo "dist/index.js not found after build; cannot reload gateway dist." >&2
  exit 5
fi

dist_hash="$(find "$ROOT_DIR/dist" -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | awk '{print $1}')"

echo "==> Copying dist into $CONTAINER:/app/dist"
docker exec "$CONTAINER" sh -lc 'mkdir -p /app/dist'
docker cp "$ROOT_DIR/dist/." "$CONTAINER:/app/dist/"

echo "==> Restarting $SERVICE without image rebuild"
docker compose restart "$SERVICE"

echo "==> Waiting for gateway health"
post_health="{}"
post_ready="{}"
for attempt in $(seq 1 90); do
  post_health="$(health_json "$LOCAL_HEALTH")"
  if node -e 'const h=JSON.parse(process.argv[1]); process.exit(h.ok ? 0 : 1)' "$post_health"; then
    post_ready="$(health_json "$LOCAL_READY")"
    break
  fi
  if [[ "$attempt" == "90" ]]; then
    docker logs --tail 120 "$CONTAINER" >&2 || true
    break
  fi
  sleep 1
done

container_image="$(docker inspect --format '{{.Image}}' "$CONTAINER" 2>/dev/null || true)"
container_started_at="$(docker inspect --format '{{.State.StartedAt}}' "$CONTAINER" 2>/dev/null || true)"

{
  printf '{\n'
  printf '  "artifactKind": "gateway_dist_reload_evidence",\n'
  printf '  "status": %s,\n' "$(node -e 'const h=JSON.parse(process.argv[1]); process.stdout.write(JSON.stringify(h.ok ? "succeeded" : "post_health_failed"))' "$post_health")"
  printf '  "generatedAt": %s,\n' "$(json_escape "$(date -u +%Y-%m-%dT%H:%M:%SZ)")"
  printf '  "service": %s,\n' "$(json_escape "$SERVICE")"
  printf '  "container": %s,\n' "$(json_escape "$CONTAINER")"
  printf '  "containerImage": %s,\n' "$(json_escape "$container_image")"
  printf '  "containerStartedAt": %s,\n' "$(json_escape "$container_started_at")"
  printf '  "buildStatus": %s,\n' "$(json_escape "$build_status")"
  printf '  "distHash": %s,\n' "$(json_escape "$dist_hash")"
  printf '  "preHealth": %s,\n' "$pre_health"
  printf '  "preReady": %s,\n' "$pre_ready"
  printf '  "postHealth": %s,\n' "$post_health"
  printf '  "postReady": %s,\n' "$post_ready"
  printf '  "dirtyRuntimeShapePaths": %s,\n' "$(printf '%s\n' "$dirty_shape_paths" | json_array_from_lines)"
  printf '  "allowedDirtyRuntimeShapeOverride": %s,\n' "$([[ "$ALLOW_DIRTY_RUNTIME_SHAPE" == "1" ]] && echo true || echo false)"
  printf '  "gatewayEnvChanged": false,\n'
  printf '  "gatewayPortChanged": false,\n'
  printf '  "gatewayAuthChanged": false,\n'
  printf '  "gatewayPairingStateChanged": false,\n'
  printf '  "imageRebuilt": false,\n'
  printf '  "containerRecreated": false,\n'
  printf '  "rawPromptStored": false,\n'
  printf '  "rawResponseStored": false,\n'
  printf '  "rawLogsStored": false\n'
  printf '}\n'
} >"$tmp_artifact"
mv "$tmp_artifact" "$artifact"

cat "$artifact"
node -e 'const fs=require("fs"); const p=process.argv[1]; const j=JSON.parse(fs.readFileSync(p,"utf8")); process.exit(j.status === "succeeded" ? 0 : 1)' "$artifact"
