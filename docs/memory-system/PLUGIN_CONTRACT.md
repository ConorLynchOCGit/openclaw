# Memory Middleware Plugin Contract

## Purpose

This document describes the intended tool and hook contract for the native memory middleware plugin:

- `openclaw-memory-middleware`

It is an architectural contract, not an implementation file. The goal is to define what the plugin is responsible for, which tool surfaces it should expose, which hooks it should eventually support, and how those capabilities relate to the companion internal skills.

Current implementation note:

- the first bounded tool surface currently implemented in the repo is
  the candidate-only set:
  - `memory_candidate_submit`
  - `memory_self_improving_capture_candidate`
  - `memory_candidate_list`
  - `memory_candidate_get`
  - `memory_object_list`
  - `memory_object_get`
  - `memory_object_search_basic`
  - `memory_object_search_hybrid`
  - `memory_tool_result_persist`
  - `memory_tool_result_get`
  - `memory_tool_result_microcompact_plan`
  - `memory_tool_result_microcompact_execute`
  - `memory_compaction_plan`
  - `memory_session_get`
  - `memory_session_update`
  - `memory_session_compact_execute`
  - `memory_full_compaction_fallback_execute`
  - `memory_drift_check_execute`
  - `memory_consolidation_execute`
  - `memory_consolidation_plan`
  - `memory_proactive_plan`
  - `memory_proactive_execute`
  - `memory_background_job_enqueue`
  - `memory_background_job_run_next`
  - `memory_candidate_review`
  - `memory_candidate_promote_plan`
  - `memory_candidate_promote_memory`
  - `memory_candidate_promote_procedure`
  - `memory_procedure_validate_plan`
  - `memory_procedure_validate`
  - `memory_skill_candidate_approval_plan`
  - `memory_skill_candidate_approve`
  - `memory_skill_candidate_install_handoff`
  - `memory_skill_candidate_plan`
  - `memory_skill_candidate_create`
  - `memory_skill_candidate_procurement_plan`
  - `memory_skill_candidate_procurement_record_create`
  - `memory_skill_candidate_skill_vetter_handoff`
  - `memory_skill_candidate_vetting_result_record`
- these are bounded candidate-only seams, not replacements for the broader
  stable tool contract documented below
- when configured with a reachable Postgres backend, the current implementation
  now:
  - writes candidate state through `memory_events`, `memory_objects`, and
    `memory_sources`
  - exposes a reduced-profile self-improving capture seam that:
    - accepts only bounded candidate outputs
    - stamps adaptation provenance into candidate metadata
    - routes only through the existing candidate ingress path
    - blocks forbidden non-candidate output postures before any write
  - lists and inspects candidate-state rows through `memory_objects` joined to
    `memory_events`
  - lists and inspects bounded approved memory objects by default, with
    candidate objects and validated procedures available only through explicit
    retrieval scopes
  - records bounded candidate review outcomes through `memory_reviews`, with
    candidate-state updates only for rejected or needs-revision outcomes
  - returns advisory-only promotion targets by inspecting a candidate plus its
    latest review record
  - promotes eligible reviewed non-procedure candidates into bounded durable
    memory by creating:
    - one approved row in `memory_objects`
    - provenance rows in `memory_sources`
    - a `derived_from` provenance edge in `memory_links`
  - promotes eligible reviewed procedure candidates into bounded procedure
    drafts by creating:
    - one draft row in `procedures`
    - one provenance edge in `memory_links`
    - procedure metadata that records candidate, review, and event provenance
  - inspects bounded draft procedures and their source candidate review
    provenance to return advisory-only validation-planning targets
  - validates eligible bounded draft procedures by:
    - writing one `procedure_runs` row
    - updating the procedure status to `validated`
    - preserving bounded validation metadata without creating skill candidates
  - inspects eligible validated procedures and their bounded validation evidence
    to return advisory-only skill-candidate planning targets
  - creates bounded skill-candidate rows for eligible validated procedures by
    writing one `skill_candidates` row with preserved lineage metadata and
    repeat-safe `already_created` behavior
  - inspects bounded skill candidates and their preserved lineage to return
    advisory-only procurement-handoff targets and structured handoff fields
    without invoking Skill Vetter or installing skills
  - persists one internal procurement-record event for eligible bounded skill
    candidates without invoking Skill Vetter, changing approval state, or
    installing skills
  - prepares a manual Skill Vetter handoff package for eligible bounded skill
    candidates with procurement records without invoking Skill Vetter,
    changing approval state, or installing skills
  - persists one internal bounded vetting-result event for eligible bounded
    skill candidates without invoking Skill Vetter, changing approval state,
    or installing skills
  - inspects bounded skill candidates, procurement records, and bounded
    vetting-result records to return advisory-only approval and install
    planning outcomes without mutating approval state or installing skills
  - records bounded internal approval state for eligible skill candidates by
    writing one approval event and updating bounded skill-candidate status
    without installing skills or triggering downstream workflows
  - prepares advisory-only manual install handoff packages for approved bounded
    skill candidates without installing skills or mutating installed-skill
    state
  - exposes the first live retrieval tools as bounded list, exact get, and
    basic text search over approved memory objects plus explicitly requested
    candidate objects and validated procedures
  - approved-only retrieval now uses the curated
    `internal_approved_memory_v` surface
  - explicit candidate retrieval now uses the curated
    `internal_reviewable_candidates_v` surface
  - bounded text search now uses generated `search_document` columns for
    approved memory and validated procedures
  - bounded ranked retrieval now uses FTS plus trigram-style weighting without
    semantic retrieval
  - retrieval results now identify the formal bounded read surface that
    produced them
  - oversized bounded tool results now persist through `tool_results` and one
    provenance `memory_events` row
  - below-threshold tool results now stay inline and return stable preview
    contracts without writing to the database
  - persisted tool results now return explicit `memory_tool_result_get`
    retrieval handles for later rehydration
  - persisted tool results now also support bounded microcompaction planning
    driven by idle-gap, count, and explicit token-pressure thresholds while
    preserving a recent floor
  - bounded session memory now reads and writes one `agent_state` row with
    `state_key = session_memory`
  - missing session memory now returns a stable empty structured template
    instead of a not-found failure
  - session-memory updates now preserve omitted fields while deterministically
    replacing provided fields
  - bounded compaction planning now inspects persisted preview pressure plus
    session-memory availability and returns one advisory next-step outcome
  - bounded microcompaction execution now clears preview state only for
    planner-eligible persisted tool results and records one bounded
    microcompaction artifact
  - bounded session-memory compaction execution now reuses fresh sufficient
    session memory as a prompt-safe compaction substrate and records one
    bounded compaction artifact without mutating `agent_state`
  - bounded full-fallback compaction execution now packages already available
    bounded state into a deterministic fallback artifact and records one
    bounded full compaction artifact without transcript summarization
  - bounded consolidation planning now inspects approved durable memory and
    optional validated procedures to return advisory duplicate, contradiction,
    stale, superseded, or drift review findings without mutating stored memory
  - bounded consolidation execution now materializes only conservative
    supersede outcomes for duplicate and stale durable memory findings by
    writing bounded review and lineage records plus approved-memory
    superseded-state transitions
  - bounded drift-check execution now records overdue drift-check review
    artifacts for approved durable memory and validated procedures and
    refreshes only bounded checked metadata without rewriting stored facts
  - bounded proactive planning now inspects existing candidate, procedure,
    skill-candidate, and durable-memory state plus existing consolidation
    findings to return advisory-only internal next-step opportunities
  - proactive planning does not write rows, create events, invoke Skill
    Vetter, install skills, send messages, or execute any follow-up action
  - bounded proactive execution now supports only the `run_drift_check`
    action class
  - proactive execution may derive the bounded `run_drift_check` action from
    the advisory proactive planner or accept an explicit bounded target-id
    subset
  - proactive execution routes only through the existing
    `memory_drift_check_execute` seam and does not broaden into review,
    procurement, install, or messaging automation
  - bounded background-job enqueue now persists only internal `maintenance`
    jobs for:
    - `proactive_plan`
    - `proactive_execute_run_drift_check`
    - `consolidation_plan`
    - `consolidation_execute`
  - bounded background-job run-next now claims only ready queued jobs for
    those same classes and runs only:
    - advisory proactive planning
    - advisory consolidation planning
    - bounded safe consolidation execution
    - bounded proactive `run_drift_check` execution
  - bounded background-job inspection now also exposes:
    - `memory_background_job_list`
    - `memory_background_job_get`
- the background-job runner does not schedule or execute procurement,
  approval, install, contradiction resolution, drift remediation, messaging,
  or other external workflows
- the production-adoption plan keeps these runtime surfaces optional,
  non-exclusive, and phased for first real-environment rollout
- scheduler inspection, advisory scheduling, and execute-class scheduling are
  now separately gated
- the first live automation rollout now enables only:
  - `memory_background_job_enqueue`
  - `memory_background_job_list`
  - `memory_background_job_get`
  - `memory_background_job_run_next`
    for `proactive_plan` only in the persistent local non-production target
- the next live execute-class rollout now also enables the same bounded
  background-job surfaces for `proactive_execute_run_drift_check` only in
  that same target
- the next live advisory rollout now also enables those same bounded
  background-job surfaces for `consolidation_plan` in that same target
- the next live execute-class rollout now also enables those same bounded
  background-job surfaces for `consolidation_execute` in that same target,
  but only for the already-bounded safe subset:
  - `duplicate_merge_review`
  - `stale_superseded_review`
- contradiction and drift consolidation actions remain disabled in that
  posture
- the post-maintenance automation review now recommends keeping that live
  automation boundary unchanged until additional soak evidence or a
  shared-environment rehearsal exists
- the operator runbook for inspecting and disabling that posture now lives in
  `docs/memory-system/OPERATIONAL_RUNBOOK.md`
- the shared-environment rehearsal for that same posture remains pending a
  real shared non-production target and is documented in
  `docs/memory-system/SHARED_ENV_REHEARSAL_REPORT.md`
- direct proactive execution, self-improving capture, automatic Skill Vetter
  invocation, and actual installation remain disabled in that posture
- the first staging-like rehearsal has now confirmed this plugin can start as
  a regular bundled plugin with bounded DB connectivity and no automatic write
  side effects on startup
- the first real rollout now also confirms the plugin can expose
  `memory_object_list`, `memory_object_get`, `memory_object_search_basic`, and
  `memory_object_search_hybrid` in a read-only retrieval posture while all
  write paths remain disabled
- the next real rollout now also confirms the plugin can expose
  `memory_candidate_submit` in a bounded `submit-only` ingress posture while:
  - `memory_object_*` retrieval remains read-only
  - candidate review and promotion remain disabled
  - procedure and skill-candidate writes remain disabled
  - scheduler and proactive execution remain disabled
  - self-improving candidate capture remains disabled
- the current config surface now also accepts smaller canonical ingress stage
  names for the same rollout ladder:
  - `submit-only`
  - `conversational-review`
  - `promote-memory`
  - `promote-procedure-draft`
  - `validate-procedure`
  - `skill-candidate`
  - `skill-procurement`
  - `skill-vetting`
  - `skill-approval`
  - `skill-install`
  - `candidate-only`
- the older long-form `submit-review-promote-*` values remain accepted as
  backward-compatible aliases, but they are no longer the preferred product
  framing
- the next real rollout now also confirms the plugin can expose
  `memory_candidate_review` in a bounded `submit-review-only` ingress posture
  while:
  - `memory_candidate_submit` remains enabled
  - `memory_object_*` retrieval remains read-only
  - candidate promotion remains disabled
  - procedure and skill-candidate writes remain disabled
  - scheduler and proactive execution remain disabled
  - self-improving candidate capture remains disabled
- the next real rollout now also confirms the plugin can expose
  `memory_candidate_promote_plan` and `memory_candidate_promote_memory` in a
  bounded `submit-review-promote-memory` ingress posture while:
  - `memory_candidate_submit` and `memory_candidate_review` remain enabled
  - `memory_object_*` retrieval remains read-only
  - candidate procedure promotion remains disabled
  - procedure and skill-candidate writes remain disabled
  - scheduler and proactive execution remain disabled
  - self-improving candidate capture remains disabled
- the next real rollout now also confirms the plugin can expose
  `memory_candidate_promote_procedure` in a bounded
  `submit-review-promote-memory-procedure` ingress posture while:
  - `memory_candidate_submit`, `memory_candidate_review`,
    `memory_candidate_promote_plan`, and `memory_candidate_promote_memory`
    remain enabled
  - `memory_object_*` retrieval remains read-only
  - procedure validation and skill-candidate writes remain disabled
  - scheduler and proactive execution remain disabled
  - self-improving candidate capture remains disabled
- the smaller ingress-stage model now also means:
  - `memory_candidate_promote_plan` remains available once
    `promote-procedure-draft` is enabled because that plan can propose either
    memory promotion or procedure-draft promotion
  - `memory_procedure_validate_plan` becomes available once
    `validate-procedure` is enabled instead of waiting for the larger
    `candidate-only` sandbox posture
- the next real rollout now also confirms the plugin can expose
  `memory_procedure_validate` in a bounded
  `submit-review-promote-memory-procedure-validate` ingress posture while:
  - `memory_candidate_submit`, `memory_candidate_review`,
    `memory_candidate_promote_plan`, `memory_candidate_promote_memory`, and
    `memory_candidate_promote_procedure` remain enabled
  - `memory_object_*` retrieval remains read-only
  - procedure validation planning and skill-candidate writes remain disabled
  - scheduler and proactive execution remain disabled
  - self-improving candidate capture remains disabled
- the next real rollout now also confirms the plugin can expose
  `memory_skill_candidate_plan` and `memory_skill_candidate_create` in a
  bounded `submit-review-promote-memory-procedure-validate-skill` ingress
  posture while:
  - `memory_candidate_submit`, `memory_candidate_review`,
    `memory_candidate_promote_plan`, `memory_candidate_promote_memory`,
    `memory_candidate_promote_procedure`, and `memory_procedure_validate`
    remain enabled
  - `memory_object_*` retrieval remains read-only
  - procurement, vetting, approval, and install remain disabled
  - scheduler and proactive execution remain disabled
  - self-improving candidate capture remains disabled
- the next real rollout now also confirms the plugin can expose
  `memory_skill_candidate_procurement_plan` and
  `memory_skill_candidate_procurement_record_create` in a bounded
  `submit-review-promote-memory-procedure-validate-skill-procurement`
  ingress posture while:
  - `memory_candidate_submit`, `memory_candidate_review`,
    `memory_candidate_promote_plan`, `memory_candidate_promote_memory`,
    `memory_candidate_promote_procedure`, `memory_procedure_validate`,
    `memory_skill_candidate_plan`, and `memory_skill_candidate_create`
    remain enabled
  - `memory_object_*` retrieval remains read-only
  - procurement planning remains advisory-only even when procurement-record
    creation is enabled
  - Skill Vetter handoff, vetting-result recording, approval, and install
    remain disabled
  - scheduler and proactive execution remain disabled
  - self-improving candidate capture remains disabled
- proactive execution now also treats stale-memory and consolidation-review
  planner actions as conversational follow-up prompts that recommend
  `memory_consolidation_plan` instead of exposing an operator-only manual
  review approval class
- the next real rollout now also confirms the plugin can expose
  `memory_skill_candidate_skill_vetter_handoff` and
  `memory_skill_candidate_vetting_result_record` in a bounded
  `submit-review-promote-memory-procedure-validate-skill-procurement-vetting`
  ingress posture while:
  - `memory_candidate_submit`, `memory_candidate_review`,
    `memory_candidate_promote_plan`, `memory_candidate_promote_memory`,
    `memory_candidate_promote_procedure`, `memory_procedure_validate`,
    `memory_skill_candidate_plan`, `memory_skill_candidate_create`,
    `memory_skill_candidate_procurement_plan`, and
    `memory_skill_candidate_procurement_record_create` remain enabled
  - `memory_object_*` retrieval remains read-only
  - manual Skill Vetter handoff remains advisory-only even when one internal
    vetting-result record may be persisted
  - approval and install remain disabled
  - scheduler and proactive execution remain disabled
  - self-improving candidate capture remains disabled
- the next real rollout now also confirms the plugin can expose
  `memory_skill_candidate_approval_plan` and
  `memory_skill_candidate_approve` in a bounded
  `submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval`
  ingress posture while:
  - `memory_candidate_submit`, `memory_candidate_review`,
    `memory_candidate_promote_plan`, `memory_candidate_promote_memory`,
    `memory_candidate_promote_procedure`, `memory_procedure_validate`,
    `memory_skill_candidate_plan`, `memory_skill_candidate_create`,
    `memory_skill_candidate_procurement_plan`,
    `memory_skill_candidate_procurement_record_create`,
    `memory_skill_candidate_skill_vetter_handoff`, and
    `memory_skill_candidate_vetting_result_record` remain enabled
  - `memory_object_*` retrieval remains read-only
  - approval planning remains advisory-only even when one internal
    approval-state record may be persisted
  - install remains disabled
  - scheduler and proactive execution remain disabled
  - self-improving candidate capture remains disabled
- the next real rollout now also confirms the plugin can expose
  `memory_skill_candidate_install_handoff` and
  `memory_skill_candidate_install_record_create` in a bounded
  `submit-review-promote-memory-procedure-validate-skill-procurement-vetting-approval-install`
  ingress posture while:
  - `memory_candidate_submit`, `memory_candidate_review`,
    `memory_candidate_promote_plan`, `memory_candidate_promote_memory`,
    `memory_candidate_promote_procedure`, `memory_procedure_validate`,
    `memory_skill_candidate_plan`, `memory_skill_candidate_create`,
    `memory_skill_candidate_procurement_plan`,
    `memory_skill_candidate_procurement_record_create`,
    `memory_skill_candidate_skill_vetter_handoff`,
    `memory_skill_candidate_vetting_result_record`,
    `memory_skill_candidate_approval_plan`, and
    `memory_skill_candidate_approve` remain enabled
  - `memory_object_*` retrieval remains read-only
  - install handoff remains advisory-only even when one internal install
    record may be persisted
  - actual installation remains disabled
  - scheduler and proactive execution remain disabled
  - self-improving candidate capture remains disabled

## Plugin role

`openclaw-memory-middleware` is intended to be the primary native orchestrator for the memory system.

Its role is to:

- support context survival for long-running sessions
- persist and rehydrate tool outputs outside the prompt
- maintain structured session memory
- capture and retrieve durable typed memory
- enforce policy-aware memory workflows
- support promotion from events to memory, procedures, and skill candidates
- coordinate durable background work for compaction, review, and promotion

This plugin is not intended to replace repo docs, approval processes, or policy review. It provides capabilities and structured interfaces. The companion internal skills teach the model when and how to use them correctly.

## Design split

The plugin contract follows the same architectural split as the broader memory system:

- context-plane capabilities
- knowledge-plane capabilities
- procedure and promotion capabilities
- background job capabilities

## Context-plane tools

### `tool_result_persist`

Purpose:

- persist oversized or important tool outputs outside the active prompt
- return a stable preview and reference handle for later reuse

Typical inputs:

- session identifier
- agent identifier
- tool name
- tool result payload
- metadata such as size, content type, or importance hints

Typical outputs:

- persisted tool-result identifier
- preview text or preview payload
- persistence metadata such as truncation or storage status

Main tables read/written:

- writes `tool_results`
- may read `sessions`
- may emit `memory_events`

Current bounded implementation:

- implemented as `memory_tool_result_persist`
- persists only oversized or force-persisted results
- returns inline previews without writes when payloads stay below the bounded
  threshold

### `tool_result_rehydrate`

Purpose:

- retrieve a previously persisted tool result when the full payload is needed again

Typical inputs:

- tool-result identifier
- session identifier
- optional scope or authorization context

Typical outputs:

- full stored tool result
- metadata about source, size, and persistence status

Main tables read/written:

- reads `tool_results`
- may read `sessions`
- may emit `memory_events`

Current bounded implementation:

- implemented as `memory_tool_result_get`
- returns the full previously persisted payload plus bounded provenance
  metadata

### `compaction_plan`

Purpose:

- compute the next context-reduction step for a session
- prefer cheap context relief before full compaction

Typical inputs:

- session identifier
- current session-memory summary
- prompt pressure indicators or token-budget hints
- optional candidate stale tool-result references

Typical outputs:

- recommended compaction action
- list of stale or oversized artifacts to compress or preview
- rationale for the plan

Main tables read/written:

- reads `sessions`
- reads `tool_results`
- reads `agent_state`
- may write `compaction_events`

Current bounded implementation:

- partially implemented as `memory_tool_result_microcompact_plan`
- currently plans persisted-preview clearing only
- currently reads `tool_results` only and does not yet write
  `compaction_events`

### `compaction_execute`

Purpose:

- apply bounded microcompaction decisions to persisted tool-result previews
- clear old prompt-preview state while keeping full payloads rehydratable

Typical inputs:

- session identifier
- optional bounded clear list
- optional planner thresholds

Typical outputs:

- execution status
- cleared tool-result ids
- preserved tool-result ids
- skipped requested ids

Main tables read/written:

- reads `tool_results`
- writes `tool_results`
- writes `compaction_events`

Current bounded implementation:

- implemented as `memory_tool_result_microcompact_execute`
- only clears planner-eligible persisted preview state
- marks cleared rows as `compacted`
- clears `preview_text`
- does not summarize transcripts or update session memory

### `context_pressure_plan`

Purpose:

- choose the next bounded context-pressure response for a session
- reuse existing persisted-preview and session-memory signals before any
  future full compaction execution exists

Typical inputs:

- session identifier
- agent identifier
- optional prompt-pressure hint
- bounded microcompaction thresholds
- bounded session-memory freshness threshold

Typical outputs:

- advisory next-step outcome
- rationale
- required inputs or gates
- persisted-preview clear candidates when microcompaction is recommended
- session-memory sufficiency and freshness state

Main tables read/written:

- reads `tool_results`
- reads `agent_state`
- reads `sessions`
- does not write in this slice

Current bounded implementation:

- implemented as `memory_compaction_plan`
- reuses bounded microcompaction planning over persisted `tool_results`
- reuses bounded session-memory reads from `agent_state`
- does not write `compaction_events`, rewrite prompts, or summarize the
  transcript

### `session_memory_get`

Purpose:

- retrieve structured session memory for the active work session

Typical inputs:

- session identifier
- agent identifier

Typical outputs:

- current session memory payload
- metadata such as freshness, last update source, or confidence

Main tables read/written:

- reads `sessions`
- reads `agent_state`
- may read `memory_events`

Current bounded implementation:

- implemented as `memory_session_get`
- currently reads only `agent_state` for the requested `agentId` plus
  `sessionId`
- currently returns an explicit empty structured template when no persisted
  row exists

### `session_memory_update`

Purpose:

- update structured session memory as work progresses
- keep the live session state useful without requiring full compaction

Typical inputs:

- session identifier
- incremental memory update payload
- source event or rationale
- optional merge mode or overwrite mode

Typical outputs:

- updated session memory payload
- update status
- provenance metadata for the change

Main tables read/written:

- writes `agent_state`
- reads `sessions`
- may write `memory_events`

Current bounded implementation:

- implemented as `memory_session_update`
- currently writes only `agent_state`
- currently uses deterministic replace-only patch behavior with bounded
  trimming, deduping, and field caps
- currently does not summarize the transcript or emit `memory_events`

## Knowledge-plane tools

### `memory_capture`

Purpose:

- create or propose durable typed memory from validated inputs
- support candidate memory capture before later review

Typical inputs:

- memory type
- content payload
- related project, agent, or session identifiers
- provenance/source references
- optional review posture or confidence hints

Typical outputs:

- memory object identifier
- current review or approval state
- provenance linkage summary

Main tables read/written:

- writes `memory_objects`
- writes `memory_sources`
- may write `memory_reviews`
- may read `projects`, `agents`, `sessions`

### `memory_query`

Purpose:

- retrieve relevant durable memory using typed, scoped, and policy-aware search

Typical inputs:

- query text or structured query constraints
- memory types to search
- project, session, or agent scope
- policy or visibility context

Typical outputs:

- ranked memory objects
- provenance summaries
- relationship or source context for inspection

Main tables read/written:

- reads `memory_objects`
- reads `memory_sources`
- reads `memory_links`
- reads `memory_reviews`
- reads `policies`

### `memory_link`

Purpose:

- create explicit links between memory objects and related entities
- support graph-style retrieval and promotion logic

Typical inputs:

- source memory identifier
- target entity identifier
- link type
- optional rationale or provenance

Typical outputs:

- memory-link identifier
- link summary

Main tables read/written:

- writes `memory_links`
- reads `memory_objects`
- may read `procedures`, `policies`, `projects`, `agents`, `sessions`

### `memory_review`

Purpose:

- record review outcomes for memory objects
- approve, reject, correct, or supersede candidate memory

Typical inputs:

- memory object identifier
- review action
- reviewer identity or reviewer class
- rationale
- optional correction payload

Typical outputs:

- review record identifier
- updated review state
- resulting memory status

Main tables read/written:

- writes `memory_reviews`
- reads `memory_objects`
- may update `memory_objects`

### `memory_policy_check`

Purpose:

- evaluate whether a memory capture, retrieval, promotion, or action path is allowed under current policy

Typical inputs:

- action type
- target memory or promotion object
- actor or agent context
- project or session scope

Typical outputs:

- allow/deny/defer decision
- applicable policy list
- rationale and required approvals

Main tables read/written:

- reads `policies`
- may read `memory_objects`, `procedures`, `skill_candidates`
- may emit `memory_events`

## Procedure and promotion tools

### `procedure_candidate_create`

Purpose:

- draft a procedure candidate from repeated or validated memory/event patterns

Typical inputs:

- related events or memory objects
- project or agent scope
- draft procedure content
- supporting rationale

Typical outputs:

- procedure identifier
- draft status
- linked evidence summary

Main tables read/written:

- writes `procedures`
- reads `memory_objects`
- reads `memory_events`
- may write `memory_links`

### `procedure_validate`

Purpose:

- record evidence that a procedure has been tested, reviewed, or validated

Typical inputs:

- procedure identifier
- run outcome
- validation notes
- optional evidence references

Typical outputs:

- procedure-run identifier
- updated procedure status
- validation summary

Main tables read/written:

- writes `procedure_runs`
- reads `procedures`
- may update `procedures`
- may read `memory_objects`, `memory_events`

### `skill_candidate_create`

Purpose:

- create a skill candidate from validated procedures and reviewed memory

Typical inputs:

- procedure identifiers
- supporting evidence
- candidate skill summary
- scope and intended usage notes

Typical outputs:

- skill-candidate identifier
- candidate status
- linked procedure summary

Main tables read/written:

- writes `skill_candidates`
- reads `procedures`
- reads `procedure_runs`
- may read `policies`

### `skill_candidate_review`

Purpose:

- review and gate a skill candidate before any installation decision

Typical inputs:

- skill-candidate identifier
- review action
- rationale
- optional risk notes or policy findings

Typical outputs:

- updated candidate status
- review outcome summary
- required next steps, if any

Main tables read/written:

- reads `skill_candidates`
- reads `policies`
- may update `skill_candidates`
- may emit `memory_events`

## Background job tools

### `background_job_enqueue`

Purpose:

- enqueue durable asynchronous work related to compaction, extraction, review, promotion, or retrieval maintenance

Typical inputs:

- job type
- payload
- priority or timing hints
- related session, project, agent, or memory identifiers

Typical outputs:

- background-job identifier
- queued status
- scheduling metadata

Main tables read/written:

- writes `background_jobs`
- may read `sessions`, `memory_objects`, `procedures`, `skill_candidates`, `agent_state`

## Intended hooks

### Tool-result persistence hook

Purpose:

- intercept oversized or persistence-worthy tool results
- store them outside the prompt and substitute stable previews

Expected effect:

- reduces prompt pressure before summarization is needed
- gives the model durable handles for later rehydration

Likely table interaction:

- writes `tool_results`
- may emit `memory_events`

### Pre-model context check hook

Purpose:

- inspect session state before model invocation
- decide whether context pressure requires preview substitution, microcompaction, or session-memory refresh

Expected effect:

- uses the cheapest context-relief strategy first
- avoids unnecessary full compaction

Likely table interaction:

- reads `sessions`
- reads `tool_results`
- reads `agent_state`
- may write `compaction_events`

### Post-turn extraction hook

Purpose:

- inspect completed turn output and event traces
- identify candidate memory, review triggers, procedure candidates, or background jobs

Expected effect:

- turns successful work into structured durable artifacts without forcing immediate promotion

Likely table interaction:

- reads `memory_events`
- may write `memory_objects`
- may write `procedures`
- may enqueue `background_jobs`

## Plugin capabilities vs companion internal skills

The plugin provides capabilities.

The companion internal skills provide usage discipline.

The intended companion skills are:

- `memory-middleware`
- `procedure-distiller`
- `policy-check`
- `session-memory-updater`
- `skill-procurement`

Their relationship is:

- the plugin exposes durable tools and hooks
- the skills teach the model when to call them
- the repo docs preserve the long-term architectural contract

This split is important because:

- tool availability alone does not produce correct model behavior
- policy and promotion workflows need explicit learned usage patterns
- architectural intent should remain inspectable in the repo instead of living only in prompts

## Current bounded retrieval tools

The current middleware retrieval surface is read-only and includes:

- `memory_object_list`
- `memory_object_get`
- `memory_object_search_basic`
- `memory_object_search_hybrid`
- `memory_object_search_semantic`

The semantic tool is intentionally narrower than the text surfaces:

- it requires a caller-supplied embedding vector
- it requires explicit `embeddingModel` and `embeddingVersion`
- it searches approved memory by default
- it includes validated procedures only when explicitly requested
- it does not expose candidate semantic retrieval

The current bounded skill-install lifecycle surface now also includes:

- `memory_skill_candidate_install_handoff`
- `memory_skill_candidate_install_record_create`

The install-record tool remains internal-only:

- it records a manual install outcome only
- it does not install skills
- it does not mutate runtime skill state

## Contract stability

This contract is intentionally stable at the architectural level.

The exact runtime implementation may change during reconciliation and implementation, but the intended capability boundaries are:

- context survival first
- durable typed memory second
- promotion only through reviewed stages
- policy gating throughout
