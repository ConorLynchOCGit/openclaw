---
summary: "Phase 2 design for a derived graph runtime on top of canonical model-memory objects."
title: "Graph Derived Runtime Model"
---

# Graph Derived Runtime Model

## Status

This is an approved Phase 2 direction document.

It is still pre-implementation, but the main design posture is now chosen rather
than merely floated:

- `kind` is the preferred primary semantic axis
- `canonicalClass` is treated as secondary or derived
- the graph is derived runtime state, not semantic truth
- subject capsules are downstream consumers of the graph

2026-04-22 MMV2 alignment:

- graph inputs are MMV2 durable memories, memory events, memory edges, ingest
  sources, ingest segments, and runtime projection versions
- graph nodes and edges are derived runtime records only; they do not change
  durable memory status, admission, reconciliation, or supersession
- edge authority must come from explicit MMV2 edges, source refs, structural
  ids, scopes, statuses, and source lineage, not fuzzy topical similarity
- retrieval may use graph expansion only as a read-time candidate lane with
  telemetry and exclusion reasons

2026-04-22 Phase 2 decision lock:

- graph runtime will use a trust ladder, not a review-only operating model
- deterministic structural edges may be used automatically in read-time graph
  retrieval when they are backed by MMV2 events, explicit edges, source refs,
  ids, scopes, statuses, or source lineage
- inferred graph edges start as probationary read-time edges with low authority,
  TTL, telemetry, and automatic decay; they do not require manual review before
  low-weight read-time use
- inferred edges may auto-promote only after repeated successful retrieval use,
  no conflicts, and active source evidence
- manual review is reserved for high-risk, conflicting, privileged, or
  behavior-changing outcomes, not for every graph edge

2026-04-30 semantic enrichment clarification:

- structural graph derivation and model-owned semantic graph enrichment are
  separate Phase 2 slices
- deterministic graph derivation may create structural nodes and edges from
  explicit ids, refs, scopes, source lineage, memory events, memory edges,
  source documents, lifecycle state, projects, artifacts, and hashes
- deterministic graph derivation must not infer topical sameness, same-entity
  truth, pattern membership, workflow relationship, or semantic subject
  identity from keywords, embeddings, string overlap, or graph proximity as
  final authority
- semantic graph enrichment is model-owned: a bounded model path proposes and
  adjudicates topic, entity, subject, workflow, procedure, skill/tool, project,
  and recurring-pattern nodes plus semantic relationship edges
- deterministic validation of semantic graph proposals is limited to schema,
  allowed node/edge types, exact refs, evidence anchoring, source authority,
  caps, safety, lifecycle eligibility, and pending/quarantine/block behavior
- validated semantic graph nodes and edges may become retrieval recall signals,
  but final context-pack, capsule, or context-injection inclusion remains
  model-owned

Remaining implementation decisions:

- exact edge-type mapping from MMV2 edge/event/source structures into graph
  authority tiers
- graph retention/invalidation policy when source memories are superseded,
  deleted, conflicted, or recompiled into projections
- schema and route contract for model-owned semantic graph proposal,
  adjudication, promotion, split, merge, and decay
- promotion criteria for model-proposed semantic graph edges when repeated
  retrieval success exists but no human review has occurred

## Objective

Add a graph-shaped derived runtime layer that makes relationships between
memories, subjects, documents, projects, agents, tools, skills, workflows, and
external entities explicit without replacing canonical memory objects as source
of truth.

The graph exists to support:

- richer retrieval
- multi-hop reasoning
- subject and project capsule compilation
- operator inspection
- contradiction and dependency analysis
- skill and workflow synthesis

The structural graph alone is not expected to know that two unrelated memories
share a topic such as "agent delegation" unless that relationship is explicit
in source refs, scopes, payload fields, or previously admitted graph data. That
kind of semantic topic/entity/pattern relationship belongs to the model-owned
semantic enrichment slice.

## Core rule

The graph is derived runtime state.

It is not semantic authority.

Canonical memory objects remain the only primary semantic truth.

## Why this exists

The current system is strong at:

- atomic object capture
- deterministic active slots and sets
- bounded object-native retrieval
- bootstrap and projection assembly

The current weakness is not a shortage of objects.

It is the lack of an explicit relationship substrate between:

- objects
- recurring subjects
- source documents
- runtime entities
- external references
- operator artifacts

Phase 2 should add that relationship substrate without creating a second
ontology.

## Approved Phase 2 posture

### `kind` is primary

Phase 2 should treat `kind` as the preferred primary semantic axis.

Reasons:

- it appears more stable than the four canonical classes
- it appears to drift less during dedupe and support attachment
- it better matches how the model already recognizes memory shape

This means graph derivation should center on:

- `kind`
- subject identity
- provenance
- lifecycle state
- runtime entity type

before it centers on `canonicalClass`.

### `canonicalClass` is secondary

Phase 2 should keep `canonicalClass`, but as a secondary or derived facet used
for:

- reporting
- rendering
- operator views
- compatibility or grouping filters

It should not remain a co-equal authority for graph topology if it keeps causing
semantic slippage.

### Source authority is carried through

Graph nodes and edges should preserve source authority metadata from the MMV2
source profile layer:

- `authorityTier`
- `sourceProfileId`
- provenance refs

This metadata affects graph retrieval expansion and capsule compilation. It
does not turn graph state into semantic truth.

## Graph scope

The graph is intentionally open to both internal and external entities.

Supported node families should include at minimum:

- canonical memory objects
- source documents
- source windows where useful for provenance
- normalized subjects
- projects
- workflows
- procedures
- agents
- tools
- skills
- plugins
- channels
- external entities
- external references and web-ingested sources
- operator artifacts and review artifacts where relevant

## Graph role in the Phase 2 stack

The stack should become:

1. canonical memory objects as truth
2. derived graph runtime as relationship substrate
3. project and subject capsules as compiled artifacts
4. hierarchical retrieval and context assembly as consumers
5. planner, synthesis, and cache policy as control and optimization layers

The graph therefore sits between atomic memory truth and higher-order runtime
artifacts.

## Derived node types

The graph should use explicit structural node types rather than one flattened
node bucket.

Suggested node types:

- `memory_object`
- `subject`
- `document`
- `project`
- `workflow`
- `agent`
- `tool`
- `skill`
- `plugin`
- `reference_source`
- `external_entity`
- `operator_artifact`
- `runtime_artifact`

These node types are runtime structural types, not replacements for canonical
semantic kinds.

## Derived edge types

The edge vocabulary should remain closed and generic.

Suggested edge families:

- `mentions`
- `supports`
- `derived_from`
- `belongs_to_project`
- `used_in_workflow`
- `uses_tool`
- `uses_skill`
- `depends_on`
- `blocks`
- `supersedes`
- `contradicts`
- `refines`
- `summarizes`
- `references`
- `same_subject_cluster`
- `same_operator_lane`
- `produced_by`
- `consumed_by`

The graph must not allow freeform edge labels to become semantic truth.

## Edge authority tiers

The graph runtime should classify each edge into an authority tier.

Suggested first tiers:

- `authoritative_structural`
- `derived_structural`
- `probationary_inferred`
- `promoted_inferred`
- `blocked_or_decayed`

These graph edge authority tiers are separate from memory source authority
tiers such as `user_authoritative`, `curated_authoritative`, `tool_grounded`,
and `cited_soft`.

`authoritative_structural` edges come from explicit MMV2 edges, structural
supersession, exact source refs, exact ids, explicit user text, scope, status,
and event lineage.

`derived_structural` edges come from deterministic joins over accepted runtime
inputs such as same source document, same ingest segment family, same project
scope, explicit artifact provenance, tool or skill registry links, and runtime
inventory links.

`probationary_inferred` edges may be created from bounded model or lexical
signals only after provenance binding. They are read-time-only, low weight,
time-limited, and telemetry-backed. They must never drive admission,
reconciliation, correction, supersession, or durable truth mutation.

Lexical or embedding similarity may help recall candidate node/edge proposals
for a model to adjudicate, but it must not itself promote semantic graph truth.
For example, deterministic recall may gather memories that mention "agent" and
"delegation"; only model/human adjudication can create or promote an
`agent delegation` topic/pattern node and attach both memories to it.

`promoted_inferred` edges are former probationary edges that have repeated
successful retrieval usefulness, no active conflicts, and continuing source
support. Promotion changes read-time ranking authority only; it still does not
make the edge canonical semantic truth.

`blocked_or_decayed` edges are edges that lost source support, conflicted with
higher-authority evidence, expired, or received negative retrieval feedback.

The default path is automatic safe use and automatic decay, not hidden manual
review. Review is an exception path for conflicts, high-risk content,
privileged action proposals, or graph signals that would otherwise change live
behavior.

## Subject nodes

The graph should introduce explicit derived `subject` nodes.

These are not replacements for payload fields like `subject`, `title`, or
`task`.

They are normalized runtime anchors that connect:

- multiple memory objects
- relevant documents
- active procedures
- tools and skills
- operator artifacts
- external references

Subject nodes are the bridge between atomic memory objects and later capsules.

## External entities

External entities should be first-class graph citizens.

Examples:

- providers
- model vendors
- GitHub repos
- external services
- APIs
- named people or organizations
- external websites and docs

These nodes must remain provenance-bearing and trust-aware.

An external entity node does not imply trust or authority.

It only makes the relationship inspectable.

## Construction rules

Graph construction must remain deterministic and code-owned.

The model may help interpret source content into canonical memory objects, but
it must not directly author graph topology as an independent truth source.

Graph construction should derive from:

- canonical objects
- deterministic subject normalization
- provenance links
- runtime inventories
- artifact build outputs
- explicit config and registry state

Model-produced fields may only influence graph structure after those fields have
already been accepted into canonical storage or an approved runtime artifact.

## Graph build phases

Recommended build phases:

1. object import
   - load active canonical objects
   - group by `kind`, subject, scope, and lifecycle
2. subject anchor derivation
   - resolve normalized subject nodes
   - attach source and scope descriptors
3. runtime inventory join
   - join project, agent, skill, tool, plugin, and workflow surfaces
4. relationship derivation
   - add deterministic edges from provenance, scope, supersession, explicit
     references, and inventories
5. contradiction and dependency pass
   - add non-truth operational edges such as `contradicts`, `depends_on`, and
     `blocks`
6. graph artifact publication
   - write graph rows, views, and dependency hashes into derived runtime state

## Graph query surfaces

The graph layer should eventually expose bounded graph-query surfaces such as:

- neighborhood expansion from a subject or memory object
- dependency walk
- contradiction walk
- tool or skill adjacency lookup
- document and workflow neighborhood lookup
- operator-artifact neighborhood lookup

These queries are retrieval helpers.

They are not a second planning system.

## Interaction with retrieval

Graph retrieval must not replace deterministic object retrieval.

Instead:

1. deterministic object retrieval remains the baseline
2. graph expansion may improve candidate generation and packing
3. graph edges may justify multi-hop retrieval for broad prompts
4. final retrieval output still returns object-native or artifact-native
   results

The graph should help retrieval answer:

- what else is connected?
- what supporting evidence belongs with this?
- what dependent tools or workflows matter?
- what contradictions or supersession chains exist?

It must not invent new facts.

Graph expansion should expose edge authority in retrieval telemetry. Retrieval
packs should identify which selected or excluded items came from structural
edges, probationary edges, promoted edges, or blocked/decayed edges. This keeps
the system observable without forcing every useful graph edge through a manual
queue that is unlikely to be reviewed.

## Interaction with capsules

Capsules are not part of the graph runtime itself.

They are the first major consumer of the graph runtime.

Dependency order:

1. canonical memory objects are truth
2. graph runtime derives from canonical objects and runtime inventories
3. project and subject capsules compile from canonical objects, graph
   relationships, and selected source evidence

This separation keeps the graph normalized and keeps capsules prompt-shaped
instead of graph-shaped.

## First capsule consumer

The first capsule consumer should be `project_state`, not generic `subject_state`.

Reason:

- project boundaries are easier to verify against authored truth
- project state is easier to compare against operator expectations
- project state is a safer first artifact than a broader subject abstraction

So the graph should first prove that it can support one high-quality
`project_state` capsule before it tries to become a fully generalized
topic-memory substrate.

## Runtime storage posture

The graph should live in derived runtime storage, not in canonical semantic
tables.

Suggested placement:

- `runtime_context`
- or a sibling schema such as `runtime_graph`

Phase 2 v1 chooses a derived `runtime_graph` schema posture for graph nodes,
edges, build runs, and invalidation state. MMV2 durable memories/events/edges
remain the only semantic truth.

The graph should be rebuildable from:

- canonical objects
- runtime inventories
- projection artifacts
- deterministic graph-construction rules

## Invalidation and rebuild

The graph needs explicit dirty-state rules.

Suggested rebuild triggers:

- canonical object write or lifecycle change
- supersession change
- support attachment that changes neighborhood relevance
- runtime artifact rebuild
- project or tool inventory change
- skill registry change
- plugin inventory change
- new external document ingestion

Rebuild policy should favor incremental updates before full rebuilds.

## Privacy, trust, and prompt-injection posture

Phase 2 should introduce trust and privacy metadata to graph nodes and edges.

However, first-pass enforcement must remain soft.

The graph should record metadata such as:

- trust tier
- visibility
- sensitivity
- egress policy

In the first pass, these fields should support:

- operator inspection
- capsule packaging hints
- auditability

They should not yet dominate:

- graph build
- graph retrieval
- same-memory resolution
- semantic truth

This avoids repeating the earlier failure mode where an unstable field becomes
falsely authoritative and distorts the core system.

External ingested content must always be treated as untrusted evidence, not as
instructions.

## Non-goals

This spec does not authorize:

- freeform graph growth from model output alone
- graph edges as semantic truth
- graph-only retrieval that bypasses canonical objects
- autonomous tool or skill installation
- graph-driven prompt rewriting without review

## Implementation sequence

Recommended sequence:

1. finalize the `kind`-primary schema review
2. add deterministic subject-node derivation
3. add document, skill, tool, workflow, and project relationship edges
4. add bounded graph query helpers
5. compile and validate one `project_state` capsule
6. only after that, expand into broader subject capsules

## Related specs

- [Kind Primary Schema Migration](/projects/model-memory/specs/kind-primary-schema-migration)
- [Graph Schema And Runtime Dependencies](/projects/model-memory/specs/graph-schema-and-runtime-dependencies)
- [Project State Capsule Schema](/projects/model-memory/specs/project-state-capsule-schema)
