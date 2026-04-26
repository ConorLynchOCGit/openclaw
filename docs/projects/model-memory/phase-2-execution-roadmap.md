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

Validation gate:

- candidates surface in real operator-visible channels
- no hidden review queue becomes the only review path
- urgency/relevance thresholds can be observed and tuned

### Wave 5: skill and tool synthesis

Goal:

- turn repeated successful interactions into bounded candidate automation

Includes:

- skill-and-tool-synthesis
- skill/tool candidate evaluation
- ClawHub install vs inspire vs reject routing
- review artifact generation for self-improvement proposals

Validation gate:

- candidate generation does not silently install or mutate behavior
- review artifacts are actionable in ordinary OpenClaw workflow
- third-party skill vetting remains in the loop

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
- Wave 2 before Wave 3
- Wave 3 before Wave 4
- Wave 3 integration/proof harness before the comprehensive Phase 2 eval slice
- comprehensive Phase 2 eval/no-dark-data proof before Wave 4 planner surfacing
- Wave 4 before Wave 5
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
- capture at least one durable evidence artifact per wave
- update the relevant human test prompt pack before declaring the wave ready for
  live validation

## Explicitly deferred

Deferred beyond this first Phase 2 roadmap:

- model training or reinforcement loops
- aggressive privacy enforcement before base-system validation
- broad auto-installation of third-party skills without review
- graph-wide proactive behavior across every subject type before
  `project_state` capsules are proven
