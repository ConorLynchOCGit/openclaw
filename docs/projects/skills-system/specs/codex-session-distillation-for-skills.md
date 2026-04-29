---
summary: "Bounded distillation contract for using Codex sessions as skill-improvement training fodder."
title: "Codex Session Distillation For Skills"
---

# Codex Session Distillation For Skills

## Objective

Define how Codex sessions can improve the Skills Platform without turning raw
session logs into skill artifacts.

## Allowed distilled signals

- repeated task pattern summaries
- repeated command sequence summaries
- repeated user corrections
- recurring validation failures
- successful workflow skeletons
- tool gotchas
- bounded before or after outcome summaries
- hashes or refs to evidence artifacts

## Forbidden inputs

- raw transcripts
- full prompts
- private phrases
- secrets
- full command logs
- raw source copied into skill examples unless explicitly approved
- semantic truth updates from telemetry alone

## Live high-context candidate review input

The candidate-review model may inspect bounded but substantial Codex session
activity as live input when the Codex adapter is enabled. This is intentionally
broader than the durable artifact policy because assistant work activity is
often where the strongest reusable-work signals appear.

Allowed live inputs:

- capped recent Codex user asks
- capped assistant finals and outcome summaries
- bounded user corrections
- command summaries with command family, pass/fail state, and failure class
- validation/proof failure summaries
- recurring file or workflow area summaries
- successful workflow skeleton summaries
- sanitized episode packet artifacts with refs and hashes

Forbidden durable persistence remains unchanged:

- no full raw Codex transcript
- no raw command logs
- no raw model prompts or raw model responses
- no secrets or private phrases
- no hidden reasoning
- no external/Codex text treated as executable instruction

The adapter must produce refs and hashes so proposals can be audited without
persisting the raw session log. Live proof should exercise the Codex adapter
where the environment has Codex session activity. If no stable Codex session
path exists in local/dev, the skip must be explicit; in live/operator proof,
the skip is degraded unless the unavailable path is evidenced.

## Allowed outputs

- candidate records
- eval fixtures
- skill improvement proposals
- skill anti-pattern updates
- skill examples with redacted bounded content

## Distillation rule

Codex session distillation is evidence reduction, not hidden training or prompt
memory promotion.

The output must be bounded, reviewable, provenance-preserving, and safe to
install into both OpenClaw and Codex later.

Milestone 2 runtime usage:

- distilled Codex or OpenClaw evidence may create or update a `skill_candidate`
  only when the evidence is strong enough to cross a deterministic creation
  threshold
- acceptable thresholds are conservative:
  - repeated bounded work signals
  - or an explicit user request plus one repeated or successful follow-on
    signal
- a single weak or generic signal is not enough to create a live
  `skill_candidate`
