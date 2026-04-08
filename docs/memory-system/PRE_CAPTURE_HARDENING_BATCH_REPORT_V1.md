# Pre-Capture Hardening Batch Report V1

## Starting state

- branch: `codex/land-main-session-and-browser-fixes`
- starting head: `dee9e08acf`
- core flattening was already landed through batch v6
- the post-v6 deep review and pre-capture hardening tranche plan were binding
- reduced-profile self-improving capture was intentionally still not live

## Exact contracts chosen for slices 1-4

### Slice 1 — request-path cost hardening

Chosen contract:

- reduce repeated semantic fallback request work first
- reduce repeated direct database client setup only in the touched hot and
  semi-hot callers
- preserve ranking, scope, and family-gating behavior

### Slice 2 — application and token-efficiency hardening

Chosen contract:

- land a cheaper and more conditional prompt-facing durable-memory section
- preserve structural family posture and application modes
- do not pretend the host runtime already supplies a true retrieval-fed
  selection seam

### Slice 3 — write-path action-stage decomposition

Chosen contract:

- decompose around shared ordered stages for resolution, dispatch, and
  post-submit flow
- keep family variance inside existing family logic and bounded adapters
- strengthen proof coverage at the executor level

### Slice 4 — bounded carryover closeout

Chosen contract:

- close the tranche by removing the remaining proof-step executor switch
- keep the slice tightly adjacent to slice 3
- avoid reopening retrieval or prompt work

## Slice 1 — request-path cost hardening

### Runtime seams changed

- `extensions/memory-middleware/src/semantic-retrieval-routing.ts`
- `extensions/memory-middleware/src/retrieval-control-plane.ts`
- `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts`
- `extensions/memory-middleware/src/tools/candidate-submit.ts`
- `extensions/memory-middleware/src/db/pg-pool.ts`

### Cleanup and hardening achieved

- project semantic fallback lanes now reuse one query embedding, one shared
  workflow backfill pass, and one approved-project semantic search per request
- touched direct database callers now use shared pooled access instead of raw
  per-call `pg.Client` setup
- the semantic fallback request path no longer repeats obviously shared work
  once per workflow family lane

### Behavior preserved

- procedures still route only through the validated-procedure lane
- approved-only project retrieval and family gating stayed intact
- ranking semantics and matched-field behavior stayed intact

### Validation run

- `pnpm test -- extensions/memory-middleware/src/retrieval-control-plane.test.ts extensions/memory-middleware/src/semantic-retrieval-routing.test.ts extensions/memory-middleware/src/ordinary-turn-auto-capture.test.ts extensions/memory-middleware/src/tools/candidate-submit.test.ts`
- `pnpm check:types`

## Slice 2 — application and token-efficiency hardening

### Runtime seams changed

- `extensions/memory-core/src/behavior-profile.ts`
- `extensions/memory-core/src/prompt-section.ts`

### Cleanup and hardening achieved

- the durable-memory prompt section is now a compact policy-shaped summary
  instead of a long family-by-family speech
- broad static narration was removed in favor of smaller behavior/project/
  workflow/procedure/capture/session guidance blocks
- ordinary-run prompt cost is lower while structural selected/suppressed
  posture remains intact

### Behavior preserved

- `shape_reply`, `direct_answer`, `guidance_only`,
  `recommendation_only`, and `suggestion_first` semantics stayed intact
- procedure clear-ask restrictions stayed intact
- project-fact stricter direct-answer posture stayed intact

### Validation run

- `pnpm test -- extensions/memory-core/src/behavior-profile.test.ts extensions/memory-core/index.test.ts`
- `pnpm check:types`

## Slice 3 — write-path action-stage decomposition

### Runtime seams changed

- `extensions/memory-middleware/src/write-action-stages.ts`
- `extensions/memory-middleware/src/tools/candidate-submit.ts`
- `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts`
- `extensions/memory-middleware/src/proof-runner.test.ts`

### Cleanup and hardening achieved

- `candidate-submit` now runs through shared ordered stages for:
  - resolve existing state
  - duplicate guard
  - submit by kind
  - post-submit auto-promotion stages
- `ordinary-turn auto-capture` now dispatches the first handled capture
  decision through ordered shared stages instead of one inline if-chain
- shared write-stage helpers now exist with focused unit coverage
- proof coverage now includes an executor-level `runMemoryProofPlan(...)`
  path

### Behavior preserved

- existing family-specific lifecycle, correction, and promotion behavior stayed
  family-specific
- procedures and phrase artifacts were not flattened into generic memory-object
  behavior
- transcript auto-capture still stops on the first handled family decision

### Validation run

- `pnpm test -- extensions/memory-middleware/src/write-action-stages.test.ts extensions/memory-middleware/src/tools/candidate-submit.test.ts extensions/memory-middleware/src/ordinary-turn-auto-capture.test.ts extensions/memory-middleware/src/proof-runner.test.ts`
- `pnpm check:types`

## Slice 4 — bounded carryover closeout

### Why it was needed

After slice 3, the remaining obvious branch-heavy control point inside this
tranche was the proof executor's central step switch.

That was directly adjacent to the new ordered write stages and proof coverage,
so leaving it behind would have ended the tranche with one last stage-shaped
surface still centralized in a switch.

### Why it stayed bounded

- it touched only proof-step dispatch
- it did not reopen retrieval, prompting, or family policy
- existing proof step behavior and executor coverage remained the validation
  bar

### Runtime seams changed

- `extensions/memory-middleware/src/proof-runner.ts`

### Cleanup and hardening achieved

- proof-step execution now resolves through a step-runner table instead of the
  remaining central switch
- the proof executor now matches the stage-oriented hardening direction used in
  the write paths

### Behavior preserved

- supported proof step kinds stayed the same
- step artifact threading stayed the same
- proof execution order stayed the same

### Validation run

- `pnpm test -- extensions/memory-middleware/src/proof-runner.test.ts`
- `pnpm check:types`

## Docs and specs updated

- `docs/memory-system/STATUS.md`
- `docs/memory-system/CURRENT_SLICE.md`
- `docs/memory-system/feature-inventory.md`
- `docs/memory-system/NEXT_SUBSTRATE_PUSH_PLAN.md`
- `docs/memory-system/FLATTENING_EXECUTION_PLAN.md`
- `docs/memory-system/memory-roadmap.md`
- `docs/memory-system/OPEN_QUESTIONS.md`
- `docs/memory-system/DECISIONS.md`
- `docs/memory-system/specs/implementation-sequencing.md`
- `docs/memory-system/specs/request-path-cost-hardening.md`
- `docs/memory-system/specs/application-token-efficiency-hardening.md`
- `docs/memory-system/specs/action-stage-orchestration-hardening.md`

## Remaining work after this batch

The hardening tranche is now landed.

Remaining work is no longer “more default hardening.” The next remaining work
is:

1. reduced-profile self-improving capture reevaluation
2. bounded first capture tranche only if that reevaluation stays honest
3. learned-guidance advisory planning after that
4. later artifact/read-model convergence only if later pressure still justifies it

## Next implementation slice recommended

- reduced-profile self-improving capture reevaluation
