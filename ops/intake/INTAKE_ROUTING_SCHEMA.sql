-- =============================================================================
-- INTAKE_ROUTING_SCHEMA.sql
-- Phase 3 Routing Extension — Schema Preparation
--
-- Purpose:
--   Extend the existing `intake_events` table with routing metadata columns,
--   add supporting indexes, and create the `operator_work_queue` table for
--   typed downstream work items.
--
-- Status: PREPARED — not yet applied.
--   Apply manually via Supabase SQL editor or psql.
--   Do NOT apply until the Router workflow is ready to import and test.
--
-- Constraints:
--   - `intake_events.id` is bigint. No UUID assumptions anywhere.
--   - No ::uuid casts. Bigint-safe throughout.
--   - Idempotent where possible (uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- PART 1: Extend intake_events with routing metadata
--
-- These columns are written by the Router workflow after it claims and
-- processes a pending event. The intake workflow itself only sets the
-- initial `routing_status = 'pending'` default; it does not touch these.
-- -----------------------------------------------------------------------------

ALTER TABLE intake_events
  ADD COLUMN IF NOT EXISTS routing_status   text    NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS route_handler    text    NULL,
  ADD COLUMN IF NOT EXISTS routed_at        timestamptz NULL,
  ADD COLUMN IF NOT EXISTS routing_error    text    NULL,
  ADD COLUMN IF NOT EXISTS routing_note     text    NULL,
  ADD COLUMN IF NOT EXISTS routing_attempts integer NOT NULL DEFAULT 0;

-- Routing status domain (enforced by Router logic, not a DB constraint):
--   pending     — written at ingestion; not yet claimed by the router
--   processing  — claimed by the router; in-flight
--   routed      — terminal success; a matching route family handled the event
--   unhandled   — terminal; no matching route family; event preserved for replay
--   failed      — terminal error; route family matched but downstream action failed

COMMENT ON COLUMN intake_events.routing_status IS
  'Lifecycle state set by the Router workflow. Values: pending, processing, routed, unhandled, failed. Default pending on insert.';

COMMENT ON COLUMN intake_events.route_handler IS
  'Logical handler identifier assigned by the router (e.g. openclaw.workflow.queue). Null until claimed.';

COMMENT ON COLUMN intake_events.routed_at IS
  'Timestamp set by the router on all terminal state transitions (routed, unhandled, failed).';

COMMENT ON COLUMN intake_events.routing_error IS
  'Human-readable error or note for unhandled/failed states. Null on routed.';

COMMENT ON COLUMN intake_events.routing_note IS
  'Optional informational note from the router (e.g. "ops event stored for visibility"). Null unless set.';

COMMENT ON COLUMN intake_events.routing_attempts IS
  'Number of times the router has attempted to process this event. Incremented on each claim. No auto-retry yet.';


-- -----------------------------------------------------------------------------
-- PART 2: Indexes for routing queries
--
-- The router will query for `pending` events ordered by received_at.
-- route_key is the canonical composite field used for logging and matching.
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_intake_events_routing_status_received_at
  ON intake_events (routing_status, received_at);

COMMENT ON INDEX idx_intake_events_routing_status_received_at IS
  'Supports router polling: SELECT ... WHERE routing_status = ''pending'' ORDER BY received_at ASC';

CREATE INDEX IF NOT EXISTS idx_intake_events_route_key
  ON intake_events (route_key);

COMMENT ON INDEX idx_intake_events_route_key IS
  'Supports route_key lookups, deduplication checks, and diagnostic queries.';


-- -----------------------------------------------------------------------------
-- PART 3: operator_work_queue
--
-- Downstream typed queue for events routed to workflow or task handlers.
-- Only created by the router for route families:
--   - openclaw:workflow:*  (work_type = 'workflow')
--   - openclaw:task:*      (work_type = 'task')
--
-- Each row is linked 1:1 to an intake_events row via intake_event_id.
-- On delete cascade ensures queue rows are removed if the source event is deleted.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS operator_work_queue (
  id                bigserial     PRIMARY KEY,

  -- Foreign key back to the originating intake event.
  -- UNIQUE enforces the 1:1 relationship: one queue entry per intake event.
  intake_event_id   bigint        NOT NULL UNIQUE REFERENCES intake_events(id) ON DELETE CASCADE,

  -- Typed work category. Constrained to the two current supported families.
  work_type         text          NOT NULL CHECK (work_type IN ('workflow', 'task')),

  -- Handler identifier as assigned by the router (e.g. openclaw.workflow.queue).
  route_handler     text          NOT NULL,

  -- Denormalized routing fields for downstream consumers who should not need
  -- to join back to intake_events for basic dispatch decisions.
  source            text          NOT NULL,
  project           text          NOT NULL,
  event_type        text          NOT NULL,

  -- Full normalized payload from the intake event.
  payload           jsonb         NOT NULL,

  -- Queue lifecycle status. Downstream processors update this field.
  -- Values: pending, processing, completed, failed
  -- Default: pending (set at insert time by the router).
  queue_status      text          NOT NULL DEFAULT 'pending',

  -- Timestamps
  created_at        timestamptz   NOT NULL DEFAULT now(),
  processed_at      timestamptz   NULL,

  -- Error capture for failed processing attempts by downstream consumers.
  error             text          NULL
);

COMMENT ON TABLE operator_work_queue IS
  'Downstream typed work queue. Populated by the Router workflow for openclaw:workflow:* and openclaw:task:* route families. Each row corresponds 1:1 to an intake_events row. Downstream processors claim and update queue_status.';

COMMENT ON COLUMN operator_work_queue.id IS
  'Bigserial primary key. Not related to intake_events.id.';

COMMENT ON COLUMN operator_work_queue.intake_event_id IS
  'Bigint FK to intake_events.id. UNIQUE: one queue entry per intake event. CASCADE delete.';

COMMENT ON COLUMN operator_work_queue.work_type IS
  'Constrained to workflow or task. Determines which downstream processor handles the item.';

COMMENT ON COLUMN operator_work_queue.route_handler IS
  'Logical handler identifier as assigned by the router at routing time.';

COMMENT ON COLUMN operator_work_queue.source IS
  'Denormalized from intake_events for downstream use without a join.';

COMMENT ON COLUMN operator_work_queue.project IS
  'Denormalized from intake_events for downstream use without a join.';

COMMENT ON COLUMN operator_work_queue.event_type IS
  'Denormalized from intake_events for downstream use without a join.';

COMMENT ON COLUMN operator_work_queue.payload IS
  'Full normalized payload copied from intake_events at routing time.';

COMMENT ON COLUMN operator_work_queue.queue_status IS
  'Lifecycle state managed by downstream processors. Values: pending, processing, completed, failed.';

COMMENT ON COLUMN operator_work_queue.created_at IS
  'Set by the router at insert time.';

COMMENT ON COLUMN operator_work_queue.processed_at IS
  'Set by downstream processor on terminal state (completed or failed).';

COMMENT ON COLUMN operator_work_queue.error IS
  'Populated by downstream processor if processing fails.';

-- Index for downstream processor polling
CREATE INDEX IF NOT EXISTS idx_operator_work_queue_status_created
  ON operator_work_queue (queue_status, created_at);

COMMENT ON INDEX idx_operator_work_queue_status_created IS
  'Supports downstream processor polling: SELECT ... WHERE queue_status = ''pending'' ORDER BY created_at ASC';

-- Index for joining back to intake events
CREATE INDEX IF NOT EXISTS idx_operator_work_queue_intake_event_id
  ON operator_work_queue (intake_event_id);

COMMENT ON INDEX idx_operator_work_queue_intake_event_id IS
  'Supports joins from operator_work_queue back to intake_events.';
