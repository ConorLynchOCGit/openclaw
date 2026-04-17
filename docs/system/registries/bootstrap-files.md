---
summary: "Human-readable wrapper for the runtime bootstrap-file mapping registry."
title: "Bootstrap Files Registry"
---

# Bootstrap Files Registry

Canonical machine-readable source:

- `docs/system/registries/bootstrap-files.yaml`

This registry records the current runtime file classes and the intended durable
to runtime compatibility mapping for each one.

Current implementation:

- `src/agents/bootstrap-file-registry.ts` loads this registry for code use
- `src/agents/bootstrap-canonicalization.ts` consumes it to materialize the
  runtime-facing compatibility files
- `scripts/check-bootstrap-file-mapping.mjs` validates that the registry stays
  aligned with the documented bootstrap contract
