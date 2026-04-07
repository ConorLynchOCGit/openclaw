# Flattening Batch Report V1

## Starting state

The memory system had already reached practical parity across the six landed
families, but the implementation still had too much accidental
family-specific branching across:

- `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts`
- `extensions/memory-middleware/src/tools/candidate-submit.ts`
- `extensions/memory-middleware/src/proof-runner.ts`
- `extensions/memory-middleware/src/response-style-lifecycle.ts`
- `extensions/memory-middleware/src/project-fact-lifecycle.ts`
- `extensions/memory-middleware/src/workflow-improvement-lifecycle.ts`
- `extensions/memory-middleware/src/recurring-procedure-lifecycle.ts`

This batch implemented the first three flattening slices:

1. family-definition registry
2. unified ingestion resolver
3. unified clustered lifecycle

## Contracts chosen

### Slice 1 — family-definition registry

- introduce one concrete registry for the six landed families
- make the registry a runtime source of truth, not dead reference data
- move real policy lookups into at least two runtime seams
- preserve current family product posture

### Slice 2 — unified ingestion resolver

- create one shared workflow-family resolver for:
  - workflow lessons
  - project rules
  - unmet needs
- route transcript capture and tool-side improvement submission through the
  same resolution path
- preserve typed fast paths, phrase-pattern determinism, ambiguity handling,
  provenance, and explicit correction intent

### Slice 3 — unified clustered lifecycle

- create one shared memory-object lifecycle inspection engine
- move response style, project facts, and workflow improvements onto it
- keep recurring procedures distinct at the validated-procedure target
- preserve held clusters, duplicate suppression, approval targeting, and stale
  candidate handling

## Runtime seams changed per slice

### Slice 1

- added `extensions/memory-middleware/src/memory-family-registry.ts`
- added `extensions/memory-middleware/src/memory-family-registry.test.ts`
- updated `extensions/memory-middleware/src/proof-runner.ts`
- updated `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts`
- updated `extensions/memory-middleware/src/tools/candidate-submit.ts`

### Slice 2

- added `extensions/memory-middleware/src/memory-ingestion-resolver.ts`
- added `extensions/memory-middleware/src/memory-ingestion-resolver.test.ts`
- updated `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts`
- updated `extensions/memory-middleware/src/ordinary-turn-auto-capture.test.ts`
- updated `extensions/memory-middleware/src/tools/candidate-submit.ts`
- updated `extensions/memory-middleware/src/tools/candidate-submit.test.ts`

### Slice 3

- added `extensions/memory-middleware/src/clustered-memory-lifecycle.ts`
- added `extensions/memory-middleware/src/clustered-memory-lifecycle-adapters.test.ts`
- updated `extensions/memory-middleware/src/response-style-lifecycle.ts`
- updated `extensions/memory-middleware/src/project-fact-lifecycle.ts`
- updated `extensions/memory-middleware/src/workflow-improvement-lifecycle.ts`
- updated `extensions/memory-middleware/src/recurring-procedure-lifecycle.ts`
- updated `extensions/memory-middleware/src/memory-family-registry.ts`

## Duplicate branch logic removed per slice

### Slice 1

- proof-runner no longer hardcodes lifecycle inspection selection for the six
  main families
- transcript capture metadata for project facts, recurring procedures, workflow
  lessons, project rules, and unmet needs no longer relies on local
  family-by-family metadata branching
- tool-side workflow-family metadata mapping no longer hardcodes
  workflow/project-rule/unmet-need category selection

### Slice 2

- transcript capture no longer owns a separate workflow/project-rule/unmet-need
  semantic resolution chain
- tool-side improvement submission no longer owns a separate
  workflow/project-rule/unmet-need semantic resolution chain
- tool-side duplicate-key detection for improvement notes no longer re-parses
  workflow-family input on its own

### Slice 3

- response-style, project-fact, and workflow-improvement lifecycle inspection
  no longer each own fully separate memory-object inspection implementations
- recurring procedures no longer carry their own copies of pending-state,
  expiry, and SQL table quoting helpers

## Behavior preserved per slice

### Slice 1

- existing family postures stayed unchanged
- proof plans and runtime lifecycle family outputs stayed unchanged
- capture metadata and category/source values stayed unchanged

### Slice 2

- workflow-family typed and semantic capture behavior stayed unchanged
- approved phrase patterns remained deterministic inputs, not semantic fallback
- transcript and tool paths kept their existing held-cluster review modes

### Slice 3

- held-cluster inspection behavior stayed unchanged for memory-object families
- project scoping stayed intact for project facts and workflow-family entries
- recurring procedures kept their validated-procedure inspection split
- no family was flattened into a new common approval target

## Tests and validation run at the end of each slice

### Slice 1

Commands:

- `pnpm test -- extensions/memory-middleware/src/proof-runner.test.ts extensions/memory-middleware/src/memory-family-registry.test.ts extensions/memory-middleware/src/ordinary-turn-auto-capture.test.ts extensions/memory-middleware/src/tools/candidate-submit.test.ts -t "project rule|unmet need|memory-family-registry|accepts project-rule|accepts unmet-need"`
- `pnpm check:types`

Result:

- targeted tests passed: 4 files, 11 tests passed, 121 skipped
- type-check passed

### Slice 2

Commands:

- `pnpm test -- extensions/memory-middleware/src/memory-ingestion-resolver.test.ts extensions/memory-middleware/src/ordinary-turn-auto-capture.test.ts extensions/memory-middleware/src/tools/candidate-submit.test.ts -t "project rule|unmet need|resolveWorkflowImprovementIngestion|approved phrase|deterministic workflow-improvement evidence"`
- `pnpm check:types`

Result:

- targeted tests passed: 3 files, 9 tests passed, 112 skipped
- type-check passed

### Slice 3

Commands:

- `pnpm test -- extensions/memory-middleware/src/clustered-memory-lifecycle-adapters.test.ts extensions/memory-middleware/src/memory-family-registry.test.ts extensions/memory-middleware/src/ordinary-turn-auto-capture.test.ts extensions/memory-middleware/src/tools/candidate-submit.test.ts -t "clustered lifecycle adapters|project rule|unmet need|memory-family-registry|response style"`
- `pnpm check:types`

Result:

- targeted tests passed: 4 files, 11 tests passed, 114 skipped
- type-check initially failed on leftover wrapper references in
  `response-style-lifecycle.ts` and `workflow-improvement-lifecycle.ts`
- after fixing those wrapper-tail references, the same targeted tests passed
  again and `pnpm check:types` passed

## Docs updated in this batch

- `docs/memory-system/STATUS.md`
- `docs/memory-system/CURRENT_SLICE.md`
- `docs/memory-system/memory-roadmap.md`
- `docs/memory-system/feature-inventory.md`
- `docs/memory-system/FLATTENING_EXECUTION_PLAN.md`
- `docs/memory-system/specs/family-definition-registry.md`
- `docs/memory-system/specs/unified-ingestion-resolver.md`
- `docs/memory-system/specs/unified-clustered-lifecycle.md`
- `docs/memory-system/specs/implementation-sequencing.md`

## Remaining flattening debt after slice 3

- unified correction / supersede engine
- unified phrase-pattern engine
- retrieval feature framework
- behavior-profile layer
- registry-driven proof inspection closeout
- remaining ingestion migration for response style, project facts, and
  recurring procedures
- remaining lifecycle flattening decisions for recurring procedures beyond
  shared utility reuse

## Recommended next flattening slice

- unified correction / supersede
