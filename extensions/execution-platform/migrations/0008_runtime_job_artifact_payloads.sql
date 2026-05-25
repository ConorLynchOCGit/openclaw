CREATE TABLE IF NOT EXISTS execution_platform.runtime_job_artifact_payloads (
  payload_ref text PRIMARY KEY,
  job_id text NOT NULL REFERENCES execution_platform.runtime_jobs(job_id) ON DELETE CASCADE,
  artifact_type text NOT NULL,
  content_type text NOT NULL DEFAULT 'application/json',
  size_bytes bigint NOT NULL,
  sha256 text NOT NULL,
  body jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  CONSTRAINT runtime_job_artifact_payloads_size_check CHECK (size_bytes >= 0)
);

CREATE INDEX IF NOT EXISTS runtime_job_artifact_payloads_job_created_idx
  ON execution_platform.runtime_job_artifact_payloads (job_id, created_at, payload_ref);

CREATE INDEX IF NOT EXISTS runtime_job_artifact_payloads_job_type_idx
  ON execution_platform.runtime_job_artifact_payloads (job_id, artifact_type);
