---
summary: "Current status for the Skills System project."
title: "Skills System Status"
---

# Skills System Status

## Overall

State: `phase2_contiguous_candidate_packets_and_model_cards_in_progress`

The repo already has a canonical home for skill loading, ClawHub posture, and
Skill Vetting.

Milestone 1 defined the platform contract. Milestone 2 made `skill_candidate`
live in the proactivity ledger. Milestone 3 added bounded Skillifier draft
packages. The active work now is a pre-Milestone-4 candidate-discovery repair:
skill and proactive-plan candidates should be reviewed less often with more
contiguous context, then deterministically validated, deduped, and rendered
only through the model-authored decision-brief path when visible.

The current outcomes are:

- `skill_candidate` remains the canonical reusable-work opportunity record
- Skillifier MVP consumes canonical candidate ids rather than re-deriving skill
  opportunities from raw session text
- draft-ready state reuses inline surfacing, heartbeat, inbox, and handoff
  instead of introducing a separate skills queue
- user-facing surfaces now need a shared `UserFacingProactivityBrief` contract
  so primary copy is concise, decision-oriented, and distinct from internal
  ledger diagnostics
- skill/proactivity candidate review is not memory capture; it needs coherent
  work episodes and judgment, not many small atomic facts
- live model review may inspect bounded but substantial recent
  transcript/activity windows, including assistant finals and user corrections,
  while durable state keeps only capped episode turns, refs, hashes,
  classifications, validation reports, and proposal summaries
- candidate review now optimizes for 0-3 high-impact proposals per review and
  prefers no candidate over marginal cleanup
- separate route configs are required for the optional trigger evaluator,
  candidate reviewer, and presentation brief generator so memory
  capture/retrieval and default chat model behavior remain isolated
- Codex session activity is first-class candidate-review input when available;
  live proof must either exercise it or record an explicit unavailable/degraded
  reason
- candidate-review packet assembly must not select "interesting" snippets as a
  hidden relevance judgment; it should preserve contiguous OpenClaw and Codex
  work windows and let the reviewer model decide candidate usefulness
- the broader memory stack still contains deterministic logic; this slice
  preserves deterministic safety/provenance guardrails but adds an audit for
  deterministic semantic judgment that decides meaning, usefulness,
  classification, ranking, or surfacing
- that audit is intentionally aggressive: runtime deterministic value judgments
  are presumed unsafe unless proven to be guardrails or structural retrieval
  constraints, and `runtime_elimination_debt` / `test_enshrinement_debt`
  findings are failing debt
- audit output separates runtime elimination debt from test/fixture references
  and can run in strict mode to fail while production value-judgment debt
  remains
- candidate-review quality now needs local golden-corpus validation before live
  gateway rebuilds, with false negatives attributed to packet context, model
  misses, post-model validation/dedupe suppression, or presentation failure
- deterministic card prose is not an acceptable visible fallback; visible cards
  require model-authored primary copy, and model briefing failures demote or hide
  the item
- model-reviewed proactive plans are first-class opportunities, not generic
  follow-up rows
- reverse prompts must pass a question-quality gate before primary surfacing
- existing-skill enhancement candidates must be distinguished from new-skill
  candidates using explicit skill metadata or candidate linkage

## Current judgment

The biggest missing skill-system capability is now not another artifact type;
it is high-context candidate judgment. Milestone 4 evals should not optimize
atomic source-fragment candidates or deterministic card fallbacks when the
actual product question is whether a coherent work episode contains a useful
reusable skill, proactive plan, enhancement, merge, or demotion.

## Remaining work after this slice

- add decisioning/compliance evals
- integrate risk tiers, canarying, rollback, and low-risk auto-promotion
- add cross-runtime install and maintenance surfaces
