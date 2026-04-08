# Self Improving And Advisory Batch Report V1

## Starting state

- branch: `codex/land-main-session-and-browser-fixes`
- starting head:
  `781df121c98794e82a8932da4050faf0d13a4953`
- starting truth:
  - flattening batch v6 was landed
  - pre-capture hardening batch v1 was landed
  - reduced-profile self-improving capture was next only if it could fit the
    shared substrate honestly
  - learned-guidance advisory planning was allowed only if the self-improving
    tranche proved that substrate fit first

## Contracts chosen for slices 1-3

### Slice 1 — reduced-profile self-improving capture reevaluation

- prove the hardened substrate can carry self-improving provenance without a
  second review or retrieval system
- require explicit proof support, explicit provenance, duplicate/replay
  handling, and no direct approval path

### Slice 2 — bounded reduced-profile self-improving capture first tranche

- land the smallest honest tranche:
  - gated by `selfImprovingCapture.mode = candidate-only`
  - workflow-guidance improvement candidates only
  - candidate-only
  - shared candidate pipeline only

### Slice 3 — learned-guidance advisory planning

- land the smallest honest advisory slice:
  - gated by `learnedGuidanceAdvisoryPlanning.mode = inline-only`
  - approved-only
  - workflow-guidance-only
  - advisory-only
  - inline-only

## Runtime seams changed per executed slice

### Slice 1

- `extensions/memory-middleware/src/proof-runner.ts`
- `extensions/memory-middleware/src/proof-runner.test.ts`

### Slice 2

- `extensions/memory-middleware/src/config.ts`
- `extensions/memory-middleware/openclaw.plugin.json`
- `extensions/memory-middleware/src/runtime.ts`
- `extensions/memory-middleware/src/self-improving-candidate-capture.ts`
- `extensions/memory-middleware/src/tools/memory-self-improving-capture-candidate.ts`
- `extensions/memory-middleware/src/tools/memory-self-improving-capture-candidate.test.ts`
- `extensions/memory-middleware/src/tools/candidate-submit.integration.test.ts`
- `extensions/memory-middleware/src/config.test.ts`

### Slice 3

- `extensions/memory-middleware/src/config.ts`
- `extensions/memory-middleware/openclaw.plugin.json`
- `extensions/memory-middleware/src/runtime.ts`
- `extensions/memory-middleware/runtime-api.ts`
- `extensions/memory-middleware/src/learned-guidance-advisory-planning.ts`
- `extensions/memory-middleware/src/learned-guidance-advisory-planning.test.ts`
- `extensions/memory-middleware/src/tools/memory-learned-guidance-plan.ts`
- `extensions/memory-middleware/src/tools/memory-learned-guidance-plan.test.ts`
- `extensions/memory-middleware/src/tools/registry.ts`
- `extensions/memory-middleware/src/tools/candidate-submit.integration.test.ts`
- `extensions/memory-middleware/src/db/pg-pool.ts`

## Functionality landed per executed slice

### Slice 1

- proof-runner now supports a dedicated `self_improving_capture` step
- the reevaluation ended positive
- the repo now has explicit proof support for candidate-only self-improving
  posture rather than only docs-level intent

### Slice 2

- reduced-profile self-improving capture now lands on the shared candidate
  substrate
- the first tranche is bounded to workflow-guidance improvement candidates only
- replay blocking, duplicate clustering, explicit provenance, and shared review
  posture all stay inside the existing substrate
- the tranche remains default-off and candidate-only

### Slice 3

- learned-guidance advisory planning now exists as an explicit runtime seam and
  tool
- it reads approved workflow guidance through the normal approved retrieval path
- it stays advisory-only and inline-only
- it suppresses conflicting guidance instead of collapsing it into one wrong
  answer
- pool teardown is now explicit in the integration lane so the new DB-backed
  proof does not leave an unhandled fatal behind

## Behavior preserved per executed slice

### Slice 1

- no direct approval path appeared
- no change to approved retrieval rules

### Slice 2

- procedures remain untouched
- phrase-pattern approval remains untouched
- approved retrieval remains approved-only
- self-improving origin does not override approved native memory directly

### Slice 3

- advisory planning does not write memory
- advisory planning does not enqueue work
- advisory planning does not execute actions
- advisory planning does not bypass approved retrieval
- family-policy differences remain unchanged

## Tests and validation run at the end of each executed slice

### Slice 1

- `pnpm test -- extensions/memory-middleware/src/proof-runner.test.ts extensions/memory-middleware/src/tools/memory-self-improving-capture-candidate.test.ts -t "self-improving|proof"`
- `pnpm check:types`

### Slice 2

- `pnpm test -- extensions/memory-middleware/src/config.test.ts extensions/memory-middleware/src/tools/memory-self-improving-capture-candidate.test.ts`
- `OPENCLAW_TEST_PROFILE=serial OPENCLAW_TEST_SERIAL_GATEWAY=1 pnpm test -- extensions/memory-middleware/src/tools/candidate-submit.integration.test.ts -t "routes reduced-profile self-improving workflow guidance only through the bounded candidate path|blocks self-improving replay after a matching candidate already exists|blocks forbidden self-improving output targets without touching the database|returns disabled for self-improving capture before writing any candidate rows|fails cleanly for self-improving capture when the configured database endpoint is unavailable"`
- `pnpm check:types`

### Slice 3

- `pnpm test -- extensions/memory-middleware/src/config.test.ts extensions/memory-middleware/src/learned-guidance-advisory-planning.test.ts extensions/memory-middleware/src/tools/memory-learned-guidance-plan.test.ts`
- `OPENCLAW_TEST_PROFILE=serial OPENCLAW_TEST_SERIAL_GATEWAY=1 pnpm test -- extensions/memory-middleware/src/tools/candidate-submit.integration.test.ts -t "returns advisory learned guidance from approved workflow memory without writing any rows|suppresses conflicting approved learned guidance instead of guessing|returns disabled for learned-guidance planning before touching the database when mode is off"`
- `pnpm check:types`

## Gating decision from slice 1

- result: `go`
- reason:
  - self-improving provenance can stay explicit
  - shared candidate/review posture can carry the first tranche
  - proof support is now explicit
  - no second approval or retrieval layer was required

## Remaining work after this batch

- rollout proof and observability for the newly landed functional seams
- decision on whether self-improving input coverage should widen beyond the
  bounded workflow-guidance tranche
- cross-domain family expansion only after that rollout truth is clear

## Next implementation slice recommended

- bounded rollout proof and observability for reduced-profile self-improving
  capture and inline learned-guidance planning
