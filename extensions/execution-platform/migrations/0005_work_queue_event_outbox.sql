CREATE TABLE IF NOT EXISTS execution_platform.work_queue_events (
  event_id text PRIMARY KEY,
  event_cursor bigserial UNIQUE NOT NULL,
  idempotency_key text UNIQUE NOT NULL,
  event_type text NOT NULL,
  work_item_id text NOT NULL REFERENCES execution_platform.work_items(work_item_id) ON DELETE CASCADE,
  parent_work_item_id text NULL,
  graph_id text NULL,
  node_id text NULL,
  runtime_job_id text NULL,
  human_task_id text NULL,
  queue_status text NULL,
  reason_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_work_queue_events_cursor
  ON execution_platform.work_queue_events(event_cursor);

CREATE INDEX IF NOT EXISTS idx_work_queue_events_work_item
  ON execution_platform.work_queue_events(work_item_id, event_cursor);

CREATE INDEX IF NOT EXISTS idx_work_queue_events_parent
  ON execution_platform.work_queue_events(parent_work_item_id, event_cursor)
  WHERE parent_work_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_work_queue_events_graph
  ON execution_platform.work_queue_events(graph_id, event_cursor)
  WHERE graph_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_work_queue_events_created
  ON execution_platform.work_queue_events(created_at);
