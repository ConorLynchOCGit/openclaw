# Split-Required Resource Materialization Transition

Date: 2026-05-22

Status: implemented and replay-proven as a pre-Product/Spec proof gate.

Work Queue item:
`openclaw-convergence.split-required-resource-materialization-transition`.

Latest replay evidence:

- runtime job: `product-spec-replay-mpika9c1`
- graph:
  `team-run-native-exec-7507e654ba4db90c-checkpoint-replay-mpika9c0-runtime-work-graph`
- replay boundary: `before-resource-materialization`
- proof artifact:
  `.artifacts/execution-platform/product-spec-replay-proof-resource-materialization/proof.json`
- status: `succeeded`
- materialization result count: 2
- ready `NodeExecutionPacket` count: 2
- created implementation task packet refs:
  - `runtime-work-graph://implementation-task-packet/g-fb280a92b0-implementation-wu-product-spec-runtime-hardening:implementation-task:1/0b333e61409121d9`
  - `runtime-work-graph://implementation-task-packet/g-fb280a92b0-implementation-wu-readback-evidence-hardening:implementation-task:1/499291774971d914`

The replay stopped before worker execution by design. It proved the transition
from failed broad resource materialization to file-resolved executable packet
frontier without rerunning upstream phases.

## Why This Exists

The latest full Product/Spec proof showed that the architecture is now closer
to the intended generic runtime, but one critical transition is still missing.

The proof passed through:

- UX-compatible native submission.
- source-prompt context indexing.
- Mission Ledger.
- Commitment Work Packets.
- staged scheduler graph creation.
- graph node Work Queue child sync.
- context scout execution.
- payload-backed artifact storage.
- canonical readiness and resource materialization gates.

It failed before implementation because one high-level implementation parent
node expanded into too many file-resolved tasks and exceeded resource packet
bounds. Runtime correctly refused to invoke the worker, but the scheduler did
not know how to convert the split-required materialization result into
executable child nodes.

Runtime evidence:

- runtime job: `native-exec-55dc1cc6a3e94232`
- Work Queue item: `product-spec-checkpointed-64c74c8c5ece-g6svuj`
- graph id: `team-run-native-exec-55dc1cc6a3e94232-runtime-work-graph`
- prompt hash:
  `64c74c8c5ecee1ac51099bccb895f3fe4f225778614692015ec2b4450d364922`
- graph reached 47 nodes, 49 edges, and 21 role invocations.
- 10/10 Commitment Work Packets completed with 0 packet failures, 0
  no-content responses, and 0 GPT rescue/fallbacks.
- terminal reason codes included:
  - `implementation_context_materialization_blocked`
  - `implementation_context_resource_packet_bounds_exceeded`
  - `implementation_context_resolved_target_file_refs_exceeds_packet_bound:120:100`
  - `post_context_task_split_required_for_file_resolved_microtasks`
  - `worker_adapter_threw:unclassified`
  - `scheduler_terminal_with_10_open_blocking_commitments`

## Diff From The Target Architecture

The first-principles target says every workflow phase must produce a bounded,
replayable, inspectable runtime object that is good enough for the next actor
to execute without guessing.

### What Exists

- Mission Ledger and Commitment Work Packets can produce meaningful
  model-authored work intent.
- context scout can run as a node and produce bounded handoff artifacts.
- large runtime bodies can be stored in the payload store with bounded
  manifests.
- graph metadata is increasingly manifest-only.
- `NodeReadinessState` exists as a canonical readiness object.
- resource materialization can block an implementation node before worker
  invocation when target refs exceed bounds.
- boundary replay can inspect payload-backed executable frontier nodes.
- a payload-backed worker smoke can hydrate `NodeExecutionPacket`,
  `CodingResourcePacket`, and implementation task packet bodies.
- replay can reconstruct accepted context handoffs from payload-backed
  context artifacts, including extension metadata, and can resolve symbolic
  handoff refs to the producing context node.
- replay and production materialization can prefer concrete model-authored
  edit-point refs over broad metadata directory seeds when building
  worker-ready target refs.

### What Is Missing

- full Product/Spec proof still has to show the ready packet frontier can
  execute through implementation, validation, evidence claims, and closeout.
- the replay harness still leaves an open process handle after emitting a
  successful proof result; this is a harness lifecycle/readback defect, not a
  materialization correctness defect.
- post-proof generic extraction should move the split transition into an
  even thinner workflow-agnostic resource-transition engine shared by all
  workflow plugins.

## Architecture Decision

Resource materialization is not only an accept/block gate. It is a graph
transition boundary.

When resource materialization returns `split_required`, runtime must mutate
the graph shape through the scheduler transition engine:

1. mark the parent node as aggregate/non-runnable;
2. persist split task packets as payload-backed artifacts;
3. compile executable child node specs from the accepted task packets;
4. create graph nodes and dependency/handoff edges for those children;
5. create or update generated Work Queue child items for the executable
   children;
6. evaluate `NodeReadinessState` for each child;
7. open only ready child nodes into the executable frontier;
8. preserve the parent as rollup/readback/evidence aggregation, not as a
   worker target.

This is generic runtime behavior. Coding implementation is the immediate
proof case, but the same transition applies when any workflow node expands
into multiple executable resource packets:

- planning action proposals;
- design asset tasks;
- marketing/content item batches;
- research/source review batches;
- QA/validation command groups;
- memory retrieval/context pack batches;
- human decision subquestions.

## Required Runtime Contract

### ResourceMaterializationResult

Every domain resource materializer must safe-return one of:

- `accepted`
- `split_required`
- `context_repair_required`
- `resource_repair_required`
- `needs_review`

For `split_required`, the result must include:

- parent node id.
- workflow id and graph id.
- target commitment ids.
- split packet refs.
- split packet hashes and byte counts.
- split packet count.
- accepted split count.
- rejected split count.
- reason codes.
- schema/bounds diagnostics.
- suggested child capability ids when known.
- dependency and consumer hints.
- validation/review/readback requirements.
- rollup/evidence aggregation requirement.
- raw-storage flags.

No `split_required` result may throw through the worker adapter.

### Parent Lifecycle

The parent node moves to a non-runnable lifecycle state:

- `split_materialized` when children are created successfully.
- `split_pending_child_creation` while child graph nodes are being persisted.
- `split_blocked` when child creation fails with exact diagnostics.
- `needs_review` only when runtime cannot compile children safely.

The parent cannot re-enter `resources_required` after a successful
`split_required` transition unless a new versioned materialization attempt is
explicitly requested.

### Child Node Compilation

Runtime compiles child nodes from split task packets. The model does not
author runtime-owned child node ids, executor keys, worker refs, storage
flags, or lifecycle fields.

Each child node must include:

- child node id.
- parent node id.
- split packet ref and hash.
- target commitment ids.
- capability id.
- executor key derived from the capability registry.
- worker ref derived from capability/model policy.
- `NodeExecutionPacket` ref or a path to produce one.
- resource packet ref.
- context handoff refs.
- validation refs or validation plan requirement.
- evidence expectation refs.
- dependency edges.
- downstream consumer / rollup refs.
- Work Queue child materialization ref.

### Frontier Behavior

The scheduler must treat child nodes as the executable frontier. The parent is
rollup/readback only.

The scheduler must:

- select ready children according to dependency, file/write conflict, budget,
  role diversity, cost policy, and parallelism rules.
- preserve siblings when one child fails.
- record branch-level outcomes.
- map child evidence claims to parent commitments.
- aggregate child completion into the parent rollup.

### Loop Guard

Repeated materialization of the same parent with the same split-required
reason and no new child graph nodes is a hard scheduler error:

`split_required_transition_not_applied`.

It must terminalize as `needs_review` with exact diagnostics instead of
looping.

### Supervisor Error Classification

Resource materialization outcomes are scheduler/readiness outcomes, not
adapter exceptions.

The supervisor and runner must classify them as:

- `resource_materialization_split_required`
- `resource_materialization_bounds_exceeded`
- `resource_materialization_context_repair_required`
- `resource_materialization_payload_missing`
- `resource_materialization_child_compile_failed`

`worker_adapter_threw:unclassified` is invalid for these cases.

### Replay Boundary

Add a replay boundary for the failed point:

- `before_split_required_materialization`
- `after_split_required_materialization`

Replay must load the accepted graph, context handoffs, materialization input,
and split-required result without rerunning router, Mission Ledger,
Commitment Work Packets, context scout, or graph selection.

The replay proof passes only if:

- parent node becomes non-runnable.
- child nodes are created from split packets.
- child Work Queue items are materialized.
- child `NodeReadinessState` objects are present.
- at least one selected child can hydrate a `NodeExecutionPacket`.
- no worker invocation happens for the parent node.
- latest-run-state and Work Queue readback show parent/child split state.

## Owner Readback Requirements

Work Queue active graph readback and latest-run-state must show:

- parent node id and status.
- split-required reason codes.
- exact schema/bounds path.
- max bound and observed count.
- split packet count.
- executable child count.
- blocked child count.
- selected child frontier.
- branch/file conflict decisions.
- current model/tool/node/phase.
- next legal transition.
- replay boundary id.

This readback is bounded. It must not include raw prompts, raw model
responses, raw provider logs, raw tool logs, raw command logs, raw DB rows,
secrets, hidden reasoning, full file snapshots, or full packet bodies.

## Product/Spec Proof Gate

Before the full Product/Spec proof is counted again, run a checkpoint replay
from `native-exec-55dc1cc6a3e94232` or an equivalent failed graph:

1. load the blocked parent implementation node;
2. hydrate the materialization result;
3. apply the split-required transition;
4. create executable child nodes;
5. verify child Work Queue materialization;
6. hydrate one child `NodeExecutionPacket`;
7. run one bounded worker smoke if the child is executable;
8. confirm all diagnostics are visible in latest-run-state/readback.

Only after that replay passes should the full Product/Spec proof rerun from
the top.

## Implementation Closeout

Implemented on 2026-05-22.

Production behavior now treats `split_required` as a graph transition instead
of a worker failure:

- the runner compiles split task packets into executable child graph nodes;
- child node metadata is manifest-only and does not copy broad parent payloads;
- child Work Queue rows are synced immediately after graph materialization;
- the parent node is marked `succeeded` with
  `splitRequiredParentLifecycle: aggregate_non_runnable` and
  `commitmentClosureEligible: false`;
- the scheduler hook returns `continue` after successful child materialization
  so execution advances to the child frontier instead of terminalizing the
  parent as `needs_review`;
- resource materialization boundary errors are classified separately from
  `worker_adapter_threw:unclassified`;
- replay supports `before-split-required-materialization` and
  `after-split-required-materialization`.

The parent uses graph `nodeStatus: succeeded` rather than `skipped` because
runtime dependency semantics require upstream handoff nodes to be satisfied
before child frontier nodes can run. The parent is not evidence-eligible:
commitment closure still requires child evidence claims, validation, profile
evaluation, and closeout.

Focused validation:

- scheduler unit: split parent transition continues into executable child
  execution;
- compiler unit: oversize target refs return `split_required` with bounded
  diagnostics;
- supervisor unit: resource materialization boundaries are not classified as
  unclassified adapter throws;
- failed Product/Spec graph replay:
  `before-split-required-materialization` materialized 20 ready child
  `NodeExecutionPacket` refs from the split-required parent while preserving a
  separate precise context-repair blocker on a sibling branch.

## Major Leaps Still Ahead

This pass is the next immediate blocker. The broader architecture still needs
these post-proof or proof-adjacent leaps:

- extract split/repair/frontier/readiness behavior from the coding runner into
  the generic runtime spine.
- make all workflow plugins use the same materialization transition contract.
- make branch-level evidence aggregation a generic graph feature.
- make Work Queue generated child lifecycle close/supersede from parent
  split/rollup state.
- add generic replay tools for every transition boundary rather than
  Product/Spec proof scripts only.
- finish actual usage capture for Codex app-server and worker/provider
  lanes.
- prove the same transition model on one non-coding workflow after
  Product/Spec.
