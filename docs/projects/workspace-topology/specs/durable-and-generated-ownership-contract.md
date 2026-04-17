---
summary: "Spec for the repo-wide contract between durable human-owned sections and generated sections."
title: "Durable And Generated Ownership Contract"
---

# Durable And Generated Ownership Contract

## Goal

Generalize the `model-memory` projection concept into a repo-wide ownership
contract for durable and generated content.

## Required contract

- durable sections are human-owned
- generated sections are machine-owned
- generated content must live in explicit bounded zones
- whole-file replacement is not the default pattern

## Source foundation

This contract extends the `model-memory` projection direction already recorded
in:

- `docs/projects/model-memory/bootstrap-input-audit.md`

Key inherited principle:

- generated projections should use controlled generated zones instead of
  overwriting whole files

## Required outputs

- marker format
- allowed generated-zone locations
- rules for human edits versus machine projection
- validation/check script contract

## Success criteria

- the durable/generated split is explicit and enforceable
- the repo uses one compatible contract rather than multiple drifting patterns
