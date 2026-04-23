#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "usage: init_vetting_report.sh <slug> [version]" >&2
  exit 64
fi

slug="$1"
version="${2:-unknown}"
if [[ ! "${slug}" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "invalid skill slug: ${slug}" >&2
  exit 64
fi
date_stamp="$(date -u +%F)"
iso_stamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
template="${repo_root}/skills/skill-vetting/references/operator-vetting-report-template.md"
workspace_root="${OPENCLAW_WORKSPACE_DIR:-${HOME}/.openclaw/workspace}"
out_dir="${OPENCLAW_SKILL_VETTING_REPORT_ROOT:-${workspace_root}/docs/projects/skills-system/skill-vetting/reports}"
out_file="${out_dir}/${date_stamp}-${slug}-review.md"

mkdir -p "${out_dir}"

{
  echo "---"
  echo "summary: \"Operator-facing review for ${slug}.\""
  echo "title: \"Skill Review: ${slug}\""
  echo "review:"
  echo "  slug: ${slug}"
  echo "  version: ${version}"
  echo "  outcome: pending"
  echo "  riskTier: pending"
  echo "  generatedAt: ${iso_stamp}"
  echo "---"
  echo
  sed "s/<skill-slug>/${slug}/g" "${template}"
} > "${out_file}"

printf '%s\n' "${out_file}"
