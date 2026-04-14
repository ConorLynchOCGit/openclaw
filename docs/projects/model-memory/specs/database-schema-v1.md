---
summary: "Detailed v1 database schema design for model-memory."
title: "Database Schema V1"
---

# Database Schema V1

## Objective

Define the v1 database schema in enough detail that migrations can be written
and verified without inventing structure mid-implementation.

## Implementation status

This schema is now represented by the ordered SQL migration set under
`extensions/model-memory/migrations/` and is applied to the live logical
database `model_memory`.

## Schema split

Canonical semantic truth:

- `model_memory`

Derived runtime state:

- `runtime_context`

## Canonical schema: `model_memory`

### `sources`

Purpose:

- one row per ingested source envelope

Key columns:

- `id uuid primary key`
- `source_kind text not null`
- `external_source_id text`
- `source_fingerprint text not null`
- `project_id text`
- `session_id text`
- `source_metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null`

Unique constraints:

- unique on `(source_kind, source_fingerprint)`

Indexes:

- index on `source_kind`
- index on `project_id`
- index on `session_id`

### `source_windows`

Purpose:

- one row per normalized bounded source window

Key columns:

- `id uuid primary key`
- `source_id uuid not null`
- `window_index integer not null`
- `normalized_text text not null`
- `normalized_fingerprint text not null`
- `token_estimate integer not null`
- `heading_path jsonb not null default '[]'::jsonb`
- `block_descriptors jsonb not null default '[]'::jsonb`
- `line_start integer`
- `line_end integer`
- `created_at timestamptz not null`

Foreign keys:

- `source_id -> model_memory.sources(id)`

Unique constraints:

- unique on `(source_id, window_index)`

Indexes:

- index on `source_id`
- index on `normalized_fingerprint`

### `memory_objects`

Purpose:

- canonical stored memory truth

Key columns:

- `id uuid primary key`
- `source_window_id uuid not null`
- `canonical_class text not null`
- `kind text not null`
- `payload jsonb not null`
- `normalized_subject text`
- `normalized_title text`
- `normalized_search_text text not null`
- `scope jsonb not null default '{}'::jsonb`
- `scope_key text`
- `provenance jsonb not null`
- `confidence text not null`
- `durability text not null`
- `suggested_review_mode text not null`
- `executed_review_mode text not null`
- `rationale_codes text[] not null default '{}'`
- `identity_key text not null`
- `slot_key text`
- `contract_name text not null`
- `contract_version text not null`
- `model_id text not null`
- `created_at timestamptz not null`
- `superseded_at timestamptz`

Foreign keys:

- `source_window_id -> model_memory.source_windows(id)`

Unique constraints:

- unique on `identity_key`

Indexes:

- index on `canonical_class`
- index on `kind`
- index on `normalized_subject`
- index on `normalized_title`
- index on `scope_key`
- index on `(canonical_class, kind)`
- index on `(slot_key)` where `slot_key is not null`
- GIN full-text index on `normalized_search_text`
- index on `created_at`

### `write_events`

Purpose:

- append-only history of write-path decisions

Key columns:

- `id uuid primary key`
- `source_window_id uuid not null`
- `candidate_identity_key text`
- `decision text not null`
- `memory_object_id uuid`
- `superseded_object_id uuid`
- `decision_codes text[] not null default '{}'`
- `contract_name text not null`
- `contract_version text not null`
- `model_id text not null`
- `created_at timestamptz not null`

Foreign keys:

- `source_window_id -> model_memory.source_windows(id)`
- `memory_object_id -> model_memory.memory_objects(id)`
- `superseded_object_id -> model_memory.memory_objects(id)`

Indexes:

- index on `source_window_id`
- index on `memory_object_id`
- index on `decision`
- index on `created_at`

### `supersession_links`

Purpose:

- explicit lineage from prior object to replacement object

Key columns:

- `id uuid primary key`
- `prior_object_id uuid not null`
- `replacement_object_id uuid not null`
- `reason_code text not null`
- `created_at timestamptz not null`

Foreign keys:

- `prior_object_id -> model_memory.memory_objects(id)`
- `replacement_object_id -> model_memory.memory_objects(id)`

Unique constraints:

- unique on `(prior_object_id, replacement_object_id)`

Indexes:

- index on `prior_object_id`
- index on `replacement_object_id`

## Derived runtime schema: `runtime_context`

### `active_memory_slots`

Purpose:

- current single-valued read model by slot

Key columns:

- `slot_key text primary key`
- `canonical_class text not null`
- `kind text not null`
- `scope_key text`
- `subject_key text`
- `current_object_id uuid not null`
- `current_identity_key text not null`
- `updated_at timestamptz not null`

Foreign keys:

- `current_object_id -> model_memory.memory_objects(id)`

Indexes:

- index on `(canonical_class, kind)`
- index on `scope_key`

### `active_memory_sets`

Purpose:

- current multi-valued read model membership

Key columns:

- `id uuid primary key`
- `set_key text not null`
- `canonical_class text not null`
- `kind text not null`
- `scope_key text`
- `memory_object_id uuid not null`
- `sort_key text not null`
- `updated_at timestamptz not null`

Foreign keys:

- `memory_object_id -> model_memory.memory_objects(id)`

Unique constraints:

- unique on `(set_key, memory_object_id)`

Indexes:

- index on `set_key`
- index on `(canonical_class, kind)`
- index on `scope_key`

### `session_context_state`

Purpose:

- deterministic session working state

Key columns:

- `session_id text primary key`
- `agent_id text not null`
- `active_project_ids jsonb not null default '[]'::jsonb`
- `open_loops jsonb not null default '[]'::jsonb`
- `unresolved_questions jsonb not null default '[]'::jsonb`
- `active_plan_state jsonb not null default '{}'::jsonb`
- `session_summary_artifact_id uuid`
- `projection_versions jsonb not null default '{}'::jsonb`
- `compaction_status text not null default 'delegated'`
- `updated_at timestamptz not null`

Foreign keys:

- `session_summary_artifact_id -> runtime_context.context_artifacts(id)`

Indexes:

- index on `agent_id`
- index on `updated_at`

### `context_artifacts`

Purpose:

- rendered packs and other runtime-consumed artifacts

Key columns:

- `id uuid primary key`
- `artifact_type text not null`
- `scope_key text`
- `source_object_ids uuid[] not null default '{}'`
- `source_slot_keys text[] not null default '{}'`
- `structured_payload jsonb`
- `rendered_text text`
- `content_hash text not null`
- `token_estimate integer not null`
- `build_policy_version text not null`
- `contract_name text`
- `contract_version text`
- `model_id text`
- `built_at timestamptz not null`

Indexes:

- index on `artifact_type`
- index on `scope_key`
- index on `content_hash`

### `workspace_projection_targets`

Purpose:

- declarative configuration for generated targets

Key columns:

- `target_id text primary key`
- `target_kind text not null`
- `relative_path text not null`
- `generated_block_id text`
- `allowed_canonical_classes text[] not null default '{}'`
- `allowed_kinds text[] not null default '{}'`
- `token_budget integer not null`
- `ranking_policy_id text not null`
- `enabled boolean not null default true`

Indexes:

- index on `relative_path`
- index on `enabled`

### `workspace_projection_versions`

Purpose:

- immutable build history for generated projections

Key columns:

- `id uuid primary key`
- `target_id text not null`
- `content_hash text not null`
- `canonical_artifact_path text not null`
- `source_object_ids uuid[] not null default '{}'`
- `source_slot_keys text[] not null default '{}'`
- `source_set_keys text[] not null default '{}'`
- `token_estimate integer not null`
- `built_at timestamptz not null`

Foreign keys:

- `target_id -> runtime_context.workspace_projection_targets(target_id)`

Unique constraints:

- unique on `(target_id, content_hash)`

Indexes:

- index on `target_id`
- index on `built_at`

### `retrieval_requests`

Purpose:

- persisted retrieval-request interpretation records

Key columns:

- `id uuid primary key`
- `session_id text`
- `agent_id text`
- `query_text text not null`
- `request_purpose text not null`
- `scope jsonb not null default '{}'::jsonb`
- `desired_result_count integer not null`
- `contract_name text not null`
- `contract_version text not null`
- `model_id text not null`
- `created_at timestamptz not null`

Indexes:

- index on `session_id`
- index on `agent_id`
- index on `created_at`

### `retrieval_result_sets`

Purpose:

- one row per retrieval result set

Key columns:

- `id uuid primary key`
- `retrieval_request_id uuid not null`
- `content_hash text not null`
- `result_count integer not null`
- `created_at timestamptz not null`

Foreign keys:

- `retrieval_request_id -> runtime_context.retrieval_requests(id)`

Indexes:

- index on `retrieval_request_id`

### `retrieval_result_items`

Purpose:

- object-native members of one retrieval result set

Key columns:

- `id uuid primary key`
- `retrieval_result_set_id uuid not null`
- `memory_object_id uuid not null`
- `rank_index integer not null`
- `rank_band text not null`
- `retrieval_reason_codes text[] not null default '{}'`
- `selected_for_context boolean not null default false`
- `packed_artifact_id uuid`
- `created_at timestamptz not null`

Foreign keys:

- `retrieval_result_set_id -> runtime_context.retrieval_result_sets(id)`
- `memory_object_id -> model_memory.memory_objects(id)`
- `packed_artifact_id -> runtime_context.context_artifacts(id)`

Unique constraints:

- unique on `(retrieval_result_set_id, memory_object_id)`
- unique on `(retrieval_result_set_id, rank_index)`

Indexes:

- index on `retrieval_result_set_id`
- index on `memory_object_id`
- index on `rank_band`

### `context_runs`

Purpose:

- one row per assembled model run

Key columns:

- `id uuid primary key`
- `session_id text not null`
- `agent_id text not null`
- `provider text not null`
- `model text not null`
- `assembled_at timestamptz not null`
- `stable_layer_hash text not null`
- `semi_stable_layer_hash text not null`
- `volatile_layer_hash text not null`
- `estimated_input_tokens integer not null`
- `actual_input_tokens integer`
- `actual_output_tokens integer`
- `cache_read_tokens integer`
- `cache_write_tokens integer`
- `estimated_cost numeric`
- `cache_retention_mode text`
- `prompt_cache_key text`
- `compaction_used boolean not null default false`
- `pruning_used boolean not null default false`

Indexes:

- index on `session_id`
- index on `agent_id`
- index on `assembled_at`

### `context_run_segments`

Purpose:

- per-segment prompt-shape observability

Key columns:

- `id uuid primary key`
- `run_id uuid not null`
- `segment_order integer not null`
- `segment_type text not null`
- `source_artifact_id uuid`
- `projection_version_id uuid`
- `source_kind text`
- `segment_hash text not null`
- `estimated_tokens integer not null`
- `dropped boolean not null default false`
- `trimmed boolean not null default false`
- `trim_reason text`

Foreign keys:

- `run_id -> runtime_context.context_runs(id)`
- `source_artifact_id -> runtime_context.context_artifacts(id)`
- `projection_version_id -> runtime_context.workspace_projection_versions(id)`

Unique constraints:

- unique on `(run_id, segment_order)`

Indexes:

- index on `run_id`
- index on `segment_type`
- index on `segment_hash`

## Deferred persistence

These persistence surfaces are intentionally deferred until their implementation slices exist:

- benchmark/proof artifact persistence
- any embedding-assisted retrieval candidate tables

## Migration sequencing

Recommended order:

1. canonical `model_memory` tables
2. canonical indexes and constraints
3. `runtime_context` read-model tables
4. `runtime_context` projection and usage tables
5. retrieval tables

## Non-goals

- no legacy schema coupling
- no compatibility projection tables as primary truth
- no fuzzy merge tables
