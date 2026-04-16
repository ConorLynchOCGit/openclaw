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

Each artifact should record:

- artifact type
- scope key
- source object ids or slot keys
- content hash
- rendered text or structured packed form
- token estimate
- built timestamp
- build policy version

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
