#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "usage: quarantine_clawhub_skill.sh <slug> [version]" >&2
  exit 64
fi

if ! command -v clawhub >/dev/null 2>&1; then
  echo "clawhub CLI not found on PATH; cannot acquire into quarantine" >&2
  exit 69
fi

slug="$1"
version="${2:-}"
if [[ "${version}" == "latest" ]]; then
  version=""
fi
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
root="${TMPDIR:-/tmp}/openclaw-skill-vetting"
workdir="${root}/${slug}-${timestamp}"

mkdir -p "${workdir}"

args=(install "${slug}" --workdir "${workdir}" --dir skills --no-input --force)
if [[ -n "${version}" ]]; then
  args+=(--version "${version}")
fi

clawhub "${args[@]}"

echo "${workdir}/skills/${slug}"
