---
summary: "Document and ordinary-turn source adapter spec."
title: "Source Adapters"
---

# Source Adapters

## Objective

Convert raw sources into a unified normalized envelope without adding semantic interpretation.

## Supported v1 sources

- document ingestion
- ordinary-turn user capture
- finalized daily continuity recovery from `memory/YYYY-MM-DD.md`

## Document adapter

Input:

- raw document content or path
- optional project metadata

Responsibilities:

- read the document
- normalize whitespace and line endings
- preserve heading boundaries
- preserve list boundaries
- attach minimal source metadata
- split only for size and structure
- expose exact heading-path options for each window so downstream prompts may
  cite a stable `headingPathRef` instead of replaying long heading arrays

The document adapter must not:

- classify semantics
- infer categories
- detect rules with regexes
- detect facts with keywords

## Ordinary-turn adapter

Input:

- current user message
- bounded recent context
- optional session/project metadata

Responsibilities:

- strip transport-only metadata
- normalize whitespace
- preserve speaker boundaries
- enforce token limits
- create one or more bounded source windows only when size requires it

The turn adapter must not:

- use explicit-memory regex triggers
- use detector-era parsing
- route by guessed semantic lane

## Daily continuity recovery adapter

Input:

- finalized `memory/YYYY-MM-DD.md` document content
- optional bounded metadata about the covered day or session set

Responsibilities:

- normalize the daily continuity file as a document source
- preserve headings, list boundaries, and line ranges
- mark the source as derived continuity input rather than primary evidence
- preserve enough source metadata that downstream policy can prevent
  double-counting against the underlying primary source material

The daily continuity adapter must not:

- become independent proof for memories already captured from primary sources
- invent semantic linkage back to specific raw turns beyond available source
  metadata
- promote candidate output directly into active memory merely because the daily
  file is well formed

## Windowing policy

Windowing is structural, not semantic.

Document windows:

- chunk by token budget
- prefer heading and list boundaries
- use overlap only where needed for provenance continuity

Turn windows:

- send the whole turn plus bounded context by default
- split only if token budget requires it

## Cache key inputs

Source adapters must expose a stable normalized source fingerprint built from:

- source kind
- normalized text
- structural metadata
- scope envelope

Daily continuity recovery sources must additionally expose enough source
metadata for downstream write policy to distinguish:

- primary-source evidence
- derived daily-recovery candidates
- same-source reruns that must not increase support weight

Document windows should also expose stable heading-path references for
structural provenance selection. Those refs are prompt-side convenience only.
Final runtime truth still stores exact heading paths, not refs.
