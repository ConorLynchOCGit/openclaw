ALTER TABLE execution_platform.work_items
  ADD COLUMN IF NOT EXISTS queue_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS queue_rank integer,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_by_runtime_job_id text,
  ADD COLUMN IF NOT EXISTS closed_by_closeout_ref text,
  ADD COLUMN IF NOT EXISTS closeout_capsule_ref text,
  ADD COLUMN IF NOT EXISTS validation_ref text,
  ADD COLUMN IF NOT EXISTS graph_ref text,
  ADD COLUMN IF NOT EXISTS owner_readback_ref text;

UPDATE execution_platform.work_items
SET queue_status =
  CASE
    WHEN metadata->>'planningStatus' = 'completed' THEN 'closed'
    WHEN metadata->>'planningStatus' = 'superseded' THEN 'superseded'
    WHEN metadata->>'planningStatus' = 'blocked' THEN 'blocked'
    WHEN metadata->>'planningStatus' = 'needs_review' THEN 'needs_review'
    WHEN lifecycle_state IN ('succeeded', 'failed', 'canceled') THEN 'closed'
    ELSE queue_status
  END,
  closed_at =
    CASE
      WHEN closed_at IS NULL
        AND (
          metadata->>'planningStatus' IN ('completed', 'superseded')
          OR lifecycle_state IN ('succeeded', 'failed', 'canceled')
        )
      THEN updated_at
      ELSE closed_at
    END
WHERE queue_status = 'active'
   OR closed_at IS NULL;

UPDATE execution_platform.work_items
SET queue_rank = COALESCE((metadata->>'activeQueuePosition')::integer, queue_rank)
WHERE queue_status IN ('active', 'blocked', 'needs_review')
  AND queue_rank IS NULL
  AND metadata->>'activeQueuePosition' IS NOT NULL;

CREATE INDEX IF NOT EXISTS work_items_queue_status_rank_idx
  ON execution_platform.work_items (queue_status, queue_rank, updated_at DESC, work_item_id);

CREATE INDEX IF NOT EXISTS work_items_closed_at_idx
  ON execution_platform.work_items (closed_at DESC, work_item_id)
  WHERE queue_status IN ('closed', 'superseded', 'archived');
