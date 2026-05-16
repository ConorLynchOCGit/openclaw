CREATE TABLE IF NOT EXISTS execution_platform.runtime_tool_definitions (
  tool_id text NOT NULL,
  tool_version text NOT NULL,
  tool_family text NOT NULL,
  executor_key text NOT NULL,
  schema_ref text NOT NULL,
  authority_class text NOT NULL,
  storage_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_prompt_stored boolean NOT NULL DEFAULT false,
  raw_response_stored boolean NOT NULL DEFAULT false,
  raw_transcript_stored boolean NOT NULL DEFAULT false,
  raw_logs_stored boolean NOT NULL DEFAULT false,
  secrets_stored boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (tool_id, tool_version),
  CONSTRAINT runtime_tool_definition_no_raw_check CHECK (
    raw_prompt_stored = false
    AND raw_response_stored = false
    AND raw_transcript_stored = false
    AND raw_logs_stored = false
    AND secrets_stored = false
  )
);

CREATE INDEX IF NOT EXISTS runtime_tool_definitions_family_idx
  ON execution_platform.runtime_tool_definitions (tool_family, enabled, tool_id);

CREATE TABLE IF NOT EXISTS execution_platform.runtime_tool_invocations (
  invocation_id text PRIMARY KEY,
  runtime_job_id text REFERENCES execution_platform.runtime_jobs(job_id) ON DELETE SET NULL,
  graph_id text REFERENCES execution_platform.runtime_work_graphs(graph_id) ON DELETE SET NULL,
  node_id text REFERENCES execution_platform.runtime_work_graph_nodes(node_id) ON DELETE SET NULL,
  parent_invocation_id text REFERENCES execution_platform.runtime_tool_invocations(invocation_id) ON DELETE SET NULL,
  tool_id text NOT NULL,
  tool_version text NOT NULL,
  tool_family text NOT NULL,
  executor_key text NOT NULL,
  role_ref text,
  model_ref text,
  provider_ref text,
  status text NOT NULL,
  idempotency_scope text NOT NULL,
  idempotency_key text NOT NULL,
  input_ref text,
  input_hash text,
  input_summary text NOT NULL,
  output_ref text,
  output_hash text,
  output_summary text,
  error_code text,
  error_summary text,
  budget_ref text,
  budget_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_prompt_stored boolean NOT NULL DEFAULT false,
  raw_response_stored boolean NOT NULL DEFAULT false,
  raw_transcript_stored boolean NOT NULL DEFAULT false,
  raw_provider_log_stored boolean NOT NULL DEFAULT false,
  raw_tool_log_stored boolean NOT NULL DEFAULT false,
  raw_command_log_stored boolean NOT NULL DEFAULT false,
  raw_db_rows_stored boolean NOT NULL DEFAULT false,
  secrets_stored boolean NOT NULL DEFAULT false,
  authority_granted boolean NOT NULL DEFAULT false,
  controls_applied boolean NOT NULL DEFAULT false,
  work_queue_lifecycle_mutated boolean NOT NULL DEFAULT false,
  runtime_lifecycle_mutated boolean NOT NULL DEFAULT false,
  started_at timestamptz,
  completed_at timestamptz,
  latency_ms integer,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (idempotency_scope, idempotency_key),
  CONSTRAINT runtime_tool_invocation_status_check CHECK (
    status IN ('planned', 'running', 'succeeded', 'needs_review', 'failed', 'canceled', 'skipped')
  ),
  CONSTRAINT runtime_tool_invocation_latency_check CHECK (latency_ms IS NULL OR latency_ms >= 0),
  CONSTRAINT runtime_tool_invocation_no_raw_check CHECK (
    raw_prompt_stored = false
    AND raw_response_stored = false
    AND raw_transcript_stored = false
    AND raw_provider_log_stored = false
    AND raw_tool_log_stored = false
    AND raw_command_log_stored = false
    AND raw_db_rows_stored = false
    AND secrets_stored = false
    AND authority_granted = false
    AND controls_applied = false
    AND work_queue_lifecycle_mutated = false
    AND runtime_lifecycle_mutated = false
  )
);

CREATE INDEX IF NOT EXISTS runtime_tool_invocations_runtime_job_idx
  ON execution_platform.runtime_tool_invocations (runtime_job_id, created_at, invocation_id)
  WHERE runtime_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS runtime_tool_invocations_graph_node_idx
  ON execution_platform.runtime_tool_invocations (graph_id, node_id, created_at, invocation_id)
  WHERE graph_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS runtime_tool_invocations_status_idx
  ON execution_platform.runtime_tool_invocations (status, created_at, invocation_id);

CREATE INDEX IF NOT EXISTS runtime_tool_invocations_tool_idx
  ON execution_platform.runtime_tool_invocations (tool_id, tool_version, created_at, invocation_id);

CREATE TABLE IF NOT EXISTS execution_platform.runtime_tool_events (
  event_id text PRIMARY KEY,
  invocation_id text NOT NULL REFERENCES execution_platform.runtime_tool_invocations(invocation_id) ON DELETE CASCADE,
  runtime_job_id text REFERENCES execution_platform.runtime_jobs(job_id) ON DELETE SET NULL,
  graph_id text REFERENCES execution_platform.runtime_work_graphs(graph_id) ON DELETE SET NULL,
  node_id text REFERENCES execution_platform.runtime_work_graph_nodes(node_id) ON DELETE SET NULL,
  event_type text NOT NULL,
  phase text NOT NULL,
  status text NOT NULL,
  message_summary text NOT NULL,
  evidence_ref text,
  evidence_hash text,
  reason_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_prompt_stored boolean NOT NULL DEFAULT false,
  raw_response_stored boolean NOT NULL DEFAULT false,
  raw_transcript_stored boolean NOT NULL DEFAULT false,
  raw_provider_log_stored boolean NOT NULL DEFAULT false,
  raw_tool_log_stored boolean NOT NULL DEFAULT false,
  raw_command_log_stored boolean NOT NULL DEFAULT false,
  raw_db_rows_stored boolean NOT NULL DEFAULT false,
  secrets_stored boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL,
  CONSTRAINT runtime_tool_event_status_check CHECK (
    status IN ('planned', 'running', 'succeeded', 'needs_review', 'failed', 'canceled', 'skipped')
  ),
  CONSTRAINT runtime_tool_event_no_raw_check CHECK (
    raw_prompt_stored = false
    AND raw_response_stored = false
    AND raw_transcript_stored = false
    AND raw_provider_log_stored = false
    AND raw_tool_log_stored = false
    AND raw_command_log_stored = false
    AND raw_db_rows_stored = false
    AND secrets_stored = false
  )
);

CREATE INDEX IF NOT EXISTS runtime_tool_events_invocation_idx
  ON execution_platform.runtime_tool_events (invocation_id, created_at, event_id);

CREATE INDEX IF NOT EXISTS runtime_tool_events_runtime_job_idx
  ON execution_platform.runtime_tool_events (runtime_job_id, created_at, event_id)
  WHERE runtime_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS runtime_tool_events_graph_node_idx
  ON execution_platform.runtime_tool_events (graph_id, node_id, created_at, event_id)
  WHERE graph_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS execution_platform.runtime_tool_artifacts (
  artifact_id text PRIMARY KEY,
  invocation_id text NOT NULL REFERENCES execution_platform.runtime_tool_invocations(invocation_id) ON DELETE CASCADE,
  artifact_type text NOT NULL,
  storage_kind text NOT NULL,
  artifact_ref text NOT NULL,
  content_hash text NOT NULL,
  bounded_summary text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_content_stored boolean NOT NULL DEFAULT false,
  raw_prompt_stored boolean NOT NULL DEFAULT false,
  raw_response_stored boolean NOT NULL DEFAULT false,
  raw_logs_stored boolean NOT NULL DEFAULT false,
  secrets_stored boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL,
  CONSTRAINT runtime_tool_artifact_no_raw_check CHECK (
    raw_content_stored = false
    AND raw_prompt_stored = false
    AND raw_response_stored = false
    AND raw_logs_stored = false
    AND secrets_stored = false
  )
);

CREATE INDEX IF NOT EXISTS runtime_tool_artifacts_invocation_idx
  ON execution_platform.runtime_tool_artifacts (invocation_id, created_at, artifact_id);
