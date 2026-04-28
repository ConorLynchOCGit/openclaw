---
summary: "Current status for the Skills System project."
title: "Skills System Status"
---

# Skills System Status

## Overall

State: `phase2_skillifier_mvp_runtime_in_progress`

The repo already has a canonical home for skill loading, ClawHub posture, and
Skill Vetting.

Milestone 1 defined the platform contract. Milestone 2 made `skill_candidate`
live in the proactivity ledger. The active work now is to turn that canonical
candidate into a bounded draft package and report flow.

The current outcomes are:

- `skill_candidate` remains the canonical reusable-work opportunity record
- Skillifier MVP must consume canonical candidate ids rather than re-deriving
  skill opportunities from raw session text
- draft package generation must stay bounded, provenance-aware, and
  no-dark-data safe
- draft-ready state must reuse inline surfacing, heartbeat, inbox, and handoff
  instead of introducing a separate skills queue
- destination capability authority now moves from docs-only into draft-target
  enforcement for the MVP write path
- this slice still does not broadly install or promote skills

## Current judgment

The biggest missing skill-system capability is now the lack of one explicit
runtime path that turns a canonical repeated-work candidate into a bounded,
reviewable draft skill package without accidentally turning draft generation
into installation or promotion.

## Remaining work after this slice

- build the Skillifier scaffold/check/report lane
- add decisioning/compliance evals
- integrate risk tiers, canarying, rollback, and low-risk auto-promotion
- add cross-runtime install and maintenance surfaces
