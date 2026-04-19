---
summary: "Live contract for curated MEMORY.md, memory-md projection output, and bootstrap injection."
title: "Memory Bootstrap Semantics Contract"
---

# Memory Bootstrap Semantics Contract

## Contract

The live runtime now separates three different things that were previously easy
to blur together:

1. curated workspace `MEMORY.md`
2. compiled `memory-md` projection output
3. dynamic context artifacts such as user/session/procedure packs

They are related, but they are not the same surface and they are not allowed to
share ownership casually.

## Curated workspace `MEMORY.md`

This file is:

- human-owned
- durable
- continuity-oriented
- directly bootstrap-readable

It may include:

- durable operator preferences
- infrastructure posture
- workflow principles
- operating-model boundaries
- durable lessons and cautions

It may not be rewritten with generated standing-context or recall scaffolding as
part of runtime projection refresh.

Current overwrite rule:

- `MEMORY.md` is `no_overwrite`

## Compiled `memory-md` projection output

`memory-md` remains a valid projection target.

Its job is still to render a bounded stable bootstrap packet from canonical
memory objects and runtime read models.

It is:

- generated
- runtime-owned
- provenance-bearing
- not semantic truth by itself

It is not written back into workspace `MEMORY.md`.

## Bootstrap surfacing rule

When `memory-md` is available, it reaches bootstrap context through a separate
runtime artifact path:

- `.openclaw/model-memory/projections/<target>-<content-hash>.md`

That artifact path is the context-file path injected into bootstrap context.

This means:

- curated workspace `MEMORY.md` remains intact
- the generated bootstrap packet still reaches the model
- the injected path itself preserves the projection provenance boundary

## Bounded projection injection

The runtime does not inject every projection target into bootstrap context by
default.

Current bootstrap projection target set:

- `memory-md`

Current non-bootstrap projection targets:

- `user-md`
- `agents-md`

Those targets still exist as projection outputs and derived runtime truth, but
they are not currently injected as separate bootstrap context artifacts in this
contract.

## Dynamic context artifacts

Dynamic context artifacts remain distinct from bootstrap projections.

Examples:

- `user_memory_pack`
- `project_memory_pack`
- `procedure_memory_pack`
- `session_summary_pack`

These are:

- context-engine-facing derived artifacts
- later or narrower than bootstrap projection
- injected under `.openclaw/model-memory/context/*`

They are not replacements for curated `MEMORY.md`, and they are not the same as
the compiled `memory-md` bootstrap projection.

## Authority boundary

The live authority stack is:

1. canonical memory objects as semantic truth
2. derived projection outputs and context artifacts as runtime consumers
3. curated continuity files as human-owned durable context sources

Therefore:

- canonical memory objects remain the semantic source of truth
- compiled `memory-md` is a derived bootstrap projection
- dynamic packs are derived context artifacts
- curated workspace `MEMORY.md` is a human-authored continuity source

None of those surfaces may silently overwrite the others.

## Provenance rule

Projection provenance remains visible through:

- `projectionVersions`
- `projectionOutputs`
- `canonicalArtifactPath`
- the injected bootstrap context-file path itself

The runtime must preserve enough metadata that a rendered bootstrap packet can
be traced back to its compiled projection version and artifact path.

## Regression guardrails

The following are regressions:

- generated standing context written back into workspace `MEMORY.md`
- `memory-md` still being compiled but no longer reaching bootstrap context
- dynamic packs being treated as the same surface as `memory-md`
- docs claiming the live path is still “generated zone inside workspace
  MEMORY.md” after this contract
