# ROUTING_SPEC.md

## Phase 3 Routing Extension — Implementation Specification

Status: **Prepared — not yet deployed**

This document describes the design of the Intake Router: what it does, how it
connects to the existing Generic Intake workflow, and the rules governing
route matching, status transitions, and downstream queue writes.

---

## 1. Design Philosophy — DB-First Routing

The router does not intercept requests in-flight. Routing is a **post-ingestion
asynchronous step** that operates against rows already persisted in `intake_events`.

This means:

- The ingestion path (`/webhook/intake`) remains unchanged.
- Routing cannot cause ingestion to fail.
- Unroutable events are preserved, not dropped.
- The router can be run, paused, re-run, or replaced without touching the intake endpoint.

The ingestion contract guarantees that every authenticated request produces a row
in `intake_events` with `routing_status = 'pending'`. The router's job is to claim
those rows and move them to a terminal state.

---

## 2. Ingress Is Unchanged

The following are out of scope for this routing extension and must not be modified:

- `/webhook/intake` — Generic Intake workflow path
- `/webhook/github` — GitHub webhook path
- Caddy configuration
- Tailscale Funnel/Serve configuration
- n8n infrastructure

The Router workflow is a separate n8n workflow. It reads from `intake_events`
and writes routing metadata back into the same table. It does not touch the
webhook ingress layer.

---

## 3. Route Key Contract

The `route_key` field is the canonical composite identifier for a given event's
routing context. It is built at ingestion time from three normalized fields:

```
route_key = source:project:event_type
```

Examples:

- `manual:test:ping`
- `openclaw:ops:heartbeat`
- `openclaw:workflow:deploy`
- `openclaw:task:followup`

The router uses `source`, `project`, and `event_type` as the primary matching
fields (not `route_key` itself), because matching against individual columns is
more reliable in n8n conditional logic. `route_key` is retained as the canonical
logging and diagnostic field.

---

## 4. Routing Status Lifecycle

Every `intake_events` row begins with `routing_status = 'pending'`.
The router transitions rows through the following states:

| Status       | Meaning                                                             |
| ------------ | ------------------------------------------------------------------- |
| `pending`    | Written at ingestion. Not yet claimed by the router.                |
| `processing` | Claimed by the router. In-flight. Set before route matching begins. |
| `routed`     | Terminal success. A matching route family handled the event.        |
| `unhandled`  | Terminal. No matching route family. Event preserved for replay.     |
| `failed`     | Terminal error. Route family matched but downstream action failed.  |

Rules:

- `routed_at` is set on **all three terminal states** (`routed`, `unhandled`, `failed`).
- `routing_attempts` is incremented each time the router claims a row.
- There is **no auto-retry** in this version. Failed or unhandled rows remain
  in their terminal state until manually re-queued or replayed.
- `unhandled` is not an error — it means the event was valid but no route rule
  exists yet. These events must be preserved and must never be dropped or deleted
  by the router.

---

## 5. Supported Route Families (First Version)

The router matches events by `source`, `project`, and `event_type`.
Wildcard matching (`*`) applies at the project and event_type level where noted.

### `manual:*:*`

- **Handler:** `manual.default`
- **Action:** Mark `routed`. No downstream write.
- **Note:** `manual route accepted; no downstream action`
- **Purpose:** Allows human-triggered test events through the intake path
  without requiring a downstream handler.

### `openclaw:ops:*`

- **Handler:** `openclaw.ops.default`
- **Action:** Mark `routed`. No downstream write.
- **Note:** `ops event stored for visibility`
- **Purpose:** Operational/heartbeat/diagnostic events from OpenClaw itself.
  Stored for auditability. No active processing required in this version.

### `openclaw:workflow:*`

- **Handler:** `openclaw.workflow.queue`
- **Action:** Insert into `operator_work_queue` with `work_type = 'workflow'`,
  then mark intake row `routed`.
- **On queue insert failure:** Mark intake row `failed`. Set `routing_error`.
- **Purpose:** Events that request a workflow be triggered or enqueued
  for execution by a downstream processor.

### `openclaw:task:*`

- **Handler:** `openclaw.task.queue`
- **Action:** Insert into `operator_work_queue` with `work_type = 'task'`,
  then mark intake row `routed`.
- **On queue insert failure:** Mark intake row `failed`. Set `routing_error`.
- **Purpose:** Events that request a task be created or actioned downstream.

---

## 6. Unmatched Event Behavior

If no route family matches an authenticated event:

- The row is marked `unhandled`.
- `route_handler` is set to `unhandled.default`.
- `routing_error` is set to: `no matching route family for current rules`
- `routed_at` is set.
- The row and its payload are preserved in `intake_events`.
- No downstream action is taken.

This behavior is intentional. Authenticated events that arrive before a route
rule exists must never be silently discarded. They are available for manual
review and future replay when a matching handler is added.

---

## 7. Retry Policy

There is **no auto-retry** in this version of the router.

- `routing_attempts` is incremented on each router claim, providing observability
  into how many times a row has been touched.
- Failed or unhandled rows do not re-enter the `pending` queue automatically.
- Manual replay (resetting `routing_status = 'pending'`) is the supported
  recovery path for now.
- A retry/backoff mechanism may be added in a future phase.

---

## 8. Downstream Typed Queue

The `operator_work_queue` table stores typed work items for the two active
queue-writing route families (`openclaw:workflow:*` and `openclaw:task:*`).

Each row:

- is linked 1:1 to an `intake_events` row via `intake_event_id` (bigint FK)
- carries `work_type` constrained to `workflow` or `task`
- carries denormalized `source`, `project`, `event_type` for downstream use
  without requiring a join
- carries the full `payload` jsonb
- begins with `queue_status = 'pending'`
- is updated by downstream processors (not the router)

The router is responsible only for the insert. Downstream processors own the
queue lifecycle from `pending` onward.

---

## 9. Trigger Model

The router workflow uses a **manual trigger only** in this first version.

A schedule trigger should only be added after:

1. The schema has been applied.
2. The workflow has been imported and credentials replaced.
3. All route families have been tested with real events.
4. DB outcomes have been manually verified.

This sequencing ensures the router is proven correct before it runs autonomously.

---

## 10. What This Spec Does Not Cover

- Downstream processor logic (who reads `operator_work_queue` and what it does)
- Retry/backoff scheduling
- Event expiry or archival
- Multi-route fan-out
- Cross-workflow orchestration

These are future-phase concerns. This spec covers only the ingestion-to-routing
handoff and the first set of route rules.
