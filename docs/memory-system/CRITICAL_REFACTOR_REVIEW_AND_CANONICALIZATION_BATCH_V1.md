# Critical Refactor Review And Canonicalization Batch V1

## Purpose

This batch did two things in order:

1. a critical review of the remaining rigid memory/runtime architecture
2. the next canonicalization push guided by that review

The review standard was intentionally harsh:

- call out remaining family-first seams
- identify hidden parallel systems
- identify compatibility branches that had quietly become architecture
- flatten or merge anything that only remained because of historical inertia

## Review Findings

### The architecture still had a hidden two-systems problem

The repo was no longer just dealing with a family-heavy memory substrate.

It also still had a separate Main-session routing/control plane spread across:

- `src/agents/pi-embedded-runner/openai-stream-wrappers.ts`
- `src/agents/pi-embedded-runner/extra-params.ts`
- `src/agents/pi-embedded-runner/run/attempt.ts`
- `src/agents/system-prompt-report.ts`

That layer was effectively making memory-planner decisions outside the
canonical memory substrate and then projecting only the final tool choice.

### Canonical metadata was still not the default reader everywhere

Even after canonical records and canonical ingestion candidates existed, some
runtime seams were still re-reading legacy `autoCapture` metadata first:

- `extensions/memory-middleware/src/retrieval-control-plane.ts`
- `extensions/memory-middleware/src/tools/candidate-submit.ts`

That meant compatibility was still acting like the real substrate in some hot
paths.

### Hybrid retrieval execution still had legacy scoring assumptions under the canonical plan

The previous tranche moved hybrid retrieval control onto canonical plans, but
the deeper SQL/scaffolding and feature ranking still assumed legacy family
metadata in several places:

- `extensions/memory-middleware/src/db/hybrid-memory-surface-scaffolding.ts`
- `extensions/memory-middleware/src/retrieval-feature-framework.ts`
- `extensions/memory-middleware/src/db/queries.ts`

### Capture still had duplicated canonical builders

`extensions/memory-middleware/src/ordinary-turn-auto-capture.ts` still carried
its own bespoke canonical-candidate builder even though the shared canonical
adapter module already owned that responsibility.

That duplication was small but important because it let fallback capture drift
away from the shared canonical envelope.

## Newly Confirmed Rigid Or Flattenable Surfaces

The review confirmed earlier known surfaces and added several more that should
now be treated as real migration targets:

- `extensions/memory-middleware/src/db/hybrid-memory-surface-scaffolding.ts`
  - still expressed family-era metadata assumptions in SQL scaffolding
- `extensions/memory-middleware/src/retrieval-feature-framework.ts`
  - still ranked via family-oriented fields rather than a canonical-first
    compatibility seam
- `extensions/memory-middleware/src/memory-canonical-compat.ts`
  - needed to become the single canonical metadata reader instead of one of
    several partial readers
- `src/agents/main-memory-routing.ts`
  - did not exist before this batch; the review concluded the repo needed a
    dedicated planner surface so Main routing stopped hiding inside OpenAI
    wrapper code
- `src/agents/pi-embedded-runner/openai-stream-wrappers.ts`
  - was acting as a second memory router rather than a thin transport wrapper

## Archaic Or Parallel Systems Still Remaining After This Batch

These still remain and should be treated as next-wave retirement targets:

- `extensions/memory-middleware/src/write-action-stages.ts`
  - still dispatches through family/stage ownership rather than a more generic
    canonical write pipeline
- `extensions/memory-middleware/src/workflow-phrase-induction.ts`
  - still a workflow-only induction lane
- `extensions/memory-middleware/src/response-style-phrase-induction.ts`
  - still a second phrase-induction lane that should eventually converge with
    the workflow one
- `extensions/memory-middleware/src/memory-ingestion-resolver.ts`
  - still family-aware internally even when emitting canonical outputs
- `src/plugin-sdk/memory-family-policy.ts`
  - still carries more architectural weight than a mature compatibility layer
    should

## Landed In This Batch

### 1. Hybrid retrieval execution is more canonical-first

Landed earlier in the batch and retained here:

- `extensions/memory-middleware/src/db/hybrid-memory-surface-scaffolding.ts`
- `extensions/memory-middleware/src/retrieval-feature-framework.ts`
- `extensions/memory-middleware/src/db/queries.ts`

The hybrid retrieval execution path now reads canonical candidate/record
metadata first and treats legacy family metadata as fallback.

### 2. Learned-guidance and semantic fallback readers were flattened

Landed earlier in the batch and retained here:

- `extensions/memory-middleware/src/learned-guidance-advisory-planning.ts`
- `extensions/memory-middleware/src/semantic-retrieval-routing.ts`
- `extensions/memory-middleware/src/memory-canonical-compat.ts`

The batch removed duplicated canonical readers and normalized several
fallback-only paths onto shared canonical metadata access.

### 3. Remaining capture fallback canonicalization was completed for the ordinary-turn seam

- `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts`
- `extensions/memory-middleware/src/memory-canonical-compat.ts`

The ordinary-turn fallback path no longer owns a bespoke canonical-candidate
builder. It now uses the shared canonical adapter seam.

### 4. Retrieval control and candidate submission now use one canonical-first metadata reader

- `extensions/memory-middleware/src/memory-canonical-compat.ts`
- `extensions/memory-middleware/src/retrieval-control-plane.ts`
- `extensions/memory-middleware/src/tools/candidate-submit.ts`

This is the most important compatibility retirement in the batch.

The repo now has one shared canonical-first reader for metadata aliases that
used to be read directly from legacy `autoCapture` structures.

### 5. Main routing moved onto a dedicated canonical-memory planner surface

- `src/agents/main-memory-routing.ts`
- `src/agents/pi-embedded-runner/openai-stream-wrappers.ts`
- `src/agents/pi-embedded-runner/run/attempt.ts`
- `src/agents/pi-embedded-runner/extra-params.ts`
- `src/agents/system-prompt-report.ts`
- `src/config/sessions/types.ts`

Main routing is no longer just a bounded phrase/rule classifier hidden inside
the OpenAI wrapper layer.

It now has a dedicated planner surface that produces:

- requested canonical kinds
- derived-view targeting
- canonical facet filters
- matched intent signals
- selected runtime tool target

The OpenAI wrapper is now thinner: it applies the planner decision and records
diagnostics rather than owning the planner logic.

## What This Batch Flattened

This batch flattened or demoted:

- duplicated canonical readers in learned-guidance vs semantic fallback vs
  capture
- legacy-first metadata reads in retrieval control and candidate submit
- the hidden Main memory-routing mini control plane inside the OpenAI wrapper

## What Still Remains

After this batch, the memory system is materially flatter, but not finished.

The next retirement program should target:

1. `extensions/memory-middleware/src/write-action-stages.ts`
2. phrase-induction convergence across workflow and response-style
3. deeper family-aware internals inside `extensions/memory-middleware/src/memory-ingestion-resolver.ts`
4. staged reduction of family-heavy promotion logic in `extensions/memory-middleware/src/tools/candidate-submit.ts`
5. continued shrinkage of `src/plugin-sdk/memory-family-policy.ts` toward pure compatibility/derived-view ownership

## Outcome

The runtime is now more generic and smaller in the places that mattered most
for this push:

- hybrid retrieval execution is more canonical-first
- Main routing is now an explicit canonical-memory planner surface
- compatibility metadata is less likely to silently become the real substrate
- fallback capture and submission paths are flatter and easier to reason about
