---
summary: "First-class batch document ingestion runner/service for model-memory."
title: "Document Ingestion Runner Service"
---

# Document Ingestion Runner Service

## Objective

Promote batch document ingestion from proof-script behavior into a first-class
clean-room operational surface.

The runner/service exists so broader ingestion does not depend on bespoke loops
hidden inside evidence scripts.

## Responsibilities

The runner/service must support:

- explicit source selection
- sequential or bounded-concurrency queueing
- durable run records
- per-source failure containment
- resumability by chunk
- operator-visible status

The runner/service must not:

- invent semantics
- weaken provenance or validation
- bypass duplicate handling or lifecycle policy
- silently drop failed sources

## Source selection

The runner/service accepts an explicit ordered source plan.

Each source entry must carry:

- stable source id
- display path or operator-facing label
- chunk membership
- raw document input
- optional project/source metadata

Source selection authority remains outside the runner. The runner executes the
declared plan; it does not decide semantic priority by itself.

## Queueing model

Queueing is structural and operational only.

Required modes:

- sequential execution
- bounded concurrency with an explicit maximum

The concurrency setting may affect throughput, but it must not change write
policy, lifecycle policy, or semantic interpretation rules.

## Durable run records

Every run must persist a durable run record that can be read after the process
exits.

The record must include at least:

- run id
- model ids used for pass 1 and pass 2
- chunk size
- concurrency setting
- per-source status
- per-source captured claim counts
- per-source write-decision counts
- per-source ignore/reject counts
- chunk-level status
- aggregate totals

Durable run records are operational state, not semantic truth.

## Failure containment

The runner/service must contain failures at the source boundary by default.

If one source fails:

- that source is marked failed in the run record
- the failure reason is preserved
- other sources in the chunk and later chunks continue when safe

Failure containment does not mean silent success. Failed sources remain visible
and auditable.

## Resumability

Resumability is chunk-oriented.

When resuming a prior run:

- already completed or failed sources may be skipped
- already completed chunks may be skipped
- pending work continues without rerunning the whole batch by default

Resuming must not create hidden semantic overrides or double-count same-source
reruns as fresh reinforcement.

## Operator-visible status

The runner/service must expose operator-visible progress events for:

- run start
- chunk start or resume
- source start
- source completion
- run completion

Operator-visible status is for inspection and control only. It is not proof
admission by itself.

## Operator tool surface

The runner/service may be exposed through an explicit OpenClaw operator/admin
tool surface.

Current tool:

- `model_memory_document_ingest`

That tool surface must:

- delegate to the real runner/service
- accept explicit source selection only
- allow explicit `runId`, `recordPath`, `chunkSize`, `maxConcurrency`, and
  `resume` controls
- allow explicit model/runtime knobs used by the runner:
  - `modelId`
  - `candidateModelId`
  - `requestTimeoutMs`
  - `requestSeed`
  - `maxWordsPerWindow`
  - optional `projectId`
- emit operator-visible status and a durable run record path

That tool surface must not:

- become a second ingestion implementation
- run as an unconstrained autonomous ingestion free-for-all
- silently take over the active memory slot

The operator tool is an admin surface, not a cutover mechanism. It must stay
explicit and constrained while `model-memory` remains parallel to the current
active memory backend.

## Interaction with write policy

The runner/service uses the normal clean-room ingestion path:

- two-pass extraction
- structural repair only
- exact-identity-first write handling
- bounded recall
- bounded collision adjudication
- lifecycle-aware writes
- active-only downstream reads by default

The runner/service must not own a parallel write path.

## Readiness role

This runner/service is the operator-facing ingestion surface for:

- population waves
- targeted validation baskets
- resumable repo-document batches
- later long-horizon ingestion monitoring

It does not by itself admit sources into audited proof. Proof admission still
depends on the accepted proof bar.
