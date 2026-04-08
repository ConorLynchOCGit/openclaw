# Decisions

## Current active architectural decisions

This file records the currently active architecture decisions that govern the
memory roadmap after flattening batch v4, substrate support batch v1, and the
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

## 2026-04 — application selection and proofing are only partially landed

Current accepted framing:

- the repo now has prompt-facing application selection with selected items,
  suppressed items, and rendering hints
- it is not yet the final retrieval-fed per-memory-item selection substrate
- proofing is partially flattened
- it is not yet a fully adapter-driven proof substrate

## 2026-04 — registry policy is not yet authoritative enough

The registry is live and useful.

It is not yet accepted as the full substrate control plane because:

- some policy remains duplicated outside it
- proof definitions are still separately modeled
- semantic-routing policy is not yet fully runtime-authoritative
- workflow-family mapping still exists outside the registry in runtime seams

## 2026-04 — reduced-profile self-improving capture waits for stronger substrate work

Before reduced-profile self-improving capture, the repo must land:

1. recurring-procedure staged substrate redesign
2. correction-policy cleanup

## 2026-04 — new families wait for additional authority and scale cleanup

Before new memory families, the repo must also land:

3. proof-runner adapterization
4. registry authority cleanup
5. memory-family contract / boundary cleanup

## 2026-04 — should-fix-soon cleanup is real but secondary

The following work is accepted as already-landed near-term cleanup:

- improve unit seams around retrieval intent, application selection, and
  semantic fallback
- reduce duplicated SQL expression scaffolding between approved and candidate
  read surfaces
- replace remaining stringly control-flow with closed policy enums or adapter
  registration

These improved proofability and rollout safety, but they did not replace the
primary blocker sequence above.
