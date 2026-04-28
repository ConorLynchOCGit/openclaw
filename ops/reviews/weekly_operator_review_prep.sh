#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORKSPACE="${OPENCLAW_WORKSPACE_DIR:-/root/.openclaw/workspace}"
source "$REPO_ROOT/ops/host/lib/postgres_client.sh"
source "$REPO_ROOT/ops/host/lib/report_sessions.sh"
source "$REPO_ROOT/ops/host/lib/workspace_memory_guard.sh"
OPS_DIR="$REPO_ROOT/ops/reviews"
GENERATED_DIR="$WORKSPACE/projects/ops/generated_current"
ARCHIVE_DIR="$WORKSPACE/archives/weekly_operator_reviews"
CRON_HEALTH_DIR="$WORKSPACE/archives/cron_health_rollups"
INACTIVE_WORKFLOW_DIR="$WORKSPACE/archives/workflow_inactive_reviews"
DAILY_MEMORY_EVIDENCE_DIR="$WORKSPACE/archives/daily_memory_evidence"
OUT="$GENERATED_DIR/weekly_review_context_current.md"
WEEK_ID="$(date +%G-W%V)"
GENERATED_AT="$(date -u +%FT%TZ)"
ARTIFACT_HOST="$ARCHIVE_DIR/${WEEK_ID}.md"
ARTIFACT_RUNTIME="/home/node/.openclaw/workspace/archives/weekly_operator_reviews/${WEEK_ID}.md"
CRON_HEALTH_HOST="$CRON_HEALTH_DIR/$(date +%F).md"
CRON_HEALTH_RUNTIME="/home/node/.openclaw/workspace/archives/cron_health_rollups/$(date +%F).md"
INACTIVE_WORKFLOW_HOST="$INACTIVE_WORKFLOW_DIR/$(date +%F).md"
INACTIVE_WORKFLOW_RUNTIME="/home/node/.openclaw/workspace/archives/workflow_inactive_reviews/$(date +%F).md"
TODAY_CRON_HEALTH_REL="archives/cron_health_rollups/$(date +%F).md"
TODAY="$(date +%F)"
DAILY_MEMORY_EVIDENCE_HOST="$DAILY_MEMORY_EVIDENCE_DIR/${TODAY}.md"
DAILY_MEMORY_EVIDENCE_RUNTIME="/home/node/.openclaw/workspace/archives/daily_memory_evidence/${TODAY}.md"
OPENCLAW_CONTAINER="${OPENCLAW_CONTAINER:-$(docker ps --format '{{.Names}}' | grep -E '^openclaw-runtime$|^openclaw$|openclaw.*gateway' | head -n 1)}"
N8N_CONTAINER=webhook-gateway-n8n-1

mkdir -p "$GENERATED_DIR" "$ARCHIVE_DIR" "$CRON_HEALTH_DIR" "$INACTIVE_WORKFLOW_DIR"
"$OPS_DIR/daily_memory_evidence_rollup.sh" "$TODAY" >/dev/null
touch "$CRON_HEALTH_HOST"
touch "$INACTIVE_WORKFLOW_HOST"
chown ubuntu:ubuntu "$ARCHIVE_DIR" "$CRON_HEALTH_DIR" "$CRON_HEALTH_HOST" "$INACTIVE_WORKFLOW_DIR" "$INACTIVE_WORKFLOW_HOST"
if [[ -f "$ARTIFACT_HOST" ]]; then
  chown ubuntu:ubuntu "$ARTIFACT_HOST"
fi

get_db_var() {
  docker exec "$N8N_CONTAINER" sh -lc "printf %s \"\${$1}\""
}

DB_HOST=$(get_db_var DB_POSTGRESDB_HOST)
DB_PORT=$(get_db_var DB_POSTGRESDB_PORT)
DB_NAME=$(get_db_var DB_POSTGRESDB_DATABASE)
DB_USER=$(get_db_var DB_POSTGRESDB_USER)
DB_PASS=$(get_db_var DB_POSTGRESDB_PASSWORD)

run_sql() {
  local sql="$1"
  docker run --rm \
    -e PGPASSWORD="$DB_PASS" \
    "$OPENCLAW_POSTGRES_CLIENT_IMAGE" \
    psql "host=$DB_HOST port=$DB_PORT dbname=$DB_NAME user=$DB_USER sslmode=require" \
    -Atc "$sql"
}

SESSION_FILE_COUNT="$(find /root/.openclaw/agents -path '*/sessions/*.jsonl' -type f | wc -l | tr -d ' ')"
SESSION_BYTES="$(du -sh /root/.openclaw/agents/*/sessions 2>/dev/null || true)"
REPO_STATUS="$(git -C "$REPO_ROOT" status --short --branch --untracked-files=all || true)"
HOST_CRONTAB="$(crontab -l 2>/dev/null || true)"
HOST_ACTIVE_CRONTAB="$(printf '%s\n' "$HOST_CRONTAB" | grep -v '^[[:space:]]*#' || true)"
OPENCLAW_CRONS="$(docker exec "$OPENCLAW_CONTAINER" sh -lc 'openclaw cron list --all --json' || true)"
N8N_WORKFLOWS="$(docker exec "$N8N_CONTAINER" sh -lc 'n8n list:workflow' || true)"
SYNC_LOG="$(sed -n '1,120p' /root/backups/cron-logs/n8n_sync_check.log 2>/dev/null || true)"
DB_LOG="$(sed -n '1,120p' /root/backups/cron-logs/db_probe.log 2>/dev/null || true)"
GITHUB_REPOS_WEEK="$(run_sql "select repository_full_name || '|' || count(*)::text || '|' || max(received_at)::text from inbound_events where source = 'github' and signature_valid = true and repository_full_name = any (array['openclaw/openclaw']) and received_at >= now() - interval '7 days' group by repository_full_name order by max(received_at) desc;")"
GITHUB_NONCANONICAL_REPOS="$(run_sql "select repository_full_name || '|' || count(*)::text || '|' || max(received_at)::text from inbound_events where source = 'github' and signature_valid = true and repository_full_name <> 'openclaw/openclaw' group by repository_full_name order by max(received_at) desc;")"
INGRESS_COUNTS="$(run_sql "select 'github_inbound_events' || '|' || count(*) || '|' || coalesce(max(received_at)::text,'none') from inbound_events union all select 'intake_events' || '|' || count(*) || '|' || coalesce(max(received_at)::text,'none') from intake_events;")"
DURABILITY_CAPTURE="$(
  {
    find "$REPO_ROOT/docs/projects/live-app-patches" -maxdepth 2 -mindepth 1 -type d 2>/dev/null
    find "$WORKSPACE/archives" -maxdepth 4 -mindepth 2 -path '*/live_app_patches/*' -type d 2>/dev/null
  } | sort -u
)"
OPENCLAW_RUNBOOK_SNIPPET="$(sed -n '1,200p' "$REPO_ROOT/docs/projects/deployment-topology/runbooks/openclaw-runtime-operations.md" 2>/dev/null || true)"
WEBHOOK_RUNBOOK_SNIPPET="$(sed -n '1,200p' "$REPO_ROOT/docs/projects/deployment-topology/runbooks/webhook-gateway-operations.md" 2>/dev/null || true)"
DEPLOYMENT_STATUS_SNIPPET="$(sed -n '1,220p' "$REPO_ROOT/docs/projects/deployment-topology/STATUS.md" 2>/dev/null || true)"
DEPLOYMENT_CURRENT_SLICE_SNIPPET="$(sed -n '1,160p' "$REPO_ROOT/docs/projects/deployment-topology/CURRENT_SLICE.md" 2>/dev/null || true)"
RECOVERY_MANIFEST_SNIPPET="$(sed -n '1,220p' "$REPO_ROOT/docs/projects/deployment-topology/exhaustive-recovery-manifest.md" 2>/dev/null || true)"
SYSTEM_DEPLOYMENT_SNIPPET="$(sed -n '1,220p' "$REPO_ROOT/docs/system/deployment.md" 2>/dev/null || true)"
SYSTEM_MEMORY_SNIPPET="$(sed -n '1,220p' "$REPO_ROOT/docs/system/memory.md" 2>/dev/null || true)"
GITHUB_AUTOMATION_SNIPPET="$(sed -n '1,200p' "$REPO_ROOT/docs/projects/deployment-topology/github-automation.md" 2>/dev/null || true)"
CRON_HEALTH_SNIPPET="$(sed -n '1,160p' "$CRON_HEALTH_HOST" 2>/dev/null || true)"
INACTIVE_WORKFLOW_SNIPPET="$(sed -n '1,160p' "$INACTIVE_WORKFLOW_HOST" 2>/dev/null || true)"
DAILY_MEMORY_EVIDENCE_SNIPPET="$(sed -n '1,160p' "$DAILY_MEMORY_EVIDENCE_HOST" 2>/dev/null || true)"

cat > "$OUT" <<EOF
# Weekly Operator Review Context

- week_id: $WEEK_ID
- generated_at_utc: $GENERATED_AT
- required_heading: \`# Weekly Operator Review — $WEEK_ID\`
- artifact_host_path: $ARTIFACT_HOST
- artifact_runtime_path: $ARTIFACT_RUNTIME
- cron_health_artifact_host_path: $CRON_HEALTH_HOST
- cron_health_artifact_runtime_path: $CRON_HEALTH_RUNTIME
- inactive_workflow_review_host_path: $INACTIVE_WORKFLOW_HOST
- inactive_workflow_review_runtime_path: $INACTIVE_WORKFLOW_RUNTIME
- daily_memory_evidence_runtime_path: $DAILY_MEMORY_EVIDENCE_RUNTIME
- dedicated_session_key: \`$WEEKLY_OPERATOR_REVIEW_SESSION_KEY\`
- v1_mode: report-only for operational findings

## Required Output Shape
- Deliver the full review into the dedicated Weekly Operator Review session.
- Return only the final review markdown in that dedicated session; do not perform any file writes from the session.
- The host sync step will persist the same review to \`$ARTIFACT_HOST\` after dedicated-session delivery.
- Deliver a compact secondary summary to Telegram separately; do not include that mobile summary here.
- Do not auto-edit canonical deployment or system docs from the review session.
- Operational findings must stay report-only in v1.
- Treat this context file and the live inputs below as the source of truth for this run.
- Ignore any prior weekly review attempts, stale weekly artifact text, or earlier failure notes in session history.
- Do not mention artifact plumbing, approval mechanics, missing directories, sync steps, or cron activation steps in the review body.
- Do not restate pre-Phase-8 conditions. GitHub durability for the workspace is already live.

## Required Review Scope
- session bloat audit
- workspace drift audit
- cron/runbook alignment audit
- workflow drift and unmanaged workflow review
- durability capture audit
- ingress coverage audit
- roadmap intelligence basket:
  - friction detected this week
  - candidate automations
  - recommended immediate action
  - new roadmap delta candidates
  - new application ideas
  - monetization/productization concepts
  - recommended net-new build

## Truth Hierarchy
1. Current \`docs/projects/deployment-topology/STATUS.md\`
2. Current \`docs/projects/deployment-topology/CURRENT_SLICE.md\`
3. Current \`docs/projects/deployment-topology/exhaustive-recovery-manifest.md\`
4. Current \`docs/system/deployment.md\`
5. Current \`docs/system/memory.md\`
6. Current \`archives/daily_memory_evidence/$TODAY.md\`
7. Current canonical repo status
8. Current cron/runtime state
9. Current logs/probes

Historical weekly artifacts are comparison-only, never the primary basis for current-state judgments or recommendations.

## Recommendation Validity Rules
- Derive current-state judgments from the source-of-truth files first, then validate against live evidence below.
- Before outputting any recommendation, validate that it is consistent with:
  - the current operating model
  - the current roadmap state
  - current git/runtime/cron/log evidence
- Do not recommend work already marked live, complete, minimally live, or in progress unless framed as closeout, hardening, or a clearly defined follow-on expansion.
- Do not report drift, uncommitted work, runtime issues, or delivery issues unless current live evidence below supports the claim.
- Recommended Immediate Action must default to the currently accepted next bounded pass from the canonical deployment and system docs named above.
- Only override that bounded pass if current-week live evidence shows a higher-priority blocker or regression that is explicitly supported by run-status, git, cron, log, or other concrete operational evidence.
- If there is no clearly evidenced higher-priority blocker, do not recommend a broader or adjacent expansion as the immediate action.
- Expansion candidates, adjacent roadmap opportunities, next-pass scope, roadmap deltas, candidate automations, and net-new build ideas must stay out of Recommended Immediate Action and belong in their later sections instead.
- Do not carry forward prior blockers, friction points, or recommendations unless they are still supported by current evidence.
- Prefer concrete current-week reasons, not inherited historical friction that is already resolved.
- Existing roadmap items may appear only as:
  - immediate operational action
  - closeout
  - hardening
  - follow-on pressure
- Existing roadmap items must not be presented as net-new ideas.
- For anything placed in:
  - New roadmap delta candidates
  - New application ideas
  - monetization / productization concepts
  - Recommended Net-New Build
  validate that it is not already present in the canonical deployment and system docs in substance, not just by exact string match.
- Do not report a net-new build if it is merely a restatement of an existing roadmap item.
- If there is no strong net-new build candidate this week, say exactly:
  - No net-new build recommendation this week
  - Current roadmap remains directionally correct; immediate value is in execution / closeout / hardening

## Current Live Truths
- GitHub durability for the canonical workspace is already live.
- The workspace baseline and live app patch durability artifacts are already committed and pushed.
- Weekly artifact durability already exists at \`$ARTIFACT_HOST\`.
- Do not describe Phase 8 as pending or not live.
- Legacy workspace \`core/ROADMAP.md\` and workspace \`MEMORY.md\` are not authoritative for this review.
- Host crontab lines prefixed with \`DISABLED_AFTER_VPS_CONSOLIDATION\` are historical references, not active jobs.

## Canonical Deployment Status Snippet
\`\`\`
$DEPLOYMENT_STATUS_SNIPPET
\`\`\`

## Canonical Current Slice Snippet
\`\`\`
$DEPLOYMENT_CURRENT_SLICE_SNIPPET
\`\`\`

## Recovery Manifest Snippet
\`\`\`
$RECOVERY_MANIFEST_SNIPPET
\`\`\`

## System Deployment Policy
\`\`\`
$SYSTEM_DEPLOYMENT_SNIPPET
\`\`\`

## System Memory Policy
\`\`\`
$SYSTEM_MEMORY_SNIPPET
\`\`\`

## GitHub Automation Lane
\`\`\`
$GITHUB_AUTOMATION_SNIPPET
\`\`\`

## Daily Memory Evidence Artifact
\`\`\`
$DAILY_MEMORY_EVIDENCE_SNIPPET
\`\`\`

## Workspace Memory Writeability Guard
\`\`\`
$(workspace_memory_writeability_guard_note "$WORKSPACE")
\`\`\`

## Session Bloat Audit Inputs
\`\`\`
session_file_count=$SESSION_FILE_COUNT
$SESSION_BYTES
\`\`\`

## Canonical Repo Drift Audit Inputs
\`\`\`
$REPO_STATUS
\`\`\`

## Host Cron Setup
\`\`\`
$HOST_ACTIVE_CRONTAB
\`\`\`

## OpenClaw Native Cron Jobs
\`\`\`json
$OPENCLAW_CRONS
\`\`\`

## Cron Health Roll-Up Artifact
\`\`\`
$CRON_HEALTH_SNIPPET
\`\`\`

## Inactive Workflow Review Artifact
\`\`\`
$INACTIVE_WORKFLOW_SNIPPET
\`\`\`

## n8n Workflow Inventory
\`\`\`
$N8N_WORKFLOWS
\`\`\`

## Latest Host Check Logs
### n8n sync check
\`\`\`
$SYNC_LOG
\`\`\`

### DB probe
\`\`\`
$DB_LOG
\`\`\`

## Ingress Coverage Audit Inputs
### Canonical GitHub repos seen in last 7 days
\`\`\`
$GITHUB_REPOS_WEEK
\`\`\`

### Non-canonical GitHub repos still present in inbound_events
\`\`\`
$GITHUB_NONCANONICAL_REPOS
\`\`\`

### Ingress event counts
\`\`\`
$INGRESS_COUNTS
\`\`\`

## Durability Capture Audit Inputs
\`\`\`
$DURABILITY_CAPTURE
\`\`\`

## Runbook Alignment Inputs
### OpenClaw runbook snippet
\`\`\`
$OPENCLAW_RUNBOOK_SNIPPET
\`\`\`

### Webhook gateway runbook snippet
\`\`\`
$WEBHOOK_RUNBOOK_SNIPPET
\`\`\`

## Writing Guidance
- Produce a concise but substantive weekly operator review.
- Use short sections and flat bullets.
- Keep operational findings concrete and action-oriented.
- Mark anything uncertain explicitly.
- Use these closing headings exactly:
  - \`## Recommended Immediate Action\`
  - \`## New Roadmap Delta Candidates\`
  - \`## Recommended Net-New Build\`
- The Recommended Immediate Action may point to an existing roadmap item, but only as closeout, hardening, follow-on pressure, or immediate execution.
- The Recommended Net-New Build must be genuinely new relative to the canonical deployment and system docs, or explicitly state that there is no net-new build recommendation this week.
- Any immediate-action recommendation must cite at least two concrete reasons from this week's evidence.
EOF

chown ubuntu:ubuntu "$OUT"
printf 'weekly operator review prep wrote: %s\n' "$OUT"
