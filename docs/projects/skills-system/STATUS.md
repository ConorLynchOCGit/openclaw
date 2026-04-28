---
summary: "Current status for the Skills System project."
title: "Skills System Status"
---

# Skills System Status

## Overall

State: `phase2_proactivity_user_facing_briefs_in_progress`

The repo already has a canonical home for skill loading, ClawHub posture, and
Skill Vetting.

Milestone 1 defined the platform contract. Milestone 2 made `skill_candidate`
live in the proactivity ledger. Milestone 3 added bounded Skillifier draft
packages. The active work now is a pre-Milestone-4 presentation repair so
skill and proactivity cards render human decision briefs instead of internal
planning packets.

The current outcomes are:

- `skill_candidate` remains the canonical reusable-work opportunity record
- Skillifier MVP consumes canonical candidate ids rather than re-deriving skill
  opportunities from raw session text
- draft-ready state reuses inline surfacing, heartbeat, inbox, and handoff
  instead of introducing a separate skills queue
- user-facing surfaces now need a shared `UserFacingProactivityBrief` contract
  so primary copy is concise, decision-oriented, and distinct from internal
  ledger diagnostics
- reverse prompts must pass a question-quality gate before primary surfacing
- existing-skill enhancement candidates must be distinguished from new-skill
  candidates using explicit skill metadata or candidate linkage

## Current judgment

The biggest missing skill-system capability is now not another artifact type;
it is clean operator decision copy. Milestone 4 evals should not be built on
cards that still expose source-fragment titles, why-now plumbing, duplicate
headings, and raw lifecycle shape.

## Remaining work after this slice

- add decisioning/compliance evals
- integrate risk tiers, canarying, rollback, and low-risk auto-promotion
- add cross-runtime install and maintenance surfaces
