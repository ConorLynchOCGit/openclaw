#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ARTIFACT_DIR="${OPENCLAW_DOCKER_HYGIENE_ARTIFACT_DIR:-$ROOT_DIR/.artifacts/docker-hygiene}"
BUILDER_UNTIL="${OPENCLAW_DOCKER_BUILDER_UNTIL:-2h}"
RESERVED_SPACE="${OPENCLAW_DOCKER_RESERVED_SPACE:-${OPENCLAW_DOCKER_KEEP_STORAGE:-25GB}}"
APPLY=0

usage() {
  cat <<'EOF'
Usage: scripts/docker/hygiene.sh [options]

Options:
  --apply                    Remove safe stale Docker residue.
  --builder-until <duration> Prune unused BuildKit cache older than this age.
  --reserved-space <size>    Keep this much unused BuildKit cache available.
  --keep-storage <size>      Deprecated alias for --reserved-space.
  --artifact-dir <path>      Write the hygiene report under this directory.
  --help                     Show this help text.

This script only removes:
  - dangling anonymous volumes
  - dangling images
  - unused non-default networks
  - unused BuildKit cache, bounded by --builder-until and --keep-storage

It never removes:
  - running containers
  - named in-use volumes
  - active networks
  - the currently running openclaw image
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply)
      APPLY=1
      shift
      ;;
    --builder-until)
      BUILDER_UNTIL="${2:-}"
      shift 2
      ;;
    --reserved-space|--keep-storage)
      RESERVED_SPACE="${2:-}"
      shift 2
      ;;
    --artifact-dir)
      ARTIFACT_DIR="${2:-}"
      shift 2
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

mkdir -p "$ARTIFACT_DIR"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
REPORT_PATH="$ARTIFACT_DIR/${TIMESTAMP}.md"

readarray -t DANGLING_ANON_VOLUMES < <(
  docker volume ls -qf dangling=true \
    | while read -r volume; do
        [[ -z "$volume" ]] && continue
        labels="$(docker volume inspect --format '{{ json .Labels }}' "$volume" 2>/dev/null || echo '{}')"
        if [[ "$labels" == *"com.docker.volume.anonymous"* ]]; then
          echo "$volume"
        fi
      done
)

readarray -t STALE_NETWORKS < <(
  docker network ls --format '{{.Name}}' \
    | while read -r network; do
        [[ -z "$network" ]] && continue
        [[ "$network" == "bridge" || "$network" == "host" || "$network" == "none" ]] && continue
        count="$(docker network inspect "$network" --format '{{len .Containers}}' 2>/dev/null || echo 1)"
        if [[ "$count" == "0" ]]; then
          echo "$network"
        fi
      done
)

readarray -t DANGLING_IMAGES < <(docker image ls -qf dangling=true)

PRE_DF="$(df -h /)"
PRE_DOCKER_DF="$(docker system df)"
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
  REMOVAL_LOG+="$(docker builder prune --force --filter "until=${BUILDER_UNTIL}" --reserved-space "${RESERVED_SPACE}" 2>&1)"$'\n'
  REMOVAL_LOG+=$'```\n'
fi

POST_DF="$(df -h /)"
POST_DOCKER_DF="$(docker system df)"

cat >"$REPORT_PATH" <<EOF
# Docker Hygiene Report

- generated_at_utc: ${TIMESTAMP}
- mode: $( [[ "$APPLY" == "1" ]] && echo "apply" || echo "dry-run" )
- builder_until: ${BUILDER_UNTIL}
- reserved_space: ${RESERVED_SPACE}

## Pre-Run Summary

\`\`\`text
${PRE_DF}
\`\`\`

\`\`\`text
${PRE_DOCKER_DF}
\`\`\`

- dangling_anonymous_volume_count: ${#DANGLING_ANON_VOLUMES[@]}
- stale_network_count: ${#STALE_NETWORKS[@]}
- dangling_image_count: ${#DANGLING_IMAGES[@]}

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

## Policy

- Normal rebuilds should use \`scripts/docker/rebuild-gateway.sh\` so cleanup follows the build automatically.
- Fast local churn should be controlled by bounded BuildKit cleanup, not broad image deletion.
- The default policy keeps only a short warm-cache window plus \`${RESERVED_SPACE}\` of reserved unused cache.
- Cleanup is hygiene only; it does not prove the new image is live.
EOF

echo "docker hygiene report written: $REPORT_PATH"
