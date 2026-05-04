CREATE SCHEMA IF NOT EXISTS execution_platform;

CREATE TABLE IF NOT EXISTS execution_platform.runtime_jobs (
  job_id text PRIMARY KEY,
  job_type text NOT NULL,
  queue_name text NOT NULL DEFAULT 'default',
  priority integer NOT NULL DEFAULT 0,
  state text NOT NULL DEFAULT 'pending',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  error jsonb,
  idempotency_scope text NOT NULL,
  idempotency_key text NOT NULL,
  parent_job_id text REFERENCES execution_platform.runtime_jobs(job_id) ON DELETE SET NULL,
  parent_workflow_id text,
  work_item_id text,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  lease_timeout_ms integer NOT NULL DEFAULT 30000,
  run_timeout_ms integer,
  available_at timestamptz NOT NULL DEFAULT now(),
  deadline_at timestamptz,
  worker_id text,
  lease_id text,
  lease_expires_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  canceled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT runtime_jobs_state_check CHECK (
    state IN ('pending', 'running', 'succeeded', 'failed', 'canceled', 'timed_out')
  ),
  CONSTRAINT runtime_jobs_attempts_check CHECK (attempts >= 0 AND max_attempts > 0),
  CONSTRAINT runtime_jobs_lease_timeout_check CHECK (lease_timeout_ms > 0),
  CONSTRAINT runtime_jobs_run_timeout_check CHECK (run_timeout_ms IS NULL OR run_timeout_ms > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS runtime_jobs_idempotency_idx
  ON execution_platform.runtime_jobs (idempotency_scope, idempotency_key);

CREATE INDEX IF NOT EXISTS runtime_jobs_claim_idx
  ON execution_platform.runtime_jobs (queue_name, state, available_at, priority DESC, created_at);

CREATE INDEX IF NOT EXISTS runtime_jobs_parent_job_idx
  ON execution_platform.runtime_jobs (parent_job_id);

CREATE INDEX IF NOT EXISTS runtime_jobs_state_updated_idx
  ON execution_platform.runtime_jobs (state, updated_at);

CREATE TABLE IF NOT EXISTS execution_platform.runtime_job_leases (
  lease_id text PRIMARY KEY,
  job_id text NOT NULL REFERENCES execution_platform.runtime_jobs(job_id) ON DELETE CASCADE,
  worker_id text NOT NULL,
  lease_token text NOT NULL UNIQUE,
  claimed_at timestamptz NOT NULL,
  heartbeat_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  released_at timestamptz,
  release_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS runtime_job_leases_active_idx
  ON execution_platform.runtime_job_leases (job_id, expires_at)
  WHERE released_at IS NULL;

CREATE TABLE IF NOT EXISTS execution_platform.runtime_job_events (
  event_id text PRIMARY KEY,
  job_id text NOT NULL REFERENCES execution_platform.runtime_jobs(job_id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_time timestamptz NOT NULL,
  worker_id text,
  lease_id text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS runtime_job_events_job_time_idx
  ON execution_platform.runtime_job_events (job_id, event_time, event_id);

CREATE TABLE IF NOT EXISTS execution_platform.runtime_job_artifacts (
  artifact_id text PRIMARY KEY,
  job_id text NOT NULL REFERENCES execution_platform.runtime_jobs(job_id) ON DELETE CASCADE,
  artifact_type text NOT NULL,
  storage_kind text NOT NULL,
  uri text NOT NULL,
  content_type text,
  size_bytes bigint,
  sha256 text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS runtime_job_artifacts_job_created_idx
  ON execution_platform.runtime_job_artifacts (job_id, created_at, artifact_id);
