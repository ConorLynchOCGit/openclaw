# Flattening Batch Report V3

## Starting state

Batch v1 and batch v2 were already landed. The remaining planned flattening
work for this batch was:

1. behavior-profile layer
2. registry-driven proof inspection closeout
3. one bounded remaining flattening closeout slice

The branch started clean at:

- branch: `codex/land-main-session-and-browser-fixes`
- head: `1f4a10991a`
- UTC start: `2026-04-07T22:57:58Z`

## Contracts chosen for slices 7-9

### Slice 7

- create a shared behavior-profile layer
- keep `memory-middleware` as the family-policy source of truth
- expose that policy across the extension boundary through a public plugin-SDK
  seam
- make `extensions/memory-core/src/prompt-section.ts` render from the behavior
  profile instead of carrying the family posture inline

### Slice 8

- move proof-runner inspection and lifecycle artifact summarization onto
  registry-driven proof family definitions
- cover the six main families plus workflow / response-style phrase artifacts
- keep recurring procedures distinct at the validated target

### Slice 9

- choose the remaining hybrid retrieval islands as the strongest closeout seam
- move reviewable-candidate hybrid retrieval onto the shared retrieval feature
  composer
- move validated-procedure subject-match scoring onto the shared retrieval
  feature framework while keeping key/title fast paths explicit

## Runtime seams changed per slice

### Slice 7

- `src/plugin-sdk/memory-family-policy.ts`
- `scripts/lib/plugin-sdk-entrypoints.json`
- `package.json` exports via `scripts/sync-plugin-sdk-exports.mjs`
- `extensions/memory-core/src/behavior-profile.ts`
- `extensions/memory-core/src/prompt-section.ts`

### Slice 8

- `extensions/memory-middleware/src/memory-family-registry.ts`
- `extensions/memory-middleware/src/proof-runner.ts`

### Slice 9

- `extensions/memory-middleware/src/memory-family-registry.ts`
- `extensions/memory-middleware/src/retrieval-feature-framework.ts`
- `extensions/memory-middleware/src/db/queries.ts`

## Duplicate branch logic removed per slice

### Slice 7

- `prompt-section.ts` no longer carries the durable-memory family application
  posture inline
- cross-extension behavior posture no longer requires `memory-core` to own its
  own private copy of the family application policy

### Slice 8

- proof-runner no longer splits the six core families and phrase artifacts into
  separate registry-versus-switch inspection paths
- lifecycle artifact extraction no longer branches on family names in the proof
  runner
- hybrid-search proof expectation validation now lives in a shared helper

### Slice 9

- reviewable-candidate hybrid retrieval no longer keeps a separate response-
  style-only ranking island
- validated-procedure hybrid retrieval no longer keeps subject-match scoring in
  a standalone branch set

## Behavior preserved per slice

### Slice 7

- response style still shapes replies only
- project facts still remain direct-answer material
- workflow lessons and project rules remain guidance-only
- unmet needs remain recommendation-only
- recurring procedures remain `suggestion_first` and direct-use only on clear
  ask

### Slice 8

- proof output remains explicit and auditable
- recurring procedures still keep a distinct validated-target proof posture
- phrase artifacts remain separate proof targets rather than pretending to be
  ordinary memory objects

### Slice 9

- approved-only user-facing retrieval boundaries remain intact
- candidate retrieval still requires explicit candidate scope
- validated procedures still require explicit validated-procedure scope
- procedure key/title fast paths remain explicit

## Tests and validation run at the end of each slice

### Slice 7

- `pnpm test -- extensions/memory-core/index.test.ts -t "buildPromptSection|behavior profile layer"`
- `pnpm test -- src/plugin-sdk/subpaths.test.ts -t "runtime entry subpaths importable|keeps helper subpaths aligned|keeps curated public list free of internal implementation subpaths"`
- `pnpm check:types`

Result:

- all green

### Slice 8

- `pnpm test -- extensions/memory-middleware/src/proof-runner.test.ts extensions/memory-middleware/src/memory-family-registry.test.ts`
- `pnpm check:types`

Result:

- all green after one narrow test-fixture type correction

### Slice 9

- `pnpm test -- extensions/memory-middleware/src/retrieval-feature-framework.test.ts extensions/memory-middleware/src/tools/memory-object-search-hybrid.test.ts`
- `OPENCLAW_TEST_PROFILE=serial OPENCLAW_TEST_SERIAL_GATEWAY=1 pnpm test -- extensions/memory-middleware/src/tools/candidate-submit.integration.test.ts -t "retrieves validated procedures only when validated-procedure scope is explicitly requested|returns ranked hybrid retrieval results for approved memory objects and explicitly requested validated procedures|keeps candidate memory out of ranked hybrid retrieval unless candidate scope is explicit|boosts the most relevant approved generic response-style guidance in hybrid retrieval when overlapping memories exist"`
- `pnpm check:types`

Result:

- unit/tool/type gates green
- the targeted integration suite failed twice before assertions with:
  `Connection terminated unexpectedly`
- this was treated as infrastructure-limited, not an assertion regression,
  because the suite never reached the filtered retrieval assertions

## Remaining flattening debt after slice 9

The substrate is much flatter than it was at the start of batch v3, but one
more closeout slice is still honest:

- remaining ingestion migration for response style, project facts, and
  recurring procedures where honest
- remaining recurring-procedure lifecycle / correction bridge cleanup
- possible final reconciliation of validated-procedure retrieval key/title fast
  paths if later flattening shows that is still worth sharing

## Exact next roadmap step recommended

- one more flattening closeout slice
  - strongest target: remaining response-style / project-fact / recurring-
    procedure ingestion migration plus the remaining recurring-procedure bridge
    seams

## Time and token accounting

- UTC start: `2026-04-07T22:57:58Z`
- UTC end: `2026-04-07T23:23:51Z`
- elapsed time: `0h 26m 3s`
- total tokens consumed: exact token accounting is unavailable in the current
  Codex runtime
- best measured total available: none
- source used: this runtime does not expose a reliable per-batch token counter;
  tool token fields are per-command metadata only and do not represent full
  model token consumption
