---
summary: "Canonical pre-proof closure spec for the twelve code-verified Product/Spec blockers at the context frontier, WorkIntent context resolution, target selection, worker readiness, readback, and provider diagnostics boundaries."
title: "Code-Verified Product/Spec Blocker Closure Plan"
---

# Code-Verified Product/Spec Blocker Closure Plan

Date: 2026-05-26

Status: P0 governing pre-proof tranche, updated for node-local node resource demand.
This spec supersedes the narrower `context-frontier-lifecycle-shard-manifests`
and `context-frontier-shard-execution-and-merge-lifecycle` Work Queue items as
the execution plan for the next Product/Spec proof attempt. Those earlier
specs are now design history and internal specialist-subturn references. The
active DB-ranked path is governed with
[Node-Local Context Demand And Legacy Evisceration](/projects/execution-platform/specs/node-local-node-resource-demand-and-legacy-evisceration).

2026-05-27 closure update: the active governing spec is now
[Architecture Transition Closure And Context Objective Focus](/projects/execution-platform/specs/architecture-transition-closure-and-resource-objective-focus).
The latest proof/code review showed that the system still has new contracts
on top of old production behavior: durable graph-level context scout fanout,
checkpoint `resource_fulfillment` projection, context-synthesis readiness
compatibility, scope-revision request without execution, and
WorkIntent-context resolution from graph `context_supplies` edges. Those are
now closure blockers, not later cleanup.

2026-05-27 target-selection update: the next closure item is
[Mandatory Context Focus And Target Selection Boundary](/projects/execution-platform/specs/mandatory-context-focus-and-target-selection-boundary).
The code still lets broad WorkIntent or graph `targetRefs`, packet
`likelyRepoAreas`, and approved scope leak into context/scout or
implementation materialization. That is the likely root of the broken
context-scout-to-implementation pipeline. Before remaining demand/scout work,
production must require model-authored `ResourceObjectiveFocus` for context
and model-authored target selection for source-edit snapshots. Runtime
validates handles, authority, budgets, and lifecycle only.

2026-05-28 lifecycle-runner update: the next closure item is
[Node Lifecycle Transition Runner](/projects/execution-platform/specs/node-lifecycle-transition-runner).
The latest code review showed that the new node-local lifecycle contracts can
still be bypassed because lifecycle advancement is an optional scheduler
helper and the global scheduler/orchestrator remains reachable. The fix is
not another boundary patch. The runtime needs an authoritative
`NodeLifecycleTransitionRunner`, a compact `NodeLifecycleProjection` artifact,
capability/workflow transition profiles, and a hard assertion that global
graph repair is illegal while local transitions remain.

## Why This Exists

The latest replay did not fail because a worker model was too weak or because
one prompt needed another sentence. It failed because the platform has learned
to detect several control-plane boundary violations without yet giving the
runtime, scheduler, and models the legal small-verb transitions to recover.

The recurring failure pattern was:

```text
accepted packets
  -> WorkIntent / context frontier planning
  -> provider/profile or context lifecycle blocker
  -> broad graph repair or repeated scheduler progress
  -> stale or generic readback
  -> no executable implementation node
```

The corrected target is no longer a larger context-frontier ceremony. The
corrected target is:

```text
Mission Ledger
  -> Commitment Work Packets
  -> WorkIntentGraph
  -> NodeExecutionContract
  -> partial NodeExecutionPacket
  -> node-local NodeResourceDemandSession
  -> NodeResourceLedger append
  -> model-authored target selection
  -> hydrated write gate
  -> forced patch author
  -> validation
  -> evidence
  -> review/readback/closeout
```

The corrected control-plane owner for those arrows is the
`NodeLifecycleTransitionRunner`. The scheduler creates and adjusts work; the
runner advances a node through legal lifecycle transitions; workers execute
only after the runner has hydrated the execution packet and write gate.

The fix is not to make the runtime decide which context matters or which files
should be edited. The fix is to make context scouting iterative,
node-local, and execution-adjacent. Models author semantic choices inside
bounded tools, while runtime owns structure, refs, budgets, payload storage,
lifecycle, authority, validation, cleanup, and readback.

## Node-Local Context Demand Update

The previous tranche treated context frontier, shard execution, and
WorkIntent context satisfaction as the next default pre-worker ceremony. That
was still too centralized. It reduced graph explosion but preserved the wrong
center of gravity: implementation could not begin until a context subsystem
had finished a broad preflight.

The active architecture now requires:

- `NodeResourceDemandSession` as the canonical consumer-bound context lifecycle;
- `NodeResourceLedger` as the append-only per-node context memory;
- progressive `NodeExecutionPacket` states so a worker can start read/context
  work before write readiness;
- specialist context scout subturns only when direct node resource demand tools are
  insufficient;
- hard deletion of default context synthesis production and replay paths;
- cleanup passes that delete obsolete tests, proofs, fallbacks, and runtime
  code rather than keeping compatibility residue.

Context frontier and shard machinery may remain only as internal fulfillment
plumbing for a specialist subturn. It must not be the default graph-visible
path from packets to implementation.

## 2026-05-27 Additional Code-Verified Closure Blockers

The latest deep dive added these blockers to the same pre-proof tranche:

1. `runtime-work-graph-scheduler.ts` still creates runtime-owned durable
   `context_scout` graph nodes as default context prerequisites. This must be
   deleted or replaced with `NodeResourceDemandSession` opening.
2. The checkpoint proof harness still computes `resource_fulfillment` from packet
   and graph context-node coverage, and still has context-synthesis readiness
   compatibility. It must project canonical node-local gates.
3. Context requirements are too broad before scout payload assembly. The
   compiler currently allows broad candidate sets and many semantic questions
   before a model-authored focus/subset decision exists.
4. `context.scope.select_legal_subset` exists as a contract/proof path, but
   production only records the request and does not execute the lifecycle and
   resume.
5. `WorkIntentContextResolution` still reads graph `context_supplies` edge
   observations as the primary satisfaction source. It must consume
   `NodeResourceDemandSession`, `NodeResourceLedger`, accepted focus decisions,
   target-selection state, and limitation/waiver refs first.
6. Hard-coded node-kind and repo-prefix checks still shape context behavior.
   Those must move to capability manifest fields and model-authored
   contracts.
7. Artifact volume is being confused with readiness progress. Shard handoffs,
   merge packets, and accepted-with-limitations artifacts cannot unlock a
   consumer until the consumer-specific readiness transition is recorded.
8. The live gateway heap OOM must be treated as a proof-environment blocker
   for metadata/body discipline.

These blockers are not independent polish. They are the reason the proof
continues to stop before implementation.

## Non-Negotiable Architecture Boundary

Runtime may:

- validate schemas, enums, ids, refs, hashes, payload refs, byte counts, and
  storage flags;
- enforce provider profile bounds, timeout bounds, concurrency bounds, and
  retry policies;
- structurally split by declared refs/windows when a model-authored or
  workflow-authored requirement exposes legal split units;
- persist bounded manifests and full bodies in payload artifacts;
- validate graph edges, consumer bindings, capability manifests, resource
  requirements, authority scope, and lifecycle transitions;
- run deterministic validation commands and compile evidence structure from
  changed files, validation refs, task ids, and commitment ids;
- collapse repeated identical no-progress signatures.

Runtime must not:

- rank, truncate, summarize, or discard semantic context to make a model input
  fit;
- infer semantic source relevance from filenames, node names, commitment
  prose, Product/Spec-specific words, or substring classifiers;
- decide that a shard handoff is substantively sufficient;
- choose target files or edit intent because context prose mentioned them;
- silently widen executable edit authority from broad scheduler refs;
- treat provider rescue, stale replay state, or diagnostic-only artifacts as
  proof success.

Models or humans must author:

- semantic context scope and scope revision;
- file relevance and existing-pattern findings;
- context handoff substance and limitations;
- context sufficiency or consumer waiver rationale;
- target selection and file-change intent;
- implementation plan, patch semantics, and closeout judgment.

The runtime then validates those authored decisions structurally.

## Code-Verified Blocker Set

### 1. Missing Shard Lifecycle Tools

Current verified gap: the code can produce `ContextFrontierRequest`,
`ContextShardManifest`, `ContextMergePacket`, and single-unit blocker
artifacts, but production source does not yet expose the full legal runtime
transition from shard manifest to model-authored shard handoffs to accepted
consumer context.

Required contracts:

- `ContextScoutShardExecutionPacket`
- `ContextShardHandoff`
- `ContextShardHandoffReview`
- `ContextMergePacket`
- `WorkIntentContextSatisfactionState`

Required small verbs:

- `context.frontier.execute_shard_packet`
- `context.frontier.record_shard_result`
- `context_scout.submit_shard_handoff`
- `context.review_shard_handoffs`
- `context.requirement.merge_handoffs`
- `scheduler.accept_context_for_consumer`
- `scheduler.promote_context_satisfied_intent`

Acceptance criteria:

- A ready `ContextShardManifest` becomes executable payload-backed shard
  packet work without creating one durable graph node per shard by default.
- Every shard execution either produces a `ContextShardHandoff` or a precise
  structural/provider/upstream blocker.
- Merge packets cannot unlock a consumer unless they cite accepted shard
  handoff refs.
- The scheduler is never asked to improvise graph patches to represent shard
  lifecycle state.

### 2. Model-Authored Scope Revision For Single-Unit Over-Profile Blockers

Current verified gap: when one declared unit is too large for the model
profile, the runtime can identify the blocker but does not yet have a clean
model-authored scope revision path.

Required contracts:

- `ContextSingleUnitOverProfileBlocker`
- `ContextScopeRevisionRequest`
- `ContextScopeRevisionProposal`
- `ContextScopeRevisionDecision`

Required small verbs:

- `scheduler.request_context_scope_revision`
- `context.scope.select_legal_subset`
- `context.scope.explain_unshardable_unit`
- `context.frontier.accept_scope_revision`

Acceptance criteria:

- Runtime presents legal refs/windows and exact profile diagnostics.
- The model selects a narrower semantic subset or explains why the unit is
  unshardable.
- Runtime validates that selected refs are legal and within budget.
- Runtime does not choose the subset, truncate text, or rank candidate context.

Implementation evidence:

- Closed in DB on 2026-05-26 from real Qwen provider proof
  `context-scope-revision-real-model-mpn4xyh9`.
- Proof artifact:
  `.artifacts/execution-platform/context-scope-revision-real-model-proof/proof.json`.
- Implemented payload-backed contracts:
  `ContextScopeRevisionRequest`, `ContextScopeRevisionProposal`,
  `ContextScopeRevisionDecision`, and `ContextScoutFieldRepairRequest`.
- Production single-unit blocker paths now persist a scope-revision request and
  record `scheduler.request_context_scope_revision` as the next legal small
  verb instead of ending at a generic context blocker.

### 3. WorkIntentContextResolution Must Consume Shard Handoff Refs

Current verified gap: merge packets alone can be produced, but
`WorkIntentContextResolution` still expects handoff refs in shapes that do not
fully align with the shard lifecycle. A merge artifact is not enough.

Required changes:

- `WorkIntentContextResolution` must accept shard handoff refs as first-class
  context evidence.
- Merge packets must list `acceptedShardHandoffRefs` and
  `requiredShardHandoffRefs`.
- Missing or rejected shard handoffs must block with exact reason codes.

Acceptance criteria:

- Accepted shard handoff refs satisfy declared context requirements.
- A merge packet with zero accepted handoffs cannot count as context
  satisfaction.
- Consumer context state names which WorkIntent, context requirement, shard
  manifest, and handoff refs unlocked or blocked the transition.

### 4. Model-Authored Target Selection After Accepted Context

Current verified gap: context recommendations can name useful files, while
implementation nodes still carry broad scheduler-selected directory refs.
Runtime correctly blocks because it must not widen executable edit authority
from context prose.

Required contracts:

- `TargetSelectionRequest`
- `TargetSelectionProposal`
- `TargetSelectionDecision`
- `FileChangeIntent`

Required small verbs:

- `implementation.target_selection.request`
- `implementation.target_selection.propose`
- `implementation.target_selection.accept`
- `implementation.target_selection.request_revision`

Acceptance criteria:

- Target selection runs after context is accepted and before
  `NodeExecutionPacket` hydration.
- The model chooses concrete target refs from validated candidate refs and
  explains intended changes.
- Runtime validates existence, path authority, capability compatibility,
  WorkIntent mapping, context requirement mapping, and commitment mapping.
- Runtime does not infer edit targets from filenames or context prose.

### 5. Precise First-Open-Gate Readback

Current verified gap: readback can still report generic or stale gates like
`resource_fulfillment` or `commitment_work_packets` when the actual terminal blocker
is deeper: context frontier, shard execution, single-unit over-profile, or
WorkIntent context resolution.

Required canonical gate names:

- `work_intent_graph`
- `context_frontier`
- `context_shard_execution`
- `context_single_unit_over_profile`
- `context_shard_merge`
- `work_intent_context_resolution`
- `target_selection`
- `node_execution_packet_hydration`
- `worker_execution`
- `post_edit_validation`
- `evidence_closure`

Acceptance criteria:

- `firstOpenGate` projects from canonical readiness/frontier/root-cause state.
- Stale checkpoint labels cannot override a deeper terminal blocker.
- Work Queue readback shows branch id, node id, WorkIntent ref,
  context requirement ref, blocker kind, reason codes, next legal transition,
  and relevant payload refs.

### 6. Provider Diagnostics Projection For Qwen/Kimi Events

Current verified gap: provider and preflight failures are not consistently
projected in enough detail to distinguish payload shape, timeout, parser,
provider, and model-fit problems.

Required event fields:

- `modelRef`
- `providerId`
- `modelTaskClass`
- `requestInputBytes`
- `requestOutputLimit`
- `requestedTimeoutMs`
- `profileTimeoutMs`
- `preflightStatus`
- `providerInvocationStarted`
- `timeoutState`
- `elapsedMs`
- `finishReason`
- `nativeFinishReason`
- `choiceCount`
- `contentLengthByChoice`
- `parsedContentLength`
- `usage` or `usageUnavailableReason`
- `retryNumber`
- `concurrencySlot`
- `inputBundleRef`
- `inputBundleHash`
- `responseShapeRef` for bounded response metadata only

Acceptance criteria:

- Structured-adapter preflight blocks are distinguishable from provider
  no-content, parser-empty, timeout, and malformed tool output.
- Diagnostics are persisted as bounded artifacts and projected in owner
  readback.
- Raw provider logs, raw prompts, hidden reasoning, credentials, and full
  transcripts are never stored.

### 7. Field-Specific Context Scout Repair Payloads

Current verified gap: context scout repair can append the full original scout
prompt to repair text, re-bloating the payload and repeating the same provider
profile failure.

Required contracts:

- `ContextScoutRepairRequest`
- `ContextScoutRepairPatch`
- `ContextScoutRepairDecision`

Required small verbs:

- `context_scout.repair_missing_field`
- `context_scout.repair_invalid_ref`
- `context_scout.repair_handoff_summary`
- `context_scout.mark_repair_blocked`

Acceptance criteria:

- Repair calls receive only accepted prior fields, exact missing/invalid
  fields, legal refs, and bounded surrounding context.
- Repair calls run provider preflight before invocation.
- Repair cannot reattach the full original prompt or full scout packet.
- Runtime compiles the repaired handoff structure; the model authors only the
  missing semantic fields.

### 8. Shard Handoff Substance Through Small Verbs

Current verified gap: normal scout handoff substance checks exist, but shard
handoff production does not yet force the model to author the useful content
later phases need.

Required small verbs:

- `context_scout.report_relevant_file`
- `context_scout.report_existing_pattern`
- `context_scout.report_risk`
- `context_scout.recommend_edit_point`
- `context_scout.recommend_validation`
- `context_scout.submit_shard_handoff`
- `context_scout.mark_insufficient_context`

Acceptance criteria:

- A handoff cannot be accepted as clean success only because runtime supplied
  verified refs.
- `runtime supplied verified refs instead` maps to
  `accepted_with_limitations` or `needs_review_nonblocking`.
- The model must author substantive findings, patterns, edit-point
  recommendations, validation hints, limitations, or a precise insufficiency
  blocker.

### 9. Accepted-With-Limitations Waiver Semantics

Current verified gap: context can be marked accepted with limitations, but the
limitation must survive shard merge and block implementation unless the
consumer explicitly waives it for that WorkIntent/capability/evidence mode.

Required contracts:

- `ContextLimitation`
- `ConsumerContextWaiver`
- `ContextSatisfactionDecision`

Required small verbs:

- `context.review_shard_handoffs`
- `scheduler.record_context_limitation`
- `scheduler.accept_context_limitation_waiver`
- `scheduler.reject_context_limitation_waiver`

Acceptance criteria:

- Limitations are carried from shard handoff to merge packet to
  WorkIntentContextSatisfactionState.
- Implementation/resource materialization remains blocked unless each
  blocking limitation has a consumer-specific waiver.
- Runtime validates waiver structure and authority; model/human authors waiver
  rationale.

### 10. Target Selection Must Produce File-Change Intent

Current verified gap: selecting file refs is not enough. The worker needs to
know whether the intended action is edit, add test, inspect only, validation,
docs update, or evidence/readback.

Required `FileChangeIntent` fields:

- `targetRef`
- `operation`: `modify | create | delete | inspect_only | test_add |
  validation_only | documentation_update | evidence_only`
- `intendedChange`
- `sourceCommitmentIds`
- `resourceHandoffRefs`
- `expectedEvidenceMode`
- `validationDiscoveryNeed`
- `authorityScopeRef`

Acceptance criteria:

- Source-edit `NodeExecutionPacket`s cannot hydrate from target refs without
  file-change intents.
- Read-only/source-grounding WorkIntents cannot be promoted into source-edit
  workers.
- Runtime validates operation enum and authority; it does not decide semantic
  operation from prose.

### 11. Worker Packet, Snapshot, And Plan Readiness

Current verified gap: the forced patch path helps after a worker has read a
snapshot and accepted an edit plan. It cannot compensate for an upstream
execution packet that lacks concrete snapshots, target selection, or a legal
first transition.

Required contracts:

- `NodeExecutionPacket`
- `ImplementationTaskPacket`
- `WorkerSnapshotWindow`
- `WorkerPlanReadinessState`

Required small verbs:

- `worker.task.get_brief`
- `worker.context.request_file_snapshot`
- `worker.edit.plan`
- `worker.patch.force_author_from_plan`
- `worker.patch.author_edit`
- `worker.repair.mark_upstream_blocker`
- `worker.validation.run_structural_default`
- `worker.evidence.claim_from_validation`

Acceptance criteria:

- A source-edit worker cannot start without readable target snapshots,
  target-selection refs, file-change intents, validation refs or structural
  validation fallback, commitment mapping, and context handoff refs.
- If the worker can plan but not edit, it records a typed upstream blocker
  rather than spinning on broad tools.
- The worker receives a small legal transition set at each stage.

### 12. Root-Cause Collapse For Repeated Frontier Failures

Current verified gap: the latest proof produced hundreds of scheduler progress
and runtime graph patch artifacts for repeated equivalent blockers.

Required no-progress signature:

```text
stage
+ nodeKind
+ capability
+ contractVersion
+ missingFields
+ reasonCodes
+ consumerNodeId or consumerClass
+ providerProfileRef when relevant
```

Required small verbs:

- `frontier.record_no_progress_signature`
- `frontier.halt_repeated_root_cause`
- `readback.project_root_cause`

Acceptance criteria:

- Repeated equivalent blockers across sibling nodes or frontier iterations
  collapse into one root-cause artifact.
- Successful sibling evidence survives collapse.
- The scheduler does not spend dozens of iterations re-persisting the same
  graph repair attempt.

## Model Test Requirements

The tests for this tranche must be real enough to predict Product/Spec proof
behavior but smaller than the full long-form proof. Miniature toy edits are
not acceptable as the only evidence.

Required middle-lane tests:

1. Context shard lifecycle model test
   - Use real Product/Spec proof artifacts, source prompt context, and
     Execution Platform docs/source refs.
   - Execute at least two Qwen context shard packets through the shard
     handoff tools.
   - Require substantive relevant-file, pattern, edit-point, validation, and
     limitation content.

2. Scope revision model test
   - Use a real over-profile context unit from the latest Product/Spec replay
     or a production-equivalent prompt/source window.
   - Ask the model to select legal narrower refs/windows.
   - Runtime validates refs and budget without truncating.

3. Target selection model test
   - Start from accepted context handoffs for a Product/Spec-derived
     implementation WorkIntent.
   - Require concrete target refs plus `FileChangeIntent`s.
   - Reject broad directory authority as executable source-edit scope.

4. Worker readiness and edit smoke
   - Use one meaningful Product/Spec-derived Execution Platform edit, not a
     synthetic fixture known to be easy.
   - Hydrate a real `NodeExecutionPacket`, snapshots, target selection,
     validation refs, and evidence expectations.
   - Worker must produce a bounded edit or a precise upstream blocker.
   - Codex reviews any produced code before persistence.

5. Readback/root-cause/provider diagnostics replay
   - Replay from completed packets and from context frontier boundary.
   - Prove `firstOpenGate`, provider diagnostics, root-cause collapse, and
     latest-run-state projection match the actual terminal boundary.
   - Proof-environment diagnostics must project bounded heap, metadata,
     artifact-body, and provider-request byte pressure so recurring OOM or
     metadata overflow signals are visible from readback without storing raw
     provider responses or raw prompts.

The full Product/Spec proof may run only after these middle-lane gates pass.

## Work Queue Tranche

The DB-ranked pre-proof items created from this spec are now:

1. `openclaw-convergence.node-local-node-resource-demand-session-core`
   - Add the canonical node-local node resource demand lifecycle. No durable context
     scout graph fanout by default.
2. `openclaw-convergence.node-resource-ledger`
   - Add append-only per-node resource ledger with compact manifests and
     artifact-backed bodies.
3. `openclaw-convergence.progressive-node-execution-packet`
   - Allow read/context phases from partial execution packets while write
     tools remain gated.
4. `openclaw-convergence.context-scout-specialist-subturn`
   - Convert context scout from default graph node to optional consumer-bound
     specialist subturn.
5. `openclaw-convergence.context-synthesis-runtime-deletion-closure`
   - Hard-delete default context synthesis production/replay paths and
     resurrection flags.
6. `openclaw-convergence.blocker-closure-04-worker-readiness-edit-evidence`
   - Rescope to post-demand worker readiness: partial packet -> node resource demand
     -> ledger -> target selection -> write gate -> patch -> validation ->
     evidence.
7. `openclaw-convergence.readback-rootcause-provider-heap-closure`
   - Project the new gates and diagnostics:
     `node_resource_demand_open`, `node_resource_demand_blocked`,
     `resource_ledger_ready`, `target_selection_blocked`,
     `write_gate_blocked`, `worker_edit_ready`, `post_edit_validation`,
     and `evidence_closure`.
   - Include bounded provider response-shape diagnostics:
     model/provider/profile, request bytes, timeout/preflight/provider-started
     state, native finish reason, choice counts, content lengths, usage or
     unavailable reason, retry/concurrency, and input bundle refs/hashes.
   - Include bounded proof-environment diagnostics:
     heap phase snapshots, largest metadata/object bytes/ref, largest artifact
     body bytes/ref, latest-run-state bytes, scheduler-progress bytes,
     Work Queue projection bytes, provider request bytes, and fail-fast
     manifest bounds.
8. `openclaw-convergence.legacy-proof-test-purge`
   - Delete or rewrite obsolete proof/test topology.
9. `openclaw-convergence.legacy-runtime-code-evisceration`
   - Remove old runtime code, fallback paths, compatibility flags, and
     importable retired surfaces.
10. `openclaw-convergence.architecture-residue-source-inventory-final-gate`
   - Add a source inventory gate for retired concepts and require meaningful
     net LOC reduction.
11. `openclaw-convergence.blocker-closure-06-replay-and-full-proof-gates`
   - Prove a real implementation node starts, requests context locally,
     receives scoped file windows, selects targets, edits, validates, and
     emits evidence.

The older `blocker-closure-01`, `blocker-closure-02`, and
`blocker-closure-03` items remain closed evidence for contracts that may be
reused internally. They are no longer the default production path.

## Documentation Drift Rules

Docs must use this ordering for the Product/Spec proof path:

```text
Mission Ledger
  -> Commitment Work Packets
  -> WorkIntentGraph
  -> NodeExecutionContract
  -> partial NodeExecutionPacket
  -> NodeResourceDemandSession
  -> NodeResourceLedger
  -> target selection and file-change intent
  -> hydrated write gate
  -> worker small-verb loop
  -> validation
  -> evidence
  -> review/readback/closeout
```

Docs must not describe these as default production behavior:

- broad packet-level context scout fanout;
- global context synthesis as default glue;
- `context_synthesis group -> implementation node`;
- `context_scout` graph fanout as default readiness repair;
- `after-context-synthesis` replay;
- context scout graph nodes with no consumer WorkIntent/contract;
- runtime-chosen semantic truncation;
- directory-level target refs as source-edit authority;
- packet review as a normal always-on pass;
- GPT rescue as clean proof success;
- graph repair loops as a substitute for missing lifecycle tools.

## Completion Questions

Each queue item in this tranche must answer these before closeout:

- Did the implementation add or harden the required small-verb boundary rather
  than add another broad JSON repair surface?
- Are all semantic judgments model-authored or human-authored?
- Are runtime checks structural, authority-based, budget-based, lifecycle-
  based, or validation-command-based only?
- Does the model test use real Product/Spec-class work rather than a toy
  fixture?
- Does owner readback show the real current gate, blocker, refs, provider
  state, and next legal transition?
- Can the same mechanism apply to future non-coding workflows with different
  domain resource packets?
- Are stale tests, compatibility shims, and proof-only code prevented from
  reentering production?
