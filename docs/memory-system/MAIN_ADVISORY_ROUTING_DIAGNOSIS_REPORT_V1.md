# Main Advisory Routing Diagnosis Report V1

## 1. Starting state

At batch start, the repo already had:

- automated bounded rollout eval
- explicit `off-production` versus `production-canary` rollout targets
- a real `memory_learned_guidance_plan` tool and advisory planning seam

Recent Main production-canary transcript evidence also showed a concrete
problem:

- workflow-preflight prompts were using `memory_object_search_hybrid`,
  `memory_search`, or no memory tool call
- `memory_learned_guidance_plan` did not fire
- the user-visible answers were sometimes plausible, but often not sourced
  from the intended repo-local workflow memories

## 2. Exact contracts chosen for slices 1-3

### Slice 1

- diagnose the real Main advisory-routing failure from transcript plus code
  evidence

### Slice 2

- land only the smallest honest routing/tool-availability fix if the failure
  is in the current prompt/profile layer

### Slice 3

- update the docs/spec pack so the repo tells the truth about Main
  production-canary advisory routing after the diagnosis and fix

## 3. Exact runtime seams changed per executed slice

### Slice 1 — diagnosis seams

- recent Main session transcript/tool logs
- `extensions/memory-core/src/prompt-section.ts`
- `extensions/memory-core/src/behavior-profile.ts`
- `extensions/memory-middleware/src/tools/registry.ts`

### Slice 2 — narrow fix seams

- `extensions/memory-core/src/behavior-profile.ts`
- `extensions/memory-middleware/src/tools/registry.ts`
- prompt/profile and registry tests

### Slice 3 — docs/report seams

- `docs/memory-system/CURRENT_SLICE.md`
- `docs/memory-system/STATUS.md`
- `docs/memory-system/feature-inventory.md`
- `docs/memory-system/NEXT_SUBSTRATE_PUSH_PLAN.md`
- `docs/memory-system/memory-roadmap.md`
- `docs/memory-system/OPEN_QUESTIONS.md`
- `docs/memory-system/DECISIONS.md`
- `docs/memory-system/specs/implementation-sequencing.md`
- `docs/memory-system/specs/learned-guidance-advisory-planning.md`

## 4. Exact diagnosis / fix / judgment decisions landed

### Diagnosis

The failure was not primarily rollout gating.

The real control points were:

- Main durable-memory prompt guidance explicitly steering workflow asks toward
  hybrid retrieval
- no corresponding prompt/profile guidance teaching when to use
  `memory_learned_guidance_plan`
- learned-guidance tool registration not reflecting whether the bounded seam
  was actually rollout-enabled

Judgment:

- `profile/tool-selection gap`

### Fix

Landed:

- `memory_learned_guidance_plan` now registers only when an explicit
  `off-production` or `production-canary` rollout target enables the bounded
  advisory seam
- the durable-memory prompt/profile layer now distinguishes:
  - workflow-preflight asks that fit the current advisory slice
  - direct workflow lookup asks that should remain retrieval-first

### Post-fix judgment

The narrow fix is landed and honest.

The advisory seam is still not fully proven in Main production-canary UX until
a fresh transcript/tool rerun shows `memory_learned_guidance_plan` actually
firing for eligible workflow-preflight prompts.

## 5. Exact behavior preserved per executed slice

- approved-only boundary stayed intact
- advisory remained inline-only and suggestion-only
- rollout-target gating stayed explicit
- direct fact/rule retrieval stayed retrieval-first
- no family widening landed
- no new authority path landed

## 6. Exact tests and validation run at the end of each executed slice

### Slice 1 / Slice 2 proof

Ran:

- `OPENCLAW_TEST_PROFILE=serial OPENCLAW_TEST_SERIAL_GATEWAY=1 pnpm test -- extensions/memory-core/src/behavior-profile.test.ts extensions/memory-core/index.test.ts extensions/memory-middleware/src/tools/registry.test.ts extensions/memory-middleware/src/learned-guidance-advisory-planning.test.ts extensions/memory-middleware/src/tools/memory-learned-guidance-plan.test.ts`
- `pnpm check:types`
- `OPENCLAW_TEST_PROFILE=serial OPENCLAW_TEST_SERIAL_GATEWAY=1 pnpm test -- extensions/memory-middleware/src/tools/candidate-submit.integration.test.ts -t "surfaces real workspace workflow packets through inline advisory planning with provenance intact|accepts learned-guidance planning for an explicit production-canary rollout target"`

Results:

- prompt/profile + registry + learned-guidance unit tests passed
- typecheck passed
- the targeted integration test hit one initial `ECONNRESET` infra-style suite
  failure before selected tests ran, then passed on the required rerun

### Slice 3

- docs/report updates plus final landing validation recorded separately

## 7. Exact remaining work after this batch

- rerun a narrow Main production-canary proof focused on workflow-preflight
  prompts
- confirm from transcript/tool evidence that eligible preflight asks now hit
  `memory_learned_guidance_plan`
- keep watching docs-localization, file-reference, and native workflow weak
  spots during that rerun
- then make the post-canary judgment

## 8. Exact next implementation slice recommended

- post-fix narrow rollbackable production-canary Main-session proof for
  workflow-preflight learned-guidance adoption, followed by post-canary
  judgment once fresh transcript/tool evidence exists
