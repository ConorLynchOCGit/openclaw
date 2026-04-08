# Flattening Batch Report V5

## Starting state

- branch: `codex/land-main-session-and-browser-fixes`
- starting head: `2c5b575808`
- pre-batch posture:
  - flattening batch v4 landed
  - procedures still retained too much quasi-separate subsystem shape
  - correction policy was improved but not yet fully declarative
  - proofing was still registry-plus-switch

## Contracts chosen for slices 13-15

### Slice 13 — recurring-procedure staged substrate redesign

- exact tranche:
  - explicit staged transition helper for recurring procedures
  - shared transcript/tool reuse of that staged transition
  - explicit staged inspection surface
- direct seams:
  - `extensions/memory-middleware/src/recurring-procedure-staged-substrate.ts`
  - `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts`
  - `extensions/memory-middleware/src/tools/candidate-submit.ts`
- stale subsystem shape replaced:
  - duplicated review -> draft -> validate -> embed -> optional supersede flow
  - duplicated caller-local procedure stage interpretation

### Slice 14 — correction-policy cleanup

- exact tranche:
  - typed declarative correction execution kinds
  - family-declared correction target kind and target-required posture
  - procedure correction fit through validated-procedure supersede planning
- direct seams:
  - `extensions/memory-middleware/src/memory-correction-engine.ts`
  - `extensions/memory-middleware/src/memory-family-registry.ts`
  - `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts`
  - `extensions/memory-middleware/src/tools/candidate-submit.ts`
- stale subsystem shape replaced:
  - caller-coupled correction assumptions
  - remaining “memory-object only” executable correction assumptions

### Slice 15 — proof-runner adapterization

- exact tranche:
  - registered lifecycle adapters
  - registered artifact adapters
  - derivation of main-family proof definitions from family registry policy
- direct seams:
  - `extensions/memory-middleware/src/proof-adapters.ts`
  - `extensions/memory-middleware/src/proof-runner.ts`
  - `extensions/memory-middleware/src/memory-family-registry.ts`
- stale subsystem shape replaced:
  - central lifecycle inspection switch
  - central artifact extraction switch
  - duplicated proof-definition entries for the six main families

## Runtime seams changed per slice

### Slice 13

- `recurring-procedure-staged-substrate.ts` now owns shared staged transition
  execution and staged inspection shaping
- `ordinary-turn-auto-capture.ts` now routes recurring-procedure promotion
  through the staged helper
- `tools/candidate-submit.ts` now routes recurring-procedure promotion through
  the staged helper

### Slice 14

- `memory-correction-engine.ts` now emits:
  - `hold`
  - `approved_memory_object_supersede`
  - `validated_procedure_supersede`
- `memory-family-registry.ts` now declares correction target kind and target
  presence requirements
- transcript/tool callers now consume correction plans by execution kind rather
  than assuming all executable correction is approved-memory supersede

### Slice 15

- `proof-adapters.ts` now owns lifecycle inspection and artifact adapter
  registration
- `proof-runner.ts` now resolves lifecycle/artifact behavior through adapters
- `memory-family-registry.ts` now derives main-family proof definitions from
  family proof policy instead of maintaining a second map for those families

## Duplicate branch logic or subsystem shape removed

### Slice 13

- duplicated recurring-procedure staged promotion flow between transcript and
  tool paths
- duplicated caller-local procedure stage interpretation

### Slice 14

- remaining stringly / caller-coupled correction decisions for executable
  correction posture
- procedure correction paths that still assumed memory-object supersede

### Slice 15

- proof-runner lifecycle dispatch switch
- proof-runner artifact extraction switch
- duplicated six-family proof-definition table

## Behavior preserved

### Slice 13

- procedures remain `suggestion_first`
- direct use still requires a clear ask
- validated procedures remain distinct from approved memory objects
- explicit validated-procedure retrieval behavior is preserved

### Slice 14

- response style and project facts still support immediate bounded correction
- unmet needs remain held
- recurring procedures still correct through their validated artifact semantics
- workflow-family cluster auto-review supersede behavior is preserved

### Slice 15

- proof output shape remains backward-compatible
- phrase proof surfaces remain distinct where they should
- procedure proof evidence still exposes validated-procedure artifacts

## Tests and validation run at the end of each slice

### Slice 13

- `pnpm test -- extensions/memory-middleware/src/recurring-procedure-staged-substrate.test.ts extensions/memory-middleware/src/ordinary-turn-auto-capture.test.ts extensions/memory-middleware/src/tools/candidate-submit.test.ts`
- `pnpm check:types`

### Slice 14

- `pnpm test -- extensions/memory-middleware/src/memory-correction-engine.test.ts extensions/memory-middleware/src/memory-family-registry.test.ts extensions/memory-middleware/src/recurring-procedure-staged-substrate.test.ts extensions/memory-middleware/src/ordinary-turn-auto-capture.test.ts extensions/memory-middleware/src/tools/candidate-submit.test.ts`
- `pnpm check:types`

### Slice 15

- `pnpm test -- extensions/memory-middleware/src/proof-adapters.test.ts extensions/memory-middleware/src/proof-runner.test.ts extensions/memory-middleware/src/memory-family-registry.test.ts extensions/memory-middleware/src/recurring-procedure-staged-substrate.test.ts`
- `pnpm check:types`

## Remaining main substrate work after this batch

- registry authority cleanup
- memory-family contract / boundary cleanup

Later only if still honest after those:

- deeper retrieval SQL normalization
- artifact / read-model convergence

## Next implementation slice recommended

- registry authority cleanup

Reason:

- more runtime policy is now live across shared substrates
- the registry is the next honest bottleneck before reduced-profile
  self-improving capture or new families lean harder on the substrate
- boundary cleanup should follow once registry authority is stable
