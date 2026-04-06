# Delivery Enablements

## Purpose

This spec defines a short pre-feature enablement tranche for the remaining
memory program.

It exists because the later bounded memory slices are now blocked more by
delivery friction than by missing feature design. The semantic retrieval v5
rollout proved that repeated slice time is still being lost to bespoke proof
bootstrapping, misleading rollout health signals, and landing hygiene gaps.

## Goals

- make bounded memory proof work reusable instead of bespoke
- remove repeated memory-runtime bootstrap ceremony from proof scripts, evals,
  and repair tools
- reduce rollout ambiguity when gateway health is actually good but container
  health is misleading
- catch landing-state drift automatically instead of relying on operator
  memory at the end of a slice

## Non-goals

- a generic release platform
- a broad autonomous proof framework
- production pairing/auth changes
- generic semantic-search expansion
- any new user-facing memory family
- large deploy/runtime redesign outside the specific readiness mismatch

## Bounded improvements in this tranche

1. Shared memory runtime bootstrap helper
   - resolve memory SecretRefs through the same supported command/runtime path
   - ensure built-in memory embedding providers are registered
   - give proof scripts, evals, and repair tools one bounded bootstrap entry
     point
2. Repo-owned memory proof runner
   - load the right proof or production config and env
   - use the shared bootstrap helper
   - run bounded capture or retrieval proof steps
   - emit structured JSON with ids, matched fields, and health snapshots
3. Docker health/readiness alignment
   - align container health reporting with the readiness that rollout and proof
     actually care about
   - or split liveness and readiness clearly enough that rollout interpretation
     is no longer manual guesswork
4. Enforced clean-tree landing assertion
   - verify post-commit and post-push cleanliness automatically
   - fail fast when staged/worktree drift survives landing

## Recommended order

1. shared memory runtime bootstrap helper
2. repo-owned memory proof runner
3. enforced clean-tree landing assertion
4. Docker health/readiness alignment

## Why this order is best

- the bootstrap helper is the smallest slice that directly removes repeated
  proof ceremony and cleanly unblocks the proof runner
- the proof runner then converts the biggest repeated slice-time tax into a
  reusable bounded tool
- the clean-tree assertion is cheap and worth doing, but it does not unblock
  the proof path
- health/readiness alignment matters operationally, but it is the least direct
  blocker to the next bounded memory feature slice

## Classification and likely slice count

1. shared memory runtime bootstrap helper
   - classification: `medium`
   - likely slices: `1`
2. repo-owned memory proof runner
   - classification: `fairly serious`
   - likely slices: `1-2`
3. enforced clean-tree landing assertion
   - classification: `cheap`
   - likely slices: `<1-1`
4. Docker health/readiness alignment
   - classification: `medium`
   - likely slices: `1`

Likely tranche total:

- best case: `3` slices
- more realistic: `4` slices
- if the proof runner or readiness work broadens: `5` slices

## Repo-global vs memory-program-specific

Repo-global when landed:

- enforced clean-tree landing assertion
- Docker health/readiness alignment, if it changes shared container semantics

Memory-program-specific enablement:

- shared memory runtime bootstrap helper
- repo-owned memory proof runner

Mixed:

- the proof runner itself is memory-program-specific, but its command or report
  style may influence broader repo rollout habits later

## Done enough to resume user-facing memory slices

For this planned pause, done enough means all four bounded improvements are
landed in v1 form:

- bootstrap helper exists and is reused by the proof-facing path
- proof runner exists and emits structured proof output
- clean-tree landing assertion exists
- readiness signaling no longer requires manual interpretation during proof
  rollout

That is the point where the memory roadmap can resume user-facing slices
without repeatedly re-paying the same operational taxes.

## Current tranche state

Already landed:

- shared memory runtime bootstrap helper
- repo-owned memory proof runner v1
- enforced clean-tree landing assertion

Proof runner v1 is intentionally bounded:

- it accepts typed proof plans instead of freeform scripts
- it supports:
  - `transcript_capture`
  - `candidate_review`
  - `candidate_promote_memory`
  - `candidate_promote_procedure`
  - `procedure_validate`
  - `hybrid_search`
- it captures `/healthz` and `/readyz` before and after each run
- it can do:
  - isolated mutating rehearsal
  - narrow production retrieval-style rehearsal

What remains manual after proof runner v1:

- choosing the exact proof plan JSON for a given slice
- deciding whether production proof should be retrieval-only or cleanup-backed
  mutation
- writing the final human proof report
- any extra evidence gathering beyond ids, matched fields, and health snapshots

Clean-landing assertion v1 is intentionally narrow:

- `scripts/committer` verifies the requested landing paths are clean after the
  commit it creates
- repo push helper paths verify the full landing tree is clean after push
- repo push helper paths verify local `HEAD` still matches the pushed upstream
  ref after push
- broader git policy work remains deferred

Remaining order:

1. Docker health/readiness alignment
