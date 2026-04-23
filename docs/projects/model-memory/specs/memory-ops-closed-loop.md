---
summary: "Closed-loop operational instrumentation spec for the MMV2-native memory system."
title: "Memory Ops Closed Loop"
---

# Memory Ops Closed Loop

## Status

This is now an implemented observe/report surface with Safe Level 1 auto-fix
dry-run and execution for operational artifact/job/runtime-state actions. It
remains forbidden to mutate semantic truth automatically.

Future module/plugin name:

- `memory-ops-closed-loop`

## 2026-04-23 Implementation Record

Current surfaces:

- JSONL signals under `.openclaw-memory-ops/signals/`
- JSONL recommendations under `.openclaw-memory-ops/recommendations/`
- reports under `.openclaw-memory-ops/reports/`
- hook discovery artifacts under `.openclaw-memory-ops/hook-discovery/`
- Safe Level 1 plans/actions under `.openclaw-memory-ops/auto-fix/`

Enabled Safe Level 1 operational actions:

- retry failed capture jobs only for `timeout`, `provider_connection`, and
  `pool_pressure`
- mark runtime dirty and schedule rebuild after capture writes when rebuild is
  skipped
- rebuild stale projection artifacts from active MMV2 source ids only
- quarantine invalid projection artifacts without deleting canonical truth
- rotate runtime-state JSONL by age/size
- refresh provider scorecards
- disable failing routes only when they are already failover-safe
- generate operator approval tickets for semantic-truth mutations

Execution constraints:

- Safe Level 1 actions have dry-run and execute modes.
- Every action writes bounded audit artifacts with safe ids/classes only.
- Runtime-state JSONL rotation/prune must not delete durable DB data, root
  memory files, canonical source docs, or accepted proof baselines.
- Invalid projection quarantine and stale projection rebuild operate only on
  derived projection artifacts backed by active MMV2 source ids.
- Failing model routes are disabled only for new benchmark/ingest runs and
  only when already configured as failover-safe.

Forbidden:

- semantic auto-fix
- auto-delete memory
- auto-supersede memory
- auto-repair semantic candidates
- fuzzy correction or fuzzy supersession
- root `USER.md` / `MEMORY.md` generated write-back

Latest proof command:

```bash
node scripts/run-memory-ops-closed-loop.mjs --hook-discovery --hook-canary --report-fixture --safe-level1-autofix --safe-level1-dry-run --safe-level1-execute --base-dir .openclaw-memory-ops
```

The hook discovery pass was optimized to read the source corpus once and scan
in memory. This avoids the previous per-hook repeated file-read timeout.
The 2026-04-23 proof executed eight Safe Level 1 actions and left semantic
auto-fix disabled. The latest report remains
`.openclaw-memory-ops/reports/latest.md`.

Main UX audit follow-up:

- runtime-dirty spool writeability is an operational health prerequisite; EACCES
  on `$OPENCLAW_STATE_DIR/model-memory/runtime-dirty/` should be classified as
  `runtime_dirty_persistence`, not semantic capture failure
- bounded tool-result operational facts are allowed Memory Ops input when they
  describe safe blocker classes and remediation hints without raw command
  output, raw tool parameters, prompts, transcripts, or secrets
- shared ingestion closeout reports are valid Memory Ops input. Memory Ops may
  consume their safe counts, ids, classes, provider scorecard refs, integrity
  audit refs, dirty-state status, and quarantine records, but must not promote
  closeout artifacts into durable semantic memories or use them to perform
  semantic auto-fix.
- host-operator tool failure logs must use safe parameter metadata and content
  redaction so Memory Ops and gateway logs do not become raw-tool-log storage

## Core Principle

DO NOT RECORD DARK DATA.

Do not persist hook data unless there is an automated consumer that uses it to
improve the memory system.

Acceptable consumers are:

- deterministic gates that prevent bad memory writes
- dedupe/reconciliation logic
- memory retrieval quality metrics
- compaction/session safety checks
- automated actionable recommendations surfaced to the user via Cron/report
- source/provenance attachments to an admitted memory
- conflict/supersession resolution

If a field does not feed one of those consumers, do not store it.

## Non-Goals

This module is not primary memory capture.

It must not:

- duplicate primary memory capture
- run Nano classification
- persist raw prompt text
- persist full transcripts
- persist raw tool logs
- persist secrets
- become a second memory system
- perform unsafe auto-fixes without explicit approval

It extends the future or active `memory-new-capture` system by adding
closed-loop operational signals.

## Output

The output of this phase is not more captured memory.

The output is:

- better admission and reconciliation decisions
- better retrieval diagnostics
- safer compaction and session boundaries
- provenance-backed memory records
- actionable memory health reports

## Closed Loop Consumers

```ts
type ClosedLoopConsumer =
  | "provenance_attachment"
  | "dedupe"
  | "reconciliation"
  | "admission_gate"
  | "retrieval_quality"
  | "compaction_safety"
  | "session_flush"
  | "conflict_resolution"
  | "cron_recommendation"
  | "hook_health";
```

## Signal Types

```ts
type MemoryOpsSignalType =
  | "context_ingest_index"
  | "prompt_assembly_audit"
  | "tool_result_proof"
  | "source_span_verified"
  | "file_hash_observed"
  | "compaction_boundary"
  | "session_command_boundary"
  | "session_end_boundary"
  | "memory_injection_observed"
  | "memory_retrieval_observed"
  | "duplicate_hash_observed"
  | "source_authority_observed"
  | "conflict_observed"
  | "supersession_observed"
  | "recommendation_generated";
```

## Signal Contract

```ts
interface MemoryOpsSignal {
  signal_id: string;
  schema_version: "memory_ops_signal.v1";
  signal_type: MemoryOpsSignalType;
  consumers: ClosedLoopConsumer[];

  created_at: string;
  observed_at: string;

  tenant_id?: string | null;
  user_id?: string | null;
  workspace_id?: string | null;
  project_id?: string | null;
  session_id?: string | null;
  session_key?: string | null;
  run_id?: string | null;

  related_evidence_ids?: string[];
  related_candidate_ids?: string[];
  related_memory_ids?: string[];
  related_source_ids?: string[];

  severity: "debug" | "info" | "warning" | "action_required" | "critical";

  payload: Record<string, unknown>;

  retention: {
    policy:
      | "ephemeral"
      | "aggregate_only"
      | "until_candidate_resolved"
      | "until_memory_superseded"
      | "bounded_audit";
    ttl_seconds?: number | null;
  };

  privacy: {
    contains_raw_text: boolean;
    contains_user_content: boolean;
    contains_prompt_content: boolean;
    contains_secret: boolean;
    redacted: boolean;
  };

  usage_contract: {
    used_by: ClosedLoopConsumer[];
    action: string;
    recommendation_template_id?: string | null;
  };
}
```

## No-Dark-Data Validation

Every `MemoryOpsSignal` must pass this validation before persistence:

```ts
function validateNoDarkData(signal: MemoryOpsSignal): void {
  assert(signal.consumers.length > 0);
  assert(signal.usage_contract.used_by.length > 0);
  assert(signal.usage_contract.action.length > 0);
  assert(signal.usage_contract.used_by.every((c) => signal.consumers.includes(c)));
}
```

If validation fails:

- drop the signal
- log a debug-only message
- do not persist it

## Default Config

```json
{
  "enabled": true,
  "store": "sqlite-or-jsonl-existing",
  "reportCronEnabled": true,
  "reportCronSchedule": "0 9 * * *",
  "maxSignalsPerReport": 1000,
  "promptAssemblyCaptureEnabled": true,
  "promptAssemblyStoreRawPrompt": false,
  "contextIngestStoreContent": false,
  "sourceSpanVerificationEnabled": true,
  "fileHashTrackingEnabled": true,
  "compactionSafetyEnabled": true,
  "commandBoundaryFlushEnabled": true,
  "retrievalQualityEnabled": true,
  "duplicateHashTrackingEnabled": true,
  "conflictTrackingEnabled": true,
  "hookHealthEnabled": true,
  "signalRetentionDays": 30,
  "aggregateRetentionDays": 180
}
```

## Evidence And Provenance Signals

### Context Ingest Index

Signal type:

- `context_ingest_index`

Consumers:

- `dedupe`
- `compaction_safety`
- `session_flush`
- `hook_health`

Use context ingest only for:

- session message index tracking
- detecting unprocessed deltas
- detecting duplicate messages already captured by primary capture
- building compaction flush ranges
- verifying that every user-visible message was either captured or
  intentionally skipped

Persist only:

- session id/key
- message id if available
- role
- normalized content hash
- timestamp
- index/order
- linked primary capture event id if available
- skipped reason if not captured

Do not store raw content by default.

Automated uses:

- recommend inspection when a user-role context message lacks a linked primary
  capture event inside the dedupe window
- trigger batch flush when compaction would remove unprocessed messages
- report repeated duplicate hashes for dedupe tuning

### Prompt Assembly Audit

Signal type:

- `prompt_assembly_audit`

Consumers:

- `retrieval_quality`
- `conflict_resolution`
- `cron_recommendation`

Use prompt assembly only for:

- verifying which memory ids were injected
- measuring whether retrieved memories were later used
- detecting stale or conflicted memories being injected
- detecting relevant memories not injected
- debugging memory retrieval quality

Persist only:

- run id
- session id/key
- model/provider if available
- message count
- token estimate if available
- hash of assembled prompt/messages
- injected memory ids
- injected memory types/kinds
- retrieval query hash if available
- bootstrap file hashes if available

Never classify the assembled prompt. Never store full prompt content.

Automated uses:

- action-required recommendation when conflicted or superseded memory is
  injected
- retrieval-miss recommendation when a relevant memory existed but was not
  included before a later correction
- budget recommendation when prompt injection repeatedly includes low-utility
  memories

### Tool Result Proof

Signal type:

- `tool_result_proof`

Consumers:

- `provenance_attachment`
- `admission_gate`
- `reconciliation`
- `cron_recommendation`

Use tool result proof for:

- proving that a claimed action happened
- verifying artifact locators
- linking file writes/edits to memory events
- raising confidence for tool-grounded episodes and source refs
- rejecting assistant-only outcome claims when tool proof contradicts them

Persist only:

- tool call id
- tool name
- success/error status
- artifact locators
- result hash
- bounded redacted summary
- linked capture event id
- linked memory/candidate ids

Automated uses:

- lower confidence or quarantine assistant outcome candidates that lack proof
- recommend missed source-ref review when a tool created a file/ref but no
  source-ref memory was admitted
- critical recommendation when a tool failed but final answer claimed success

### Source Span Verification

Signal type:

- `source_span_verified`

Consumers:

- `provenance_attachment`
- `admission_gate`
- `conflict_resolution`

Persist only:

- source id
- evidence id
- memory/candidate id
- start/end char or line range
- evidence quote hash
- verified boolean
- mismatch reason

Do not store the raw quote unless already stored in the primary evidence
record.

Automated uses:

- block or quarantine candidates when source spans do not match source text/hash
- reduce confidence or report a provenance gap when a memory lacks verified
  spans
- recommend extractor repair when span failures cluster by source/hook type

### File Hash Observation

Signal type:

- `file_hash_observed`

Consumers:

- `dedupe`
- `provenance_attachment`
- `cron_recommendation`

Persist only:

- file path
- basename
- content hash
- previous hash
- changed boolean
- linked capture events
- line/heading ranges if available

No file content belongs in this signal.

Automated uses:

- recommend file watcher repair when a watched file hash changed but no capture
  event followed
- recommend dedupe repair when unchanged files are repeatedly captured
- mark file-derived memories for freshness review when their source changed

## Control Signals

### Compaction Boundaries

Hooks:

- `before_compaction`
- `after_compaction`
- internal `session:compact:before`
- internal `session:compact:after`

Signal type:

- `compaction_boundary`

Consumers:

- `compaction_safety`
- `session_flush`
- `cron_recommendation`

Payload should include:

- phase: `before` or `after`
- session id/key
- message count if available
- token count if available
- compacted range if available
- last processed checkpoint
- batch flush triggered boolean
- batch flush result
- summary hash after compaction if available

Automated uses:

- trigger batch flush if compaction starts with unprocessed deltas
- critical recommendation if batch flush fails
- action-required recommendation if after-compaction summary exists but raw
  messages were not flushed
- hook repair recommendation when compaction repeatedly happens without
  preflush

### Session Commands

Hooks:

- `command:new`
- `command:reset`
- `command:stop`
- general command hook if needed

Signal type:

- `session_command_boundary`

Consumers:

- `session_flush`
- `cron_recommendation`

Payload should include:

- command
- session id/key
- workspace id/path hash
- last capture checkpoint
- last admission checkpoint
- flush triggered boolean
- flush result
- unprocessed counts

Automated uses:

- `/new` and `/reset` trigger bounded flush of unprocessed deltas
- `/stop` checkpoints pending evidence and marks the session interrupted
- action-required recommendation if unprocessed deltas remain after command
- repair recommendation if flush failures repeat

### Session End

Hook:

- `session_end`
- fallback inactive-session close detector if the repo has one

Signal type:

- `session_end_boundary`

Consumers:

- `session_flush`
- `cron_recommendation`

Payload should include:

- session id/key
- run count
- captured evidence count
- admitted memory count
- quarantined count
- unresolved conflict count
- unprocessed delta count
- final flush result

Automated uses:

- trigger final session flush
- generate per-session memory health summary
- recommend review when quarantines, conflicts, or unprocessed deltas remain

## Quality Signals

### Memory Injection Observed

Signal type:

- `memory_injection_observed`

Consumers:

- `retrieval_quality`
- `conflict_resolution`
- `cron_recommendation`

Persist only:

- memory ids
- memory kinds/types
- score/rank if available
- prompt section id
- token cost
- run id/session id

Automated uses:

- action-required recommendation when superseded or conflicted memories are
  injected
- ranking recommendation when injected memories are repeatedly unused
- retrieval/routing fix recommendation when high-priority directives are not
  injected when relevant

### Memory Retrieval Observed

Signal type:

- `memory_retrieval_observed`

Consumers:

- `retrieval_quality`
- `cron_recommendation`

Persist only:

- query hash
- query embedding id/hash if available
- retrieved memory ids
- scores/ranks
- selected/injected ids
- used ids if detectable
- correction/contradiction marker if later user correction occurs

Automated uses:

- calculate hit/miss metrics
- detect retrieved-but-not-injected memories
- detect injected memories later contradicted by the user
- recommend stale/low-value memory demotion
- recommend threshold, rerank, or scope changes

### Duplicate Hash Observed

Signal type:

- `duplicate_hash_observed`

Consumers:

- `dedupe`
- `reconciliation`
- `cron_recommendation`

Payload should include:

- hash
- canonical evidence id
- duplicate evidence ids
- source types
- canonical priority
- dropped/kept decision
- memory ids if already recorded

Automated uses:

- recommend extraction/dedupe repair when same content creates multiple
  candidates
- recommend procedure promotion-policy repair when procedure children leak as
  standalone memories
- recommend file watcher repair when unchanged file hashes repeatedly emit
  capture events

### Source Authority Observed

Signal type:

- `source_authority_observed`

Consumers:

- `admission_gate`
- `reconciliation`
- `conflict_resolution`

Authority scale:

- system/developer: highest for agent behavior
- explicit user: high
- tool evidence: high for observed outcomes/artifacts
- bootstrap file: high but scoped to file/workspace
- assistant final: low unless grounded
- compaction summary: low/derived
- third-party/webhook: external/untrusted until verified

Automated uses:

- prevent assistant-only statements from creating hard user directives
- prefer explicit newer user statements over inferred older preferences
- prefer tool evidence over assistant claims for action outcomes
- treat compaction summaries as derived evidence, not primary evidence
- recommend supersede versus quarantine when conflicts involve authority
  differences

### Conflict And Supersession Observed

Signal types:

- `conflict_observed`
- `supersession_observed`

Consumers:

- `conflict_resolution`
- `retrieval_quality`
- `cron_recommendation`

Payload should include:

- memory ids
- candidate id
- conflict type
- supersession type
- scope relationship
- source authority comparison
- current resolution status
- whether conflicted/superseded memory was later retrieved/injected

Automated uses:

- prevent superseded memories from prompt injection
- prevent unresolved conflicted memories from silent injection
- report unresolved conflicts
- recommend manual review for high-impact ambiguous conflicts
- recommend scope narrowing when two memories conflict only by context

## Recommendation Contract

```ts
type RecommendationSeverity = "info" | "warning" | "action_required" | "critical";

type RecommendationStatus = "open" | "acknowledged" | "resolved" | "dismissed";

interface MemoryOpsRecommendation {
  recommendation_id: string;
  schema_version: "memory_ops_recommendation.v1";
  created_at: string;
  severity: RecommendationSeverity;
  status: RecommendationStatus;

  title: string;
  summary: string;
  evidence_signal_ids: string[];
  related_memory_ids?: string[];
  related_candidate_ids?: string[];
  related_session_ids?: string[];
  related_hook_names?: string[];

  category:
    | "capture_gap"
    | "retrieval_miss"
    | "bad_injection"
    | "stale_memory"
    | "conflict_unresolved"
    | "superseded_memory_injected"
    | "compaction_risk"
    | "session_flush_failed"
    | "dedupe_failure"
    | "procedure_leakage"
    | "provenance_gap"
    | "source_span_failure"
    | "file_watcher_gap"
    | "hook_health";

  recommended_action: string;
  suggested_command?: string | null;
  auto_fix_available: boolean;
  auto_fix_enabled: boolean;
  safe_to_auto_fix: boolean;
}
```

## Recommendation Rules

1. Capture gap:
   - If a ContextEngine user message exists and no primary capture event exists,
     create a warning recommendation to inspect hook health and fallback
     capture.
2. Superseded memory injected:
   - If prompt assembly injected a superseded memory, create an
     action-required recommendation to fix retrieval filters.
3. Conflicted memory injected silently:
   - If conflicted memory was injected without a conflict marker, create an
     action-required recommendation to mark or exclude conflicted memories.
4. Compaction without preflush:
   - If `before_compaction` fires with unprocessed deltas and batch flush fails,
     create a critical recommendation.
5. Session end with unprocessed deltas:
   - If `session_end` has unprocessed deltas, create an action-required
     recommendation.
6. Assistant claim lacks proof:
   - If final assistant outcome says an artifact/action succeeded but no tool
     proof exists, create a warning recommendation.
7. Tool proof contradicts assistant outcome:
   - If tool result failed but final answer says success, create a critical
     recommendation.
8. Duplicate memory writes:
   - If duplicate hashes show same content admitted multiple times, create a
     warning recommendation.
9. Procedure leakage:
   - If a procedure child step appears as standalone active global memory,
     create an action-required recommendation.
10. Source span failure:

- If source span verification fails, create an action-required
  recommendation.

11. File watcher gap:

- If a watched file hash changed but no capture/import event followed,
  create a warning recommendation.

12. Retrieval miss:

- If user correction occurs and a relevant memory existed but was not
  injected, create a warning recommendation.

## Cron Report

Report name:

- `Memory Ops Health Report`

Default schedule:

- daily at 9 AM local time

Default output:

- `.openclaw-memory-ops/reports/YYYY-MM-DD-memory-ops.md`
- `.openclaw-memory-ops/reports/latest.md`

Report sections:

1. Critical issues
2. Action-required issues
3. Capture gaps
4. Compaction/session flush risks
5. Retrieval quality issues
6. Conflict/supersession issues
7. Dedupe/procedure leakage issues
8. Provenance/source-span issues
9. File watcher/import issues
10. Suggested next actions

Each recommendation should include:

- severity
- title
- why it matters
- affected memories/sessions/hooks
- recommended action
- suggested command if available
- whether safe auto-fix exists

The report must not include raw private content. Use memory ids, session ids,
file paths, hashes, and short redacted labels.

## Auto-Fix Policy

Auto-fix is conservative and disabled by default.

Allowed safe auto-fixes:

- exclude superseded memories from injection
- exclude conflicted memories unless explicitly marked
- mark duplicate evidence as duplicate
- refresh file hash registry
- retry failed batch flush
- recompute source-span verification
- regenerate report

Not allowed without explicit user approval:

- delete memories
- rewrite memories
- resolve semantic conflicts
- promote quarantined memories
- change user preferences/directives
- edit `AGENTS.md`, `USER.md`, `MEMORY.md`, or other source files

## Storage And Retention

Use minimal storage.

Do not store:

- full prompts
- raw transcripts
- raw tool logs
- raw secrets
- full user content unless already stored by primary capture
- full memory text duplicated from memory store

Prefer:

- ids
- hashes
- counts
- statuses
- ranks/scores
- short redacted labels
- source pointers

Retention:

- ephemeral hook signals: 7 days
- aggregate metrics: 180 days
- open recommendations: until resolved/dismissed
- provenance attachments linked to admitted memory: same lifetime as memory
- source-span verification metadata: same lifetime as candidate/memory
- prompt assembly audit: aggregate-only after 30 days

## Hook Registration Scope

Register secondary hooks only.

Evidence/provenance:

- ContextEngine ingest/index observer, no content capture by default
- `before_prompt_build` or ContextEngine assemble prompt audit only
- tool result proof observer linked to existing primary tool capture
- source-span verifier after candidate extraction/admission
- file hash observer for watched memory/bootstrap files

Control:

- `before_compaction`
- `after_compaction`
- internal `session:compact:before`
- internal `session:compact:after`
- `command:new`
- `command:reset`
- `command:stop`
- `session_end`

Quality:

- memory retrieval/search tool observer if available
- memory prompt injection observer if available
- reconciliation/conflict/supersession event observer
- duplicate-hash observer from primary capture/admission pipeline

Do not register primary new-capture hooks here unless needed to consume
existing events.

## Adapter Interfaces

```ts
interface MemoryOpsEventSink {
  recordSignal(signal: MemoryOpsSignal): Promise<void>;
  recordRecommendation(rec: MemoryOpsRecommendation): Promise<void>;
  markRecommendationResolved(id: string, reason: string): Promise<void>;
}

interface MemoryStateReader {
  getMemoryStatus(memoryId: string): Promise<{
    memory_id: string;
    status: "active" | "superseded" | "conflicted" | "quarantined" | "deleted";
    kind?: string | null;
    artifact_type?: string | null;
    scope?: Record<string, unknown>;
  } | null>;

  getCandidateStatus(candidateId: string): Promise<unknown | null>;
  findEvidenceByHash(hash: string): Promise<Array<{ evidence_id: string; source_type: string }>>;
}

interface MemoryOpsActionSink {
  requestBatchFlush(params: {
    session_id?: string | null;
    session_key?: string | null;
    reason: string;
    from_index?: number | null;
    to_index?: number | null;
  }): Promise<{ ok: boolean; error?: string }>;

  verifySourceSpan(params: {
    candidate_id?: string;
    memory_id?: string;
    source_id: string;
    start_char?: number;
    end_char?: number;
    start_line?: number;
    end_line?: number;
  }): Promise<{ ok: boolean; reason?: string }>;
}
```

## Future File Layout

Implementation may use repo-conventional equivalents, but the proposed shape is:

- `plugins/memory-ops-closed-loop/manifest.json`
- `plugins/memory-ops-closed-loop/index.ts`
- `plugins/memory-ops-closed-loop/src/types.ts`
- `plugins/memory-ops-closed-loop/src/config.ts`
- `plugins/memory-ops-closed-loop/src/provenance.ts`
- `plugins/memory-ops-closed-loop/src/control-signals.ts`
- `plugins/memory-ops-closed-loop/src/quality-signals.ts`
- `plugins/memory-ops-closed-loop/src/recommendations.ts`
- `plugins/memory-ops-closed-loop/src/report-cron.ts`
- `plugins/memory-ops-closed-loop/src/metrics-store.ts`
- `plugins/memory-ops-closed-loop/src/hook-health.ts`
- `plugins/memory-ops-closed-loop/src/register-hooks.ts`
- `plugins/memory-ops-closed-loop/README.md`
- `plugins/memory-ops-closed-loop/test/*.test.ts`

## Test Plan

Required implementation tests:

1. No-dark-data validation:
   - signal without consumer is dropped
   - signal without `usage_contract.action` is dropped
2. Prompt assembly:
   - stores injected memory ids and hashes
   - does not store full prompt text
   - creates recommendation when superseded memory is injected
3. Context ingest:
   - stores only role/hash/index by default
   - creates capture-gap recommendation when user message lacks primary capture
4. Tool proof:
   - links successful tool result to admitted outcome
   - recommends/quarantines when assistant says success but tool result failed
5. Source spans:
   - verified span allows admission
   - failed span creates action-required recommendation
6. File hashes:
   - changed file with no import creates file-watcher recommendation
   - unchanged file does not create repeated recommendation
7. Compaction:
   - `before_compaction` triggers batch flush for unprocessed deltas
   - failed flush creates critical recommendation
8. Commands/session end:
   - `/reset` triggers session flush
   - `session_end` with unprocessed deltas creates action-required
     recommendation
9. Retrieval quality:
   - injected conflicted memory creates bad-injection recommendation
   - relevant memory existed but was not injected creates retrieval-miss
     recommendation when correction signal exists
10. Duplicate/procedure leakage:

- duplicate admitted hashes create dedupe recommendation
- embedded-only procedure step active as global memory creates
  procedure-leakage recommendation

11. Cron report:

- report excludes raw private content
- report groups recommendations by severity/category
- latest report path is written

12. Auto-fix policy:

- safe fixes are listed but disabled by default
- unsafe fixes require explicit approval and are not executed automatically

## Acceptance Criteria

- typecheck passes
- tests pass
- no Nano/classifier call is made by this module
- no full prompt text is persisted
- no full raw transcript is persisted
- no raw tool logs are persisted
- every persisted signal has at least one automated consumer
- every persisted signal has a usage contract explaining how it improves the
  system
- compaction and session boundary hooks trigger batch flush requests when
  unprocessed deltas exist
- superseded/conflicted injected memories produce actionable recommendations
- retrieval misses and duplicate/procedure leakage surface in the daily report
- the daily Memory Ops Health Report is generated with clear recommended
  actions
- the module can run in observe/report-only mode without mutating memories
- auto-fix is disabled by default and never performs unsafe semantic changes
  without explicit user approval

## Capture/Runtime Mechanical Signals

Memory Ops should treat the following as first-class observe-only signals:

- capture job queued/started/written/failed/skipped counts
- capture failure class by path and stage
- runtime rebuild dirty markers and skipped-lock events
- DB pool total/idle/waiting snapshots where available
- query/transaction latency summaries where available
- provider strict-schema preflight results by contract
- prompt-cache hit rate and cached-token percentage by ingest/benchmark run
- ordinary-turn redaction policy violations

Recommendations may ask the operator to rerun a narrow proof, adjust pool
knobs, pause capture under pool pressure, or inspect provider/model routing.
They must not auto-fix semantic truth, replay broad ingestion, or persist raw
prompt/transcript/tool-log content.
