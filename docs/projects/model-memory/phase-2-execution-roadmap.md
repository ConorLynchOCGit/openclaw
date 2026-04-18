---
summary: "Execution order, dependency map, and rollout gates for the reviewed model-memory Phase 2 architecture."
title: "Phase 2 Execution Roadmap"
---

# Phase 2 Execution Roadmap

This roadmap turns the approved Phase 2 conceptual spec pack into an executable
sequence.

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

Before the larger graph/capsule waves proceed, the project now treats packet
compiler quality and kind balance as the immediate priority substrate.

That work sits at the front of Wave 0.

## Execution order

### Wave 0: substrate and contract cleanup

Goal:

- remove avoidable ambiguity before new memory object types and runtime surfaces
  are added

Includes:

- shared packet compiler and budgeting rails
- `MEMORY.md` proof lane generalized into packet-family policy
- retrieval-pack budgeting and shaping contract
- deep ingest stabilization and substrate population
- `kind`-primary schema review
- prompt-contract review for ingestion and capture prompts
- missing `rule` generation investigation and kind-balance repair
- runbook/runtime alignment for long-running ingest and runtime rebuild

Validation gate:

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
