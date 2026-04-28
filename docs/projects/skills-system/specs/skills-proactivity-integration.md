---
summary: "Contract for surfacing skill candidates through the existing OpenClaw proactivity system."
title: "Skills Proactivity Integration"
---

# Skills Proactivity Integration

## Objective

Define how the Skills Platform uses existing proactivity surfaces instead of a
separate candidate inbox.

## Core decision

Skill candidates are proactivity opportunities.

They should surface through:

- inline chat follow-up cards
- heartbeat and operator briefing
- inbox and actionable views
- handoff flows
- a later Skills Studio UI

## Shared ids

Required linked ids:

- `skillCandidateId`
- `proactivityOpportunityId`
- optional `skillPackageId`
- optional `installOrCanaryId`

The same canonical ids must remain stable across surfacing, drafting, canary,
promotion, disable, and rollback flows.

## Required statuses

- `detected`
- `drafted`
- `tested`
- `vetting_failed`
- `canarying`
- `promoted_limited`
- `promoted_broad`
- `superseded`
- `rejected`
- `disabled`
- `rolled_back`

## Surfacing rules

- skill candidates must not create a parallel queue
- repeated candidates should update one canonical record where possible
- evidence and provenance may be shown in secondary details
- primary user-facing copy must remain bounded and actionable
- static seeded placeholders do not count as live skill opportunities
