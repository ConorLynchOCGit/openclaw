---
summary: "Current status for the Skills System project."
title: "Skills System Status"
---

# Skills System Status

## Overall

State: `phase2_skill_candidate_ledger_runtime_active`

The repo already has a canonical home for skill loading, ClawHub posture, and
Skill Vetting.

Milestone 1 defined the platform contract. The active work now is to turn that
contract into a live proactivity-backed runtime ledger.

The current outcomes are:

- `skill_candidate` is now the next runtime contract to land as a first-class
  proactivity opportunity kind
- candidate creation is constrained to bounded distilled evidence, not raw
  transcript persistence
- recurring work must update canonical candidate state instead of piling up
  duplicates in actionable surfaces
- candidate ids must remain stable across inline surfacing, heartbeat, inbox,
  and handoff
- destination capability authority remains documented policy for now; this
  slice does not broadly write or install skills

## Current judgment

The biggest missing skill-system capability is still not “more skills.”

It is the lack of one explicit runtime path that turns repeated real work into
safe, bounded, reviewable skill opportunities without adding a second noisy
queue.

## Remaining work after this slice

- implement the proactivity-backed skill candidate ledger
- build the Skillifier scaffold/check/report lane
- add decisioning/compliance evals
- integrate risk tiers, canarying, rollback, and low-risk auto-promotion
- add cross-runtime install and maintenance surfaces
