# Flattening Batch Report V6

## Starting state

- branch target: `codex/land-main-session-and-browser-fixes`
- starting head: `7768e745039a66f6da28fbc41499f8225d831f29`
- starting tree: clean
- accepted plan at start:
  1. registry authority cleanup
  2. memory-family contract / boundary cleanup
  3. deeper retrieval SQL normalization only if still justified after 16 and 17

## Exact contracts chosen for slices 16-18

### Slice 16 — registry authority cleanup

- chosen tranche:
  - move remaining workflow-family mapping and phrase proof-family ownership
    under one registry path
- direct seams:
  - `extensions/memory-middleware/src/memory-family-registry.ts`
  - `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts`
  - `extensions/memory-middleware/src/tools/candidate-submit.ts`
  - `extensions/memory-middleware/src/workflow-phrase-induction.ts`
  - `extensions/memory-middleware/src/response-style-phrase-induction.ts`
  - `extensions/memory-middleware/src/db/queries.ts`
- duplicate policy targeted:
  - local workflow-family mapping helpers
  - local phrase proof-family artifact strings
  - a second artifact-family list in query scaffolding

### Slice 17 — memory-family contract / boundary cleanup

- chosen tranche:
  - move the shared memory-family policy contract into plugin-sdk and make
    middleware consume it through a local barrel
- direct seams:
  - `src/plugin-sdk/memory-family-policy.ts`
  - `extensions/memory-middleware/src/memory-family-registry.ts`
  - `src/plugin-sdk/subpaths.test.ts`
  - `src/plugin-sdk/memory-family-policy.test.ts`
- stale boundary targeted:
  - the public SDK middleware re-export path for family policy

### Slice 18 — deeper retrieval SQL normalization

- reassessment result:
  - `yes`, but only for simple approved-vs-reviewable-candidate memory-object
    reads
- chosen tranche:
  - share `get` / `list` / `basic` approved-vs-reviewable-candidate
    memory-object read scaffolding
- direct seams:
  - `extensions/memory-middleware/src/db/memory-object-surface-read-scaffolding.ts`
  - `extensions/memory-middleware/src/db/queries.ts`
  - `extensions/memory-middleware/src/db/memory-object-surface-read-scaffolding.test.ts`
- explicitly not chosen:
  - flattening validated-procedure reads into the same helper
  - broader retrieval control-plane redesign

## Runtime seams changed per slice

### Slice 16

- registry now exports workflow-family-to-family resolution directly
- phrase induction now resolves proof artifact families from registry policy
- query code now reads phrase artifact-family visibility from registry-owned
  proof-family ids

### Slice 17

- plugin-sdk now owns the shared family-policy contract directly
- middleware registry now re-exports the shared contract instead of owning the
  source data
- memory-core continues to consume the same public subpath, but that subpath is
  now a real shared contract rather than a middleware reach-through

### Slice 18

- approved/reviewable-candidate memory-object `get` reads now share one read
  scaffold
- approved/reviewable-candidate memory-object `list` reads now share one read
  scaffold
- approved/reviewable-candidate memory-object `basic` search reads now share
  one read scaffold

## Duplicate branch logic / boundary smell / SQL scaffolding removed

### Slice 16

- removed local workflow-family mapping switches from transcript/tool paths
- removed local phrase proof-family policy strings from phrase induction
- reduced one more duplicated approved-artifact visibility list in query code

### Slice 17

- removed the public SDK direct re-export of
  `extensions/memory-middleware/src/memory-family-registry.ts`
- removed middleware as the hidden source of truth for the shared family policy
  contract

### Slice 18

- removed repeated approved-vs-reviewable-candidate `get` SQL scaffolding
- removed repeated approved-vs-reviewable-candidate `list` SQL scaffolding
- removed repeated approved-vs-reviewable-candidate `basic` search SQL
  scaffolding

## Behavior preserved per slice

### Slice 16

- workflow lessons still map to `workflow_improvement`
- project rules still map to `project_rule`
- unmet needs still map to `unmet_need`
- phrase proof artifacts remain proof-only families, not ordinary memory
  families

### Slice 17

- family policy semantics did not change
- memory-core still sees the same public family posture
- middleware still owns parser/query/lifecycle/correction/retrieval adapters

### Slice 18

- approved-only defaults remain
- explicit candidate scope remains required
- validated-procedure retrieval remains distinct
- ranking semantics did not change

## Tests and validation run at the end of each executed slice

### Slice 16

- `pnpm test -- extensions/memory-middleware/src/memory-family-registry.test.ts extensions/memory-middleware/src/proof-runner.test.ts extensions/memory-middleware/src/ordinary-turn-auto-capture.test.ts extensions/memory-middleware/src/tools/candidate-submit.test.ts extensions/memory-middleware/src/db/queries.test.ts`
- `pnpm check:types`

### Slice 17

- `pnpm test -- src/plugin-sdk/memory-family-policy.test.ts src/plugin-sdk/subpaths.test.ts extensions/memory-core/src/behavior-profile.test.ts extensions/memory-middleware/src/memory-family-registry.test.ts extensions/memory-middleware/src/proof-runner.test.ts extensions/memory-middleware/src/ordinary-turn-auto-capture.test.ts extensions/memory-middleware/src/tools/candidate-submit.test.ts extensions/memory-middleware/src/db/queries.test.ts`
- `pnpm check:types`

### Slice 18

- `pnpm test -- extensions/memory-middleware/src/db/memory-object-surface-read-scaffolding.test.ts extensions/memory-middleware/src/db/queries.test.ts extensions/memory-middleware/src/tools/memory-object-search-hybrid.test.ts extensions/memory-middleware/src/proof-runner.test.ts`
- `pnpm check:types`

## Exact reassessment decision for slice 18

### Question 1 — still materially justified?

Yes, narrowly.

Reason:

- the largest approved-vs-candidate hybrid scaffold was already reduced in
  support batch v1
- but simple approved-vs-reviewable-candidate `get` / `list` / `basic` reads
  still repeated the same scaffold shape

### Question 2 — still real scaffolding debt?

Yes for approved-vs-reviewable-candidate memory-object reads.

No for validated procedures.

Reason:

- the remaining approved-vs-reviewable-candidate duplication still reflected
  the same read shape with small visibility/review-state differences
- the remaining validated-procedure duplication still reflected a distinct read
  model and should not be flattened dishonestly

### Question 3 — can it land as bounded cleanup?

Yes.

The slice stayed bounded to one new read scaffold plus the three simple
approved-vs-reviewable-candidate read call sites.

### Question 4 — does it still de-risk future work?

Yes.

It removes one more repeat point that later reduced-profile self-improving
capture or later family work would otherwise have to touch twice.

## Remaining substrate work after this batch

The remaining core flattening sequence is now landed.

Later work remains:

- reduced-profile self-improving capture reevaluation
- bounded reduced-profile self-improving capture first tranche if the
  reevaluation stays honest
- learned-guidance advisory planning after that
- artifact / read-model convergence only if later pressure proves it is still
  necessary

## Next implementation slice recommended

- reduced-profile self-improving capture reevaluation
