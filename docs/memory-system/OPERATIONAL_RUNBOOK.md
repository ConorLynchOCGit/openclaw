# Memory Middleware Operational Runbook

## Purpose

This runbook covers the currently enabled production `memory-middleware`
posture on the live VPS Docker Compose runtime, along with the already-proven
shared non-production lane it was rehearsed against.

It is for operators who need to:

- confirm what is enabled or disabled
- inspect current state
- inspect queued or completed background jobs
- inspect recent bounded writes
- verify retrieval health
- verify runner ownership behavior
- disable the current posture quickly
- decide whether the system is stable enough to continue soaking

This runbook does not enable any new automation.

Repo workflow note:

- the default repo-wide slice workflow now lives in
  - [Slice Landing Workflow](/help/slice-workflow)
- use that global workflow for validation, proof order, commit timing, push
  timing, and closeout minimums
- this runbook stays focused on memory-specific runtime surfaces, proof
  targets, and rollback posture

Production operator note:

- this runbook covers the approved posture and rollback order now running in
  production
- the first production rollout target on this VPS is:
  - `openclaw`
- the pre-rollout inventory, backup artifact path, exact rollout diff, and
  rollout result now live in:
  - `docs/memory-system/PRODUCTION_SURFACE_INVENTORY_AND_DIFF.md`
  - `docs/memory-system/PRODUCTION_ROLLOUT_REPORT.md`
- the first production soak review now lives in:
  - `docs/memory-system/PRODUCTION_SOAK_REPORT.md`

The concrete provisioning plan and provisioning report for the shared
non-production target now live in:

- `docs/memory-system/SHARED_NONPROD_PROVISIONING_PLAN.md`
- `docs/memory-system/SHARED_NONPROD_PROVISIONING_REPORT.md`

## Current enabled posture

Current production target:

- live OpenClaw runtime:
  - container `openclaw`
  - image `openclaw:local`
  - ports `28789` and `28790`
- production Postgres target:
  - Supabase project `wvfcvuwsnhupalpxfttc`
  - database `postgres`
  - schema `memory_middleware`

Previously proven shared target:

- shared OpenClaw runtime:
  - container `openclaw`
  - image `openclaw:local`
  - ports `28789` and `28790`
- shared Postgres target:
  - Supabase project `wvfcvuwsnhupalpxfttc`
  - database `postgres`
  - schema `memory_middleware`

Previously proven local target:

- persistent local non-production Docker Postgres
- container `memory-middleware-readonly-rollout-pg`
- database `memory_middleware_rollout`

Current live posture:

- `candidateIngress.mode = submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install`
- `memoryObjectQuery.mode = read-only`
- `backgroundJobs.inspectionMode = enabled`
- `backgroundJobs.advisorySchedulingMode = enabled`
- `backgroundJobs.advisoryJobClasses = [proactive_plan, consolidation_plan]`
- `backgroundJobs.executeSchedulingMode = enabled`
- `backgroundJobs.executeJobClasses = [proactive_execute_run_drift_check, consolidation_execute]`
- `backgroundJobs.runnerOwnerId = production-runner-1`

Current secret placement note:

- `MEMORY_MIDDLEWARE_DATABASE_URL` is placed in `~/.openclaw/.env`
- the current middleware checkpoint still requires a literal
  `plugins.entries.memory-middleware.config.database.url` string in
  `~/.openclaw/openclaw.json`
- for the shared Supabase pooler target, that DB URL currently needs:
  - `uselibpqcompat=true&sslmode=require`
- treat both locations as operator-managed secret surfaces until the plugin
  contract changes explicitly

Enabled maintenance classes:

- advisory:
  - `proactive_plan`
  - `consolidation_plan`
- execute-class:
  - `proactive_execute_run_drift_check`
  - bounded safe `consolidation_execute`

## Current disabled posture

The following remain disabled:

- direct proactive execution outside the scheduler
- consolidation-driven `contradiction_review`
- consolidation-driven `drift_check_review`
- any additional advisory job classes
- any additional execute-class job classes
- procurement or install automation
- automatic Skill Vetter invocation
- self-improving capture
- actual installation
- memory-slot takeover

## Primary inspection surfaces

Production operator note:

- bearer-auth HTTP `/tools/invoke` is not the current operator path for the
  live gateway
- the current bounded production validation path is:
  - gateway health checks
  - direct in-container `memory-middleware` runtime and tool invocation using
    the running container's built `dist` output

Use these middleware tools or runtime seams first:

- `memory_object_list`
- `memory_object_get`
- `memory_candidate_review`
- `memory_candidate_promote_plan`
- `memory_candidate_promote_procedure`
- `memory_procedure_validate`
- `memory_skill_candidate_plan`
- `memory_skill_candidate_create`
- `memory_skill_candidate_procurement_plan`
- `memory_skill_candidate_procurement_record_create`
- `memory_background_job_list`
- `memory_background_job_get`
- `memory_background_job_enqueue`
- `memory_background_job_run_next`

Use SQL inspection second, when you need direct table-level confirmation.

## Retrieval health check

Use:

- `memory_object_list`

Expected result:

- `status = ok`
- approved-memory records are returned
- no requirement to enable writes or scheduling
- omit optional project, session, and agent references unless they correspond
  to real rows in the target environment

If retrieval health is in doubt, confirm the current write posture remains
unchanged before investigating automation state.

## Validated-procedure governance workflow

The first quick-win governance family is now production-proven as a manual
internal operator workflow.

Use:

- `memory_candidate_review`
- `memory_candidate_promote_plan`
- `memory_candidate_promote_procedure`
- `memory_procedure_validate`
- `memory_object_get`
- `memory_object_list`

Expected operator checks:

- accepted reviewed procedure candidates can return:
  - `possibleTargets = [propose_procedure_draft, remain_candidate_only]`
- `memory_candidate_promote_procedure` writes one bounded draft procedure row
- `memory_procedure_validate` writes one bounded `procedure_runs` row and
  transitions the procedure to `validated`
- `memory_object_get` without explicit validated-procedure scope returns:
  - `status = not_found`
- `memory_object_get` or `memory_object_list` with
  `scope = include_validated_procedures` returns:
  - `readSurface = validated_procedure_read_model`
- procedure lineage stays intact through:
  - `promotedFromCandidateId`
  - `promotedFromReviewId`
  - `sourceEventId`
  - `lastValidationRunId`
- downstream governance rows remain unchanged:
  - `skill_candidates`
  - `background_jobs`
  - `agent_state`
  - `tool_results`
  - `compaction_events`

Current approved boundary note:

- `memory_procedure_validate_plan` remains disabled even though
  `memory_procedure_validate` is part of the accepted live posture

## Skill-candidate and procurement governance workflow

The second quick-win governance family is now production-proven as a manual
internal operator workflow.

Use:

- `memory_skill_candidate_plan`
- `memory_skill_candidate_create`
- `memory_skill_candidate_procurement_plan`
- `memory_skill_candidate_procurement_record_create`
- `memory_object_get`
- `memory_object_list`

Expected operator checks:

- an eligible validated procedure can return:
  - `possibleTargets = [propose_skill_candidate, remain_validated_procedure_only]`
- `memory_skill_candidate_create` writes one bounded `skill_candidates` row
  preserving:
  - `createdFromProcedureId`
  - `sourceCandidateId`
  - `promotedFromReviewId`
  - `sourceEventId`
  - `validationRunId`
- an eligible skill candidate can return:
  - `possibleTargets = [propose_procurement_handoff, remain_internal_skill_candidate_only]`
- `memory_skill_candidate_procurement_record_create` writes one bounded
  internal `memory_events` row with:
  - `event_name = skill_candidate.procurement_record`
  - `event_kind = review`
- `memory_object_get` without explicit candidate or validated-procedure scope
  returns:
  - `status = not_found` for `skillCandidateId`
  - `status = not_found` for `procurementRecordId`
- `memory_object_list(scope = approved_only)` does not expose skill-candidate
  or procurement-record rows
- downstream lifecycle counts remain unchanged:
  - `skill_candidate.vetting_result`
  - `skill_candidate.approval`
  - `skill_candidate.install_record`
  - `background_jobs`

Current approved boundary note:

- the following surfaces remain outside the accepted production-proven
  quick-win family and should not be treated as normal operator workflow yet:
  - `memory_skill_candidate_skill_vetter_handoff`
  - `memory_skill_candidate_vetting_result_record`
  - `memory_skill_candidate_approval_plan`
  - `memory_skill_candidate_approve`
  - `memory_skill_candidate_install_handoff`
  - `memory_skill_candidate_install_record_create`

## Response-style semantic UX workflow

The first user-facing semantic memory slice is now live for the bounded
response-style family only.

Supported subjects:

- plain English / avoid jargon
- bullet points
- concise replies
- numbered steps when giving instructions
- no tables unless asked

Current live behavior:

- bounded natural-language response-style detection is allowed for this family
- high-confidence low-risk turns can still land as approved memory through the
  existing bounded posture
- medium-confidence turns can enter a pending-confirmation lifecycle instead of
  a dead manual-review queue
- later confirming evidence can auto-promote those pending candidates without
  manual review
- approved-only memory remains the behavior-application source
- targetable conversational forget is allowed for supported response-style
  subjects
- weak ambiguous turns should be ignored instead of creating memory trash

Relevant surfaces:

- transcript ordinary-turn path:
  - `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts`
- tool path:
  - `memory_candidate_submit`
- retrieval / application:
  - `memory_object_list`
  - `memory_object_get`
  - approved-memory hybrid search and prompt shaping

Expected operator checks:

- supported natural phrasing can create bounded response-style candidates or
  approved rows without introducing freeform semantic memory
- a medium-confidence candidate can later show:
  - bounded pending-confirmation metadata
  - a later approved row with:
    - `promotionProfile = response_style_confirmation_v1`
    - `confirmationState = confirmed`
- approved response-style retrieval continues to rank the most relevant
  overlapping approved template cleanly
- a targetable forget turn can:
  - reject a pending candidate
  - supersede an approved supported response-style row
- `memory_object_list(scope = approved_only)` remains the only behavior
  application source
- weak ambiguous nearby text should not create additional durable writes

Current approved boundary note:

- no phrase induction behavior is live
- no broader semantic learning-event families are live
- no UI memory browser or inspection surface exists
- candidates should not shape user-visible behavior before approval in this
  slice

For the exact proof ids and production evidence for this slice, use:

- `docs/memory-system/PRODUCTION_RESPONSE_STYLE_UX_REPORT.md`

## Project-memory semantic UX workflow

The second user-facing semantic memory slice is now live for a bounded
explicit named-project fact family only.

Supported first-slice fields:

- default branch
- staging branch
- primary package manager
- primary environment name

Current live behavior:

- bounded natural-language project-fact detection is allowed only for explicit
  named-project turns in the supported field set
- medium-confidence project-fact turns can enter a pending-confirmation
  lifecycle instead of a dead manual-review queue
- later confirming evidence can auto-promote those pending candidates without
  manual review
- supported project-fact corrections can supersede stale approved rows
- approved-only hybrid retrieval can rank the right field-specific project
  fact first for direct project questions
- weak ambiguous turns should be ignored instead of creating memory trash

Relevant surfaces:

- transcript ordinary-turn path:
  - `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts`
- tool path:
  - `memory_candidate_submit`
- retrieval:
  - `memory_object_search_hybrid`
  - `memory_object_list`
  - `memory_object_get`

Expected operator checks:

- supported named-project phrasing can create bounded project-fact candidates
  or approved rows without introducing freeform project memory
- a medium-confidence project-fact candidate can later show:
  - bounded pending-confirmation metadata
  - a later approved row with:
    - `promotionProfile = project_fact_confirmation_v1`
    - `confirmationState = confirmed`
- a supported project-fact correction can produce an approved row with:
  - `promotionProfile = project_fact_correction_v1`
- approved hybrid retrieval can rank the right field-specific project fact
  first for direct project questions
- weak ambiguous nearby text should not create additional durable writes
- approved-only retrieval remains the only user-visible read source for this
  slice

Current approved boundary note:

- this slice is limited to explicit named-project facts only
- repository URL and deployment URL memory are not live yet
- speculative project inference is not live
- candidates should not shape user-visible behavior before approval in this
  slice

For the exact proof ids and production evidence for this slice, use:

- `docs/memory-system/PRODUCTION_PROJECT_MEMORY_UX_REPORT.md`

## Recurring-procedure semantic UX workflow

The third user-facing semantic memory slice is now live for a bounded
named-checklist family only.

Supported first-slice recurring procedures:

- deploy checklist
- release checklist
- triage checklist
- investigation checklist

Current live behavior:

- bounded natural-language recurring-procedure detection is allowed only for
  supported named checklist subjects with structured steps
- medium-confidence recurring-procedure turns can enter a
  pending-confirmation lifecycle instead of a dead manual-review queue
- later confirming evidence can auto-promote those pending candidates without
  manual review
- supported recurring-procedure corrections can supersede stale validated
  procedures for the same subject
- clear checklist asks can use validated-procedure retrieval and
  procedure-key-aware ranking
- nearby deploy/release/triage/investigation asks can also use
  validated-procedure retrieval through bounded procedure-key inference
- prompt guidance keeps those nearby asks suggestion-first unless the user is
  clearly asking for the stored checklist directly
- weak ambiguous turns should be ignored instead of creating memory trash

Relevant surfaces:

- transcript ordinary-turn path:
  - `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts`
- tool path:
  - `memory_candidate_submit`
- lifecycle helpers:
  - `extensions/memory-middleware/src/recurring-procedure-semantic.ts`
  - `extensions/memory-middleware/src/recurring-procedure-lifecycle.ts`
- retrieval:
  - `memory_object_search_hybrid`
  - `memory_object_get`
  - `memory_object_list`

Expected operator checks:

- supported checklist phrasing can create bounded recurring-procedure
  candidates or validated procedures without introducing freeform procedure
  memory
- a medium-confidence recurring-procedure candidate can later show:
  - bounded pending-confirmation metadata
  - a later validated procedure with:
    - `promotionProfile = recurring_procedure_confirmation_v1`
    - `confirmationState = confirmed`
- a supported recurring-procedure correction can produce a validated
  procedure with:
  - `promotionProfile = recurring_procedure_correction_v1`
- clear checklist asks can retrieve the right validated procedure first
- nearby deploy/release/triage/investigation asks can retrieve the right
  validated procedure first even without explicit `checklist` wording
- prompt guidance for nearby advice asks should surface the stored checklist as
  a relevant option rather than silently forcing it
- weak ambiguous nearby text should not create additional durable writes
- scoped validated-procedure retrieval remains the only user-visible read
  source for this slice

Current approved boundary note:

- this slice is limited to supported named checklists only
- vague one-off instructions are not live
- broader procedure extraction is not live
- silent background application of stored procedures is not live
- candidates should not shape user-visible behavior before approval in this
  slice

For the exact proof ids and production evidence for this slice, use:

- `docs/memory-system/PRODUCTION_RECURRING_PROCEDURE_UX_REPORT.md`
- `docs/memory-system/PRODUCTION_RECURRING_PROCEDURE_BEHAVIOR_REPORT.md`

## Semantic retrieval routing workflow

The next retrieval-focused slice is now live for a single bounded family:

- nearby recurring-procedure asks

Current live behavior:

- `memory_object_search_hybrid` remains the normal default retrieval path
- clear checklist asks still rely on hybrid typed ranking
- nearby recurring-procedure asks may use semantic fallback only when:
  - `scope = include_validated_procedures`
  - `kind = procedure`
  - hybrid does not already have a strong validated-procedure match such as
    `procedure_key_match`, `title_exact`, or `title_prefix`
- semantic fallback can only surface validated procedures
- `approved_only` scope still hides validated procedures even when semantic
  retrieval could conceptually match them
- approved environment-constraint guidance may use semantic fallback only
  when:
  - `scope = approved_only`
  - `kind = project`
  - hybrid does not already have a strong typed environment-constraint match
    such as `auto_capture_lesson_match`, `title_exact`, `content_exact`,
    `title_prefix`, or `content_prefix`
  - only approved supported environment constraints are eligible
- approved workflow-improvement tool-gotcha guidance may use semantic
  fallback only when:
  - `scope = approved_only`
  - `kind = project`
  - hybrid does not already have a strong typed project match such as
    `auto_capture_field_match`, `auto_capture_lesson_match`, `title_exact`,
    `content_exact`, `title_prefix`, or `content_prefix`
  - only approved supported tool-gotcha lesson keys are eligible:
    - `vitest_wrapper_required`
    - `scripts_committer_required`
- approved API workaround guidance may use semantic fallback only when:
  - `scope = approved_only`
  - `kind = project`
  - hybrid does not already have a strong typed project match such as
    `auto_capture_field_match`, `auto_capture_lesson_match`, `title_exact`,
    `content_exact`, `title_prefix`, or `content_prefix`
  - only approved supported API workaround lesson keys are eligible:
    - `openai_embeddings_api_key_required`
    - `anthropic_context1m_eligible_credential_required`
- matched-field observability should show:
  - `semantic_embedding`
  - `semantic_fallback`
    when semantic routing actually wins

Embedding posture for this slice:

- validated procedure source memory objects can receive semantic embeddings
- approved environment-constraint source memory objects can also receive
  semantic embeddings
- approved workflow-improvement tool-gotcha source memory objects can also
  receive semantic embeddings
- approved API workaround source memory objects can also receive semantic
  embeddings for the supported lesson keys
- embeddings are written only for those bounded families
- current live proof used:
  - `provider = openai`
  - `model = text-embedding-3-small`
  - OpenRouter-compatible remote base URL
- if the configured `memorySearch` provider is unavailable, retrieval should
  fall back to normal hybrid behavior instead of broadening scope or surfacing
  candidates

Relevant surfaces:

- `extensions/memory-middleware/src/tools/memory-object-search-hybrid.ts`
- `extensions/memory-middleware/src/semantic-retrieval-routing.ts`
- `extensions/memory-middleware/src/tools/procedure-validate.ts`
- `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts`
- `extensions/memory-middleware/src/db/queries.ts`

Expected operator checks:

- a nearby conceptual recurring-procedure ask that hybrid alone misses can
  retrieve the right validated procedure through semantic fallback
- a clear checklist ask still keeps the hybrid exact result on top
- `approved_only` scope still returns no validated procedure for the same
  nearby conceptual ask
- candidate semantic retrieval remains disabled
- health stays green before and after the proof

Current approved boundary note:

- nearby recurring-procedure asks use live semantic routing in this slice
- approved environment-constraint guidance also uses live semantic routing in
  this slice
- approved workflow-improvement tool gotchas now also use live semantic
  routing in this slice for:
  - `vitest_wrapper_required`
  - `scripts_committer_required`
- approved API workaround guidance now also uses live semantic routing in this
  slice for:
  - `openai_embeddings_api_key_required`
  - `anthropic_context1m_eligible_credential_required`
- `git_stash_unsafe` remains hybrid-only
- response-style and explicit named project facts remain hybrid-first
- this slice does not introduce generic semantic search across memory
  families

For the exact proof ids and production evidence for this slice, use:

- `docs/memory-system/PRODUCTION_SEMANTIC_RETRIEVAL_ROUTING_V4_REPORT.md`

## Workflow-improvement UX workflow

The fifth through seventh user-facing semantic workflow-memory slices are now
live for bounded tool-gotcha, environment-constraint, and API workaround
families only.

Supported first-slice workflow lessons:

- use `pnpm test -- <path-or-filter>` instead of raw Vitest
- use `scripts/committer "<msg>" <file...>` instead of manual
  `git add` + `git commit`
- avoid `git stash` in this multi-agent repo
- Python command unavailable on this host or environment
- gateway `POST /tools/invoke` forbidden in this environment
- OpenAI embeddings require a configured `OPENAI_API_KEY` or another
  embeddings provider; `openai-codex` OAuth profiles do not satisfy
  OpenClaw's embeddings path directly
- Anthropic `Extra usage is required for long context requests` means the
  credential is not eligible for `context1m`; use an eligible billed API key
  or keep a fallback model configured

Current live behavior:

- bounded natural-language workflow-improvement detection is allowed only for
  the supported repeated tool-gotcha, environment-constraint, and API
  workaround subjects
- first-seen supported workflow lessons enter a pending-confirmation
  lifecycle instead of immediate approval or a dead manual-review queue
- later confirming evidence can auto-promote those pending candidates without
  manual review
- approved workflow lessons can later surface through approved-only retrieval
  as bounded guidance for repo-operating or provider-troubleshooting asks
- prompt guidance keeps this family guidance-only:
  - no action-taking
  - no silent plan mutation
  - no autonomous remediation
- weak ambiguous complaints should be ignored instead of creating memory
  trash on the transcript assist seam

Relevant surfaces:

- transcript ordinary-turn path:
  - `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts`
- tool path:
  - `memory_candidate_submit`
- lifecycle helpers:
  - `extensions/memory-middleware/src/workflow-improvement-semantic.ts`
  - `extensions/memory-middleware/src/workflow-improvement-lifecycle.ts`
- retrieval:
  - `memory_object_search_hybrid`
  - `memory_object_list`
  - `memory_object_get`

Expected operator checks:

- supported repeated tool-gotcha phrasing can create bounded improvement
  candidates without introducing freeform workflow memory
- supported repeated environment-constraint phrasing can create bounded
  improvement candidates without introducing freeform workflow memory
- supported repeated API workaround phrasing can create bounded improvement
  candidates without introducing freeform workflow memory
- a supported workflow-improvement candidate can later show:
  - bounded pending-confirmation metadata
  - a later approved row with:
    - `promotionProfile = workflow_improvement_confirmation_v1`
    - `confirmationState = confirmed`
- later repo-operating or provider-troubleshooting asks can retrieve the right
  approved workflow lesson first through:
  - `auto_capture_lesson_match`
- repeated confirming evidence should not create duplicate durable writes
- weak ambiguous nearby environment text should not create additional durable
  writes on the transcript assist seam
- approved-only retrieval remains the only user-visible read source for this
  slice

Current approved boundary note:

- this slice is limited to the supported repeated tool-gotcha and
  environment-constraint families plus the first supported API workaround
  family only
- broader workflow-improvement memory is not live yet
- broader API workaround memory is not live yet
- repair or forgetting is not live yet for this family
- candidates should not shape user-visible behavior before approval in this
  slice
- direct manual `memory_candidate_submit` remains a broader explicit
  `improvement` ingress, so ambiguity-ignore checks for this family should use
  the transcript assist seam rather than generic manual note submission

For the exact proof ids and production evidence for this slice, use:

- `docs/memory-system/PRODUCTION_WORKFLOW_IMPROVEMENT_UX_REPORT.md`
- `docs/memory-system/PRODUCTION_ENVIRONMENT_CONSTRAINT_UX_REPORT.md`
- `docs/memory-system/PRODUCTION_API_WORKAROUND_UX_REPORT.md`

## Background-job inspection

### List current jobs

Use:

- `memory_background_job_list`

Expected operator checks:

- queued jobs belong only to:
  - `proactive_plan`
  - `consolidation_plan`
  - `proactive_execute_run_drift_check`
  - `consolidation_execute`
- unexpected job classes do not appear
- `status` is one of:
  - `queued`
  - `running`
  - `succeeded`
  - `failed`
- `attempts` stays bounded

### Inspect one job

Use:

- `memory_background_job_get`

Expected operator checks:

- `jobClass` matches an allowlisted class
- `execution_metadata.runnerId` matches `production-runner-1` for
  executed jobs
- advisory jobs show planner-only outputs
- execute-class jobs show bounded execution metadata only

### Inspect by SQL when needed

Example query:

```sql
select
  id,
  status,
  payload ->> 'jobClass' as job_class,
  attempts,
  created_at,
  started_at,
  completed_at
from memory_middleware.background_jobs
where job_kind = 'maintenance'
order by created_at desc
limit 25;
```

Execution metadata query:

```sql
select
  id,
  payload ->> 'jobClass' as job_class,
  status,
  execution_metadata
from memory_middleware.background_jobs
where job_kind = 'maintenance'
order by created_at desc
limit 10;
```

## Recent bounded-write inspection

Use SQL to confirm recent writes stayed inside the intended table families.

Table-count snapshot query:

```sql
select 'memory_events' as table_name, count(*) as row_count from memory_middleware.memory_events
union all
select 'memory_objects', count(*) from memory_middleware.memory_objects
union all
select 'memory_reviews', count(*) from memory_middleware.memory_reviews
union all
select 'memory_links', count(*) from memory_middleware.memory_links
union all
select 'procedures', count(*) from memory_middleware.procedures
union all
select 'procedure_runs', count(*) from memory_middleware.procedure_runs
union all
select 'skill_candidates', count(*) from memory_middleware.skill_candidates
union all
select 'background_jobs', count(*) from memory_middleware.background_jobs
union all
select 'agent_state', count(*) from memory_middleware.agent_state
union all
select 'tool_results', count(*) from memory_middleware.tool_results
union all
select 'compaction_events', count(*) from memory_middleware.compaction_events
order by table_name;
```

Recent durable review and lineage writes:

```sql
select
  id,
  action,
  created_at
from memory_middleware.memory_reviews
order by created_at desc
limit 10;
```

```sql
select
  id,
  link_kind,
  created_at
from memory_middleware.memory_links
order by created_at desc
limit 10;
```

Expected current maintenance behavior:

- `proactive_plan` and `consolidation_plan` should not create durable memory
  writes outside `background_jobs`
- `proactive_execute_run_drift_check` should write bounded `memory_events`
  only
- bounded `consolidation_execute` should write only:
  - `memory_reviews`
  - `memory_links`
- `memory_procedure_validate_plan` should still remain disabled in the current
  approved posture

## Runner ownership and lock behavior

Use:

- `memory_background_job_run_next`

Expected checks:

- a wrong `runnerId` returns:
  - `status = disabled`
- the configured `runnerId = production-runner-1` can claim the next
  queued job
- after a successful run, `memory_background_job_get` shows the same
  configured runner id in execution metadata

Lock-safety query:

```sql
select
  payload ->> 'jobClass' as job_class,
  status,
  count(*) as job_count
from memory_middleware.background_jobs
where job_kind = 'maintenance'
group by 1, 2
order by 1, 2;
```

Unexpected condition:

- more than one long-running `running` row for the same low-volume local
  maintenance class without an operator explanation

## Quick disablement steps

Preferred order:

1. stop calling `memory_background_job_run_next`
2. remove the affected job class from the allowlist if only one class must be
   stopped
3. set `backgroundJobs.executeSchedulingMode = disabled` if execute-class
   work must stop immediately
4. set `backgroundJobs.advisorySchedulingMode = disabled` if advisory
   scheduling must also stop
5. keep `memoryObjectQuery.mode = read-only` unchanged unless retrieval itself
   is the problem

Single-class disablement examples:

- remove `consolidation_execute` from
  `backgroundJobs.executeJobClasses`
- narrow `backgroundJobs.advisoryJobClasses` back to
  `[proactive_plan]` if `consolidation_plan` must stop
- set `candidateIngress.mode = submit-review-promote-memory-procedure-validate`
  if skill-candidate and procurement governance must stop immediately while
  preserving validated-procedure governance
- set `candidateIngress.mode = submit-review-promote-memory` if procedure
  promotion and validation must stop immediately

## Rollback posture

Rollback should prefer operational disablement over schema rollback.

Current rollback order:

1. stop manual `run_next` invocation
2. disable execute-class scheduling if execute work is the concern
3. disable advisory scheduling if advisory work is also the concern
4. narrow `candidateIngress.mode = submit-review-promote-memory-procedure-validate`
   if the issue is isolated to skill-candidate planning / creation or
   procurement planning / internal procurement-record creation
5. narrow `candidateIngress.mode = submit-review-promote-memory` if the issue
   is isolated to validated-procedure retrieval / procedure promotion /
   procedure validation
6. disable the plugin only if the issue is broader than maintenance or
   bounded governance
7. preserve the database for inspection
8. restore from backup only if a database-level rollback is required

## Soak checklist

Use this checklist during the current single-runner soak period:

- retrieval remains `ok` through `memory_object_list`
- passive startup remains write-free
- only allowlisted maintenance job classes appear in `background_jobs`
- wrong-runner `run_next` remains blocked
- `production-runner-1` remains the only executing runner
- advisory jobs remain write-free outside `background_jobs`
- drift-check execute writes remain bounded to expected `memory_events`
- bounded `consolidation_execute` writes remain bounded to:
  - `memory_reviews`
  - `memory_links`
- no unexpected changes appear in:
  - `agent_state`
  - `tool_results`
  - `compaction_events`
- no unexpected procurement, approval, install, or external automation occurs

Suggested soak cadence:

- inspect queued and succeeded jobs daily while the posture is active
- snapshot table-family counts before and after any manual maintenance session
- record any failed job plus its `execution_metadata` immediately

Rollback triggers during soak:

- repeated unexplained job failure for one allowlisted class
- unexpected writes outside the bounded table families
- runner ownership mismatch
- any evidence of contradiction or drift consolidation actions attempting to
  execute
- any evidence of procurement, install, or external side effects

## Shared-environment readiness checklist

Before moving this same posture to any shared environment:

- identify the exact shared runtime host or app name
- identify the exact shared Postgres instance or database name
- name the shared runner owner explicitly
- document the operator responsible for disabling one job class or all
  scheduling
- document the database backup owner and restore procedure
- define the canonical inspection query or script for:
  - oldest queued job
  - failed jobs by `jobClass`
  - most recent `execution_metadata` by `jobClass`
- confirm the shared environment can preserve the current allowlists exactly:
  - `advisoryJobClasses = [proactive_plan, consolidation_plan]`
  - `executeJobClasses = [proactive_execute_run_drift_check, consolidation_execute]`
- confirm contradiction and drift consolidation actions remain disabled
- confirm the shared rehearsal will not add new automation classes

Shared-environment stop conditions:

- missing named runner owner
- no quick disablement path
- no inspection path for recent `execution_metadata`
- pressure to broaden job allowlists during the rehearsal

Current reconciliation note:

- this checklist remains preparatory only
- the current repo and host context still do not expose a real shared
  non-production target for replaying the approved posture
- the smallest viable next step is provisioning:
  - one dedicated shared non-production OpenClaw runtime
  - one dedicated shared non-production Postgres database
  - named owners for runner, disablement, and backup or restore
  - env-backed DB secret placement through
    `plugins.entries.memory-middleware.config.database.url`

## Recommended next step

After this hardening slice, the recommended next step is:

- keep the automation boundary as-is and provision or identify one dedicated
  shared rehearsal target that can replay the same allowlists unchanged
