---
summary: "Current slice for the Skills System project."
title: "Skills System Current Slice"
---

# Current Slice

## Slice

`phase2-contiguous-candidate-packets-and-model-cards`

## Goal

Repair the remaining candidate-discovery and card-rendering gaps before
Milestone 4 skill eval work begins. Presentation cards are model-authored
decision briefs, and candidate selection is model-reviewed, but the latest live
proof showed the packet builder still made hidden deterministic judgments about
which snippets the reviewer could see. It also showed that deterministic card
fallbacks are not acceptable visible product copy.

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
- contiguous OpenClaw and Codex work windows instead of adjacency-selected
  "interesting" snippets
- model-authored primary card copy for every visible proactivity item; invalid
  or unavailable model-authored copy demotes the item instead of surfacing
  deterministic fallback prose
- first-class `proactive_plan` opportunities for model-reviewed plans, with the
  same model-authored presentation guarantees as skill candidates
- local deterministic-judgment audit for the broader memory stack, limited to
  finding and prioritizing deterministic value-judgment hotspots while
  preserving deterministic safety/provenance guardrails
- aggressive elimination posture for deterministic value judgment:
  `runtime_elimination_debt` and `test_enshrinement_debt` are treated as
  failing removal/model-routing/rewrite debt, not informational findings
- local golden-corpus candidate-review validation before any live gateway
  rebuild, with miss attribution across packet assembly, model review,
  post-model validation/dedupe, and visible-card presentation

## Current outcome

- skill/proactivity candidate review is explicitly not memory capture
- deterministic packet assembly may enforce recency, source, size caps, safety
  redaction, refs, hashes, and provenance only; it must not decide semantic
  relevance by snippet selection
- OpenClaw candidate packets should include the last configurable number of
  full user/assistant turns as one contiguous episode window
- Codex candidate packets should include the last relevant contiguous session
  window, preserving user asks, assistant finals, command intent/status,
  validation failures, touched areas, and outcomes where available
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
- deterministic `UserFacingProactivityBrief` copy is hidden fallback input and
  diagnostics only; it must not be visible primary card text
- Codex adapter skips are explicit; in live proof they are degraded unless the
  Codex session path is genuinely unavailable
- the acceptance path now runs function-level candidate-review validation
  before rebuilding the live gateway; the UI proof is for wiring confirmation,
  not first discovery of packet/model/card failures

## Current judgment

The acceptance gate for this slice is candidate usefulness, not just card
clarity.

The correct output is not a stream of small source-fragment candidates. The
correct output is a handful of high-leverage skills or proactive plans per day,
or no candidate when the work episode does not justify one. The latest proof
also makes card authorship part of the acceptance gate: if a visible card cannot
be model-authored into clear title, purpose, and next step, it should not be
shown.
