ALTER TABLE model_memory.memory_objects
  ADD COLUMN IF NOT EXISTS lifecycle_state text;

ALTER TABLE model_memory.memory_objects
  ADD COLUMN IF NOT EXISTS activation_basis text;

ALTER TABLE model_memory.memory_objects
  ADD COLUMN IF NOT EXISTS activated_at timestamptz;

ALTER TABLE model_memory.memory_objects
  ADD COLUMN IF NOT EXISTS expired_at timestamptz;

UPDATE model_memory.memory_objects
SET lifecycle_state = COALESCE(lifecycle_state, CASE WHEN superseded_at IS NULL THEN 'active' ELSE 'superseded' END);

UPDATE model_memory.memory_objects
SET activation_basis = COALESCE(activation_basis, 'primary_capture');

UPDATE model_memory.memory_objects
SET activated_at = COALESCE(activated_at, created_at)
WHERE lifecycle_state = 'active';

CREATE TABLE IF NOT EXISTS model_memory.memory_support_items (
  id uuid PRIMARY KEY,
  memory_object_id uuid NOT NULL REFERENCES model_memory.memory_objects(id),
  source_window_id uuid NOT NULL REFERENCES model_memory.source_windows(id),
  provenance jsonb NOT NULL,
  support_fingerprint text NOT NULL,
  support_kind text NOT NULL,
  counts_for_reinforcement boolean NOT NULL,
  derived_from_source_kind text NOT NULL,
  created_at timestamptz NOT NULL,
  CONSTRAINT model_memory_support_items_object_fingerprint_unique
    UNIQUE (memory_object_id, support_fingerprint)
);

ALTER TABLE model_memory.memory_objects
  ADD COLUMN IF NOT EXISTS source_window_id uuid REFERENCES model_memory.source_windows(id);

ALTER TABLE model_memory.memory_objects
  ADD COLUMN IF NOT EXISTS provenance jsonb;

INSERT INTO model_memory.memory_support_items (
  id,
  memory_object_id,
  source_window_id,
  provenance,
  support_fingerprint,
  support_kind,
  counts_for_reinforcement,
  derived_from_source_kind,
  created_at
)
SELECT
  mo.id,
  mo.id,
  mo.source_window_id,
  COALESCE(mo.provenance, '[]'::jsonb),
  coalesce(src.source_kind, 'document') || ':' || mo.source_window_id::text,
  'origin_capture',
  CASE WHEN coalesce(src.source_kind, 'document') = 'daily_continuity' THEN false ELSE true END,
  coalesce(src.source_kind, 'document'),
  mo.created_at
FROM model_memory.memory_objects mo
LEFT JOIN model_memory.source_windows sw ON sw.id = mo.source_window_id
LEFT JOIN model_memory.sources src ON src.id = sw.source_id
WHERE mo.source_window_id IS NOT NULL
ON CONFLICT (memory_object_id, support_fingerprint) DO NOTHING;

CREATE INDEX IF NOT EXISTS model_memory_support_items_object_idx
  ON model_memory.memory_support_items (memory_object_id);
CREATE INDEX IF NOT EXISTS model_memory_support_items_source_window_idx
  ON model_memory.memory_support_items (source_window_id);
CREATE INDEX IF NOT EXISTS model_memory_support_items_kind_idx
  ON model_memory.memory_support_items (support_kind);
CREATE INDEX IF NOT EXISTS model_memory_support_items_reinforcement_idx
  ON model_memory.memory_support_items (counts_for_reinforcement);

ALTER TABLE model_memory.write_events
  ADD COLUMN IF NOT EXISTS support_item_id uuid REFERENCES model_memory.memory_support_items(id);

ALTER TABLE model_memory.memory_objects
  ALTER COLUMN lifecycle_state SET NOT NULL;

ALTER TABLE model_memory.memory_objects
  ALTER COLUMN activation_basis SET NOT NULL;

CREATE INDEX IF NOT EXISTS model_memory_memory_objects_lifecycle_idx
  ON model_memory.memory_objects (lifecycle_state);

ALTER TABLE model_memory.memory_objects
  DROP COLUMN IF EXISTS source_window_id;

ALTER TABLE model_memory.memory_objects
  DROP COLUMN IF EXISTS provenance;
