---
summary: "Shared derived-artifact contract for projections, capsules, graph reports, and runtime packs."
title: "Derived Artifact Core"
---

# Derived Artifact Core

## Objective

Define the shared substrate used by Phase 2 derived artifacts without merging
their product roles.

Projections, capsules, graph reports, retrieval packs, maintenance reports, and
context artifacts all need common provenance, freshness, lifecycle, authority,
hashing, materialization, and read-only access rules. They should not each grow
their own incompatible version of those mechanics.

## Core decision

Keep projections and capsules conceptually separate, but implement one shared
derived-artifact core.

Projection role:

- workspace/bootstrap/read-model artifacts
- materialized under `.openclaw/model-memory/projections/`
- useful for operator review, bootstrap surfaces, projection-backed recall, and
  compact read-model digests
- not a generation capsule and not independent semantic truth

Capsule role:

- generation/context artifacts
- materialized under `.openclaw/knowledge/capsules/`
- structured around prompt-facing sections for broad project or subject
  grounding
- never canonical semantic truth

## Shared contract

Every derived artifact family should use a common envelope or shared helpers for:

- artifact id
- artifact family
- artifact type
- schema version
- compile/build version
- target id or scope key
- source memory ids
- source event ids
- source edge ids
- source refs
- authority tiers
- source profile ids
- content hash
- derivation hash where applicable
- compiled timestamp
- freshness status and reason
- stale markers
- conflict markers
- lifecycle exclusion reasons
- artifact paths
- safe metadata-only reports

The shared core should also own:

- deterministic id and hash helpers
- source-ref deduplication
- source id sorting
- lifecycle exclusion helpers
- freshness/conflict marker helpers
- read-only in-memory store cloning helpers
- safe artifact-path normalization
- bounded JSON artifact writing
- artifact index entry construction

## Authority and no-dark-data rules

The shared core must enforce source posture consistently:

- active MMV2 durable truth remains the only semantic truth
- derived artifacts must cite active source memory ids for normal retrieval use
- `inspection_only` sources are excluded from normal projections, capsules,
  graph expansion, planner recommendations, skill synthesis, and tool synthesis
- lower-authority soft-source material must stay labeled in derived output
- raw prompts, full transcripts, raw tool logs, secrets, and private phrases
  must not be persisted in derived artifacts
- external imperative text is evidence or a redacted safety finding, never a
  runtime instruction

## Project-state overlap policy

`project_state` capsule is the owner of rich project-state compilation for
generation/context use.

`project_page` projection must not remain a second independent project-state
compiler. It has two allowed roles:

1. short-term operator/report projection that exposes bounded project-state
   read-model information without being the primary generation/context source
2. long-term thin renderer over a fresh `project_state` capsule or capsule
   digest, once the capsule materialization path is wired

If both artifacts are available for the same project, retrieval/context assembly
should prefer the `project_state` capsule for broad project-status, planning,
and multi-objective prompts. `project_page` remains eligible for operator
inspection, bootstrap/report pages, and projection-backed recall proof only
when selected through normal retrieval rules and backed by active MMV2 source
ids.

## Non-goals

The shared core must not become:

- a semantic forest
- a keyword or topic router
- a fuzzy correction or supersession write path
- a compatibility category registry
- a hidden semantic truth layer
- a prompt-text summarizer that stores raw user/tool/transcript content

## Implementation sequence

The next Phase 2 slice should consolidate only shared mechanics.

It should:

- add shared derived-artifact types and helpers
- adapt projection and capsule code to use the shared helpers where safe
- preserve existing public artifact shapes unless a spec explicitly changes
  them
- demote or mark `project_page` as operator/report-oriented when a
  `project_state` capsule is available
- expose a safe path for a future thin `project_page` renderer over capsule
  output

It should not:

- enable capsule context injection by default
- change answer behavior by default
- add DB migrations
- create new semantic memory writes
- introduce broad UI behavior

## Related specs

- [Runtime Read Models And Artifacts](/projects/model-memory/specs/runtime-read-models-and-artifacts)
- [Subject Capsules And Dense Ingestion](/projects/model-memory/specs/subject-capsules-and-dense-ingestion)
- [Project State Capsule Schema](/projects/model-memory/specs/project-state-capsule-schema)
- [Cache And Projection Policy](/projects/model-memory/specs/cache-and-projection-policy)
