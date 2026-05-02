---
summary: "Phase 2 design for a proactive planner that refreshes derived memory artifacts and surfaces candidate improvements."
title: "Proactive Memory Planner"
---

# Proactive Memory Planner

## Status

This is an approved Phase 2 direction document.

The planner concept is approved with one explicit constraint:

- review cannot live only in a hidden queue

Any meaningful candidate must surface inside ordinary OpenClaw operator flow.

2026-04-22 MMV2 alignment:

- the planner may refresh derived artifacts, queue reviews, and emit bounded
  operational signals; it may not silently write durable semantic truth
- planner proposals that would change memory state must re-enter MMV2 capture,
  admission, reconciliation, and structural correction rules
- planner signals must follow no-dark-data policy: no raw prompts, full
  transcripts, raw tool logs, secrets, or proof/eval output in durable memory
- stale projection, capsule, graph, and retrieval-cache repairs are derived
  maintenance only

Remaining implementation details:

- final kill switches and config names for planner automatic derived work

2026-04-22 Phase 2 decision lock:

- heartbeat becomes the primary lightweight proactive memory maintenance loop
- the planner may automatically perform reversible derived maintenance,
  including projection refresh, capsule refresh, cache warmup, dirty marking,
  and telemetry rollups
- the planner must proactively surface skill, tool, and workflow opportunities
  to the operator when structural cadence and model/operator review produce
  accepted candidates
- planner recommendations are deduped by stable candidate id and expire when
  stale
- manual operator review is not the normal path for low-risk derived
  maintenance; review is reserved for durable semantic truth changes,
  privileged actions, medium-risk/high-risk skill or tool promotion, policy
  changes, and high-risk privacy/security cases
- future skill candidates should enter the shared skills candidate ledger and
  reuse the same proactivity ids and surfaces rather than creating a parallel
  review queue
- `skill_candidate` is the first runtime implementation of that rule: it is a
  first-class proactivity opportunity kind with bounded distilled evidence,
  deterministic dedupe, and shared canonical ids across inline, heartbeat,
  inbox, and handoff
- Skillifier MVP is the second runtime implementation of that rule: it consumes
  canonical `skill_candidate` ids, writes bounded review-only draft packages to
  allowed workspace-local draft targets, and surfaces draft-ready state through
  the same proactivity ids and surfaces
- user-facing proactivity surfaces render from a shared
  `UserFacingProactivityBrief` rather than direct ledger fields; why-now,
  provenance, source refs, timestamps, ids, limitations, and diagnostics are
  secondary details
- `UserFacingProactivityBrief` primary copy may be model-authored from typed
  bounded planner state when enabled; the model step is presentation-only and
  cannot mutate canonical memory, candidate identity, dedupe, lifecycle,
  action, send, install, or skill-package state
- deterministic schema, boundedness, no-dark-data, generic-copy, repetition,
  and unsafe-claim validators must run after model output; weak cards are
  demoted instead of surfaced as vague fallback copy
- candidate discovery for skills and proactive plans uses high-context
  model-reviewed episode workflow before Milestone 4 evals:
  - structural cadence is heartbeat/operator briefing, every 3 assistant finals
    by default, session/compaction boundary, and a future manual review hook
  - the model candidate reviewer sees capped contiguous `episodeTurns` from
    coherent OpenClaw and Codex work windows rather than short atomic snippets,
    adjacency-selected refs, or role-balanced fragments
  - deterministic packet assembly enforces caps, redaction, refs, hashes,
    provenance, cooldown, and source boundaries only; it must not decide
    semantic relevance or candidate usefulness
  - the reviewer proposes at most 0-3 high-impact plans, new skills,
    existing-skill enhancements, merge candidates, or demotions
  - deterministic validation, cooldown, dedupe, provenance, route isolation,
    and no-dark-data gates decide what can enter canonical proactivity state
- visible proactive cards require model-authored primary copy; deterministic
  fallback copy is diagnostic-only and demotes when model-authored copy is not
  available or valid
- the broader memory stack still uses deterministic guardrails for identity,
  schemas, caps, redaction, source authority, provenance, cooldowns, dedupe,
  persistence, and derived materialization; those are required safety controls,
  not the target of the candidate-review cleanup
- the model-owned judgment boundary now applies to all remaining planner work:
  deterministic code may trigger review by structural cadence and enforce
  lifecycle/safety/provenance gates, but it must not decide semantic
  usefulness, skill-worthiness, plan value, promotion, retirement, or visible
  copy from keywords, scores, title similarity, or telemetry
- hybrid retrieval and context-pack assembly may use deterministic lexical
  search, recency, graph/projection cues, and source-authority signals to
  assemble candidate memories from the database; those signals are recall
  mechanics, not final semantic value judgment
- deterministic code that decides semantic meaning, usefulness, classification,
  final ranking, or surfacing without a model must be inventoried by an
  explicit deterministic-judgment audit before being trusted as candidate
  authority
- remaining deterministic judgment findings are removal debt, not compatibility
  debt. They must be deleted, narrowed to structural/guardrail behavior, or
  moved to bounded model-owned review; keeping them live behind renamed helpers
  or fallback paths is forbidden.
- candidate-review quality must be validated against a golden corpus of
  OpenClaw and Codex episodes before a live gateway rebuild; the live UI proof
  should confirm wiring only after packet assembly, model proposal validation,
  and card presentation pass local function tests
- false negatives must be attributed to the failing seam: packet too thin,
  model missed the expected candidate, post-model validation suppressed it,
  unexpected candidate, or no-candidate expected
- maintenance mechanics are owned by
  [Memory Maintenance Loop](/projects/model-memory/specs/memory-maintenance-loop)

## Objective

Add a bounded planner that makes the memory system proactive in a controlled
way.

The proactive planner should notice when the system ought to:

- refresh a project or subject capsule
- rebuild a projection
- warm a retrieval or capsule cache
- surface contradictions or stale knowledge
- propose a skill or tool candidate
- propose a workflow candidate
- queue operator-visible review items
- ask a reverse prompt that would unlock useful proactive work
- reopen a stale or aging outcome
- prepare a bounded delight/surprise candidate
- prepare a self-healing diagnosis or repair packet

It must not become an unsandboxed autonomous actor.

## Core rule

The proactive planner may propose or refresh derived artifacts.

It must not silently promote durable behavior changes.

## Why this exists

The current memory system is mainly reactive:

- user asks
- retrieval runs
- context is assembled
- memory writes land

Phase 2 should add limited proactive behavior so the system can prepare useful
artifacts and surface reviewable opportunities before the user needs them.

## Allowed automatic actions

The first-pass planner may automatically do only reversible, derived work.

Allowed automatic actions:

- mark capsules dirty
- rebuild capsules
- rebuild projections
- warm caches
- queue retrieval warmups
- produce operator-facing candidate review items
- produce planner audit records

These are derived-state maintenance actions, not policy changes.

Heartbeat-driven planner ticks may run these actions without manual review when
the action is reversible, derived-only, and does not mutate MMV2 durable truth.

## Review-gated actions

The planner may propose but must not auto-promote:

- new hard runtime rules
- new durable user or project policies
- medium-risk or high-risk skill promotion
- broad skill auto-promotion beyond the approved low-risk lifecycle policy
- tool promotion
- workflow promotion into a standing automation
- third-party skill install
- prompt mutation
- new privileged automation lanes

Semantic promotion or self-improvement proposals are also review-gated unless a
later low-risk autonomy policy explicitly allows the exact scope after evals,
resolver checks, package E2E, canary, rollback, and destination-authority gates
pass.

## Surfacing contract

Review cannot live in a hidden queue only.

Any candidate improvement requiring review must surface inside the normal
OpenClaw operating workflow.

Required surfaces:

- relevant turn when the candidate materially overlaps the active work
- heartbeat if pending review exists
- daily operator reporting

Heartbeat is the first-class proactive surface. It should not be a passive
`HEARTBEAT_OK` loop when planner work exists. It should compactly surface:

- skill candidates
- tool candidates
- workflow candidates
- stale capsule or projection repairs
- repeated retrieval misses
- blocked privacy or injection findings
- dirty graph/capsule/projection state
- overnight ingest or maintenance opportunities

Heartbeat / Daily Operator Review should ask:

- “What would help this user today?”

and answer with top ranked work opportunities, not generic notification text.
The primary heartbeat card should show the concrete plan title, why now,
proposed next step, expected user value, evidence summary, confidence or
limitation, and provenance disclosure. It must not be hidden only inside an
operator diagnostics accordion.

Primary cards should keep one concise next-step line. Supporting detail may be
expanded, but `Suggested action` and `Proposed next step` should not both be
prominent when they restate the same planning handoff.

Primary user-facing fields must be cleaned before surfacing:

- no system prompt scaffolding
- no sender metadata JSON
- no timestamps or compaction/control-plane preambles
- no inline `Source: chat://...` prose

If a candidate cannot produce clean user-facing copy after bounded
normalization and model-authored brief generation, it must be suppressed from
primary actionable surfaces. Deterministic normalized copy must not be shown as
the primary card title, purpose, or next step.

Heartbeat may use hidden structured context to produce the visible review. The
structured context may contain top opportunities, reverse prompts, stale
outcomes, delight candidates, self-healing candidates, draft-ready signals,
and bounded provenance. The visible response must stay user-facing and must not
show timestamps, raw source refs, or system text in the primary body.

Optional later surfaces:

- dedicated operator-review artifact pack
- explicit review inbox or admin surface

Same-session assistant-derived planner opportunities must also collapse
deterministically when newer bounded variants supersede older wording for the
same active thread of work. Heartbeat, inbox, and inline surfacing should show
the newest canonical item, not a historical tail of near-duplicates.

## Ambient operating loop

The planner is now part of an ambient operating loop rather than a
queue-first-only system.

Required behaviors:

- reverse prompting from live work, recurring patterns, unresolved decisions,
  and active roadmap/workstream state
- persistent growth loops for curiosity, repeated patterns, outcomes, delight,
  and self-healing
- bounded working-state capture before compaction-risk boundaries
- bounded autonomous internal maintenance work in isolated/background paths
- self-healing diagnosis and repair plan generation for repeated proactivity
  failures

These behaviors may automatically create internal planning, investigation,
follow-up, continuity, and repair artifacts. They must not send externally,
edit files, or execute actions without approval.

## Work opportunity model

Proactive planner candidates are work opportunities by default. They become
message candidates only when the next useful action is truly to send a message.

Work item kinds:

- `planning_request`
- `investigation_request`
- `draft_next_steps`
- `execution_candidate`
- `message_candidate`
- `reminder`
- `diagnostic`

Primary actions:

- `Plan this`
- `Investigate`
- `Draft next steps`
- `Start scoped task`
- `Open in current chat`
- `Add to Daily Review`
- `Send message` only for `message_candidate`
- `Snooze`
- `Dismiss`

Outcome states:

- `not_started`
- `planning_started`
- `planned`
- `investigating`
- `drafted`
- `execution_proposed`
- `executing_after_approval`
- `done`
- `dismissed`
- `snoozed`
- `blocked`
- `reopened`

Planning, investigation, drafting, and scoped-task actions should hand off
bounded context into the current chat as a normal user-visible agent turn. They
must not use `chat.inject`, send external messages, or execute actions merely
because the proactive item surfaced.

`Plan this` is a pure handoff action, not a send-like action. Once planning
starts, the item should move out of the primary actionable backlog and into a
planned/history state unless explicitly reopened.

## Three surfacing lanes

Planner outputs should use three surfacing lanes.

### `must_surface`

This always appears in:

- heartbeat
- daily operator review

and may also appear in-turn if contextually relevant.

Examples:

- pending skill or tool candidate awaiting approval
- repeated contradiction on an active project
- stale capsule on a heavily used project
- candidate blocked by missing approval
- repeated retrieval failure on a high-use target

### `context_surface`

This appears in-turn only when the current session overlaps the candidate
strongly enough.

Examples:

- current turn is about the same project
- current turn is about the same tool, skill, or workflow lane
- current run touched the same docs or artifacts
- current agent role overlaps the candidate scope

### `background_only`

This stays out of the turn but can still appear in heartbeat or daily summaries
if it remains pending.

## Relevance and urgency

The planner should compute relevance and urgency separately.

### Relevance inputs

- current project id
- current subject cluster
- current workflow or tool lane
- current agent role
- recent touched artifacts

### Urgency inputs

- severity or risk
- recurrence count
- age since first detection
- whether it blocks an active lane
- whether the operator explicitly asked for the capability

### Default routing

- high urgency -> `must_surface`
- moderate urgency plus high overlap -> `context_surface`
- everything else -> `background_only`

The purpose of this split is to avoid the failure mode where an over-strict
relevance filter causes nothing important to surface.

## Trigger types

Suggested planner triggers:

- after document-ingest batches
- after prompt-turn ingestion batches
- after daily summary ingestion
- after projection rebuilds
- on heartbeat cadence
- on daily operator-review cadence
- when repeated retrieval misses or low-quality retrieval events occur
- when duplicate contradictions or unresolved supports cluster on one target

## Candidate classes

Suggested candidate classes:

- `capsule_refresh`
- `projection_refresh`
- `cache_refresh`
- `retrieval_warmup`
- `contradiction_review`
- `skill_candidate`
- `tool_candidate`
- `workflow_candidate`
- `policy_candidate`
- `source_authority_review`
- `soft_source_consolidation`

These are planner artifacts, not canonical memories.

## Planner inputs

The planner should consume:

- canonical memory objects
- graph runtime state
- capsules
- retrieval traces
- cache and usage ledger
- projection versions
- duplicate and contradiction signals
- operator artifacts
- runtime inventories

## Planner outputs

The planner should emit bounded structured outputs with:

- candidate id
- candidate type
- affected target and scope
- rationale codes
- supporting evidence references
- urgency
- relevance descriptors
- recommended action
- review requirement
- surfacing lane
- target surfacing channels

The planner must not emit freeform hidden instructions that later stages treat
as authority.

## Relationship to ingestion

The planner does not replace ingestion.

It operates after ingestion and after derived rebuild signals.

The planner is a control layer for maintenance and improvement opportunities,
not a second semantic write path.

## Relationship to skill and tool synthesis

The planner should be the orchestrator that notices repeated success patterns
and surfaces them as candidate skill or tool synthesis opportunities.

It should not directly compile and install those skills by itself.

Skill, tool, and workflow opportunities should be surfaced proactively rather
than waiting for the operator to ask for them. The default channel is heartbeat
for persistent candidates, with turn-level surfacing when the candidate is
directly relevant to the current work.

The planner must prove usefulness before rollout scaffolding. A capability is
not ready merely because it can safely surface an artifact. It must prove that a
real live work signal creates a useful output. For proactivity, that means a
real ordinary-turn capture, session/runtime event, task or queue state,
maintenance-loop output, project-state capsule, derived memory artifact,
operator feedback event, or gateway delivery/error event produces a concrete
work item without manual proof-fixture seeding.

Static bundled/default/doc-derived candidates are diagnostics and fallback
evidence only. They must not appear as primary actionable suggestions, inflate
primary counts, or occupy the heartbeat “What would help this user today?”
surface unless promoted by a live signal.

The same generator-first rule applies to Skills, tools, and workflows: prove
that real work inputs produce concrete useful candidate outputs before adding
default promotion, broad rollout controls, auto-installation scaffolding, or
extensive operator dashboards.

Every actionable live opportunity must include:

- specific title
- why-now explanation
- proposed next step
- expected user value
- evidence summary
- confidence and limitations
- source refs, source profile ids, authority tiers, content hashes, and proof
  hashes
- freshness/conflict labels
- no-dark-data status

## Privacy, trust, and prompt injection

Phase 2 should let the planner observe:

- visibility
- trust tier
- sensitivity
- egress policy

But first-pass planner behavior should treat these as cautionary signals, not
yet as strong routing authority except where the source is explicitly marked as
disallowed for model use.

The planner must never allow untrusted external text to directly become a
privileged action recommendation.

Untrusted inputs may influence planner candidates only after:

- structured extraction
- provenance binding
- trust classification
- bounded planner reasoning

Even then, the result is a reviewable candidate, not an automatic promotion.

## Non-goals

This spec does not authorize:

- autonomous system prompt rewriting
- autonomous installation of third-party skills
- autonomous enablement of tools or privileged automations
- planner-owned canonical writes
- invisible review queues

## Rollout

1. emit planner records only
2. surface pending review through heartbeat and operator review
3. make heartbeat a real planner tick with bounded derived maintenance and
   candidate surfacing
4. add in-turn `context_surface` behavior
5. enable reversible auto-refresh actions
6. add candidate classes one by one
7. only later consider stronger automation after proof and operator feedback
8. use the maintenance loop for event, heartbeat, and daily cadence

## Live-Usefulness Acceptance

Before proactivity exits the Phase 2 proactivity bucket, it must satisfy the
live-usefulness acceptance sequence:

- Live coverage: normal work seams emit typed signals with source refs and
  reason codes. Required seams include ordinary chat turns, task state changes,
  gateway errors, failed commands, repeated user friction, unresolved questions,
  session/workflow transitions, heartbeat events, maintenance output, and
  project-state capsules.
- Noise budget: thresholds, cooldowns, deterministic dedupe windows, recurrence
  limits, and bounded feedback metadata suppress low-value or repeated
  opportunities. Suppressed items produce why-not-shown diagnostics instead of
  primary UI noise.
- Handoff quality: `Plan this`, `Investigate`, and `Draft next steps` start
  bounded chat handoffs with goal, evidence, constraints, safety boundary, and
  expected output shape. These handoffs are not `chat.inject` sends and do not
  execute actions.
- Heartbeat reliability: the Daily Operator Review / Heartbeat surface is a
  primary place for “What would help this user today?” items, ranked by urgency,
  freshness, recurrence, expected value, active context match, feedback/noise
  state, and confidence.
- Acceptance gate: a bounded operator-visible report must decide whether to
  move to Skills, continue tuning, pause automation, or roll back based on live
  generation frequency, useful/actioned rate, low noise, heartbeat reliability,
  handoff quality, zero leakage, zero unsafe action execution, zero autonomous
  send expansion, and zero primary static fallback count.

## Generator-first reset

The next proactivity standard is generator-first usefulness, not queue polish.

- Assistant planning/output turns are a first-class proactive source when they
  contain bounded concrete next-step ideas.
- Proactivity is ledger-first: one canonical opportunity record drives inbox,
  heartbeat, contextual surfacing, handoff, history, and follow-up.
- Completion and supersession must retire obsolete items automatically using
  deterministic bounded evidence such as later assistant turns, user approval
  records, linked handoffs, roadmap/docs transitions, or explicit handled
  outcomes.
- Heartbeat is both a surfacing surface and a generator/follow-up loop. It may
  rank, reopen, and attach bounded draft-ready planning/investigation briefs for
  top opportunities.
- Autonomous internal drafting is allowed only for planning/investigation
  briefs. It must not edit files, execute actions, or send outbound messages.
- Recurring-pattern loops should detect repeated asks, repeated errors,
  repeated manual workarounds, and postponed decisions using typed bounded
  counters/windows rather than semantic-similarity truth.
- Static fallback/proof/doc defaults remain diagnostics-only. They do not count
  as primary useful proactive traffic.
- Future Skills and adjacent buckets must adopt the same rule: prove useful
  generation from real work before building broad rollout or control
  infrastructure.

## Live runtime source-of-truth rule

- Assistant-output-derived opportunities must come from authoritative session
  history/runtime capture first.
- UI callbacks may still eagerly refresh or annotate the surface, but they are
  not allowed to be the only path that makes a same-session opportunity exist.
- Authoritative transcript sync must persist only substantive assistant final
  answers for assistant-output-derived opportunities.
- Operational assistant messages such as turn-activity and memory-activity are
  not proactivity assistant-turn sources.
- Placeholder fallback summaries must not replace real assistant final answers.
- Explicit `final_answer` phased text is preferred whenever available.
- Heartbeat and inline chat follow-ups must derive from the same canonical
  persisted bounded opportunity state as inbox and handoff surfaces.

## Deterministic vs model-owned judgment boundary

- Deterministic planner code may enforce event cadence, cooldowns, budgets,
  ids, refs, provenance, safety policy, redaction, exact structural dedupe, and
  persistence boundaries.
- Deterministic planner code must not decide opportunity usefulness, semantic
  relevance, candidate class, repeatability, visible title/purpose/next-step
  copy, or whether a work item is worth surfacing.
- Hybrid retrieval recall is allowed to use lexical, recency,
  graph/projection, source-lineage, vector, and structural filters to assemble
  candidate evidence. That recall stage is not the final value judgment.
- Final plan/candidate selection from assembled context must be model-owned or
  operator-owned. If a model-owned judgment is unavailable or invalid, the item
  is demoted/blocked rather than surfaced with deterministic prose.

## MMV2 Capture Inputs For Planner Evidence

- Planner and proactivity review may consume MMV2 outputs from OpenClaw,
  document, daily summary, and Codex capture lanes, but those outputs remain
  evidence until a model-owned proactivity/skill review proposes an item.
- Codex regular capture is gated and disabled by default. When enabled, it
  uses contiguous/source-structural session windows, document-style windowing
  for long prompts, and MMV2 source authority rather than proactivity-specific
  snippet selection.
- Daily summary files are document-like sources if they are wired into MMV2
  capture; otherwise they remain startup context only and must not silently
  write durable memories.
- Retrieval recall may assemble candidates deterministically, but final
  context-pack inclusion for planner context is model-owned after recall.

## Related specs

- [Planner Review Artifacts And Surfacing](/projects/model-memory/specs/planner-review-artifacts-and-surfacing)
- [Skill And Tool Synthesis](/projects/model-memory/specs/skill-and-tool-synthesis)
- [Cache And Projection Policy](/projects/model-memory/specs/cache-and-projection-policy)
