# Memory Roadmap

## Current roadmap summary

The memory program has reached practical parity across the six landed families:

- response style
- project facts
- recurring procedures
- workflow lessons
- project rules
- unmet needs

Practical parity means:

- capture, lifecycle, retrieval, and repair are no longer badly uneven
- the families are close enough to move forward in the roadmap

Practical parity does not mean:

- every family now has the same capability envelope
- every family should have the same product-policy behavior
- the implementation substrate is already flat enough for 10+ more families

That last point is the reason the roadmap now inserts a flattening phase before
reduced-profile self-improving capture and major family expansion.

## Live baseline

The current live boundary includes:

- bounded response-style memory with bounded generic lanes and reviewed phrase
  patterns
- bounded project-fact memory with typed facts plus bounded generic reference
  facts
- bounded recurring procedures with validated-procedure retrieval and
  suggestion-first posture
- generalized workflow lessons with auto-review and approved-only retrieval
- generalized project rules with approved-only retrieval
- bounded unmet needs with recommendation-only retrieval
- cross-family retrieval/application parity closeout for direct named-project
  asks

## Why flattening comes next

The main remaining problem is no longer a missing user-visible family. It is
accidental parallelism in the implementation.

Today, family policy is still too scattered across:

- transcript capture
- tool-side candidate submission
- family-specific lifecycle and correction helpers
- retrieval scoring
- prompt application
- proof inspection

Adding more families before flattening would multiply that duplication.

## Phase A — existing-family parity

This phase is complete enough to proceed.

Landed parity tranches:

1. project-fact parity v1
2. recurring-procedure parity v1
3. response-style parity v1
4. cross-family retrieval/application parity closeout
5. cross-family repair / supersede parity closeout
6. bounded phrase-induction expansion where justified
7. remaining generic-envelope parity closeout

Phase A conclusion:

- the six families are at practical parity
- the six families are not fully identical
- practical parity is enough to proceed to flattening

## Phase B — flatten the family substrate

This is now the next major roadmap phase.

### Phase purpose

Collapse accidental implementation duplication while preserving real
family-policy differences.

### Must flatten now

1. family-definition registry
   - landed in batch v1 for the six current families
2. unified ingestion resolver
   - landed in batch v1 for the workflow lesson / project-rule / unmet-need
     family cluster
3. unified clustered lifecycle engine
   - landed in batch v1 for response-style, project-fact, and
     workflow-improvement memory-object lifecycle inspection
   - recurring procedures now reuse shared lifecycle utilities while retaining
     validated-procedure inspection
4. unified correction / supersede engine
   - landed in batch v2 for response-style, project-fact, and workflow-family
     bounded correction / supersede planning
5. retrieval feature framework
   - landed in batch v2 for approved-memory hybrid ranking across response
     style, project facts, workflow lessons, project rules, and unmet needs
6. behavior-profile / application layer
   - landed in batch v3 through the shared durable-memory behavior-profile
     layer used by `extensions/memory-core/src/prompt-section.ts`

### Can flatten later inside the same phase

7. unified phrase-pattern engine
   - landed in batch v2 for workflow lessons and response style
8. registry-driven proof / lifecycle inspection
   - landed in batch v3 for the six core proof families plus workflow /
     response-style phrase artifacts

### What must remain intentionally family-specific

- procedures remain `suggestion_first` and direct-use only on clear ask
- project facts remain explicit, scoped, and stricter than generic guidance
- response style remains bounded and does not become broad personality memory
- semantic routing remains hybrid-first and family-gated
- phrase induction remains family-eligible rather than universal

### Why this phase comes before self-improving capture

Reduced-profile self-improving capture would add more candidate pressure to the
same family substrate. That substrate should be flatter first so self-improving
capture does not land on top of duplicated family plumbing.

### Why this phase comes before major family expansion

The repo should not add another 10+ families while:

- capture still has duplicate family resolution stacks
- lifecycle and correction are still partially reimplemented by family
- retrieval ranking keeps growing family-specific branches
- prompt application still carries hidden family policy
- proofing still needs more family switches

### Flattening execution order

Recommended order:

1. family-definition registry
2. unified ingestion resolver
3. unified clustered lifecycle
4. unified correction / supersede
5. unified phrase-pattern engine
6. retrieval feature framework
7. behavior-profile layer
8. registry-driven proof inspection

The first four flatten the highest-leverage shared seams. Retrieval/application
and proofing flatten after the registry and lifecycle policy exist.

### Current flattening status

The flattening phase is now underway in code, not just in specs.

Batch v1 completed:

- registry-driven family policy lookups in proof inspection and capture metadata
- shared workflow-family ingestion resolution across transcript and tool
  submission
- shared memory-object lifecycle inspection across more than one family

Batch v2 completed:

- shared correction planning and approved-memory supersede execution across
  multiple bounded families
- shared reviewed phrase-pattern handling across workflow lessons and response
  style
- shared approved-memory retrieval feature composition across multiple
  guidance and direct-answer families

Batch v3 completed:

- shared durable-memory behavior-profile rendering from registry-derived family
  posture
- registry-driven proof family definitions across lifecycle and phrase
  inspection
- shared reviewable-candidate retrieval feature composition and validated-
  procedure subject-match retrieval composition

One more flattening closeout slice is still honestly recommended before moving
on:

- remaining ingestion migration for response style, project facts, and
  recurring procedures where honest
- remaining recurring-procedure bridge cleanup

## Phase C — reduced-profile self-improving capture

This phase remains later.

It should begin only after flattening is materially complete enough that:

- self-improving candidates enter the same family substrate
- provenance stays explicit
- family policy does not have to be re-implemented per family

This phase remains:

- candidate-only
- bounded
- provenance-aware

It is still not permission for:

- autonomous remediation
- broad semantic routing
- advisory execution

## Phase D — learned-guidance advisory planning

This remains later than both flattening and reduced-profile self-improving
capture.

It should build on:

- the flattened family substrate
- approved-only retrieval
- explicit behavior-profile selection
- explicit provenance from self-improving candidates where relevant

## Phase E — cross-domain family expansion

Cross-domain family expansion resumes only after:

1. flattening
2. reduced-profile self-improving capture
3. learned-guidance advisory planning

Recommended first tranche:

- decision + rationale
- observation / result / finding
- terminology / ontology / canonical definition
- entity profile

Recommended second tranche:

- risk / hazard / safety constraint
- metric / baseline / threshold
- hypothesis / open question
- audience / stakeholder model
- source trust / authority ranking
- exception / edge-case rule

## Roadmap guardrails

- do not treat flattening as permission to erase real family-policy differences
- do not treat practical parity as full capability identity
- do not enable reduced-profile self-improving capture during the flattening
  architecture/spec phase
- do not add new families before the flattening execution plan is underway

## Read next

- `/memory-system/CURRENT_SLICE`
- `/memory-system/FLATTENING_EXECUTION_PLAN`
- `/memory-system/FAMILY_SUBSTRATE_FLATTENING_ANALYSIS`
- `/memory-system/specs/implementation-sequencing`
