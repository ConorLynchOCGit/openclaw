# Retirement Tranche Proper Batch V1

## Purpose

This batch was the first explicit retirement tranche after the earlier
canonicalization batches.

The guiding rule was stricter than the prior review:

- abolish the old family-heavy control shape where the replacement was ready
- stop preserving rigid keyword or template fast lanes just because they
  already existed
- collapse duplicate subsystems onto one canonical or adapterized seam

## Critical Review Findings

### 1. Write staging was still pretending kind dispatch was the substrate

`extensions/memory-middleware/src/write-action-stages.ts` was generic only on
paper.

In practice, the active candidate submission path still routed through:

- hardcoded candidate kind dispatch
- hardcoded family resolution order inside `candidate-submit`

That kept the old family/kind ownership model as the real write substrate even
after canonical ingestion candidates existed.

### 2. Phrase induction was still two systems

The workflow and response-style phrase-induction files were still separate
subsystems even though both were only family-specific adapters around the same
reviewed phrase-pattern engine.

That duplication was mostly historical inertia:

- separate lifecycle support checks
- separate reviewed-row lookup wrappers
- separate induction orchestration wrappers

### 3. The ingestion resolver still duplicated its own logic by source and mode

`extensions/memory-middleware/src/memory-ingestion-resolver.ts` still had:

- separate learning vs correction project-fact deterministic branches
- repeated content vs raw loops for workflow improvement
- repeated “try phrase match, then semantic family A, then semantic family B”
  code paths

Canonical outputs existed, but the internal resolution logic was still too
family/template oriented.

### 4. Candidate submission still carried frozen special cases

`extensions/memory-middleware/src/tools/candidate-submit.ts` still had:

- old family-specific resolution and auto-promotion routing
- a response-style paraphrase key shim kept alive for a narrow frozen phrase
  set
- duplicated lesson-key-specific semantic embedding promotion branches

The paraphrase shim was explicitly nostalgia-kept: it encoded a tiny frozen map
instead of using the real ingestion/canonicalization path.

### 5. Family policy still leaked obsolete fast-path hints into canonical compatibility

`src/plugin-sdk/memory-family-policy.ts` still stamped `typedFastPaths` into
canonical compatibility records.

That was architectural leakage from the old family/template world into the new
canonical envelope. The value was no longer driving runtime behavior and did
not belong in canonical compatibility records.

## What Was Landed

### 1. Write-stage routing is now canonical-family aware

Landed in:

- `extensions/memory-middleware/src/write-action-stages.ts`
- `extensions/memory-middleware/src/tools/candidate-submit.ts`

The write-stage runner now matches stages through:

- canonical ingestion candidate family metadata first
- bounded legacy metadata fallbacks only when canonical stamping is not present

This moves the write entry seam toward canonical multi-candidate routing
instead of family-owned stage order.

### 2. Phrase induction is now one reviewed phrase-induction adapter seam

Landed in:

- `extensions/memory-middleware/src/reviewed-phrase-induction.ts`
- `extensions/memory-middleware/src/workflow-phrase-induction.ts`
- `extensions/memory-middleware/src/response-style-phrase-induction.ts`

The two phrase-induction files now keep only their family-specific match and
metadata builders.

Shared induction support, reviewed-row lookup, lifecycle inspection, and
promotion orchestration now live in one adapterized seam.

### 3. The response-style paraphrase fast lane was removed

Removed from:

- `extensions/memory-middleware/src/tools/candidate-submit.ts`

The old shim translated a tiny frozen set of response-style paraphrases into
bounded keys without going through the real resolver/canonical path.

That shortcut was deleted.

### 4. The ingestion resolver is flatter

Landed in:

- `extensions/memory-middleware/src/memory-ingestion-resolver.ts`

The resolver now has:

- one project-fact deterministic matcher parameterized by capture class
- one ordered workflow-improvement text resolver reused across content and raw
  sources

This reduces duplicated family/source branching and makes canonical-first
normalization more dominant.

### 5. Semantic embedding promotion for workflow guidance is no longer three separate branches

Landed in:

- `extensions/memory-middleware/src/semantic-retrieval-routing.ts`
- `extensions/memory-middleware/src/tools/candidate-submit.ts`

The environment-constraint / workflow-tool-gotcha / API-workaround promotion
paths now share one profile registry and one generic storage helper.

The old three-branch promotion logic in `candidate-submit` was reduced to one
canonical lesson-key-driven call.

### 6. Family policy leaked less old architecture into canonical records

Landed in:

- `src/plugin-sdk/memory-family-policy.ts`

The batch added a narrower phrase-review support helper and stopped stamping
`typedFastPaths` into canonical compatibility records.

That does not delete every legacy field from the public SDK, but it does stop
projecting obsolete fast-path hints into new canonical records.

## What Still Remains

The retirement tranche removed real duplication and retired one frozen
keyword/template shim, but some deeper transitional seams remain:

- `extensions/memory-middleware/src/tools/candidate-submit.ts`
  still owns too much family-specific correction and promotion behavior
- `extensions/memory-middleware/src/write-action-stages.ts`
  is more canonical-aware now, but not yet a full canonical multi-candidate
  write pipeline
- `extensions/memory-middleware/src/semantic-retrieval-routing.ts`
  still keeps bounded legacy fallback behavior for mixed-era records
- `src/plugin-sdk/memory-family-policy.ts`
  still remains the compatibility table for the six transitional families

## Outcome

This batch did not just rename the old system.

It actually deleted or demoted parts of it:

- canonical-family-aware write routing replaced hardcoded top-level stage order
- two phrase-induction subsystems collapsed onto one adapter seam
- one frozen response-style paraphrase fast lane was removed
- repeated workflow semantic-embedding promotion branches collapsed into one
  profile-driven helper
- old template fast-path hints stopped leaking into canonical compatibility
