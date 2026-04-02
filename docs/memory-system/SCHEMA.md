# Memory System Schema

## Purpose

This document describes the current Postgres schema design for the OpenClaw memory middleware system.

It is a repository architecture/spec document, not a migration file. The goal is to describe the intended table families, relationships, and design constraints before locking them into migrations and runtime code.

The first executable migration draft now lives at:

- `extensions/memory-middleware/db/migrations/20260401_000001_memory_middleware_schema_v1.sql`

The second executable migration draft now lives at:

- `extensions/memory-middleware/db/migrations/20260401_000002_memory_middleware_security_retrieval.sql`

Concrete real-environment rollout sequencing for those two migrations now
lives at:

- `docs/memory-system/PRODUCTION_ADOPTION_PLAN.md`
- `docs/memory-system/STAGING_REHEARSAL_REPORT.md`
- `docs/memory-system/REAL_ENV_PASSIVE_READONLY_ROLLOUT_REPORT.md`
- `docs/memory-system/REAL_ENV_CANDIDATE_SUBMIT_ROLLOUT_REPORT.md`
- `docs/memory-system/REAL_ENV_CANDIDATE_REVIEW_ROLLOUT_REPORT.md`
- `docs/memory-system/REAL_ENV_CANDIDATE_MEMORY_PROMOTION_ROLLOUT_REPORT.md`
- `docs/memory-system/REAL_ENV_CANDIDATE_PROCEDURE_PROMOTION_ROLLOUT_REPORT.md`
- `docs/memory-system/REAL_ENV_PROCEDURE_VALIDATION_ROLLOUT_REPORT.md`
- `docs/memory-system/REAL_ENV_SKILL_CANDIDATE_ROLLOUT_REPORT.md`
- `docs/memory-system/REAL_ENV_SKILL_CANDIDATE_PROCUREMENT_ROLLOUT_REPORT.md`
- `docs/memory-system/REAL_ENV_SKILL_CANDIDATE_VETTING_ROLLOUT_REPORT.md`
- `docs/memory-system/REAL_ENV_SKILL_CANDIDATE_APPROVAL_ROLLOUT_REPORT.md`

No new migration or schema change was required for the first real bounded
`memory_candidate_submit` rollout. That slice reused the existing schema and
retrieval substrate exactly as already migrated in the target environment.

No new migration or schema change was required for the second real bounded
`memory_candidate_review` rollout either. That slice reused the same schema
and retrieval substrate and added only one `memory_reviews` write on top of
the existing bounded candidate submit path.

No new migration or schema change was required for the third real bounded
memory-promotion rollout either. That slice reused the same schema and
retrieval substrate and added only one approved promoted memory row plus its
existing provenance rows and lineage link on top of the already-bounded
submit-and-review path.

No new migration or schema change was required for the fourth real bounded
procedure-promotion rollout either. That slice reused the same schema and
retrieval substrate and added only one draft `procedures` row plus one
existing bounded `memory_links` procedure-evidence edge on top of the already
bounded submit, review, and memory-promotion path.

No new migration or schema change was required for the fifth real bounded
procedure-validation rollout either. That slice reused the same schema and
retrieval substrate and added only one bounded `procedure_runs` row plus the
existing bounded validated status transition and metadata updates on the
promoted procedure row.

No new migration or schema change was required for the sixth real bounded
skill-candidate rollout either. That slice reused the same schema and
retrieval substrate and added only one bounded `skill_candidates` row with
preserved validated-procedure and candidate lineage metadata.

No new migration or schema change was required for the seventh real bounded
procurement rollout either. That slice reused the same schema and retrieval
substrate and added only one bounded `memory_events` row with
`event_name = skill_candidate.procurement_record`.

No new migration or schema change was required for the eighth real bounded
vetting rollout either. That slice reused the same schema and retrieval
substrate and added only one bounded `memory_events` row with
`event_name = skill_candidate.vetting_result`.

No new migration or schema change was required for the ninth real bounded
approval rollout either. That slice reused the same schema and retrieval
substrate and added only one bounded `memory_events` row with
`event_name = skill_candidate.approval`, plus the existing bounded
`skill_candidates.status` transition to `approved_limited`.

No new migration or schema change was required for the tenth real bounded
install rollout either. That slice reused the same schema and retrieval
substrate and added only one bounded `memory_events` row with
`event_name = skill_candidate.install_record`. It did not create any runtime
installed-skill table, mutate plugin install state, or introduce actual
installation behavior.

## Schema design posture

The schema is split across two major planes:

- context plane
- knowledge plane

This split is intentional.

The context plane exists to keep long-running sessions stable and affordable. It focuses on event flow, tool outputs, session state, and compaction.

The knowledge plane exists to store durable, typed, reviewable knowledge. It focuses on memory objects, policies, procedures, reviews, and promotion into reusable behavior.

## Schema namespace

The schema-v1 draft uses a dedicated Postgres schema namespace:

- `memory_middleware`

This keeps generic table names such as `projects`, `agents`, and `sessions`
isolated from any future repo-wide backend work.

## Review outcome

The schema-v1 draft has been reviewed against the first future candidate-only
tool surface and refined with only minor changes.

Review outcome:

- candidate-originated events now use the generic event kind
  `candidate_submission`
- provenance locator consistency is enforced for `memory_sources`
- target exclusivity is enforced for `memory_links`
- review-queue and candidate-surface indexes were added

Current conclusion:

- schema-v1 is ready for the first candidate-only tool surface
- the first candidate-only tool surface now maps submissions into the
  `memory_events`, `memory_objects`, and `memory_sources` table family plan
  while keeping review state at `candidate`
- that mapping has now been validated against a live disposable Postgres
  instance for the first candidate-only submission path
- the first candidate-only query surface now reads candidate-state rows from
  `memory_objects` joined to `memory_events` while preserving provenance
  through the existing `memory_sources` model
- the first reduced-profile self-improving adaptation now reuses that same
  candidate submission path and stores adaptation provenance only inside
  existing candidate metadata fields
- no schema extension was required for the first reduced-profile
  self-improving adaptation slice
- the first candidate review mutation surface now records review outcomes in
  `memory_reviews`
- in this slice, `accepted` reviews are recorded without promoting
  `memory_objects.review_state` to `approved`
- only `rejected` and `needs_revision` outcomes update
  `memory_objects.review_state`, using existing bounded schema states
  (`rejected` and `corrected`)
- the first manual promotion planning surface now reads:
  - the candidate row from `memory_objects`
  - candidate provenance from `memory_events`
  - the latest review record from `memory_reviews`
- that planning surface is advisory-only and does not create any new rows
- the first bounded memory-promotion write now creates:
  - one approved durable-memory row in `memory_objects`
  - one event provenance row in `memory_sources`
  - one review provenance row in `memory_sources`
  - one `derived_from` provenance edge in `memory_links`
- the original candidate row remains intact in candidate state after promotion,
  and repeated promotion attempts now resolve to the existing approved row
- the first bounded procedure-draft promotion write now creates:
  - one draft row in `procedures`
  - one `procedure_evidence` provenance edge in `memory_links`
- the procedure draft records candidate, source-event, and accepted-review
  provenance in metadata, and repeated promotion attempts now resolve to the
  existing draft row
- the first validated-procedure planning surface now reads:
  - the draft procedure row from `procedures`
  - the source candidate link from `procedures.source_memory_object_id`
  - the latest candidate review from `memory_reviews`
  - accepted-review and source-event provenance preserved in procedure metadata
- that planning surface is advisory-only and does not create validated
  procedures, procedure runs, or skill candidates
- the first bounded validated-procedure write now creates:
  - one `passed` row in `procedure_runs`
  - one `validated` status transition on `procedures`
- the validated procedure records bounded validation metadata on the procedure
  row, the validation run records rationale and candidate or review provenance
  in `evidence`, and repeated validation attempts now resolve to the existing
  validated procedure
- the first skill-candidate planning surface now reads:
  - the validated procedure row from `procedures`
  - preserved candidate lineage from bounded procedure metadata
  - the latest validation evidence from `procedure_runs`
- that planning surface is advisory-only and does not create `skill_candidates`
- the first bounded skill-candidate write now creates:
  - one `candidate` row in `skill_candidates`
- the skill-candidate row preserves procedure, candidate, accepted-review,
  source-event, and validation-run lineage in metadata, and repeated creation
  attempts now resolve to the existing row
- the first procurement-handoff planning surface now reads:
  - the bounded `skill_candidates` row
  - the linked source procedure
  - preserved lineage fields in skill-candidate metadata
  - the latest validation evidence from `procedure_runs`
- that planning surface is advisory-only and does not invoke Skill Vetter,
  mutate procurement state, or install skills
- the first procurement-record write now creates:
  - one internal row in `memory_events`
  - `event_name = skill_candidate.procurement_record`
- that record stores the full structured handoff payload in `payload` and
  bounded lineage plus recorder metadata in `metadata`, and repeated creation
  attempts now resolve to the existing record
- the first manual Skill Vetter handoff surface now reads:
  - the bounded `skill_candidates` row
  - the linked source procedure
  - the latest validation evidence from `procedure_runs`
  - the latest `skill_candidate.procurement_record` event from `memory_events`
- that planning surface is advisory-only and does not invoke Skill Vetter,
  mutate approval state, or install skills
- the first manual vetting-result write now creates:
  - one internal row in `memory_events`
  - `event_name = skill_candidate.vetting_result`
- that record stores the procurement record id, preserved handoff package,
  manual decision, and structured vetting result fields in `payload`, plus
  bounded lineage and reviewer metadata in `metadata`, and repeated creation
  attempts now resolve to the existing record
- the first approval and install planning surface now reads:
  - the bounded `skill_candidates` row
  - the linked source procedure
  - the latest validation evidence from `procedure_runs`
  - the latest `skill_candidate.procurement_record` event from `memory_events`
  - the latest `skill_candidate.vetting_result` event from `memory_events`
- that planning surface is advisory-only and does not mutate approval state or
  install skills
- the first approval-state write now creates:
  - one internal row in `memory_events`
  - `event_name = skill_candidate.approval`
- that write also updates `skill_candidates.status` to either
  `approved_limited` or `approved_normal` and stores bounded approval linkage
  and install guardrails in skill-candidate metadata
- the first manual install handoff surface now reads:
  - the approved `skill_candidates` row
  - the latest `skill_candidate.approval` event from `memory_events`
  - the latest `skill_candidate.procurement_record` event from `memory_events`
  - the latest `skill_candidate.vetting_result` event from `memory_events`
  - the linked source procedure plus the latest validation evidence from
    `procedure_runs`
- that planning surface is advisory-only and does not install skills or
  mutate installed-skill state
- the first bounded live retrieval surface now reads:
  - approved `memory_objects` by default
  - candidate `memory_objects` only when an explicit retrieval scope requests
    them
  - validated `procedures` only when an explicit retrieval scope requests them
  - bounded text fields for exact get, bounded list, and basic text search
- that retrieval surface is read-only and does not execute hybrid semantic
  retrieval, install actions, or runtime memory takeover
- the first ranked retrieval upgrade now reads the same bounded objects but
  adds score-based ordering using exact, prefix, and substring-style matching
  with title-aware weighting for validated procedures
- the live retrieval layer now adopts the validated retrieval substrate where
  appropriate:
  - approved-only get and list read through
    `internal_approved_memory_v`
  - basic search uses generated `search_document` columns for approved memory
    objects and validated procedures, with bounded text fallback
  - ranked search uses bounded FTS plus trigram-style scoring over approved
    memory objects and explicitly requested validated procedures
- the bounded live retrieval layer now also formalizes its read surfaces:
  - approved memory records are returned from `approved_memory_view`
  - explicit candidate records are returned from
    `reviewable_candidates_view`
  - validated procedures are returned from
    `validated_procedure_read_model`
- that ranked retrieval surface remains read-only and still does not use
  vector similarity
- the second migration draft now adds security and retrieval substrate for:
  - principal and membership helpers
  - RLS helper functions and first policy draft
  - curated internal views
  - FTS and trigram search columns and indexes
  - the `memory_embeddings` side table
- that second migration remains drafted only and unexecuted in this slice
- the first bounded session-memory surface now reads and writes:
  - one `agent_state` row with `state_key = session_memory`
- missing session-memory state now returns an explicit empty structured
  template instead of a not-found failure
- repeated session-memory updates now preserve omitted fields while replacing
  provided fields with deterministic trimming, deduping, and bounded caps
- the first bounded compaction planner now reads:
  - persisted `tool_results` through the existing microcompaction planner
  - bounded session-memory state from `agent_state`
- the compaction planner is advisory-only and does not write
  `compaction_events`, mutate `tool_results`, or change session-memory state
- the first bounded microcompaction executor now writes:
  - updates eligible `tool_results` rows from `persisted` to `compacted`
  - clears `preview_text` for those rows while leaving full payloads intact
  - one bounded `compaction_events` row for the microcompaction execution
- repeated execution is idempotent because already-compacted rows are no
  longer planner-eligible and no longer match the `persisted` update set
- the first bounded session-memory-backed compaction executor now reads:
  - one bounded `agent_state` row with `state_key = session_memory`
- it may write:
  - one bounded `compaction_events` row tied to that exact session-memory
    state and freshness point
- it does not mutate `agent_state`, `tool_results`, or transcript content
- the first bounded full-fallback compaction executor now reads:
  - the planner-visible bounded substrate
  - session memory from `agent_state` when it exists
- it may write:
  - one bounded `compaction_events` row with `compaction_kind = full`
    for the deterministic fallback artifact
- it does not summarize transcripts, mutate `agent_state`, or mutate
  `tool_results`
- the first bounded consolidation and drift planner now reads:
  - approved durable memory through the bounded approved-memory read surface
  - validated procedures only when explicitly requested by planner input
- it returns only advisory review findings and does not write:
  - `memory_objects`
  - `procedures`
  - `skill_candidates`
  - `policies`
  - `memory_events`
  - `compaction_events`
- the first bounded consolidation executor now reads:
  - approved durable memory findings from either the current planner result or
    an explicit approved subset
- it may write only conservative durable-memory hygiene state:
  - one `memory_reviews` row with `action = supersede` per superseded object
  - one `memory_links` row with `link_kind = supersedes` per superseded object
  - one `memory_objects` state transition to `review_state = superseded`
    plus `superseded_at`
- contradiction and drift findings remain advisory-only in this slice
- it does not mutate:
  - `procedures`
  - `skill_candidates`
  - `policies`
  - `memory_events`
  - `compaction_events`
- the first bounded drift-check executor now reads:
  - overdue `drift_check_review` findings from either the current planner
    result or an explicit approved subset
- it may write only conservative drift-check state:
  - one `memory_events` row with a bounded drift-check artifact per executed
    object
  - bounded `metadata` refresh on the target `memory_objects` or `procedures`
    row with `driftCheckedAt`, outcome, and event id
- it does not rewrite stored `content` or procedure `body`
- it does not mutate:
  - `memory_reviews`
  - `memory_links`
  - `skill_candidates`
  - `policies`
  - `compaction_events`
- the first safe proactive planning surface now reads only existing bounded
  state from:
  - candidate reviewable rows
  - draft and validated procedure lineage
  - bounded skill-candidate state
  - approved durable-memory metadata
  - the existing consolidation-planning read path
- that proactive surface is advisory-only and does not create any rows,
  events, approvals, install records, or background jobs
- the first bounded background-job scheduling surface now writes only:
  - `background_jobs` rows with `job_kind = maintenance`
- that scheduler stores the middleware-owned bounded class in job `payload`
  and idempotence metadata in job `metadata`
- the first bounded background-job runner now updates only:
  - `background_jobs.status`
  - `background_jobs.started_at`
  - `background_jobs.finished_at`
  - `background_jobs.attempts`
  - `background_jobs.last_error`
  - bounded execution metadata on the same job row
- the bounded scheduler now supports these internal classes:
  - `proactive_plan`
  - `proactive_execute_run_drift_check`
  - `consolidation_plan`
  - `consolidation_execute`
- `consolidation_plan` reuses existing advisory consolidation-planning reads
  only and does not create `memory_reviews`, `memory_links`, or
  `memory_events`
- `consolidation_execute` reuses the existing bounded consolidation executor
  only when an explicit approved subset is present
- scheduled `consolidation_execute` remains limited to:
  - `duplicate_merge_review`
  - `stale_superseded_review`
- scheduled `consolidation_execute` still does not execute:
  - `contradiction_review`
  - `drift_check_review`
- no schema extension was required for this first scheduling slice
- no schema extension was required for the first safe proactive planning slice
- the first bounded proactive execution surface now:
  - accepts only `run_drift_check`
  - derives or accepts bounded target ids for that action
  - delegates execution only to the existing drift-check executor
- that proactive execution surface does not introduce any new table writes
  beyond the writes already performed by the bounded drift-check executor
- no schema extension was required for the first bounded proactive execution
  slice
- no schema extension is required for the production-adoption-planning slice;
  it documents rollout and rollback sequencing only
- both existing migrations have now also been rehearsed successfully in the
  disposable local Docker staging-like lane described in the rehearsal report
- both existing migrations have now also been applied successfully in the
  first persistent local non-production rollout target

## Core table families

### Root coordination tables

#### `projects`

Purpose:

- define durable project scope for memory and procedure grouping
- provide a stable boundary for project-level retrieval, review, and promotion
- support memory segmentation across initiatives

Why it exists:

- the system needs a first-class way to group durable memory by project instead of inferring project boundaries only from session labels or freeform metadata

#### `agents`

Purpose:

- define durable agent identity for memory ownership, behavior tracking, and state
- support multi-agent memory behavior without collapsing everything into a single global namespace

Why it exists:

- procedures, session memory, reviews, and promotions need to be attributable to specific agents or agent roles

#### `sessions`

Purpose:

- represent work sessions and their durable context identity
- link event flow, tool results, session memory, and compaction history

Why it exists:

- session survival requires a durable session record that is richer than transient prompt state

### Context-plane tables

#### `memory_events`

Purpose:

- store structured runtime events that may later drive memory capture, review, procedure drafting, or promotion
- preserve event provenance for later learning and auditing

Why it exists:

- the system needs a durable record of what happened before anything is promoted into memory or behavior

Context-plane role:

- event substrate for later memory promotion
- raw material for session survival and durable learning

#### `tool_results`

Purpose:

- persist oversized or important tool outputs outside the prompt
- support preview substitution, rehydration, and compaction-safe referencing

Why it exists:

- large tool outputs are a primary source of context pressure and need durable storage outside the active prompt window

Context-plane role:

- supports persisted tool-result previews
- supports rehydration when a full result is needed again

Current bounded implementation:

- `memory_tool_result_persist` now uses `tool_results` as the canonical
  oversized payload store
- oversized persisted results now also emit one provenance
  `memory_events` row with `event_kind = tool_result`
- below-threshold results now return inline preview contracts without writing
  to the database
- `memory_tool_result_get` now rehydrates the full stored payload by id
- `memory_tool_result_microcompact_plan` now reads persisted `tool_results`
  and returns deterministic oldest-first preview-clear candidates outside a
  preserved recent floor

#### `compaction_events`

Purpose:

- log microcompaction and full compaction decisions
- record why context was reduced, what was summarized, and what durable references were retained

Why it exists:

- compaction should be inspectable and reviewable, not a hidden transformation

Context-plane role:

- provides traceability for context reduction behavior

Current bounded implementation:

- `compaction_events` remain unused in the current microcompaction slice
- the first microcompaction layer is planning-only and does not yet write any
  compaction artifacts

#### `background_jobs`

Purpose:

- track queued or running background work related to compaction, review, promotion, indexing, or maintenance

Why it exists:

- durable asynchronous work needs explicit job state instead of being hidden in transient runtime execution

Context-plane role:

- operational substrate for deferred processing

#### `agent_state`

Purpose:

- store small, durable state needed for agents to resume or continue bounded work
- support session memory coordination and background follow-through

Why it exists:

- some agent state is neither a full memory object nor a transient prompt detail; it needs a structured persistence layer

Context-plane role:

- durable state for ongoing agent/session coordination
- canonical bounded session-memory storage for the first direct session-memory
  slice

### Knowledge-plane tables

#### `memory_objects`

Purpose:

- store durable typed memory units
- represent approved knowledge across the defined memory taxonomy

Why it exists:

- the system should not store all durable knowledge as one opaque blob

Knowledge-plane role:

- central canonical memory table
- supports typed memory such as user, feedback, project, reference, procedure-adjacent, and policy-related memory

#### `memory_sources`

Purpose:

- attach provenance to memory objects
- record where a memory came from, including sessions, events, tool outputs, human review, or imported references

Why it exists:

- durable memory must remain inspectable and attributable

Knowledge-plane role:

- provenance layer for trust, review, and retrieval explanation

#### `memory_links`

Purpose:

- connect memory objects to related memory, sessions, procedures, policies, agents, or projects
- represent explicit graph structure instead of relying only on semantic retrieval

Why it exists:

- memory needs structured relationships for navigation, promotion, and reranking

Knowledge-plane role:

- graph layer for retrieval and promotion

#### `memory_reviews`

Purpose:

- track review state for candidate, approved, corrected, rejected, or superseded memory
- capture human or system review outcomes

Why it exists:

- durable memory should be promoted through reviewable state transitions, not silently accepted

Knowledge-plane role:

- review and approval layer for memory quality control

#### `policies`

Purpose:

- store durable behavioral constraints, approval requirements, and protected rules
- support policy-aware retrieval and execution gating

Why it exists:

- policy should be explicit, typed, and queryable instead of hidden in prompts alone

Knowledge-plane role:

- canonical policy substrate for gating memory usage and action promotion

#### `procedures`

Purpose:

- store validated reusable workflows distilled from repeated successful work
- capture operational procedures separately from raw event or memory history

Why it exists:

- reusable behavior needs a durable representation before it becomes a skill candidate

Knowledge-plane role:

- procedure layer in the event -> memory -> procedure -> skill promotion path

#### `procedure_runs`

Purpose:

- track executions, validations, and outcomes of procedures
- support evidence-based promotion of procedures into stronger reusable assets

Why it exists:

- a procedure should not be treated as validated only because it was drafted once

Knowledge-plane role:

- empirical validation layer for procedure maturity

#### `skill_candidates`

Purpose:

- store candidate skills distilled from validated procedures and reviewed behavior
- track vetting and promotion state before installation

Why it exists:

- skill promotion should be explicit and reviewable, not an implicit side effect of memory capture

Knowledge-plane role:

- final pre-install stage in the promotion pipeline

## Enum families

The schema is expected to use enums to preserve typed state and prevent important control flow from collapsing into arbitrary strings.

### Memory taxonomy enums

Expected purpose:

- distinguish durable memory types such as:
  - `user`
  - `feedback`
  - `project`
  - `reference`
  - `procedure`
  - `policy`

Why they exist:

- each memory type serves a different job and should be retrievable, reviewed, and governed differently

### Event and source enums

Expected purpose:

- classify event kinds and source kinds for:
  - runtime events
  - tool results
  - imported references
  - review-originated changes
  - procedure or policy derivation

Why they exist:

- provenance needs structured categories for explanation, filtering, and promotion logic

### Review and approval enums

Expected purpose:

- represent review state for memory objects, procedures, and skill candidates

Why they exist:

- reviewable transitions should be explicit, durable, and query-safe

### Job and lifecycle enums

Expected purpose:

- represent background job state, compaction state, procedure run outcome, and agent-state lifecycle

Why they exist:

- asynchronous and staged workflows need typed operational status

### Policy and gating enums

Expected purpose:

- classify policy type, severity, scope, and enforcement posture

Why they exist:

- policy gating needs structured semantics for retrieval and action control

## Context-plane vs knowledge-plane distinction

### Context plane

Primary tables:

- `sessions`
- `memory_events`
- `tool_results`
- `compaction_events`
- `background_jobs`
- `agent_state`

Primary job:

- keep active and long-running work stable
- reduce prompt pressure safely
- preserve enough runtime trace to support later review and learning

Current bounded implementation:

- candidate, promotion, skill, and retrieval slices still dominate the plugin,
  but the first real context-plane primitive now exists through persisted tool
  results plus stable preview substitution contracts

### Knowledge plane

Primary tables:

- `memory_objects`
- `memory_sources`
- `memory_links`
- `memory_reviews`
- `policies`
- `procedures`
- `procedure_runs`
- `skill_candidates`

Primary job:

- store durable, typed, reviewable knowledge
- support promotion from event history into reusable behavior
- enforce policy and provenance through the promotion chain

## Provenance model

Provenance is a first-class requirement.

The schema is intended to support:

- tracing memory back to sessions, events, tool outputs, references, or reviews
- tracing procedures back to validated evidence
- tracing skill candidates back to reviewed procedures and promotion decisions

This is why the design includes:

- `memory_sources`
- `memory_links`
- review tables
- event and procedure-run history

The system should be able to answer:

- where did this memory come from
- why was it approved
- what evidence promoted it
- what policy gates apply to it

## Promotion model in schema terms

The promotion pipeline is:

event -> candidate memory -> approved memory -> procedure draft -> validated procedure -> skill candidate -> vetted skill -> installed skill

In schema terms, that means:

- `memory_events` capture the initial event substrate
- `memory_objects` and `memory_reviews` represent candidate and approved memory
- `procedures` and `procedure_runs` represent draft and validated reusable workflows
- `skill_candidates` represent vetted pre-install skill assets
- policy gates and reviews constrain promotion at each stage

The schema should support promotion without forcing immediate promotion.

Not every event becomes memory.
Not every memory becomes a procedure.
Not every procedure becomes a skill candidate.

## Policy gating

Policy is not an afterthought.

The schema is intended to support:

- explicit policy storage
- policy-aware retrieval
- promotion constraints
- approval requirements for high-risk transitions

This is why `policies` exists as a first-class table family instead of burying policy only in prompts or static code.

Policy gating is especially important for:

- durable behavior promotion
- external action enablement
- any later third-party skill installation or activation

## Implementation notes

Already drafted at the design level:

- the table families above
- the context-plane vs knowledge-plane split
- the promotion pipeline
- provenance and policy-gating expectations
- the role of hybrid retrieval
- canonical DB ownership under `extensions/memory-middleware/db/`
- canonical migration root under `extensions/memory-middleware/db/migrations/`
- dedicated Postgres schema namespace: `memory_middleware`
- migration naming convention:
  - `YYYYMMDD_HHMMSS_memory_middleware_schema_v1.sql`
  - `YYYYMMDD_HHMMSS_memory_middleware_security_retrieval.sql`
- first executable draft:
  - `extensions/memory-middleware/db/migrations/20260401_000001_memory_middleware_schema_v1.sql`

Still pending:

- RLS details
- RPC/view design
- embeddings-specific tables and functions
- reconciliation of the schema plan with the repo's existing database conventions

## Retrieval substrate notes

The validated retrieval substrate now supports three bounded read modes in the
middleware:

- curated approved-memory reads through `internal_approved_memory_v`
- curated reviewable-candidate reads through `internal_reviewable_candidates_v`
- validated-procedure reads through a stable query-owned read model

The first bounded semantic retrieval prototype now also reads from
`memory_embeddings`, but only when:

- the caller supplies a query embedding vector
- `embedding_model` and `embedding_version` match explicitly
- the result is within approved-memory scope, or validated-procedure scope is
  explicitly requested

Validated procedures currently reuse embeddings attached to their preserved
`source_memory_object_id` lineage. The prototype does not generate embeddings
or expose candidate semantic retrieval.

The bounded approval and install slices now also use internal event artifacts:

- `skill_candidate.approval`
- `skill_candidate.install_record`

The install-record event preserves:

- bounded approval scope
- approval, procurement, and vetting lineage
- preserved install guardrails
- manual install steps and notes

It does not mutate `skill_candidates` state or create any installed-skill
runtime artifact.
