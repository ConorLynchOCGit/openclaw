#!/usr/bin/env bash
set -euo pipefail

export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${PATH:-}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORKSPACE="${OPENCLAW_WORKSPACE_DIR:-/root/.openclaw/workspace}"
source "$REPO_ROOT/ops/host/lib/report_sessions.sh"
source "$REPO_ROOT/ops/host/lib/workspace_memory_guard.sh"
OPS_DIR="$REPO_ROOT/ops/reviews"
GENERATED_DIR="$WORKSPACE/projects/ops/generated_current"
OUT="$GENERATED_DIR/daily_operator_review_context_current.md"
MEMORY_OPS_ALIAS_HOST="$GENERATED_DIR/memory_ops_health_report_current.md"
ARCHIVE_DIR="$WORKSPACE/archives/daily_operator_reviews"
CRON_HEALTH_DIR="$WORKSPACE/archives/cron_health_rollups"
HYGIENE_DIR="$WORKSPACE/archives/cron_session_hygiene"
DAILY_MEMORY_EVIDENCE_DIR="$WORKSPACE/archives/daily_memory_evidence"
TODAY="$(date +%F)"
GENERATED_AT="$(date -u +%FT%TZ)"
FUTURE_DAILY_ARTIFACT_RUNTIME="/home/node/.openclaw/workspace/archives/daily_operator_reviews/${TODAY}.md"
DAILY_MEMORY_EVIDENCE_HOST="$DAILY_MEMORY_EVIDENCE_DIR/${TODAY}.md"
DAILY_MEMORY_EVIDENCE_RUNTIME="/home/node/.openclaw/workspace/archives/daily_memory_evidence/${TODAY}.md"
OPENCLAW_CONTAINER="${OPENCLAW_CONTAINER:-$(docker ps --format '{{.Names}}' | grep -E '^openclaw-runtime$|^openclaw$|openclaw.*gateway' | head -n 1 || true)}"

mkdir -p "$GENERATED_DIR" "$ARCHIVE_DIR"
"$OPS_DIR/daily_memory_evidence_rollup.sh" "$TODAY" >/dev/null

HOST_CRONTAB="$(crontab -l 2>/dev/null || true)"
HOST_OPERATOR_JOBS="$(printf '%s\n' "$HOST_CRONTAB" | grep -v '^[[:space:]]*#' | grep -E 'n8n_sync_check|db_probe|github_digest_telegram|cron_health_rollup|daily_operator_review_prep|daily_operator_review_sync_artifact|daily_memory_continuity_finalizer|weekly_operator_review_prep|weekly_operator_review_sync_artifact|weekly_operator_review_telegram_bridge|cron_session_hygiene_report|n8n_inactive_workflow_review|supabase_db_backup|disk_maintenance|build_runtime_hygiene_report|docker_hygiene_cleanup|cache_hygiene' || true)"
HOST_CRON_TZ_STATUS="missing"
if printf '%s\n' "$HOST_CRONTAB" | grep -Eq '^CRON_TZ=America/Nassau$'; then
  HOST_CRON_TZ_STATUS="present"
fi

OPENCLAW_CRONS='{"jobs":[],"total":0}'
if [[ -n "$OPENCLAW_CONTAINER" ]]; then
  OPENCLAW_CRONS="$(docker exec "$OPENCLAW_CONTAINER" sh -lc 'openclaw cron list --all --json' 2>/dev/null || printf '%s' '{"jobs":[],"total":0}')"
fi

NATIVE_CRON_SUMMARY="$(printf '%s' "$OPENCLAW_CRONS" | jq -r '
  [
    "enabled_operational_jobs: " + ((.jobs // []) | map(select(.enabled == true)) | length | tostring),
    "disabled_proof_test_dry_run_jobs: " + ((.jobs // []) | map(select(.enabled != true and (.name | test("proof|dry run|smoke|verification"; "i")))) | length | tostring),
    "enabled_jobs: " + (((.jobs // []) | map(select(.enabled == true) | .name)) | join(", "))
  ] | .[]
')"

REPO_STATUS="$(git -C "$REPO_ROOT" status --short --branch --untracked-files=all || true)"
if [[ -z "$REPO_STATUS" ]]; then
  REPO_STATUS="clean"
fi

SESSION_SUMMARY="$(node - <<'NODE'
const fs = require('fs');
const agents = ['main', 'chief', 'builder', 'writer', 'x-manager', 'web-researcher'];
const canonical = new Set([
  'agent:main:main',
  'agent:chief:main',
  'agent:chief:telegram:direct:7756506076',
  'agent:builder:main',
  'agent:x-manager:main',
  'agent:web-researcher:main',
]);
const classCounts = {
  canonical_operational: 0,
  cron: 0,
  proof_test: 0,
  delegation_temp_verification: 0,
  transport_direct: 0,
  other: 0,
};
const perAgent = [];
for (const agent of agents) {
  const p = `/root/.openclaw/agents/${agent}/sessions/sessions.json`;
  let keys = [];
  try {
    keys = Object.keys(JSON.parse(fs.readFileSync(p, 'utf8')));
  } catch {
    keys = [];
  }
  perAgent.push(`${agent}: ${keys.length}`);
  for (const key of keys) {
    const normalized = key.toLowerCase();
    if (canonical.has(normalized)) {
      classCounts.canonical_operational += 1;
    } else if (normalized.includes(':cron:')) {
      classCounts.cron += 1;
    } else if (/:proof-[^:]+/i.test(normalized)) {
      classCounts.proof_test += 1;
    } else if (
      /:dashboard:w[0-9a-z-]*/i.test(normalized) ||
      /(^|[:.-])w(?:5|6|6d|8|9|10|11|14|15|16)[0-9a-z-]*/i.test(normalized) ||
      /:delegate(?:[:.-]|$)/i.test(normalized) ||
      /:fresh(?:[:.-]|$)/i.test(normalized) ||
      /:main-smoke:/i.test(normalized) ||
      /:xmanager-smoke:/i.test(normalized) ||
      /:routing-verification(?:[:.-]|$)/i.test(normalized)
    ) {
      classCounts.delegation_temp_verification += 1;
    } else if (/:direct:|:group:|:channel:/.test(normalized)) {
      classCounts.transport_direct += 1;
    } else {
      classCounts.other += 1;
    }
  }
}
console.log([
  'by_agent:',
  ...perAgent.map((line) => `  - ${line}`),
  'by_class:',
  ...Object.entries(classCounts).map(([k, v]) => `  - ${k}: ${v}`),
].join('\n'));
NODE
)"

LATEST_CRON_HEALTH_HOST="$(find "$CRON_HEALTH_DIR" -maxdepth 1 -type f -name '*.md' | sort | tail -n 1 || true)"
LATEST_HYGIENE_HOST="$(find "$HYGIENE_DIR" -maxdepth 1 -type f -name '*.md' | sort | tail -n 1 || true)"
DAILY_MEMORY_EVIDENCE_SNIPPET="$(sed -n '1,160p' "$DAILY_MEMORY_EVIDENCE_HOST" 2>/dev/null || true)"
DEPLOYMENT_STATUS_SNIPPET="$(sed -n '1,200p' "$REPO_ROOT/docs/projects/deployment-topology/STATUS.md" 2>/dev/null || true)"
DEPLOYMENT_CURRENT_SLICE_SNIPPET="$(sed -n '1,120p' "$REPO_ROOT/docs/projects/deployment-topology/CURRENT_SLICE.md" 2>/dev/null || true)"
SYSTEM_DEPLOYMENT_SNIPPET="$(sed -n '1,200p' "$REPO_ROOT/docs/system/deployment.md" 2>/dev/null || true)"
SYSTEM_MEMORY_SNIPPET="$(sed -n '1,220p' "$REPO_ROOT/docs/system/memory.md" 2>/dev/null || true)"
GITHUB_AUTOMATION_SNIPPET="$(sed -n '1,180p' "$REPO_ROOT/docs/projects/deployment-topology/github-automation.md" 2>/dev/null || true)"
MEMORY_OPS_REPORT_HOST="$REPO_ROOT/.openclaw-memory-ops/reports/latest.md"
MEMORY_OPS_REPORT_RUNTIME="/app/.openclaw-memory-ops/reports/latest.md"
MEMORY_OPS_ALIAS_RUNTIME="/home/node/.openclaw/workspace/projects/ops/generated_current/memory_ops_health_report_current.md"
MEMORY_OPS_RESOURCE_ID="memory_ops.latest_report"
MEMORY_OPS_ALIAS_RESOURCE_ID="ops.generated_current.memory_ops_report_current"

memory_ops_field() {
  local field="$1"
  if [[ ! -f "$MEMORY_OPS_REPORT_HOST" ]]; then
    return 0
  fi
  sed -n "s/^- ${field}:[[:space:]]*//p" "$MEMORY_OPS_REPORT_HOST" | head -n 1
}

write_memory_ops_alias() {
  local source_status="missing"
  local source_generated_at=""
  local source_mode=""
  local source_label=""

  if [[ -f "$MEMORY_OPS_REPORT_HOST" ]]; then
    source_status="present"
    source_generated_at="$(memory_ops_field generated_at_utc)"
    source_mode="$(memory_ops_field mode)"
    source_label="$(memory_ops_field source)"
    if [[ "$source_label" == fixture-* ]]; then
      source_status="fixture-only"
    fi
  fi

  {
    printf '# Memory Ops Health Report — Current Alias\n\n'
    printf '%s\n' 'This is a generated current alias for operator/workspace discovery.'
    printf '%s\n' 'Canonical ownership remains the live repo Memory Ops evidence tree.'
    printf '\n'
    printf -- '- generated_at_utc: %s\n' "$GENERATED_AT"
    printf -- '- resource_id: %s\n' "$MEMORY_OPS_RESOURCE_ID"
    printf -- '- alias_resource_id: %s\n' "$MEMORY_OPS_ALIAS_RESOURCE_ID"
    printf -- '- alias_kind: generated_current_alias\n'
    printf -- '- canonical_owner: memory_ops\n'
    printf -- '- canonical_host_path: %s\n' "$MEMORY_OPS_REPORT_HOST"
    printf -- '- canonical_runtime_path: %s\n' "$MEMORY_OPS_REPORT_RUNTIME"
    printf -- '- alias_host_path: %s\n' "$MEMORY_OPS_ALIAS_HOST"
    printf -- '- alias_runtime_path: %s\n' "$MEMORY_OPS_ALIAS_RUNTIME"
    printf -- '- producer_type: workspace_generated_alias\n'
    printf -- '- standalone_host_cron_lane: retired\n'
    printf -- '- source_status: %s\n' "$source_status"
    printf -- '- source_generated_at_utc: %s\n' "${source_generated_at:-unknown}"
    printf -- '- source_mode: %s\n' "${source_mode:-unknown}"
    printf -- '- source_label: %s\n' "${source_label:-unknown}"
    printf '\n## Guidance\n\n'
    printf '%s\n' '- Read the canonical live repo artifact when exact truth matters.'
    printf '%s\n' '- Do not hand-edit this alias; regenerate it through daily operator review prep.'
    printf '%s\n' '- The legacy standalone Memory Ops host cron lane remains retired.'
    printf '\n## Canonical Report Snapshot\n\n'
    if [[ -f "$MEMORY_OPS_REPORT_HOST" ]]; then
      sed -n '1,160p' "$MEMORY_OPS_REPORT_HOST"
    else
      printf '%s\n' 'Source report is currently missing.'
    fi
  } > "$MEMORY_OPS_ALIAS_HOST"
  chown ubuntu:ubuntu "$MEMORY_OPS_ALIAS_HOST"
}

memory_ops_report_note() {
  if [[ -f "$MEMORY_OPS_REPORT_HOST" ]]; then
    local source_label
    local evidence_scope
    source_label="$(memory_ops_field source)"
    evidence_scope="runtime_or_operator_evidence"
    if [[ "$source_label" == fixture-* ]]; then
      evidence_scope="fixture_only_not_runtime_evidence"
    fi
    printf 'resource_id: %s\nalias_resource_id: %s\ncanonical_owner: memory_ops\nproducer_type: repo_owned_report_artifact\nstandalone_host_cron_lane: retired\nlatest_path_host: %s\nlatest_path_runtime: %s\nalias_path_host: %s\nalias_path_runtime: %s\nstatus: present\nevidence_scope: %s\nsource_label: %s\n' \
      "$MEMORY_OPS_RESOURCE_ID" \
      "$MEMORY_OPS_ALIAS_RESOURCE_ID" \
      "$MEMORY_OPS_REPORT_HOST" \
      "$MEMORY_OPS_REPORT_RUNTIME" \
      "$MEMORY_OPS_ALIAS_HOST" \
      "$MEMORY_OPS_ALIAS_RUNTIME" \
      "$evidence_scope" \
      "${source_label:-unknown}"
    sed -n '1,120p' "$MEMORY_OPS_REPORT_HOST"
  else
    printf 'resource_id: %s\nalias_resource_id: %s\ncanonical_owner: memory_ops\nproducer_type: repo_owned_report_artifact\nstandalone_host_cron_lane: retired\nlatest_path_host: %s\nlatest_path_runtime: %s\nalias_path_host: %s\nalias_path_runtime: %s\nstatus: missing\n' \
      "$MEMORY_OPS_RESOURCE_ID" \
      "$MEMORY_OPS_ALIAS_RESOURCE_ID" \
      "$MEMORY_OPS_REPORT_HOST" \
      "$MEMORY_OPS_REPORT_RUNTIME" \
      "$MEMORY_OPS_ALIAS_HOST" \
      "$MEMORY_OPS_ALIAS_RUNTIME"
  fi
}

cron_health_note() {
  if [[ -n "$LATEST_CRON_HEALTH_HOST" && -f "$LATEST_CRON_HEALTH_HOST" ]]; then
    printf 'resource_id: ops.cron_health.latest_rollup\nlatest_path: %s\nlatest_runtime_path: /home/node/.openclaw/workspace/%s\nstatus: present\n' \
      "${LATEST_CRON_HEALTH_HOST#$WORKSPACE/}" \
      "${LATEST_CRON_HEALTH_HOST#$WORKSPACE/}"
  else
    printf 'resource_id: ops.cron_health.latest_rollup\nlatest_path: none\nlatest_runtime_path: none\nstatus: missing\n'
  fi
}

hygiene_note() {
  if [[ -n "$LATEST_HYGIENE_HOST" && -f "$LATEST_HYGIENE_HOST" ]]; then
    printf 'resource_id: ops.cron_session_hygiene.latest_report\nlatest_path: %s\nlatest_runtime_path: /home/node/.openclaw/workspace/%s\nstatus: present\n' \
      "${LATEST_HYGIENE_HOST#$WORKSPACE/}" \
      "${LATEST_HYGIENE_HOST#$WORKSPACE/}"
  else
    printf 'resource_id: ops.cron_session_hygiene.latest_report\nlatest_path: none\nlatest_runtime_path: none\nstatus: missing\n'
  fi
}

write_memory_ops_alias

cat > "$OUT" <<EOF
# Daily Operator Review Context

## Metadata
- generated_at_utc: $GENERATED_AT
- review_date: $TODAY
- required_heading: \`# Daily Operator Review — $TODAY\`
- review_type: daily operator review
- future_daily_review_artifact_runtime_path: $FUTURE_DAILY_ARTIFACT_RUNTIME
- daily_memory_evidence_runtime_path: $DAILY_MEMORY_EVIDENCE_RUNTIME
- memory_ops_resource_id: $MEMORY_OPS_RESOURCE_ID
- memory_ops_alias_resource_id: $MEMORY_OPS_ALIAS_RESOURCE_ID
- memory_ops_alias_runtime_path: $MEMORY_OPS_ALIAS_RUNTIME
- dedicated_session_key: \`$DAILY_OPERATOR_REVIEW_SESSION_KEY\`
- mode: report-only, lighter-than-weekly daily grounding

## Truth Hierarchy
1. Current \`docs/projects/deployment-topology/STATUS.md\`
2. Current \`docs/projects/deployment-topology/CURRENT_SLICE.md\`
3. Current \`docs/projects/deployment-topology/exhaustive-recovery-manifest.md\`
4. Current \`docs/system/deployment.md\`
5. Current \`docs/system/memory.md\`
6. Current \`docs/projects/maintenance/DEBT_REGISTER.md\`
7. Current \`archives/daily_memory_evidence/$TODAY.md\`
8. Current canonical repo status
9. Current cron/runtime/session evidence
10. Current Memory Ops Health Report, when present

## Required Output Shape
- Begin with \`# Daily Operator Review — $TODAY\`
- \`## Stack Status\`
- \`## Top Frictions\`
- \`## Priority Action Today\`
- \`## Watch Item\`
- \`## Optional Opportunity\`
- \`## Evidence Basis\`

## Recommendation Validity Rule
- \`Priority Action Today\` must default to the currently accepted next bounded pass from the canonical deployment and system docs named above.
- It may override that bounded pass only if current-day live evidence shows a higher-priority blocker or regression supported by concrete git, cron, log, runtime, or session evidence.
- Broader expansion ideas, adjacent improvements, and optional opportunities must not replace the immediate action unless that stronger blocker rule is met.
- If a requested field or claim is not supported by current evidence, state that explicitly instead of guessing.

## Stack Status Inputs

### Native OpenClaw cron summary
\`\`\`
$NATIVE_CRON_SUMMARY
\`\`\`

### Host cron summary
\`\`\`
cron_tz_america_nassau: $HOST_CRON_TZ_STATUS
$HOST_OPERATOR_JOBS
\`\`\`

### Canonical repo drift snapshot
\`\`\`
$REPO_STATUS
\`\`\`

### Session summary
\`\`\`
$SESSION_SUMMARY
\`\`\`

### Latest cron health rollup
\`\`\`
$(cron_health_note)
\`\`\`

### Latest cron/session hygiene report
\`\`\`
$(hygiene_note)
\`\`\`

### Daily memory evidence artifact
\`\`\`
$DAILY_MEMORY_EVIDENCE_SNIPPET
\`\`\`

### Canonical deployment status
\`\`\`
$DEPLOYMENT_STATUS_SNIPPET
\`\`\`

### Canonical current slice
\`\`\`
$DEPLOYMENT_CURRENT_SLICE_SNIPPET
\`\`\`

### Canonical deployment policy
\`\`\`
$SYSTEM_DEPLOYMENT_SNIPPET
\`\`\`

### Canonical memory policy
\`\`\`
$SYSTEM_MEMORY_SNIPPET
\`\`\`

### GitHub automation lane
\`\`\`
$GITHUB_AUTOMATION_SNIPPET
\`\`\`

### Memory Ops Health Report
\`\`\`
$(memory_ops_report_note)
\`\`\`

### Workspace memory writeability guard
\`\`\`
$(workspace_memory_writeability_guard_note "$WORKSPACE")
\`\`\`

## Narrow Context Sources
- \`docs/projects/deployment-topology/STATUS.md\` and \`CURRENT_SLICE.md\` remain the primary bounded-next-pass sources.
- \`docs/system/deployment.md\` and \`docs/system/memory.md\` remain the durable system-level policy surfaces.
- \`docs/projects/deployment-topology/exhaustive-recovery-manifest.md\` remains the authoritative rescue-backlog status surface.
- \`docs/projects/maintenance/DEBT_REGISTER.md\` remains the authority for unresolved maintenance debt when directly relevant.
- \`archives/daily_memory_evidence/$TODAY.md\` is the durable memory-evidence layer for this review.
- \`docs/projects/deployment-topology/github-automation.md\` is the authority for the GitHub digest lane contract.
- \`.openclaw-memory-ops/reports/latest.md\` is the canonical observe/report-only memory-ops recommendation surface when present.
- \`projects/ops/generated_current/memory_ops_health_report_current.md\` is the workspace-visible current alias for that report.
- Memory Ops lookups should resolve through the explicit resource ids above instead of fuzzy workspace search.
- Legacy workspace \`core/ROADMAP.md\` and workspace \`MEMORY.md\` are no longer authoritative for this review and must not override the canonical docs.
- Use these files selectively; do not restate large excerpts in the daily review.

## Writing Guidance
- Keep the review short and operational.
- Prefer concrete current-state statements over narrative recap.
- Limit \`Top Frictions\` to only the few items that materially affect today.
- Include \`Optional Opportunity\` only when live evidence clearly supports it.
- Do not include weekly-only sections such as automation baskets, net-new builds, long workflow inventories, or heavy drift analysis.
EOF

chown ubuntu:ubuntu "$OUT"
printf 'daily operator review prep wrote: %s\n' "$OUT"
