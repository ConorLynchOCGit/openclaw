CREATE TABLE IF NOT EXISTS execution_platform.runtime_work_graphs (
  graph_id text PRIMARY KEY,
  parent_work_item_id text REFERENCES execution_platform.work_items(work_item_id) ON DELETE SET NULL,
  root_runtime_job_id text REFERENCES execution_platform.runtime_jobs(job_id) ON DELETE SET NULL,
  workflow_id text NOT NULL,
  orchestrator_model_ref text NOT NULL,
  graph_status text NOT NULL,
  budget_ledger_ref text,
  checkpoint_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  final_closeout_ref text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_prompt_stored boolean NOT NULL DEFAULT false,
  raw_response_stored boolean NOT NULL DEFAULT false,
  raw_logs_stored boolean NOT NULL DEFAULT false,
  work_queue_lifecycle_mutated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT runtime_work_graph_status_check CHECK (
    graph_status IN ('planned', 'running', 'waiting_for_human', 'needs_review', 'succeeded', 'failed', 'canceled')
  ),
  CONSTRAINT runtime_work_graph_no_raw_check CHECK (
    raw_prompt_stored = false
    AND raw_response_stored = false
    AND raw_logs_stored = false
    AND work_queue_lifecycle_mutated = false
  )
);

CREATE TABLE IF NOT EXISTS execution_platform.runtime_work_graph_nodes (
  node_id text PRIMARY KEY,
  graph_id text NOT NULL REFERENCES execution_platform.runtime_work_graphs(graph_id) ON DELETE CASCADE,
  node_kind text NOT NULL,
  assigned_role text NOT NULL,
  model_or_worker_ref text,
  runtime_job_id text REFERENCES execution_platform.runtime_jobs(job_id) ON DELETE SET NULL,
  human_task_id text,
  input_handoff_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  output_artifact_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  node_status text NOT NULL,
  budget_usage jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_prompt_stored boolean NOT NULL DEFAULT false,
  raw_response_stored boolean NOT NULL DEFAULT false,
  raw_logs_stored boolean NOT NULL DEFAULT false,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT runtime_work_graph_node_status_check CHECK (
    node_status IN ('planned', 'running', 'waiting_for_human', 'needs_review', 'succeeded', 'failed', 'skipped')
  ),
  CONSTRAINT runtime_work_graph_node_no_raw_check CHECK (
    raw_prompt_stored = false AND raw_response_stored = false AND raw_logs_stored = false
  )
);

CREATE INDEX IF NOT EXISTS runtime_work_graph_nodes_graph_idx
  ON execution_platform.runtime_work_graph_nodes (graph_id, created_at, node_id);

CREATE TABLE IF NOT EXISTS execution_platform.runtime_work_graph_edges (
  edge_id text PRIMARY KEY,
  graph_id text NOT NULL REFERENCES execution_platform.runtime_work_graphs(graph_id) ON DELETE CASCADE,
  from_node_id text REFERENCES execution_platform.runtime_work_graph_nodes(node_id) ON DELETE CASCADE,
  to_node_id text REFERENCES execution_platform.runtime_work_graph_nodes(node_id) ON DELETE CASCADE,
  edge_kind text NOT NULL,
  reason_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  artifact_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  CONSTRAINT runtime_work_graph_edge_kind_check CHECK (
    edge_kind IN (
      'depends_on',
      'handoff',
      'context_supplies',
      'synthesis_groups',
      'implementation_depends_on',
      'validation_depends_on',
      'review_depends_on',
      'closeout_depends_on',
      'human_decision_blocks',
      'proof_depends_on',
      'validation_failed',
      'repair_requested',
      'escalation',
      'human_wait',
      'human_resume',
      'continuation',
      'closeout_source'
    )
  )
);

CREATE INDEX IF NOT EXISTS runtime_work_graph_edges_graph_idx
  ON execution_platform.runtime_work_graph_edges (graph_id, created_at, edge_id);

CREATE TABLE IF NOT EXISTS execution_platform.runtime_work_graph_role_invocations (
  invocation_id text PRIMARY KEY,
  graph_id text NOT NULL REFERENCES execution_platform.runtime_work_graphs(graph_id) ON DELETE CASCADE,
  node_id text REFERENCES execution_platform.runtime_work_graph_nodes(node_id) ON DELETE SET NULL,
  role_id text NOT NULL,
  model_ref text,
  worker_ref text,
  provider_path text NOT NULL,
  transport_kind text NOT NULL,
  model_run_ref text,
  artifact_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  output_hash text NOT NULL,
  latency_ms integer NOT NULL,
  budget_usage jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_prompt_stored boolean NOT NULL DEFAULT false,
  raw_response_stored boolean NOT NULL DEFAULT false,
  raw_provider_log_stored boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL,
  CONSTRAINT runtime_work_graph_role_invocation_latency_check CHECK (latency_ms >= 0),
  CONSTRAINT runtime_work_graph_role_invocation_no_raw_check CHECK (
    raw_prompt_stored = false
    AND raw_response_stored = false
    AND raw_provider_log_stored = false
  )
);

CREATE INDEX IF NOT EXISTS runtime_work_graph_role_invocations_graph_idx
  ON execution_platform.runtime_work_graph_role_invocations (graph_id, created_at, invocation_id);

CREATE TABLE IF NOT EXISTS execution_platform.runtime_work_graph_handoff_packets (
  handoff_id text PRIMARY KEY,
  graph_id text NOT NULL REFERENCES execution_platform.runtime_work_graphs(graph_id) ON DELETE CASCADE,
  from_node_id text REFERENCES execution_platform.runtime_work_graph_nodes(node_id) ON DELETE SET NULL,
  to_node_id text REFERENCES execution_platform.runtime_work_graph_nodes(node_id) ON DELETE SET NULL,
  summary text NOT NULL,
  artifact_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  validation_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  decision_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  unresolved_questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  limitations jsonb NOT NULL DEFAULT '[]'::jsonb,
  context_pack_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_prompt_stored boolean NOT NULL DEFAULT false,
  raw_response_stored boolean NOT NULL DEFAULT false,
  raw_logs_stored boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL,
  CONSTRAINT runtime_work_graph_handoff_no_raw_check CHECK (
    raw_prompt_stored = false AND raw_response_stored = false AND raw_logs_stored = false
  )
);

CREATE INDEX IF NOT EXISTS runtime_work_graph_handoff_graph_idx
  ON execution_platform.runtime_work_graph_handoff_packets (graph_id, created_at, handoff_id);

CREATE TABLE IF NOT EXISTS execution_platform.runtime_work_graph_artifact_manifests (
  manifest_id text PRIMARY KEY,
  graph_id text NOT NULL REFERENCES execution_platform.runtime_work_graphs(graph_id) ON DELETE CASCADE,
  node_id text REFERENCES execution_platform.runtime_work_graph_nodes(node_id) ON DELETE SET NULL,
  artifact_type text NOT NULL,
  storage_ref text NOT NULL,
  content_hash text NOT NULL,
  byte_count integer NOT NULL,
  bounded_summary text NOT NULL,
  part_number integer NOT NULL DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_content_stored boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL,
  CONSTRAINT runtime_work_graph_artifact_manifest_bounds_check CHECK (
    byte_count >= 0 AND part_number > 0 AND raw_content_stored = false
  )
);

CREATE INDEX IF NOT EXISTS runtime_work_graph_artifact_manifests_graph_idx
  ON execution_platform.runtime_work_graph_artifact_manifests (graph_id, created_at, manifest_id);

CREATE TABLE IF NOT EXISTS execution_platform.runtime_work_graph_budget_ledgers (
  ledger_id text PRIMARY KEY,
  graph_id text NOT NULL REFERENCES execution_platform.runtime_work_graphs(graph_id) ON DELETE CASCADE,
  scope_kind text NOT NULL,
  scope_ref text NOT NULL,
  wall_time_ms integer NOT NULL DEFAULT 0,
  lease_renewal_count integer NOT NULL DEFAULT 0,
  model_timeout_ms integer,
  max_output_tokens integer,
  retry_count integer NOT NULL DEFAULT 0,
  continuation_count integer NOT NULL DEFAULT 0,
  validation_repair_count integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT runtime_work_graph_budget_nonnegative_check CHECK (
    wall_time_ms >= 0
    AND lease_renewal_count >= 0
    AND retry_count >= 0
    AND continuation_count >= 0
    AND validation_repair_count >= 0
    AND (model_timeout_ms IS NULL OR model_timeout_ms > 0)
    AND (max_output_tokens IS NULL OR max_output_tokens > 0)
  )
);

CREATE INDEX IF NOT EXISTS runtime_work_graph_budget_ledgers_graph_idx
  ON execution_platform.runtime_work_graph_budget_ledgers (graph_id, created_at, ledger_id);

CREATE TABLE IF NOT EXISTS execution_platform.runtime_work_graph_checkpoints (
  checkpoint_id text PRIMARY KEY,
  graph_id text NOT NULL REFERENCES execution_platform.runtime_work_graphs(graph_id) ON DELETE CASCADE,
  checkpoint_kind text NOT NULL,
  state_summary text NOT NULL,
  artifact_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  budget_ledger_ref text,
  raw_prompt_stored boolean NOT NULL DEFAULT false,
  raw_response_stored boolean NOT NULL DEFAULT false,
  raw_logs_stored boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL,
  CONSTRAINT runtime_work_graph_checkpoint_no_raw_check CHECK (
    raw_prompt_stored = false AND raw_response_stored = false AND raw_logs_stored = false
  )
);

CREATE INDEX IF NOT EXISTS runtime_work_graph_checkpoints_graph_idx
  ON execution_platform.runtime_work_graph_checkpoints (graph_id, created_at, checkpoint_id);

CREATE TABLE IF NOT EXISTS execution_platform.runtime_work_graph_human_tasks (
  human_task_id text PRIMARY KEY,
  graph_id text NOT NULL REFERENCES execution_platform.runtime_work_graphs(graph_id) ON DELETE CASCADE,
  node_id text REFERENCES execution_platform.runtime_work_graph_nodes(node_id) ON DELETE SET NULL,
  operator_id text NOT NULL,
  prompt_summary text NOT NULL,
  required_response_shape jsonb NOT NULL DEFAULT '{}'::jsonb,
  deadline_at timestamptz,
  blocking_node_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  resume_token_hash text NOT NULL,
  bounded_response_ref text,
  decision_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  task_status text NOT NULL,
  raw_prompt_stored boolean NOT NULL DEFAULT false,
  raw_response_stored boolean NOT NULL DEFAULT false,
  raw_logs_stored boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT runtime_work_graph_human_task_status_check CHECK (
    task_status IN ('waiting', 'resumed', 'expired', 'needs_review', 'canceled')
  ),
  CONSTRAINT runtime_work_graph_human_task_no_raw_check CHECK (
    raw_prompt_stored = false AND raw_response_stored = false AND raw_logs_stored = false
  )
);

CREATE INDEX IF NOT EXISTS runtime_work_graph_human_tasks_graph_idx
  ON execution_platform.runtime_work_graph_human_tasks (graph_id, created_at, human_task_id);
