---
summary: "Execution order, dependency map, and rollout gates for the reviewed model-memory Phase 2 architecture."
title: "Phase 2 Execution Roadmap"
---

# Phase 2 Execution Roadmap

This roadmap turns the approved Phase 2 conceptual spec pack into an executable
sequence.

Phase 2 implementation is authorized as of the green 2026-04-24 entry
validation pack. The historical pre-Phase-2 gate record remains in
[Pre-Phase-2 Gate Ledger](/projects/model-memory/pre-phase-2-gate-ledger).

It is intentionally ordered. The goal is not to implement every concept in
parallel. The goal is to land the next memory/runtime architecture in slices
that can be validated, rolled back, and reviewed without losing operational
clarity.

## Current design posture

Phase 2 currently assumes:

- the deterministic-judgment pruning boundary is a standing architecture rule
  for every remaining Phase 2 wave. The canonical policy lives in
  [Phase 2 Model-Owned Judgment Policy](/projects/model-memory/specs/phase-2-model-owned-judgment-policy):
  deterministic code owns structure, safety, provenance, caps, packet/window
  assembly, hybrid recall, lifecycle, and post-model validation; models or
  operators own meaning, semantic admission, graph semantic identity, capsule
  inclusion, context inclusion, skill/proactivity classification, surfacing
  value, visible copy, and usage-based self-improvement decisions
- `kind` becomes the primary semantic axis
- `canonicalClass` becomes secondary or derived
- the first capsule flavor is `project_state`
- projections and capsules stay separate product families:
  - projections are workspace/bootstrap/read-model artifacts
  - capsules are generation/context artifacts
  - shared derived-artifact mechanics should live in one common core
- `project_page` projection must not remain a second independent
  project-state compiler; it is demoted to operator/report projection or later
  becomes a thin renderer over a fresh `project_state` capsule
- planner surfacing uses:
  - `must_surface`
  - `context_surface`
  - `background_only`
- third-party skill/tool recommendations resolve to:
  - `install`
  - `inspire`
  - `reject`
- privacy and prompt-injection metadata are specified in Phase 2 now, but
  stronger enforcement lands in a second pass after the base graph and capsule
  system is proven
- soft-source ingestion is allowed only with explicit provenance, source
  profile id, source authority tier, and safety classification
- the Memory Maintenance Loop owns event, heartbeat, and daily cadence for
  derived consolidation, stale artifact handling, candidate surfacing, and
  maintenance reports
- user-visible Phase 2 behavior should ship shadow-first and become default
  only after benchmark, eval, no-dark-data, and trace artifacts are green
- same-session assistant-derived opportunities must collapse deterministically
  when they represent the same active thread of work, so heartbeat, inbox, and
  inline cards remain ambient instead of replaying session history
- primary user-facing proactivity fields must strip system/control-plane text,
  sender metadata, timestamps, and raw source refs; provenance remains a
  secondary disclosure layer
- live usefulness and readability of surfaced proactivity remain the acceptance
  gate after authoritative capture correctness
- the next proactivity phase is an operating-loop leap: reverse prompting,
  persistent growth loops, compaction continuity, bounded background
  maintenance, and self-healing become primary product behaviors
- Phase 2 graph work includes an explicit model-owned semantic enrichment
  slice: topic/entity/subject/workflow/pattern nodes and semantic relationship
  edges are proposed and adjudicated by a bounded model path, while
  deterministic graph code remains limited to structural edges, provenance,
  schema validation, lifecycle, caps, and source authority
- canonical daily memory remains `memory/YYYY-MM-DD.md`; same-day daily memory
  evidence artifacts are fallback evidence only, and an end-of-day finalizer
  must restore the canonical note only from exact same-day durable evidence
- the proactivity bucket cannot be considered clean enough to move on unless a
  live `agent:main:main` gate verifies same-session item creation, inline
  surfacing, inbox, heartbeat, and handoff share one canonical id without
  duplicate pile-up or prompt/plumbing text in the visible heartbeat body
- the Skills bucket begins with a docs/spec milestone that makes the skills
  platform proactivity-integrated, cross-runtime, partially autonomous, and
  rollback-safe before runtime implementation starts
- the first skills runtime slice is a persisted `skill_candidate` ledger inside
  the existing proactivity state path; it must reuse canonical inline,
  heartbeat, inbox, and handoff surfaces instead of creating a second skills
  queue
- the next skills runtime slice is a Skillifier MVP draft path that consumes a
  canonical `skill_candidate`, writes only to allowed workspace-local draft
  targets, and surfaces draft-ready state through the same proactivity ids and
  surfaces
- the first pre-Milestone-4 skills repair adds a `UserFacingProactivityBrief`
  presentation boundary so chat cards, inbox rows, heartbeat context, and
  handoff copy no longer render raw ledger packets as primary user-facing text
- why-now, evidence, provenance, source refs, ids, timestamps, limitations, and
  diagnostics move behind disclosure; malformed reverse prompts and noisy skill
  transformation titles are rewritten or demoted before eval work begins
- the second pre-Milestone-4 skills repair adds a bounded model-authored
  `UserFacingProactivityBrief` rewrite/evaluation step using the separate
  `openai-codex/gpt-5.4` proactivity-presentation route with medium reasoning
  by default; deterministic validators still run after model output and
  unclear, generic, repetitive, or unsafe cards are demoted rather than surfaced
- the next pre-Milestone-4 repair shifts subjective candidate discovery from
  frequent atomic extraction to infrequent high-context model review
- review cadence is heartbeat/operator briefing, every 3 assistant finals by
  default, session/compaction boundary, and a future manual review hook
- live candidate review may inspect larger capped `episodeTurns`, including
  assistant finals and Codex session summaries, while durable artifacts persist
  only sanitized packet content, refs, hashes, classifications, validation
  results, route summaries, and proposal summaries
- candidate review returns 0-3 high-impact proposals and prefers no candidate
  over marginal cleanup
- deterministic code remains required for memory guardrails, but deterministic
  semantic judgment across the memory stack must be audited when it decides
  meaning, usefulness, classification, ranking, or surfacing without a model
- the next pre-Milestone-4 debt pass removes remaining deterministic
  semantic/value-judgment paths rather than preserving them behind renamed
  compatibility helpers; strict audit passing is required, but review must also
  confirm the old behavior is not still live elsewhere
- the follow-on pre-Milestone-4 repair validates that removed deterministic
  behavior has model-owned replacements across capture routing, extraction,
  admission, reconciliation, collision adjudication, source ingestion, and
  retrieval final inclusion
- memory-candidate source inventory is mandatory: ordinary turns, assistant
  finals, document ingestion, MMV2 shadow ingestion, proof/tool-result capture,
  deep ingestion, recovery/maintenance loops, live shadow adapters, Codex
  session activity, and heartbeat/system events must each declare authority
  tier, route, write eligibility, artifact behavior, and unavailable-model
  behavior; the current inventory lives in
  [Memory Candidate Source Inventory](/projects/model-memory/specs/memory-candidate-source-inventory)
- OpenClaw and Codex capture packets use contiguous, source/recency/ref-bounded
  windows with minimal safety redaction; deterministic code must not prune
  packets for interestingness, relevance, or memory-worthiness before the model
  reviews them
- routed schema/code-like text reaches the model-owned capture step; any
  schema/code-heavy rejection happens as post-model schema/ref/evidence/safety
  validation rather than pre-model memory-worthiness filtering
- memory capture and retrieval model-owned lanes default to
  `openai-codex/gpt-5.4-mini`; skills/proactivity candidate review defaults to
  `openai-codex/gpt-5.4`; default chat and model-authored presentation routes
  remain isolated
- deterministic hybrid retrieval recall and pack assembly remain valid
  candidate-gathering mechanics, but final context-pack/capsule/context
  injection inclusion is model-owned
- when required model output is missing or invalid after bounded repair, the
  result is pending review, quarantine, or blocked; deterministic fallback
  memory creation, supersession, collision resolution, or card copy must not
  return
- candidate-review quality now has a local golden-corpus validation gate that
  runs before live gateway rebuilds; it attributes misses to packet assembly,
  model review, post-model validation/dedupe, unexpected candidate surfacing,
  or no-candidate expectations
- low-risk limited-scope skill automation may later be allowed after
  tests/vetting/canary, but medium-risk and high-risk skill changes remain
  approval-gated
- the remaining skills bucket must meet
  [Skill Quality Parity Gates](/projects/skills-system/specs/skill-quality-parity-gates)
  before claiming parity with Gbrain/Hermes-class skill systems: skill eval
  generation/execution, resolver/trigger tests, check-resolvable-style
  reachability and overlap checks, package E2E, install/canary/rollback,
  usage-based self-improvement, approval-gated promotion, and cross-runtime
  install
- proactivity, skills, tool improvements, user-review tasks, and future
  agent-assigned work converge on a canonical `Work Queue` UX rather than
  chat-only cards. The product brief lives in
  [Proactivity And Skills UX Product Brief](/projects/model-memory/specs/proactivity-and-skills-ux-product-brief):
  chat and heartbeat are lightweight surfacing surfaces; object detail owns
  durable plans, skill drafts, revisions, evidence, finalized artifacts, and
  Codex-ready prompts; prioritization is model-owned through intrinsic priority
  and local placement passes over bounded structurally recalled neighbors
- the Work Queue information architecture lives in
  [Work Queue Information Architecture](/projects/model-memory/specs/work-queue-information-architecture):
  `Work Queue` is top-level navigation, default view is active prioritized work
  grouped by lane, desktop uses split-pane list/detail, chat/heartbeat route
  into stable object detail, artifacts and Codex prompts live in detail, and
  diagnostics/dismissed items are hidden from normal workflow by default
- the Work Queue interaction model lives in
  [Work Queue Interaction And Lifecycle State Model](/projects/model-memory/specs/work-queue-interaction-lifecycle-state-model):
  shared visible states stay small (`new`, `drafting`, `drafted`,
  `needs_revision`, `finalized`, `dismissed`, `superseded`, `failed`);
  finalized means ready for manual execution, not done; user-initiated failures
  remain attached to visible objects; artifact revisions are versioned; and
  manual completion retires finalized objects after external Codex execution
- the first buildable UX slice is defined in
  [Work Queue UX Implementation Plan](/projects/model-memory/specs/work-queue-ux-implementation-plan):
  add the top-level route, current-state adapter, active prioritized list,
  split-pane object detail, versioned artifacts, finalized Codex prompt copy,
  manual completion, hidden diagnostics, and chat/heartbeat links before
  broader autonomous execution or Skills Studio work

Before the larger graph/capsule waves proceed, the project treated the
Memory Retrieval Runtime, MMV2 capture coverage, closed-loop operational
safety, and provider/evaluation stability as the immediate readiness substrate.

Packet compiler quality and kind balance remain important, but they no longer
override the post-storage-cutover need to fix recall/retrieval/projections
first.

## Pre-Phase-2 Continuation

This continuation is retained as the historical readiness checklist that had to
finish before graph/capsule/planner implementation became the active
engineering lane.

1. Memory Retrieval Runtime:
   - implement the replacement architecture in
     [Memory Retrieval Runtime](/projects/model-memory/specs/memory-retrieval-runtime)
   - introduce `RetrievalPlan`, `RetrievalCandidate`, `MemoryPack`,
     `ProjectionDigest`, and `RetrievalRun`
   - use existing `runtime_context` retrieval/context/projection storage in
     the first pass; do not add DB migrations for the initial runtime slice
   - require direct retrieval telemetry for fresh-session recall
   - treat projection-backed recall as valid only when retrieval-selected,
     fresh, and backed by active MMV2 `source_memory_ids`
2. Clean MMV2-active retrieval soak:
   - prove durable preference, directive, project fact, and
     correction/supersession capture
   - prove temp/privacy prompts do not create active durable memory
   - prove fresh-session recall through retrieval telemetry rather than
     same-session transcript or workspace-file-only context
   - keep Memory Ops observe/report-only with auto-fix disabled
3. Soak-window compatibility quarantine/removal plan:
   - keep legacy compatibility fallback-only during soak
   - remove or further quarantine fallback code after soak
   - verify no active live writer or reader depends on legacy-shaped objects as
     its primary contract
4. Ordinary-turn MMV2 evaluation coverage:
   - build ordinary-turn proof coverage against the live MMV2 path
   - cover user preferences, durable directives, project facts, corrections,
     and session-only rejects
5. File-pack/provider variance stabilization:
   - keep seeded file-pack runs honest
   - report provider-output drift explicitly
   - distinguish deterministic regression from model/provider variance
6. Primary capture seam expansion:
   - implement the verified seams from
     [Memory Capture Seams](/projects/model-memory/specs/memory-capture-seams)
   - start with `message:preprocessed` and ContextEngine user-message catchall
   - add tool-result and outcome seams only with hook-health checks
7. `memory-ops-closed-loop` instrumentation:
   - implement the closed-loop spec in
     [Memory Ops Closed Loop](/projects/model-memory/specs/memory-ops-closed-loop)
   - enforce the no-dark-data rule
   - keep auto-fix disabled by default

Only after those seven items are validated should implementation proceed to the
Phase 2 derived-feature waves below.

## Execution order

### Wave 0: substrate and contract cleanup

Goal:

- remove avoidable ambiguity before new memory object types and runtime surfaces
  are added

Includes:

- Memory Retrieval Runtime
- clean MMV2-active retrieval soak
- post-soak fallback compatibility removal after that soak
- ordinary-turn MMV2 evaluation coverage
- file-pack/provider variance stabilization
- primary capture seam expansion
- closed-loop memory ops instrumentation
- shared packet compiler and budgeting rails
- `MEMORY.md` proof lane generalized into packet-family policy
- retrieval-pack budgeting and shaping contract
- projection-digest contract and source weighting
- deep ingest stabilization and substrate population
- `kind`-primary schema review
- prompt-contract review for ingestion and capture prompts
- missing `rule` generation investigation and kind-balance repair
- runbook/runtime alignment for long-running ingest and runtime rebuild

Validation gate:

- active live writers and readers have no normal-path dependence on
  legacy-shaped objects
- fresh-session recall records direct retrieval telemetry
- selected packs/projections cite active MMV2 source memory ids
- superseded/conflicted memories are excluded by default or rendered only in
  conflict packs
- ordinary-turn MMV2 proof coverage exists
- file-pack variance is classified and reported honestly
- capture seam hooks have health checks and fallback behavior
- memory-ops signals persist only with automated consumers
- deep ingest completes or advances cleanly
- checkpoint contract is truthful under failure and resume
- no known runtime rebuild race remains

### Wave 0A: soft-source authority and maintenance substrate

Goal:

- lock source authority, soft-source ingestion, maintenance cadence, and review
  artifact contracts before graph/capsule behavior depends on them

Includes:

- soft-source ingestion and authority
- Memory Maintenance Loop
- authority tier and source profile metadata propagation
- maintenance candidate lifecycle: 30 days active, 90 days archived, with
  pinning allowed
- redacted safety finding retention: 90 days by default
- hard rejects for secrets, raw prompts, full transcripts, raw tool logs, and
  private phrases
- no-op or shadow-mode report generation before any derived write/surfacing
  behavior changes live answers

Validation gate:

- all soft-source candidates carry authority tier, source profile id,
  provenance, and safety classification
- lower-authority source material is visible only in research/reference,
  project-state, or conflict artifacts unless explicitly approved
- `inspection_only` material is excluded from ordinary retrieval, projections,
  capsules, graph expansion, planner recommendations, skill synthesis, and tool
  synthesis
- no raw prompts, full transcripts, raw tool logs, secrets, or private phrases
  are persisted in candidate, report, or telemetry output
- maintenance reports provide actionable deltas without mutating MMV2 durable
  truth

### Wave 1: graph substrate

Goal:

- add the derived graph runtime without changing user-facing behavior too early

Includes:

- graph-derived runtime model
- graph schema and runtime dependencies
- edge types, invalidation rules, and graph build rules
- first read/query seams for graph-backed retrieval support

Validation gate:

- graph build is deterministic on a fixed corpus
- graph rebuild does not churn unrelated runtime artifacts
- graph layer can be enabled without changing answer behavior by default

### Wave 1B: model-owned semantic graph enrichment

Goal:

- make topic, entity, subject, workflow, pattern, and semantic relationship
  nodes explicit without letting deterministic code infer meaning as truth

Includes:

- bounded model route for semantic graph proposal over admitted MMV2 memories,
  source windows, and existing graph/projection context
- model-owned node extraction for topics, subjects, entities, workflows,
  procedures, skills, tools, projects, and recurring patterns
- model-owned edge proposal/adjudication for relationships such as `mentions`,
  `same_entity_as`, `supports`, `depends_on`, `used_in_workflow`, `uses_skill`,
  `refines`, `summarizes`, and topic/pattern membership
- evidence-bound graph proposal artifacts with refs, hashes, source authority,
  lifecycle state, confidence/pending state, and provenance
- deterministic validation for schema, allowed node/edge types, exact refs,
  evidence quote anchoring, caps, safety, lifecycle eligibility, and source
  authority only
- pending/quarantine/blocked behavior for unavailable, ambiguous, conflicting,
  or ungrounded model graph output
- graph recall integration that uses validated semantic graph nodes/edges as
  candidate signals while leaving final context inclusion model-owned

Validation gate:

- a fixed corpus produces stable graph proposal artifacts from the model-owned
  route or explicitly pending outcomes when the model is unavailable
- deterministic code cannot create topical sameness, same-entity truth, pattern
  membership, or semantic relationship edges without model/human adjudication
- every promoted semantic graph edge cites admitted memories or bounded source
  windows
- graph recall can find memories that share a model-adjudicated topic/entity
  such as an "agent delegation" pattern without relying on keyword clustering
  as semantic truth
- retrieval traces distinguish structural graph recall, model-owned semantic
  graph recall, and model-owned final context inclusion
- capsules that consume semantic graph edges cite source memory ids and graph
  proposal artifacts rather than treating graph output as canonical memory
  truth

### Wave 2: first capsule system

Goal:

- compile denser, operator-verifiable memory artifacts from the graph and
  canonical memory objects
- establish the shared derived-artifact core before projection/capsule overlap
  grows

Includes:

- derived artifact core
- subject capsules and dense ingestion
- first `project_state` capsule schema
- provenance and authority rules for capsule compilation
- capsule storage/runtime exposure
- projection/capsule role separation
- `project_page` demotion or thin-renderer path so `project_state` owns rich
  project-state generation/context compilation

Validation gate:

- at least one `project_state` capsule compiles deterministically from the live
  corpus
- capsule provenance is inspectable
- projection and capsule artifacts use shared provenance, freshness,
  lifecycle, authority, and safe materialization helpers where practical
- `project_page` does not independently duplicate project-state section
  derivation when a `project_state` capsule is available
- capsule output improves retrieval/context grounding for project-state prompts

### Wave 3: retrieval and context integration

Goal:

- make graph and capsule outputs useful to the active context engine
- prove the retrieval/capture surfaces together before planner or proactive
  behavior depends on them

Includes:

- hierarchical retrieval updates
- capsule-aware retrieval packaging
- context engine selection changes
- projection updates needed to expose capsule or graph signal
- a retrieval integration/proof harness that can invoke object retrieval,
  projection digests, capsule shadow, gated capsule context, and hierarchical
  shadow in one structured trace without promoting defaults
- a comprehensive Phase 2 integration eval and no-dark-data proof slice before
  planner surfacing, covering structured capture/retrieval prompts and
  non-user-prompt ingestion sources:
  - curated docs, repo docs, and manual notes
  - tool-result capture
  - researcher report artifacts
  - cited assistant answers
  - daily continuity
  - raw prompt, transcript, and tool-log rejection or `inspection_only`
  - secret and private phrase hard reject
- a production rollout config seam after proof coverage is green, allowing
  graph reads, `project_state` capsule retrieval, capsule context, and later
  hierarchical retrieval to be enabled only through typed capability modes,
  proof prerequisites, no-dark-data status, and explicit operator/eval flags

Validation gate:

- retrieval traces show graph/capsule-aware evidence when appropriate
- context traces show improved grounding without unstable prompt churn
- repeated retrievals stay cache-stable
- the integration proof harness emits one structured runtime trace spanning
  object, projection, capsule, and hierarchical lanes
- comprehensive eval proves source profile id, authority tier, provenance,
  lifecycle exclusion, and no-dark-data behavior across capture and retrieval
- production rollout config resolves to disabled or shadow-only by default, and
  controlled production modes are rejected unless Slice 8, Slice 9, and UI
  proof prerequisites pass
- controlled production configuration is validated through a Tailscale-safe
  UI/operator proof before any default promotion is considered
- controlled production go-live requires a scoped validation report that
  selects approved proof artifacts, records capability-level rollout decisions,
  runs a production-like UI/operator regression, and states whether the result
  is `approved_for_scope`, `partial_approval`, or `blocked`
- scoped production rollout requires a typed profile that consumes the approved
  go-live artifact, matches only approved sessions/projects/operators, proves
  outside-scope default-off behavior, observes inside-scope graph/capsule/context
  behavior, and keeps hierarchical retrieval shadow-only
- default promotion for `runtime_graph_reads`, `project_state` capsule retrieval,
  and bounded `project_state` capsule context requires a separate proof-bound
  default-promotion decision that validates the go-live and scoped rollout
  artifacts by id/hash, emits rollback controls, proves ordinary-path behavior
  through the UI/operator harness, and leaves hierarchical retrieval shadow-only
- controlled hierarchical retrieval may become live only for explicit
  operator/eval scope after a Tailscale-safe proof shows bounded fan-out,
  deterministic merge/dedupe, provenance preservation, rollback, and
  outside-scope shadow-only behavior
- no planner/proactive surfacing starts until the comprehensive eval/no-dark-data
  proof is green

### Wave 4: planner surfacing

Goal:

- let memory-derived planning candidates appear in ordinary operator workflows

Includes:

- proactive memory planner
- planner review artifacts and surfacing
- `must_surface` / `context_surface` / `background_only` contract
- surfacing into turns, heartbeat, and operator-review lanes
- reverse prompting engine
- persistent growth-loop state
- compaction/danger-zone proactivity recovery
- bounded autonomous internal maintenance outputs
- self-healing diagnosis and repair proposals

Validation gate:

- candidates surface in real operator-visible channels
- no hidden review queue becomes the only review path
- urgency/relevance thresholds can be observed and tuned
- proactive work items use one canonical lifecycle state across inbox,
  heartbeat, contextual surfacing, and history
- planning/investigation/drafting CTAs use bounded chat handoff rather than
  send-like transcript injection
- history views derive from real state transitions, not synthetic placeholder
  rows
- reverse prompts, follow-up loops, and self-healing candidates appear from
  real runtime evidence in ordinary workflow
- compaction/reload preserves enough proactive continuity to rebuild useful
  heartbeat and chat surfaces
- bounded autonomous maintenance outputs remain internal-only and do not send,
  edit files, or execute actions

### Wave 5: skill and tool synthesis

Goal:

- turn repeated successful interactions into bounded candidate automation and
  then into properly skilled, reachable, evaled, E2E-tested, rollbackable
  packages when the skill lifecycle gates pass

Includes:

- skill-and-tool-synthesis
- skill/tool candidate evaluation
- ClawHub install vs inspire vs reject routing
- review artifact generation for self-improvement proposals
- model-owned skill/proactivity/tool classification from bounded work episodes
- skill eval generation and execution
- resolver and trigger tests
- check-resolvable-style reachability, overlap, gap, orphan, and integrity
  reporting
- package E2E for review-only drafts, canaries, and installed packages
- usage-based self-improvement loop: observe bounded use/failure/correction,
  model-review improvement or no-action, draft patch/eval/merge/demotion, run
  gates, and promote only through approved autonomy or operator approval

Validation gate:

- candidate generation does not silently install or mutate behavior
- review artifacts are actionable in ordinary OpenClaw workflow
- third-party skill vetting remains in the loop
- deterministic code does not decide skill-worthiness, skill-vs-plan
  classification, semantic usefulness, promotion, retirement, or
  self-improvement from keywords, scores, or telemetry
- every generated skill package has tier-appropriate evals, trigger/resolver
  fixtures, reachability/overlap health report, E2E evidence, provenance,
  canary/rollback metadata, and destination authority checks before promotion
- cross-runtime OpenClaw/Codex install remains approval-gated unless a later
  low-risk autonomy gate explicitly authorizes the exact scope

### Wave 6: cache and projection policy follow-through

Goal:

- make graph/capsule usage feed projection refresh and cache behavior in a
  measured way

Includes:

- cache and projection policy
- usage/cache ledger follow-through
- retrieval warmup or stable-prefix preservation updates
- projection refresh policy based on actual usage

Validation gate:

- cache/prefix stability is preserved or improved
- projection refresh cost stays bounded
- repeated related prompts reuse more stable context surfaces

### Wave 7: second-pass security enforcement

Goal:

- enforce the privacy and prompt-injection contracts already specified in the
  Phase 2 docs

Includes:

- privacy visibility enforcement
- prompt-injection hardening on external subject ingestion
- stronger controls on self-improvement action boundaries

Validation gate:

- enforcement does not collapse graph or capsule visibility unexpectedly
- protected subjects and artifacts behave predictably under retrieval and
  planning

## Dependency map

Hard dependencies:

- Wave 0 before everything else
- Wave 0A before graph/capsule/planner/self-improvement behavior uses
  soft-source or maintenance output
- Wave 1 before Wave 2
- Wave 1 before Wave 1B
- Wave 1B before graph-backed capsules or retrieval depend on semantic
  topic/entity/pattern relationships
- Wave 2 before Wave 3
- Wave 3 before Wave 4
- Wave 3 integration/proof harness before the comprehensive Phase 2 eval slice
- comprehensive Phase 2 eval/no-dark-data proof before Wave 4 planner surfacing
- Wave 4 before Wave 5
- Wave 5 skill parity gates before any claim that skills meet or exceed
  Gbrain/Hermes-class lifecycle capability
- Wave 3 before Wave 6
- Waves 1 through 6 before Wave 7 enforcement

Soft dependencies:

- prompt-contract migration can start in Wave 0 and continue into Wave 2
- cache/projection policy drafting can continue early, but live policy changes
  should wait until graph and capsule outputs exist

## Live rollout rules

For each implementation wave:

- land schema changes before planner/projection behaviors that depend on them
- keep feature flags or equivalent rollback seams when user-facing behavior can
  change materially
- run new user-visible behavior in shadow mode first unless the wave is purely
  internal instrumentation
- promote defaults only after benchmark, eval, no-dark-data, and trace artifacts
  are green
- production-capable Phase 2 retrieval/context behavior must pass through the
  typed rollout config seam; proof-green status alone is not permission to
  change defaults
- hierarchical retrieval default promotion requires its own ordinary-path
  proof artifact, bounded fan-out telemetry, and rollback validation even after
  controlled operator/eval proof passes
- promoted graph/capsule/context/hierarchical retrieval must also have
  production observability reports and rollback proof before later ingestion or
  planner work depends on it as live-operable behavior
- maintenance surfacing and non-user-prompt/soft-source ingestion may go live
  only as operator-visible paths with typed authority/provenance metadata and
  bounded no-dark-data reports; default ingestion promotion requires a separate
  source-profile-limited decision bound to operator ingestion proof and
  production observability proof
- planner/proactivity readiness must support approved project/docs/artifact
  evidence in addition to durable MMV2 memory, but readiness artifacts remain
  report-only until a later planner/proactivity promotion slice proves safe
  surfacing and action boundaries
- controlled planner candidate plans may be generated only for explicit
  operator/eval scope and must stay report-only with rollback proof before any
  default operator-visible promotion decision
- planner candidate reports may become default-visible to operators only after
  controlled-scope proof passes; this does not enable planner actions,
  proactive user-facing messages, or hidden normal-chat injection
- proactivity/action boundary work may classify report-only, suggestion-only,
  approval-required, and blocked outputs, but proactive user messages and action
  execution remain disabled until a future controlled rollout proves approval
  and rollback semantics
- controlled proactivity suggestions may be generated only inside explicit
  operator/eval scope; they remain operator-visible report artifacts with no
  user-facing proactive messages, hidden chat injection, or action execution
  until approval workflow and controlled execution slices prove the next gates
- staged action approval may review, approve, reject, and audit
  `approval_required_action` proposals, but approved proposals remain
  non-executing until a separate controlled execution proof is green
- controlled action execution may run only the bounded
  `write_bounded_proof_artifact` action kind inside explicit operator/eval
  scope after staged approval and explicit execution approval; unsafe action
  kinds, user-facing proactive messages, and broad autonomous execution remain
  blocked
- controlled action expansion may also run `create_operator_review_note` inside
  explicit operator/eval scope after staged approval and explicit execution
  approval; it remains artifact-only, operator-visible, rollbackable, and
  non-user-facing
- the approved harmless action execution workflow may be default-visible to
  ordinary operator surfaces after proof-bound promotion; execution remains
  staged-approval and explicit-execution-approval gated, and rollback returns it
  to controlled operator/eval-only visibility
- controlled user-facing proactivity starts with the low-risk
  `operator_approved_suggestion_available` message class as a bounded
  proof-delivery artifact only; broad/default proactive messaging remains off
  until a later promotion slice proves an actual safe notification seam
- live proactive message delivery may use the existing `chat.inject` gateway
  seam for `operator_approved_suggestion_available` only after controlled
  suggestion, staged approval, explicit send approval, provenance, no-dark-data,
  and rollback checks pass; broad/default proactive messaging and autonomous
  sending remain off
- the proactive message approval/send workflow may be default-visible to
  ordinary operator surfaces for `operator_approved_suggestion_available` after
  Slice 28 and Slice 29 proofs pass; each send still requires explicit send
  approval, and rollback returns the workflow to controlled operator/eval-only
  visibility
- controlled user-facing proactivity may expand to
  `operator_approved_follow_up_available` only in explicit operator/eval scope;
  the original suggestion-available class remains the only operator-default
  visible message class, while broad/default proactive messaging and autonomous
  sending remain off
- the expanded proactive message approval/send workflow may be default-visible
  to ordinary operator surfaces for `operator_approved_suggestion_available`
  and `operator_approved_follow_up_available` after Slice 30 and Slice 31
  proofs pass; each send still requires explicit send approval, and rollback
  returns the workflow to the single-message operator-default workflow
- proactive delivery must remain covered by operator-visible health reports and
  abuse regression checks before real-user scope expansion; health reports must
  include send approvals, delivery ids, source refs, source profiles, authority
  tiers, content/proof hashes, no-dark-data status, rollback state, latency,
  budget status, and deterministic blocked reason codes
- controlled real-user-facing proactive delivery may run only for an explicit
  selected live user/project/session/operator/recipient scope after expanded
  operator-default proof and healthy proactive delivery observability pass; both
  approved low-risk classes remain send-approval required, and broad/default
  proactive messaging remains off
- scoped real-user proactive delivery may expand only when Slice 34 delivery
  proof and Slice 33 observability are clean; degraded observability,
  authorization gaps, leakage, rollback bypass, stale/repeat regressions, or
  wildcard/global scopes block expansion
- controlled multi-user proactive delivery may run only for an explicit cohort
  of selected users/recipients/sessions/projects/operators after scope
  expansion is approved; each recipient still requires explicit send approval,
  and non-cohort recipients receive no proactive messages
- proactive default-promotion readiness is report-only and requires aggregated
  passing evidence from Slices 32-36, healthy observability, complete send
  approval coverage, blocked-class and outside-scope blocking, rollback proof,
  provenance, no-dark-data pass, no leakage alerts, and stale/repeat
  suppression before a separate default-promotion slice may decide anything
- user-facing proactive delivery may become default-eligible for approved users
  only after Slice 37 readiness is green; the two approved low-risk classes
  remain explicit-send-approval gated, and autonomous sending plus
  delivery-triggered action execution remain disabled
- autonomous-send readiness is a report-only boundary preflight: candidate
  classifications may be recorded, but automatic messages remain disabled,
  manual send remains required, urgency/external-instruction abuse is blocked,
  and rollback disables candidate generation
- product proactive surfacing must use normal OpenClaw UX, not proof scripts
  alone: approved suggestions enter a typed pending queue visible in chat/
  operator surfaces, expose why-they-appeared provenance, and can call
  `chat.inject` only after explicit `Approve & Send`; rollback returns this to
  proof/operator-only mode and autonomous sending remains disabled
- real-memory proactive candidate generation must feed the product queue from
  bounded, provenance-bearing signals for recent tasks, unresolved follow-ups,
  stale decisions, maintenance candidates, docs changes, project-state capsules,
  and runtime graph/retrieval observations; stale/repeat suppression is
  deterministic, external/project text remains evidence not instruction, and
  rollback returns the queue to approved-report-only surfacing
- approved proactive messages must render in product notification UX after
  explicit approval/send approval, with provenance/why-this-appeared details and
  dismiss/snooze controls; pending items must not notify, `chat.inject` remains
  available, rollback disables notification surfacing, and autonomous sending
  remains disabled
- personal default proactivity scope may be enabled only for an exact typed
  live user/recipient/project/session/operator set after product surfacing, real
  candidate generation, and notification UX proofs are green; wildcard scopes,
  degraded observability, missing provenance, no-dark-data failure, or missing
  send approval block activation, and rollback returns to operator-only/manual
  proof mode
- autonomous-send readiness after personal default scope is simulation-only:
  low-risk candidates may show what would have sent, but manual override remains
  mandatory, auto-approve remains disabled, future scoped auto-send remains
  review-only, abuse/stale/repeat/provenance/no-dark-data checks block
  candidates, and rollback disables readiness candidates
- auto-send simulation observability must be green before controlled auto-send:
  reports compare would-have-sent candidates with actual manual decisions,
  track usefulness/noise signals, and block or degrade on urgency, stale/repeat,
  provenance, source-profile, no-dark-data, leakage, and external-instruction
  regressions while automatic delivery remains off
- low-risk controlled auto-send may run only for the exact typed
  `controlled_auto_send_scope`, only after explicit opt-in and healthy Slice 45
  observability, and only for `operator_approved_suggestion_available`;
  follow-up messages and non-scoped sessions remain manual-only, rollback via
  `MODEL_MEMORY_PHASE2_LOW_RISK_AUTOSEND_DISABLED` disables all controlled
  auto-send, and delivery-triggered action execution remains disabled
- controlled auto-send must be covered by global kill-switch observability:
  `MODEL_MEMORY_PHASE2_AUTOSEND_DISABLED` stops all auto-send while preserving
  manual send, and health reports must expose attempts, deliveries, blocked
  reasons, exact scope ids, source/provenance hashes, no-dark-data status, and
  abuse-regression outcomes before larger rollout
- personal auto-send trial decisions must consume clean Slice 45 telemetry,
  successful Slice 46 controlled-scope proof, healthy Slice 47 kill-switch
  health, active personal default scope, explicit personal opt-in, and visible
  UX controls; only `operator_approved_suggestion_available` may auto-send,
  follow-up messages and non-personal scopes remain manual-only, and
  `MODEL_MEMORY_PHASE2_PERSONAL_AUTOSEND_TRIAL_DISABLED` returns the personal
  workspace to manual-send mode
- proactivity feedback is an explicit control-plane quality loop: UI feedback
  controls may record bounded metadata and reason codes for useful/not useful/
  repetitive/wrong-context/unsafe-private outcomes, feed deterministic
  suppression/ranking/reporting, and block unsafe/private future surfacing, but
  feedback must not write semantic truth, create memory corrections, persist raw
  free-form text, trigger delivery, or execute actions; rollback via
  `MODEL_MEMORY_PHASE2_PROACTIVITY_FEEDBACK_LOOP_DISABLED` preserves the product
  queue without feedback learning
- personal auto-send trial controls must appear in normal product UX before
  further rollout: the UX must show manual-only, controlled-trial, and
  kill-switch-disabled modes, expose only
  `operator_approved_suggestion_available` as auto-send eligible, keep
  `operator_approved_follow_up_available` manual-only, and provide a visible
  Disable / Return to Manual control that preserves manual send and action-free
  delivery behavior
- personal auto-send trial quality must be reviewed before continuation:
  Slice 51 aggregates Slice 45 simulation telemetry and Slice 49 feedback
  metadata, reports would-have-sent versus manual decisions, tracks false
  positives, repeats, stale candidates, unsafe/private flags, and wrong-context
  feedback, and blocks continuation on leakage, missing provenance/source
  profile, no-dark-data failure, action execution, or broad autonomous sending
- personal auto-send continuation is a separate capability decision: Slice 52
  may continue only on green quality, narrow or pause on degraded quality, and
  must rollback to manual-only on blocked quality, leakage/private flags,
  unhealthy kill-switch state, no-dark-data/provenance/source-profile failures,
  action execution, or broad autonomous sending; the allowed auto-send class
  remains `operator_approved_suggestion_available`, follow-up remains manual-only,
  and rollback preserves manual send
- follow-up auto-send is preflight/report-only in Slice 53:
  `operator_approved_follow_up_available` remains manual-send only, while future
  candidacy is blocked by stale/repeated nudges, wrong-context feedback, missing
  provenance/source profile, no-dark-data failure, urgency manipulation,
  external instruction escalation, rollback, semantic-truth writes, or any
  attempted follow-up auto-send
- proactive memory review is consolidated in Slice 54 with a normal product
  Proactivity Inbox: pending, sent, snoozed, dismissed, blocked, auto-send
  simulation, and feedback-backed items are grouped behind status filters with
  bounded why-this-appeared/provenance detail; rollback via
  `MODEL_MEMORY_PHASE2_PROACTIVITY_INBOX_DISABLED` disables only the inbox and
  preserves queue/notification surfaces, while broad autonomous sending and
  follow-up auto-send remain off. Proof artifact:
  `.artifacts/model-memory/phase2-proactivity-inbox-proof/20260426T225516284Z/2981e633-f6c7-5070-b335-4f6edcf27d23.phase2-proactivity-inbox.json`
- Slice 55 remediates the product UX before further capability expansion:
  proactive delivery is compact-visible through `Proactivity · N pending` in
  chat chrome, drawer-visible through the existing side panel, and no longer
  rendered as an always-open inbox rail or full panel inside `.chat-thread`.
  Actionable cards must show candidate summary, suggested action, safe message
  preview, expected value, why-this-appeared, Approve & Send, Dismiss, Snooze,
  and provenance disclosure. Rollback via
  `MODEL_MEMORY_PHASE2_PROACTIVITY_UX_REMEDIATION_DISABLED` hides the compact
  entry point while preserving manual send paths. Proof artifact target:
  `.artifacts/model-memory/phase2-proactivity-ux-remediation-proof/<timestamp>/`.
  Broad autonomous sending and delivery-triggered action execution remain off.
- Slice 56 requires real suggestion content before a candidate can be
  actionable: `messagePreview`, `suggestedAction`, `candidateSummary`, and
  `expectedUserValue` must be present, bounded, no-dark-data clean, and tied to
  provenance/source profile/authority/hash evidence. Generic placeholder-only
  candidates are blocked as non-actionable, and approval/send uses the exact
  safe preview text. Proof artifact target:
  `.artifacts/model-memory/phase2-real-suggestion-content-contract-proof/<timestamp>/`.
- Slice 57 adds contextual surfacing lanes: `must_surface`, `context_surface`,
  and `background_only`. Chat inline surfacing is compact and allowed only for
  exact typed active-context overlap; non-relevant, stale, repeated, dismissed,
  snoozed, or background-only candidates remain in the Proactivity Inbox/digest.
  Proof artifact target:
  `.artifacts/model-memory/phase2-contextual-proactivity-surfacing-proof/<timestamp>/`.
- Slice 58 integrates proactivity with the Daily Operator Review / Heartbeat
  loop. Pending `must_surface` items appear as bounded review work with the same
  candidate ids used by chat and inbox; lower-priority/background items are
  grouped as counts, and the direct action path opens the Proactivity Inbox
  detail/send surface. Proof artifact target:
  `.artifacts/model-memory/phase2-proactivity-daily-review-heartbeat-proof/<timestamp>/`.
- Slice 59's deterministic usefulness-tuning runtime was removed during the
  pre-Milestone-4 deterministic judgment debt pass. Explicit feedback remains
  control-plane metadata and safety/suppression evidence, but deterministic
  usefulness ranking is not a live compatibility path and must not be restored
  without a new decision record.
- The proactivity product-correctness remediation after Slice 59 fixes the
  broken user-facing experience before any more capability expansion. Approve &
  Send now resolves the same actionable item rendered in the inbox, sends the
  reviewed or edited `proposedMessage` through `chat.inject`, and shows
  success/failure plus View sent message state. The default inbox shows
  actionable suggestions only; sent/snoozed/dismissed items are history and
  auto-send simulations, blocked preflight, proof metadata, and why-not-shown
  records are diagnostics. Actionable suggestions require concrete
  `planTitle`, `problem`, `proposedMessage`, `userBenefit`, `evidenceSummary`,
  `confidence`, and `blockedIfMissing` fields; generic “suggestion available”
  placeholders are blocked from actionable UX. Active-context surfacing uses
  exact typed user/project/session/operator/task matching and emits diagnostics
  for mismatches. A concrete heartbeat/review loop asks “What would help this
  user today?” from active work, unresolved questions, recent failures, repeated
  friction, stale decisions, incomplete follow-ups, and feedback while retaining
  explicit approval boundaries. Proof artifact target:
  `.artifacts/model-memory/phase2-proactivity-product-correctness-proof/<timestamp>/`.
  Broad autonomous sending, auto-send scope expansion, and delivery-triggered
  action execution remain off.
- The next proactivity product-correctness remediation corrects the message-first
  UX model. Proactive items are work opportunities by default, with typed work
  item categories (`planning_request`, `investigation_request`,
  `draft_next_steps`, `execution_candidate`, `message_candidate`, `reminder`,
  `diagnostic`) and outcome states (`not_started`, `planning`, `planned`,
  `investigating`, `drafted`, `execution_proposed`,
  `executing_after_approval`, `done`, `dismissed`, `snoozed`, `blocked`).
  The inbox remains the canonical backlog, while Heartbeat / Daily Operator
  Review surfaces top “What would help this user today?” opportunities at
  workflow boundaries and contextual chat cards surface only exact active-context
  matches. Primary CTAs are intent-specific (`Plan this`, `Investigate`,
  `Draft next steps`, `Start scoped task`, `Open in current chat`,
  `Add to Daily Review`, `Send message` only for message candidates). Planning,
  investigation, drafting, and scoped-task CTAs start bounded agent handoff in
  chat without `chat.inject`, autonomous send expansion, or action execution.
  Proof artifact target:
  `.artifacts/model-memory/phase2-proactivity-work-items-heartbeat-proof/<timestamp>/`.
- The next proactivity usefulness correction gates product readiness on live
  generation, not just safe surfacing. Static bundled/default/doc-seeded
  candidates are demoted to Diagnostics/fallback and excluded from primary
  actionable counts, heartbeat cards, and contextual surfacing. Live
  opportunities must come from real OpenClaw work signals such as ordinary turn
  capture, session/runtime events, task or queue state, maintenance-loop output,
  project-state capsules, derived memory artifacts, operator feedback, or
  gateway delivery/error events. Every actionable item must include a specific
  title, why now, proposed next step, expected user value, evidence summary,
  confidence/limitations, provenance, source profile, authority, deterministic
  ids/hashes, freshness/conflict labels, and no-dark-data status. The live proof
  must show a real event creating a new proactive work item without manual
  candidate seeding. Rollback via
  `MODEL_MEMORY_PHASE2_LIVE_PROACTIVITY_SIGNALS_DISABLED` returns to
  diagnostics-only/static fallback behavior. This generator-first standard also
  applies to Skills, tools, and workflow synthesis: do not build extensive
  rollout/control scaffolding until real useful outputs from real work inputs
  are proven.

## Slices 60-64 - proactivity live-usefulness acceptance sequence

- Slice 60 expands live signal coverage across normal OpenClaw work seams:
  ordinary chat turns, task state changes, gateway errors, failed commands,
  repeated user friction, unresolved questions, session/workflow transitions,
  heartbeat events, maintenance output, and project-state capsules. Each seam
  emits typed source refs and reason codes, and static/default candidates remain
  diagnostics only. Proof artifact target:
  `.artifacts/model-memory/phase2-live-signal-coverage-expansion-proof/<timestamp>/`.
- Slice 61 adds a signal quality/noise budget with thresholds, cooldowns,
  deterministic dedupe windows, recurrence limits, feedback-aware suppression,
  and why-not-shown diagnostics. Proof artifact target:
  `.artifacts/model-memory/phase2-proactivity-signal-noise-budget-proof/<timestamp>/`.
- Slice 62 improves proactive planning handoffs. Intent CTAs start bounded chat
  turns with evidence, goal, constraints, safety boundaries, and expected output
  shape; non-message handoffs do not call `chat.inject`. Proof artifact target:
  `.artifacts/model-memory/phase2-proactive-planning-handoff-quality-proof/<timestamp>/`.
- Slice 63 hardens Heartbeat / Daily Operator Review as a primary proactivity
  surface, with top ranked live opportunities and direct handoff CTAs that
  preserve the same work item ids as inbox and contextual cards. Proof artifact
  target:
  `.artifacts/model-memory/phase2-heartbeat-proactivity-reliability-proof/<timestamp>/`.
- Slice 64 adds the proactivity acceptance gate. It aggregates generation,
  surfacing, handoff, feedback, dismissal, suppression, leakage, and safety
  metrics and decides whether to move to Skills, continue tuning, pause
  automation, or roll back to manual-only. Proof artifact target:
  `.artifacts/model-memory/phase2-proactivity-acceptance-gate-proof/<timestamp>/`.
- Broad autonomous sending, auto-send scope expansion, semantic truth writes
  from feedback, and action execution from surfacing remain blocked throughout
  the sequence.
- capture at least one durable evidence artifact per wave
- update the relevant human test prompt pack before declaring the wave ready for
  live validation

## Generator-first reset after Slice 64

- The next proactivity sequence is a bold generator-first usefulness reset, not
  another safe surfacing/control pass.
- The primary product gap is that OpenClaw can surface, rank, and hand off
  bounded work items but still under-generates useful opportunities from real
  work and from the agent’s own planning output.
- The new required capability order is:
  1. bounded opportunity extraction from assistant planning/output turns
  2. canonical opportunity ledger with completion/supersession handling
  3. autonomous internal drafting for top heartbeat opportunities only
  4. recurring-pattern and friction loops
  5. outcome follow-up / reopen / close loops
- Success is not declared on infrastructure. The live gate requires:
  - a normal roadmap/planning prompt to create at least one new inbox item
    without manual seeding
  - a normal assistant answer with concrete next steps to create structured
    opportunities automatically
  - top heartbeat opportunities to surface draft-ready planning or
    investigation briefs
  - already-resolved items to disappear automatically from primary actionable UX
  - recurring asks/friction to create useful follow-up opportunities
- The comparison bar is the public `proactive-agent` skill. OpenClaw must at
  least tie it on recurring-pattern detection, follow-up generation, heartbeat
  usefulness, and reverse-prompt/surprise value while exceeding it on
  provenance, boundedness, approval safety, and no-dark-data discipline.
- Rollback/kill-switch behavior remains mandatory. Broad autonomous sending,
  auto-send scope expansion, and action execution from proactivity remain
  blocked.
- This generator-first rule also applies to future Skills, tools, and workflow
  synthesis: do not expand scaffolding before real work proves useful outputs.

## Runtime and heartbeat reset after the generator-first pass

- The next correction is live-runtime-first: assistant final answers in real
  `agent:main:main` workflow must create same-session opportunities without
  proof seeding.
- Server-side authoritative transcript/session capture replaces UI callback
  dependence as the primary proactivity extraction seam.
- Authoritative transcript sync must persist only substantive assistant final
  answers for `assistant_turn` opportunity extraction. `Turn activity`,
  `[Memory Activity]`, and similar operational assistant markers are excluded.
- Placeholder fallback summaries must not replace a real assistant final answer.
- Explicit `final_answer` phased text and ids are preferred whenever available.
- Heartbeat must stop acting like a legacy liveness ping when real opportunity
  traffic exists. It should emit a bounded proactive review with top items and
  `Draft ready` when applicable.
- Inline ambient follow-ups in chat are now required so useful work appears in
  normal workflow, not only in the inbox.
- Persisted bounded activity records and lifecycle overrides must survive
  refresh/restart and auto-retire handled/superseded items.

## Deterministic judgment debt pruning before Milestone 4

- Remaining deterministic semantic/value judgment is deletion or model-pivot
  debt, not compatibility debt.
- Hybrid retrieval remains an explicit exception for candidate recall and pack
  assembly: lexical matches, graph/projection cues, source-lineage, recency,
  explicit refs/scopes/classes, vector recall, and structural pack construction
  are deterministic recall mechanics.
- Final semantic selection for context injection, capsules, candidate
  usefulness, admission/reconciliation beyond exact structural guardrails,
  proactivity surfacing, skills classification, and visible card copy is
  model-owned or operator-owned.
- Proof/model plumbing can keep semantic contract names only when it builds
  prompt schemas, validates model output, resolves scripted model fixtures, or
  compares proof artifacts; it cannot be a live fallback authority.
- Tests that assert old deterministic usefulness, ranking, classification,
  semantic supersession, or deterministic visible copy must be removed or
  rewritten. Strict audit must be paired with behavior review so debt is not
  hidden by renaming, helper reshuffling, or compatibility wrappers.

## Model-owned lane validation before Milestone 4

- The next validation pass reuses the optimized MMV2 path across Codex,
  OpenClaw ordinary turns, long prompts, documents, daily summary files,
  correction/reconciliation, collision adjudication, retrieval final inclusion,
  and proactivity/card compatibility.
- Codex regular memory capture is controlled by
  `MODEL_MEMORY_CODEX_CAPTURE_ENABLED` and related cadence/budget env vars. It
  is enabled by default with explicit opt-out and must be idempotent by
  persisted Codex refs/hashes.
- Long Codex and OpenClaw prompts use document-style source windows. The
  windowing is structural and minimally redacted; it must not select
  semantically interesting chunks before model review.
- The proof matrix must report packet/window counts, routing counts,
  extraction counts, canonical/admission counts, TTL decisions,
  reconciliation/collision outcomes, final writes or pending/quarantine state,
  model routes, source authority, artifact paths, and safety flags.
- Daily summary memory files should either be ingested as document-like MMV2
  sources with file refs/hashes or explicitly documented as startup-context-only
  with no unintended durable write path.
- Non-UI model-path quality validation must include:
  - Codex user-turn-rich sessions with long prompts, scoped decisions,
    temporary/TTL decisions, and no-memory controls
  - Codex mixed sessions with assistant finals, command failures, validation
    failures, touched areas, and fixed reruns
  - realistic large daily summary files with durable, scoped, temporary, stale,
    private/no-capture, and no-execution sections
  - daily-summary recall scoring that distinguishes top-level memory count from
    composite component coverage
  - assistant/tool positive and negative evidence controls
  - a qualitative recall audit comparing raw source, bounded packet, model
    output, admission/reconciliation/write result, and the observed loss point

## Explicitly deferred

Deferred beyond this first Phase 2 roadmap:

- model training or reinforcement loops
- aggressive privacy enforcement before base-system validation
- broad auto-installation of third-party skills without review
- graph-wide proactive behavior across every subject type before
  `project_state` capsules are proven
