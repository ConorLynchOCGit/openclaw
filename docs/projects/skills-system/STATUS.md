---
summary: "Current status for the Skills System project."
title: "Skills System Status"
---

# Skills System Status

## Overall

State: `phase2_model_reviewed_candidate_discovery_in_progress`

The repo already has a canonical home for skill loading, ClawHub posture, and
Skill Vetting.

Milestone 1 defined the platform contract. Milestone 2 made `skill_candidate`
live in the proactivity ledger. Milestone 3 added bounded Skillifier draft
packages. The active work now is a pre-Milestone-4 candidate-discovery repair:
skill and proactive-plan candidates should be model-reviewed from bounded
recent-work episodes, then deterministically validated, deduped, and rendered
through the existing model-authored decision-brief path.

The current outcomes are:

- `skill_candidate` remains the canonical reusable-work opportunity record
- Skillifier MVP consumes canonical candidate ids rather than re-deriving skill
  opportunities from raw session text
- draft-ready state reuses inline surfacing, heartbeat, inbox, and handoff
  instead of introducing a separate skills queue
- user-facing surfaces now need a shared `UserFacingProactivityBrief` contract
  so primary copy is concise, decision-oriented, and distinct from internal
  ledger diagnostics
- deterministic candidate discovery is not sufficient by itself; questions such
  as "what repeatable process should become a skill?" and "what proactive next
  step matters now?" require model judgment over recent work episodes
- live model review may inspect bounded recent transcript/activity excerpts,
  including assistant finals and user corrections, while durable state keeps
  only capped excerpts, refs, hashes, classifications, and proposal summaries
- separate route configs are required for the trigger evaluator, candidate
  reviewer, and presentation brief generator so memory capture/retrieval and
  default chat model behavior remain isolated
- Codex session activity may feed candidate discovery as bounded read-only
  training fodder when available
- reverse prompts must pass a question-quality gate before primary surfacing
- existing-skill enhancement candidates must be distinguished from new-skill
  candidates using explicit skill metadata or candidate linkage

## Current judgment

The biggest missing skill-system capability is now not another artifact type;
it is model-reviewed candidate discovery. Milestone 4 evals should not optimize
deterministic source-fragment candidates when the actual product question is
whether a recent work episode contains a useful skill, proactive plan,
enhancement, merge, or demotion.

## Remaining work after this slice

- add decisioning/compliance evals
- integrate risk tiers, canarying, rollback, and low-risk auto-promotion
- add cross-runtime install and maintenance surfaces
