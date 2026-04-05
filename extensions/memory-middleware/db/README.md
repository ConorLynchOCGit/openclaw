# Memory Middleware DB Placement

## Purpose

This subtree is the canonical home for future database-backed work owned by the
`memory-middleware` plugin.

It exists to give the memory-system backend a stable repo-native location
without claiming that a repo-wide SQL or Supabase convention already exists.

## Canonical paths

- migration root: `extensions/memory-middleware/db/migrations/`
- schema namespace: `memory_middleware`
- schema and architecture docs: `docs/memory-system/SCHEMA.md`
- security and retrieval docs: `docs/memory-system/SECURITY_AND_RETRIEVAL.md`
- production adoption plan: `docs/memory-system/PRODUCTION_ADOPTION_PLAN.md`
- production readiness review: `docs/memory-system/PRODUCTION_READINESS_REVIEW.md`
- automation readiness review: `docs/memory-system/AUTOMATION_READINESS_REVIEW.md`
- operational runbook: `docs/memory-system/OPERATIONAL_RUNBOOK.md`
- shared non-production provisioning plan:
  `docs/memory-system/SHARED_NONPROD_PROVISIONING_PLAN.md`
- shared non-production provisioning report:
  `docs/memory-system/SHARED_NONPROD_PROVISIONING_REPORT.md`
- shared-environment rehearsal report:
  `docs/memory-system/SHARED_ENV_REHEARSAL_REPORT.md`
- staging rehearsal report: `docs/memory-system/STAGING_REHEARSAL_REPORT.md`
- real rollout report: `docs/memory-system/REAL_ENV_PASSIVE_READONLY_ROLLOUT_REPORT.md`
- real bounded write rollout report:
  `docs/memory-system/REAL_ENV_CANDIDATE_SUBMIT_ROLLOUT_REPORT.md`
- real bounded review rollout report:
  `docs/memory-system/REAL_ENV_CANDIDATE_REVIEW_ROLLOUT_REPORT.md`
- real bounded memory-promotion rollout report:
  `docs/memory-system/REAL_ENV_CANDIDATE_MEMORY_PROMOTION_ROLLOUT_REPORT.md`
- real bounded procedure-promotion rollout report:
  `docs/memory-system/REAL_ENV_CANDIDATE_PROCEDURE_PROMOTION_ROLLOUT_REPORT.md`
- real bounded procedure-validation rollout report:
  `docs/memory-system/REAL_ENV_PROCEDURE_VALIDATION_ROLLOUT_REPORT.md`
- real bounded skill-candidate rollout report:
  `docs/memory-system/REAL_ENV_SKILL_CANDIDATE_ROLLOUT_REPORT.md`
- real bounded procurement rollout report:
  `docs/memory-system/REAL_ENV_SKILL_CANDIDATE_PROCUREMENT_ROLLOUT_REPORT.md`
- real bounded vetting rollout report:
  `docs/memory-system/REAL_ENV_SKILL_CANDIDATE_VETTING_ROLLOUT_REPORT.md`
- real bounded approval rollout report:
  `docs/memory-system/REAL_ENV_SKILL_CANDIDATE_APPROVAL_ROLLOUT_REPORT.md`
- real bounded install rollout report:
  `docs/memory-system/REAL_ENV_SKILL_CANDIDATE_INSTALL_ROLLOUT_REPORT.md`
- real execute-class automation rollout report:
  `docs/memory-system/REAL_ENV_PROACTIVE_EXECUTE_DRIFT_CHECK_ROLLOUT_REPORT.md`
- real advisory consolidation rollout report:
  `docs/memory-system/REAL_ENV_CONSOLIDATION_PLAN_SCHEDULER_ROLLOUT_REPORT.md`
- real execute-class consolidation rollout report:
  `docs/memory-system/REAL_ENV_CONSOLIDATION_EXECUTE_SCHEDULER_ROLLOUT_REPORT.md`

## Current posture

This subtree now contains the first executable schema-v1 migration draft and
the second security or retrieval substrate migration draft.

The draft has also been reviewed and lightly refined for the first future
candidate-only tool surface.

The first candidate-only submission path has now been validated against a
disposable Docker `postgres:16` environment owned by the extension integration
tests.

The same controlled environment now also validates the first candidate-only
query surface for list and get inspection.

The same controlled environment now also validates the first bounded candidate
review mutation surface.

The same controlled environment now also validates the first advisory-only
candidate promotion-planning surface.

The same controlled environment now also validates the first bounded
memory-promotion write surface for eligible reviewed non-procedure candidates.

The same controlled environment now also validates the first advisory-only
validated-procedure planning surface for bounded draft procedures.

The same controlled environment now also validates the first bounded
validated-procedure write surface.

The same controlled environment now also validates the first advisory-only
skill-candidate planning surface for bounded validated procedures.

The same controlled environment now also validates the first bounded
skill-candidate write surface for eligible validated procedures.

The same controlled environment now also validates the first advisory-only
procurement-handoff planning surface for bounded skill candidates.

The same controlled environment now also validates the first bounded
procurement-record write surface for eligible skill candidates.

The same controlled environment now also validates the first advisory-only
manual Skill Vetter handoff surface for eligible skill candidates with
procurement records.

The same controlled environment now also validates the first bounded manual
vetting-result write surface for eligible skill candidates with procurement
records.

The same controlled environment now also validates the first advisory-only
approval and install planning surface for bounded skill candidates with
recorded manual vetting results.

The same controlled environment now also validates the first bounded
approval-state write surface for eligible skill candidates.

The same controlled environment now also validates the first advisory-only
manual install handoff surface for approved bounded skill candidates.

The same controlled environment now also validates the first bounded live
retrieval surface for approved memory objects, explicitly requested candidate
objects, and explicitly requested validated procedures.

The current repo-native production-readiness review now concludes that
scheduler and proactive surfaces should remain disabled until explicit
operator, inspection, disablement, and config-gate controls are documented.

The first proven shared non-production target now also uses the existing
Supabase project `wvfcvuwsnhupalpxfttc` with the middleware schema
`memory_middleware`.

Current shared-target connection note:

- the present Node `pg` path for that Supabase pooler target requires
  `uselibpqcompat=true&sslmode=require` in the middleware DB URL

Current production rollout note:

- the first production rollout remains pending actual production deployment
  access
- the concrete blocker and next operator step now live in:
  - `docs/memory-system/PRODUCTION_ROLLOUT_REPORT.md`

The same controlled environment now also validates the first bounded ranked
retrieval upgrade for approved memory objects and explicitly requested
validated procedures.

The same controlled environment now also validates the drafted security and
retrieval substrate migration on top of schema-v1, including helper
auth-membership tables, RLS and policies, curated views, retrieval columns and
indexes, helper access functions, and the `memory_embeddings` side table.

The live retrieval layer now also consumes part of that validated substrate:

- approved-only get and list use `internal_approved_memory_v`
- explicit candidate reads use `internal_reviewable_candidates_v`
- basic and ranked search use generated `search_document` columns
- ranked search uses bounded FTS plus trigram-style scoring
- semantic search uses `memory_embeddings` with caller-supplied vectors plus
  explicit embedding model/version gating
- retrieval records now expose which bounded read surface produced them

The first bounded context-plane tool-result surface now also uses the schema:

- oversized or force-persisted tool outputs write one canonical
  `tool_results` row
- the same persisted writes also emit one provenance `memory_events` row with
  `event_kind = tool_result`
- below-threshold tool outputs return inline preview contracts without
  writing any database rows
- full persisted payloads can be rehydrated later through the bounded
  `memory_tool_result_get` surface

The first bounded microcompaction layer now also uses the schema:

- `memory_tool_result_microcompact_plan` reads persisted `tool_results`
- it preserves a bounded recent floor
- it returns deterministic oldest-first clear candidates when idle-gap,
  count, or explicit token-pressure thresholds are exceeded
- it does not yet write `compaction_events`

The first bounded session-memory layer now also uses the schema:

- `memory_session_get` reads `agent_state`
- `memory_session_update` writes one `agent_state` row with
  `state_key = session_memory`
- missing session-memory state returns a stable empty structured template
- repeated updates stay deterministic and do not emit `memory_events`

The first bounded compaction planner now also uses the schema:

- `memory_compaction_plan` reads persisted `tool_results` through the bounded
  microcompaction planner
- `memory_compaction_plan` reads `agent_state` session memory to decide
  whether session memory is fresh, sufficient, or missing
- it does not write `compaction_events`, mutate `tool_results`, or change
  session-memory state

The first bounded microcompaction execution layer now also uses the schema:

- `memory_tool_result_microcompact_execute` updates eligible `tool_results`
  rows from `persisted` to `compacted`
- it clears `preview_text` while preserving full payload rehydration
- it records one bounded `compaction_events` row for the execution
- it does not summarize transcripts, update session memory, or perform any
  full fallback compaction

The first bounded session-memory-backed compaction execution layer now also
uses the schema:

- `memory_session_compact_execute` reads existing bounded session memory from
  `agent_state`
- it writes at most one bounded `compaction_events` row tied to the specific
  session-memory state and freshness point
- it does not mutate `agent_state`, summarize transcripts, or perform the
  future full fallback compaction

The first bounded full-fallback compaction execution layer now also uses the
schema:

- `memory_full_compaction_fallback_execute` reads the bounded compaction
  planner substrate and existing `agent_state` session memory when present
- it writes at most one bounded `compaction_events` row with
  `compaction_kind = full`
- it does not summarize transcripts, mutate `agent_state`, mutate
  `tool_results`, or introduce broader runtime takeover behavior

The first bounded consolidation and drift planning layer now also uses the
schema:

- `memory_consolidation_plan` reads approved durable memory through the
  bounded retrieval substrate
- it optionally reads validated procedures when the caller explicitly enables
  that scope
- it returns only advisory duplicate, contradiction, stale, superseded, or
  drift review findings
- it does not write `memory_objects`, `procedures`, `skill_candidates`,
  `memory_events`, or `compaction_events`

The first bounded consolidation execution layer now also uses the schema:

- `memory_consolidation_execute` reads either planner-derived findings or an
  explicit approved finding subset
- it writes only conservative durable-memory hygiene state:
  - `memory_reviews` rows with `action = supersede`
  - `memory_links` rows with `link_kind = supersedes`
  - approved `memory_objects` transitions to `review_state = superseded`
- contradiction and drift findings remain advisory-only
- it does not write `memory_events`, `compaction_events`, `procedures`,
  `skill_candidates`, or policy rows

The first bounded drift-check execution layer now also uses the schema:

- `memory_drift_check_execute` reads overdue bounded drift findings from the
  planner or an explicit approved subset
- it writes one bounded `memory_events` row per executed drift-check artifact
- it refreshes only bounded target metadata such as `driftCheckedAt`,
  outcome, and the recorded event id on `memory_objects` or `procedures`
- it does not rewrite stored fact content, procedure bodies, policy rows, or
  broader review state

The first bounded background-job scheduling layer now also uses the schema:

- `memory_background_job_enqueue` writes only `background_jobs` rows with
  `job_kind = maintenance`
- `memory_background_job_list` and `memory_background_job_get` inspect only
  persisted bounded `maintenance` jobs and do not execute them
- the bounded middleware-owned job class lives in the persisted job `payload`
- bounded enqueue metadata stores a payload fingerprint for conservative
  duplicate suppression
- scheduler config is now separated into:
  - inspection enablement
  - advisory scheduling enablement
  - advisory job-class allowlist
  - execute-class scheduling enablement
  - optional runner-owner enforcement for run-next
- `memory_background_job_run_next` claims only ready queued jobs for:
  - `proactive_plan`
  - `proactive_execute_run_drift_check`
  - `consolidation_plan`
  - `consolidation_execute`
- run-next updates only bounded job state on `background_jobs` plus whatever
  the already-bounded proactive planner, consolidation planner, or
  drift-check executor may do
- scheduled `consolidation_execute` requires an explicit safe approved subset
  and may run only duplicate or stale-superseded bounded consolidation actions
- no procurement, install, messaging, or external workflows are scheduled or
  executed in this slice

The first live automation rollout in the persistent local non-production
target now uses:

- `inspectionMode = enabled`
- `advisorySchedulingMode = enabled`
- `advisoryJobClasses = [proactive_plan]`
- `executeSchedulingMode = disabled`
- `runnerOwnerId = rollout-runner-1`

That rollout is recorded in
`docs/memory-system/REAL_ENV_PROACTIVE_PLAN_SCHEDULER_ROLLOUT_REPORT.md`.

The next live execute-class rollout in that same target now uses:

- `inspectionMode = enabled`
- `advisorySchedulingMode = enabled`
- `advisoryJobClasses = [proactive_plan]`
- `executeSchedulingMode = enabled`
- `executeJobClasses = [proactive_execute_run_drift_check]`
- `runnerOwnerId = rollout-runner-1`

That rollout is recorded in
`docs/memory-system/REAL_ENV_PROACTIVE_EXECUTE_DRIFT_CHECK_ROLLOUT_REPORT.md`.

The next live advisory consolidation rollout in that same target now uses:

- `inspectionMode = enabled`
- `advisorySchedulingMode = enabled`
- `advisoryJobClasses = [proactive_plan, consolidation_plan]`
- `executeSchedulingMode = enabled`
- `executeJobClasses = [proactive_execute_run_drift_check]`
- `runnerOwnerId = rollout-runner-1`

That rollout is recorded in
`docs/memory-system/REAL_ENV_CONSOLIDATION_PLAN_SCHEDULER_ROLLOUT_REPORT.md`.

The next live execute-class consolidation rollout in that same target now
uses:

- `inspectionMode = enabled`
- `advisorySchedulingMode = enabled`
- `advisoryJobClasses = [proactive_plan, consolidation_plan]`
- `executeSchedulingMode = enabled`
- `executeJobClasses = [proactive_execute_run_drift_check, consolidation_execute]`
- `runnerOwnerId = rollout-runner-1`

That rollout is recorded in
`docs/memory-system/REAL_ENV_CONSOLIDATION_EXECUTE_SCHEDULER_ROLLOUT_REPORT.md`.

The next post-maintenance automation decision is recorded in
`docs/memory-system/AUTOMATION_READINESS_REVIEW.md`.

The operator runbook for that posture is recorded in
`docs/memory-system/OPERATIONAL_RUNBOOK.md`.

The shared-environment reconciliation result for that posture is recorded in
`docs/memory-system/SHARED_ENV_REHEARSAL_REPORT.md`.

It does not:

- execute migrations
- define broad runtime database behavior beyond the bounded candidate-only and
  durable-memory slices already implemented in the plugin

The concrete later real-environment sequencing for migration rehearsal,
staging rollout, limited production adoption, observability, and rollback now
lives in `docs/memory-system/PRODUCTION_ADOPTION_PLAN.md`.

The first non-production staging-like rehearsal has now been executed in the
disposable local Docker validation lane and recorded in
`docs/memory-system/STAGING_REHEARSAL_REPORT.md`.

The first real non-disposable non-production rollout has now been executed in
the persistent local Docker target and recorded in
`docs/memory-system/REAL_ENV_PASSIVE_READONLY_ROLLOUT_REPORT.md`.

The next real non-disposable non-production bounded write rollout has now been
executed in that same target with `candidateIngress.mode = submit-only` and
recorded in `docs/memory-system/REAL_ENV_CANDIDATE_SUBMIT_ROLLOUT_REPORT.md`.

The next real non-disposable non-production bounded review rollout has now
been executed in that same target with
`candidateIngress.mode = submit-review-only` and recorded in
`docs/memory-system/REAL_ENV_CANDIDATE_REVIEW_ROLLOUT_REPORT.md`.

The next real non-disposable non-production bounded memory-promotion rollout
has now been executed in that same target with
`candidateIngress.mode = submit-review-promote-memory` and recorded in
`docs/memory-system/REAL_ENV_CANDIDATE_MEMORY_PROMOTION_ROLLOUT_REPORT.md`.

The next real non-disposable non-production bounded procedure-promotion
rollout has now been executed in that same target with
`candidateIngress.mode = submit-review-promote-memory-procedure` and recorded
in `docs/memory-system/REAL_ENV_CANDIDATE_PROCEDURE_PROMOTION_ROLLOUT_REPORT.md`.

The next real non-disposable non-production bounded procedure-validation
rollout has now been executed in that same target with
`candidateIngress.mode = submit-review-promote-memory-procedure-validate` and
recorded in `docs/memory-system/REAL_ENV_PROCEDURE_VALIDATION_ROLLOUT_REPORT.md`.

The next real non-disposable non-production bounded skill-candidate rollout
has now been executed in that same target with
`candidateIngress.mode = submit-review-promote-memory-procedure-validate-skill`
and recorded in `docs/memory-system/REAL_ENV_SKILL_CANDIDATE_ROLLOUT_REPORT.md`.

The next real non-disposable non-production bounded procurement rollout has
now been executed in that same target with
`candidateIngress.mode = submit-review-promote-memory-procedure-validate-skill-procurement`
and recorded in
`docs/memory-system/REAL_ENV_SKILL_CANDIDATE_PROCUREMENT_ROLLOUT_REPORT.md`.

The next real non-disposable non-production bounded vetting rollout has now
been executed in that same target with
`candidateIngress.mode = submit-review-promote-memory-procedure-validate-skill-procurement-vetting`
and recorded in
`docs/memory-system/REAL_ENV_SKILL_CANDIDATE_VETTING_ROLLOUT_REPORT.md`.

The next real non-disposable non-production bounded approval rollout has now
been executed in that same target with
`candidateIngress.mode = submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval`
and recorded in
`docs/memory-system/REAL_ENV_SKILL_CANDIDATE_APPROVAL_ROLLOUT_REPORT.md`.

The next real non-disposable non-production bounded install rollout has now
been executed in that same target with
`candidateIngress.mode = submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install`
and recorded in
`docs/memory-system/REAL_ENV_SKILL_CANDIDATE_INSTALL_ROLLOUT_REPORT.md`.

## Migration naming convention

Use timestamp-prefixed SQL filenames with a stable memory-middleware slug:

- `YYYYMMDD_HHMMSS_memory_middleware_schema_v1.sql`
- `YYYYMMDD_HHMMSS_memory_middleware_security_retrieval.sql`

Current first migration draft:

- `20260401_000001_memory_middleware_schema_v1.sql`

Current second migration draft:

- `20260401_000002_memory_middleware_security_retrieval.sql`

The timestamp prefix keeps ordering explicit. The suffix keeps the migration
purpose readable in review.

## Notes

The first migration is drafted in-repo and applied only inside the controlled
validation environment used by the integration tests.

The second migration is drafted in-repo but remains unexecuted in this slice.

The second migration is now executed only inside the disposable local
validation environment used by the integration tests.

The current validation and runtime-adoption pass keeps the scope disciplined:

- no execution of the drafted RLS layer
- no live retrieval RPCs
- no production embedding generation or refresh pipeline
- no broad runtime wiring
