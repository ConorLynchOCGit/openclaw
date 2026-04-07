# Family Substrate Flattening Analysis

## Purpose

This doc preserves the accepted analysis behind the flattening phase.

The six landed families now behave more like one system than they did earlier,
but the implementation still contains too much accidental family-specific
branching. That branching is the main reason flattening must precede major
family expansion.

## The six families

Current landed families:

1. response style
2. project facts
3. recurring procedures
4. workflow lessons
5. project rules
6. unmet needs

## Which parts are already one system

The six families already share:

- candidate/review/promotion substrate
- approved durable artifacts
- hybrid-first retrieval posture
- bounded clustering or confirmation patterns
- explicit proof expectations
- prompt-time application seams

At the product level, they are clearly part of one broader memory system.

## Which parts are still accidental parallel systems

### Family policy distribution

Family behavior is still scattered across:

- transcript capture
- tool-side candidate submission
- family-specific semantic and lifecycle files
- retrieval scoring
- prompt rendering and application logic
- proof-runner selection

### Ingestion duplication

The system still resolves families in different ways for transcript capture and
tool-side candidate submission.

### Lifecycle duplication

Several families now share clustered hold/approve/reject/supersede behavior,
but the repo still treats them as partly separate lifecycle systems.

### Correction duplication

Correction and supersede rules are increasingly similar, but not yet driven
from one shared engine.

### Phrase duplication

Phrase induction exists in more than one family, but not yet on one shared
substrate.

### Retrieval duplication

Retrieval ranking is one of the biggest scaling risks because family-specific
logic keeps growing in `db/queries.ts`.

### Application duplication

Prompt text in `prompt-section.ts` still carries too much family-specific
application policy.

### Proof duplication

The proof runner still knows too much about family names.

## Which differences are justified

These should remain intentionally different:

### Procedures

Recurring procedures are closer to executable behavior than guidance families.
They should remain:

- `suggestion_first`
- `direct_use_only_on_clear_ask`

### Project facts

Project facts should remain:

- explicit
- scoped
- stricter than generic guidance

### Response style

Response style should remain bounded. It should not expand into broad
personality memory.

### Semantic routing

Semantic routing should remain:

- additive
- family-gated
- hybrid-first rather than universal

## Which differences are not justified

These are implementation accidents, not durable product-policy differences:

- family policy being declared in multiple runtime files
- transcript and tool ingestion resolving the same family differently
- multiple near-duplicate clustered lifecycle paths
- family-specific correction engines
- one phrase subsystem per eligible family
- one retrieval scoring forest per family
- prompt rendering carrying selection logic
- proof-runner switches by family

## What happens if we add 10+ more families before flattening

If family expansion resumes before flattening:

- each new family will require touching too many runtime seams
- retrieval policy will become harder to reason about and tune
- proofing burden will grow faster than product value
- the repo will accumulate more parallel systems that later flattening must
  unwind under higher risk
- self-improving capture and advisory planning will inherit inconsistent family
  plumbing

The cost is not just extra code. It is higher execution cost, more brittle
rollouts, and slower future feature work.

## Why flattening should precede self-improving capture

Practical family parity solved the highest user-facing asymmetries. It did not
solve the underlying branch-heavy substrate.

Reduced-profile self-improving capture would add more candidate volume and more
family pressure. It should therefore land after the substrate is flatter, not
before.

## Why flattening should precede major family expansion

The repo should not add new families on top of the current partially parallel
implementation. Future families should land on:

- a registry-driven policy layer
- shared ingestion
- shared lifecycle and correction engines
- shared retrieval feature framework
- shared behavior-profile layer
- shared proof inspection

That is the core rationale for the flattening phase.

## Must flatten now

- family-definition registry
- unified ingestion resolver
- unified clustered lifecycle engine
- unified correction / supersede engine
- retrieval feature framework
- behavior-profile layer

These are the highest-leverage seams that directly control execution cost for
future families.

## Can flatten later inside the same phase

- unified phrase-pattern engine
- registry-driven proof inspection

These still matter, but they can follow the registry/ingestion/lifecycle work
if implementation pressure requires staging.

## Must remain intentionally family-specific

- procedure application posture
- stricter project-fact truth posture
- bounded response-style scope
- family-gated semantic routing
- family eligibility for phrase induction

Flattening is not a mandate to erase these differences.

## Recommended conclusion

The correct next major roadmap step is:

- flatten the shared memory family substrate

Not:

- immediate reduced-profile self-improving capture
- major family expansion

That conclusion is now accepted and should be treated as durable architecture
guidance until the flattening phase is complete.
