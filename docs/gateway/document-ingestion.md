---
summary: "Deterministic document ingestion with read-only imported roots and coverage-verified long reads"
read_when:
  - Exposing host-side docs inside the workspace
  - Reading long files where completeness matters
title: "Document Ingestion"
---

# Document ingestion

OpenClaw’s workspace is the intended file surface for agents. Long docs are not safely ingested by dumping them into terminal output and hoping the session keeps the whole result.

This design adds two explicit layers:

1. Narrow read-only imports for selected host-side document roots.
2. A deterministic `document_read` tool that fingerprints, chunks, verifies, and reports coverage before a document can be treated as fully read.

Golden rule:

- Long docs are not considered ingested until `document_read(action=verify)` reports complete coverage.
- Operational acceptance is stricter than visibility or chunk acquisition alone. A document is fully ingested only when:
  - `authoritativeState = complete`
  - `coverage.complete = true`
  - `verifiedFullHash = true`
  - `fileStillMatchesFingerprint = true`

## Scope

This system solves two problems:

- make selected host-side docs available inside the workspace without broad host filesystem access
- make long-file ingestion deterministic, resumable, auditable, and explicit about incomplete coverage

## Architecture

### Runtime topology

- Host source roots remain outside the normal workspace surface.
- Docker Compose bind-mounts selected source roots into `workspace/imports/system_docs/*` as read-only.
- Agents continue to operate through the normal workspace boundary.
- Long-document reads use `document_read`, not terminal output, as the completeness boundary.

### Imported roots

Imported roots are declared in `config/document-imports.json`.

Each entry defines:

- source env var
- source type
- workspace-visible path
- import mode
- read-only expectation

Current implementation:

- read-only bind mounts for curated roots only
- manifest + health verification written to `workspace/imports/_metadata/document-imports-manifest.json`

### Long-file ingestion pipeline

`document_read` persists session state under `workspace/.openclaw/document-read/<sessionId>/`.

For each file:

1. Fingerprint
   - workspace path
   - absolute path
   - bytes
   - lines
   - sha256
   - encoding
   - line-ending mode
   - chunking mode
   - expected chunk count
2. Chunk plan
   - line-based chunks by default for text-like files
   - byte-based fallback for non-UTF8 data or pathological line lengths
   - deterministic indexes with no gaps and no overlap
3. Read
   - bounded chunk acquisition only
   - per-chunk metadata and persisted progress
4. Verify
   - first chunk starts at file start
   - last chunk ends at file end
   - expected count equals acquired count
   - ranges are contiguous
   - final fingerprint still matches
5. Result
   - `complete`
   - `incomplete`
   - explicit stale or mismatch failure

## Why bind-mount imports won

### Direct read-only bind mount

- Security: narrow and explicit
- Reliability: no copy drift
- Freshness: immediate
- Operational simplicity: high
- Compatibility: strong for runtime-visible workspace reads

### Mirror or sync job

- Security: acceptable if read-only destination is enforced
- Reliability: weaker because sync lag and partial-update races become part of the design
- Freshness: eventually consistent, not immediate
- Operational simplicity: lower
- Compatibility: good, but more moving parts

### Symlink-only approach

- Security: weaker because realpath handling and sandbox assumptions become ambiguous
- Reliability: depends on tool and runtime symlink semantics
- Freshness: immediate
- Operational simplicity: looks simple, but creates audit ambiguity
- Compatibility: not trusted enough for the canonical path

### Hybrid manifest + mirror

- Security: acceptable
- Reliability: better than ad hoc sync, still more race-prone than bind mounts
- Freshness: delayed
- Operational simplicity: medium
- Compatibility: good

Chosen design:

- read-only bind mount for live imported roots
- explicit manifest and health verification for auditability

## Coverage model

`document_read` exposes:

- `start`
- `next`
- `chunk`
- `status`
- `verify`
- `cleanup`

Expected operator or agent flow:

1. `start`
2. `next` until no chunks are missing
3. `verify`
4. treat the document as complete only if `verify` says `complete`

Partial reads are never silently upgraded to complete.

### Accepted state model

Current operator-facing `document_read` state meanings are:

- `in_progress`
  - the read session exists, but one or more chunks are still missing
- `ready_to_verify`
  - all expected chunks were acquired, but final verification has not run yet
- `complete`
  - verification passed and the document is accepted as fully ingested
- `incomplete`
  - the session is explicitly incomplete and must not be treated as a full read
- `failed`
  - the session hit an explicit error and must be restarted or repaired

Operator rule:

- `ready_to_verify` is not a full read
- `allChunksAcquired = true` is not a full read
- only `complete` plus `coverage.complete = true` is a full read

### Required operator fields

When verifying an important read, always inspect:

- `authoritativeState`
- `expectedChunkCount`
- `acquiredChunkCount`
- `missingChunkIndexes`
- `coverage.complete`
- `verifiedFullHash`
- `fileStillMatchesFingerprint`

## Reliability risks and mitigations

| Risk                                     | Failure mode                                             | Mitigation                                                                       | Residual risk                                                                  |
| ---------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Tool output truncation                   | first response is incomplete but looks usable            | `document_read` persists chunk state and coverage outside terminal output        | operators still need to read the coverage result, not just the first chunk     |
| Session context truncation               | earlier chunks disappear from context                    | chunk state lives on disk under workspace metadata                               | summaries still need disciplined prompting                                     |
| Partial retry confusion                  | missing chunks get mistaken for complete coverage        | explicit missing-chunk tracking and `verify` gate                                | none if operators honor `verify`                                               |
| File changes during read                 | chunks from different file versions mix                  | fingerprint checks on read and verify                                            | files that change repeatedly need a restartable workflow                       |
| Path mismatch between host and container | host placeholder path differs from imported runtime view | import manifest records both host placeholder and runtime-visible path           | operators must use runtime-visible path as source of truth                     |
| Prompt injection inside docs             | doc text overrides operator policy                       | system prompt now says coverage verification is required before full-read claims | prompt injection inside content is still content; treat docs as untrusted text |
| Very large or non-UTF8 files             | line reads become unsafe or expensive                    | byte mode fallback and max file limit                                            | files above configured max must be handled outside this path                   |
| Long single lines                        | line chunking creates huge chunks                        | max-line-bytes threshold triggers byte mode                                      | large binary-like text still needs operator judgment                           |
| Read-only drift                          | imported root becomes writable                           | verifier attempts runtime write and expects failure                              | host-side mount config must still be preserved across restarts                 |
| Restart behavior                         | sessions become ambiguous after restart                  | persisted plan and coverage files allow explicit status/verify after restart     | in-progress sessions may need cleanup if source changed                        |

## Artifacts

- Import config: `config/document-imports.json`
- Import verifier: `scripts/document-imports-verify.ts`
- Proof harness: `scripts/document-ingestion-proof.ts`
- Read tool: `src/agents/tools/document-read-tool.ts`
- Session engine: `src/agents/document-read.ts`
- Agent guidance: `AGENTS.md`

## Accepted baseline and archival model

The accepted production baseline keeps the live runtime tree intentionally narrow:

- live import state remains in `workspace/imports/**`
- active or newly created `document_read` sessions live in `workspace/.openclaw/document-read/**`
- acceptance fixtures live in `workspace/.openclaw/document-ingestion-proof/fixtures/**`

Historical session directories and superseded proof reports should not remain mixed with the accepted baseline indefinitely. Archive them into an operator-owned backup location so old status semantics or duplicate reports do not mislead future operators.

If you are auditing an accepted-baseline freeze:

- trust the archived acceptance session and its coverage report
- do not trust older pre-fix sessions as the canonical source of truth
- prefer the latest accepted baseline freeze under `/root/backups/document-ingestion-accepted-baseline-*`

## Operator rules

- Do not rely on terminal preview for long-doc completeness.
- Do not treat a partial chunk sequence as a completed read.
- Use the runtime-visible imported path, not the host placeholder path, when auditing bind-mounted file imports.
- If `verify` reports `incomplete` or `stale`, stop and fix the missing or changed chunks first.
- If older session artifacts disagree with the current operator model, trust the current run’s `authoritativeState` and coverage fields, not the stale artifact.

## Runbook

For operational steps, proof commands, troubleshooting, and rollback, see [Document Ingestion Runbook](/gateway/document-ingestion-runbook).
