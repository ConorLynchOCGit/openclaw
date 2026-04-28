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
