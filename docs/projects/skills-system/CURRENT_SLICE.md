---
summary: "Current slice for the Skills System project."
title: "Skills System Current Slice"
---

# Current Slice

## Slice

`phase2-high-context-candidate-review`

## Goal

Repair the remaining candidate-discovery gap before Milestone 4 skill eval work
begins. Presentation cards are now model-authored decision briefs, and
candidate selection is model-reviewed, but the first packet shape was still too
memory-like: short excerpts preserve atomic facts, not the narrative continuity
needed to judge repeatable skills and high-value proactive plans.

This slice establishes:

- infrequent high-context review instead of frequent atomic extraction
- structural cadence only: heartbeat/operator briefing, every 3 assistant
  finals by default, session/compaction boundary, and a future manual review
  hook
- `episodeTurns` with larger caps so the reviewer sees a coherent work episode
  instead of sentence fragments
- Codex session activity as first-class review input where available
- a higher-quality candidate reviewer route that returns 0-3 high-impact
  proposals, preferring no candidate over weak or tiny cleanup candidates
- model-reviewed proposal classification for proactive plans, new skills,
  existing-skill enhancements, merge/extend candidates, and demotions
- deterministic validation, cooldown, dedupe, provenance, no-dark-data, and
  write-eligibility gates after every model output
- sanitized episode packet artifacts for auditability

## Current outcome

- skill/proactivity candidate review is explicitly not memory capture
- live candidate review may inspect bounded but substantial recent
  transcript/activity windows, because assistant work and user correction often
  contain the strongest skill and proactive-plan signals
- durable state must persist only sanitized episode packets, capped episode
  turns, refs, hashes, classifications, validation results, and proposal
  summaries
- raw full transcripts, raw prompts, raw tool logs, secrets, private phrases,
  and unbounded Codex/OpenClaw session text remain forbidden durable artifacts
- model trigger decisions and candidate proposals are not semantic truth and
  cannot install skills, execute actions, send messages, mutate files, or write
  canonical memory truth
- model-authored `UserFacingProactivityBrief` remains the presentation path for
  surfaced candidates
- Codex adapter skips are explicit; in live proof they are degraded unless the
  Codex session path is genuinely unavailable

## Current judgment

The acceptance gate for this slice is candidate usefulness, not just card
clarity.

The correct output is not a stream of small source-fragment candidates. The
correct output is a handful of high-leverage skills or proactive plans per day,
or no candidate when the work episode does not justify one.
