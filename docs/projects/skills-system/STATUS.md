---
summary: "Current status for the Skills System project."
title: "Skills System Status"
---

# Skills System Status

## Overall

State: `pre_milestone_4_model_owned_skill_parity_alignment`

The repo already has a canonical home for skill loading, ClawHub posture, and
Skill Vetting.

Milestone 1 defined the platform contract. Milestone 2 made `skill_candidate`
live in the proactivity ledger. Milestone 3 added bounded Skillifier draft
packages. The deterministic-judgment removal posture is now a standing
architecture rule for the rest of Phase 2: deterministic code owns structure,
safety, provenance, exact refs, caps, route isolation, and lifecycle state;
models or operators own skill-worthiness, skill-vs-plan classification,
promotion recommendations, usage-based improvement, and visible copy.

The active docs alignment now raises the remaining skill buildout to the
[Skill Quality Parity Gates](/projects/skills-system/specs/skill-quality-parity-gates)
bar so OpenClaw can meet or exceed Gbrain/Hermes-class skill-system behavior
instead of stopping at candidate surfacing and draft generation.

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
- deterministic judgment compatibility paths are not acceptable live code:
  renaming, moving, or wrapping usefulness/relevance/classification/copy logic
  does not count as elimination
- hybrid retrieval may keep deterministic string search, recency,
  graph/projection cues, and source-authority signals for candidate recall and
  package assembly; final semantic value judgment remains model-owned or
  operator-owned
- tests and proof scripts that preserve deterministic judgment behavior are
  removal/rewrite debt
- model-reviewed proactive plans are first-class opportunities, not generic
  follow-up rows
- reverse prompts must pass a question-quality gate before primary surfacing
- existing-skill enhancement candidates must be distinguished from new-skill
  candidates using explicit skill metadata or candidate linkage
- existing skill enhancement cards are legitimate surfaced cards, not
  second-class diagnostics, when the model can tie the opportunity to an exact
  loaded skill or known reusable workflow
- new skill candidates should be bounded capabilities with trigger, inputs,
  procedure/checklist, output artifact, and quality gate; broad "review X"
  activity labels should usually become proactive plans or enhancements unless
  clearly skill-shaped
- Milestone 4 must now establish the first enforceable parity gate: skill eval
  generation/execution, resolver and trigger tests, check-resolvable-style
  reachability and overlap reports, and package E2E for review-only drafts
- later milestones must close install/canary/rollback, usage-based
  self-improvement, approval-gated promotion, and cross-runtime OpenClaw/Codex
  install before parity can be claimed

## Current judgment

The biggest missing skill-system capability is now the quality gate chain after
candidate discovery. Milestone 4 should not merely prove that a skill card can
surface. It must prove that a proposed skill package has generated evals,
trigger/resolver coverage, reachability/overlap checks, and E2E evidence while
keeping skill-worthiness and classification model-owned.

## Remaining work after this slice

- add skill eval generation and execution
- add resolver/trigger tests and check-resolvable-style health reporting
- add package E2E for draft and installed skills
- integrate risk tiers, canarying, rollback, and low-risk auto-promotion
- add usage-based self-improvement loop that proposes model-reviewed repairs,
  eval additions, merges, demotions, or no-action outcomes
- add approval-gated cross-runtime install and maintenance surfaces

## MMV2 capture compatibility checkpoint

- Codex session memory capture is now planned as a gated regular runner that
  feeds the same MMV2 model-owned path as OpenClaw turns and documents.
- The regular Codex runner is enabled by default with explicit opt-out and must
  remain idempotent by refs/hashes.
- Long Codex/OpenClaw prompts should be treated as document-like windows, not
  short ordinary-turn snippets.
- Skill/proactivity candidates should consume captured memories and bounded
  episode packets as evidence, but candidate classification and card copy remain
  model-owned.
- No skill install, promotion, outbound send, or autonomous action execution is
  enabled by the capture runner.
