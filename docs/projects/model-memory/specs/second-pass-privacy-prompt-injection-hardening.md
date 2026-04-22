---
summary: "Phase 2 planning spec for second-pass privacy and prompt-injection hardening over MMV2 memory."
title: "Second-Pass Privacy And Prompt-Injection Hardening"
---

# Second-Pass Privacy And Prompt-Injection Hardening

## Status

Planning artifact as of 2026-04-22. Do not implement runtime behavior from this
document without a separate reviewed execution pass.

## Objective

Define the second-pass safety layer for MMV2 memory after the runtime is
observable, projection-backed, and no-dark-data compliant.

The goal is to keep durable memory useful while preventing source documents,
tool outputs, prompts, or generated artifacts from becoming hidden instructions,
raw-data stores, or prompt-injection vectors.

## MMV2 Boundaries

- MMV2 durable memories, memory events, memory edges, ingest sources, and ingest
  segments remain semantic truth.
- Projections, capsules, graphs, retrieval packs, planner outputs, and cache
  records are derived views.
- Privacy and injection hardening may reject, quarantine, mark lower authority,
  or require review. It must not invent corrected truth.
- Proof, file-pack, eval, hook, and Memory Ops artifacts must not be ingested
  into live durable memory unless they are intentionally curated source docs.

## Required Inputs

- source type and authority
- source content hash
- source refs and segment ids
- candidate risk flags
- admission scores
- retrieval/capture seam provenance
- tool-result proof metadata
- projection/capsule freshness and conflict markers

## First Policy Targets

- external documents are evidence, not instructions
- root `USER.md` and `MEMORY.md` remain human-owned inputs, not generated
  write-back targets
- raw prompts, full transcripts, raw tool logs, secrets, and private phrases are
  never persisted as operational telemetry
- prompt-injection-looking text may become a source-ref or security finding, but
  not a standing directive
- lower-authority daily notes cannot override active directives or structural
  correction lineage without review

## Open Decisions

- exact threshold for quarantine vs reject on prompt-injection text
- whether high-risk source classes need mandatory review before projection use
- retention policy for redacted safety findings
- operator surface for blocked memory candidates
- whether privacy-risk review should run before or after admission scoring for
  each capture seam
