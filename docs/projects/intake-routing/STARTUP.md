---
summary: "Read-first guide for the intake-routing project workspace."
title: "Intake Routing Startup"
---

# Intake Routing Startup

## Read first

1. [Status](/projects/intake-routing/STATUS)
2. [Current Slice](/projects/intake-routing/CURRENT_SLICE)
3. [Routing Contract](/projects/intake-routing/specs/routing-contract)
4. [Implementation Checklist](/projects/intake-routing/specs/implementation-checklist)

## Canonical assets

- `ops/intake/INTAKE_ROUTING_SCHEMA.sql`
- `ops/intake/workflows/generic_intake.json`
- `ops/intake/workflows/intake_router.json`

## Current rule

- treat intake as a retained live lane, not archive residue
- keep ingress and routing distinct:
  - Generic Intake owns authenticated ingestion
  - Intake Router owns post-ingestion DB-first routing
- store operator-facing rules and runbook guidance here
- store executable schema and workflow assets under `ops/intake/`
