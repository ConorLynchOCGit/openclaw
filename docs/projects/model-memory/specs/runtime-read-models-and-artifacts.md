---
summary: "Derived runtime read models and context artifacts for model-memory."
title: "Runtime Read Models And Artifacts"
---

# Runtime Read Models And Artifacts

## Objective

Define the runtime layers derived from canonical memory objects without extending the semantic ontology.

These layers exist to support retrieval, prompt assembly, bootstrap projection, and observability.

They are not semantic truth.

## Core rule

Canonical memory objects are the only semantic source of truth.

Runtime read models and artifacts are deterministic derivatives.

They must not:

- reinterpret meaning
- add new semantic categories
- introduce family registries
- override canonical class or kind

## Retrieval-runtime addendum

The current read-side authority is
[Memory Retrieval Runtime](/projects/model-memory/specs/memory-retrieval-runtime).

Runtime read models now have three explicit jobs:

1. expose active MMV2 truth to retrieval without reintroducing legacy object
   contracts
2. expose projection digests and context artifacts as compiled views with
   source-memory provenance
3. record retrieval and pack telemetry strongly enough to prove fresh-session
   recall

No new DB migration is required for the first Memory Retrieval Runtime pass.
The initial implementation should use the existing `runtime_context`
retrieval-result, context-artifact, active-slot/set, and projection-version
surfaces until the runtime contract is proven.

Required runtime artifacts:

- `retrieval_plan` structured payloads
- `retrieval_run` telemetry with `query_text_hash`, selected ids, excluded ids,
  pack ids, indexes used, and injection target
- `memory_pack` artifacts for operating, user profile, project state,
  procedure, source reference, episode continuity, projection digest, and
  conflict packs
- `projection_digest` artifacts with active `source_memory_ids`, content hash,
  freshness, stale/conflict markers, and source refs

Raw prompt text, full transcripts, raw tool logs, secrets, and unbounded user
content must not be persisted in these runtime artifacts.

## Runtime schema

Derived runtime state should live in a separate schema such as `runtime_context`.

This keeps operational state separate from canonical semantic storage.

## `active_memory_slots`

Use `active_memory_slots` for memories that should behave like a current single-valued slot.

Examples:

- current user response preference for a scope
- current project fact for one subject in one scope
- current standing rule for one scope and subject

Construction rules:

- deterministic only
- built from active/current memory objects
- built from normalized identity and supersession lineage
- no model call
- no fuzzy merge at read time

## `active_memory_sets`

Use `active_memory_sets` for memories that should behave like a current multi-valued set.

Examples:

- procedures
- references
- multi-valued project facts
- reusable workflow notes

Construction rules:

- deterministic only
- membership derived from active write state and supersession lineage
- stable ordering defined by policy, not by freeform text

## `session_context_state`

`session_context_state` is session working state, not durable semantic memory.

It may include:

- current session summary artifact id
- active project ids
- open loops
- unresolved questions
- active plan state
- compaction status
- latest projection versions used

Rules:

- state transitions are deterministic and code-owned
- the model may produce a session-summary artifact later
- the model must not define the state-machine categories
- if a session-summary model step is enabled later, it must record:
  - `contractName = session_summary_generation`
  - `contractVersion`
  - `modelId`

## `context_artifacts`

`context_artifacts` stores rendered runtime artifacts consumed by assembly.

Examples:

- `user_memory_pack`
- `project_memory_pack`
- `procedure_memory_pack`
- `session_summary_pack`
- generated bootstrap sections
- retrieval-context packs
- `memory_pack`
- `projection_digest`
- `retrieval_run_summary`

Each artifact should record:

- artifact type
- packet class when applicable
- scope key
- source object ids or slot keys
- dropped source ids when packet shaping occurred
- content hash
- rendered text or structured packed form
- token estimate
- built timestamp
- build policy version
- compiler mode
- compiler version

Packet artifacts must use the shared audit and budgeting rails in
[Packet Compiler And Budgeting](/projects/model-memory/specs/packet-compiler-and-budgeting).

That includes:

- `user_memory_pack`
- `project_memory_pack`
- `procedure_memory_pack`
- `session_summary_pack`
- `retrieval_pack`
- `memory_pack`
- generated bootstrap packet artifacts before file projection

Memory Retrieval Runtime artifacts additionally must record:

- retrieval plan id
- retrieval run id
- pack id
- selected memory ids
- selected projection ids
- exclusion reasons
- injection target
- source authority level

## Rich projection catalog pages

The 2026-04-22 partial-corpus architecture pass adds rich materialized
projection pages for the full v1 projection catalog:

- `user_profile_page`
- `project_page`
- `procedure_page`
- `source_page`
- `decision_log`
- `timeline_page`
- `entity_page`
- `dashboard`
- `agent_digest`
- `projection_digest`

Each materialized page is a compiled view, not truth. It must include:

- projection id
- projection type
- scope
- source memory ids
- source event ids
- source edge ids where applicable
- content hash
- compiled timestamp
- freshness state and reason
- stale markers
- conflict markers
- artifact path
- retrieval digest metadata

Generated projection pages materialize only under the projection artifact root,
currently `/root/.openclaw/workspace/.openclaw/model-memory/projections/`.
They must never be written back into root `USER.md` or `MEMORY.md`.

- whether the artifact can satisfy MMV2 recall proof

Workspace-file-only artifacts cannot satisfy MMV2 recall proof.

## Projection target records

The runtime layer should also track:

- `workspace_projection_targets`
- `workspace_projection_versions`

These records make projection rebuilds explicit and auditable.

## Dirty-state policy

When a write changes canonical objects, the runtime layer may mark downstream artifacts dirty.

Examples:

- slot changed -> rebuild affected bootstrap projection
- active set changed -> rebuild affected memory pack
- retrieval-facing scope changed -> invalidate recalled-pack cache

This dirty-state system is operational only. It must not affect semantic truth.

## Source weighting

Runtime assembly should use weighted source posture rather than treating every
context artifact as equivalent.

Default source order:

1. active MMV2 hard directives
2. active MMV2 records selected by a retrieval run
3. fresh MMV2-derived projection digests with active source ids
4. human-owned root `USER.md` / `MEMORY.md` bootstrap inputs
5. lower-authority daily notes and episode continuity
6. current-session transcript state

Root `USER.md` and `MEMORY.md` remain human-owned compatibility/bootstrap
inputs, not model-memory projection write-back targets. They may help context
assembly, but they must not override active MMV2 records or prove durable
recall by themselves.

Daily notes remain writable continuity files and ingestion targets. They should
be represented as lower-authority `daily_continuity` sources and fingerprinted
by content hash.

## Provisional visibility rule

Default runtime retrieval, context assembly, projections, and active read models
must exclude non-active lifecycle states such as:

- `provisional`
- `conflict_hold`
- `expired`

Operator and diagnostic surfaces may inspect those states explicitly.

Experimental retrieval that includes provisional candidates at lower scores is
allowed only as an explicit later mode. It is not part of the default runtime
contract.
