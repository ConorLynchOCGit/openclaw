---
summary: "Baseline cutover thesis for the current model-memory blocker analysis."
title: "Model Memory Cutover Thesis"
---

# Model Memory Cutover Thesis

This page records the current baseline thesis before the explicit hole-check
pass.

It is intentionally a statement of the current belief, not a claim that the
belief is fully proven.

For the current evidence-based hole check and reevaluation, see:

- [Thesis Hole Evaluation](/projects/model-memory/evidence/thesis-hole-evaluation)

## Current execution thesis

Current judgment:

- `production_cutover_flip_executed`

Current thesis:

- the aggressive full cutover has now been executed on the live runtime:
  - `model-memory` is enabled
  - database configuration is present
  - legacy slot is off
  - legacy memory search is off
- rollback is now treated as:
  - disable `model-memory`
  - keep `plugins.slots.memory = "none"`
  - keep `agents.defaults.memorySearch.enabled = false`
  - continue in native no-memory mode
- the active safety controls are now post-cutover operating controls:
  - 72-hour observability
  - daily sampled review
  - fast-follow fixes
- the repo should not reopen pre-cutover tuning unless the watch window finds
  a real production blocker

## Baseline thesis

Current judgment:

- `not_ready_for_cutover`

Current thesis:

- support-only churn is no longer the live blocker
- retrieval/context boundedness is green on the current preserved corpus
- the remaining cutover blocker is duplicate under-attachment in dense rule
  guidance, especially `AGENTS.md`
- the failure appears mostly deterministic gate loss on wrapper-heavy
  same-rule restatements, with a smaller secondary batch-adjudication
  conservatism component
- the preserved-corpus qualitative duplicate review is the strongest current
  cutover truth surface and should outweigh the narrower benchmark seed basket
  for the cutover call

## Why this thesis exists

The current proof and duplicate evidence surfaces say all of the following at
once:

- the honest `pure_attach_support` proof lane is stable
- unchanged rebuilds remain stable outside transient retrieval-pack growth
- retrieval/context proof is green on the current corpus
- `AGENTS.md` still shows heavy duplicate gate loss
- the preserved-corpus qualitative duplicate review still contains clear
  should-attach misses

That combination means the blocker is no longer support-only stability or
context boundedness. It is duplicate quality.

## What could still make this thesis wrong

The current thesis could still be wrong in several ways:

1. `AGENTS.md` may be an unusually adversarial stress source rather than a
   fair cutover proxy.
2. Some reviewed “misses” may actually be correct distinct writes once
   additive constraints are examined closely.
3. The qualitative review sample is still small.
4. The benchmark and the qualitative review currently point in different
   directions.
5. The support-only stability proof uses synthetic existing-object replay,
   not a naturally occurring support-only source rerun.
6. The remaining blocker may be a mixed recall-plus-choice problem rather than
   mostly deterministic gate loss.
7. Replay-based audit paths may still diverge from the exact live write path.
8. The cutover bar may be intentionally stricter than operational necessity.
9. Deferred `reference` recall could still hide a future blocker.
10. Current-corpus green lanes may not generalize to broader production prompt
    shapes.

Those holes are now evaluated explicitly in the thesis-hole evaluation artifact
instead of only being discussed in chat.

## Reevaluated thesis after the unified-bounded-adjudication pass

Current judgment:

- `not_ready_for_cutover`

Current reevaluated thesis:

- support-only churn is not the blocker:
  - the proof lane now runs a true `pure_attach_support` probe
  - stable projection, artifact, and cache layers stay stable under that probe
- retrieval/context boundedness remains green on the current preserved corpus,
  now across a slightly broader prompt basket
- duplicate quality remains the blocker, and the blocker is still mixed:
  - AGENTS still shows dominant zero-candidate gate loss:
    - `zero_candidate_skips = 24`
    - `attach_support = 3`
  - retained-candidate conversion is now clearly a second live blocker:
    - current retained bounded-adjudication cases on AGENTS, docs/help/testing,
      and docs/gateway/configuration still mostly route to `direct_distinct`
  - the shared review basket still contains six clear
    should-attach misses
- the unified bounded-adjudication lane proved something important:
  - the architecture is cleaner than the split recovery model
  - the bounded contract works on the labeled basket
  - the live corpus still does not convert enough of the unresolved cases
  - labeled evaluation result:
    - `overallConversionRate = 1.0`
    - `falseMergeRate = 0`
    - `ambiguousRate = 0`
    - `retainedCandidateOnlySuccessRate = 1.0`
    - `zeroCandidateFallbackSuccessRate = 0`
- review and benchmark now use one shared basket, and they still agree that
  duplicate quality is not cutover-clean:
  - review:
    - `clear_duplicate_should_attach = 6`
    - `clear_distinct_should_stay_distinct = 6`
    - `true_ambiguity = 4`
  - benchmark:
    - `attachSupportMissRateOnReruns = 0.3571`
    - `falseDistinctRateOnReruns = 0.3571`
    - uncertainty is still wide
- long-horizon behavior is still the final gating blocker:
  - proof remains `not_ready`
  - active objects rose from `534` to `580`
  - duplicate active-object candidates now sit at `29`

What this changes:

- the blocker is no longer support-only stability or retrieval/context
  boundedness
- the blocker remains:
  - mixed duplicate under-attachment
  - plus long-horizon active-object growth that still fails the cutover bar
- the latest pass improved the architecture more than the live evidence:
  - one bounded contract now owns unresolved duplicate cases
  - raw-text fallback is now correctly subordinate to retained candidates
- but it also exposed the current limit:
  - the main remaining misses are not solved by merely unifying the lane
  - current-corpus retained candidates are still being rejected too often
  - AGENTS zero-candidate loss remains high enough to matter on a real blocker
    source
- one more focused pass is only justified if it targets:
  - calibrating retained-candidate bounded adjudication on real corpus cases
  - reducing AGENTS zero-candidate loss without broadening global merge
    authority
  - reducing long-horizon fresh active-object growth
- broader complexity beyond that is likely diminishing-return debt

## Reevaluated thesis after the AGENTS-only fallback-admission drift-tolerance pass

Current judgment:

- `not_ready_for_cutover`

Current reevaluated thesis:

- the user’s original diagnosis about fallback candidate admission was correct:
  - raw-text retrieval was already surfacing plausible AGENTS neighbors
  - mandatory post-retrieval `canonicalClass`, `kind`, and `scopeKey`
    agreement was suppressing those candidates before adjudication
- that bottleneck is now materially improved on the isolated `AGENTS.md`
  surface:
  - before:
    - `zero_candidate_skips = 24`
    - fallback `adjudicationCandidateCount > 0 = 0`
    - fallback `adjudicationBatchAdmitted = 0`
  - after:
    - `zero_candidate_skips = 24`
    - fallback `adjudicationCandidateCount > 0 = 12`
    - fallback `adjudicationBatchAdmitted = 12`
- the remaining AGENTS blocker is now narrower and more honest:
  - candidate surfacing is no longer the whole problem
  - post-adjudication conversion remains weak:
    - `direct_distinct = 6`
    - `local_conflict_hold_structural_drift = 5`
    - `local_conflict_hold_ambiguous = 1`
    - only `attach_support = 1`
- the isolated AGENTS pass therefore changes the thesis from:
  - “fallback may not be running or may be under-retrieving”
    to:
  - “fallback admission was over-gated, and after fixing that, the remaining
    problem is mostly how drifted matches are judged and locally routed”
- final write authority should remain local:
  - the new structural-drift hold route is correct and evidence-backed
  - the next risk is no longer silent under-admission
- the next risk is over-conservative conversion after admission

## Updated cutover thesis for aggressive transition planning

Current judgment:

- `ready_to_execute_cutover_plan`

Current thesis:

- `model-memory` is now good enough to replace the legacy memory stack
  operationally
- the old memory system is not worth preserving as the preferred rollback
  target
- remaining quality gaps should now be handled through:
  - post-cutover observability
  - daily sampled review
  - fast-follow fixes
- the main blocker is no longer memory-quality research
- the main blocker is execution:
  - live runtime wiring
  - explicit disablement path
  - operational rollout discipline

What changed:

- AGENTS is no longer worth further targeted tuning
- support-only stability is proven enough
- retrieval/context proof is green enough for cutover execution
- the remaining risks are better managed by rollout controls than by more
  pre-cutover complexity

What this changes:

- the earlier AGENTS mystery is resolved:
  - fallback was running
  - it was failing because admission still required drift-prone structural
    fields
- one important seam is now cleaner and more honest
- cutover is still blocked because this isolated improvement did not turn into
  enough safe support attachment
- the next justified pass, if any, should target:
  - adjudication quality on structurally drifted but text-near candidates
  - local post-adjudication routing for those drifted matches
  - not another broad retrieval or taxonomy expansion
