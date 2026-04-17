---
summary: "Proposed schema and dependency model for the Phase 2 derived graph runtime."
title: "Graph Schema And Runtime Dependencies"
---

# Graph Schema And Runtime Dependencies

## Objective

Define the likely runtime schema and rebuild dependency model for the Phase 2
graph layer.

## Suggested schema posture

Keep graph state out of canonical semantic storage.

Suggested derived schema:

- `runtime_graph`

## Candidate tables

### `graph_nodes`

Suggested fields:

- `node_id`
- `node_type`
- `display_key`
- `project_id`
- `scope_key`
- `kind`
- `canonical_class`
- `source_object_id`
- `source_artifact_id`
- `trust_tier`
- `visibility`
- `sensitivity`
- `created_at`
- `updated_at`

### `graph_edges`

Suggested fields:

- `edge_id`
- `edge_type`
- `from_node_id`
- `to_node_id`
- `strength`
- `provenance_ref`
- `derived_from_rule`
- `trust_tier`
- `visibility`
- `created_at`
- `updated_at`

### `graph_build_runs`

Suggested fields:

- `run_id`
- `trigger_type`
- `scope`
- `started_at`
- `finished_at`
- `status`
- `input_hash`
- `output_hash`

### `graph_dependencies`

Suggested fields:

- `dependency_id`
- `owner_type`
- `owner_id`
- `depends_on_type`
- `depends_on_id`
- `dependency_hash`

## Dependency model

Graph state should depend on:

- canonical memory objects
- runtime inventories
- projection targets and versions
- project indexes and registries
- skill and tool inventories

The graph dependency table exists so rebuilds can be incremental and auditable.

## Rebuild ordering

Recommended ordering:

1. canonical writes settle
2. runtime inventories refresh
3. graph rebuild runs
4. capsule rebuilds consume graph state
5. planner and policy surfaces consume capsules and graph state

## Non-goal

This spec does not require the final table names to be exactly these values.

It exists to constrain the implementation shape before code lands.
