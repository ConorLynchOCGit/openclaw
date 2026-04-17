---
summary: "Operator checklist for validating or reapplying the retained intake-routing lane."
title: "Implementation Checklist"
---

# Implementation Checklist

Use this checklist when validating or reapplying the retained intake-routing
lane on the live webhook-gateway stack.

## Schema

- review `ops/intake/INTAKE_ROUTING_SCHEMA.sql`
- verify the live DB contains:
  - `intake_events`
  - `operator_work_queue`
- verify the routing metadata columns and supporting indexes exist

## Generic Intake workflow

- confirm the live `Generic Intake` workflow still owns `/webhook/intake`
- confirm authentication still uses `x-intake-secret`
- confirm successful authenticated requests insert normalized rows into
  `intake_events`

## Intake Router workflow

- confirm the live `Intake Router` workflow still reads `pending` authenticated
  rows from `intake_events`
- confirm it writes terminal routing states back onto `intake_events`
- confirm workflow and task route families still insert into
  `operator_work_queue`

## Bounded ingress proof

- unauthorized probe:
  - `POST http://127.0.0.1:38080/webhook/intake`
- expected result:
  - `401 Unauthorized`
- failure:
  - route missing
  - non-auth-related error
  - UI or unrelated surface responding instead of the intake endpoint

## Operator note

- keep the committed workflow exports aligned with the live n8n copies
- if the live workflow is changed materially, export a fresh repo-owned copy and
  update this project workspace in the same slice
