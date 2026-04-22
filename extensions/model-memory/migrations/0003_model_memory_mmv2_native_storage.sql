CREATE TABLE IF NOT EXISTS model_memory.ingest_sources (
  id text PRIMARY KEY,
  source_kind text NOT NULL,
  external_source_id text,
  source_fingerprint text NOT NULL,
  project_id text,
  session_id text,
  source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS model_memory_ingest_sources_kind_fingerprint_idx
  ON model_memory.ingest_sources (source_kind, source_fingerprint);
CREATE INDEX IF NOT EXISTS model_memory_ingest_sources_kind_idx
  ON model_memory.ingest_sources (source_kind);
CREATE INDEX IF NOT EXISTS model_memory_ingest_sources_project_idx
  ON model_memory.ingest_sources (project_id);
CREATE INDEX IF NOT EXISTS model_memory_ingest_sources_session_idx
  ON model_memory.ingest_sources (session_id);

CREATE TABLE IF NOT EXISTS model_memory.ingest_segments (
  id text PRIMARY KEY,
  source_id text NOT NULL REFERENCES model_memory.ingest_sources(id) ON DELETE CASCADE,
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

CREATE UNIQUE INDEX IF NOT EXISTS model_memory_ingest_segments_source_window_idx
  ON model_memory.ingest_segments (source_id, window_index);
CREATE INDEX IF NOT EXISTS model_memory_ingest_segments_source_idx
  ON model_memory.ingest_segments (source_id);
CREATE INDEX IF NOT EXISTS model_memory_ingest_segments_fingerprint_idx
  ON model_memory.ingest_segments (normalized_fingerprint);

CREATE TABLE IF NOT EXISTS model_memory.durable_memories (
  memory_id text PRIMARY KEY,
  schema_version text NOT NULL,
  status text NOT NULL,
  unit_type text NOT NULL,
  kind text,
  artifact_type text,
  canonical_text text NOT NULL,
  canonical_text_lc text GENERATED ALWAYS AS (lower(canonical_text)) STORED,
  search_text text NOT NULL,
  tenant_id text NOT NULL,
  user_id text NOT NULL,
  project_id text,
  workspace_id text,
  subject_type text NOT NULL,
  subject_id text,
  applies_to text NOT NULL,
  payload jsonb NOT NULL,
  validity jsonb NOT NULL,
  confidence double precision NOT NULL,
  quality jsonb NOT NULL,
  source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  lineage jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  last_accessed_at timestamptz,
  access_count integer NOT NULL DEFAULT 0,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS model_memory_durable_memories_status_idx
  ON model_memory.durable_memories (status);
CREATE INDEX IF NOT EXISTS model_memory_durable_memories_unit_type_idx
  ON model_memory.durable_memories (unit_type);
CREATE INDEX IF NOT EXISTS model_memory_durable_memories_kind_idx
  ON model_memory.durable_memories (kind);
CREATE INDEX IF NOT EXISTS model_memory_durable_memories_artifact_type_idx
  ON model_memory.durable_memories (artifact_type);
CREATE INDEX IF NOT EXISTS model_memory_durable_memories_scope_project_idx
  ON model_memory.durable_memories (project_id);
CREATE INDEX IF NOT EXISTS model_memory_durable_memories_scope_workspace_idx
  ON model_memory.durable_memories (workspace_id);
CREATE INDEX IF NOT EXISTS model_memory_durable_memories_scope_subject_idx
  ON model_memory.durable_memories (subject_type, subject_id);
CREATE INDEX IF NOT EXISTS model_memory_durable_memories_applies_to_idx
  ON model_memory.durable_memories (applies_to);
CREATE INDEX IF NOT EXISTS model_memory_durable_memories_canonical_text_idx
  ON model_memory.durable_memories (canonical_text_lc);
CREATE INDEX IF NOT EXISTS model_memory_durable_memories_search_idx
  ON model_memory.durable_memories USING gin (to_tsvector('simple', canonical_text || ' ' || search_text));
CREATE INDEX IF NOT EXISTS model_memory_durable_memories_updated_idx
  ON model_memory.durable_memories (updated_at DESC);

CREATE TABLE IF NOT EXISTS model_memory.memory_events (
  memory_event_id text PRIMARY KEY,
  schema_version text NOT NULL,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  actor text NOT NULL,
  source_ingest_event_id text NOT NULL,
  candidate_id text,
  memory_id text REFERENCES model_memory.durable_memories(memory_id) ON DELETE SET NULL,
  target_memory_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS model_memory_memory_events_memory_idx
  ON model_memory.memory_events (memory_id);
CREATE INDEX IF NOT EXISTS model_memory_memory_events_type_idx
  ON model_memory.memory_events (event_type);
CREATE INDEX IF NOT EXISTS model_memory_memory_events_occurred_idx
  ON model_memory.memory_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS model_memory_memory_events_source_ingest_idx
  ON model_memory.memory_events (source_ingest_event_id);

CREATE TABLE IF NOT EXISTS model_memory.memory_edges (
  edge_id text PRIMARY KEY,
  schema_version text NOT NULL,
  from_memory_id text NOT NULL REFERENCES model_memory.durable_memories(memory_id) ON DELETE CASCADE,
  to_memory_id text NOT NULL REFERENCES model_memory.durable_memories(memory_id) ON DELETE CASCADE,
  edge_type text NOT NULL,
  created_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS model_memory_memory_edges_pair_type_idx
  ON model_memory.memory_edges (from_memory_id, to_memory_id, edge_type);
CREATE INDEX IF NOT EXISTS model_memory_memory_edges_from_idx
  ON model_memory.memory_edges (from_memory_id);
CREATE INDEX IF NOT EXISTS model_memory_memory_edges_to_idx
  ON model_memory.memory_edges (to_memory_id);
CREATE INDEX IF NOT EXISTS model_memory_memory_edges_type_idx
  ON model_memory.memory_edges (edge_type);
