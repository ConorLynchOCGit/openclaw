# Canonical Write Promotion Unification Tranche V1

## Purpose

This tranche moved the live write and promotion path closer to one canonical
pipeline instead of several family-heavy submit/promote branches.

The target was narrower than a full storage migration but stricter than the
earlier retirement pass:

- canonical candidate identity and compatibility should be the first write
  routing substrate
- detector selection should prefer canonical profile tables over open-coded
  family branching
- old-record fallback should stay only where mixed-era data still honestly
  requires it

## What Landed

### 1. Detector selection is more profile-driven

Landed in:

- `extensions/memory-middleware/src/memory-ingestion-resolver.ts`

The resolver now uses explicit ingestion-mode and workflow-detector profiles
instead of open-coded mode/family branching for the main response-style,
project-fact, and workflow-guidance paths.

Workflow family resolution now prefers capture-class compatibility metadata
before falling back to workflow lesson-family mapping.

### 2. Candidate submission now stamps the remaining response-style fallback path canonically

Landed in:

- `extensions/memory-middleware/src/tools/candidate-submit.ts`

The residual tool-submission fallback that still normalized direct
response-style feedback without going through the fuller resolver now stamps a
canonical ingestion candidate instead of only raw `autoCapture` metadata.

That shrinks the number of paths that still require legacy write-stage
inference.

### 3. Duplicate detection now recognizes canonical candidate identity

Landed in:

- `extensions/memory-middleware/src/tools/candidate-submit.ts`

Managed duplicate detection now checks canonical ingestion candidate dedupe
identity first instead of only the old `autoCapture.key` path.

### 4. Write-stage family inference is narrower

Landed in:

- `extensions/memory-middleware/src/write-action-stages.ts`

Write-stage routing no longer infers family from template-only metadata.

Canonical family metadata remains the preferred route key. Bounded legacy
fallback now only considers explicit category or capture-class evidence where
mixed-era inputs still exist.

### 5. Family policy dropped another dead old-world field

Landed in:

- `src/plugin-sdk/memory-family-policy.ts`

`typedFastPaths` was removed from the public family-definition surface.

It had become dead architectural residue: not a real canonical seam and not a
runtime authority worth preserving.

### 6. Semantic retrieval and learned-guidance now keep only one mixed-era fallback ladder

Landed in:

- `extensions/memory-middleware/src/semantic-retrieval-routing.ts`
- `extensions/memory-middleware/src/learned-guidance-advisory-planning.ts`

Canonical record/candidate metadata is now the default source.

Legacy fallback is reduced to:

- `candidateMetadata.autoCapture`
- top-level `autoCapture`

The older promotion-time metadata ladders were removed from these paths.

## What Still Remains

The write/promotion path is flatter and more canonical-first now, but a few
transitional seams still remain:

- `extensions/memory-middleware/src/memory-ingestion-resolver.ts`
  still bridges some family-era detector semantics internally
- `extensions/memory-middleware/src/tools/candidate-submit.ts`
  still carries family-specific correction/promotion helpers behind the now
  more canonical-first front door
- `extensions/memory-middleware/src/semantic-retrieval-routing.ts`
  and `extensions/memory-middleware/src/learned-guidance-advisory-planning.ts`
  still keep one bounded old-record bridge for mixed-era approved rows

## Outcome

The active memory runtime now behaves more like:

- canonicalize
- dedupe
- route
- promote

and less like:

- guess family first
- rebuild meaning from old metadata
- patch on compatibility later
