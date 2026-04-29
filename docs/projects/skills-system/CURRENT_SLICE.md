---
summary: "Current slice for the Skills System project."
title: "Skills System Current Slice"
---

# Current Slice

## Slice

`phase2-model-reviewed-candidate-discovery`

## Goal

Repair the remaining candidate-discovery gap before Milestone 4 skill eval work
begins. Presentation cards are now model-authored decision briefs, but the
candidate selection path is still too deterministic for subjective questions
such as what should become a skill, what should become a proactive plan, and
whether a candidate is new, an enhancement, a merge, or weak enough to demote.

This slice establishes:

- a deterministic Stage 1 prefilter that decides when it is worth asking a
  model whether live candidate review should run
- Stage 1 is structural only: assistant finals, heartbeat/session boundaries,
  validation/proof failures, and card-quality or dismissal events. It must not
  use skill/proactivity/candidate/workflow keywords, correction phrases,
  recurring-work phrases, or turn counts as hints or gates.
- a bounded Stage 2 model trigger evaluator that chooses whether there is
  enough signal, which recent refs belong in the review window, and whether the
  review goal is skills, proactivity, both, or none
- a bounded episode packet that may include capped recent user and assistant
  transcript/activity excerpts for live model review
- a model-reviewed candidate proposal pass for proactive plans, new skills,
  existing-skill enhancements, merge/extend candidates, and demotions
- deterministic validation, cooldown, dedupe, provenance, no-dark-data, and
  write-eligibility gates after every model output
- Codex session activity as read-only bounded training fodder where available

## Current outcome

- live candidate review may inspect bounded recent transcript/activity windows,
  because assistant work and user correction often contain the strongest skill
  and proactive-plan signals
- durable state must persist only bounded episode packets, capped excerpts,
  refs, hashes, classifications, validation results, and proposal summaries
- raw full transcripts, raw prompts, raw tool logs, secrets, private phrases,
  and unbounded Codex/OpenClaw session text remain forbidden durable artifacts
- model trigger decisions and candidate proposals are not semantic truth and
  cannot install skills, execute actions, send messages, mutate files, or write
  canonical memory truth
- model-authored `UserFacingProactivityBrief` remains the presentation path for
  surfaced candidates

## Current judgment

The acceptance gate for this slice is candidate usefulness, not just card
clarity.

The correct output is not a deterministic source-fragment candidate that a model
prettifies later. The correct output is a bounded recent-work episode reviewed
by a model for subjective usefulness, then deterministically validated and
deduped before the existing proactivity surfaces render a decision brief.
