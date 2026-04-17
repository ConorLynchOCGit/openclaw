---
summary: "Canonical retained contract for the generic intake ingress and DB-first router."
title: "Routing Contract"
---

# Routing Contract

This spec records the retained generic intake contract that still exists in the
live webhook-gateway lane.

## Current live evidence

- live n8n export set still contains `Generic Intake`
- live n8n export set still contains `Intake Router`
- local unauthorized probe:
  - `POST http://127.0.0.1:38080/webhook/intake`
  - current result: `401 Unauthorized`
- live DB probe still checks for:
  - `intake_events`
  - `operator_work_queue`

## Contract

- ingress path:
  - `/webhook/intake`
- authentication:
  - shared-secret header via `x-intake-secret`
- ingestion behavior:
  - authenticated requests normalize into `intake_events`
  - ingestion remains separate from downstream routing
- routing behavior:
  - router operates asynchronously against persisted rows
  - router claims `pending` rows, applies deterministic route-family matching,
    and transitions them to terminal states
- downstream queue behavior:
  - typed workflow and task routes insert into `operator_work_queue`

## Canonical committed assets

- schema:
  - `ops/intake/INTAKE_ROUTING_SCHEMA.sql`
- workflow exports:
  - `ops/intake/workflows/generic_intake.json`
  - `ops/intake/workflows/intake_router.json`

## Current route families

- `manual:*:*`
- `openclaw:ops:*`
- `openclaw:workflow:*`
- `openclaw:task:*`

## Status boundary

- this lane is retained and live-capable
- it is currently underused, not retired
- future operator exercises should validate against these committed assets
  rather than the legacy workspace-only copies
