---
summary: "P0 spec for executing payload-backed context frontier shards, collecting model-authored shard handoffs, merging them into consumer context readiness, and replaying the failed Product/Spec boundary."
title: "Context Frontier Shard Execution And Merge Lifecycle"
---

# Context Frontier Shard Execution And Merge Lifecycle

Date: 2026-05-26

Status: superseded foundation/design-history spec. This item identified the unfinished
execution half after replay `product-spec-replay-mpmz6z7v`; active DB-ranked
execution is now consolidated under
[Code-Verified Product/Spec Blocker Closure Plan](/projects/execution-platform/specs/code-verified-product-spec-blocker-closure-plan)
and
[Node-Local Context Demand And Legacy Evisceration](/projects/execution-platform/specs/node-local-node-resource-demand-and-legacy-evisceration).
Shard execution closes only as specialist fulfillment for a node-local
`NodeResourceDemandSession`, not as a default pre-worker graph ceremony.

Supersession rule: the lifecycle below may be reused inside a specialist
context scout subturn, but it must return results to the requesting
`NodeResourceDemandSession` and append to the consumer node's `NodeResourceLedger`.
It must not create a global context supply barrier or broad graph fanout.

The previous pass corrected the most dangerous graph-storage failure: context
frontier sharding no longer becomes roughly 150 durable graph nodes by
default. The replay produced payload-backed frontier artifacts and kept the
graph bounded at `17` nodes / `21` edges. It still failed because the
scheduler had no complete legal lifecycle path after `ContextShardManifest`
creation. The runtime recorded shard manifests and merge packets, then the
scheduler fell back into graph/context repair and no-progress collapse.

This is a control-plane toolification gap, not a prompt-strength problem.
Once the runtime says `context_frontier_shard_execution_required`, the legal
next transition must be explicit:

```text
ContextShardManifest
  -> execute shard packets
  -> collect model-authored ContextShardHandoff artifacts
  -> review/merge handoffs
  -> update WorkIntentContextSatisfactionState
  -> promote satisfied WorkIntent to resource materialization
```

The scheduler must not improvise graph patches to represent this lifecycle.
Graph nodes schedule durable semantic work. Payload-backed contracts and
frontier artifacts define resource execution detail.

## Replay Evidence

Replay runtime job:

`product-spec-replay-mpmz6z7v`

Observed evidence:

- replay resumed from completed commitment packets;
- Mission Ledger and packet authoring were reused rather than rerun;
- graph shape stayed bounded at `17` nodes / `21` edges;
- graph node kinds were `work_intent` and `context_scout`;
- no default `context_synthesis` node was injected;
- context frontier artifacts were produced:
  - `execution_platform.context_frontier.request`: `8`;
  - `execution_platform.context_frontier.shard_manifest`: `5`;
  - `execution_platform.context_frontier.merge_packet`: `5`;
  - `execution_platform.context_frontier.single_unit_blocker`: `3`;
- the terminal root cause collapsed at `resource_requirement_repair`;
- the precise repeated blocker was that WorkIntent context handoff refs were
  missing after shard manifests were ready.

The critical reason codes were:

- `context_frontier_shard_manifest_ready`;
- `context_frontier_shard_execution_required`;
- `context_frontier_merge_required_before_consumer_readiness`;
- `work_intent_context_failed_supply_nodes_present`;
- `work_intent_resource_handoff_refs_missing`;
- `scheduler_frontier_root_cause_boundary:resource_requirement_repair`.

That proves the manifest/storage part is working enough to expose the next
missing lifecycle transition. It does not prove context readiness or
implementation readiness.

## Required Control-Plane Spine

The accepted lifecycle after this item is:

```text
WorkIntent
  -> ResourceRequirementPacket
  -> ContextFrontierRequest
  -> ContextShardManifest
  -> ContextShardExecutionBatch
  -> ContextShardHandoff[]
  -> ContextMergePacket
  -> WorkIntentContextSatisfactionState
  -> NodeExecutionPacket / resource materialization
```

No implementation/resource node may run until its consumer WorkIntent has a
canonical context state of `satisfied`, or `satisfied_with_limitations` with
an explicit consumer waiver.

## Runtime And Model Boundary

Runtime owns:

- shard ids, packet refs, manifest refs, merge refs, hashes, counts, and
  payload storage;
- exact provider preflight and profile limits;
- shard execution scheduling, bounded concurrency, retry classification, and
  lifecycle status;
- repo-ref existence checks and authority checks;
- list merging, deduplication, payload refs, graph/readback projection, and
  next legal transitions;
- root-cause collapse when the same shard/frontier blocker repeats.

Runtime must not own:

- semantic relevance of a file;
- whether a shard answer is substantively useful;
- whether a limitation is semantically blocking;
- whether a WorkIntent has enough context to implement;
- target selection beyond structural validation of model-authored refs.

Those judgments must be model-authored or human-authored through explicit
tools and stored as bounded artifacts.

## Required Small-Verb Tools

### Scheduler / Runtime Tools

- `context.frontier.execute_shard_packet`
  - Execute one payload-backed shard packet or one bounded shard batch.
  - Input is a shard manifest ref plus shard packet ref(s), not a graph patch.
  - Output is shard execution status and shard handoff refs or precise
    blockers.
- `context.frontier.record_shard_result`
  - Persist one shard execution result with bounded provider diagnostics,
    handoff ref, limitation refs, and retry/blocker status.
- `context.frontier.record_single_unit_blocker`
  - Preserve exact over-profile bytes, max bytes, unit refs, provider profile,
    and required next transition for units that cannot be structurally split.
- `context.requirement.merge_handoffs`
  - Merge accepted shard handoffs into a `ContextMergePacket`. Runtime merges
    refs, counts, hashes, and declared limitation refs only.
- `context.review_shard_handoffs`
  - Request model-authored sufficiency review over accepted shard handoffs.
- `scheduler.accept_context_for_consumer`
  - Update canonical `WorkIntentContextSatisfactionState` from an accepted
    merge packet and sufficiency review.
- `scheduler.promote_context_satisfied_intent`
  - Promote only context-satisfied WorkIntents to resource materialization.
- `scheduler.request_context_scope_revision`
  - Ask a model for a smaller semantic scope when a single unit remains over
    profile. Runtime validates selected refs; runtime does not choose the
    semantic scope.

### Model-Facing Context Scout Tools

- `context_scout.get_shard_brief`
  - Load exactly one shard brief, declared semantic question(s), legal refs,
    and stop conditions.
- `context_scout.request_repo_ref`
  - Request one file/ref/window by handle, reason, and expected use.
- `context_scout.report_relevant_file`
  - Record model-authored file relevance with evidence.
- `context_scout.report_existing_pattern`
  - Record a pattern the implementation worker should respect.
- `context_scout.report_risk`
  - Record a model-authored risk or limitation.
- `context_scout.recommend_edit_point`
  - Record a likely edit point, target ref, and rationale.
- `context_scout.recommend_validation`
  - Record validation suggestions tied to shard commitments.
- `context_scout.submit_shard_handoff`
  - Finalize one shard handoff with substantive model-authored summary,
    findings, limitations, and sufficiency signal.
- `context_scout.mark_insufficient_context`
  - Return a precise upstream blocker without pretending the shard succeeded.

The model-facing tools must be small, flat, and handle-based. The model should
choose from refs supplied by the runtime and author semantic substance. It
must not hand-write graph nodes, merge packets, or readiness state.

## ContextShardHandoff Contract

Each accepted shard handoff must include:

- `shardHandoffRef`;
- `frontierRequestRef`;
- `shardManifestRef`;
- `shardPacketRef`;
- `consumerNodeId`;
- `workIntentRef`;
- `targetCommitmentIds`;
- `relevantFileRefs`;
- `existingPatternRefs` or bounded pattern bodies;
- `riskRefs` or bounded risk bodies;
- `recommendedEditPointRefs` or bounded edit-point bodies;
- `validationSuggestionRefs` or bounded validation suggestions;
- `handoffSummaryForImplementation`;
- `limitations`;
- `modelAuthoredSufficiencySignal`: `sufficient | partial | insufficient`;
- provider diagnostics ref;
- raw-storage flags.

Runtime may reject a handoff for structural reasons:

- missing required fields;
- refs do not exist;
- refs are outside allowed authority;
- raw provider/tool/log content was stored;
- handoff points at a consumer or commitment outside the manifest.

Runtime must not reject a handoff because it thinks the file is unimportant.
Semantic sufficiency belongs to `context.review_shard_handoffs`.

## ContextMergePacket Contract

The merge packet is the only boundary that can unlock consumer context state.
It must include:

- `contextMergePacketRef`;
- `frontierRequestRef`;
- `shardManifestRef`;
- `consumerNodeId`;
- `workIntentRef`;
- `acceptedShardHandoffRefs`;
- `partialShardHandoffRefs`;
- `rejectedShardHandoffRefs`;
- `missingShardRefs`;
- `mergedRelevantFileRefs`;
- `mergedRecommendedEditPointRefs`;
- `mergedValidationSuggestionRefs`;
- `modelAuthoredSufficiencyReviewRef`;
- `limitations`;
- `consumerWaiverRef`;
- `status`: `accepted | accepted_with_limitations | blocked |
  needs_review`;
- `nextLegalTransition`.

Runtime compiles the merge body from accepted shard artifacts and bounded
model/human review. Runtime does not invent missing semantic findings.

## WorkIntent Context Satisfaction

`WorkIntentContextSatisfactionState` becomes canonical after merge:

- `contextStatus`: `not_required | required | in_progress | satisfied |
  satisfied_with_limitations | blocked | needs_review`;
- `frontierRequestRef`;
- `contextMergePacketRef`;
- `acceptedResourceHandoffRefs`;
- `limitationRefs`;
- `consumerWaiverRef`;
- `missingContextRefs`;
- `readinessStateRef`;
- `nextLegalTransition`;
- `reasonCodes`.

Only this state may feed resource materialization. Scheduler progress,
Work Queue readback, latest-run-state, replay gates, and proof gates must all
project from it.

## Single-Unit Over-Profile Policy

Single-unit blockers are not proof failures when they are precise. They become
proof failures when they are opaque or when runtime silently truncates them.

Legal transitions:

1. `scheduler.request_context_scope_revision` asks a model to select a smaller
   semantic source/ref/window from the declared legal refs.
2. Runtime validates that selected refs are inside authority and profile.
3. Runtime compiles a new ContextShardManifest or records a precise terminal
   blocker.

Illegal transitions:

- deterministic semantic truncation;
- substring ranking;
- dropping source commitments because they look less important;
- increasing provider bounds to force the call through;
- calling the context accepted without a handoff or waiver.

## Replay And Proof Requirements

This item must repeat the failed replay from completed packets:

```text
product-spec-replay-mpmz6z7v source boundary
  -> completed commitment packets reused
  -> WorkIntent graph reused or recompiled by production path
  -> context frontier shards executed
  -> handoffs merged
  -> WorkIntent context state accepted/blocked precisely
```

The replay must pass if it reaches either:

- merged context readiness for at least the previously blocked WorkIntent,
  followed by promotion to resource materialization; or
- a precise single-unit-over-profile blocker with model-authored scope
  revision required.

The replay must fail if it reaches:

- graph repair/no-progress instead of shard execution;
- graph-node shard explosion;
- default context synthesis;
- generic `worker_adapter_threw`;
- stale `firstOpenGate`;
- runtime semantic truncation;
- context accepted without model-authored shard handoff substance.

## Acceptance Criteria

1. `ContextShardManifest` entries are executable through payload refs without
   creating one graph node per shard by default.
2. Provider-safe shard packets invoke the context scout model/tool lane and
   persist `ContextShardHandoff` artifacts.
3. Shard handoffs include model-authored substance, not only runtime verified
   refs.
4. Structural handoff validation checks refs, authority, storage policy, and
   consumer/commitment binding only.
5. `context.requirement.merge_handoffs` produces a merge packet with accepted,
   partial, rejected, and missing shard refs.
6. `context.review_shard_handoffs` records model-authored sufficiency review
   when semantic sufficiency matters.
7. `scheduler.accept_context_for_consumer` updates canonical context state
   only from a valid merge packet and review/waiver state.
8. `scheduler.promote_context_satisfied_intent` refuses to promote blocked,
   partial-without-waiver, or missing-handoff context.
9. `firstOpenGate` reports the actual frontier state:
   `context_shard_execution`, `context_merge_required`,
   `context_single_unit_over_profile`, or
   `resource_materialization`.
10. The completed-packets replay repeats the failed boundary and does not end
    in graph repair/no-progress for the same context frontier reason.

## Anticipated Downstream Failure Register

The following failures are likely after this item moves the replay past the
context-frontier boundary. They must be treated as separate architectural or
toolification work unless they are simple implementation bugs.

### 1. Single-Unit Over-Profile Scope Revision

Likely symptom:

- a source prompt section, repo ref, or context requirement remains too large
  after structural splitting.

Required fix:

- add model-authored scope revision tools that choose narrower refs/windows;
- keep runtime structural: validate selected refs, compile a new shard, or
  record a precise blocker;
- never truncate semantically in deterministic code.

### 2. Weak Shard Handoff Substance

Likely symptom:

- Qwen returns valid JSON with shallow handoff prose, runtime verified refs,
  but insufficient recommendations for implementation.

Required fix:

- use small context scout report tools during the shard run;
- add model-authored sufficiency review and targeted repair for missing
  semantic fields;
- classify `runtime supplied verified refs instead` as
  `accepted_with_limitations` or `needs_review_nonblocking`, not clean
  success.

### 3. Target Selection And Resource Materialization Gap

Likely symptom:

- context handoffs name broad directories or candidate areas, but
  implementation needs exact target file snapshots and edit authority.

Required fix:

- add model-authored target selection or target-scope revision from accepted
  handoff refs;
- runtime validates target refs against candidate refs, capability,
  WorkIntent, context requirement, commitment mapping, and authority;
- resource materialization compiles snapshots only from validated target refs.

### 4. Implementation Worker Edit Loop Failure

Likely symptom:

- Kimi/Qwen receives a hydrated packet but loops on tool selection, asks for
  broad context, or returns no edit.

Required fix:

- force the post-plan patch-author boundary:
  `accepted edit plan -> one snapshot -> worker.patch.author_edit |
  worker.repair.mark_upstream_blocker`;
- add `worker.context.request_file_snapshot` only as a precise single-ref
  request, not broad repo exploration;
- keep validation/evidence as runtime-owned small verbs.

### 5. Validation And Evidence Closure Gap

Likely symptom:

- edits land, but closeout cannot map validation and evidence claims to
  commitments.

Required fix:

- keep validation phase semantics strict;
- compile evidence from changed files, passed validation refs, task ids, and
  commitment ids;
- require model review for semantic sufficiency, not deterministic evidence
  kind inference.

### 6. Readback Drift

Likely symptom:

- terminal status says `needs_review`, but `firstOpenGate` names an upstream
  stale checkpoint or generic `resource_fulfillment`.

Required fix:

- project from canonical context satisfaction, branch state, root-cause
  artifacts, and latest boundary checkpoints;
- include consumer id, frontier ref, merge ref, blocker code, schema/policy
  path, and next legal transition.

### 7. Provider Diagnostics And Latency

Likely symptom:

- shard calls fail with no-content, preflight blocks, or long latency without
  enough evidence to diagnose model/input/provider behavior.

Required fix:

- persist bounded provider diagnostics: model, provider, profile, request
  bytes, timeout state, choice count, finish reason, parsed-content length,
  retry number, concurrency slot, and input bundle hash/ref.

## Work Queue Item

Canonical item:

`openclaw-convergence.context-frontier-shard-execution-merge-lifecycle`

Priority:

P0 before `openclaw-convergence.active-queue-34` and before any new
top-to-bottom Product/Spec proof. It is the executable continuation of
`openclaw-convergence.context-frontier-lifecycle-shard-manifests`.

Success gate:

Replay from completed packets reaches context shard execution, model-authored
shard handoffs, merge packet acceptance or precise single-unit blocker, and
canonical WorkIntent context state without graph-node shard explosion,
default synthesis, graph repair/no-progress relapse, runtime semantic
truncation, or generic worker adapter failure.
