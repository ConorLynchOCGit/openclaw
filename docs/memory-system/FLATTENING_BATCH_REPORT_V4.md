# Flattening Batch Report V4

## Starting state

- branch: `codex/land-main-session-and-browser-fixes`
- start head: `a8b37d044cd782853a420bd027aa57fbfd34465d`
- start posture: substrate support batch v1 landed, clean tree
- target slices:
  1. full ingestion control-plane flattening
  2. application-selection / behavior-planning layer
  3. retrieval + semantic-routing control-plane flattening

## Contracts chosen for slices 10-12

### Slice 10

- extend the existing ingestion substrate rather than inventing a second
  control plane
- route response style, project facts, and recurring procedures through the
  shared ingestion resolver used by both transcript and tool submission paths
- keep real family-specific parsing/policy differences inside adapters

### Slice 11

- land the strongest honest application-selection layer inside the current
  prompt-facing runtime boundary
- represent selected items, suppressed items, and rendering hints structurally
- make prompt rendering consume that artifact rather than owning policy

### Slice 12

- land one shared hybrid retrieval-control decision for query hints,
  project-family shaping, and semantic fallback family selection
- use the same decision in both `db/queries.ts` and the hybrid search tool
- keep semantic routing family-gated

## Runtime seams changed per slice

### Slice 10

- `extensions/memory-middleware/src/memory-ingestion-resolver.ts`
- `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts`
- `extensions/memory-middleware/src/tools/candidate-submit.ts`
- `extensions/memory-middleware/src/memory-ingestion-types.ts`
- `extensions/memory-middleware/src/memory-ingestion-resolver.test.ts`

### Slice 11

- `extensions/memory-core/src/behavior-profile.ts`
- `extensions/memory-core/src/prompt-section.ts`
- `extensions/memory-core/src/behavior-profile.test.ts`
- `extensions/memory-core/index.test.ts`

### Slice 12

- `extensions/memory-middleware/src/retrieval-control-plane.ts`
- `extensions/memory-middleware/src/retrieval-control-plane.test.ts`
- `extensions/memory-middleware/src/db/queries.ts`
- `extensions/memory-middleware/src/tools/memory-object-search-hybrid.ts`
- `extensions/memory-middleware/src/tools/memory-object-search-hybrid.test.ts`

## Duplicate branch logic removed or reduced per slice

### Slice 10

- removed the remaining separate response-style transcript/tool ingestion path
- removed the remaining separate project-fact transcript/tool ingestion path
- removed the remaining separate recurring-procedure transcript/tool ingestion
  path
- removed duplicate transcript/tool canonical match conversion helpers

### Slice 11

- removed prompt-section branching as the effective durable-memory application
  owner
- moved prompt-facing family selection/suppression into one structured
  application-selection artifact

### Slice 12

- removed duplicated hybrid query-intent inference across query code and tool
  wrapper
- removed unconditional semantic fallback spraying from the hybrid tool
- moved project-family shaping under the shared retrieval-control decision

## Behavior preserved per slice

### Slice 10

- procedures remain distinct and are not flattened into ordinary memory-object
  behavior
- response-style forget behavior stays bounded
- project-fact stricter posture stays intact
- workflow-family capture semantics remain intact

### Slice 11

- `shape_reply`, `direct_answer`, `guidance_only`, `recommendation_only`, and
  `suggestion_first` remain distinct
- procedure clear-ask restrictions remain intact
- project-fact stricter direct-answer posture remains intact

### Slice 12

- approved-only defaults remain intact
- candidate retrieval remains explicit-scope only
- validated-procedure retrieval remains explicit-scope only
- semantic routing stays family-gated

## Tests and validation run at the end of each slice

### Slice 10

- `pnpm test -- extensions/memory-middleware/src/memory-ingestion-resolver.test.ts extensions/memory-middleware/src/ordinary-turn-auto-capture.test.ts extensions/memory-middleware/src/tools/candidate-submit.test.ts`
- `pnpm check:types`

### Slice 11

- `pnpm test -- extensions/memory-core/src/behavior-profile.test.ts extensions/memory-core/index.test.ts src/plugins/memory-state.test.ts`
- `pnpm check:types`

### Slice 12

- `pnpm test -- extensions/memory-middleware/src/retrieval-control-plane.test.ts extensions/memory-middleware/src/semantic-retrieval-routing.test.ts extensions/memory-middleware/src/tools/memory-object-search-hybrid.test.ts extensions/memory-middleware/src/db/queries.test.ts extensions/memory-middleware/src/retrieval-feature-framework.test.ts`
- `pnpm check:types`

## Remaining main substrate work after batch v4

### Remaining blockers before reduced-profile self-improving capture

1. recurring-procedure staged substrate redesign
2. correction-policy cleanup

### Remaining blockers before new families

3. proof-runner adapterization
4. registry authority cleanup
5. memory-family contract / boundary cleanup

### Could fix later

- deeper retrieval SQL normalization after the procedure redesign
- tighter artifact / read-model convergence if procedures still feel too
  separate after the staged redesign

## Exact next implementation slice recommended

- recurring-procedure staged substrate redesign

Reason:

- the procedure subsystem is now the largest remaining family-specific
  structural seam
- self-improving capture should not land until procedures are a staged family on
  the shared substrate rather than a quasi-separate subsystem
