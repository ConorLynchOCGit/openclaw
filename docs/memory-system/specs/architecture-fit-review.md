# Architecture Fit Review

## Verdict

The spec pack is still fit for execution, but only after the roadmap is
reframed honestly.

The next architecture work is not a small closeout. It is a broader control-
plane and authority cleanup phase.

## What the current architecture already got right

- the six landed families already prove one broader memory system exists
- approved-only and hybrid-first guardrails remain intact
- procedures, facts, response style, and unmet needs already have justified
  policy differences
- flattening batches v1-v3 did reduce real duplication

## What the previous post-v3 framing got wrong

- it over-read behavior-profile as if it were already the application layer
- it over-read proof-family definitions as if proofing were already adapter-
  driven
- it over-read retrieval feature composition as if retrieval/routing were
  largely flattened
- it under-read how much ingestion and procedure work still remains

## Main remaining architecture problems

- ingestion is still split across more than one family-control plane
- retrieval policy is still split across framework, SQL, reshaping, and
  semantic sidecar routing
- application selection is still not a first-class runtime structure
- recurring procedures still retain too much historical subsystem shape
- correction policy is still not fully declarative
- registry authority is not yet strong enough to justify calling it the full
  control plane
- proofing is still registry-plus-switch
- memory-family boundaries across core/middleware/plugin-sdk still need cleanup

## Ownership map for the next push

### Full ingestion control plane should own

- transcript/tool submission unification
- deterministic parsing orchestration
- phrase matching orchestration
- semantic parsing orchestration
- correction intent normalization
- provenance output

### Application-selection layer should own

- selected vs suppressed memories
- application mode enforcement
- application reason codes
- rendering handoff

### Retrieval/routing control plane should own

- normalized query intent
- retrieval surface planning
- feature computation
- family suppression
- semantic fallback eligibility

### Procedure staged substrate should own

- candidate-to-validated staging
- distinct procedure artifact semantics
- shared substrate reuse points

### Correction-policy cleanup should own

- declarative correction posture
- lineage requirements
- target selection rules

### Proof adapterization should own

- proof adapter registration
- lifecycle/artifact adapter dispatch
- backward-compatible proof output

### Registry authority cleanup should own

- authoritative policy source of truth
- elimination of duplicate policy tables/mappings

### Contract boundary cleanup should own

- clean memory-family policy seam across core/middleware/plugin-sdk

## Must remain intentionally family-specific

- procedure application posture
- stricter project-fact truth posture
- bounded response-style scope
- unmet-need recommendation-only posture
- family-gated semantic routing
- family eligibility for phrase induction

## Conclusion

The roadmap remains fit for execution only if the repo now treats the stronger
substrate push as the real next phase. If the repo resumes self-improving
capture or new family work too early, it will compound partial flattening and
raise proof burden unnecessarily.
