---
summary: "Control-plane executable spine recovery plan for making Product/Spec proof and future workflow execution pass through canonical WorkIntent, capability, resource, execution, validation, and evidence contracts."
title: "Control-Plane Executable Spine Recovery"
---

# Control-Plane Executable Spine Recovery

Date: 2026-05-26

Status: P0 pre-Product/Spec proof architecture. This spec supersedes any
remaining pre-proof path that treats graph nodes, context scout prose, context
synthesis groups, replay fixtures, or worker adapters as executable semantic
truth.

The goal is not to make the current Product/Spec proof barely pass. The goal is
to harden the general Execution Platform into a robust, dynamic,
domain-general orchestrator/scheduler where Product/Spec coding execution is
the first high-pressure proof case.

## Diagnosis

The repeated proof failures are not one Kimi failure, one Qwen failure, one
context scout bug, or one scheduler schema bug. They are a control-plane
contract failure.

The platform has useful pieces:

- Mission Ledger and Commitment Work Packets.
- `WorkIntent`.
- `ResourceRequirementPacket`.
- context scout execution packets.
- payload-backed runtime artifacts.
- `NodeExecutionContract`.
- `NodeExecutionPacket`.
- domain resource packets.
- `NodeReadinessState`.
- branch/frontier readback.
- small-verb worker tools.
- validation and evidence projections.

The brittle part is that these pieces are still allowed to skip each other or
reinterpret each other. A context group can look like implementation work. A
read-only work intent can reach an edit worker. A graph node can carry broad
directory refs that are wider than context recommendations. A context scout
can be created before a consumer-bound context requirement. A preflight blocker
can be detected without a legal recovery transition. A replay boundary can
reuse stale topology. A proof gate can read stale `firstOpenGate` state while
the real blocker is several stages deeper.

The forbidden class is broader than the old failure:

```text
context_synthesis group -> implementation node
```

The broader forbidden class is:

```text
unhydrated graph node -> executable worker dispatch
```

Graph nodes schedule work. Payload-backed contracts define work. Runtime
validates contracts and authority. Models author semantic choices through
bounded tools.

## Governing Spine

Every complex workflow must pass through this spine:

```text
Owner prompt
  -> obligation graph / Mission Ledger
  -> Commitment Work Packets
  -> WorkIntentGraph
  -> capability validation
  -> ResourceRequirementPacket
  -> context/resource executor packets
  -> context handoff / resource evidence
  -> NodeExecutionContract
  -> NodeExecutionPacket
  -> domain resource packet
  -> worker small-verb loop or non-coding executor
  -> validation phase result
  -> typed evidence claim
  -> branch-scoped frontier/readback state
  -> review/closeout
```

The spine is domain-general. In coding, domain resources are file snapshots,
edit scopes, validation commands, and diff/evidence refs. In Product/Spec
Planning, domain resources include Planning Intent Records, ResearchBriefs,
Planning Capsules, HumanPlanningDecisions, ActionGraphProposals, and compiled
runtime plans. In future workflows, domain resources may be datasets, CRM
records, email/message threads, support tickets, browser captures, calendars,
or external API handles.

## 2026-05-26 Context Frontier Lifecycle Update

The replay `product-spec-replay-mpmx7eng` proved that the old orphan
context-scout graph failure is not the only issue. The scheduler accepted
WorkIntent-style structure, then context execution expanded into roughly 150
context-scout/shard artifacts and failed graph-visible output-ref bounds
before implementation. That failure is now governed by
[Context Frontier Lifecycle And Shard Manifests](/projects/execution-platform/specs/context-frontier-lifecycle-and-shard-manifests).

The executable spine therefore requires one more hard rule:

```text
ResourceRequirementPacket
  -> ContextFrontierRequest
  -> ContextShardManifest
  -> ContextScoutShardExecutionPacket[]
  -> ContextShardHandoff[]
  -> ContextMergePacket
  -> WorkIntentContextSatisfactionState
  -> NodeExecutionPacket
```

Context shard execution is not default graph topology. Shards may be numerous,
but graph nodes must carry only manifest refs, counts, hashes, status, and
next transition. Full shard refs, packet bodies, handoff bodies, and merge
inputs belong in payload artifacts. Runtime may structurally split by declared
refs and enforce provider profile bounds, but it must not semantically
summarize, rank, or truncate context to make a call fit.

## Runtime Vs Model Authority

Runtime may own:

- ids, refs, hashes, versions, manifests, storage, and payload boundaries;
- graph writes, dependency edges, branch ids, lifecycle, and replay epochs;
- schema validation, enum membership, registered capability existence, and
  provider/tool eligibility;
- byte budgets, timeout policy, rate/concurrency policy, payload sharding, and
  bounded diagnostics;
- authority scopes, path scopes, locks, validation command execution, and
  rollback mechanics;
- projection of readiness, first open gate, branch state, blocker class, and
  next legal transition.

Runtime must not own:

- semantic work intent;
- qualitative context sufficiency;
- target usefulness or file relevance;
- implementation design quality;
- evidence sufficiency beyond structural linkage;
- Product/Spec meaning;
- commitment closure judgment;
- "complexity" or "importance" scoring.

Runtime may validate that a model-authored semantic value is declared,
registered, compatible with the capability manifest, and backed by required
refs. It may not invent or infer the value from substrings, file names,
artifact names, Product/Spec vocabulary, node titles, or error messages.

## 1. WorkIntent Acceptance And Capability Binding

### Purpose

`WorkIntentGraph` is the first post-packet semantic work boundary. It must be
accepted before context scouts, resource materialization, or workers run.

### Required WorkIntent Fields

Each `WorkIntent` must carry model-authored:

- `intentId`;
- `semanticIntent`;
- `capabilityId`;
- `targetCommitmentIds`;
- `expectedEvidenceMode`;
- `resourceRequirementClass`;
- `objective`;
- `expectedOutput`;
- `consumerRefs`;
- `dependencyRefs` or explicit independent-root declaration;
- `semanticRationale`.

Runtime adds or validates:

- stable ids and refs;
- manifest refs and hashes;
- registered enum/capability membership;
- dependency structure;
- lifecycle state;
- storage flags;
- provenance refs;
- bounded summaries.

### Small-Verb Tools

Model-facing and scheduler-facing tools should be verbs:

- `scheduler.work_intent.propose`
- `scheduler.work_intent.accept_roots`
- `scheduler.work_intent.link_dependencies`
- `scheduler.work_intent.set_capability`
- `scheduler.work_intent.set_evidence_mode`
- `scheduler.work_intent.mark_non_runnable`
- `scheduler.work_intent.request_revision`

The model chooses semantic intent and capability. Runtime compiles stable ids,
edges, manifests, and lifecycle.

### Acceptance Rules

- Multi-node zero-edge graphs are invalid unless every node has an explicit
  independent-root declaration and a runtime-valid capability.
- WorkIntents are non-runnable until capability and resource requirements are
  accepted.
- No context scout may exist as production work before an accepted consumer
  WorkIntent or contract exists.
- No implementation worker may run from a `source_grounding`, `review`,
  `validation`, `readback`, `closeout`, or diagnostic-only WorkIntent unless a
  later model-authored transition promotes it to an executable edit capability.

## 2. Capability Manifest And Legal Transitions

### Purpose

The capability manifest is the execution gate. It describes what a capability
can do, what resources it needs, what evidence it can produce, which tools it
may use, and what transition may legally follow.

### Capability Manifest Fields

Each capability must declare:

- `capabilityId`;
- `capabilityVersion`;
- runnable vs non-runnable;
- domain;
- allowed semantic intents;
- required context/resource classes;
- required domain resource packet kind;
- allowed tool families;
- allowed executor roles;
- authority scope requirements;
- validation phase requirements;
- expected evidence claim kinds;
- legal next transitions;
- blocker classes;
- repair transition tools;
- readback fields.

### Small-Verb Tools

- `capability.lookup`
- `capability.validate_intent`
- `capability.require_resources`
- `capability.require_validation`
- `capability.require_evidence`
- `capability.list_legal_transitions`

Runtime validates manifest conformance. It does not decide whether the chosen
capability is semantically "good"; a model/human review can reject the choice
qualitatively through a typed review artifact.

## 3. ResourceRequirementPacket Compiler

### Purpose

Context is not default graph glue. Context is a consumer-bound resource.

The valid path is:

```text
WorkIntent or NodeExecutionContract
  -> ResourceRequirementPacket
  -> ContextScoutExecutionPacket
  -> ResourceHandoffPacket
  -> WorkIntent context resolution
```

### ResourceRequirementPacket Fields

Required fields:

- `requirementId`;
- `consumerWorkIntentId`;
- `consumerContractRef` when available;
- `targetCommitmentIds`;
- `semanticQuestion`;
- `expectedUse`;
- `candidateSourceRefs`;
- `candidateRepoRefs`;
- `resourceRequirementClass`;
- `acceptanceContract`;
- `limitationPolicy`;
- `providerProfileRef`;
- `maxInputBytes`;
- `maxTimeoutMs`;
- `allowedToolFamilies`;
- raw-storage false flags.

### Small-Verb Tools

- `scheduler.context.requirement.create`
- `scheduler.context.requirement.attach_consumer`
- `scheduler.context.requirement.select_candidate_refs`
- `scheduler.context.requirement.compile_scout_packet`
- `scheduler.context.requirement.reject_orphan_scout`
- `scheduler.context.requirement.request_revision`

### Orphan Scout Rule

A `context_scout` node is invalid unless it has:

- a `ResourceRequirementPacket` ref;
- a declared consumer WorkIntent/contract;
- an outgoing `context_supplies` edge to that consumer;
- or an explicit workflow coordination policy marking it non-unlocking.

Diagnostic-only context nodes cannot unlock implementation.

## 4. Structural Context Resharding

### Purpose

The latest context scout failure proved exact preflight is useful but
incomplete. The runtime correctly detected over-budget context scout packets,
but it only recorded `structural_reshard_required`; it did not execute a legal
recovery transition.

### Required Behavior

When exact provider preflight blocks a context scout packet, runtime must not
truncate or semantically summarize content. It must structurally reshard by
already-declared units:

- target commitment ids;
- context requirement ids;
- semantic question groups;
- candidate source refs;
- candidate repo refs;
- bounded file windows;
- context broker request refs.

If a single structural unit still exceeds the provider profile, runtime blocks
with an exact `single_unit_over_profile_bound` blocker and required next
transition. It must not silently drop content.

### Small-Verb Tools

- `scheduler.context.reshard_requirement`
- `scheduler.context.retry_failed_shard`
- `scheduler.context.merge_shard_handoffs`
- `scheduler.context.accept_partial_handoff`
- `scheduler.context.block_single_unit_over_profile`

### Implementation Status

The production compiler now exposes structural shard metadata directly on
`ResourceRequirementPacket` children. Each shard carries the parent requirement
ref/hash, shard unit kind, shard unit refs, shard index/count, and raw-storage
false flags. The reshard compiler evaluates the exact model-facing context
scout prompt before any provider call; if the parent packet exceeds the
`local_semantic_extraction` provider profile, it attempts lossless splits by
declared requirement, commitment, semantic question, bounded repo-context ref,
and source-prompt section ref. It does not truncate or semantically summarize
content to satisfy the provider profile.

When a legal split fits the profile, the dynamic graph runner persists the
child `ContextScoutExecutionPacket` artifacts, records the
`scheduler.context.reshard_requirement` and
`scheduler.context.merge_shard_handoffs` tool calls, and materializes planned
child `context_scout` graph nodes linked to the parent. When no legal split
fits, runtime records `scheduler.context.block_single_unit_over_profile` with a
precise single-unit blocker rather than calling a model with an over-profile
payload.

Open caveat: the standalone context-scout executor can persist and report
structural shard artifacts but does not own runtime graph mutation, so graph
child-node materialization is currently live-wired through the scheduler-backed
dynamic runner.

### Shard Invariants

Every child shard must preserve:

- parent requirement ref;
- consumer WorkIntent/contract ref;
- target commitment ids;
- candidate refs;
- resource class;
- acceptance contract;
- limitation policy;
- provider profile and exact preflight diagnostics.

Shard outputs merge structurally by refs. Model-authored handoff substance
remains attached to each shard. A later model/human sufficiency review judges
semantic completeness.

## 5. NodeExecutionContract And NodeExecutionPacket Hydration

### Purpose

Workers may run only from hydrated executable packets. Worker adapters are not
allowed to recover from upstream ambiguity by guessing what the task means.

### Contract To Packet Path

```text
accepted WorkIntent
  -> capability validation
  -> accepted context/resource readiness
  -> NodeExecutionContract
  -> NodeExecutionPacket
  -> domain resource packet
  -> worker dispatch
```

### NodeExecutionPacket Must Include

For coding:

- target files or explicit new-file intent;
- bounded snapshots/windows;
- allowed edit scopes;
- forbidden scopes;
- source commitments;
- context handoff refs;
- validation refs or structural validation fallback;
- evidence mode;
- legal tools;
- stop conditions;
- rollback/review policy.

For non-coding domains:

- domain resource handles;
- accepted context refs;
- allowed operations;
- validation/check requirements;
- evidence expectations;
- legal transitions.

### Small-Verb Tools

- `resource.requirement.compile`
- `resource.materialize_node_packet`
- `resource.materialize_domain_packet`
- `node.execution_packet.validate_hydration`
- `node.execution_packet.block_missing_resource`
- `node.execution_packet.project_readiness`

## 6. Worker Small-Verb Loop

### Purpose

Workers should not mutate DAGs, invent execution contracts, or submit large
JSON envelopes. They should operate through small verbs against one hydrated
task.

### Coding Worker Happy Path

```text
task.get_brief
repo.open_snapshot_window
worker.edit.plan
worker.patch.force_author_from_plan
worker.patch.author_edit
worker.edit.apply_patch
worker.validation.run_structural_default or checks.run
worker.evidence.claim_from_validation
task.submit_result
```

### Blocker Path

```text
task.get_brief
repo.open_snapshot_window
worker.edit.plan
worker.progress.mark_no_edit_blocker
task.submit_result(status=blocked)
```

### Tooling Requirements

Required small verbs:

- `worker.context.request_file_snapshot`
- `worker.edit.plan`
- `worker.patch.force_author_from_plan`
- `worker.patch.author_edit`
- `worker.repair.mark_upstream_blocker`
- `worker.validation.run_structural_default`
- `worker.evidence.claim_from_validation`
- `worker.progress.mark_no_edit_blocker`
- `worker.review.inspect_pending_diff`

The model makes semantic edit choices. Runtime owns patch envelope, path scope,
application, rollback, validation execution, and evidence refs.

## 7. Branch-Scoped Readiness And Root-Cause Collapse

### Purpose

Frontier execution must preserve sibling success, isolate branch failure, and
stop proving the same blocker repeatedly.

### Canonical Readiness Fields

`NodeReadinessState` and branch state must expose:

- branch id;
- node id;
- WorkIntent ref;
- contract ref;
- packet refs;
- domain resource refs;
- context requirement refs;
- accepted/missing/blocked resources;
- capability;
- evidence mode;
- validation phase;
- blocker class;
- reason codes;
- next legal transition;
- dependent consumers;
- sibling evidence refs.

### No-Progress Signature

Repeated failure collapses by a structural signature:

- stage;
- node kind;
- capability;
- semantic intent as declared;
- evidence mode;
- missing fields;
- reason codes;
- schema/policy path;
- contract version;
- resource requirement class.

This is structural. It is not semantic scoring.

### Small-Verb Tools

- `frontier.evaluate_ready_branches`
- `frontier.record_branch_result`
- `frontier.collapse_repeated_blocker`
- `frontier.spawn_consumer_repair`
- `frontier.preserve_sibling_evidence`
- `readback.project_branch_state`

## 8. Readback And Observability

### Purpose

Owner readback must tell the operator where the run actually is. It must not
project stale checkpoint labels as live gates.

### Required Readback Fields

Every active/blocked run should expose:

- runtime job id;
- workflow id;
- current phase;
- current model/provider;
- active node ids;
- branch ids;
- first open gate from canonical readiness/frontier state;
- contract refs;
- context requirement refs;
- blocked resource refs;
- exact blocker class;
- schema/policy path;
- next legal transition;
- walltime by phase;
- model-call input/output bytes;
- token usage when available or labeled estimate when not;
- raw-storage false flags.

### Scheduler Model-Call Envelope

Long model calls cannot expose hidden reasoning, but they must expose:

- decision slot;
- allowed tool family;
- input bytes;
- graph counts;
- commitment counts;
- elapsed time;
- heartbeat age;
- output bytes when available;
- finish reason when available;
- accepted/rejected tool call summary;
- schema/policy error path.

### Small-Verb Tools

- `readback.project_latest_run_state`
- `readback.project_first_open_gate`
- `readback.project_scheduler_call`
- `readback.project_blocker`
- `readback.project_next_transition`

## 9. Replay Strategy

### Principle

Replay must be production-faithful or explicitly diagnostic-only. A replay
harness must not resurrect retired context synthesis, stale child nodes,
legacy queued runners, or broad packet context glue.

### Required Boundaries

Add or harden replay boundaries:

- `after_commitment_packets`;
- `after_work_intent_acceptance`;
- `before_resource_requirement_compile`;
- `after_resource_handoff`;
- `before_resource_materialization`;
- `after_resource_materialization`;
- `before_worker_execution`;
- `after_worker_edit_before_persistence`.

Each boundary must store:

- boundary epoch;
- payload refs;
- hashes;
- readiness state;
- branch state;
- next legal transition;
- unsupported/diagnostic-only policy.

### Proof Order

The next proof sequence is:

1. replay from completed packets and accept WorkIntentGraph;
2. compile ResourceRequirementPackets;
3. structurally reshard oversized context packets and run context scouts;
4. resolve context for WorkIntents;
5. materialize one executable `NodeExecutionPacket`;
6. run one worker smoke that makes a bounded edit or returns a precise upstream blocker;
7. validate and emit evidence;
8. run the Product/Spec proof from the top only after the replay path passes.

## 10. Model Policy

### Policy Split

Use high-reasoning models for:

- global decomposition;
- architecture decisions;
- WorkIntentGraph semantic review;
- capability-fit review;
- context/evidence sufficiency review;
- closeout acceptance.

Use fast/cheap models for:

- local source-ref selection;
- bounded context scout work;
- schema normalization through small tools;
- patch authoring from one plan and one snapshot window;
- validation classification;
- artifact summarization.

Runtime owns schema, lifecycle, retries, and provider diagnostics. GPT rescue
must not silently convert an unstable boundary into a proof success.

## 11. Toolification Program

The full small-verb facade remains a first-class roadmap, but the pre-proof
slice must implement the verbs required to make the executable spine pass.

### Required Pre-Proof Tools

Scheduler and WorkIntent:

- `scheduler.work_intent.propose`
- `scheduler.work_intent.accept_roots`
- `scheduler.work_intent.link_dependencies`
- `scheduler.work_intent.request_revision`
- `scheduler.work_intent.mark_non_runnable`

Capability:

- `capability.lookup`
- `capability.validate_intent`
- `capability.require_resources`
- `capability.list_legal_transitions`

Context:

- `scheduler.context.requirement.create`
- `scheduler.context.requirement.compile_scout_packet`
- `scheduler.context.reshard_requirement`
- `scheduler.context.retry_failed_shard`
- `scheduler.context.merge_shard_handoffs`

Resource:

- `resource.requirement.compile`
- `resource.materialize_node_packet`
- `resource.materialize_domain_packet`
- `node.execution_packet.validate_hydration`

Frontier/readback:

- `frontier.evaluate_ready_branches`
- `frontier.collapse_repeated_blocker`
- `readback.project_latest_run_state`
- `readback.project_first_open_gate`

Worker:

- `worker.context.request_file_snapshot`
- `worker.edit.plan`
- `worker.patch.force_author_from_plan`
- `worker.patch.author_edit`
- `worker.validation.run_structural_default`
- `worker.evidence.claim_from_validation`
- `worker.progress.mark_no_edit_blocker`

### Post-Proof Tool Facade

After the first end-to-end proof, continue the broader facade expansion:

- `task.*`
- `repo.*`
- `context.*`
- `edit.*`
- `checks.*`
- `worktree.*`
- `artifact.*`
- `review.*`
- `message.*`
- `approval.*`
- `memory.*`
- `telemetry.*`

Do not lose this catalog. It is the intended architecture, but the pre-proof
slice should implement the verbs that unblock the executable spine.

## 12. Work Queue Structure

The DB-backed pre-proof queue should be:

1. WorkIntent Acceptance And Capability Manifest Gate.
2. ResourceRequirement Compiler And Structural Resharding.
3. NodeExecutionPacket Hydration And Resource Readiness Gate.
4. Worker Small-Verb One-Edit Canary.
5. Branch Readiness, Root-Cause Collapse, And Owner Readback.
6. Replay Boundary Fidelity And Product/Spec Proof Gate.
7. Product/Spec Planning Workflow Plugin Production Proof.

The existing `scheduler-workintent-graph-demand-context-gate` item becomes the
first item in this tranche rather than a narrow context-scout fix.

## 13. Acceptance Criteria

The tranche is complete only when:

- DB Work Queue ranks all six recovery gates before
  `openclaw-convergence.active-queue-34`;
- docs, index, status, current slice, roadmap, and decisions agree on the
  governing architecture;
- no production/replay path creates default context synthesis between packets
  and implementation;
- no context scout runs without a consumer-bound `ResourceRequirementPacket`;
- oversized context scout packets structurally reshard or block with a precise
  single-unit-over-profile blocker;
- no worker runs without a hydrated `NodeExecutionPacket` and domain resource
  packet;
- at least one Product/Spec-derived coding worker smoke makes a bounded edit,
  validates, emits evidence, and rolls back/persists according to review
  policy;
- readback surfaces the true first open gate, blocker, node, branch, contract,
  context requirement, and next legal transition;
- no deterministic semantic substring classifiers, Product/Spec-specific
  runtime shortcuts, broad fallback runners, raw prompt/provider logs, or
  body-in-metadata storage are introduced.
