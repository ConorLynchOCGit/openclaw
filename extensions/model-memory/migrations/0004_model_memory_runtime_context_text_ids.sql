ALTER TABLE runtime_context.active_memory_slots
  DROP CONSTRAINT IF EXISTS active_memory_slots_current_object_id_fkey;
ALTER TABLE runtime_context.active_memory_slots
  DROP CONSTRAINT IF EXISTS active_memory_slots_current_object_id_fk;
ALTER TABLE runtime_context.active_memory_slots
  ADD COLUMN IF NOT EXISTS current_object_id_text text;
UPDATE runtime_context.active_memory_slots
SET current_object_id_text = current_object_id::text
WHERE current_object_id IS NOT NULL;
ALTER TABLE runtime_context.active_memory_slots
  DROP COLUMN IF EXISTS current_object_id;
ALTER TABLE runtime_context.active_memory_slots
  RENAME COLUMN current_object_id_text TO current_object_id;
ALTER TABLE runtime_context.active_memory_slots
  ALTER COLUMN current_object_id SET NOT NULL;

DROP INDEX IF EXISTS runtime_context_sets_membership_idx;
DROP INDEX IF EXISTS runtime_context_sets_set_idx;

ALTER TABLE runtime_context.active_memory_sets
  DROP CONSTRAINT IF EXISTS active_memory_sets_memory_object_id_fkey;
ALTER TABLE runtime_context.active_memory_sets
  DROP CONSTRAINT IF EXISTS active_memory_sets_memory_object_id_fk;
ALTER TABLE runtime_context.active_memory_sets
  ADD COLUMN IF NOT EXISTS memory_object_id_text text;
UPDATE runtime_context.active_memory_sets
SET memory_object_id_text = memory_object_id::text
WHERE memory_object_id IS NOT NULL;
ALTER TABLE runtime_context.active_memory_sets
  DROP COLUMN IF EXISTS memory_object_id;
ALTER TABLE runtime_context.active_memory_sets
  RENAME COLUMN memory_object_id_text TO memory_object_id;
ALTER TABLE runtime_context.active_memory_sets
  ALTER COLUMN memory_object_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS runtime_context_sets_membership_idx
  ON runtime_context.active_memory_sets (set_key, memory_object_id);
CREATE INDEX IF NOT EXISTS runtime_context_sets_set_idx
  ON runtime_context.active_memory_sets (set_key);

ALTER TABLE runtime_context.context_artifacts
  ADD COLUMN IF NOT EXISTS source_object_ids_text text[] NOT NULL DEFAULT '{}'::text[];
UPDATE runtime_context.context_artifacts
SET source_object_ids_text = COALESCE(source_object_ids::text[], '{}'::text[]);
ALTER TABLE runtime_context.context_artifacts
  DROP COLUMN IF EXISTS source_object_ids;
ALTER TABLE runtime_context.context_artifacts
  RENAME COLUMN source_object_ids_text TO source_object_ids;

ALTER TABLE runtime_context.workspace_projection_versions
  ADD COLUMN IF NOT EXISTS source_object_ids_text text[] NOT NULL DEFAULT '{}'::text[];
UPDATE runtime_context.workspace_projection_versions
SET source_object_ids_text = COALESCE(source_object_ids::text[], '{}'::text[]);
ALTER TABLE runtime_context.workspace_projection_versions
  DROP COLUMN IF EXISTS source_object_ids;
ALTER TABLE runtime_context.workspace_projection_versions
  RENAME COLUMN source_object_ids_text TO source_object_ids;

DROP INDEX IF EXISTS runtime_context_retrieval_items_membership_idx;
DROP INDEX IF EXISTS runtime_context_retrieval_items_object_idx;

ALTER TABLE runtime_context.retrieval_result_items
  DROP CONSTRAINT IF EXISTS retrieval_result_items_memory_object_id_fkey;
ALTER TABLE runtime_context.retrieval_result_items
  DROP CONSTRAINT IF EXISTS retrieval_result_items_memory_object_id_fk;
ALTER TABLE runtime_context.retrieval_result_items
  ADD COLUMN IF NOT EXISTS memory_object_id_text text;
UPDATE runtime_context.retrieval_result_items
SET memory_object_id_text = memory_object_id::text
WHERE memory_object_id IS NOT NULL;
ALTER TABLE runtime_context.retrieval_result_items
  DROP COLUMN IF EXISTS memory_object_id;
ALTER TABLE runtime_context.retrieval_result_items
  RENAME COLUMN memory_object_id_text TO memory_object_id;
ALTER TABLE runtime_context.retrieval_result_items
  ALTER COLUMN memory_object_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS runtime_context_retrieval_items_membership_idx
  ON runtime_context.retrieval_result_items (retrieval_result_set_id, memory_object_id);
CREATE INDEX IF NOT EXISTS runtime_context_retrieval_items_object_idx
  ON runtime_context.retrieval_result_items (memory_object_id);
