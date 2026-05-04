CREATE TABLE IF NOT EXISTS execution_platform.work_items (
  work_item_id text PRIMARY KEY,
  item_type text NOT NULL,
  title text NOT NULL,
  description text,
  lifecycle_state text NOT NULL DEFAULT 'draft',
  current_version_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_items_lifecycle_state_check CHECK (
    lifecycle_state IN ('draft', 'manual_ready', 'blocked', 'running', 'succeeded', 'failed', 'canceled')
  )
);

CREATE INDEX IF NOT EXISTS work_items_state_updated_idx
  ON execution_platform.work_items (lifecycle_state, updated_at DESC, work_item_id);

CREATE TABLE IF NOT EXISTS execution_platform.work_item_versions (
  version_id text PRIMARY KEY,
  work_item_id text NOT NULL REFERENCES execution_platform.work_items(work_item_id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  version_state text NOT NULL DEFAULT 'draft',
  title text,
  body text,
  artifact_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz,
  CONSTRAINT work_item_versions_number_check CHECK (version_number > 0),
  CONSTRAINT work_item_versions_state_check CHECK (version_state IN ('draft', 'finalized')),
  UNIQUE (work_item_id, version_number)
);

CREATE INDEX IF NOT EXISTS work_item_versions_item_number_idx
  ON execution_platform.work_item_versions (work_item_id, version_number DESC);

ALTER TABLE execution_platform.work_items
  ADD CONSTRAINT work_items_current_version_fk
  FOREIGN KEY (current_version_id)
  REFERENCES execution_platform.work_item_versions(version_id)
  ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS execution_platform.work_item_artifacts (
  artifact_id text PRIMARY KEY,
  work_item_id text NOT NULL REFERENCES execution_platform.work_items(work_item_id) ON DELETE CASCADE,
  version_id text REFERENCES execution_platform.work_item_versions(version_id) ON DELETE SET NULL,
  artifact_type text NOT NULL,
  storage_kind text NOT NULL,
  uri text NOT NULL,
  content_type text,
  size_bytes bigint,
  sha256 text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS work_item_artifacts_item_created_idx
  ON execution_platform.work_item_artifacts (work_item_id, created_at, artifact_id);

CREATE TABLE IF NOT EXISTS execution_platform.work_item_events (
  event_id text PRIMARY KEY,
  work_item_id text NOT NULL REFERENCES execution_platform.work_items(work_item_id) ON DELETE CASCADE,
  run_id text,
  step_id text,
  event_type text NOT NULL,
  lifecycle_state text,
  event_time timestamptz NOT NULL,
  actor_id text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT work_item_events_lifecycle_state_check CHECK (
    lifecycle_state IS NULL OR lifecycle_state IN ('draft', 'manual_ready', 'blocked', 'running', 'succeeded', 'failed', 'canceled')
  )
);

CREATE INDEX IF NOT EXISTS work_item_events_item_time_idx
  ON execution_platform.work_item_events (work_item_id, event_time, event_id);

CREATE TABLE IF NOT EXISTS execution_platform.work_runs (
  run_id text PRIMARY KEY,
  work_item_id text NOT NULL REFERENCES execution_platform.work_items(work_item_id) ON DELETE CASCADE,
  executor_kind text NOT NULL,
  runtime_job_id text REFERENCES execution_platform.runtime_jobs(job_id) ON DELETE SET NULL,
  runtime_job_type text,
  run_state text NOT NULL DEFAULT 'pending',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_runs_executor_kind_check CHECK (
    executor_kind IN ('runtime_job', 'model_task', 'db_operation', 'future_executor_placeholder')
  ),
  CONSTRAINT work_runs_state_check CHECK (
    run_state IN ('pending', 'running', 'succeeded', 'failed', 'canceled')
  ),
  CONSTRAINT work_runs_runtime_evidence_check CHECK (
    runtime_job_id IS NOT NULL OR run_state = 'pending'
  )
);

CREATE INDEX IF NOT EXISTS work_runs_item_created_idx
  ON execution_platform.work_runs (work_item_id, created_at, run_id);

CREATE INDEX IF NOT EXISTS work_runs_runtime_job_idx
  ON execution_platform.work_runs (runtime_job_id);

CREATE TABLE IF NOT EXISTS execution_platform.work_steps (
  step_id text PRIMARY KEY,
  run_id text NOT NULL REFERENCES execution_platform.work_runs(run_id) ON DELETE CASCADE,
  work_item_id text NOT NULL REFERENCES execution_platform.work_items(work_item_id) ON DELETE CASCADE,
  step_type text NOT NULL,
  step_name text NOT NULL,
  step_state text NOT NULL DEFAULT 'pending',
  runtime_job_id text REFERENCES execution_platform.runtime_jobs(job_id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  error jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_steps_state_check CHECK (
    step_state IN ('pending', 'running', 'succeeded', 'failed', 'canceled', 'skipped')
  ),
  CONSTRAINT work_steps_runtime_evidence_check CHECK (
    runtime_job_id IS NOT NULL OR step_state IN ('pending', 'skipped')
  )
);

CREATE INDEX IF NOT EXISTS work_steps_run_created_idx
  ON execution_platform.work_steps (run_id, created_at, step_id);

CREATE TABLE IF NOT EXISTS execution_platform.work_item_assignments (
  assignment_id text PRIMARY KEY,
  work_item_id text NOT NULL REFERENCES execution_platform.work_items(work_item_id) ON DELETE CASCADE,
  assignee_type text NOT NULL,
  assignee_id text NOT NULL,
  role text NOT NULL DEFAULT 'owner',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS work_item_assignments_item_idx
  ON execution_platform.work_item_assignments (work_item_id, created_at, assignment_id);

CREATE TABLE IF NOT EXISTS execution_platform.work_item_dependencies (
  dependency_id text PRIMARY KEY,
  work_item_id text NOT NULL REFERENCES execution_platform.work_items(work_item_id) ON DELETE CASCADE,
  depends_on_work_item_id text NOT NULL REFERENCES execution_platform.work_items(work_item_id) ON DELETE CASCADE,
  dependency_type text NOT NULL DEFAULT 'blocks',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_item_dependencies_not_self_check CHECK (work_item_id <> depends_on_work_item_id),
  UNIQUE (work_item_id, depends_on_work_item_id, dependency_type)
);

CREATE INDEX IF NOT EXISTS work_item_dependencies_item_idx
  ON execution_platform.work_item_dependencies (work_item_id, created_at, dependency_id);

CREATE TABLE IF NOT EXISTS execution_platform.work_item_parent_workflow_links (
  link_id text PRIMARY KEY,
  work_item_id text NOT NULL REFERENCES execution_platform.work_items(work_item_id) ON DELETE CASCADE,
  parent_workflow_id text NOT NULL,
  parent_workflow_kind text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (work_item_id, parent_workflow_id, parent_workflow_kind)
);

CREATE INDEX IF NOT EXISTS work_item_parent_workflow_links_item_idx
  ON execution_platform.work_item_parent_workflow_links (work_item_id, created_at, link_id);
