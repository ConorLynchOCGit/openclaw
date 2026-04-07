# Flattening Execution Plan

## Why flattening is happening now

The six landed memory families are now at practical parity:

- response style
- project facts
- recurring procedures
- workflow lessons
- project rules
- unmet needs

That is enough to move forward. It is not enough to add another 10+ families on
top of the current branch-heavy substrate.

The next phase is therefore not immediate self-improving capture. It is
flattening:

- preserve real family-policy differences
- collapse accidental implementation duplication
- make future family work land on shared substrate instead of adding more
  parallel systems

## Accepted target architecture

Flattening should produce these shared substrate layers:

1. family-definition registry
2. unified ingestion resolver
3. unified clustered lifecycle engine
4. unified correction / supersede engine
5. unified phrase-pattern engine
6. retrieval feature framework
7. behavior-profile layer
8. registry-driven proof / lifecycle inspection

These are the canonical implementation targets for the flattening phase.

## Current code seams that must be collapsed

### Capture and candidate formation

- `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts`
- `extensions/memory-middleware/src/tools/candidate-submit.ts`

### Lifecycle and repair

- `extensions/memory-middleware/src/response-style-lifecycle.ts`
- `extensions/memory-middleware/src/project-fact-lifecycle.ts`
- `extensions/memory-middleware/src/recurring-procedure-lifecycle.ts`
- generalized family lifecycle helpers embedded in workflow paths

### Retrieval and application

- `extensions/memory-middleware/src/db/queries.ts`
- `extensions/memory-core/src/prompt-section.ts`

### Proofing

- `extensions/memory-middleware/src/proof-runner.ts`

### Phrase induction

- family-specific workflow and response-style phrase engines

## Proposed implementation order

1. land the family-definition registry
2. route ingestion through a unified resolver
3. move clustered lifecycle policy onto a shared engine
4. move correction / supersede onto a shared engine
5. extract the unified phrase-pattern engine
6. land the retrieval feature framework
7. insert the behavior-profile layer and reduce prompt-section policy sprawl
8. move proof inspection onto registry-driven modes

This order is deliberate:

- the registry is the control plane for every later slice
- ingestion, lifecycle, and correction are the highest duplication seams
- retrieval and behavior-profile work should happen after registry and policy
  shape exist
- proof inspection should flatten after runtime policy has become registry-
  driven

## Current execution status

Batch v1 and batch v2 are now landed.

Completed:

1. family-definition registry
   - `extensions/memory-middleware/src/memory-family-registry.ts`
   - live consumers in `proof-runner.ts`, `ordinary-turn-auto-capture.ts`, and
     `tools/candidate-submit.ts`
2. unified ingestion resolver
   - `extensions/memory-middleware/src/memory-ingestion-resolver.ts`
   - live for workflow lessons, project rules, and unmet needs across transcript
     capture, tool submission, and tool-side duplicate-key derivation
3. unified clustered lifecycle
   - `extensions/memory-middleware/src/clustered-memory-lifecycle.ts`
   - live for response-style, project-fact, and workflow-improvement
     memory-object inspection
   - recurring procedures now share lifecycle utility helpers while keeping the
     validated-procedure inspection split

Completed through slice 6:

4. unified correction / supersede
   - landed in batch v2 for response style, project facts, and workflow-family
     supersede targeting
5. unified phrase-pattern engine
   - landed in batch v2 for workflow lessons and response style
6. retrieval feature framework
   - landed in batch v2 for approved-memory hybrid ranking across response
     style, project facts, workflow lessons, project rules, and unmet needs

Still next:

7. behavior-profile layer
8. registry-driven proof inspection closeout

## What each implementation slice should accomplish

### Slice 1 — family-definition registry

- create concrete registry entries for the six landed families
- move static family policy out of ad hoc branch logic
- prove at least two runtime seams read registry policy
  - landed in batch v1

### Slice 2 — unified ingestion resolver

- unify transcript and tool-submitted resolution
- preserve typed fast paths and bounded phrase-pattern feeds
- delete duplicated normalization branches only after parity is proven
  - landed in batch v1 for the workflow-family cluster

### Slice 3 — unified clustered lifecycle

- move memory-object families to shared cluster policy
- keep validated-procedure targets distinct
- preserve hold, approve, reject, supersede behavior
  - landed in batch v1 for memory-object inspection; recurring procedures remain
    distinct at the validated target

### Slice 4 — unified correction / supersede

- centralize correction intent handling
- preserve explicit lineage and family-specific correction modes
  - landed in batch v2

### Slice 5 — unified phrase-pattern engine

- move workflow and response-style phrase patterns onto one reviewed engine
- keep ineligible families out
  - landed in batch v2

### Slice 6 — retrieval feature framework

- replace family-specific scoring sprawl with shared feature composition
- preserve exact typed wins and direct named-project intent shaping
  - landed in batch v2 for approved-memory hybrid ranking

### Slice 7 — behavior-profile layer

- separate retrieval selection from prompt rendering
- preserve `guidance_only`, `recommendation_only`, `suggestion_first`, and
  `shape_reply` differences

### Slice 8 — registry-driven proof inspection

- make proofing scale with family registry policy
- stop adding family switches to the proof runner

## Proof required for each slice

Every flattening slice must prove both:

- behavior preservation for currently landed families
- actual reduction in accidental parallelism

Required proof themes:

- one shared substrate serving more than one family
- no regression in approved-only or hybrid-first posture
- no broad autonomy
- explicit ids and matched fields where retrieval or lifecycle is involved

## What must remain unchanged while flattening

- approved-only user-facing retrieval
- hybrid-first retrieval posture
- semantic routing remains family-gated
- procedures remain `suggestion_first` and direct-use only on clear ask
- project facts remain explicit and scoped
- response style remains bounded
- reduced-profile self-improving capture remains disabled
- learned-guidance advisory planning remains not live

## Deletion rules for old family-specific seams

Do not delete older family-specific seams until:

1. the shared replacement is live
2. parity with the old behavior is proven
3. proof output can attribute the new shared layer honestly

Delete in this order:

- policy lookups first
- wrapper helpers second
- dead family-specific branches last

Batch v2 deletion results:

- bounded correction auto-promotion no longer owns separate response-style and
  project-fact supersede execution paths
- workflow-improvement supersede writes no longer own a separate approved
  memory-object supersede loop
- workflow and response-style phrase induction no longer each own separate
  proposal/lifecycle/approved-lookup implementations
- approved-memory hybrid retrieval no longer hand-inlines the previous
  generic-family CASE forest for response style, project facts, workflow
  lessons, project rules, and unmet needs

## Later work that depends on flattening

- reduced-profile self-improving capture integration
- learned-guidance advisory planning
- major cross-domain family expansion

Flattening is a prerequisite because all three later phases would otherwise land
on a substrate that is too branch-heavy to scale safely.

## Anti-goals

- turning all families into identical behavior policies
- enabling self-improving capture during flattening
- enabling learned advisory planning during flattening
- broadening semantic routing to every family
- adding new memory families before the substrate is flatter

## Failure modes

- flattening becomes vague refactor language without concrete contracts
- product-policy differences get erased
- shared substrate becomes another name for a large hidden switch statement
- new families resume before the flattening slices are complete
