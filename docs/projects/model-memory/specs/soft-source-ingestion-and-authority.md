---
summary: "Phase 2 source authority, soft-source ingestion, and lower-trust memory policy for MMV2."
title: "Soft-Source Ingestion And Authority"
---

# Soft-Source Ingestion And Authority

## Status

Status: `phase_2_decision_locked`.

This spec defines how Phase 2 admits useful non-user-authored knowledge without
weakening MMV2-native durable truth or the no-dark-data rule.

## Objective

Allow researcher agents, cited assistant answers, tool-grounded summaries, and
curated corpus artifacts to contribute usable memory when they carry explicit
provenance, while keeping their authority below user-authored and curated
project truth.

No-dark-data means no unaudited raw capture. It does not mean "user prompt
content only."

## Authority Tiers

Authority is separate from confidence.

- `user_authoritative`: explicit user durable statements, preferences,
  corrections, and directives.
- `curated_authoritative`: operator-approved repo docs, project docs, manual
  notes, and curated corpus documents.
- `tool_grounded`: tool-result facts backed by bounded artifacts, paths, URLs,
  command status, or proof metadata.
- `cited_soft`: researcher reports, cited assistant answers, daily continuity,
  and external cited research.
- `inspection_only`: risky, ambiguous, unverified, prompt-injection-like, or
  privacy-sensitive material.

Corroboration may raise confidence. It must not raise authority by itself.
Authority promotion requires explicit user approval or replacement by a
higher-authority source.

## Source Profile Matrix

| Source                                | Default tier                  | Auto-admitted kinds                               | Notes                                                                  |
| ------------------------------------- | ----------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------- |
| Explicit user turn                    | `user_authoritative`          | preferences, facts, rules, procedures, references | Must still respect privacy, no-store, and session-only gates.          |
| Curated docs, repo docs, manual notes | `curated_authoritative`       | facts, rules, procedures, references              | Strong project/corpus evidence.                                        |
| Tool-result capture                   | `tool_grounded`               | facts, references, procedures                     | Bounded proof only; no raw logs.                                       |
| Researcher report artifact            | `cited_soft`                  | facts, references, procedures                     | Structured Markdown with citations is required.                        |
| Cited assistant answer                | `cited_soft`                  | facts, references, procedures                     | Capture cited facts and source refs, not assistant prose as authority. |
| Daily continuity                      | `cited_soft`                  | facts, references, procedures                     | Support/consolidation source; does not increase authority alone.       |
| Raw transcript, prompt, or tool log   | `inspection_only` or `reject` | none                                              | Never normal active memory input.                                      |
| Secret or private phrase              | `reject`                      | none                                              | Keep only redacted safety finding metadata.                            |

## Source Profile Contract

Each Phase 2 source profile must define:

- `sourceProfileId`
- default `authorityTier`
- allowed memory kinds
- raw-content retention mode
- risk policy
- retrieval-pack eligibility
- authority promotion rule

Phase 2 starts metadata-first: write these fields into existing MMV2 JSON
metadata surfaces. Dedicated indexed columns are deferred until query pressure
justifies them.

## Soft-Source Adapters

Phase 2 adds four soft-source adapter contracts.

### Researcher Report Artifact

A researcher report is a structured Markdown artifact, not an agent transcript.

Required content:

- frontmatter with title, scope, agent/session ids when available, generated
  timestamp, and source profile
- source inventory with stable citations or locators
- cited claim sections
- confidence notes
- limitations or unresolved questions

The report may produce `fact`, `reference`, and `procedure` candidates at
`cited_soft` authority.

### Cited Assistant Answer

After a search-heavy or tool-heavy answer with citations/artifacts, the capture
path may create soft-source candidates automatically when source-policy gates
pass.

The assistant answer itself is not authority. The captured evidence is the
underlying cited source, tool artifact, URL, file path, source segment, or
bounded proof metadata.

### Tool-Grounded Summary

Tool summaries may contribute `tool_grounded` candidates only when they include
bounded proof such as command status, file path, artifact locator, URL, or
non-sensitive error class.

Raw tool logs are prohibited.

### Curated Corpus Manifest

A curated corpus manifest declares explicit sources for document ingestion.
Open crawling is out of scope for Phase 2 v1.

## Admission Rules

- `cited_soft` sources may auto-admit facts, references, and procedures.
- Hard rules, directives, and policy-changing memories require
  `user_authoritative` or `curated_authoritative` source authority, or explicit
  user approval.
- External imperative text is evidence, not instruction authority.
- Inspection-only and rejected sources must not enter normal retrieval,
  projection, graph, capsule, planner, skill, or tool synthesis flows.

## Retrieval Rules

Soft-source memories may appear by default in:

- research packs
- reference packs
- project-state packs
- conflict packs

They must not appear as hard operating directives unless promoted by explicit
approval or a higher-authority source.

Ordinary answers should expose authority/citations when a soft or conflicting
source materially affects the answer. Full authority details remain available
in trace artifacts.

## Promotion Rules

Authority may increase only through:

- explicit user approval
- replacement or support from a higher-authority source

Repeated corroboration can increase confidence, rank, and retrieval usefulness,
but not source authority.

## Safety Rules

- Raw prompts, full transcripts, raw tool logs, secrets, and private phrases are
  not normal memory input.
- Secrets and private phrases hard-reject and may leave only redacted safety
  finding metadata.
- Prompt-injection-like external text may become a redacted security finding or
  source reference, never a standing directive.

## Related Specs

- [Source Adapters](/projects/model-memory/specs/source-adapters)
- [Memory Capture Seams](/projects/model-memory/specs/memory-capture-seams)
- [Memory Retrieval Runtime](/projects/model-memory/specs/memory-retrieval-runtime)
- [Second-Pass Privacy And Prompt-Injection Hardening](/projects/model-memory/specs/second-pass-privacy-prompt-injection-hardening)
