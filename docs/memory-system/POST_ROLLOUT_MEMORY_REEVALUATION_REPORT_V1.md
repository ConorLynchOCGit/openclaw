# Post Rollout Memory Reevaluation Report V1

## Starting state

- branch: `codex/land-main-session-and-browser-fixes`
- starting head:
  `d535974756990cdf430641e4c1b25588e3f7e0f3`
- starting truth:
  - flattening batch v6 was landed
  - pre-capture hardening batch v1 was landed
  - the first bounded reduced-profile self-improving tranche was landed
  - the first bounded learned-guidance advisory tranche was landed
  - the next honest question was rollout truth, not more missing substrate work

## Contracts chosen for slices 1-3

### Slice 1 — bounded self-improving capture rollout proof

- keep the live tranche candidate-only and workflow-guidance-only
- add explicit rollout family-scope control
- add structured rollout-evaluation signals for provenance, duplicate
  outcomes, replay blocking, rejection posture, and review burden
- prove the repo can evaluate usefulness and noise without widening authority

### Slice 2 — bounded learned-guidance advisory rollout proof

- keep the live tranche approved-only, inline-only, and advisory-only
- add explicit rollout family-scope control
- add bounded suggestion-budget control
- add structured observability for surfaced, suppressed, filtered, disabled,
  and no-guidance outcomes, including approximate prompt cost

### Slice 3 — post-rollout memory reevaluation

- update the docs pack so it reflects the landed rollout-control work and the
  current reevaluation truth
- make the next implementation slice explicit
- record whether self-improving capture and learned-guidance advisory planning
  should widen, stay narrow, or pause

## Runtime seams changed per executed slice

### Slice 1

- `extensions/memory-middleware/src/config.ts`
- `extensions/memory-middleware/openclaw.plugin.json`
- `extensions/memory-middleware/src/runtime.ts`
- `extensions/memory-middleware/src/self-improving-candidate-capture.ts`
- `extensions/memory-middleware/src/config.test.ts`
- `extensions/memory-middleware/src/tools/memory-self-improving-capture-candidate.test.ts`
- `extensions/memory-middleware/src/tools/candidate-submit.integration.test.ts`

### Slice 2

- `extensions/memory-middleware/src/config.ts`
- `extensions/memory-middleware/openclaw.plugin.json`
- `extensions/memory-middleware/src/runtime.ts`
- `extensions/memory-middleware/src/learned-guidance-advisory-planning.ts`
- `extensions/memory-middleware/src/config.test.ts`
- `extensions/memory-middleware/src/learned-guidance-advisory-planning.test.ts`
- `extensions/memory-middleware/src/tools/memory-learned-guidance-plan.test.ts`
- `extensions/memory-middleware/src/tools/candidate-submit.integration.test.ts`

### Slice 3

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

## Rollout controls and observability added per executed slice

### Slice 1

- self-improving capture now has explicit allowed lesson-family rollout scope
- accepted candidate metadata now records rollout scope and review-burden
  context
- structured rollout evaluation now distinguishes created, blocked,
  replay-blocked, disabled, and failed outcomes
- blocked outcomes now preserve explicit reasons such as:
  - lesson-family outside rollout scope
  - approved memory already exists
  - pending candidate already exists
  - expired or rejected replay blocked

### Slice 2

- learned-guidance advisory planning now has explicit allowed lesson-family
  rollout scope
- learned-guidance advisory planning now has bounded default suggestion-budget
  control
- advisory results now expose:
  - surfaced / suppressed / disabled / no-guidance outcome codes
  - retrieved and eligible record counts
  - filtered-by-scope counts
  - suggestion count
  - conflict suppression count
  - native-versus-self-improving source mix
  - approximate prompt-cost signal

### Slice 3

- the docs pack now records that the rollout-proof batch is landed
- the docs pack now records that both seams should stay narrow for now
- `CURRENT_SLICE` now points at bounded off-production rollout enablement and
  evidence review as the next active work

## Behavior preserved per executed slice

### Slice 1

- self-improving capture remains candidate-only
- approved retrieval remains approved-only
- self-improving output has no direct approval authority
- self-improving output still cannot write project rules, procedures, or other
  approved memory directly

### Slice 2

- advisory planning remains approved-only, inline-only, and advisory-only
- advisory planning does not write memory
- advisory planning does not execute actions, enqueue work, or bypass approved
  retrieval
- advisory planning still suppresses conflicts instead of guessing

### Slice 3

- current family-policy differences remain unchanged
- the docs do not claim widening that the runtime did not land
- the next phase remains rollout evidence collection, not automatic expansion

## Tests and validation run at the end of each executed slice

### Slice 1

- `pnpm test -- extensions/memory-middleware/src/config.test.ts extensions/memory-middleware/src/tools/memory-self-improving-capture-candidate.test.ts extensions/memory-middleware/src/proof-runner.test.ts -t "self-improving|rollout|bounded"`
- `OPENCLAW_TEST_PROFILE=serial OPENCLAW_TEST_SERIAL_GATEWAY=1 pnpm test -- extensions/memory-middleware/src/tools/candidate-submit.integration.test.ts -t "routes reduced-profile self-improving workflow guidance only through the bounded candidate path|blocks self-improving replay after a matching candidate already exists|blocks forbidden self-improving output targets without touching the database|returns disabled for self-improving capture before writing any candidate rows|fails cleanly for self-improving capture when the configured database endpoint is unavailable|keeps self-improving rollout family scope narrow when configured"`
- `pnpm check:types`

### Slice 2

- `pnpm test -- extensions/memory-middleware/src/config.test.ts extensions/memory-middleware/src/learned-guidance-advisory-planning.test.ts extensions/memory-middleware/src/tools/memory-learned-guidance-plan.test.ts -t "learned-guidance|advisory|rollout|bounded"`
- `OPENCLAW_TEST_PROFILE=serial OPENCLAW_TEST_SERIAL_GATEWAY=1 pnpm test -- extensions/memory-middleware/src/tools/candidate-submit.integration.test.ts -t "returns advisory learned guidance from approved workflow memory without writing any rows|suppresses conflicting approved learned guidance instead of guessing|keeps advisory rollout scoped to configured workflow lesson families|returns disabled for learned-guidance planning before touching the database when mode is off"`
- `pnpm check:types`

### Slice 3

- doc-pack consistency review across the touched memory roadmap, status, and
  spec surfaces
- final landing validation recorded separately below

## Gating result at the end of slice 1

- result: `go`
- reason:
  - the self-improving seam now has explicit rollout scope and structured
    evaluation
  - candidate-only posture and approved-only retrieval remained intact
  - the repo can now judge usefulness and replay noise without widening the
    seam itself

## Gating result at the end of slice 2

- result: `go`, but `stay narrow`
- reason:
  - the advisory seam now has explicit rollout scope, suggestion-budget
    control, and structured observability
  - the seam remained advisory-only and conflict-safe
  - the repo gained enough signals to evaluate usefulness and prompt cost, but
    not enough evidence yet to justify widening

## Remaining work after this batch

- bounded off-production rollout enablement for the narrow self-improving
  tranche
- bounded off-production rollout enablement for the narrow inline advisory
  tranche
- evidence review on usefulness, replay noise, conflict suppression, and
  prompt cost
- a later widen / stay-narrow / pause decision based on that real evidence
- cross-domain family expansion only after those answers are clear

## Next implementation slice recommended

- bounded off-production rollout enablement and evidence review for the narrow
  self-improving and inline-advisory seams
