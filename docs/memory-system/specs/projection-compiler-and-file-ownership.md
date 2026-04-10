# Projection Compiler And File Ownership

## Purpose

Define the compiler contract for turning canonical approved DB memory into
native file projections without overwriting human control or creating drift.

## Compiler input contract

The compiler reads from canonical middleware state.

Minimum required signals:

- canonical kind
- review state
- content
- confidence
- provenance
- project association when present
- agent association when present
- metadata/facets needed for destination selection

## Eligibility rules

### Required by default

- approved state
- eligible canonical kind
- destination-safe content
- projection priority high enough to fit budget

### Excluded by default

- candidate state
- rejected state
- superseded state
- raw recalled snippets
- low-confidence inferred content that has not crossed the approved boundary

## Compiler responsibilities

- determine projection eligibility
- select destination file
- normalize text into destination-safe language
- apply budget caps
- emit deterministic generated sections
- preserve human-authored sections
- record provenance and staleness signals

## Ownership model

Every compiler-touched file must separate:

- generated content
- human-authored content

The exact syntax may vary by file, but ownership must be machine-detectable.

## Generated-zone rules

- the compiler may fully rewrite generated zones
- humans should not rely on hand edits surviving inside generated zones
- drift inside generated zones must be overwritten or surfaced explicitly

## Human-zone rules

- the compiler must not rewrite human-owned zones
- human-authored operating guidance remains first-class

## No ambient reverse sync

The compiler does not infer canonical DB writes from file edits in v1.

If reverse sync is ever introduced later, it must use an explicit workflow with:

- source classification
- review policy
- audit trail

## Budget policy

The compiler must treat prompt budget as a hard constraint.

Preferred behavior:

1. rank eligible items
2. include highest-priority items first
3. stop when destination/file budget is reached
4. emit truncation or omission diagnostics if needed

Do not spill excess content into prompt-facing files just because it exists.

## Provenance expectations

Generated sections should remain auditable.

At minimum the system should be able to answer:

- which canonical records produced this section
- when it was last compiled
- which destination policy was used
- whether the section is stale

## Refresh/orchestration posture

This spec does not force one runtime mechanism, but v1 should prefer bounded
refresh over per-turn blind rewriting.

Recommended v1 posture:

- explicit compiler action or bounded refresh trigger
- deterministic output
- diffable result
- safe no-op when nothing material changed

## Non-goals

This spec does not authorize:

- freeform merge logic between DB memory and markdown
- treating generated files as canonical memory write surfaces
- direct projection of raw retrieval output
