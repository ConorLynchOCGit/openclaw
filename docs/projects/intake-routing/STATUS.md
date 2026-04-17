---
summary: "Current status for the intake-routing project."
title: "Intake Routing Status"
---

# Intake Routing Status

## Overall

State: `retained_live_lane_canonized`

## Current truth

- the live webhook-gateway export set still contains:
  - `Generic Intake`
  - `Intake Router`
- the local ingress path still responds on `/webhook/intake`
- an unauthorized local probe currently returns `401 Unauthorized`, which
  proves the ingress route is live without needing a real secret
- the live DB probe still checks for:
  - `intake_events`
  - `operator_work_queue`
- the lane is quiet operationally, but it is not dead or hypothetical
- before this slice, the canonical repo had no committed home for the retained
  schema, routing contract, or workflow exports

## This slice

- create `docs/projects/intake-routing/` as the canonical project home
- commit the retained schema and workflow assets under `ops/intake/`
- record the DB-first routing contract and operator deployment checklist

## Next move

- keep the committed workflow exports aligned with the live n8n lane
- if the intake route is exercised again, validate it against the canonical
  schema and routing contract rather than the legacy workspace copy
