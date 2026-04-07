# Flattening Batch Report V2

## Starting state

The memory system had already landed flattening batch v1:

1. family-definition registry
2. unified ingestion resolver for the workflow-family cluster
3. unified clustered lifecycle inspection for memory-object families

The next flattening gaps were still concentrated in:

- correction / supersede planning and lineage writes
- phrase-pattern substrate duplication between workflow and response style
- approved-memory hybrid retrieval scoring in `extensions/memory-middleware/src/db/queries.ts`

## Contracts chosen

### Slice 4 — unified correction / supersede engine

- centralize correction intent planning, target validation, immediate-vs-held
  dispatch, and approved memory-object supersede writes
- migrate one older bounded lane and one generalized lane onto the same engine
- preserve explicit correction requirements, approved-only posture, and visible
  supersede lineage

### Slice 5 — unified phrase-pattern engine

- move workflow lessons and response style onto one reviewed phrase substrate
- keep phrase eligibility narrow and policy-driven
- preserve approved-only phrase artifacts, deterministic feed-through, and no
  semantic fallback

### Slice 6 — retrieval feature framework

- replace the approved-memory generic ranking forest with one shared feature
  composer
- drive family retrieval weights from the registry where honest
- preserve typed fast-path wins, approved-only posture, direct named-project
  intent shaping, and current hybrid-first behavior

## Runtime seams changed per slice

### Slice 4

- added `extensions/memory-middleware/src/memory-correction-engine.ts`
- added `extensions/memory-middleware/src/memory-correction-engine.test.ts`
- added `extensions/memory-middleware/src/memory-object-supersede.ts`
- updated `extensions/memory-middleware/src/db/queries.ts`
- updated `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts`
- updated `extensions/memory-middleware/src/tools/candidate-submit.ts`
- updated `extensions/memory-middleware/src/workflow-improvement-lifecycle.ts`

### Slice 5

- added `extensions/memory-middleware/src/phrase-pattern-engine.ts`
- updated `extensions/memory-middleware/src/response-style-phrase-induction.ts`
- updated `extensions/memory-middleware/src/workflow-phrase-induction.ts`

### Slice 6

- added `extensions/memory-middleware/src/retrieval-feature-framework.ts`
- added `extensions/memory-middleware/src/retrieval-feature-framework.test.ts`
- updated `extensions/memory-middleware/src/db/queries.ts`
- updated `extensions/memory-middleware/src/memory-family-registry.ts`
- updated `extensions/memory-middleware/src/memory-family-registry.test.ts`

## Duplicate branch logic removed per slice

### Slice 4

- bounded response-style and project-fact correction auto-promotion no longer
  own separate immediate supersede planning paths
- workflow-family auto-review no longer owns a separate supersede-target
  resolution path
- workflow-improvement lifecycle no longer owns a separate approved
  memory-object supersede write loop

### Slice 5

- workflow and response-style phrase induction no longer each own separate:
  - reviewed phrase proposal derivation
  - phrase lifecycle inspection
  - approved phrase lookup
  - hold/approve/promotion control flow

### Slice 6

- approved-memory hybrid retrieval no longer hand-inlines separate generic
  score branches for:
  - response style
  - project facts
  - workflow lessons
  - project rules
  - unmet needs
- matched-field labels for those families are now emitted from the same shared
  feature composer instead of one family-by-family SQL forest

## Behavior preserved per slice

### Slice 4

- explicit correction language remained required
- approved memories were not silently mutated
- unmet needs kept their conservative held-correction posture
- supersede lineage stayed explicit and queryable

### Slice 5

- phrase induction stayed approved-only and reviewed
- workflow and response-style phrase artifacts remained deterministic aids, not
  semantic fallback
- non-eligible families still did not gain phrase support

### Slice 6

- typed template / field / lesson boosts stayed explicit fast paths
- direct named-project intent shaping stayed intact for project facts, project
  rules, and unmet needs
- approved-only hybrid retrieval stayed the default
- semantic routing did not broaden

## Tests and validation run at the end of each slice

### Slice 4

Commands:

- `pnpm test -- extensions/memory-middleware/src/memory-correction-engine.test.ts extensions/memory-middleware/src/ordinary-turn-auto-capture.test.ts extensions/memory-middleware/src/tools/candidate-submit.test.ts -t "correction|supersede|project-fact generic correction|response-style correction"`
- `OPENCLAW_TEST_PROFILE=serial OPENCLAW_TEST_SERIAL_GATEWAY=1 pnpm test -- extensions/memory-middleware/src/tools/candidate-submit.integration.test.ts -t "supersedes older approved generic response-style guidance|supersedes an older approved generalized workflow lesson|auto-promotes generalized project-fact corrections"`
- `pnpm check:types`

Result:

- targeted tests passed
- serial integration slice passed
- type-check passed

### Slice 5

Commands:

- `pnpm test -- extensions/memory-middleware/src/response-style-phrase-induction.test.ts extensions/memory-middleware/src/workflow-phrase-induction.test.ts extensions/memory-middleware/src/ordinary-turn-auto-capture.test.ts extensions/memory-middleware/src/tools/candidate-submit.test.ts -t "phrase pattern|phrase induction|approved phrase"`
- `OPENCLAW_TEST_PROFILE=serial OPENCLAW_TEST_SERIAL_GATEWAY=1 pnpm test -- extensions/memory-middleware/src/tools/candidate-submit.integration.test.ts -t "phrase pattern|phrase-induction|approved generic workflow lesson"`
- `pnpm check:types`

Result:

- phrase-focused targeted tests passed: 3 files passed, 1 skipped
- the first serial integration run failed with `read ECONNRESET` before any
  assertions completed
- the allowed serial rerun passed: 1 test passed, 232 skipped
- type-check passed

### Slice 6

Commands:

- `pnpm test -- extensions/memory-middleware/src/retrieval-feature-framework.test.ts extensions/memory-middleware/src/memory-family-registry.test.ts`
- `OPENCLAW_TEST_PROFILE=serial OPENCLAW_TEST_SERIAL_GATEWAY=1 pnpm test -- extensions/memory-middleware/src/tools/candidate-submit.integration.test.ts -t "auto-promotes a generalized workflow lesson cluster after later compatible evidence and retrieves it through approved-only hybrid|auto-promotes a project-rule cluster after later compatible evidence and retrieves it through approved-only hybrid|auto-promotes an unmet-need cluster after later compatible evidence and retrieves it through approved-only hybrid|keeps direct named-project unmet-need asks focused on unmet-need results over adjacent project rules|keeps direct named-project fact lookups focused on project facts over adjacent project rules|boosts the most relevant approved generic response-style guidance in hybrid retrieval when overlapping memories exist|boosts the most relevant approved project fact field in hybrid retrieval when overlapping project memories exist|auto-promotes a generalized project-fact cluster after later compatible evidence and retrieves it through approved-only hybrid|boosts the most relevant approved workflow-improvement lesson in hybrid retrieval"`
- `pnpm check:types`

Result:

- framework and registry unit tests passed: 2 files, 7 tests
- targeted serial retrieval integration tests passed: 9 tests
- type-check passed

## Docs updated in this batch

- `docs/memory-system/STATUS.md`
- `docs/memory-system/CURRENT_SLICE.md`
- `docs/memory-system/memory-roadmap.md`
- `docs/memory-system/feature-inventory.md`
- `docs/memory-system/FLATTENING_EXECUTION_PLAN.md`
- `docs/memory-system/specs/unified-correction-and-supersede.md`
- `docs/memory-system/specs/unified-phrase-pattern-engine.md`
- `docs/memory-system/specs/retrieval-feature-framework.md`

## Remaining flattening debt after slice 6

- behavior-profile layer
- registry-driven proof inspection closeout
- remaining ingestion migration for response style, project facts, and
  recurring procedures where honest
- remaining recurring-procedure lifecycle / correction flattening where the
  validated target still needs narrower handling
- reviewable-candidate retrieval and validated-procedure retrieval framework
  migration

## Recommended next flattening slice

- behavior-profile layer
