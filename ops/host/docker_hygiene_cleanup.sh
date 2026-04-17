#!/usr/bin/env bash
set -euo pipefail

WORKSPACE="${OPENCLAW_WORKSPACE_DIR:-/root/.openclaw/workspace}"
ARCHIVE_DIR="$WORKSPACE/archives/docker_hygiene"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$ARCHIVE_DIR/${TIMESTAMP}.md"
APPLY=0

if [[ "${1:-}" == "--apply" ]]; then
  APPLY=1
elif [[ "${1:-}" != "" ]]; then
  echo "usage: $0 [--apply]" >&2
  exit 2
fi

mkdir -p "$ARCHIVE_DIR"

readarray -t DANGLING_ANON_VOLUMES < <(
  docker volume ls -qf dangling=true \
    | while read -r volume; do
        labels="$(docker volume inspect --format '{{ json .Labels }}' "$volume")"
        if [[ "$labels" == *"com.docker.volume.anonymous"* ]]; then
          echo "$volume"
        fi
      done
)

readarray -t STALE_NETWORKS < <(
  docker network ls --format '{{.Name}}' \
    | while read -r network; do
        [[ "$network" == "bridge" || "$network" == "host" || "$network" == "none" ]] && continue
        count="$(docker network inspect "$network" --format '{{len .Containers}}')"
        if [[ "$count" == "0" ]]; then
          echo "$network"
        fi
      done
)

readarray -t DANGLING_IMAGES < <(docker image ls -qf dangling=true)

sum_volume_bytes() {
  if [[ "${#DANGLING_ANON_VOLUMES[@]}" -eq 0 ]]; then
    echo 0
    return
  fi
  python3 - <<'PY' "${DANGLING_ANON_VOLUMES[@]}"
import os
import subprocess
import sys

total = 0
for name in sys.argv[1:]:
    path = f"/var/lib/docker/volumes/{name}/_data"
    if not os.path.isdir(path):
        continue
    total += int(subprocess.check_output(["du", "-sb", path]).split()[0])
print(total)
PY
}

bytes_to_gb() {
  python3 - <<'PY' "$1"
import sys
print(f"{int(sys.argv[1]) / (1024**3):.2f}G")
PY
}

PRE_DF="$(df -h /)"
PRE_DOCKER_DF="$(docker system df)"
PRE_VOLUME_BYTES="$(sum_volume_bytes)"
REMOVAL_LOG=""

if [[ "$APPLY" == "1" ]]; then
  if [[ "${#DANGLING_ANON_VOLUMES[@]}" -gt 0 ]]; then
    REMOVAL_LOG+=$'## Removed Dangling Anonymous Volumes\n\n```text\n'
    REMOVAL_LOG+="$(docker volume rm "${DANGLING_ANON_VOLUMES[@]}")"$'\n'
    REMOVAL_LOG+=$'```\n\n'
  fi

  if [[ "${#STALE_NETWORKS[@]}" -gt 0 ]]; then
    REMOVAL_LOG+=$'## Removed Unused Networks\n\n```text\n'
    REMOVAL_LOG+="$(docker network rm "${STALE_NETWORKS[@]}")"$'\n'
    REMOVAL_LOG+=$'```\n\n'
  fi

  if [[ "${#DANGLING_IMAGES[@]}" -gt 0 ]]; then
    REMOVAL_LOG+=$'## Removed Dangling Images\n\n```text\n'
    REMOVAL_LOG+="$(docker image rm "${DANGLING_IMAGES[@]}")"$'\n'
    REMOVAL_LOG+=$'```\n\n'
  fi

  REMOVAL_LOG+=$'## Builder Prune\n\n```text\n'
  REMOVAL_LOG+="$(docker builder prune --force --filter 'until=168h' 2>&1)"$'\n'
  REMOVAL_LOG+=$'```\n'
fi

POST_DF="$(df -h /)"
POST_DOCKER_DF="$(docker system df)"
POST_VOLUME_BYTES="$(sum_volume_bytes)"
RECLAIMED_BYTES="$(( PRE_VOLUME_BYTES - POST_VOLUME_BYTES ))"

cat > /tmp/docker_hygiene_report.$$ <<EOF
# Docker Hygiene Cleanup Report

- generated_at_utc: ${TIMESTAMP}
- mode: $( [[ "$APPLY" == "1" ]] && echo "apply" || echo "dry-run" )

## Pre-Run Summary

\`\`\`text
${PRE_DF}
\`\`\`

\`\`\`text
${PRE_DOCKER_DF}
\`\`\`

- dangling_anonymous_volume_count: ${#DANGLING_ANON_VOLUMES[@]}
- dangling_anonymous_volume_bytes: $(bytes_to_gb "$PRE_VOLUME_BYTES")
- stale_networks: ${#STALE_NETWORKS[@]}
- dangling_images: ${#DANGLING_IMAGES[@]}

## Safe Candidates

### Dangling Anonymous Volumes
$(for volume in "${DANGLING_ANON_VOLUMES[@]}"; do echo "- \`${volume}\`"; done)

### Unused Non-Default Networks
$(for network in "${STALE_NETWORKS[@]}"; do echo "- \`${network}\`"; done)

### Dangling Images
$(for image in "${DANGLING_IMAGES[@]}"; do echo "- \`${image}\`"; done)

${REMOVAL_LOG}

## Post-Run Summary

\`\`\`text
${POST_DF}
\`\`\`

\`\`\`text
${POST_DOCKER_DF}
\`\`\`

- dangling_anonymous_volume_count: $(docker volume ls -qf dangling=true | wc -l)
- dangling_anonymous_volume_bytes: $(bytes_to_gb "$POST_VOLUME_BYTES")
- reclaimed_dangling_volume_space: $(bytes_to_gb "$RECLAIMED_BYTES")

## Reading

- This script only auto-removes dangling anonymous volumes, dangling images, unused non-default networks, and aged BuildKit cache.
- It does not remove named in-use volumes, running containers, or active networks.
- Use \`--apply\` only after reviewing the dry-run output.
EOF

mv /tmp/docker_hygiene_report.$$ "$OUT"
echo "docker hygiene report written: $OUT"
