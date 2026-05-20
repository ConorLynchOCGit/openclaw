---
summary: "How Model Memory capture, retrieval, context, and proactivity migrate onto Execution Platform runtime tools."
title: "Model Memory Runtime Toolification Integration"
---

# Model Memory Runtime Toolification Integration

## Purpose

Model Memory already has production memory capture, retrieval, context-pack,
compaction, and proactivity paths. Those paths were hardened before the
Execution Platform Runtime Tool-Call Kernel became the canonical step
execution primitive.

This spec records the target architecture for the next integration pass:
Model Memory keeps MMV2 semantic truth, but model calls, DB writes, context
pack assembly, proactivity extraction, and Work Queue projection evidence move
through explicit runtime tool families.

## Boundary

- MMV2 SQL remains live semantic memory truth.
- Execution Platform runtime jobs remain execution lifecycle truth.
- Runtime tools own bounded step execution traces.
- Work Queue owns projection, readback, and control.
- Memory cannot grant authority, approval, deploy/send permission, model
  promotion, runtime success, or Work Queue lifecycle mutation.
- Deterministic code validates refs, bounds, storage flags, authority,
  idempotency, cooldowns, and lifecycle separation.
- Model-authored reviewers judge capture/retrieval/context/proactivity
  usefulness.

## Tool Families

The Model Memory integration should use these runtime tool families:

### Capture

- `memory.capture.prepare_source_window`: runtime builds a bounded source
  packet with source refs, source authority, prompt hash or event hash, and raw
  storage flags.
- `memory.capture.draft_candidates`: model proposes candidate memories from
  the bounded packet.
- `memory.capture.classify_durability`: model judges whether each candidate is
  durable preference, project fact, policy, skill candidate, proactivity seed,
  transient instruction, or non-memory.
- `memory.capture.detect_conflict_or_supersession`: model judges whether a
  candidate conflicts with or supersedes existing bounded memory refs.
- `memory.capture.review_raw_storage_risk`: model reviews leakage risk;
  runtime still enforces hard raw-storage rejection.
- `memory.capture.compile_write_refs`: runtime derives memory ids, hashes,
  MMV2 write refs, source span refs, durability enums, and write policy.
- `memory.capture.commit_memory_ref`: runtime writes accepted memory refs
  through MMV2/DB-operation tooling.
- `memory.capture.postwrite_quality_review`: model reviews whether useful
  memory was captured, missed, or polluted.

### Retrieval And Context

- `memory.retrieval.draft_intent`: model states retrieval purpose and what
  context would help.
- `memory.retrieval.select_sources`: model chooses source classes and scopes;
  runtime validates authority, tenancy, and route permissions.
- `memory.retrieval.compile_queries`: runtime derives lexical/vector/graph
  query refs from source scope and retrieval intent.
- `memory.retrieval.fetch_candidates`: runtime fetches bounded candidates with
  refs and scores only.
- `memory.retrieval.rank_candidates`: model or approved reranker ranks
  candidates for usefulness; runtime stores bounded rank evidence.
- `memory.context.assemble_pack`: runtime builds a bounded route-aware context
  pack.
- `memory.context.review_pack_usefulness`: model judges usefulness and stale
  assumptions before insertion.
- `memory.context.insert_pack_ref`: runtime inserts the accepted pack ref into
  prompt/workflow context.

### Compaction

- `memory.compaction.inspect_budget`: runtime inspects token/session budget.
- `memory.compaction.draft_summary`: model drafts bounded compaction summary.
- `memory.compaction.review_loss_risk`: model reviews likely loss and
  important omissions.
- `memory.compaction.commit_ledger_update`: runtime updates bounded session
  ledger and compaction refs.

### Proactivity

- `memory.proactivity.extract_opportunity_candidates`: model extracts follow-up
  opportunities from closeout, workflow, memory, or planning evidence.
- `memory.proactivity.dedupe_and_cooldown_check`: runtime checks idempotency,
  cooldown, and generated-item lineage.
- `memory.proactivity.model_adjudicate_usefulness`: model judges usefulness,
  urgency, and owner value.
- `memory.proactivity.project_to_work_queue_candidate`: runtime compiles a
  review-gated Work Queue candidate or Planning Capsule intake ref.
- `memory.proactivity.owner_review_gate`: owner review controls promotion into
  active planned work.

## Maximum Toolification Update

The Execution Platform maximum-toolification pass clarified an important
boundary: toolification is not only trace evidence around a strict JSON model
call. For Model Memory, the model should not be asked to invent runtime-owned
schema or final storage envelopes in one response.

Memory capture, retrieval, context, and proactivity should use staged tool
protocols:

- capture: interpret event -> propose memory candidates -> adjudicate
  usefulness/authority -> compile durable write envelope -> write through
  MMV2/DB-operation tool -> emit readback.
- retrieval: define retrieval purpose -> gather candidates -> model-rank or
  review relevance -> compile bounded context pack -> insert by route policy.
- proactivity: extract opportunity candidates -> dedupe/cooldown/adjudicate
  -> compile Planning Capsule or Work Queue proposal -> materialize
  review-gated item.
- compaction: inspect budget -> propose compaction summary -> review loss/risk
  -> write bounded session ledger update.

The model owns semantic usefulness, relevance, contradiction/supersession
judgment, and opportunity quality. Runtime owns ids, context-pack refs,
budget/staleness flags, raw-storage flags, MMV2 write refs, Work Queue child
materialization, cooldown/idempotency, and trace ids.

The related Execution Platform source-of-truth spec is
`/projects/execution-platform/specs/maximum-toolification-architecture`.

## Middleware Collapse

Existing model-task and DB-operation refs remain useful during migration, but
they should become compatibility facades over runtime tools:

- model interpretation work moves to `model.call` or a memory-specific tool
  implemented on top of `model.call`. Execution Platform model-task
  middleware live calls now use `model.call`; memory-specific capture,
  retrieval, and proactivity callsites still need the dedicated memory
  toolification pass. Live model-task completion now requires a runtime tool
  kernel, and `providerCallMade: true` must be backed by
  `model_task.runtime_tool_trace` evidence with a `runtime-tool://...`
  invocation ref.
- durable writes move to `db_operation.execute` or a memory-specific write
  tool implemented on top of `db_operation.execute`.
- Work Queue readback should show tool invocation refs, not only old
  `modelTaskRefs` or `dbOperationRefs`.

## Generated Work Queue Items

Model Memory and proactivity integration must use the Execution Platform
generated-item lifecycle when creating Work Queue rows:

- accepted proactivity/planning seeds may become review-gated owner work.
- memory proof diagnostics and middleware fixtures stay debug-only.
- unaccepted opportunity candidates remain proposal evidence until a Planning
  Capsule or review gate accepts them.
- generated rows must carry origin, parent refs, terminal policy, retention
  policy, runtime/tool refs, and raw-storage flags.

This prevents memory/proactivity proofs from creating stale active Work Queue
items while still preserving bounded debug evidence.

## Acceptance Gates

The memory/toolification item is not complete until:

- every production capture/retrieval/context/proactivity/compaction callsite
  is classified as production-primary, compatibility-only, test-only, or
  retired.
- production-primary paths emit runtime tool traces.
- route-aware context pack insertion remains the only production context path.
- model-authored qualitative review proves dense capture, retrieval,
  context-pack usefulness, and proactivity seed usefulness.
- Work Queue readback surfaces memory tool ids, invocation refs, selected
  context-pack refs, capture write refs, opportunity seed refs, and ELI5
  progress.
- no raw prompts, responses, transcripts, provider logs, tool logs, DB rows,
  secrets, or unbounded source text are stored.
