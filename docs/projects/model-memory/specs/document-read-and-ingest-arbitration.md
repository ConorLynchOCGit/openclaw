---
summary: "Implemented first-cut arbitration between long-document reading and document ingest."
title: "Document Read And Ingest Arbitration"
---

# Document Read And Ingest Arbitration

## Goal

Make long-document access feel like one capability to the user even when the
system has both a paginated reader path and a document-ingest path behind the
scenes.

## Status

State: `implemented_first_cut`

The repo now has a bounded runtime implementation behind this spec:

- `read` remains the foreground answer path
- host-side workspace text reads can auto-schedule background
  `model_memory_document_ingest`
- duplicate auto-ingest requests converge onto one deterministic run record
- the read result now carries a non-user-facing `documentArbitration` details
  record for traceability

This is intentionally a narrow first cut, not the final queue-backed
arbitration system.

## Single user-facing behavior

The user asks one thing:

- read this document
- summarize this paper
- answer questions from this PDF
- ingest this doc for later use

The system should decide the internal path automatically instead of forcing the
user to pick a tool.

## Arbitration rule

Default rule:

- use the paginated reader first for immediate answerability
- trigger ingest only when there is clear value beyond the current answer

That means:

- immediate one-shot reading stays fast and low-side-effect
- ingest becomes a background durability optimization, not the first user
  decision

## Current implemented decision contract

The live implementation currently auto-schedules ingest only for the safest,
observable cases:

- capped read output:
  - the read wrapper aggregated enough text to hit its output cap
- continued read:
  - the caller is already reading with `offset > 1`
- repeated read:
  - the same workspace-relative file is read again in the same live tool set

If none of those are true, the outcome stays `read_only`.

## Current scope boundaries

The current implementation only applies to:

- host-side reads, not sandboxed reads
- files inside the active workspace root
- likely text documents only
- the live `model_memory_document_ingest` tool when that tool is present and
  allowed

The current implementation does not yet attempt to auto-ingest:

- images
- PDFs or binary files
- files outside the workspace root
- cases where the model-memory ingest tool is not active

## How the system decides

### Read-only path

Use the paginated reader only when:

- the user is asking for a one-off answer
- the document is unlikely to matter after the current turn
- the content is short enough to answer without durable retention
- the document is sensitive or ephemeral and durable ingest is not justified

### Ingest-assisted path

Trigger ingest automatically when one or more of these are true:

- the document is large enough that repeated paginated reads would be wasteful
- the user asks for follow-up work that implies durable reuse
- the document is likely to become a recurring source for the current project
- the system detects multiple queries against the same document in one session
- the user explicitly asks to remember, package, or reuse the document later

### Ingest suppression

Do not auto-ingest when:

- the document is obviously transient
- the user asks for a quick read and nothing more
- privacy policy or source classification says the content should remain
  session-local
- a recent ingest fingerprint already exists and no new chunks would be added

## Dedupe model

Use one document identity record keyed by:

- normalized source URI or file path when stable
- content hash for the fetched bytes
- ingest profile or privacy scope when that changes retention semantics

Current implementation detail:

- the first-cut runtime uses a deterministic stat-backed fingerprint:
  - workspace-relative path
  - file size
  - file mtime
- the auto-ingest run id is deterministic per fingerprint
- the durable run record path is deterministic under:
  - `checkpoints/model-memory/auto-read-ingest/`

If the reader touches a document that already has a current ingest record:

- reuse that record for chunk lookup and answer grounding
- do not re-ingest unless the content hash changed

If ingest starts after a read:

- reuse the already fetched bytes and pagination metadata
- do not fetch the document a second time unless the source changed

## Pagination, chunking, and caching

- the paginated reader remains the front-end answer path
- ingest reuses reader page boundaries only as hints, not as the canonical
  semantic chunking rule
- cache fetched document bytes for a short TTL so read and ingest can share the
  same payload
- cache the document fingerprint and last-ingest decision so repeated prompts do
  not keep re-evaluating the same file

Current implementation detail:

- the first cut only implements the fingerprint/decision cache
- it does not yet reuse already fetched bytes from the read call
- the ingest tool still re-reads the source document from disk

## Interaction with model-memory

- document ingest is not the same thing as conversational `model-memory`
- `model-memory` should store higher-value derived facts, procedures, or
  retrieval pointers, not duplicate every raw document chunk
- a document ingest may emit a durable retrieval pointer into memory, but raw
  document storage and memory projection should stay separate

## User control

The user should still be able to override behavior, but only as an override:

- `read only`
- `ingest for later`
- `do not retain this`

That preserves explicit control without making routine document work depend on
tool selection.

## Telemetry and traceability

Each document access should record:

- arbitration outcome: `read_only`, `read_then_ingest`, `ingest_only`,
  `reuse_existing_ingest`
- document identity fingerprint
- whether bytes were reused from cache
- whether ingest was skipped and why
- whether memory projection was emitted and why

This is enough to debug overlap without exposing the user to internal tool
choices.

Current implementation detail:

- the read tool writes `details.documentArbitration` with:
  - `outcome`
  - `workspaceRelativePath`
  - `fingerprint`
  - `triggers`
  - `ingestStatus`
  - `runId`
  - `recordPath`
  - `projectId` when derivable from `docs/projects/<id>/...`

## Safe migration path

1. add an arbitration layer ahead of the current reader and ingest paths
2. keep both underlying implementations intact initially
3. emit trace logs for arbitration decisions before changing defaults broadly
4. turn on automatic `read_then_ingest` only for clearly repetitive or
   large-document cases first
5. collapse legacy duplicate calls after the arbitration layer has stable
   telemetry

## Remaining follow-on work

- move from stat-backed fingerprints to content-backed document identity
- reuse already fetched bytes between read and ingest instead of re-reading from
  disk
- support queue-backed background execution instead of in-process detached work
- extend arbitration beyond workspace text reads where the retention semantics
  are safe and explicit
