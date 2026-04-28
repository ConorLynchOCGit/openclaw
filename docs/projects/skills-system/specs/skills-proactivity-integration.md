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
- optional `skillifierReportId`

The same canonical ids must remain stable across surfacing, drafting, canary,
promotion, disable, and rollback flows.

Milestone 2 runtime rule:

- the same `skillCandidateId` must be visible in the canonical ledger, inline
  chat surface, heartbeat surface, inbox item, and handoff metadata for the
  same live opportunity
- repeated same-intent work must update the existing candidate instead of
  creating a second actionable queue row

Milestone 3 runtime rule:

- Skillifier MVP must reuse the same canonical `skillCandidateId`
- draft-ready state must surface through the existing proactivity queue,
  heartbeat, inbox, and handoff flows
- `skillPackageId` and `skillifierReportId` may appear as secondary linked ids,
  but they must not replace the candidate as the primary surface identity

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
- primary user-facing copy must render from a typed
  `UserFacingProactivityBrief`, not from raw ledger fields
- primary cards should show only title, kind label, one-line purpose, and the
  recommended next step or primary action
- `why now`, source refs, provenance, ids, timestamps, lifecycle details,
  limitations, and diagnostics belong in collapsed details or hidden heartbeat
  context
- primary user-facing copy must remain bounded and actionable
- static seeded placeholders do not count as live skill opportunities
- destination capability policy may inform install-target metadata, but
  Milestone 2 does not broadly write skill packages into live destinations
- Milestone 3 may write bounded draft packages only into explicitly allowed
  workspace-local draft targets; it still must not broadly install or promote
  skills

## Presentation rules

Skill candidates need a user-facing kind before they are shown:

- `new_skill_candidate`
- `existing_skill_enhancement`
- `merge_or_extend_candidate`
- `not_skill_worthy`

The visible label may say `New skill`, `Improve skill`, or `Merge skill` only
when the claim comes from explicit skill metadata, candidate linkage, or prior
candidate state. Uncertain fits stay in diagnostics as possible existing fits.

Reverse prompts may surface only when the primary title is a complete useful
question that names the decision or uncertainty. Malformed titles such as
`Question worth asking before ...`, source-fragment grammar, repeated fallback
templates, and title/body duplication must be demoted from primary surfaces.

Failed presentation quality should create bounded diagnostics that can feed
self-healing repair work instead of adding clutter to the chat feed or inbox.
