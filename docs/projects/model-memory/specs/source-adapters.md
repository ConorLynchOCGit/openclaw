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
