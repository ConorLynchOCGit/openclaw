# Decisions

## Current active architectural decisions

This file records the currently active architecture decisions that govern the
memory roadmap after flattening batch v6, substrate support batch v1, and the
accepted post-v3 architecture review.

## 2026-04 — practical parity was enough to enter flattening, not enough to move on

Practical parity across the six landed families was accepted as sufficient to
start flattening.

It was not accepted as proof that:

- the substrate was already flat enough for reduced-profile self-improving
  capture
- the substrate was already flat enough for new memory families

## 2026-04 — the current docs were too optimistic after batch v3

The earlier roadmap/status/current-slice framing that reduced the remaining
work to one narrow closeout slice is no longer accepted.

The accepted review conclusion is that multiple more flatten/refactor slices
are still warranted before later phases.

## 2026-04 — preserve real family-policy differences

The substrate work must preserve:

- procedures as `suggestion_first` and direct-use only on clear ask
- project facts as explicit, scoped, and stricter than generic guidance
- response style as bounded reply-shaping memory rather than broad personality
  memory
- unmet needs as recommendation-only
- semantic routing as hybrid-first and family-gated
- phrase induction as family-eligible rather than universal

## 2026-04 — collapse accidental parallel systems before self-improving capture

The next substrate work must collapse accidental duplication across:

- transcript and tool-side ingestion
- retrieval intent and semantic routing
- application selection and suppression
- recurring-procedure subsystem shape
- correction-policy control flow
- proof-runner structure
- registry authority
- memory-family contract boundaries

## 2026-04 — application selection is partial and proofing is adapterized

Current accepted framing:

- the repo now has prompt-facing application selection with selected items,
  suppressed items, and rendering hints
- it is not yet the final retrieval-fed per-memory-item selection substrate
- proofing is now adapter-driven
- registry authority still remains before proof policy can be called fully
  centralized

## 2026-04 — registry authority cleanup is now landed

Current accepted framing:

- workflow-family mapping now derives from the registry
- phrase proof-family ownership now derives from the registry
- the registry is now honest enough to be called the main family policy control
  plane for the six current families
- adapters still remain the honest boundary for parser bodies and query bodies

## 2026-04 — reduced-profile self-improving capture waits for stronger substrate work

Before reduced-profile self-improving capture, the repo must land:

1. recurring-procedure staged substrate redesign
2. correction-policy cleanup

Those blockers are now landed.

Reduced-profile self-improving capture still remains intentionally deferred
until the post-v6 reevaluation proves the stronger substrate can carry it
without creating new parallel systems.

## 2026-04 — new families wait for additional authority and scale cleanup

Before new memory families, the repo must also land:

3. proof-runner adapterization
4. registry authority cleanup
5. memory-family contract / boundary cleanup

Proof-runner adapterization, registry authority cleanup, and memory-family
contract / boundary cleanup are now landed.

## 2026-04 — the public family-policy SDK seam is now real

Current accepted framing:

- `src/plugin-sdk/memory-family-policy.ts` now owns the shared family policy
  contract directly
- `memory-core` no longer reaches that contract through a middleware
  implementation re-export
- later contract trimming may still happen, but the old boundary smell is no
  longer accepted as current state

## 2026-04 — should-fix-soon cleanup is real but secondary

The following work is accepted as already-landed near-term cleanup:

- improve unit seams around retrieval intent, application selection, and
  semantic fallback
- reduce duplicated SQL expression scaffolding between approved and candidate
  read surfaces
- replace remaining stringly control-flow with closed policy enums or adapter
  registration

These improved proofability and rollout safety, but they did not replace the
primary blocker sequence above while it was still open.

One later bounded retrieval cleanup also landed in flattening batch v6:

- approved-vs-reviewable-candidate `get` / `list` / `basic` memory-object SQL
  scaffolding reduction
