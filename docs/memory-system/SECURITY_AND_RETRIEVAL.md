# Memory System Security And Retrieval

## Purpose

This document describes the current security model and hybrid retrieval design for the OpenClaw memory middleware system.

It is an architectural specification, not a migration file. The goal is to define how durable memory should be protected, how retrieval should be exposed safely, and how search should combine multiple retrieval strategies instead of relying on a single technique.

## Trust tiers

The current design assumes three trust tiers:

### 1. Backend or service-role

This is the highest-trust execution layer.

It is intended for:

- plugin-owned orchestration
- background jobs
- compaction and extraction flows
- promotion and review workflows
- embedding generation
- internal write paths across the memory system

This tier is allowed to:

- read raw event and tool-result data
- write durable memory state
- manage review and promotion transitions
- access internal provenance details

### 2. Authenticated internal readers and reviewers

This is a controlled internal access tier.

It is intended for:

- internal dashboards
- review surfaces
- controlled operator tooling
- authenticated read paths for approved durable memory and review artifacts

This tier may eventually be allowed to:

- read reviewed memory through constrained views
- inspect approved procedures and skill candidates
- review policy-constrained internal summaries

This tier should not automatically receive full access to raw system internals.

### 3. No direct public access

The design assumes no direct public access to the durable memory backend.

This means:

- no anonymous reads of memory tables
- no public search endpoint over raw durable memory
- no direct access to internal provenance, reviews, or policy state

## Backend-only table families

The following table families should remain backend-only in the current design:

- `memory_events`
- `tool_results`
- `compaction_events`
- `background_jobs`
- `agent_state`
- `memory_sources`

Why:

- they contain raw operational traces, internal job state, or provenance detail that should not be broadly exposed
- they are necessary for orchestration, compaction, promotion, and auditability, but are too low-level or sensitive for broad read access

Backend-only should also be the default posture for:

- raw review rationale that includes sensitive internal notes
- unapproved memory candidates
- pre-vetting skill candidate internals

## Table families that may support controlled internal read access

The following table families may eventually support constrained internal read access through views or RPCs:

- `projects`
- `agents`
- `sessions` in limited internal contexts
- `memory_objects`
- `memory_reviews`
- `policies`
- `procedures`
- `procedure_runs`
- `skill_candidates`

Why:

- these are the main durable artifacts that internal operators or reviewers may need to inspect
- even here, direct table access is not the preferred pattern; controlled views and RPCs are safer

Important constraint:

- exposure should follow review and policy state
- not every stored object should be visible just because it exists

## Recommended helper membership and auth tables

The retrieval and review model is expected to rely on small helper tables that define who can see or review what.

Recommended helper families include:

- internal principals table
  - maps authenticated internal identities to durable actor IDs
- project membership table
  - defines which internal actors have access to which projects
- role or capability table
  - distinguishes reviewer, operator, maintainer, or other internal roles
- policy scope membership table
  - allows policy evaluation to reason about project, memory, or review scope

Purpose:

- make access decisions explicit and queryable
- support RLS and RPC filtering without encoding all authorization logic only in application code

These helper tables are part of the security substrate, even if they are not part of the memory-object taxonomy itself.

## RLS posture

Row-level security is intended to be a core part of the design.

### Intended use of RLS

RLS should:

- default raw durable tables to deny
- allow only explicitly authorized access paths
- constrain internal readers by membership, role, and policy scope
- prevent accidental broad reads from authenticated contexts

### Recommended posture by surface

- backend or service-role flows:
  - operate with elevated privileges where necessary
  - remain responsible for policy and provenance integrity
- internal readers:
  - use constrained read surfaces
  - avoid raw unrestricted table access

### Why RLS matters here

This system stores:

- raw event traces
- tool outputs
- review decisions
- policy state
- promotion candidates

That mix is too sensitive to rely only on application-layer discipline.

## Views and security-definer RPCs

The preferred read exposure model is:

- raw tables stay protected
- internal consumers read through curated views or security-definer RPCs

### Views

Views are useful for:

- approved memory summaries
- reviewer-facing queues
- procedure and skill-candidate listings
- policy-filtered memory indexes

Views should:

- expose only the fields needed by the target surface
- hide backend-only operational detail
- align with approved/reviewed states where appropriate

### Security-definer RPCs

Security-definer RPCs are useful for:

- typed search endpoints
- scoped memory retrieval
- policy-aware recommendation or reranking flows
- review queue retrieval

RPCs should:

- perform explicit filtering
- apply policy and membership checks
- return stable response shapes for internal clients

The intended model is not “give the UI direct table reads and trust it to behave.”

Current bounded implementation note:

- the live retrieval layer already uses formal bounded read surfaces for
  approved durable memory and explicitly requested candidate reads
- the first consolidation and drift planner now reuses those bounded
  approved-memory reads and optionally the validated-procedure read model
- that planner remains advisory-only and does not broaden retrieval into
  mutation, remediation, or broader background jobs
- the first bounded consolidation executor now mutates only approved durable
  memory rows already selected for low-risk supersede handling
- it does not expose broader read access, policy-memory mutation, or automatic
  contradiction or drift remediation
- the first bounded drift-check executor now writes only bounded review events
  plus checked-timestamp metadata on already selected overdue artifacts
- it does not expand read access, rewrite stored facts, or rewrite policy
- the first bounded proactive executor now delegates only the
  `run_drift_check` action class into that same drift-check executor
- it does not broaden access tiers, execute other proactive action classes,
  invoke Skill Vetter, install skills, send messages, or execute external
  workflows
- the first bounded background-job scheduler now persists only internal
  `background_jobs` rows for:
  - `proactive_plan`
  - `proactive_execute_run_drift_check`
  - `consolidation_plan`
  - `consolidation_execute`
- the first bounded background-job runner now executes only those three
  low-risk internal classes plus bounded safe consolidation execution and
  still does not broaden access tiers, invoke Skill Vetter, install skills,
  send messages, or execute external workflows
- the production-readiness review now concludes that these bounded scheduler
  and proactive seams are not yet ready for live enablement until explicit
  runner-ownership, inspection, disablement, and gate controls are documented
- the production-adoption plan keeps first real-environment rollout
  service-role-first and non-exclusive, with no direct public access and no
  new external workflow automation
- the first live automation rollout now also confirms that:
  - advisory scheduling may be enabled for `proactive_plan` only
  - execute-class and consolidation scheduling may remain blocked at the same
    time
  - single-runner ownership may be enforced for live `run_next`
  - queued and succeeded job inspection remains bounded to the middleware job
    table and metadata
  - no broader retrieval access or external workflow automation is required
- the first staging-like rehearsal has now confirmed that the bounded
  retrieval views exist after migration and that read-only retrieval can stay
  inside the reviewable or approved read surfaces without enabling broader
  access
- the first real non-disposable rollout now also confirms that read-only
  retrieval can be enabled in a persistent non-production target while all
  middleware write surfaces remain disabled
- the next real bounded write rollout now also confirms that:
  - `memory_candidate_submit` may be enabled through
    `candidateIngress.mode = submit-only`
  - bounded approved-memory retrieval may remain read-only at the same time
  - candidate review, background jobs, proactive execution, and
    self-improving capture stay disabled in that posture
  - no broader access-tier expansion or follow-on automation is required for
    this first real write step
- the next real bounded review rollout now also confirms that:
  - `memory_candidate_review` may be enabled alongside
    `memory_candidate_submit` through
    `candidateIngress.mode = submit-review-only`
  - bounded approved-memory retrieval may remain read-only at the same time
  - candidate promotion, background jobs, proactive execution, and
    self-improving capture stay disabled in that posture
  - no broader access-tier expansion or downstream workflow automation is
    required for this second real write step
- the next real bounded memory-promotion rollout now also confirms that:
  - `memory_candidate_promote_plan` and `memory_candidate_promote_memory`
    may be enabled alongside submit and review through
    `candidateIngress.mode = submit-review-promote-memory`
  - bounded approved-memory retrieval may remain read-only at the same time
  - procedure promotion, procedure validation, background jobs, proactive
    execution, and self-improving capture stay disabled in that posture
  - the promotion write stays inside the existing approved-memory plus
    provenance tables and does not expand into downstream procedure or
    governance workflows
- the next real bounded procedure-promotion rollout now also confirms that:
  - `memory_candidate_promote_procedure` may be enabled alongside submit,
    review, promotion planning, and bounded memory promotion through
    `candidateIngress.mode = submit-review-promote-memory-procedure`
  - bounded approved-memory retrieval may remain read-only at the same time
  - procedure validation, skill-candidate governance, background jobs,
    proactive execution, and self-improving capture stay disabled in that
    posture
  - the procedure-draft promotion write stays inside the existing
    `procedures` table plus bounded `memory_links` lineage and does not
    expand into validation, governance, or external workflows
- the next real bounded procedure-validation rollout now also confirms that:
  - `memory_procedure_validate` may be enabled alongside submit, review,
    bounded promotion planning, bounded memory promotion, and bounded
    procedure promotion through
    `candidateIngress.mode = submit-review-promote-memory-procedure-validate`
  - bounded approved-memory retrieval may remain read-only at the same time
  - procedure validation planning, skill-candidate governance,
    background jobs, proactive execution, and self-improving capture stay
    disabled in that posture
  - the validation write stays inside the existing `procedures` and
    `procedure_runs` substrate and does not expand into skill governance or
    external workflows
- the next real bounded skill-candidate rollout now also confirms that:
  - `memory_skill_candidate_plan` and `memory_skill_candidate_create` may be
    enabled alongside submit, review, bounded promotion, and bounded
    procedure validation through
    `candidateIngress.mode = submit-review-promote-memory-procedure-validate-skill`
  - bounded approved-memory retrieval may remain read-only at the same time
  - procurement, vetting, approval, install, background jobs, proactive
    execution, and self-improving capture stay disabled in that posture
  - the skill-candidate write stays inside the existing `skill_candidates`
    substrate and does not expand into procurement, install, or external
    workflows
- the next real bounded procurement rollout now also confirms that:
  - `memory_skill_candidate_procurement_plan` and
    `memory_skill_candidate_procurement_record_create` may be enabled
    alongside submit, review, bounded promotion, bounded procedure
    validation, and bounded skill-candidate planning or creation through
    `candidateIngress.mode = submit-review-promote-memory-procedure-validate-skill-procurement`
  - bounded approved-memory retrieval may remain read-only at the same time
  - the procurement-record write stays inside the existing `memory_events`
    substrate and does not broaden access tiers or retrieval surfaces
  - Skill Vetter handoff, vetting-result recording, approval, install,
    background jobs, proactive execution, and self-improving capture stay
    disabled in that posture
- the next real bounded vetting rollout now also confirms that:
  - `memory_skill_candidate_skill_vetter_handoff` and
    `memory_skill_candidate_vetting_result_record` may be enabled alongside
    submit, review, bounded promotion, bounded procedure validation, bounded
    skill-candidate planning or creation, and bounded procurement state
    through
    `candidateIngress.mode = submit-review-promote-memory-procedure-validate-skill-procurement-vetting`
  - bounded approved-memory retrieval may remain read-only at the same time
  - manual Skill Vetter handoff remains advisory-only even when vetting-result
    recording is enabled
  - the vetting-result write stays inside the existing `memory_events`
    substrate and does not broaden access tiers or retrieval surfaces
  - approval, install, background jobs, proactive execution, and
    self-improving capture stay disabled in that posture
- the next real bounded approval rollout now also confirms that:
  - `memory_skill_candidate_approval_plan` and
    `memory_skill_candidate_approve` may be enabled alongside submit, review,
    bounded promotion, bounded procedure validation, bounded skill-candidate
    planning or creation, bounded procurement state, and bounded manual
    vetting state through
    `candidateIngress.mode = submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval`
  - bounded approved-memory retrieval may remain read-only at the same time
  - approval planning remains advisory-only even when one internal
    approval-state record may be persisted
  - the approval write stays inside the existing `memory_events` plus
    `skill_candidates` substrate and does not broaden access tiers or
    retrieval surfaces
  - install, background jobs, proactive execution, and self-improving capture
    stay disabled in that posture
- the next real bounded install rollout now also confirms that:
  - `memory_skill_candidate_install_handoff` and
    `memory_skill_candidate_install_record_create` may be enabled alongside
    submit, review, bounded promotion, bounded procedure validation, bounded
    skill-candidate planning or creation, bounded procurement state, bounded
    manual vetting state, and bounded approval state through
    `candidateIngress.mode = submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install`
  - bounded approved-memory retrieval may remain read-only at the same time
  - install handoff remains advisory-only even when one internal install
    record may be persisted
  - the install-record write stays inside the existing `memory_events`
    substrate and does not broaden access tiers, retrieval surfaces, or
    runtime install state
  - actual installation, background jobs, proactive execution, and
    self-improving capture stay disabled in that posture

## Retrieval model

Retrieval is intended to be hybrid, typed, and policy-aware.

### Retrieval layers

1. metadata and exact matching
2. FTS
3. trigram similarity
4. vector similarity
5. provenance and graph reranking
6. policy-aware filtering

### Metadata and exact matching

Use for:

- exact identifiers
- session keys
- project names
- policy keys
- agent names
- file paths or repo references

Why it matters:

- some lookups are exact and should not be treated as fuzzy semantic search problems

### FTS

Use for:

- structured keyword retrieval over memory text
- document-style search
- phrase-oriented recall

Why it matters:

- durable memory often behaves like searchable structured text, not only conceptual embeddings

### Trigram

Use for:

- near matches
- typo tolerance
- partial identifier or path matches

Why it matters:

- operational search often includes imperfect file names, project names, or shorthand references

### Vector

Use for:

- semantic similarity
- related concept recall
- retrieval of thematically related memory

Why it matters:

- some memory lookups are conceptual and benefit from embedding-based similarity

### Provenance and graph reranking

Use for:

- preferring reviewed memory over unreviewed candidates
- preferring project-local evidence
- preferring directly linked or strongly sourced memory
- biasing toward validated procedures and approved objects

Why it matters:

- the best result is not always the highest lexical or vector match

### Policy-aware filtering

Use for:

- removing results the caller should not see
- preferring allowed, approved, or safer artifacts
- preventing high-risk material from surfacing through generic search

Why it matters:

- retrieval is part of the trust model, not a neutral read primitive

## Why vector-only retrieval is insufficient

Vector-only retrieval is not enough because this system must handle:

- exact identifiers
- policy keys
- session references
- repo paths
- project scoping
- reviewer-approved artifacts
- provenance-sensitive ranking

A pure semantic similarity system is weak at:

- exact match requirements
- typo-tolerant operational lookups
- policy-constrained search
- trustworthy explanation of why a result surfaced

That is why the design is hybrid instead of embedding-only.

## `memory_embeddings` as a side table

The design includes an intended `memory_embeddings` concept, but it should remain a side table rather than being merged directly into `memory_objects`.

### Why use a side table

- embeddings are derived artifacts, not canonical memory content
- multiple embedding versions or models may be needed over time
- re-embedding should not require rewriting core memory rows
- retrieval infrastructure should be replaceable without changing canonical memory objects

### Intended role

`memory_embeddings` should:

- reference durable memory objects
- store embedding vectors and model/version metadata
- support hybrid retrieval workflows without becoming the source of truth for memory itself

## Async embedding generation

Embedding generation should be asynchronous.

Why:

- embedding work can be expensive
- it should not block core memory capture flows
- re-embedding may be needed later when models or chunking strategy changes

Expected pattern:

- memory capture writes canonical durable memory first
- a background job is enqueued for embedding generation or refresh
- retrieval can fall back to non-vector search until embeddings are ready

This is another reason `background_jobs` and a side-table embedding design are part of the architecture.

## Safe exposure patterns for search

The safe default is:

- raw tables are not directly exposed
- internal consumers call typed retrieval RPCs or query curated views

Recommended exposure pattern:

1. caller authenticates
2. membership and role context is resolved
3. retrieval RPC applies project scope, policy checks, and review-state filters
4. search uses hybrid ranking internally
5. response returns only the fields needed by the caller

This pattern allows:

- safer search over sensitive durable memory
- inspectable and testable retrieval behavior
- evolution of retrieval internals without changing every caller

## Planned migration scope

The future retrieval and security migration should include:

- helper membership and auth tables
- RLS policies for protected memory-system tables
- curated internal views for approved/reviewable artifacts
- security-definer RPCs for typed search and review flows
- FTS and trigram support on the relevant durable memory surfaces
- the `memory_embeddings` side table
- background-job support for async embedding generation
- policy-aware retrieval plumbing and any supporting indexes

What should remain outside that migration:

- raw application-layer orchestration logic
- high-level skill behavior
- prompt policy or repo-doc guidance that belongs in docs rather than schema

## Current draft status

The second executable migration draft now lives at:

- `extensions/memory-middleware/db/migrations/20260401_000002_memory_middleware_security_retrieval.sql`

In this slice, that draft includes:

- internal principal and project-membership helpers
- policy-scope membership scaffolding
- RLS helper functions and first policy draft
- curated internal approved-memory, reviewable-candidate, and procedure-draft
  views
- FTS and trigram substrate on durable text tables
- the `memory_embeddings` side table
- embedding-queue indexing on `background_jobs`

It does not yet include:

- policy-aware retrieval RPCs
- live retrieval RPC implementation

The repo now has a first bounded live retrieval surface in the plugin layer:

- `memory_object_list`
- `memory_object_get`
- `memory_object_search_basic`
- `memory_object_search_hybrid`
- `memory_object_search_semantic`

That surface now uses the validated substrate where appropriate:

- approved-only `memory_object_list` and `memory_object_get` read from the
  curated `internal_approved_memory_v`
- explicit candidate reads now use the curated
  `internal_reviewable_candidates_v`
- `memory_object_search_basic` now uses generated `search_document` columns
  for approved memory and validated procedures, with bounded text fallback
- `memory_object_search_hybrid` now uses bounded FTS plus trigram-style
  ranking over approved memory and explicitly requested validated procedures
- `memory_object_search_semantic` now uses `memory_embeddings` for caller-
  supplied query vectors gated by explicit `embeddingModel` and
  `embeddingVersion`

Candidate objects and validated procedures still remain behind explicit scope
selection, and the live retrieval layer is still narrower than the intended
policy-aware RPC plus full hybrid retrieval design described in this document.

The first semantic retrieval prototype is intentionally narrow:

- approved memory objects are searched by default
- validated procedures are included only when explicitly requested
- validated procedures currently reuse embeddings from their preserved
  `source_memory_object_id` lineage
- candidate semantic retrieval is not exposed
- no automatic embedding generation or refresh is implemented in this slice

The live read layer now also identifies which formal bounded surface produced a
result:

- `approved_memory_view`
- `reviewable_candidates_view`
- `validated_procedure_read_model`

The drafted security and retrieval migration is now validated in a disposable
local Postgres lane on top of schema-v1. That controlled validation confirms:

- helper auth and membership tables apply successfully
- RLS enablement and policies are created
- curated internal views are created
- generated `search_document` columns are present
- retrieval indexes are created
- the `memory_embeddings` side table is created on a pgvector-capable image
- helper principal-resolution and access-check functions work against seeded
  membership rows
- the existing bounded middleware write and read paths still pass on the
  combined validated schema
