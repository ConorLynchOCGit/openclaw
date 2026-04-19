---
summary: "Comparison of the live model-memory v1 ontology and the draft MMV2 ingestion proposal."
title: "MMV2 Schema Delta V1 To V2"
---

# MMV2 Schema Delta V1 To V2

## Live v1 semantic contract

Current live ontology in repo docs and code:

- canonical classes:
  - `user`
  - `feedback`
  - `project`
  - `reference`
- internal kinds:
  - `preference`
  - `fact`
  - `rule`
  - `procedure`
  - `reference`

## Draft MMV2 semantic contract

Proposed atomic kinds:

- `claim`
- `directive`
- `source_ref`
- `episode`

Proposed composite artifact types:

- `procedure`
- `checklist`
- `profile`
- `project_state`
- `decision_record`
- `source_bundle`
- `lesson_pack`

## Exact semantic shifts

### Removed as top-level kinds

- `preference`
- `fact`
- `rule`
- `reference` as the generic noun kind
- `procedure` as an atomic kind

### Replaced by broader atomic roles

- `preference` becomes a descriptive `claim` or a derived `directive`
- `fact` becomes `claim`
- `rule` becomes `directive`
- `reference` becomes `source_ref`
- event or change tracking gains a new atomic kind: `episode`

### Structural shift

V1 largely stores atomic-like objects.

MMV2 introduces:

- a top-level `unit_type`
- first-class composite artifacts
- child components with promotion control
- parent-child and derived-from relationships as core ingestion output

## Impact on current repo documents

Current live docs assume:

- `kind` still uses the five-kind v1 set
- `canonicalClass` remains part of the runtime truth contract
- `procedure` is emitted as a direct kind

The MMV2 draft instead assumes:

- atomic semantic role is primary
- composite structure is explicit
- `canonicalClass` may become secondary, derived, or retired
- procedures and checklists are not atomic memory rows

## What remains undecided

- whether `canonicalClass` survives as a stored field, a derived field, or a
  compatibility-only projection
- what the exact database migration path should be
- whether ordinary-turn capture should share the same runtime immediately or
  after a document-only proving lane
- whether all composite artifact types should land in the first document-ingest
  implementation slice or only `procedure` and `checklist`

## Recommendation for implementation readiness

Treat MMV2 as a genuine contract rewrite, not a prompt tweak.

That means any future implementation must explicitly decide:

- coexistence or shadowing strategy against v1
- storage migration or translation model
- retrieval/read-model impact
- projection and runtime packaging impact
