---
summary: "Roadmap specification for future MMV2-native memory capture seams."
title: "Memory Capture Seams"
---

# Memory Capture Seams

## Status

This is now both a roadmap/spec document and a partial implementation record.

MMV2-native SQL storage is already live semantic truth. Active write and read
hot paths now use MMV2-native contracts by default. This spec defines the next
capture seams that should feed that MMV2-native truth after the current
soak-window compatibility posture is retired.

Legacy compatibility remains fallback-only for the soak window. New capture
work should not create new legacy-shaped write contracts.

## Objective

Broaden memory capture so important user inputs, tool-grounded outcomes,
bootstrap-file changes, and completed turn deltas enter the MMV2-native memory
pipeline through explicit, testable seams.

The goal is not to capture everything.

The goal is to capture evidence-bearing, durable, user-useful memory candidates
with clear provenance and authority.

## Global Rules

- Primary memory writes must land in MMV2-native durable storage.
- Capture seams must preserve source authority and provenance.
- Assistant text is lower authority unless grounded in user or tool evidence.
- Tool and file signals should prefer normalized summaries, ids, hashes, and
  locators over raw logs.
- Raw unbounded transcripts, prompt bodies, and tool logs must not become
  durable memory input by default.
- Hooks that are not verified in the current OpenClaw version must be treated
  as `needs_repo_verification` before implementation.
- Fallback hooks may assist recovery but must not silently become the primary
  semantic contract.
- Every wired seam must remain behind both the global
  `MODEL_MEMORY_CAPTURE_SEAMS_ENABLED` kill switch and its seam-specific env
  switch. The default posture is disabled unless explicitly enabled for
  bounded evidence collection.

2026-04-23 implementation posture:

- active seams default on only when the global kill switch is enabled and the
  seam-specific switch is not explicitly off
- fallback-only seams remain disabled unless explicitly enabled
- all seam evidence and activity records store safe ids, hashes, counts,
  statuses, and classes only
- active seams route through the shared MMV2 capture/ingest contracts and
  capture-job/activity metadata surfaces
- shared ingestion closeout reports now provide the common end-of-run contract
  for seam proof: safe source/job/event ids, candidate counts, quarantine
  counts, failure classes, provider/schema labels, dirty-state result, and
  no-dark-data scan status
- cross-seam dedupe keys are deterministic and no active seam stores raw
  prompts, full transcripts, raw tool logs, secrets, or private phrases
- ordinary-turn capture now treats durable user preferences/directives about
  assistant operating behavior as admissible when they are general, safe, and
  not privacy/no-store/session-only; examples include instructions to inspect
  discoverable tool/schema/log blockers and continue when a safe path exists
- tool-result capture may admit bounded operational blocker facts such as
  permission denied, read-only path, host-operator schema failure, dirty-state
  EACCES, route/config/tool availability, or pool pressure, but only as
  tool/action/error-class/path-category/remediation summaries with bounded
  evidence ids/hashes
- cited assistant answers may create soft-source memory candidates after
  search-heavy or tool-heavy turns, but only when citations, source refs, or
  tool artifacts are present; assistant prose is never authority by itself

## 2026-04-23 Activation Record

Current policy is encoded in `src/agents/model-memory.capture-seams.ts`.
Fresh proof is recorded at
`.artifacts/model-memory/capture-seams/2026-04-23/capture-seams-live-proof.json`.

Active when global capture seams are enabled:

- `message:preprocessed`
- `ContextEngine.ingest`
- `ContextEngine.ingestBatch`
- `tool_result_persist`
- `after_tool_call`
- `agent_end`
- `ContextEngine.afterTurn`
- `agent:bootstrap`
- `memory_file_import`

Fallback-only unless explicitly enabled:

- `message:received`
- `message:transcribed`

Generic file-change watcher seams remain blocked unless a production
file-change firing surface is later proven. The production bootstrap and
memory-file import paths are active through explicit hash-gated import seams,
not through unbounded file watchers.

The latest Memory Ops hook discovery artifact marks `message:preprocessed`,
`ContextEngine.ingest`, `ContextEngine.ingestBatch`, `ContextEngine.assemble`,
`tool_result_persist`, `after_tool_call`, `agent_end`,
`ContextEngine.afterTurn`, `agent:bootstrap`, and `memory_file_import` as
production-verified. `ContextEngine.assemble` remains retrieval/injection
telemetry only unless a separate write-safe design is approved. Synthetic or
fallback hooks are not promoted to primary capture.

## Verification Status Values

- `verified`: the hook exists and firing behavior has been proven in the live
  repo/runtime.
- `needs_repo_verification`: the hook is a target but must be inspected or
  smoke-tested before implementation.
- `fallback_only`: the hook may recover misses but should not be primary.
- `future`: the seam is a roadmap target that may require repo support or
  lifecycle additions.

## Target Seam Matrix

| Seam                                       | Status          | Primary Role                            | Feeds                                                      |
| ------------------------------------------ | --------------- | --------------------------------------- | ---------------------------------------------------------- |
| `message:preprocessed`                     | `verified`      | Primary user-input capture              | Primary memory capture                                     |
| `message:received`                         | `fallback_only` | Raw user-message fallback               | Primary memory capture only if later seam missing          |
| `message:transcribed`                      | `fallback_only` | Voice/media fallback                    | Primary memory capture only if no later preprocessed event |
| `ContextEngine.ingest()` / `ingestBatch()` | `verified`      | Catchall and batch user-message capture | Primary capture plus closed-loop indexing                  |
| `tool_result_persist`                      | `verified`      | Tool-derived facts and proof            | Primary capture plus provenance                            |
| `after_tool_call`                          | `verified`      | Normalized tool-result lane if it fires | Primary capture plus provenance                            |
| `agent_end`                                | `verified`      | Final task outcome capture              | Primary capture with lower assistant authority             |
| `ContextEngine.afterTurn()`                | `verified`      | Completed turn delta capture            | Primary capture and session summary                        |
| cited assistant answer                     | `future`        | Cited soft-source capture               | Lower-authority facts, references, and procedures          |
| `agent:bootstrap` plus bootstrap files     | `verified`      | Standing rules and bootstrap imports    | Hash-gated import on first import or hash change           |
| Changed memory files                       | `verified`      | Curated memory and daily-note imports   | Hash-gated memory-file import                              |

## `message:preprocessed`

Source/hook name:

- `message:preprocessed`

Verification status:

- `needs_repo_verification`

Semantic authority:

- high for explicit user statements
- medium for inferred context inside enriched message body

Allowed memory classes:

- explicit user preferences
- explicit user directives
- project facts supplied by the user
- durable constraints
- corrections and supersession cues
- durable source references when the user provides or confirms them

Prohibited memory classes:

- assistant/tool/system claims
- inferred hidden intent
- transient conversational filler
- session-only instructions unless explicitly durable

Required evidence/provenance:

- message id if available
- session id/key
- user id/workspace/project scope where available
- `context.bodyForAgent` hash
- source hook name and observed timestamp

Dedupe/reconciliation requirements:

- dedupe against later `ContextEngine.ingest()` records for the same content
  hash
- preserve correction wording so reconciliation can supersede or scope-narrow
  prior memories
- avoid double capture when `message:received` or `message:transcribed` also
  observed the same message

Privacy constraints:

- do not persist full raw text outside the primary MMV2 evidence path
- use hashes and bounded evidence quotes for diagnostics

Feeds:

- primary memory capture

Implementation risks:

- hook may not exist or may fire before media/link enrichment in the current
  runtime
- dedupe must handle multi-channel message normalization

First safe test:

- submit one explicit durable user preference and verify one MMV2 candidate or
  durable memory with `message:preprocessed` provenance

## `message:received`

Source/hook name:

- `message:received`

Verification status:

- `fallback_only`

Semantic authority:

- high for explicit user text, but lower capture priority than
  `message:preprocessed`

Allowed memory classes:

- same classes as `message:preprocessed`, only when no later preprocessed event
  exists in the dedupe window

Prohibited memory classes:

- same as `message:preprocessed`
- any media/link-derived claims not yet processed

Required evidence/provenance:

- raw message id
- channel
- content hash
- fallback reason

Dedupe/reconciliation requirements:

- must be superseded by a matching `message:preprocessed` event when present

Privacy constraints:

- do not preserve raw content unless admitted into MMV2 evidence

Feeds:

- primary memory capture fallback only

Implementation risks:

- early hook may miss enrichment, transcriptions, or link context

First safe test:

- force a synthetic path where no preprocessed event is available and verify
  exactly one fallback candidate

## `message:transcribed`

Source/hook name:

- `message:transcribed`

Verification status:

- `fallback_only`

Semantic authority:

- high when transcription is user-authored, with transcription confidence noted

Allowed memory classes:

- explicit user preferences/directives/facts from the transcript

Prohibited memory classes:

- low-confidence transcript fragments
- inferred speaker intent
- transcript text later replaced by preprocessed message content

Required evidence/provenance:

- transcription id if available
- transcript content hash
- confidence metadata if available
- linked media id if available

Dedupe/reconciliation requirements:

- dedupe against `message:preprocessed`
- retain transcription confidence in evidence metadata

Privacy constraints:

- do not store raw audio or unbounded transcript outside admitted evidence

Feeds:

- primary memory capture fallback only

Implementation risks:

- can duplicate later enriched user input
- confidence metadata may not be uniformly available

First safe test:

- transcribe one explicit user preference and verify fallback capture only when
  no later preprocessed event appears

## `ContextEngine.ingest()` / `ContextEngine.ingestBatch()`

Source/hook name:

- `ContextEngine.ingest()`
- `ContextEngine.ingestBatch()`

Verification status:

- `needs_repo_verification`

Semantic authority:

- high for `role=user`
- defer assistant/tool/system roles to outcome or ops instrumentation lanes

Allowed memory classes:

- user preferences
- user directives
- user-supplied project facts
- explicit corrections
- durable constraints
- batch turn capture of user-authored memory candidates

Prohibited memory classes:

- assistant/tool/system roles in this phase
- compaction summaries as primary evidence
- raw full conversation capture

Required evidence/provenance:

- session id/key
- message index/range
- role
- normalized content hash
- linked primary capture event id where available

Dedupe/reconciliation requirements:

- catch messages that bypass channel hooks
- dedupe against `message:preprocessed`
- support batch flush before compaction/session boundaries

Privacy constraints:

- closed-loop indexing should store hash/index/role by default, not content

Feeds:

- primary capture for `role=user`
- closed-loop ops indexing for coverage and flush safety

Implementation risks:

- ingest may receive already-normalized or partial messages
- batch boundaries must not create duplicate memory candidates

First safe test:

- inject a user-role message through ContextEngine without channel hooks and
  verify one MMV2 candidate plus one ingest-index signal

## `tool_result_persist`

Source/hook name:

- `tool_result_persist`

Verification status:

- `needs_repo_verification`

Semantic authority:

- high for observed tool outcomes, file paths, URLs, artifacts, command
  results, and failure causes

Allowed memory classes:

- tool-grounded source references
- generated artifact references
- command outcome facts
- file/document path facts
- failure causes useful for future runs
- procedure evidence when tied to a completed workflow

Prohibited memory classes:

- raw unbounded logs
- secrets
- assistant claims not reflected in the tool result
- transient progress chatter

Required evidence/provenance:

- tool call id
- tool name
- success/error status
- result hash
- bounded redacted summary
- artifact locators

Dedupe/reconciliation requirements:

- attach repeated tool evidence to existing memories when non-additive
- reconcile failure evidence against assistant outcome claims
- dedupe identical artifact locators and file hashes

Privacy constraints:

- redact secrets
- never persist raw tool logs by default

Feeds:

- primary capture for candidate-worthy tool facts
- closed-loop provenance attachment and admission gates

Implementation risks:

- recent reports suggest this hook may register but not fire in some embedded
  agent paths
- hook health checks and fallback recovery are mandatory

First safe test:

- create a unique file via a tool call and verify one source-ref/proof-backed
  MMV2 record or provenance attachment

## `after_tool_call`

Source/hook name:

- `after_tool_call`

Verification status:

- `needs_repo_verification`

Semantic authority:

- high for normalized tool results if the hook reliably fires

Allowed memory classes:

- same as `tool_result_persist`, using normalized bounded results

Prohibited memory classes:

- raw logs
- unbounded stdout/stderr
- secrets

Required evidence/provenance:

- tool call id
- normalized result hash
- tool success/error
- bounded result label

Dedupe/reconciliation requirements:

- dedupe with `tool_result_persist`
- if both fire, one should be primary and the other should attach proof only

Privacy constraints:

- do not store raw results unless already admitted as primary evidence

Feeds:

- primary capture if reliable
- closed-loop provenance if secondary

Implementation risks:

- may not fire consistently in current embedded-agent paths

First safe test:

- run a harmless tool call and verify hook firing and dedupe with
  `tool_result_persist`

## `agent_end`

Source/hook name:

- `agent_end`

Verification status:

- `needs_repo_verification`

Semantic authority:

- medium for final outcomes
- low for assistant-only claims without user/tool grounding

Allowed memory classes:

- task completed/failed outcome facts
- decisions reached
- generated artifact references
- durable commitments
- reconciled turn summaries

Prohibited memory classes:

- unsupported assistant self-reporting
- private chain-of-thought
- ungrounded claims about external state
- raw final answer text as durable memory

Required evidence/provenance:

- run/session id
- linked user message ids
- linked tool proof ids
- final outcome hash or bounded label

Dedupe/reconciliation requirements:

- outcome memories require grounding in user/tool evidence
- contradictions between final answer and tool proof should quarantine or lower
  confidence

Privacy constraints:

- store bounded outcome labels, not full assistant text

Feeds:

- primary capture for grounded outcome candidates

Implementation risks:

- assistant finals can overclaim success
- must not turn every final answer into memory

First safe test:

- complete a simple file-producing task and verify the final outcome memory is
  admitted only when tool proof exists

## `ContextEngine.afterTurn()`

Source/hook name:

- `ContextEngine.afterTurn()`

Verification status:

- `needs_repo_verification`

Semantic authority:

- medium for completed turn deltas
- inherits authority from linked user/tool evidence

Allowed memory classes:

- completed turn summaries
- decisions reached
- final grounded outcomes
- unresolved follow-up commitments

Prohibited memory classes:

- intermediate assistant fragments
- raw full turn transcripts
- ungrounded assistant-only claims

Required evidence/provenance:

- turn id or session/run id
- linked context-ingest indexes
- linked tool proof ids
- after-turn delta hash

Dedupe/reconciliation requirements:

- dedupe with `agent_end`
- use as cleaner outcome lane when ContextEngine wraps the session

Privacy constraints:

- store completed-turn delta summaries only when admitted; diagnostics should
  use hashes and ids

Feeds:

- primary capture for grounded outcomes
- closed-loop session safety summaries

Implementation risks:

- lifecycle ordering must ensure tool results and final user-visible output are
  available

First safe test:

- run one completed turn with a user instruction and tool outcome; verify one
  after-turn delta and no intermediate assistant-fragment capture

## Cited Assistant Answers

Source/hook name:

- cited assistant answer

Verification status:

- `future`

Semantic authority:

- `cited_soft` when the answer includes citations, source refs, or bounded tool
  artifacts
- none for uncited assistant prose

Allowed memory classes:

- facts
- references
- procedures

Prohibited memory classes:

- hard directives
- user preferences
- project policy changes
- standing rules unless later approved by the user or backed by a
  curated-authoritative source

Required evidence/provenance:

- session id or trace id when available
- cited source ids, URLs, file paths, source segments, or artifact locators
- source profile id
- authority tier

Privacy constraints:

- do not persist raw prompts, full transcripts, or raw tool logs
- reject or quarantine secrets, private phrases, and prompt-injection-looking
  external imperatives according to the soft-source authority policy

Feeds:

- soft-source ingestion and authority-aware retrieval

## `agent:bootstrap` Plus Bootstrap Files

Source/hook name:

- `agent:bootstrap`
- changed bootstrap files

Verification status:

- `needs_repo_verification`

Semantic authority:

- high for repo/workspace-authored standing rules and profiles
- scope-bound to the workspace/agent/file authority

Allowed memory classes:

- durable standing rules
- user/profile facts
- tool procedures
- operational runbooks
- existing curated memory imports

Prohibited memory classes:

- raw whole-file duplication
- volatile generated bootstrap cache
- stale session snapshots when canonical files exist

Required evidence/provenance:

- bootstrap file basename
- file path
- content hash
- first-import or changed-hash marker
- heading/line ranges when available
- `context.bootstrapFiles` if verified

Dedupe/reconciliation requirements:

- import only on first import or content-hash change
- reconcile changed standing rules against prior file-derived memories
- preserve file authority and scope

Privacy constraints:

- do not expose private bootstrap content in diagnostics beyond ids, hashes,
  paths, and bounded evidence quotes

Feeds:

- primary capture/import

Implementation risks:

- actual `agent:bootstrap` payload shape and recognized basenames must be
  verified before implementation
- generated and curated bootstrap surfaces must stay separated

First safe test:

- change a harmless test bootstrap file in a non-production fixture and verify
  hash-gated import with line provenance

Recognized target basenames:

- `AGENTS.md`
- `USER.md`
- `TOOLS.md`
- `HEARTBEAT.md`
- `BOOTSTRAP.md`
- `SOUL.md`
- `IDENTITY.md`
- `MEMORY.md`

## Changed Memory Files

Source/hook name:

- changed memory files

Verification status:

- `needs_repo_verification`

Semantic authority:

- high for curated `MEMORY.md`
- medium for daily notes until reviewed/promoted
- review/consolidation authority for `DREAMS.md` if present

Allowed memory classes:

- durable facts/preferences/decisions from `MEMORY.md`
- running context and continuity from `memory/YYYY-MM-DD.md`
- review/consolidation candidates from `DREAMS.md`

Prohibited memory classes:

- raw whole-file replay as durable truth
- duplicate imports when hash unchanged
- generated projection artifacts treated as curated source

Required evidence/provenance:

- file path
- basename
- content hash
- previous hash
- changed boolean
- heading/line ranges where available

Dedupe/reconciliation requirements:

- import only on hash change
- reconcile durable `MEMORY.md` updates against prior file-derived memories
- keep daily notes lower authority unless explicitly promoted

Privacy constraints:

- diagnostics should use paths, hashes, ids, and bounded labels, not full file
  content

Feeds:

- primary capture/import

Implementation risks:

- daily notes can be noisy and should not auto-promote every line
- curated and generated memory surfaces must remain distinct

First safe test:

- append one explicit durable decision to a fixture `MEMORY.md` and verify one
  hash-gated MMV2 import with line provenance

## Implementation/Test Plan By Seam

These are design targets only. Production wiring waits for hook-health evidence
that each seam fires in the current runtime path.

| Seam                                      | First implementation step                                                                                                                  | First safe test                                                                                                                     | Disable/rollback path                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `message:preprocessed`                    | add an observe-only handler that hashes `context.bodyForAgent`, records payload keys, and verifies ordering relative to `message:received` | send one synthetic user preference through the preprocessed lane and assert exactly one MMV2 candidate with preprocessed provenance | feature flag the handler off; fallback remains `message:received` only within the dedupe window |
| ContextEngine catchall                    | wrap or observe `ContextEngine.ingest()` / `ingestBatch()` for `role=user` only, with content hash/index ledgering                         | inject one user-role message that bypasses channel hooks and assert one candidate plus one ingest-index signal                      | disable catchall observer; keep channel hook capture as primary                                 |
| Tool-result proof/capture                 | start with proof attachment from `tool_result_persist` or `after_tool_call`, whichever is proven to fire in embedded paths                 | run a harmless file-producing tool and assert bounded proof metadata, not raw logs, links to the candidate/memory                   | disable tool-result capture while keeping hook-health report active                             |
| `agent_end` / `ContextEngine.afterTurn()` | capture grounded final outcomes only when linked user/tool evidence exists                                                                 | complete one turn with a tool-created artifact and assert outcome admission only with tool proof                                    | disable outcome capture; keep primary user/tool evidence capture intact                         |
| Bootstrap and memory-file hash import     | add hash registry for recognized bootstrap/memory basenames before any import                                                              | change a fixture `MEMORY.md` heading and assert one hash-gated import with line provenance                                          | disable watcher/importer; leave existing durable memories untouched                             |

Cross-seam tests required before production enablement:

- dedupe test proving `message:received`, `message:transcribed`,
  `message:preprocessed`, and ContextEngine catchall do not double-write the
  same user message
- authority test proving assistant-only `agent_end` claims cannot create hard
  user directives without user/tool grounding
- privacy test proving raw prompts, full transcripts, raw tool logs, and
  secrets are not stored in diagnostics
- reconciliation test proving corrections can supersede or scope-narrow prior
  memories without deleting durable conflict history
- rollback test proving each seam can be disabled independently without
  changing MMV2 semantic truth tables

## Implementation Order

1. Verify actual hook availability and payloads in the current repo/runtime.
2. Implement `message:preprocessed` as the primary user-input capture seam.
3. Add `ContextEngine.ingest()` / `ingestBatch()` catchall and dedupe coverage.
4. Add tool-result capture with hook-health checks and fallback recovery.
5. Add grounded outcome capture through `agent_end` or
   `ContextEngine.afterTurn()`.
6. Add hash-gated bootstrap and memory-file import.
7. Add closed-loop ops instrumentation from
   [Memory Ops Closed Loop](/projects/model-memory/specs/memory-ops-closed-loop).

## Acceptance Bar

- every active primary capture seam writes through MMV2-native contracts
- fallback seams are explicit and measured
- no seam stores raw unbounded logs or prompts as memory input
- source authority and provenance survive into admission and reconciliation
- hook-health checks detect missing or non-firing secondary hooks
- ordinary-turn MMV2 evaluation covers the new primary user-input capture seam

## Mechanical Capture Job Policy

Live capture may remain asynchronous relative to the user-visible response, but
it must not be silent.

Required lifecycle events:

- `capture_queued`
- `capture_started`
- `capture_skipped`
- `capture_written`
- `capture_failed`

Events may include capture job id, session id, agent id, source id, segment ids,
memory ids, failure class, stage, latency, retry count, model/provider, and
bounded counts. They must not include raw prompts, full transcripts, assistant
turn text, raw tool logs, secrets, or private phrases.

Ordinary-turn capture must not synchronously rebuild runtime projections by
default. It writes canonical MMV2 evidence, marks runtime/projection state
dirty, and emits deferred rebuild telemetry. Explicit admin/proof callers may
request rebuild when needed.

Ordinary-turn source windows persisted as ingest segments must be redacted
before write. Segment content should retain hashes, counts, source/window ids,
and bounded evidence needed by admitted memory records, not full turn text.
