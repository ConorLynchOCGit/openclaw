---
summary: "P0 spec for replacing graph-level context shard explosion with a payload-backed context frontier lifecycle, shard manifests, merge packets, and consumer-bound context readiness."
title: "Context Frontier Lifecycle And Shard Manifests"
---

# Context Frontier Lifecycle And Shard Manifests

Date: 2026-05-26

Status: superseded foundation/design-history spec. This spec follows the replay failure
in `product-spec-replay-mpmx7eng`, where Product/Spec planning advanced past
packet reuse and WorkIntent planning, then failed at the intersection of
context scouts and implementation readiness. Active DB-ranked execution is
now consolidated under
[Code-Verified Product/Spec Blocker Closure Plan](/projects/execution-platform/specs/code-verified-product-spec-blocker-closure-plan)
and
[Node-Local Context Demand And Legacy Evisceration](/projects/execution-platform/specs/node-local-node-resource-demand-and-legacy-evisceration).
Manifest-only context frontier storage may be reused internally by specialist
context scout subturns, but it is no longer the default production path from
packets to implementation.

Supersession rule: context frontier requests, shard manifests, shard packets,
handoffs, and merge packets are internal fulfillment details for a
consumer-bound `NodeResourceDemandSession` unless a workflow explicitly promotes
them to first-class graph work. They must not create graph-visible fanout or
unlock implementation directly.

Update after replay `product-spec-replay-mpmz6z7v`: the manifest-only graph
and payload-backed frontier foundation now exists, but the replay exposed the
next missing lifecycle transition after `ContextShardManifest` creation. The
execution and merge continuation is now specified in
[Context Frontier Shard Execution And Merge Lifecycle](/projects/execution-platform/specs/context-frontier-shard-execution-and-merge-lifecycle).

This is not a narrow context-scout bug. It is a control-plane lifecycle issue:
the platform has learned to detect oversized context requirements, but it
still materializes too much of the recovery path as graph topology and node
metadata. The fix must strengthen the general-purpose orchestrator/scheduler
architecture, not optimize around one Product/Spec proof case.

## Evidence From The Latest Proof

The latest replay from completed packets showed:

- packets reused successfully;
- scheduler accepted a WorkIntent-style graph;
- the old zero-edge orphan context-scout shape did not recur;
- context supply became the next active frontier;
- five context scout nodes began execution;
- two context scout execution packets were blocked before provider invocation
  by `context_scout_payload_over_profile_bound`;
- runtime structural resharding attempted to recover by creating child
  context scout packets and graph nodes;
- graph shape expanded to roughly `158` nodes / `162` edges with roughly
  `149` `execution_platform.context_scout_execution_packet` artifacts;
- several branches then failed with `output artifact refs exceeds 24 items`;
- terminal readback collapsed to generic `worker_adapter_threw:unclassified`
  / "blocking commitments remain open" instead of reporting the exact
  context-frontier blocker.

The immediate storage bug is that graph-visible output refs exceeded a
bounded string-array contract. The higher-level defect is that structural
context resharding became graph-node fanout rather than payload-backed
context-resource execution.

## Is Large Fanout Expected?

Some fanout is expected in a real Product/Spec proof. A large owner prompt can
produce many commitments, work intents, context requirements, implementation
tasks, validation tasks, review tasks, and readback gates.

This run's fanout is not the desired shape. Most of the new nodes were context
scout shards created to satisfy provider input limits. That is a resource
acquisition detail, not durable workflow topology. Healthy fanout should look
like this:

```text
Commitment Work Packets
  -> WorkIntentGraph
  -> consumer-bound ResourceRequirementPacket
  -> context frontier manifest
  -> bounded context shard executions
  -> merged context handoff
  -> NodeExecutionPacket hydration
  -> implementation / validation / review / closeout
```

The unhealthy shape is:

```text
WorkIntentGraph
  -> broad context scout execution packet
  -> provider profile block
  -> many child context scout graph nodes
  -> graph output-ref overflow
  -> terminal generic adapter failure
```

The platform should support many context shards, but shard count should not
translate one-for-one into graph node count or graph node output refs.

## Architectural Principle

Graph nodes schedule durable work. Payload-backed contracts define work and
resource detail.

Context sharding is resource execution detail unless a workflow definition
explicitly promotes a shard to a first-class graph node. The default Product/
Spec proof path must not turn provider-profile recovery into hundreds of
graph nodes.

Runtime owns:

- ids, refs, hashes, manifests, payload storage, and byte budgets;
- graph edges, consumer binding, lifecycle, replay epochs, and readiness
  projection;
- provider input preflight, structural sharding by declared refs, and
  storage limits;
- policy checks for raw storage, manifest bounds, and authority scope;
- deterministic merge mechanics over accepted model-authored handoffs.

Runtime does not own:

- semantic context sufficiency;
- target relevance;
- file usefulness;
- Product/Spec meaning;
- whether a context shard substantively answers its semantic question.

Those judgments must be model-authored or human-authored through explicit
tools and then structurally recorded by runtime.

## Target Lifecycle

The required context frontier lifecycle is:

```text
WorkIntent
  -> ResourceRequirementPacket
  -> ContextFrontierRequest
  -> ContextShardManifest
  -> ContextScoutShardExecutionPacket[]
  -> ContextShardHandoff[]
  -> ContextMergePacket
  -> WorkIntentContextSatisfactionState
  -> NodeExecutionPacket / resource materialization
```

### 1. ResourceRequirementPacket

Already established as the required boundary between WorkIntent and context
acquisition. It remains consumer-bound and payload-backed.

Required fields:

- `resourceRequirementRef`;
- `consumerNodeId`;
- `consumerBranchId`;
- `workIntentRef`;
- `contextPurpose`;
- `semanticQuestions`;
- `requiredResourceKinds`;
- `sourceCommitmentIds`;
- `candidateSourceRefs`;
- `candidateRepoAreaRefs`;
- `knownTargetRefs`;
- `knownValidationNeedRefs`;
- `downstreamCapabilityId`;
- `downstreamExecutionIntent`;
- `downstreamEvidenceMode`;
- `byteBudget`;
- storage flags.

Runtime validates presence, registered enum membership, consumer refs,
payload refs, and byte bounds. It does not judge whether the question is good.

### 2. ContextFrontierRequest

New payload-backed request object. It groups one or more compatible context
requirements for one consumer and one context purpose. It is the durable unit
the scheduler tracks instead of tracking every shard as a graph node.

Required fields:

- `frontierRequestRef`;
- `runtimeJobId`;
- `graphId`;
- `consumerNodeId`;
- `consumerBranchId`;
- `workIntentRef`;
- `resourceRequirementRefs`;
- `contextPurpose`;
- `downstreamCapabilityId`;
- `downstreamExecutionIntent`;
- `sourceCommitmentIds`;
- `providerProfileRef`;
- `maxInputBytes`;
- `requestedTimeoutMs`;
- `status`: `planned | sharding_required | shard_execution_ready |
executing_shards | merge_required | satisfied | blocked | needs_review`;
- `nextLegalTransition`;
- `reasonCodes`;
- storage flags.

Graph metadata may store the request ref, status, counts, hash, and bounded
summary only. The request body belongs in payload artifact storage.

### 3. ContextShardManifest

New payload-backed manifest produced when the exact provider preflight shows
the frontier request is too large, or when policy chooses shard execution
before provider invocation. This is not a graph patch body.

Required fields:

- `shardManifestRef`;
- `parentFrontierRequestRef`;
- `parentResourceRequirementRefs`;
- `shardUnitKind`: `resource_requirement | source_commitment |
semantic_question | bounded_repo_context_ref | source_prompt_body_ref |
model_authored_scope_ref`;
- `losslessStructuralSplit`: boolean;
- `modelAuthoredScopeRef`: nullable ref when a model explicitly narrows the
  context scope;
- `shardCount`;
- `shardRefs`;
- `shardPacketRefs`;
- `coverage`: declared source commitments, requirements, semantic questions,
  repo refs, source prompt refs;
- `singleUnitBlockerRef`: nullable;
- `maxShardInputBytes`;
- `maxInputBytes`;
- `status`;
- storage flags.

The shard manifest may contain many shard refs because it is a payload
artifact. Graph node metadata and graph node `outputArtifactRefs` may contain
at most a bounded manifest ref plus counts and hashes.

### 4. ContextScoutShardExecutionPacket

This is a narrower form of `ContextScoutExecutionPacket`. It must describe one
provider-safe shard and keep the model's job small:

- answer one declared semantic question or small compatible set;
- inspect only selected candidate refs or selected source prompt sections;
- emit one model-authored shard handoff;
- declare limitations.

The packet must not carry every commitment summary, every source prompt
section summary, every repo context summary, and every validation ref. It
receives the minimum bundle needed for its shard.

### 5. ContextShardHandoff

Model-authored handoff for one shard. Required fields:

- `shardHandoffRef`;
- `shardRef`;
- `frontierRequestRef`;
- `consumerNodeId`;
- `targetCommitmentIds`;
- `relevantFiles`;
- `existingPatterns`;
- `risks`;
- `recommendedEditPoints`;
- `validationSuggestions`;
- `handoffSummaryForImplementation`;
- `limitations`;
- `confidence`;
- `modelAuthoredSufficiencySignal`: `sufficient | partial | insufficient`;
- storage flags.

Runtime may verify refs exist and are in declared scope. Runtime may not
declare the handoff semantically sufficient on its own.

### 6. ContextMergePacket

The merge packet is the durable boundary between sharded context acquisition
and consumer readiness.

Required fields:

- `contextMergePacketRef`;
- `frontierRequestRef`;
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
- `consumerWaiverRef`: nullable;
- `status`: `accepted | accepted_with_limitations | blocked |
needs_review`;
- `nextLegalTransition`;
- storage flags.

Runtime can merge lists, refs, hashes, and counts. A model or human must
author the sufficiency review when semantic sufficiency matters.

### 7. WorkIntentContextSatisfactionState

Canonical readiness state for the consumer WorkIntent:

- `contextStatus`: `not_required | required | in_progress | satisfied |
satisfied_with_limitations | blocked | needs_review`;
- `frontierRequestRef`;
- `contextMergePacketRef`;
- `acceptedResourceHandoffRefs`;
- `limitationRefs`;
- `consumerWaiverRef`;
- `missingContextRefs`;
- `nextLegalTransition`;
- `readinessStateRef`;
- reason codes.

Implementation/resource materialization may only proceed from `satisfied`, or
from `satisfied_with_limitations` when an explicit consumer waiver exists.

## Small-Verb Tool Surface

The context frontier lifecycle must use small model-facing and scheduler-facing
verbs. Models should choose semantic scope and author handoff substance; the
runtime should compile ids, refs, graph writes, storage, and lifecycle.

### Scheduler / Runtime Tools

- `context.requirement.create_frontier_request`
  - Compile a payload-backed request from accepted requirements and consumer.
- `context.requirement.split_for_profile`
  - Produce `ContextShardManifest` from declared refs after exact preflight.
- `context.frontier.persist_shard_manifest`
  - Persist the manifest and expose only manifest refs/counts in graph state.
- `context.frontier.record_single_unit_blocker`
  - Record exact blocker when one declared shard still exceeds profile.
- `context.frontier.mark_shards_ready`
  - Mark shard packets ready for provider calls without creating graph nodes.
- `context.requirement.merge_handoffs`
  - Merge accepted shard handoffs into a `ContextMergePacket`.
- `scheduler.accept_context_for_consumer`
  - Update canonical `WorkIntentContextSatisfactionState`.
- `scheduler.promote_context_satisfied_intent`
  - Move a consumer WorkIntent to resource materialization only after
    readiness is canonical.

### Model-Facing Context Scout Tools

- `context_scout.get_shard_brief`
  - Load one shard brief and its legal refs.
- `context_scout.request_repo_ref`
  - Request one file/ref/window by handle and reason.
- `context_scout.report_relevant_file`
  - Record a model-authored relevance finding.
- `context_scout.report_existing_pattern`
  - Record a model-authored implementation pattern.
- `context_scout.report_risk`
  - Record a model-authored context or implementation risk.
- `context_scout.recommend_edit_point`
  - Record a model-authored edit point recommendation.
- `context_scout.recommend_validation`
  - Record validation suggestions.
- `context_scout.submit_shard_handoff`
  - Finalize one shard handoff.
- `context_scout.mark_insufficient_context`
  - Return a precise context blocker without pretending success.

### Sufficiency / Merge Review Tools

- `context.review_shard_handoffs`
  - Model-authored sufficiency review over accepted shard handoffs.
- `context.mark_merge_accepted`
  - Runtime records accepted sufficiency review and merge packet.
- `context.request_additional_shards`
  - Model-authored request for missing context, compiled by runtime.
- `context.record_consumer_waiver`
  - Human/model-authorized waiver for accepted-with-limitations context.

## Graph Topology Policy

Default graph-visible topology:

```text
WorkIntent node
  -> context frontier request/ref state
  -> resource materialization / implementation node
```

Graph-visible nodes must not grow one-for-one with context shards by default.
The graph may show:

- the consumer WorkIntent;
- a single context acquisition/supply node if the workflow uses graph-visible
  context work;
- a merge/acceptance node if the workflow explicitly models it;
- downstream resource/implementation nodes.

Shard execution details belong in payload-backed artifacts and scheduler
events, not graph node lists, unless an explicit workflow definition opts in.

If an opt-in workflow promotes shard work to graph nodes, each promoted node
must still:

- have a consumer edge;
- carry a `ContextShardManifest` ref;
- keep output refs bounded to a shard result ref;
- avoid raw prompt/response/provider/tool storage;
- use the same merge packet before consumer readiness.

## Storage And Manifest Policy

Graph metadata must be manifest-only:

- refs;
- hashes;
- counts;
- bounded summaries;
- status;
- next legal transition;
- reason codes;
- pointer to full payload artifact.

Graph metadata must not store:

- full context requirements;
- full shard packet arrays;
- full context handoffs;
- full target snapshots;
- full provider prompts;
- full provider responses;
- raw tool logs;
- raw DB rows;
- unbounded output refs.

For bulk output refs, store:

```text
outputArtifactRefs: [context-shard-manifest://...]
metadata: {
  shardManifestRef,
  shardCount,
  acceptedShardCount,
  failedShardCount,
  sampleShardRefs,
  rawPromptStored: false,
  ...
}
```

The full list belongs in `ContextShardManifest`.

## Provider Input Policy

The context frontier lifecycle must not solve oversize input by arbitrary
truncation.

Legal recovery paths:

1. split by declared structural refs;
2. request a model-authored scope revision;
3. request a source prompt excerpt by selected section ref;
4. request a narrower repo/file window by handle;
5. produce a single-unit-over-profile blocker with exact bytes, max bytes,
   unit refs, and next legal transition.

Illegal recovery paths:

- deterministic semantic summarization of context;
- substring-based scope narrowing;
- dropping commitments because they look less relevant;
- silently increasing provider profile bounds;
- treating provider preflight failure as context accepted;
- turning every shard into durable graph topology by default.

## Readback Requirements

Owner readback and latest-run-state must show:

- `firstOpenGate`: `context_frontier`, `context_shard_execution`,
  `context_merge_required`, `context_single_unit_over_profile`, or
  `context_satisfied_ready_for_resource_materialization`;
- `frontierRequestRef`;
- `resourceRequirementRefs`;
- `shardManifestRef`;
- shard counts;
- accepted / failed / blocked shard counts;
- consumer WorkIntent id;
- dependent implementation/resource node ids;
- exact provider profile bound that caused a split;
- next legal transition;
- blocker code and schema/policy path when applicable;
- whether semantic sufficiency was model-authored, human-authored, or pending.

Readback must not collapse this failure class into:

- generic `worker_adapter_threw`;
- generic `resource_fulfillment`;
- generic "blocking commitments remain open";
- stale `commitment_work_packets` gate.

## Replay Requirements

Add or update replay boundaries:

- after WorkIntent acceptance;
- before context frontier request creation;
- after context frontier request creation;
- after shard manifest creation;
- after shard handoff collection;
- after context merge packet creation;
- before resource materialization;
- before worker execution.

Replay must be production-equivalent. It must not inject synthetic
context-synthesis nodes, resurrect stale context-first topology, or bypass the
frontier lifecycle.

## Acceptance Criteria

This queue item passes only when all of the following are true:

1. A Product/Spec-sized context requirement that exceeds provider profile
   produces a `ContextShardManifest`, not hundreds of graph nodes.
2. Graph node `outputArtifactRefs` remain bounded to manifest refs and cannot
   throw `output artifact refs exceeds 24 items` from shard fanout.
3. Shard execution can run through payload-backed shard packets and produce
   model-authored shard handoffs.
4. A merge packet is required before consumer WorkIntent context readiness can
   be marked satisfied.
5. `accepted_with_limitations` context cannot unlock implementation without
   explicit consumer waiver.
6. Readback names the context-frontier state and blocker precisely.
7. Repeated shard failures collapse into one root-cause artifact without
   erasing successful sibling/shard evidence.
8. No deterministic semantic substring classifiers, Product/Spec-specific
   heuristics, or runtime-authored context sufficiency are introduced.
9. Focused tests and one Product/Spec replay from completed packets prove the
   new frontier lifecycle reaches either merged context readiness or a precise
   single-unit blocker.
10. The next full Product/Spec proof is not run until this lifecycle passes
    from the latest replay boundary.

## Work Queue Item

Canonical item:

`openclaw-convergence.context-frontier-lifecycle-shard-manifests`

Priority:

P0 before `openclaw-convergence.active-queue-34`.

Depends on:

- `openclaw-convergence.scheduler-workintent-graph-demand-context-gate`;
- `openclaw-convergence.executable-spine-02-resource-requirement-reshard`
  where already closed or superseded by this lifecycle item.

Blocks:

- full Product/Spec Planning Workflow Plugin Production Proof;
- any claim that demand-driven context has been proven at Product/Spec scale;
- any implementation-node proof that depends on accepted context.

## Relation To Existing Specs

This spec extends, but does not replace:

- [Control-Plane Executable Spine Recovery](/projects/execution-platform/specs/control-plane-executable-spine-recovery)
- [Context Scout Execution Packet And Request-Context Repair](/projects/execution-platform/specs/context-scout-execution-packet-and-request-context-repair)
- [Execution Contract Spine, Context Requirements, And Frontier State](/projects/execution-platform/specs/execution-contract-spine-resource-requirements-and-frontier-state)
- [Runtime Artifact Payload Store And Bounded Manifests](/projects/execution-platform/specs/runtime-artifact-payload-store-and-bounded-manifests)
- [Operator Frontier Readback And Latest Run State](/projects/execution-platform/specs/operator-frontier-readback-and-latest-run-state)

The extension is specific: context shard execution is now a payload-backed
frontier lifecycle with merge/satisfaction state, not graph-node fanout.
