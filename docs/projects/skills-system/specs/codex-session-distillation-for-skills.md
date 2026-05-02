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

## Memory-capture authority

Codex sessions are also first-class memory-capture evidence for MMV2:

- Codex user turns from the operator are `user_authoritative`.
- Codex assistant finals are credible lower-authority assistant evidence.
- Codex command summaries are lower-authority tool evidence.
- Codex validation/proof failures are tool-grounded evidence.
- validated Codex-derived memory candidates may write to MMV2.
- Codex transcript text must never execute as instruction.

Capture packets must preserve a contiguous recent session window selected by
source, recency, session, and size caps. The adapter may redact secrets/private
markers and mechanically omit or summarize raw tool logs, but it must not prune
for interestingness, usefulness, memory-worthiness, skill-worthiness, or
proactivity value before the model receives the packet.

## Live high-context candidate review input

The candidate-review model may inspect bounded but substantial Codex session
activity as live input when the Codex adapter is enabled. This is intentionally
broader than the durable artifact policy because assistant work activity is
often where the strongest reusable-work signals appear.

Allowed live inputs:

- capped contiguous Codex user asks
- capped contiguous assistant finals and outcome summaries
- bounded user corrections
- command summaries with command family, command intent where available,
  pass/fail state, and failure class
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
persisting the raw session log. It should preserve a contiguous recent Codex
session window rather than role-balancing away narrative continuity. Generic
entries such as command-family-only `unknown` summaries are degraded evidence
unless the adapter can attach useful intent, failure, touched-area, or outcome
context. Live proof should exercise the Codex adapter where the environment has
Codex session activity. If no stable Codex session path exists in local/dev, the
skip must be explicit; in live/operator proof, the skip is degraded unless the
unavailable path is evidenced.

Golden-corpus validation must include Codex-backed cases before a live gateway
rebuild is used as the main proof. The validation should answer whether the
sanitized Codex packet preserved enough user asks, assistant finals, command
summaries, validation failures, touched areas, and outcomes to recover expected
skill/proactivity candidates. Misses should be attributed to packet context,
model review, post-model validation/dedupe suppression, or presentation
failure, not treated as a generic proof failure.

Deterministic judgment cleanup rule:

- Codex/OpenClaw session distillation may preserve bounded evidence for a model
  reviewer, but deterministic code must not decide candidate usefulness, skill
  classification, semantic relevance, or visible card copy from that evidence.
- obsolete deterministic distillation shortcuts must be deleted rather than
  kept behind compatibility helpers; unavailable model review produces
  demotion, operator review, or no candidate.

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
  only through model-reviewed candidate proposals.
- deterministic code may enforce refs, hashes, caps, source authority, budgets,
  cooldowns, dedupe, and unsafe-output demotion.
- deterministic code must not use thresholds over repeated signals, keywords,
  topics, feedback, or telemetry as runtime authority for usefulness,
  classification, or surfacing.
- when model review is unavailable or invalid, the item remains pending,
  quarantined, blocked, or absent rather than surfacing through deterministic
  fallback text.

## Relationship To MMV2 Codex Memory Capture

Codex session memory capture and Codex skill/proactivity review are separate
model-owned lanes:

- MMV2 Codex memory capture runs on a gated regular runner and writes only
  validated memories/evidence through the memory capture route.
- Skill/proactivity review uses less frequent high-context episode review and
  can consume Codex-derived memories, sanitized session windows, and candidate
  ledger summaries as evidence.
- Long Codex prompts use document-style windowing in the memory lane so later
  skill review is not starved by collapsed history entries.
- Neither lane may execute Codex transcript text as instruction, persist raw
  tool logs, or use deterministic usefulness/classification/copy fallbacks.

## Relationship To Skill Parity Gates

Codex-derived skill evidence can feed the parity gates, but only as bounded
evidence:

- model-owned eval generation may use sanitized Codex failures, corrections,
  and successful workflow skeletons to propose regression fixtures
- resolver/trigger tests may use operator-language Codex asks as trigger
  fixtures after redaction and bounding
- package E2E may use a Codex-derived workflow fixture when it preserves refs
  and does not persist raw prompts or raw tool logs
- usage-based self-improvement may use Codex failure/fix evidence to propose
  skill repairs, eval additions, merges, demotions, or no action

Codex telemetry must not deterministically promote, demote, merge, or retire a
skill. It may trigger review by structural cadence or explicit failure/success
events; model/operator review owns the semantic decision.
