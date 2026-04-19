---
summary: "Top-level MMV2 ingestion draft principles and phase map."
title: "MMV2 Overview And Design Principles"
---

# MMV2 Overview And Design Principles

## Purpose

Capture the proposed ingestion v2 redesign before implementation so the repo has
a durable technical specification instead of relying on the pasted conversation.

This proposal is document-ingestion-first, but it is designed to become the
shared ingestion pathway for ordinary turns later if the draft survives
comparison and implementation review.

## Proposed ontology

Atomic kinds:

- `claim`
- `directive`
- `source_ref`
- `episode`

Composite artifact types:

- `procedure`
- `checklist`
- `profile`
- `project_state`
- `decision_record`
- `source_bundle`
- `lesson_pack`

## Core semantic shifts from live v1

- `user_preference` is no longer a top-level kind
- descriptive preferences become `claim` records, typically
  `claim_type = preference_state`
- operational preferences can additionally derive a `directive` when the future
  behavior is unambiguous
- `procedure` is no longer an atomic kind
- multi-step procedures become composite artifacts with embedded components and
  explicit promotion rules

## Design stance preserved from the GPT draft

- Nano proposes structured candidates
- deterministic code validates, repairs, dedupes, reconciles, and records
- span evidence is mandatory
- composite-first routing prevents procedure leakage into standalone memories
- scope should default narrow rather than global
- sensitive material must be quarantined or blocked

## Phase structure

0. raw ingestion envelope
1. deterministic preprocessing and span segmentation
2. Nano capture routing
3. Nano atomic extraction
4. Nano composite extraction
5. canonicalization
6. admission scoring
7. reconciliation
8. recording
9. post-write validation and quarantine

Repo note:

- the GPT draft numbers the operational pipeline from Step 0 through Step 8,
  but the narrative overview also describes nine stages including post-write
  audit
- this pack keeps the GPT phase numbering style in titles while still treating
  post-write audit as the terminal phase

## Cross-cutting invariants

1. No evidence, no memory.
2. No exact source span, no durable write.
3. Procedure and list blocks route before atomic extraction.
4. Procedure steps default to `embedded_only`.
5. `user_preference` never appears as a top-level kind.
6. Descriptive preference and prescriptive directive stay distinct.
7. Derived directives must be soft and linked to a source claim.
8. Scope defaults narrow.
9. Sensitive or credential-like content cannot become active durable memory.
10. Active memories must reconcile against neighbors before write.
11. Superseded memories remain in history but not standard retrieval.
12. Conflicted memories are not silently injected.
13. Nano proposes; deterministic code disposes.

## Document-ingest-first boundary

This draft pack should be read with the following execution boundary:

- first implementation target: document ingestion
- first evaluation target: document corpus and ingest replay
- ordinary-turn adoption is deferred until the document-first contract survives
  comparison, proof corpus review, and shadow-lane validation
