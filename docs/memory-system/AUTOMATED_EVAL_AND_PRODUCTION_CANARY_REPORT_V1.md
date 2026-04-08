# Automated Eval And Production Canary Report V1

## 1. Starting state

At batch start, the repo had already landed:

- flattening batches v1-v6
- pre-capture hardening batch v1
- reduced-profile self-improving and advisory batch v1
- bounded rollout proof and reevaluation batch v1
- Main-session reminder isolation and memory consolidation batch v1
- bounded promotion and off-production rollout batch v1

The accepted posture at batch start was:

- explicit docs-localization project-rule packet shapes are promotion-eligible
- explicit file-reference response-style packet shapes are promotion-eligible
- vague shorthand docs/file packet shapes remain intentionally candidate-heavy
- self-improving capture remains candidate-only and narrow
- learned-guidance advisory planning remains approved-only, inline-only,
  advisory-only, and narrow
- manual non-production UX would not be a prerequisite for the next rollout
  step

## 2. Exact contracts chosen for slices 1-3

### Slice 1 — automated off-production evaluation

Contract:

- add a real automated bounded eval path instead of relying on assumed manual
  non-production UX
- exercise the strongest explicit docs/file packet classes plus the narrow
  self-improving and learned-guidance seams end to end
- record enough signals to support a real canary-readiness judgment

### Slice 2 — rollbackable production-canary controls

Contract:

- preserve explicit separation between `default-off`, `off-production`, and
  `production-canary`
- keep self-improving capture candidate-only
- keep learned-guidance planning approved-only, inline-only, and advisory-only
- make production-canary activation explicit, reversible, and auditable without
  enabling it by default

### Slice 3 — post-canary-readiness judgment

Contract:

- turn the automated-eval evidence plus the new canary controls into an honest
  readiness judgment
- update the docs/spec pack so the repo tells the truth about what is ready
  for a narrow rollbackable production canary and what is not
- define the next honest implementation slice from that evidence

## 3. Exact runtime seams changed per executed slice

### Slice 1 runtime seams

Changed:

- `extensions/memory-middleware/src/automated-rollout-eval.ts`
- `scripts/memory-rollout-eval.ts`
- `package.json`
- `extensions/memory-middleware/src/tools/candidate-submit.integration.test.ts`

What changed:

- added a real automated rollout eval runner that seeds isolated memory state,
  drives candidate submit / review / promote / retrieval flows, and emits a
  structured report
- exercised explicit docs-localization project-rule packets
- exercised explicit file-reference response-style packets
- exercised candidate-only self-improving capture, duplicate/replay blocking,
  and advisory-only learned-guidance planning
- recorded ranking, duplicate/replay, suppression/conflict, provenance, and
  prompt-cost signals in one reusable report surface

### Slice 2 runtime seams

Changed:

- `extensions/memory-middleware/openclaw.plugin.json`
- `extensions/memory-middleware/src/config.ts`
- `extensions/memory-middleware/src/config.test.ts`
- `extensions/memory-middleware/src/self-improving-candidate-capture.ts`
- `extensions/memory-middleware/src/learned-guidance-advisory-planning.ts`
- `extensions/memory-middleware/src/learned-guidance-advisory-planning.test.ts`
- `extensions/memory-middleware/src/tools/memory-self-improving-capture-candidate.test.ts`
- `extensions/memory-middleware/src/tools/candidate-submit.integration.test.ts`

What changed:

- widened the explicit rollout target contract from only `off-production` to
  `off-production` or `production-canary`
- kept default behavior off unless one of those explicit rollout targets is set
- preserved explicit disabled results when activation is missing
- preserved candidate-only self-improving behavior and advisory-only
  learned-guidance behavior under the new canary posture

### Slice 3 doc/spec seams

Changed:

- `docs/memory-system/CURRENT_SLICE.md`
- `docs/memory-system/STATUS.md`
- `docs/memory-system/feature-inventory.md`
- `docs/memory-system/NEXT_SUBSTRATE_PUSH_PLAN.md`
- `docs/memory-system/memory-roadmap.md`
- `docs/memory-system/OPEN_QUESTIONS.md`
- `docs/memory-system/DECISIONS.md`
- `docs/memory-system/specs/implementation-sequencing.md`
- `docs/memory-system/specs/self-improving-capture-integration.md`
- `docs/memory-system/specs/learned-guidance-advisory-planning.md`

What changed:

- recorded automated eval as the honest pre-canary evidence path
- recorded production-canary controls as real and default-off
- recorded the mixed readiness judgment honestly instead of claiming broad
  robustness
- moved the roadmap/spec posture from off-production evidence review to narrow
  rollbackable production canary runtime testing

## 4. Exact automated-eval / canary-control / judgment decisions landed

Automated-eval decisions landed:

- `pnpm memory:rollout-eval` is now the real automated pre-canary proof path
- explicit docs-localization and file-reference packet classes are exercised in
  that eval under their intended families
- self-improving capture remains candidate-only inside automated eval
- learned-guidance planning remains approved-only and advisory-only inside
  automated eval

Production-canary control decisions landed:

- `production-canary` is now a first-class rollout target for the narrow
  self-improving and learned-guidance seams
- production-canary remains default-off
- mode alone still does not activate either seam
- rollback still works by removing or switching the explicit rollout target

Judgment decisions landed:

- the self-improving candidate-only seam is control-ready for a narrow
  rollbackable production canary
- the learned-guidance advisory-only seam is control-ready for a narrow
  rollbackable production canary
- explicit docs/file packet classes are not yet uniformly strong enough to
  justify broad semantic confidence
- vague shorthand docs/file packet classes still stay narrow and
  candidate-heavy
- broad widening is still not justified

## 5. Exact behavior preserved per executed slice

### Slice 1

Preserved:

- project-rule packets stayed project-rule packets
- response-style packets stayed response-style packets
- self-improving capture stayed candidate-only
- learned-guidance planning stayed approved-only and advisory-only

### Slice 2

Preserved:

- production/default posture stayed off by default
- self-improving capture did not gain approval authority
- learned-guidance planning did not gain execution authority
- the bounded seams still run through normal retrieval/application boundaries

### Slice 3

Preserved:

- no new memory families
- no collapse of family-policy differences
- no dishonest claim that broad memory quality is already proven

## 6. Exact tests and validation run at the end of each executed slice

### Slice 1

Ran:

- `OPENCLAW_TEST_PROFILE=serial OPENCLAW_TEST_SERIAL_GATEWAY=1 pnpm test -- extensions/memory-middleware/src/tools/candidate-submit.integration.test.ts -t "runs the automated off-production eval path end to end and emits canary-judgment evidence"`
- `pnpm memory:rollout-eval`
- `pnpm check:types`

Result:

- passed
- automated eval emitted honest weak spots instead of a fake all-green result

### Slice 2

Ran:

- `OPENCLAW_TEST_PROFILE=serial OPENCLAW_TEST_SERIAL_GATEWAY=1 pnpm test -- extensions/memory-middleware/src/config.test.ts extensions/memory-middleware/src/tools/memory-self-improving-capture-candidate.test.ts extensions/memory-middleware/src/learned-guidance-advisory-planning.test.ts extensions/memory-middleware/src/tools/candidate-submit.integration.test.ts -t "production-canary|off-production or production-canary|normalizes bounded self-improving and learned-guidance rollout controls|accepts self-improving capture for an explicit production-canary rollout target|accepts learned-guidance planning for an explicit production-canary rollout target|supports an explicit production-canary rollout target while staying advisory-only"`
- `pnpm memory:rollout-eval --rollout-target production-canary`
- `pnpm check:types`

Result:

- passed
- production-canary remained explicit and default-off outside the targeted path

### Slice 3

Ran:

- docs/spec updates plus final combined landing validation recorded below

## 7. Exact remaining work after this batch

What remains is no longer more rollout-control plumbing.

What remains:

- a narrow rollbackable production canary runtime test for the control-ready
  self-improving and learned-guidance seams
- explicit watch on the current weak spots during that canary:
  docs-localization ranking / metadata,
  file-reference retrieval,
  and native workflow guidance retrieval
- post-canary judgment on what stays live, what stays default-off, and what
  still must not widen
- later cross-domain family expansion only after those answers are clear

## 8. Exact next implementation slice recommended

Recommended next slice:

- narrow rollbackable production canary runtime testing for the control-ready
  self-improving and learned-guidance seams, with the three current weak spots
  treated as explicit watch items rather than ignored noise

Why:

- automated eval is now real and reusable
- production-canary controls are now explicit and reversible
- the remaining missing truth is production-runtime behavior, not missing
  rollout plumbing
- widening before canary evidence would overclaim quality that the current eval
  does not support
