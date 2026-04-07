# Current Slice

## Active slice

Memory substrate flattening implementation phase

## Objective

Continue the flattening implementation phase after batches v1 and v2:

- behavior-profile layer
- registry-driven proof inspection closeout

The next work should keep reducing accidental parallelism while preserving
current family behavior.

## Why this slice exists

The six landed families are now close enough to practical parity to move
forward:

- response style
- project facts
- recurring procedures
- workflow lessons
- project rules
- unmet needs

But practical parity did not make the families fully identical in code shape.
The repo still carries too much accidental family-specific branching across:

- capture
- candidate submission
- lifecycle
- correction
- retrieval
- prompt application
- proof inspection

## Landed in batch v1

- `extensions/memory-middleware/src/memory-family-registry.ts`
  - six-family declarative registry
  - runtime consumers in proof inspection, transcript capture metadata, and
    tool-side workflow family metadata
- `extensions/memory-middleware/src/memory-ingestion-resolver.ts`
  - shared workflow-family resolver used by transcript capture and tool-side
    improvement submission
  - same resolver also feeds tool-side duplicate-key detection for improvement
    notes
- `extensions/memory-middleware/src/clustered-memory-lifecycle.ts`
  - shared memory-object lifecycle inspection engine
  - adopted by response style, project facts, and workflow improvements
  - recurring procedures now reuse shared lifecycle utilities while keeping
    validated-procedure inspection distinct

## Landed in batch v2

- `extensions/memory-middleware/src/memory-correction-engine.ts`
  - shared correction planning and execution for explicit bounded corrections
  - live for response style, project facts, and workflow-family supersede
    targeting
- `extensions/memory-middleware/src/memory-object-supersede.ts`
  - shared approved memory-object supersede and lineage writer
  - now serves workflow improvements and bounded correction auto-promotion
- `extensions/memory-middleware/src/phrase-pattern-engine.ts`
  - shared reviewed phrase-pattern proposal, lifecycle, lookup, and induction
    substrate
  - live for workflow lessons and response style
- `extensions/memory-middleware/src/retrieval-feature-framework.ts`
  - shared approved-memory retrieval feature composer
  - live for response style, project facts, workflow lessons, project rules,
    and unmet needs in hybrid retrieval

## Duplicate seams removed in batch v1

- proof-runner family inspection selection no longer hardcodes the six main
  families
- transcript capture no longer owns a separate workflow/project-rule/unmet-need
  family-resolution chain
- tool-side improvement submission no longer owns a separate
  workflow/project-rule/unmet-need family-resolution chain
- response-style, project-fact, and workflow-improvement lifecycle inspection
  no longer each own a fully separate memory-object inspection implementation

## Duplicate seams removed in batch v2

- response-style, project-fact, and workflow-family correction targeting no
  longer each own separate immediate supersede planning
- workflow-improvement supersede writes no longer own a separate approved
  memory-object supersede loop
- workflow and response-style phrase induction no longer each own separate
  proposal/lifecycle/approved-lookup engines
- approved-memory hybrid retrieval no longer hand-inlines one large
  family-specific generic score forest in `db/queries.ts`

## Explicitly not next

The next major roadmap step is not:

- reduced-profile self-improving capture integration
- learned-guidance advisory planning
- new cross-domain families

Those remain later phases after the flattening phase.

## What remains next inside flattening

- behavior-profile layer
- registry-driven proof inspection closeout
- remaining ingestion migration for response style, project facts, and
  recurring procedures where honest
- remaining lifecycle / retrieval cleanup for recurring procedures and
  reviewable-candidate retrieval seams

## Accepted architectural decisions

- practical parity is sufficient to move to flattening, not to broad family
  expansion
- the next major roadmap step is architecture flattening
- real family-policy differences remain valid
- accidental implementation differences must be collapsed
- new families should land on top of the flattened substrate

## Must flatten now

- behavior-profile layer

## Can flatten later inside the same phase

- registry-driven proof inspection

## Must remain intentionally different

- procedures remain `suggestion_first` and direct-use only on clear ask
- project facts remain explicit and stricter than generic guidance
- response style remains bounded
- semantic routing remains hybrid-first and family-gated

## The next implementation slice after batch v2

- behavior-profile layer
