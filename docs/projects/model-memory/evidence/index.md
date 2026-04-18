---
summary: "Canonical index for retained model-memory evidence artifacts and bounded experiment residue policy."
title: "Model Memory Evidence"
---

# Model Memory Evidence

This directory is the retained evidence surface for `model-memory`.

It keeps:

- cutover proof artifacts
- ingestion and retrieval proof artifacts
- representative packet-quality experiment artifacts
- operator-facing reports that are still part of the canonical proof trail

It does not keep every intermediate prompt/output scratch file forever.

## Retained packet experiment artifacts

The `2026-04-17` packet experiment bundle is now normalized to a small
canonical comparison set:

- `memory-md-model-driven-experiment-2026-04-17-nano-packet.md`
  - first bounded nano output kept for qualitative comparison
- `memory-md-model-driven-experiment-2026-04-17-baseline-openai-stronger-openrouter-openai-gpt-5-4-packet.md`
  - stronger-model baseline kept as the pre-quota comparison point
- `memory-md-model-driven-experiment-2026-04-17-kind-quotas-v1-openai-stronger-openrouter-openai-gpt-5-4-basket.json`
  - retained source basket for the capped stronger-model comparison
- `memory-md-model-driven-experiment-2026-04-17-kind-quotas-v1-openai-stronger-openrouter-openai-gpt-5-4-prompts.json`
  - retained prompt contract for the capped stronger-model comparison
- `memory-md-model-driven-experiment-2026-04-17-kind-quotas-v1-openai-stronger-openrouter-openai-gpt-5-4-packet.md`
  - retained capped stronger-model packet and current canonical comparison

The superseded intermediate prompt/output files for the same experiment are now
classified in the memory-residue audit instead of being kept here by default.

## Other retained evidence families

- `post-cutover/`
  - cutover verification and stabilization evidence
- `deep-document-ingest-*`
  - substrate population run evidence
- `retrieval-trace-*`, `context-trace-*`, `cache-diff-*`
  - retrieval/context/cache verification artifacts
- `duplicate-*`, `support-only-*`, `proof-phase-*`
  - write-path and dedupe proof artifacts

## Related docs

- [Memory Residue Audit](/projects/model-memory/memory-residue-audit)
- [Model Driven Packet Assembly Evaluation](/projects/model-memory/specs/model-driven-packet-assembly-evaluation)
- [Packet And Kind Balance Proof Pack](/projects/model-memory/packet-and-kind-balance-proof-pack)
