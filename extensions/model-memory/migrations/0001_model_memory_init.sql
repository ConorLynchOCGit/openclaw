CREATE SCHEMA IF NOT EXISTS model_memory;
CREATE SCHEMA IF NOT EXISTS runtime_context;

CREATE TABLE IF NOT EXISTS model_memory.sources (
  id uuid PRIMARY KEY,
  source_kind text NOT NULL,
  external_source_id text,
  source_fingerprint text NOT NULL,
  project_id text,
  session_id text,
  source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS model_memory_sources_kind_fingerprint_idx
  ON model_memory.sources (source_kind, source_fingerprint);
CREATE INDEX IF NOT EXISTS model_memory_sources_kind_idx
  ON model_memory.sources (source_kind);
CREATE INDEX IF NOT EXISTS model_memory_sources_project_idx
  ON model_memory.sources (project_id);
CREATE INDEX IF NOT EXISTS model_memory_sources_session_idx
  ON model_memory.sources (session_id);

CREATE TABLE IF NOT EXISTS model_memory.source_windows (
  id uuid PRIMARY KEY,
  source_id uuid NOT NULL REFERENCES model_memory.sources(id),
  window_index integer NOT NULL,
  normalized_text text NOT NULL,
  normalized_fingerprint text NOT NULL,
  token_estimate integer NOT NULL,
  heading_path jsonb NOT NULL DEFAULT '[]'::jsonb,
  block_descriptors jsonb NOT NULL DEFAULT '[]'::jsonb,
  line_start integer,
  line_end integer,
  created_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS model_memory_source_windows_source_window_idx
  ON model_memory.source_windows (source_id, window_index);
CREATE INDEX IF NOT EXISTS model_memory_source_windows_source_idx
  ON model_memory.source_windows (source_id);
CREATE INDEX IF NOT EXISTS model_memory_source_windows_fingerprint_idx
  ON model_memory.source_windows (normalized_fingerprint);

CREATE TABLE IF NOT EXISTS model_memory.memory_objects (
  id uuid PRIMARY KEY,
  source_window_id uuid NOT NULL REFERENCES model_memory.source_windows(id),
  canonical_class text NOT NULL,
  kind text NOT NULL,
  payload jsonb NOT NULL,
  normalized_subject text,
  normalized_title text,
  normalized_search_text text NOT NULL,
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  scope_key text,
  provenance jsonb NOT NULL,
  confidence text NOT NULL,
  durability text NOT NULL,
  suggested_review_mode text NOT NULL,
  executed_review_mode text NOT NULL,
  rationale_codes text[] NOT NULL DEFAULT '{}'::text[],
  identity_key text NOT NULL,
  slot_key text,
  contract_name text NOT NULL,
  contract_version text NOT NULL,
  model_id text NOT NULL,
  created_at timestamptz NOT NULL,
  superseded_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS model_memory_memory_objects_identity_idx
  ON model_memory.memory_objects (identity_key);
CREATE INDEX IF NOT EXISTS model_memory_memory_objects_class_idx
  ON model_memory.memory_objects (canonical_class);
CREATE INDEX IF NOT EXISTS model_memory_memory_objects_kind_idx
  ON model_memory.memory_objects (kind);
CREATE INDEX IF NOT EXISTS model_memory_memory_objects_subject_idx
  ON model_memory.memory_objects (normalized_subject);
CREATE INDEX IF NOT EXISTS model_memory_memory_objects_title_idx
  ON model_memory.memory_objects (normalized_title);
CREATE INDEX IF NOT EXISTS model_memory_memory_objects_scope_idx
  ON model_memory.memory_objects (scope_key);
CREATE INDEX IF NOT EXISTS model_memory_memory_objects_class_kind_idx
  ON model_memory.memory_objects (canonical_class, kind);
CREATE INDEX IF NOT EXISTS model_memory_memory_objects_slot_idx
  ON model_memory.memory_objects (slot_key)
  WHERE slot_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS model_memory_memory_objects_search_idx
  ON model_memory.memory_objects USING gin (to_tsvector('simple', normalized_search_text));
CREATE INDEX IF NOT EXISTS model_memory_memory_objects_created_idx
  ON model_memory.memory_objects (created_at);

CREATE TABLE IF NOT EXISTS model_memory.write_events (
  id uuid PRIMARY KEY,
  source_window_id uuid NOT NULL REFERENCES model_memory.source_windows(id),
  candidate_identity_key text,
  decision text NOT NULL,
  memory_object_id uuid REFERENCES model_memory.memory_objects(id),
  superseded_object_id uuid REFERENCES model_memory.memory_objects(id),
  decision_codes text[] NOT NULL DEFAULT '{}'::text[],
  contract_name text NOT NULL,
  contract_version text NOT NULL,
  model_id text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS model_memory_write_events_source_window_idx
  ON model_memory.write_events (source_window_id);
CREATE INDEX IF NOT EXISTS model_memory_write_events_object_idx
  ON model_memory.write_events (memory_object_id);
CREATE INDEX IF NOT EXISTS model_memory_write_events_decision_idx
  ON model_memory.write_events (decision);
CREATE INDEX IF NOT EXISTS model_memory_write_events_created_idx
  ON model_memory.write_events (created_at);

CREATE TABLE IF NOT EXISTS model_memory.supersession_links (
  id uuid PRIMARY KEY,
  prior_object_id uuid NOT NULL REFERENCES model_memory.memory_objects(id),
  replacement_object_id uuid NOT NULL REFERENCES model_memory.memory_objects(id),
  reason_code text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS model_memory_supersession_links_pair_idx
  ON model_memory.supersession_links (prior_object_id, replacement_object_id);
CREATE INDEX IF NOT EXISTS model_memory_supersession_links_prior_idx
  ON model_memory.supersession_links (prior_object_id);
CREATE INDEX IF NOT EXISTS model_memory_supersession_links_replacement_idx
  ON model_memory.supersession_links (replacement_object_id);

CREATE TABLE IF NOT EXISTS runtime_context.context_artifacts (
  id uuid PRIMARY KEY,
  artifact_type text NOT NULL,
  scope_key text,
  source_object_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  source_slot_keys text[] NOT NULL DEFAULT '{}'::text[],
  structured_payload jsonb,
  rendered_text text,
  content_hash text NOT NULL,
  token_estimate integer NOT NULL,
  build_policy_version text NOT NULL,
  contract_name text,
  contract_version text,
  model_id text,
  built_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS runtime_context_artifacts_type_idx
  ON runtime_context.context_artifacts (artifact_type);
CREATE INDEX IF NOT EXISTS runtime_context_artifacts_scope_idx
  ON runtime_context.context_artifacts (scope_key);
CREATE INDEX IF NOT EXISTS runtime_context_artifacts_hash_idx
  ON runtime_context.context_artifacts (content_hash);

CREATE TABLE IF NOT EXISTS runtime_context.active_memory_slots (
  slot_key text PRIMARY KEY,
  canonical_class text NOT NULL,
  kind text NOT NULL,
  scope_key text,
  subject_key text,
  current_object_id uuid NOT NULL REFERENCES model_memory.memory_objects(id),
  current_identity_key text NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS runtime_context_slots_class_kind_idx
  ON runtime_context.active_memory_slots (canonical_class, kind);
CREATE INDEX IF NOT EXISTS runtime_context_slots_scope_idx
  ON runtime_context.active_memory_slots (scope_key);

CREATE TABLE IF NOT EXISTS runtime_context.active_memory_sets (
  id uuid PRIMARY KEY,
  set_key text NOT NULL,
  canonical_class text NOT NULL,
  kind text NOT NULL,
  scope_key text,
  memory_object_id uuid NOT NULL REFERENCES model_memory.memory_objects(id),
  sort_key text NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS runtime_context_sets_membership_idx
  ON runtime_context.active_memory_sets (set_key, memory_object_id);
CREATE INDEX IF NOT EXISTS runtime_context_sets_set_idx
  ON runtime_context.active_memory_sets (set_key);
CREATE INDEX IF NOT EXISTS runtime_context_sets_class_kind_idx
  ON runtime_context.active_memory_sets (canonical_class, kind);
CREATE INDEX IF NOT EXISTS runtime_context_sets_scope_idx
  ON runtime_context.active_memory_sets (scope_key);

CREATE TABLE IF NOT EXISTS runtime_context.workspace_projection_targets (
  target_id text PRIMARY KEY,
  target_kind text NOT NULL,
  relative_path text NOT NULL,
  generated_block_id text,
  allowed_canonical_classes text[] NOT NULL DEFAULT '{}'::text[],
  allowed_kinds text[] NOT NULL DEFAULT '{}'::text[],
  token_budget integer NOT NULL,
  ranking_policy_id text NOT NULL,
  enabled boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS runtime_context_projection_targets_path_idx
  ON runtime_context.workspace_projection_targets (relative_path);
CREATE INDEX IF NOT EXISTS runtime_context_projection_targets_enabled_idx
  ON runtime_context.workspace_projection_targets (enabled);

CREATE TABLE IF NOT EXISTS runtime_context.workspace_projection_versions (
  id uuid PRIMARY KEY,
  target_id text NOT NULL REFERENCES runtime_context.workspace_projection_targets(target_id),
  content_hash text NOT NULL,
  canonical_artifact_path text NOT NULL,
  source_object_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  source_slot_keys text[] NOT NULL DEFAULT '{}'::text[],
  source_set_keys text[] NOT NULL DEFAULT '{}'::text[],
  token_estimate integer NOT NULL,
  built_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS runtime_context_projection_versions_target_hash_idx
  ON runtime_context.workspace_projection_versions (target_id, content_hash);
CREATE INDEX IF NOT EXISTS runtime_context_projection_versions_target_idx
  ON runtime_context.workspace_projection_versions (target_id);
CREATE INDEX IF NOT EXISTS runtime_context_projection_versions_built_idx
  ON runtime_context.workspace_projection_versions (built_at);

CREATE TABLE IF NOT EXISTS runtime_context.retrieval_requests (
  id uuid PRIMARY KEY,
  session_id text,
  agent_id text,
  query_text text NOT NULL,
  request_purpose text NOT NULL,
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  desired_result_count integer NOT NULL,
  contract_name text NOT NULL,
  contract_version text NOT NULL,
  model_id text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS runtime_context_retrieval_requests_session_idx
  ON runtime_context.retrieval_requests (session_id);
CREATE INDEX IF NOT EXISTS runtime_context_retrieval_requests_agent_idx
  ON runtime_context.retrieval_requests (agent_id);
CREATE INDEX IF NOT EXISTS runtime_context_retrieval_requests_created_idx
  ON runtime_context.retrieval_requests (created_at);

CREATE TABLE IF NOT EXISTS runtime_context.retrieval_result_sets (
  id uuid PRIMARY KEY,
  retrieval_request_id uuid NOT NULL REFERENCES runtime_context.retrieval_requests(id),
  content_hash text NOT NULL,
  result_count integer NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS runtime_context_retrieval_result_sets_request_idx
  ON runtime_context.retrieval_result_sets (retrieval_request_id);

CREATE TABLE IF NOT EXISTS runtime_context.retrieval_result_items (
  id uuid PRIMARY KEY,
  retrieval_result_set_id uuid NOT NULL REFERENCES runtime_context.retrieval_result_sets(id),
  memory_object_id uuid NOT NULL REFERENCES model_memory.memory_objects(id),
  rank_index integer NOT NULL,
  rank_band text NOT NULL,
  retrieval_reason_codes text[] NOT NULL DEFAULT '{}'::text[],
  selected_for_context boolean NOT NULL DEFAULT false,
  packed_artifact_id uuid REFERENCES runtime_context.context_artifacts(id),
  created_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS runtime_context_retrieval_items_membership_idx
  ON runtime_context.retrieval_result_items (retrieval_result_set_id, memory_object_id);
CREATE UNIQUE INDEX IF NOT EXISTS runtime_context_retrieval_items_rank_idx
  ON runtime_context.retrieval_result_items (retrieval_result_set_id, rank_index);
CREATE INDEX IF NOT EXISTS runtime_context_retrieval_items_set_idx
  ON runtime_context.retrieval_result_items (retrieval_result_set_id);
CREATE INDEX IF NOT EXISTS runtime_context_retrieval_items_object_idx
  ON runtime_context.retrieval_result_items (memory_object_id);
CREATE INDEX IF NOT EXISTS runtime_context_retrieval_items_band_idx
  ON runtime_context.retrieval_result_items (rank_band);

CREATE TABLE IF NOT EXISTS runtime_context.context_runs (
  id uuid PRIMARY KEY,
  session_id text NOT NULL,
  agent_id text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  assembled_at timestamptz NOT NULL,
  stable_layer_hash text NOT NULL,
  semi_stable_layer_hash text NOT NULL,
  volatile_layer_hash text NOT NULL,
  estimated_input_tokens integer NOT NULL,
  actual_input_tokens integer,
  actual_output_tokens integer,
  cache_read_tokens integer,
  cache_write_tokens integer,
  estimated_cost numeric,
  cache_retention_mode text,
  prompt_cache_key text,
  compaction_used boolean NOT NULL DEFAULT false,
  pruning_used boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS runtime_context_runs_session_idx
  ON runtime_context.context_runs (session_id);
CREATE INDEX IF NOT EXISTS runtime_context_runs_agent_idx
  ON runtime_context.context_runs (agent_id);
CREATE INDEX IF NOT EXISTS runtime_context_runs_assembled_idx
  ON runtime_context.context_runs (assembled_at);

CREATE TABLE IF NOT EXISTS runtime_context.context_run_segments (
  id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES runtime_context.context_runs(id),
  segment_order integer NOT NULL,
  segment_type text NOT NULL,
  source_artifact_id uuid REFERENCES runtime_context.context_artifacts(id),
  projection_version_id uuid REFERENCES runtime_context.workspace_projection_versions(id),
  source_kind text,
  segment_hash text NOT NULL,
  estimated_tokens integer NOT NULL,
  dropped boolean NOT NULL DEFAULT false,
  trimmed boolean NOT NULL DEFAULT false,
  trim_reason text
);

CREATE UNIQUE INDEX IF NOT EXISTS runtime_context_run_segments_order_idx
  ON runtime_context.context_run_segments (run_id, segment_order);
CREATE INDEX IF NOT EXISTS runtime_context_run_segments_run_idx
  ON runtime_context.context_run_segments (run_id);
CREATE INDEX IF NOT EXISTS runtime_context_run_segments_type_idx
  ON runtime_context.context_run_segments (segment_type);
CREATE INDEX IF NOT EXISTS runtime_context_run_segments_hash_idx
  ON runtime_context.context_run_segments (segment_hash);

CREATE TABLE IF NOT EXISTS runtime_context.session_context_state (
  session_id text PRIMARY KEY,
  agent_id text NOT NULL,
  active_project_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  open_loops jsonb NOT NULL DEFAULT '[]'::jsonb,
  unresolved_questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  active_plan_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  session_summary_artifact_id uuid REFERENCES runtime_context.context_artifacts(id),
  projection_versions jsonb NOT NULL DEFAULT '{}'::jsonb,
  compaction_status text NOT NULL DEFAULT 'delegated',
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS runtime_context_session_state_agent_idx
  ON runtime_context.session_context_state (agent_id);
CREATE INDEX IF NOT EXISTS runtime_context_session_state_updated_idx
  ON runtime_context.session_context_state (updated_at);
