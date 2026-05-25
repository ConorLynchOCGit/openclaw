# Resource Materialization Boundary Replay And Canonical Node Readiness

Date: 2026-05-21

Status: implemented and lane-proven as the pre-Product/Spec
resource-readiness boundary. This pass started after the Runtime Artifact
Payload Store And Bounded Manifests work. The payload store is the canonical
body-storage substrate, and replay now has durable
`before_resource_materialization` and `after_resource_materialization`
boundaries plus one canonical readiness object before implementation workers
can run.

Work Queue item:
`openclaw-convergence.resource-materialization-boundary-replay-canonical-readiness`.

## Implementation Result

Implemented runtime surfaces:

- `NodeReadinessState` schema, builders, and evaluators now carry canonical
  resource, context, lifecycle, dependency, payload, manifest, evidence, and
  next-transition state.
- graph node metadata is manifest-only and rejects packet bodies, file
  snapshots, split task bodies, context/synthesis bodies, and other payload
  shapes that belong in the runtime payload store.
- production graph-runner materialization writes
  `execution_platform.node_readiness_state` payload artifacts and stores only
  refs/summaries on graph nodes.
- boundary replay supports `before-resource-materialization` and
  `after-resource-materialization`, writes compact latest-run-state at each
  boundary, hydrates payload-backed node/resource/readiness packets, and
  separates executable nodes from precise non-worker blockers.

Validation and lane proof:

- focused tests passed:
  `pnpm test:file extensions/execution-platform/src/workflows/node-resource-materialization.test.ts extensions/execution-platform/src/workflows/runtime-work-graph.test.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts`
  with 3 files and 89 tests.
- scoped type validation passed:
  `pnpm tsgo:fast extensions/execution-platform/src/workflows/node-resource-materialization.ts extensions/execution-platform/src/workflows/node-resource-materialization.test.ts extensions/execution-platform/src/workflows/runtime-work-graph.ts extensions/execution-platform/src/workflows/runtime-work-graph-repository.ts extensions/execution-platform/src/workflows/runtime-work-graph.test.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts`.
- `before-resource-materialization` replay against
  `native-exec-78e1b33861780884` completes without rerunning upstream phases,
  identifies existing ready materialized frontier nodes, and preserves the
  exact `bc-015` blocker:
  `context_supply_handoff_artifact_missing`.
- `after-resource-materialization` replay against the same graph completes
  with 4 inspected implementation nodes, 4 executable nodes, and 0 blocked
  nodes.

This does not claim the full Product/Spec Planning implementation proof has
passed. It closes the resource-materialization replay/readiness blocker and
makes the next failure local to executable worker implementation or upstream
context evidence, not metadata storage or ambiguous readiness.

2026-05-23 follow-up: the next worker smoke proved another generic boundary:
readiness can be structurally executable while the selected task is still
read-only source grounding. The canonical readiness object must now include
execution intent and evidence mode so source-grounding nodes do not dispatch
to edit-required workers and worker smokes do not require changed-file
evidence from read-only tasks. See
`execution-intent-evidence-mode-and-worker-dispatch.md`.

2026-05-25 follow-up: the resource-materialization worker gate now has two
domain resource packet classes:

- `coding_resource_packet` for source-edit/file-edit work that requires
  concrete target refs, readable target snapshots or explicit new-file
  intents, validation refs or validation discovery, edit authority, and
  changed-file evidence expectations.
- `read_only_resource_packet` for source-grounding/read-only work that
  requires bounded source/context refs, commitment mapping, authority scope,
  and read-only evidence expectations without changed-file or validation
  requirements unless validation evidence is explicitly requested.

The worker boundary is stricter than graph/readback metadata. Graph nodes may
carry manifest refs, but worker invocation requires hydrated
`NodeExecutionPacket` plus a hydrated matching domain resource packet body.
File-edit node kinds cannot bypass this with
`nodeExecutionPacketRequired: false`; that opt-out is valid only for
non-file-edit lanes. This closes the failure mode where read-only/source
grounding could be flattened into implementation, or implementation could run
from context freshness without source-edit resources.

## Failure Evidence

The latest checkpointed Product/Spec proof reached the first implementation
resource frontier and then failed before any source-edit worker executed.

Evidence:

- runtime job: `native-exec-78e1b33861780884`
- graph id:
  `team-run-native-exec-78e1b33861780884-runtime-work-graph`
- prompt hash:
  `64c74c8c5ecee1ac51099bccb895f3fe4f225778614692015ec2b4450d364922`
- prompt length: `17694`
- runtime job state: `failed`
- proof status: `needs_review`
- terminal reason codes:
  - `worker_adapter_threw`
  - `worker_adapter_threw:artifact_metadata_limit`
- graph reached 9 nodes, 11 edges, and 3 role invocations.
- three context scout or context-repair handoffs were accepted.
- three implementation nodes reached `needs_review` before executable worker
  invocation:
  - `g-faee9af635-implementation-wu-002-plugin-runtime-wiring`
  - `g-faee9af635-implementation-wu-003-planning-artifacts-compile-readiness`
  - `g-faee9af635-implementation-wu-004-readback-projection`

The first post-payload-store replay attempt used:

```bash
pnpm exec tsx scripts/execution-platform-run-product-spec-boundary-replay.mjs \
  --runtime-job-id native-exec-78e1b33861780884 \
  --graph-id team-run-native-exec-78e1b33861780884-runtime-work-graph \
  --boundary after-graph-selection \
  --max-iterations 2
```

It returned:

```json
{
  "status": "needs_review",
  "reasonCodes": [
    "accepted_context_synthesis_or_node_scoped_context_required_before_after_graph_selection_replay"
  ],
  "acceptedContextSynthesis": false,
  "acceptedNodeScopedContextSupply": false,
  "plannedExecutableNodeCount": 3
}
```

That replay did not prove the fixed storage boundary because it restarted
from the wrong semantic checkpoint. The graph had already been accepted and
context had already run. The failed boundary is resource materialization for
the implementation frontier.

2026-05-24 note: this reason code is historical. Current boundary replay no
longer treats accepted context synthesis as an equivalent to node-scoped
context for `after-graph-selection`. `after-context-synthesis` is
diagnostic-only; production replay requires node-scoped context supply before
graph-selection/resource replay can proceed.

## Architecture Diagnosis

The system now has a canonical payload store for large runtime artifacts.
That solved one layer of the problem: full packet bodies should not be stored
in artifact metadata.

The next layer is still missing:

1. Replay cannot restart exactly before or after resource materialization.
2. Scheduler, replay harness, Work Queue readback, and proof gates can still
   disagree about whether a node is context-ready, resource-ready, or
   executable.
3. Graph node metadata can still drift toward carrying bodies, nested target
   refs, split-task arrays, or context packets instead of manifests.
4. Old checkpoint artifacts can be semantically usable but not shaped like the
   current readiness/resource contract.
5. Operator readback can require scanning many artifacts instead of reading a
   compact latest-run-state checkpoint.

The correct fix is not to rerun Mission Ledger, packet authoring, scheduler
selection, or context scout until implementation happens to pass. The correct
fix is to create a durable resource-materialization checkpoint with canonical
readiness truth and bounded manifests.

## Governing Principle

Graph acceptance is work intent. Context acceptance is contextual evidence.
Payload storage is artifact durability.

None of those are executable readiness.

Executable readiness exists only when a canonical `NodeReadinessState`
references a valid `NodeExecutionPacket` and domain resource packet, with
bounded manifests, hydratable payload refs, verified context dependencies,
verified resource dependencies, authority, lifecycle, and validation
expectations.

## Non-Negotiable Rules

- Do not raise metadata limits as the fix.
- Do not truncate resource packets to fit metadata.
- Do not store full target refs, file snapshots, context packets, task
  packets, split-task arrays, raw prompts, raw responses, raw provider logs,
  raw tool logs, raw command logs, raw DB rows, secrets, or hidden reasoning
  in graph node metadata.
- Do not rerun upstream phases when the failing boundary is resource
  materialization.
- Do not treat `accepted_with_limitations` context as implementation-ready
  unless a consumer-specific nonblocking waiver exists.
- Do not classify missing resource packets, missing snapshots, stale refs, or
  invalid checkpoint shape as worker failures.
- Do not let proof harnesses invent separate readiness semantics.
- Do not create Product/Spec-specific shortcuts. The contract must apply to
  coding, planning, research, docs, QA, architecture, design, marketing,
  memory, proactivity, validation, human task, and closeout workflows.

## Required Runtime Contracts

### Replay Boundaries

Add first-class replay boundaries:

- `before_resource_materialization`
- `after_resource_materialization`

`before_resource_materialization` must:

- load the accepted graph frontier from the runtime job.
- load accepted context handoffs or normalize legacy handoffs into current
  node-scoped context state.
- identify implementation-bearing or resource-bearing nodes.
- refuse to rerun Mission Ledger, Commitment Work Packets, scheduler graph
  selection, or context scout unless required artifacts are missing and cannot
  be normalized.
- run only resource materialization and readiness evaluation.

`after_resource_materialization` must:

- load materialized resource packet manifests and payload refs.
- hydrate and verify `NodeExecutionPacket`s and domain resource packets.
- verify canonical `NodeReadinessState` says the target nodes are executable
  or precisely blocked.
- proceed to worker invocation only for executable nodes.

Replay evidence must include:

- boundary name.
- source runtime job id.
- graph id.
- target node ids.
- loaded artifact refs.
- normalized checkpoint versions.
- readiness states.
- payload refs and hashes.
- blockers.
- next legal transition.

### Canonical NodeReadinessState

`NodeReadinessState` is the only readiness truth consumed by:

- scheduler frontier selection.
- replay harnesses.
- worker invocation guards.
- Work Queue readback.
- proof gates.
- closeout/finalization readiness.

Minimum fields:

- `runtimeJobId`
- `workflowId`
- `graphId`
- `nodeId`
- `executionIntent`
- `evidenceMode`
- `capabilityId`
- `roleClass`
- `phase`
- `status`
- `dependencyStatus`
- `contextStatus`
- `contextSnapshotRefs`
- `contextLimitationStatus`
- `resourceStatus`
- `nodeExecutionPacketRef`
- `domainResourcePacketRef`
- `payloadRefs`
- `manifestRefs`
- `targetCommitmentIds`
- `evidenceClaimRefs`
- `validationPlanRefs`
- `blockers`
- `reasonCodes`
- `nextLegalTransitions`
- `replayBoundary`
- `createdAt`
- `updatedAt`

Allowed high-level statuses:

- `work_intent`
- `context_required`
- `context_in_progress`
- `context_ready`
- `resource_materialization_required`
- `resource_materialization_in_progress`
- `resources_ready`
- `executable`
- `running`
- `completed`
- `needs_repair`
- `needs_review`
- `failed`
- `canceled`

The readiness state must distinguish:

- context present but insufficient.
- context accepted with blocking limitations.
- context accepted with consumer-specific nonblocking limitations.
- resources missing.
- resources present but stale.
- resources present but payload hydration failed.
- resources ready but validation refs missing.
- executable frontier open.

### Manifest-Only Graph Metadata

Graph node metadata must be manifest-only.

Allowed graph metadata:

- ids.
- refs.
- content hashes.
- byte counts.
- counts.
- short summaries.
- lifecycle phase.
- readiness status.
- reason codes.
- Work Queue child refs.
- bounded operator readback snippets.
- raw-storage flags.

Forbidden graph metadata:

- full file snapshots.
- full target ref arrays when large.
- full implementation task packets.
- full context packets.
- full synthesis bodies.
- split-task arrays with nested bodies.
- raw prompts or raw model responses.
- raw provider/tool/command/DB logs.
- secret-bearing values.

Add a graph metadata sanitizer/validator that runs before every graph node
write and update. It should return structured `metadata_manifest_violation`
readiness evidence instead of letting an oversized write become an
unclassified worker or storage failure.

### Checkpoint Version Normalizers

Replay must support existing proof artifacts without treating every old shape
as invalid.

Add normalizers for:

- context handoff artifacts.
- context repair handoff artifacts.
- node-scoped context state.
- implementation context packet manifests.
- implementation task packet manifests.
- coding resource packet manifests.
- node execution packet manifests.
- legacy graph node metadata that points at bodies instead of refs.

Normalizers may convert old checkpoints only when the data is semantically
valid and safe:

- ids match the runtime job and graph.
- context target node ids can be resolved.
- required refs exist.
- payload refs or bodies can be migrated to payload storage.
- hashes and byte counts can be computed.
- raw-storage flags remain false for forbidden raw data.

If normalization cannot prove validity, emit exact missing refs and blocker
paths. Do not rerun upstream phases by default.

### Latest Run State

Write a compact latest-run-state artifact at every boundary and terminal
event.

Required fields:

- runtime job id.
- graph id.
- work queue item id.
- current phase.
- current replay boundary.
- active node ids.
- active role/model/provider.
- active tool event kind.
- wall time by phase.
- token usage by phase and model when available.
- estimated token usage with estimate labels when actual usage is unavailable.
- payload refs and manifest refs.
- readiness status by active node.
- blockers.
- next legal transition.
- latest terminal event.
- proof gate status.

Latest-run-state is operator readback. It must be bounded, non-secret, and
must not embed full packet bodies or raw logs.

### Resource-Materialization Lane Proof

Add a focused lane proof that uses the exact failed Product/Spec graph and
passes only if:

- replay starts at `before_resource_materialization`.
- no upstream phase reruns.
- all implementation-bearing nodes receive canonical
  `NodeReadinessState`.
- materialized resource packets are stored as payload bodies.
- graph node metadata contains bounded manifests only.
- `after_resource_materialization` can hydrate the packets.
- executable nodes are clearly separated from blocked nodes.
- missing context for `wu-001` or any other node is represented as an exact
  readiness blocker, not worker failure.
- no metadata limit is hit.
- no worker is invoked before resources are ready.
- latest-run-state and Work Queue readback show the boundary result.

Only after this lane proof passes should the Product/Spec proof resume from
the nearest checkpoint, and only after that should it rerun from the top.

## General Workflow Portability

The implementation must not bake in Product/Spec assumptions.

The same runtime boundary applies to future workflows:

- coding: file snapshots, target refs, edit scopes, validation refs.
- planning: planning capsule refs, research refs, decision refs,
  action-graph proposal refs.
- research: source refs, quote/fact refs, freshness metadata, citation
  manifests.
- docs: doc target refs, source material refs, style/profile refs.
- QA: command refs, fixture refs, environment refs, result refs.
- design: asset refs, screenshot refs, design-token refs.
- marketing: campaign brief refs, fact/source refs, brand constraint refs.
- memory/proactivity: memory context pack refs, retrieval refs, cooldown refs,
  owner-review refs.
- closeout: evidence packet refs, profile evaluation refs, finalization refs.

The resource materializer should be workflow/capability pluggable. The
scheduler should ask for readiness state, not inspect coding-specific packet
internals.

## Required Code Areas To Review

Implementation should inspect and update, as needed:

- `extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts`
- `extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts`
- `extensions/execution-platform/src/workflows/runtime-work-graph-repository.ts`
- `extensions/execution-platform/src/workflows/runtime-node-readiness-state.ts`
- `extensions/execution-platform/src/workflows/node-resource-materialization.ts`
- `extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts`
- `extensions/execution-platform/src/runtime-job-repository.ts`
- `extensions/execution-platform/src/work-queue/execution-read-model.ts`
- `scripts/execution-platform-run-product-spec-boundary-replay.mjs`
- Product/Spec proof harness scripts and artifacts.

If file names have changed, use `rg` to find the canonical production path.
Do not create a parallel proof-only path.

## Tests And Proofs

Required focused tests:

- `before_resource_materialization` replay does not rerun upstream phases.
- `after_resource_materialization` replay hydrates payload-backed packets.
- `NodeReadinessState` is the only readiness source consumed by scheduler,
  replay, readback, and worker guards.
- graph node metadata rejects bodies and accepts bounded manifests.
- checkpoint normalizers convert semantically valid old context handoffs into
  current readiness state.
- invalid old checkpoints return exact missing refs and blockers.
- implementation nodes with missing snapshots do not invoke workers.
- resource materialization failures safe-return readiness evidence.
- Work Queue readback and latest-run-state show the same active boundary.

Required lane proof:

- use runtime job `native-exec-78e1b33861780884` and graph
  `team-run-native-exec-78e1b33861780884-runtime-work-graph` if still
  available.
- if DB state is unavailable, use bounded artifact fixtures generated from
  that run.
- pass only if the three implementation nodes compile payload-backed
  resource packets or report precise non-worker blockers.

## Deep Completion Question

After implementation, perform code review before answering:

> Did we maximally implement Resource Materialization Boundary Replay And
> Canonical Node Readiness as a production runtime boundary, with replayable
> `before_resource_materialization` and `after_resource_materialization`
> checkpoints, one canonical `NodeReadinessState`, manifest-only graph
> metadata, checkpoint normalizers, latest-run-state boundary writes,
> Work Queue readback, focused tests, and a lane proof against the failed
> Product/Spec graph? Are there any fallback, compatibility, proof-only,
> body-in-metadata, stale-readiness, worker-bypass, or Product/Spec-specific
> shortcuts left that could make implementation execute without canonical
> resource readiness or hide the true blocker from operators?

If the answer is not an unqualified yes, patch the missing production layer,
rerun focused validation, update docs/artifacts/readback, and ask the
question again.

## 2026-05-22 Follow-Up: Branch-Scoped Context Readiness And Lifecycle Clarity

The latest Product/Spec proof showed that context readiness and adapter
lifecycle must be branch-scoped in owner readback:

- some implementation nodes had accepted context/resource materialization
  state while other nodes were still blocked.
- a repeated adapter exception could make the overall runtime look live even
  when the relevant branch had already terminalized as a platform blocker.
- `accepted_with_limitations` context must not unlock an implementation node
  unless that node has an explicit consumer-specific waiver.

Canonical readiness requirements:

- every implementation node has one `NodeReadinessState` ref.
- the readiness object carries branch id, node id, target commitment ids,
  context status, resource status, validation status, storage status, blocker
  summary, next legal transition, and payload refs.
- Work Queue readback and `latest-run-state.json` must show which
  implementation nodes are ready, which are blocked, and why.
- retry-scheduled job lifecycle must not obscure a terminal adapter outcome
  for a branch. If an adapter failure is terminal for the branch, readback
  should say so while separately showing whether the supervisor has scheduled
  a job-level retry.

This prevents the operator from seeing a vague pending job when the useful
truth is a branch-scoped resource/context/storage blocker.
