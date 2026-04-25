---
summary: "Phase 2 design for project and subject capsules plus dense ingestion on top of canonical model-memory objects."
title: "Subject Capsules And Dense Ingestion"
---

# Subject Capsules And Dense Ingestion

## Status

This is an approved Phase 2 direction document.

The capsule concept is approved.

The first capsule flavor is now chosen:

- Phase 2 starts with `project_state`
- broader `subject_state` comes after the first project-state proof

2026-04-22 MMV2 alignment:

- capsules compile from active MMV2 durable memories, memory events, memory
  edges, and projection digests; they are not durable truth
- every capsule artifact must carry source memory ids, source event ids,
  source edge ids where available, content hash, freshness, stale markers, and
  conflict markers
- capsule recall is acceptable only when backed by active MMV2 ids or fresh
  projection/capsule digests backed by those ids
- dense ingestion remains document-ingest into MMV2 durable truth first; capsule
  generation cannot bypass admission or create hidden semantic summaries

2026-04-22 Phase 2 decision lock:

- the first materialization target for capsule artifacts is
  `/root/.openclaw/workspace/.openclaw/knowledge/capsules/`
- the `.openclaw/knowledge/` root must be documented as a derived knowledge
  artifact root before implementation; it does not replace MMV2 SQL truth
- conflicted capsule content is compiled into explicit conflict-aware sections
  and excluded from normal injection unless conflict-aware retrieval is
  requested
- capsule refresh cadence is after ingest batch, after relevant
  correction/supersession, and daily if dirty
- active project capsules receive eager refresh priority; broad subject
  capsules start on-demand until usage data justifies precompilation

2026-04-25 projection/capsule separation decision:

- projections remain workspace/bootstrap/read-model artifacts
- capsules are the generation/context artifact family
- shared provenance, freshness, lifecycle, authority, artifact-writing, and
  read-only store mechanics should move into a shared derived-artifact core
- `project_state` capsule owns rich project-state compilation for broad
  project-status, planning, and multi-objective prompts
- `project_page` projection must not remain a separate project-state compiler;
  it is either an operator/report projection or a thin renderer over a fresh
  `project_state` capsule or capsule digest

## Objective

Add one derived artifact layer for dense subject understanding without replacing
canonical memory objects or turning long-context ingestion into a second memory
system.

The new artifact family is the capsule family.

A capsule is a bounded, compiled, provenance-bearing runtime artifact for a
recurring topic, project, workflow, or external subject.

## Core rule

Capsules are compiled artifacts.

They are not canonical truth.

Canonical memory objects remain the primary store.

The graph runtime remains the structural substrate.

Capsules are consumable views built on top of both.

Shared artifact mechanics should come from
[Derived Artifact Core](/projects/model-memory/specs/derived-artifact-core)
rather than being reimplemented independently for capsules and projections.

## Artifact root

Capsule artifacts should materialize under:

- `/root/.openclaw/workspace/.openclaw/knowledge/capsules/`

This creates a clearer Phase 2 knowledge-artifact namespace for graph and
capsule outputs.

The current generated model-memory artifact root remains
`.openclaw/model-memory/` for existing projection and runtime memory artifacts.
Before capsule implementation, workspace topology and model-memory artifact
specs should explicitly add `.openclaw/knowledge/` as a derived knowledge root.

The knowledge artifact root must follow the same policy as projections:

- artifact-only output
- content-hash-addressed files
- source memory, event, and edge ids in every digest
- freshness, stale, and conflict markers
- no generated write-back into root `USER.md` or `MEMORY.md`
- no bypass around MMV2 admission or reconciliation

## Why this exists

The current memory system captures atomic objects well.

That is necessary but not sufficient for:

- broad planning prompts
- multi-objective retrieval
- high-context operator reviews
- dense corpus ingestion
- proactive memory behavior

Those tasks need a middle layer between atomic objects and whole-document
reingestion.

That middle layer is the capsule.

## Capsule family

Phase 2 should eventually allow several capsule flavors with one shared
structural model.

Candidate capsule types:

- `project_state`
- `subject_state`
- `workflow_state`
- `tool_or_skill_state`
- `external_entity_state`
- `operator_lane_state`

The shared structure matters more than the flavor name.

## First capsule flavor

The first capsule to implement should be `project_state`.

Reason:

- project boundaries already exist in authored docs and runtime topology
- project state is easier to verify against durable sources
- operator review already thinks in project terms
- evaluation can compare capsule output against authored project truth more
  reliably than a generic subject capsule

`subject_state` should follow only after `project_state` proves useful.

Phase 2 v1 does not implement broad `subject_state`, `workflow_state`,
`tool_or_skill_state`, or `external_entity_state` capsules until the
`project_state` capsule is proven stable.

## What a capsule is

A capsule should answer:

- what this subject or project currently is
- what matters about it right now
- which rules, facts, procedures, and references are active
- which documents, tools, skills, workflows, and projects are connected
- what changed recently
- what confidence and authority each element has
- what open contradictions or unresolved states remain

The capsule should be bounded enough to inject into live context and legible
enough for operator inspection.

## Primary use cases

Capsules should support both:

- live context injection
- operator reporting and inspection

The first-pass design should treat both as first-class rather than optimizing
only for one.

Generation/context use belongs to capsules. Projection pages may support
operator inspection, bootstrap surfaces, and projection-backed recall, but they
should not independently compile rich project-state context once a
`project_state` capsule exists for that project.

## Capsule contents

Each capsule should compile from:

- canonical memory objects
- derived graph relationships
- selected supporting source artifacts
- active runtime artifacts where relevant
- bounded episodic evidence where allowed

The capsule should not be a raw document summary.

It should be a structured, evidence-backed compilation.

## Suggested capsule sections

Each capsule may expose sections such as:

- identity
- current state
- standing rules
- current procedures
- supporting facts
- trusted references
- related tools and skills
- related projects and workflows
- open contradictions or uncertainty
- soft-source evidence
- authority and provenance notes
- recent changes
- provenance summary

These sections may later be selectively packed depending on the consumer.

## Authority model

Capsules must compile under an explicit authority policy.

Initial authority ordering should be:

1. canonical authored or repo-backed durable sources
2. canonical memory objects derived from trusted sources
3. operator-approved derived artifacts
4. prompt-turn capture
5. daily summary and episodic continuity artifacts

The capsule builder must not allow a lower-authority source to silently
override a higher-authority source.

Soft-source and conflicted material must appear only in labeled evidence,
conflict, or uncertainty sections. Capsule compilation must not blend
`cited_soft` claims into high-authority current-state prose without explicit
promotion.

If tension exists, the capsule should surface it as:

- contradiction
- provisional note
- confidence reduction
- explicit unresolved state

## Relationship to ingestion modes

The system currently has at least three ingestion modes:

- prompt-turn ingestion
- document ingestion
- daily summary ingestion

Phase 2 should make those ingestion modes capsule-aware without making them
equal.

Document ingestion is the main dense-knowledge substrate.

Prompt-turn ingestion is important for user- and workflow-specific continuity.

Daily summary ingestion is continuity support, not primary truth.

## Dense ingestion

Dense ingestion is not simply "ingest more files."

Dense ingestion means:

- the system learns a recurring subject or project deeply enough to compile a
  useful capsule
- the system can connect multiple documents and memory objects under that
  target
- retrieval can fetch a capsule instead of only many disconnected atoms

Dense ingestion should target:

- project-centered corpora
- recurring operational seams
- frequently revisited projects
- external domains that the user returns to repeatedly

## Capsule compilation triggers

Suggested triggers:

- enough new memory objects land on one target
- document-ingest batches materially expand a target neighborhood
- the planner marks a project or subject as frequently queried
- the operator explicitly requests capsule build
- a scheduled maintenance or review lane asks for refreshed state

Approved first cadence:

- refresh after each completed document-ingest batch that touches the capsule
  target
- refresh after relevant correction, supersession, conflict, or lifecycle
  changes
- refresh daily if the capsule is marked dirty
- rebuild on demand for explicit operator inspection

The planner may perform these refreshes automatically because they are derived
artifact maintenance. It may not use capsule refreshes to create new durable
semantic truth.

## Retrieval interaction

Capsules should not replace object-native retrieval for all prompts.

The system should choose between:

- atomic object retrieval
- capsule retrieval
- hybrid retrieval

Suggested default:

- narrow factual or preference lookups -> atomic retrieval
- broad status, planning, or topic prompts -> capsule retrieval or hybrid
- long multi-objective prompts -> hierarchical retrieval with capsule-aware
  packing

Ordinary context assembly may use capsules for broad planning or project-status
prompts only after retrieval trace and evaluation proof. Atomic retrieval
remains the default for narrow facts.

When both a fresh `project_state` capsule and a `project_page` projection exist
for the same project, broad project-status and planning prompts should prefer
the capsule path. The projection remains eligible for operator/report use and
normal projection-backed recall only when selected through retrieval and backed
by active MMV2 ids.

## Hierarchical retrieval interaction

Capsules are a major input to post-cutover hierarchical retrieval.

They reduce the need to:

- repeatedly pull many loosely connected objects
- repeatedly summarize the same subject from scratch
- overpack raw documents into the prompt

They should become one of the primary retrieval-pack shapes for broad prompts.

## Schema posture

Phase 2 should make capsule compilation align with the new schema posture:

- `kind` is primary
- `canonicalClass` is secondary or derived

Capsules should group first by:

- target identity
- active kinds
- provenance and authority
- graph relationships

They should not be organized around the four canonical classes as if those are
the semantic center.

## Privacy, trust, and prompt injection

Capsules should record privacy and trust metadata in the first pass.

However, first-pass enforcement should stay soft.

That means the capsule may expose:

- visibility level
- sensitivity hints
- trust tier
- source authority notes

In the first pass, these fields should help:

- operator review
- pack selection
- future redaction planning

They should not yet hard-block core capsule construction unless a source is
explicitly forbidden from model use.

No capsule should smuggle imperative external text into a privileged planning or
tool-execution lane as if it were runtime instruction.

Conflicted, stale, privacy-risk, or prompt-injection-risk content should stay
visible as bounded metadata or conflict sections rather than silently
disappearing. Normal retrieval should exclude those sections unless the request
is explicitly inspection-oriented or conflict-aware.

## Evaluation criteria

`project_state` capsule evaluation should check:

- alignment with authored project docs
- correct capture of active rules, procedures, and references
- bounded token shape
- usefulness in operator review
- usefulness in live context injection
- contradiction surfacing quality

## Rollout sequence

1. derive graph support for project targets
2. define project-state capsule schema
3. consolidate shared derived-artifact mechanics for projections and capsules
4. demote `project_page` to operator/report projection or make it a thin
   renderer over `project_state`
5. build and inspect one `project_state` capsule per active project
6. route broad project prompts through project-state retrieval
7. only after that, expand into generic `subject_state`

## Related specs

- [Project State Capsule Schema](/projects/model-memory/specs/project-state-capsule-schema)
- [Derived Artifact Core](/projects/model-memory/specs/derived-artifact-core)
- [Graph Derived Runtime Model](/projects/model-memory/specs/graph-derived-runtime-model)
- [Kind Primary Schema Migration](/projects/model-memory/specs/kind-primary-schema-migration)
