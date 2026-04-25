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

## Remaining Implementation Details

Remaining implementation decisions:

- exact numeric thresholds for risk scoring by source class
- final config and kill-switch names

2026-04-22 Phase 2 decision lock:

- privacy and prompt-injection handling must not depend on manual review as the
  normal path
- hard-reject raw secrets, raw prompts, full transcripts, raw tool logs, and
  private phrases from durable memory and telemetry
- quarantine high-risk prompt-injection-looking text from normal retrieval,
  projections, capsules, graph expansion, planner recommendations, and skill or
  tool synthesis
- allow redacted safety findings and source refs where useful, but do not turn
  hostile or imperative external text into standing instructions
- if the operator does not review a blocked or quarantined item, the safe
  default is to keep it rejected, quarantined, expired, or inspection-only; it
  must not silently graduate into normal memory use
- heartbeat and daily review are the first operator surfaces for high-severity
  blocked items; a dedicated UI can come later if volume justifies it

2026-04-25 Phase 2 decision lock:

- default redacted safety finding retention is 90 days
- secrets, raw prompts, full transcripts, raw tool logs, and private phrases are
  hard rejects; only redacted finding metadata, safe ids, hashes, and reason
  codes may remain
- external imperative text from documents, tools, assistant answers, or
  researcher reports is evidence or a security finding, never an instruction
- soft-source admission uses the authority tiers and source profiles defined in
  [Soft-Source Ingestion And Authority](/projects/model-memory/specs/soft-source-ingestion-and-authority)
- `inspection_only` material is excluded from normal retrieval, projections,
  capsules, graph expansion, planner recommendations, skill synthesis, and tool
  synthesis

## Automatic safe-default policy

The first implementation should use automatic risk tiers.

Suggested tiers:

- `allow`
- `allow_lower_authority`
- `inspection_only`
- `quarantine`
- `reject`

`allow` and `allow_lower_authority` records may flow through normal MMV2
admission and retrieval policy when their source class permits it.

`inspection_only` records may be visible in explicit operator inspection,
security, or conflict packs, but should be excluded from normal context
injection.

`quarantine` records should retain only bounded ids, hashes, source refs,
redacted findings, and reason codes. They should not appear in normal
retrieval, projection, graph, capsule, planner, skill, or tool synthesis flows.

`reject` records should leave no active durable semantic memory. Rejection
evidence should remain bounded and redacted.

Default redacted safety finding retention is 90 days. Longer retention requires
an explicit severity-specific policy and must still exclude raw secret values,
raw prompts, full transcripts, raw tool logs, private phrases, and hostile
imperative text.

Manual review can override these outcomes only through an explicit reviewed
path. Lack of review should never promote a risky item.

## Heartbeat privacy surface

Heartbeat should surface only bounded privacy and prompt-injection summaries:

- count by risk tier
- affected source ids or hashes
- reason codes
- age
- recommended safe action

Heartbeat must not reveal raw secret values, raw prompts, full transcripts, raw
tool logs, private phrases, or hostile imperative text. If no operator action
is taken, stale quarantines should expire or remain inspection-only according
to policy.
