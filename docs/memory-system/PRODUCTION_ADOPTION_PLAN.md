# Memory Middleware Production Adoption Plan

## Purpose

This document defines the concrete repo-native plan for moving
`extensions/memory-middleware` from the current disposable validation lane into
a real runtime environment.

This is an operational rollout plan only.

It does not:

- apply migrations
- enable production automation
- change runtime behavior in this slice
- claim the exclusive `memory` slot
- replace `memory-core` or `memory-lancedb`

The separate readiness decision document for whether any live automation
should be enabled next is:

- `docs/memory-system/PRODUCTION_READINESS_REVIEW.md`
- `docs/memory-system/AUTOMATION_READINESS_REVIEW.md`
- `docs/memory-system/OPERATIONAL_RUNBOOK.md`
- `docs/memory-system/SHARED_ENV_REHEARSAL_REPORT.md`

## Current implementation baseline

The middleware already supports bounded internal tools and DB-backed flows for:

- candidate capture, review, and promotion
- validated-procedure and skill-candidate bounded workflows
- bounded retrieval and session-memory surfaces
- bounded compaction planning and execution
- bounded consolidation planning and safe consolidation execution
- bounded drift-check execution
- advisory proactive planning
- proactive execution for `run_drift_check` only
- bounded background-job scheduling for:
  - `proactive_plan`
  - `proactive_execute_run_drift_check`
  - `consolidation_plan`
  - `consolidation_execute`

That implementation has been validated in a disposable Postgres lane.

## Production adoption goals

The first real-environment rollout should prove that the middleware can:

- connect to a managed Postgres environment safely
- apply the existing migrations in a controlled sequence
- run as a regular bundled plugin beside existing memory plugins
- expose bounded tools without taking over runtime memory ownership
- keep automation narrow, explicit, and mostly disabled by default
- provide enough observability to stop or roll back quickly

Current production rollout note:

- this document still describes the production rollout shape
- the first production rollout has now been executed successfully on the live
  VPS Docker Compose runtime using only the approved minimal config patch
- the production runtime identity is now resolved in
  `docs/memory-system/PRODUCTION_SURFACE_INVENTORY_AND_DIFF.md`
- the actual live VPS runtime has been inventoried and backed up in
  `docs/memory-system/PRODUCTION_SURFACE_INVENTORY_AND_DIFF.md`
- the rollout result now lives in:
  - `docs/memory-system/PRODUCTION_ROLLOUT_REPORT.md`
- the first production soak review now lives in:
  - `docs/memory-system/PRODUCTION_SOAK_REPORT.md`

## Runtime environments and assumptions

The rollout assumes these environment tiers:

### 1. Disposable local validation

Purpose:

- migration rehearsal
- integration-test validation
- query and tool-shape verification

Current state:

- already in use

### 2. Internal shared staging or preproduction database

Purpose:

- first managed Postgres rehearsal
- migration timing and extension validation
- bounded runtime smoke tests with real deployment wiring

Assumptions:

- owned by maintainers
- isolated from production data
- service-role credentials available only to the runtime owner
- plugin still runs as a regular bundled plugin

Current repo reality:

- this shared managed staging environment is still not wired from the repo by
  default
- the currently available repo-owned rehearsal lane is the disposable local
  Docker `pgvector/pg16` environment already used by integration validation
- the first real non-disposable non-production rollout target now uses a
  persistent local Docker Postgres container with a named volume
- the repo's actual server-hosted runtime surface is Docker Compose plus the
  operator-managed `~/.openclaw` config tree
- the first shared non-production target was therefore wired by reusing that
  server-hosted Docker runtime and the existing Supabase project, not by
  inventing a second deployment surface

### 3. Limited production runtime

Purpose:

- first controlled real-environment adoption

Assumptions:

- the middleware remains non-exclusive
- `memory-core` and `memory-lancedb` remain unchanged
- the rollout starts with bounded internal usage only
- background-job invocation remains explicit and controlled
- no external messaging, procurement, install, or Skill Vetter automation is
  enabled

Current first real rollout reality:

- no shared managed staging or preproduction target is wired from this repo
  today
- the first real rollout therefore uses the persistent local non-production
  Docker target documented in
  `docs/memory-system/REAL_ENV_PASSIVE_READONLY_ROLLOUT_REPORT.md`
- the next bounded write rollout in that same target is documented in
  `docs/memory-system/REAL_ENV_CANDIDATE_SUBMIT_ROLLOUT_REPORT.md`
- the next bounded review rollout in that same target is documented in
  `docs/memory-system/REAL_ENV_CANDIDATE_REVIEW_ROLLOUT_REPORT.md`
- the next bounded memory-promotion rollout in that same target is documented
  in `docs/memory-system/REAL_ENV_CANDIDATE_MEMORY_PROMOTION_ROLLOUT_REPORT.md`
- the next bounded procedure-promotion rollout in that same target is
  documented in
  `docs/memory-system/REAL_ENV_CANDIDATE_PROCEDURE_PROMOTION_ROLLOUT_REPORT.md`
- the next bounded procedure-validation rollout in that same target is
  documented in
  `docs/memory-system/REAL_ENV_PROCEDURE_VALIDATION_ROLLOUT_REPORT.md`
- the next bounded skill-candidate rollout in that same target is documented
  in `docs/memory-system/REAL_ENV_SKILL_CANDIDATE_ROLLOUT_REPORT.md`
- the next bounded procurement rollout in that same target is documented in
  `docs/memory-system/REAL_ENV_SKILL_CANDIDATE_PROCUREMENT_ROLLOUT_REPORT.md`
- the next bounded vetting rollout in that same target is documented in
  `docs/memory-system/REAL_ENV_SKILL_CANDIDATE_VETTING_ROLLOUT_REPORT.md`
- the next bounded approval rollout in that same target is documented in
  `docs/memory-system/REAL_ENV_SKILL_CANDIDATE_APPROVAL_ROLLOUT_REPORT.md`
- the first live automation rollout in that same target is documented in
  `docs/memory-system/REAL_ENV_PROACTIVE_PLAN_SCHEDULER_ROLLOUT_REPORT.md`
- the next live execute-class rollout in that same target is documented in
  `docs/memory-system/REAL_ENV_PROACTIVE_EXECUTE_DRIFT_CHECK_ROLLOUT_REPORT.md`
- the next live advisory consolidation rollout in that same target is
  documented in
  `docs/memory-system/REAL_ENV_CONSOLIDATION_PLAN_SCHEDULER_ROLLOUT_REPORT.md`
- the next live execute-class consolidation rollout in that same target is
  documented in
  `docs/memory-system/REAL_ENV_CONSOLIDATION_EXECUTE_SCHEDULER_ROLLOUT_REPORT.md`
- the next post-maintenance automation decision is documented in
  `docs/memory-system/AUTOMATION_READINESS_REVIEW.md`
- the current operator runbook for that posture is documented in
  `docs/memory-system/OPERATIONAL_RUNBOOK.md`
- the shared-environment reconciliation result for that posture is documented
  in `docs/memory-system/SHARED_ENV_REHEARSAL_REPORT.md`

## Required database prerequisites

Before any shared-environment rollout:

1. Confirm Postgres version compatibility with the disposable validation lane.
2. Confirm extension availability for:
   - `pgcrypto`
   - `pg_trgm`
   - `vector`
3. Confirm the runtime can create or use the dedicated
   `memory_middleware` schema.
4. Confirm service-role style credentials can set:
   - `memory_middleware.service_role`
   - `memory_middleware.principal_external_key` when needed for controlled
     internal-reader tests
5. Confirm DB backup and restore posture before the first migration run.

## Production rollout result

The first production rollout is no longer blocked.

It was applied on:

- Compose project `openclaw-upgrade-2026324`
- service `openclaw-gateway`
- container `openclaw-upgrade-2026324-openclaw-gateway-1`

using only:

1. `~/.openclaw/.env` DB URL parity
2. `~/.openclaw/openclaw.json` runner-owner parity
3. a targeted restart of `openclaw-gateway`
4. the documented validation sequence

The exact production result is documented in:

- `docs/memory-system/PRODUCTION_ROLLOUT_REPORT.md`
- `docs/memory-system/PRODUCTION_SURFACE_INVENTORY_AND_DIFF.md`

## Required runtime configuration

The first real-environment rollout should document and supply:

- plugin enablement for `memory-middleware` as a regular bundled plugin
- reachable Postgres connection settings for the middleware DB layer
- candidate-ingress mode set deliberately, not implicitly
- any service-role env vars or secret references needed by the DB client
- explicit operator guidance for which tools remain manual-only

Minimum configuration posture:

- database connectivity configured
- migrations applied explicitly by operators, not by runtime startup
- bounded middleware tools available only after migration success is verified
- scheduler tools callable, but no autonomous scheduler loop enabled by default

Current live automation posture:

- `backgroundJobs.inspectionMode = enabled`
- `backgroundJobs.advisorySchedulingMode = enabled`
- `backgroundJobs.advisoryJobClasses = [proactive_plan, consolidation_plan]`
- `backgroundJobs.executeSchedulingMode = enabled`
- `backgroundJobs.executeJobClasses = [proactive_execute_run_drift_check, consolidation_execute]`
- `backgroundJobs.runnerOwnerId = production-runner-1`
- scheduled `consolidation_execute` limited to:
  - `duplicate_merge_review`
  - `stale_superseded_review`

Current post-rollout soak result:

- the first production soak review remained stable
- no rollback or disablement was needed
- no feature-boundary expansion is recommended after that soak review
- contradiction and drift consolidation actions disabled
- direct proactive execution disabled

First passive rollout posture:

- `candidateIngress.mode = disabled`
- `memoryObjectQuery.mode = read-only`

## Shared-target provisioning status

The first shared non-production target now exists and keeps the approved
middleware posture unchanged.

Provisioned shared runtime:

1. Dockerized OpenClaw gateway on the shared server
   - container: `openclaw-upgrade-2026324-openclaw-gateway-1`
   - image: `openclaw:local`
   - ports: `28789` and `28790`

Provisioned shared Postgres target:

1. existing Supabase project `wvfcvuwsnhupalpxfttc`
2. database `postgres`
3. schema `memory_middleware`
4. required extensions confirmed:
   - `pgcrypto`
   - `pg_trgm`
   - `vector`

Shared secret placement:

- `MEMORY_MIDDLEWARE_DATABASE_URL` is placed in `~/.openclaw/.env`

Current operational ownership:

- one named shared scheduler runner owner:
  - `backgroundJobs.runnerOwnerId = shared-nonprod-runner-1`
- disablement and backup ownership still need explicit human assignment in the
  runbook

The first shared rehearsal should keep the posture unchanged:

- `candidateIngress.mode = submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install`
- `memoryObjectQuery.mode = read-only`
- `backgroundJobs.inspectionMode = enabled`
- `backgroundJobs.advisorySchedulingMode = enabled`
- `backgroundJobs.advisoryJobClasses = [proactive_plan, consolidation_plan]`
- `backgroundJobs.executeSchedulingMode = enabled`
- `backgroundJobs.executeJobClasses = [proactive_execute_run_drift_check, consolidation_execute]`
- `backgroundJobs.runnerOwnerId = shared-nonprod-runner-1`

Shared-target deviation:

- the runtime secret is placed in `~/.openclaw/.env` as
  `MEMORY_MIDDLEWARE_DATABASE_URL`
- the current middleware checkpoint still requires
  `plugins.entries.memory-middleware.config.database.url` to be a literal
  string, so the non-production runtime currently carries the same DB URL in
  `~/.openclaw/openclaw.json`
- the shared Supabase pooler target currently requires
  `uselibpqcompat=true&sslmode=require` in that DB URL for the present Node
  `pg` connection path

The first shared-environment rehearsal has now passed for the unchanged
approved posture.

What passed:

- passive startup remained write-free
- read-only retrieval remained healthy
- bounded governance flows remained healthy
- advisory scheduling remained healthy for:
  - `proactive_plan`
  - `consolidation_plan`
- execute-class scheduling remained healthy for:
  - `proactive_execute_run_drift_check`
  - bounded safe `consolidation_execute`
- runner ownership enforcement remained healthy
- rollback or disablement steps from the runbook worked in the shared target

Shared-only operational differences now documented:

- shared rehearsal used the repo-native runtime against the shared DB plus
  gateway health checks
- bearer-auth HTTP `/tools/invoke` is not the current operator path for this
  shared target
- optional project, session, and agent references must be omitted unless they
  map to real shared-environment rows
- `memory_procedure_validate_plan` remains disabled even while
  `memory_procedure_validate` is enabled

The next operational step is shared-target soak or controlled observation with
the same allowlists unchanged, not more provisioning.

The concrete provisioning and ownership plan for that step now lives in:

- `docs/memory-system/SHARED_NONPROD_PROVISIONING_PLAN.md`

## Migration sequencing

Apply migrations in this order only:

1. `extensions/memory-middleware/db/migrations/20260401_000001_memory_middleware_schema_v1.sql`
2. `extensions/memory-middleware/db/migrations/20260401_000002_memory_middleware_security_retrieval.sql`

Recommended sequence:

1. Rehearse both migrations in disposable local Postgres against a fresh
   database.
2. Rehearse both migrations in staging against a fresh or reset staging
   database.
3. Validate required extensions, schema creation, indexes, RLS helpers, and
   curated views in staging.
4. Take or confirm backup coverage for the target shared environment.
5. Apply migration 1 in the target environment.
6. Run bounded schema smoke checks.
7. Apply migration 2 in the target environment.
8. Run bounded security and retrieval smoke checks.
9. Enable the plugin runtime only after both migrations succeed and smoke
   checks pass.

Actual first real rollout outcome:

- this sequence has now been executed successfully in the persistent local
  non-production Docker target

This slice does not define down-migrations.

Rollback for early adoption should prefer:

- disabling the middleware runtime
- stopping use of the new schema
- restoring from DB backup if the migration itself must be reversed

Current rehearsal note:

- operational disablement and disposable-environment teardown have now been
  rehearsed
- the shared target is now wired
- the next rehearsal should reuse the exact same posture with no automation
  expansion
- shared-environment backup and restore still require a later managed staging
  or preproduction exercise

Current real-rollout note:

- config-level disablement for retrieval and write surfaces has now been
  exercised in the persistent local non-production target
- container stop or start recovery has also been exercised there

## Rollout phases

Production-readiness review checkpoint:

- before any Phase E style live automation enablement, operators should first
  complete the readiness review in
  `docs/memory-system/PRODUCTION_READINESS_REVIEW.md`
- until that review's missing safeguards are addressed, scheduler and
  proactive surfaces should remain disabled in real environments
- the safeguarded live non-production posture has now advanced through:
  - advisory scheduling for `proactive_plan`
  - advisory scheduling for `consolidation_plan`
  - execute-class scheduling for `proactive_execute_run_drift_check` only
  - execute-class scheduling for bounded safe `consolidation_execute`
  - single-runner ownership with config-level disablement still available
- the current recommendation after that maintenance rollout is to keep the
  live automation boundary unchanged until further soak or shared-environment
  rehearsal is complete

### Phase A. Database readiness

Goal:

- prove the target environment can host the middleware schema safely

Actions:

- validate Postgres extensions
- apply both existing migrations in staging
- verify `memory_middleware` schema objects exist as expected
- verify curated views and helper functions resolve

Exit criteria:

- both migrations apply cleanly
- bounded retrieval queries can connect successfully
- no plugin runtime traffic is pointed at the environment yet

### Phase B. Passive runtime connectivity

Goal:

- prove runtime wiring without enabling broad usage

Actions:

- configure the middleware plugin with reachable DB credentials
- keep the plugin non-exclusive
- keep background-job invocation manual-only
- verify health through read-path or no-op style bounded calls

Safe early checks:

- candidate-only disabled or not-configured behavior becomes configured
- bounded read surfaces connect successfully
- no automatic writes occur at startup

Current first real rollout note:

- passive connectivity now supports a separate read-only retrieval mode so
  memory-object retrieval can stay enabled while write paths remain disabled

Exit criteria:

- startup does not claim the memory slot
- startup does not perform background work automatically
- runtime logs show healthy DB connectivity

### Phase C. First bounded write enablement

Goal:

- enable the lowest-risk internal writes first

Safe first features to enable:

- candidate submission
- candidate review only after bounded submission is already stable
- bounded candidate promotion planning plus memory promotion only after submit
  and review are already stable

Still keep disabled or manual-only:

- candidate review and promotion flows
- procedure validation
- skill-candidate governance
- proactive execution loops
- background-job runners
- procurement, approval, install, and external actions
- any self-improving-agent activity beyond the already-bounded candidate seam

Current first bounded write outcome:

- `candidateIngress.mode = submit-only` has now been validated successfully in
  the persistent local non-production target
- `memoryObjectQuery.mode = read-only` remained enabled before and after the
  bounded candidate write
- broader write, scheduler, proactive, and self-improving surfaces remained
  disabled

Current second bounded write outcome:

- `candidateIngress.mode = submit-review-only` has now been validated
  successfully in the persistent local non-production target
- `memoryObjectQuery.mode = read-only` remained enabled before and after the
  bounded submit plus review flow
- broader promotion, procedure, governance, scheduler, proactive, and
  self-improving surfaces remained disabled

Current third bounded write outcome:

- `candidateIngress.mode = submit-review-promote-memory` has now been
  validated successfully in the persistent local non-production target
- `memoryObjectQuery.mode = read-only` remained enabled before and after the
  bounded submit, review, and memory-promotion flow
- procedure promotion, procedure validation, governance, scheduler,
  proactive, and self-improving surfaces remained disabled

Current fourth bounded write outcome:

- `candidateIngress.mode = submit-review-promote-memory-procedure` has now
  been validated successfully in the persistent local non-production target
- `memoryObjectQuery.mode = read-only` remained enabled before and after the
  bounded submit, review, memory-promotion, and procedure-promotion flow
- procedure validation, skill-candidate governance, scheduler, proactive,
  and self-improving surfaces remained disabled

Current fifth bounded write outcome:

- `candidateIngress.mode = submit-review-promote-memory-procedure-validate`
  has now been validated successfully in the persistent local non-production
  target
- `memoryObjectQuery.mode = read-only` remained enabled before and after the
  bounded submit, review, memory-promotion, procedure-promotion, and
  procedure-validation flow
- procedure validation planning, skill-candidate governance, scheduler,
  proactive, and self-improving surfaces remained disabled

Current sixth bounded write outcome:

- `candidateIngress.mode = submit-review-promote-memory-procedure-validate-skill`
  has now been validated successfully in the persistent local non-production
  target
- `memoryObjectQuery.mode = read-only` remained enabled before and after the
  bounded submit, review, memory-promotion, procedure-promotion,
  procedure-validation, and skill-candidate flow
- procurement, vetting, approval, install, scheduler, proactive, and
  self-improving surfaces remained disabled

Current seventh bounded write outcome:

- `candidateIngress.mode = submit-review-promote-memory-procedure-validate-skill-procurement`
  has now been validated successfully in the persistent local non-production
  target
- `memoryObjectQuery.mode = read-only` remained enabled before and after the
  bounded submit, review, memory-promotion, procedure-promotion,
  procedure-validation, skill-candidate, and procurement flow
- procurement planning remained advisory-only
- one internal procurement record was persisted without invoking Skill
  Vetter, recording vetting results, mutating approval state, or preparing
  install state
- vetting, approval, install, scheduler, proactive, and self-improving
  surfaces remained disabled

Current eighth bounded write outcome:

- `candidateIngress.mode = submit-review-promote-memory-procedure-validate-skill-procurement-vetting`
  has now been validated successfully in the persistent local non-production
  target
- `memoryObjectQuery.mode = read-only` remained enabled before and after the
  bounded submit, review, memory-promotion, procedure-promotion,
  procedure-validation, skill-candidate, procurement, and vetting flow
- manual Skill Vetter handoff remained advisory-only
- one internal manual vetting-result record was persisted without invoking
  Skill Vetter automatically, mutating approval state, or preparing install
  state
- approval, install, scheduler, proactive, and self-improving surfaces
  remained disabled

Current tenth bounded write outcome:

- `candidateIngress.mode = submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install`
  has now been validated successfully in the persistent local non-production
  target
- `memoryObjectQuery.mode = read-only` remained enabled before and after the
  bounded submit, review, memory-promotion, procedure-promotion,
  procedure-validation, skill-candidate, procurement, vetting, approval, and
  install-record flow
- manual install handoff remained advisory-only
- one internal install record was persisted without performing actual
  installation or invoking any downstream automation
- actual installation, scheduler, proactive, and self-improving surfaces
  remained disabled

Exit criteria:

- bounded writes succeed in the real environment
- expected rows appear only in the intended table families
- no unexpected writes appear in `background_jobs` or unrelated event families

### Phase D. Advisory planning enablement

Goal:

- enable read-only planning before broader maintenance execution

Safe features to enable next:

- `memory_consolidation_plan`
- `memory_proactive_plan`
- manual inspection of returned findings

Exit criteria:

- planning tools return stable advisory output
- operators can verify rationale and affected ids against stored state
- no write amplification is observed

### Phase E. Bounded maintenance execution

Goal:

- introduce only the already-reviewed low-risk execution paths

Allowed first execution surfaces:

- manual `memory_drift_check_execute`
- manual `memory_consolidation_execute` with explicit safe subsets
- manual `memory_proactive_execute` for `run_drift_check` only
- manual `memory_background_job_enqueue`
- manual `memory_background_job_list`
- manual `memory_background_job_get`
- manual `memory_background_job_run_next`

Allowed scheduled job classes in the first real environment:

- `proactive_plan`
- `proactive_execute_run_drift_check`
- `consolidation_plan`
- `consolidation_execute`

Constraints:

- no autonomous scheduler loop by default
- keep advisory scheduling and execute-class scheduling behind separate config
  gates
- keep execute-class scheduling disabled for the first live scheduler rollout
- no contradiction execution
- no drift-remediation execution
- no procurement, approval, install, messaging, or external actions

Exit criteria:

- repeated runs remain deterministic enough for operator use
- execution stays within already-documented bounded write surfaces
- job rows and execution metadata are auditable

### Phase F. Controlled operational review

Goal:

- decide whether the middleware should remain limited, expand carefully, or
  pause

Review inputs:

- migration reliability
- runtime stability
- query latency and lock behavior
- operator experience
- observed write volume by table family
- auditability of background-job rows

Possible outcomes:

- continue in limited internal production use
- expand one bounded feature family at a time
- pause further rollout and keep the middleware staging-only

## What remains disabled by default

Even after the first real-environment rollout, these remain out of scope or
disabled by default:

- exclusive `memory` slot ownership
- any changes to `memory-core`
- any changes to `memory-lancedb`
- automatic procurement workflows
- automatic approval mutation outside existing bounded manual tools
- automatic skill installation
- automatic Skill Vetter invocation
- contradiction auto-resolution
- drift remediation beyond bounded drift-check artifacts
- external messaging or follow-up actions
- broad autonomous scheduler loops
- raw upstream `self-improving-agent` installation or execution

## Rollback posture

The preferred rollback order is:

1. Stop calling middleware tools that write state.
2. Stop calling `memory_background_job_run_next`.
3. Disable the `memory-middleware` plugin in the target runtime if needed.
4. Preserve the database for inspection unless a restore is required.
5. Restore from backup only when migration-level rollback is necessary.

Rollback should favor operational disablement first because the current schema
is additive and the first adoption goal is safe coexistence, not takeover.

## Observability and validation checkpoints

At minimum, each rollout phase should capture:

- migration start and finish timestamps
- extension availability results for `pgcrypto`, `pg_trgm`, and `vector`
- plugin startup and DB-connectivity logs
- counts for key table families before and after each enablement step:
  - `memory_events`
  - `memory_objects`
  - `memory_reviews`
  - `procedures`
  - `procedure_runs`
  - `skill_candidates`
  - `background_jobs`
  - `agent_state`
- sample tool outcomes for:
  - candidate submission
  - retrieval
  - consolidation planning
  - proactive planning
  - drift-check execution
  - bounded background-job enqueue and run-next
- any lock, timeout, or repeated-claim anomalies in `background_jobs`

Operational checkpoints should explicitly confirm:

- no memory-slot takeover occurred
- no scheduler loop is running implicitly
- unsupported job classes are still blocked
- no procurement, install, or external-action automation is active

## Recommended first production-safe feature order

The recommended enablement order is:

1. DB migrations only
2. passive runtime connectivity
3. read-only retrieval only
4. submit-only candidate ingress
5. submit-review-only candidate ingress
6. submit-review-promote-memory candidate ingress
7. submit-review-promote-memory-procedure candidate ingress
8. submit-review-promote-memory-procedure-validate candidate ingress
9. submit-review-promote-memory-procedure-validate-skill candidate ingress
10. full candidate-only and other bounded write surfaces only if explicitly
    approved later
11. advisory planning surfaces
12. manual bounded drift-check and safe consolidation execution
13. manual bounded background-job enqueue and run-next

This order keeps advisory and manually triggered paths ahead of broader
maintenance use.

## Preconditions for a later execution slice

A later rollout slice may execute this plan only if it defines:

- the exact target environment
- the migration runner or operator procedure
- the concrete config keys and secret sources to use
- the phase-by-phase validation commands
- the rollback owner and backup confirmation

Until then, this document is the canonical adoption plan and not an approval to
apply production changes.
