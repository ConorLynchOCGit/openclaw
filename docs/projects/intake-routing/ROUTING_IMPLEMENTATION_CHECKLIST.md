# ROUTING_IMPLEMENTATION_CHECKLIST.md

## Phase 3 Routing Extension — Manual Deployment Checklist

Status: **To be executed — not yet started**

Work through these steps in order. Do not skip ahead. Each step has a verification
gate before proceeding to the next.

---

## STEP 1 — Apply Schema SQL

**Manual step required.**

- [ ] Open Supabase SQL editor (or psql via session pooler)
- [ ] Open `ops/intake/INTAKE_ROUTING_SCHEMA.sql`
- [ ] Review the SQL — confirm no unexpected changes
- [ ] Execute the full file
- [ ] Verify: `intake_events` now has columns:
  - `routing_status` (default `pending`)
  - `route_handler`
  - `routed_at`
  - `routing_error`
  - `routing_note`
  - `routing_attempts`
- [ ] Verify: `operator_work_queue` table exists with correct columns
- [ ] Verify: indexes on `intake_events (routing_status, received_at)` and `route_key` exist
- [ ] Verify: existing rows in `intake_events` now show `routing_status = 'pending'`

Do not proceed to Step 2 until schema is confirmed applied.

---

## STEP 2 — Import Router Workflow into n8n

**Manual step required.**

- [ ] Open n8n admin at `https://srv1425839.tailbcf154.ts.net:4443`
- [ ] Import `ops/intake/workflows/intake_router.json`
  - Use: Workflows → Import from File
- [ ] Confirm workflow name is `Intake Router`
- [ ] Confirm all nodes loaded — expected node count: 17

Do not activate or run yet.

---

## STEP 3 — Replace Credentials

**Manual step required.**

All Postgres nodes contain the placeholder credential:

- id: `REPLACE_WITH_POSTGRES_CREDENTIAL_ID`
- name: `REPLACE_WITH_POSTGRES_CREDENTIAL_NAME`

- [ ] Open each Postgres node in the workflow (there are multiple)
- [ ] Assign your live Supabase Postgres credential to each one
- [ ] Confirm the credential connects successfully (test connection if available)

Nodes requiring credential assignment:

- `Fetch Pending Events`
- `Claim Event (set processing)`
- `Handle: manual.default`
- `Handle: openclaw.ops.default`
- `Queue: openclaw.workflow.queue (insert)`
- `Mark Routed: workflow`
- `Mark Failed: workflow queue error`
- `Queue: openclaw.task.queue (insert)`
- `Mark Routed: task`
- `Mark Failed: task queue error`
- `Handle: unhandled.default`

---

## STEP 4 — Verify Error Branch Wiring

**Manual verification required.**

n8n sometimes drops error branch connections on import.

- [ ] Open `Queue: openclaw.workflow.queue (insert)`
  - [ ] Confirm success branch → `Mark Routed: workflow`
  - [ ] Confirm error branch → `Mark Failed: workflow queue error`
- [ ] Open `Queue: openclaw.task.queue (insert)`
  - [ ] Confirm success branch → `Mark Routed: task`
  - [ ] Confirm error branch → `Mark Failed: task queue error`
- [ ] Re-wire manually if any connections are missing

---

## STEP 5 — Generate Test Events via Intake Endpoint

**Manual step required.**

Send at least one test event for each route family to the live intake endpoint.
Use your existing `x-intake-secret` header.

Test events to send (adjust payload as needed):

```bash
# manual:*:*
curl -X POST https://srv1425839.tailbcf154.ts.net:8443/webhook/intake \
  -H "Content-Type: application/json" \
  -H "x-intake-secret: YOUR_SECRET" \
  -d '{"source":"manual","project":"test","event_type":"ping","payload":{"note":"router test"}}'

# openclaw:ops:*
curl -X POST https://srv1425839.tailbcf154.ts.net:8443/webhook/intake \
  -H "Content-Type: application/json" \
  -H "x-intake-secret: YOUR_SECRET" \
  -d '{"source":"openclaw","project":"ops","event_type":"heartbeat","payload":{"note":"router test"}}'

# openclaw:workflow:*
curl -X POST https://srv1425839.tailbcf154.ts.net:8443/webhook/intake \
  -H "Content-Type: application/json" \
  -H "x-intake-secret: YOUR_SECRET" \
  -d '{"source":"openclaw","project":"workflow","event_type":"deploy","payload":{"note":"router test"}}'

# openclaw:task:*
curl -X POST https://srv1425839.tailbcf154.ts.net:8443/webhook/intake \
  -H "Content-Type: application/json" \
  -H "x-intake-secret: YOUR_SECRET" \
  -d '{"source":"openclaw","project":"task","event_type":"followup","payload":{"note":"router test"}}'

# unmatched (no route family)
curl -X POST https://srv1425839.tailbcf154.ts.net:8443/webhook/intake \
  -H "Content-Type: application/json" \
  -H "x-intake-secret: YOUR_SECRET" \
  -d '{"source":"unknown","project":"unknown","event_type":"unknown","payload":{"note":"router test unmatched"}}'
```

- [ ] Confirm each request returns `200` from the intake workflow
- [ ] Query `intake_events` and confirm 5 rows with `routing_status = 'pending'`

---

## STEP 6 — Trigger Router Manually

**Manual step required.**

- [ ] Open `Intake Router` workflow in n8n
- [ ] Click "Execute Workflow" (manual trigger)
- [ ] Wait for execution to complete
- [ ] Open execution log — review each node for errors

---

## STEP 7 — Verify DB Outcomes

**Manual verification required.**

Run these queries in Supabase SQL editor:

```sql
-- Check routing status of all test events
SELECT id, source, project, event_type, route_key,
       routing_status, route_handler, routing_note,
       routing_error, routing_attempts, routed_at
FROM intake_events
ORDER BY received_at DESC
LIMIT 20;

-- Check operator_work_queue inserts
SELECT owq.id, owq.work_type, owq.route_handler,
       owq.source, owq.project, owq.event_type,
       owq.queue_status, owq.created_at,
       ie.routing_status as intake_routing_status
FROM operator_work_queue owq
JOIN intake_events ie ON ie.id = owq.intake_event_id
ORDER BY owq.created_at DESC;
```

Expected outcomes:

| Route Family               | routing_status | route_handler             | operator_work_queue row? |
| -------------------------- | -------------- | ------------------------- | ------------------------ |
| `manual:test:ping`         | `routed`       | `manual.default`          | No                       |
| `openclaw:ops:heartbeat`   | `routed`       | `openclaw.ops.default`    | No                       |
| `openclaw:workflow:deploy` | `routed`       | `openclaw.workflow.queue` | Yes — work_type=workflow |
| `openclaw:task:followup`   | `routed`       | `openclaw.task.queue`     | Yes — work_type=task     |
| `unknown:unknown:unknown`  | `unhandled`    | `unhandled.default`       | No                       |

- [ ] All routing_status values match expected
- [ ] routed_at is set on all terminal rows
- [ ] routing_attempts = 1 on all test rows
- [ ] operator_work_queue has exactly 2 rows (workflow + task)
- [ ] No unexpected `failed` statuses

---

## STEP 8 — Only Then: Enable Schedule Trigger

**Manual step required — only after Steps 1–7 are clean.**

- [ ] Add a Schedule Trigger node to the Intake Router workflow
- [ ] Wire it in parallel with (or replacing) the Manual Trigger
- [ ] Set desired interval (e.g. every 5 minutes)
- [ ] Activate the workflow
- [ ] Monitor first scheduled run in execution log

---

## STEP 9 — Update Memory and Create Freeze

**Manual step required — only after the schedule trigger is running cleanly.**

- [ ] Update `MEMORY.md` with Phase 3 routing extension milestone
- [ ] Update `core/ROADMAP.md` to mark the routing extension complete
- [ ] Export final workflow JSON from n8n to replace the prepared files
- [ ] Create a freeze archive: `openclaw-phase3-routing-freeze-YYYY-MM-DD.tar.gz`
- [ ] Store under `/root/backups/`

---

## Notes

- Do not mark any step complete until you have personally verified the DB outcome.
- "Prepared" files in this workspace are drafts. n8n behavior must be confirmed
  against live execution before calling any step done.
- If a query fails in n8n with a parameter error, check parameter order first —
  `$1, $2, ...` must match exactly the order referenced in the node.
- If error branches are missing after import, re-wire manually and re-export
  the updated JSON to replace the workspace file.
