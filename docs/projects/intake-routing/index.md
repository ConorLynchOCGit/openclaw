---
summary: "Canonical project workspace for the retained generic intake and DB-first routing lane."
title: "Intake Routing"
---

# Intake Routing

`intake-routing` is the canonical project workspace for the retained generic
intake ingress and DB-first routing lane.

This project owns:

- the retained `/webhook/intake` contract
- the DB-first routing model around `intake_events`
- the typed downstream queue handoff into `operator_work_queue`
- the committed schema and workflow export assets under `ops/intake/`

## Project docs

1. [Startup](/projects/intake-routing/STARTUP)
2. [Status](/projects/intake-routing/STATUS)
3. [Current Slice](/projects/intake-routing/CURRENT_SLICE)
4. [Decisions](/projects/intake-routing/DECISIONS)
5. [Roadmap](/projects/intake-routing/roadmap)
6. [Spec Index](/projects/intake-routing/specs)

## Canonical committed assets

- `ops/intake/INTAKE_ROUTING_SCHEMA.sql`
- `ops/intake/workflows/generic_intake.json`
- `ops/intake/workflows/intake_router.json`
