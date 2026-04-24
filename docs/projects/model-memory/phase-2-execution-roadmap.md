---
summary: "Execution order, dependency map, and rollout gates for the reviewed model-memory Phase 2 architecture."
title: "Phase 2 Execution Roadmap"
---

# Phase 2 Execution Roadmap

This roadmap turns the approved Phase 2 conceptual spec pack into an executable
sequence.

Phase 2 implementation is currently blocked on the remaining pre-Phase-2 gates
listed in [Pre-Phase-2 Gate Ledger](/projects/model-memory/pre-phase-2-gate-ledger).

It is intentionally ordered. The goal is not to implement every concept in
parallel. The goal is to land the next memory/runtime architecture in slices
that can be validated, rolled back, and reviewed without losing operational
clarity.

## Current design posture

Phase 2 currently assumes:

- `kind` becomes the primary semantic axis
- `canonicalClass` becomes secondary or derived
- the first capsule flavor is `project_state`
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

Before the larger graph/capsule waves proceed, the project now treats the
Memory Retrieval Runtime, MMV2 capture coverage, closed-loop operational
safety, and provider/evaluation stability as the immediate readiness substrate.

Packet compiler quality and kind balance remain important, but they no longer
override the post-storage-cutover need to fix recall/retrieval/projections
first.

## Pre-Phase-2 Continuation

This continuation must finish before graph/capsule/planner implementation
becomes the active engineering lane.

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

Includes:

- subject capsules and dense ingestion
- first `project_state` capsule schema
- provenance and authority rules for capsule compilation
- capsule storage/runtime exposure

Validation gate:

- at least one `project_state` capsule compiles deterministically from the live
  corpus
- capsule provenance is inspectable
- capsule output improves retrieval/context grounding for project-state prompts

### Wave 3: retrieval and context integration

Goal:

- make graph and capsule outputs useful to the active context engine

Includes:

- hierarchical retrieval updates
- capsule-aware retrieval packaging
- context engine selection changes
- projection updates needed to expose capsule or graph signal

Validation gate:

- retrieval traces show graph/capsule-aware evidence when appropriate
- context traces show improved grounding without unstable prompt churn
- repeated retrievals stay cache-stable

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
- Wave 1 before Wave 2
- Wave 2 before Wave 3
- Wave 3 before Wave 4
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
