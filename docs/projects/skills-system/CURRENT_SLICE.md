---
summary: "Current slice for the Skills System project."
title: "Skills System Current Slice"
---

# Current Slice

## Slice

`phase2-skill-candidate-ledger-proactivity-integration`

## Goal

Implement the first runtime slice of the OpenClaw Skills Platform by adding a
canonical `skill_candidate` ledger path inside the existing proactivity
system.

This slice establishes:

- one first-class `skill_candidate` opportunity kind in the proactivity ledger
- one bounded candidate creation path from real OpenClaw or Codex work
- one deterministic dedupe or supersession model for recurring same-intent
  skill opportunities
- one canonical-id contract across inline chat, heartbeat, inbox, and handoff
- one persistence model that reuses the existing proactivity state store rather
  than creating a parallel skills queue

## Current outcome

- turns skill candidates from a future concept into a live runtime record type
- proves recurring work can surface as one bounded same-session skill
  opportunity without opening a separate skills UI
- keeps candidate evidence distilled and bounded rather than persisting raw
  prompts, transcripts, or tool logs
- keeps destination capability authority as a policy reference only; this slice
  does not broadly write skill packages into skill destinations

## Current judgment

The acceptance gate for this slice is live usefulness, not schema-only
coverage.

The correct output is one canonical `skill_candidate` opportunity that appears
cleanly across inline chat, heartbeat, inbox, and handoff, updates itself when
the same recurring work repeats, and does not reintroduce noisy queue clutter.
