# Architecture Fit Review

## Verdict

The spec pack is now fit for a flattening phase.

That is the correct next phase because:

- the six landed families are at practical parity
- the product-policy differences are clearer than before
- the remaining scaling problem is accidental parallel implementation

The next phase should therefore flatten shared substrate, not jump directly to
reduced-profile self-improving capture or new family expansion.

## What the current architecture already got right

- semantic detection, canonicalization, lifecycle, retrieval, and application
  are conceptually separate layers
- the six landed families already prove one broader memory system exists
- approved-only and hybrid-first guardrails are intact
- procedures, facts, and response style already have justified policy
  differences

## What is still over-coupled

The main architectural problem is not missing infra. It is policy still being
declared in too many places:

- capture and candidate-submit each resolve families locally
- lifecycle and correction behavior are still partly per-family implementations
- retrieval ranking is too tied to family-specific SQL branches
- prompt rendering still carries application policy
- proof-runner still carries family selection policy

## Flattening ownership map

### Family-definition registry owns

- family identity
- storage kind
- scope model
- canonical fields
- lifecycle policy
- correction policy
- phrase policy
- retrieval policy
- application policy
- semantic-routing policy
- proof policy

### Unified ingestion resolver owns

- transcript and tool-side family resolution
- canonical payload formation
- ambiguity outcome
- correction-intent signaling

### Unified clustered lifecycle owns

- hold / approve / reject / supersede transitions
- cluster and subject identity
- stale handling

### Unified correction / supersede owns

- explicit correction targeting
- held versus immediate correction posture
- lineage generation

### Retrieval feature framework owns

- feature extraction
- feature weighting by family policy
- matched-field evidence
- direct-intent shaping

### Behavior-profile layer owns

- selected versus suppressed memories
- family application posture
- prompt-rendering inputs

### Registry-driven proof inspection owns

- lifecycle inspection mode selection
- phrase inspection support
- matched-field evidence mapping

## Must flatten now

- family-definition registry
- unified ingestion resolver
- unified clustered lifecycle
- unified correction / supersede
- retrieval feature framework
- behavior-profile layer

## Can flatten later inside the same phase

- unified phrase-pattern engine
- registry-driven proof inspection

## Must remain intentionally family-specific

- procedure application posture
- stricter project-fact truth posture
- bounded response-style scope
- family-gated semantic routing
- family eligibility for phrase induction

## Main remaining architecture risk

The main risk is now architectural drift from adding more families before
flattening:

- more ingestion duplication
- more lifecycle duplication
- more retrieval CASE growth
- more prompt policy sprawl
- more proof-runner branches

## Conclusion

The roadmap is now fit for execution only if the next execution tranche is
flattening. If the repo resumes self-improving capture or major family
expansion before flattening, it will compound the very duplication this spec
pack is trying to remove.
