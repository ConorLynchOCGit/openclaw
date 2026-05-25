# Parallel Frontier Resource Boundary Hardening

Date: 2026-05-21

Status: source-of-truth pre-Product/Spec proof blocker. This item records the
generic scheduler/runtime fix exposed by the latest checkpointed Product/Spec
proof. It is not Product/Spec-specific; it hardens the boundary between
accepted graph state, context sufficiency, resource packet compilation, and
parallel frontier execution for all scheduler-backed workflows.

Work Queue item:
`openclaw-convergence.parallel-frontier-resource-boundary-hardening`.

2026-05-21 follow-up: runtime job `native-exec-78e1b33861780884` advanced
past the original context-scout and context-repair failure modes but failed at
the implementation-resource storage boundary with
`worker_adapter_threw:artifact_metadata_limit`. The storage sub-boundary is
now governed by
[Runtime Artifact Payload Store And Bounded Manifests](/projects/execution-platform/specs/runtime-artifact-payload-store-and-bounded-manifests).
Resource packets must be persisted as payload bodies with bounded manifests,
not full packet bodies in runtime artifact metadata.

2026-05-22 follow-up: the frontier worker proof gate closed this item with
payload-backed worker-smoke evidence. The next full Product/Spec proof then
advanced further and exposed a new, narrower generic transition gap: a broad
parent implementation node returned split-required resource materialization
evidence, but the scheduler retried/terminalized the parent instead of
promoting split task packets into executable child nodes. That successor
blocker is governed by
`split-required-resource-materialization-transition.md`.

## Failure Evidence

The latest checkpointed Product/Spec proof advanced beyond the earlier
context-scout packet blocker:

- runtime job: `native-exec-68321aa82d7d6146`
- Work Queue item: `product-spec-checkpointed-64c74c8c5ece-fc8awb`
- prompt hash:
  `64c74c8c5ecee1ac51099bccb895f3fe4f225778614692015ec2b4450d364922`
- prompt length: `17694`
- final proof status: `needs_review`
- proof process wall time: `926s`
- submit accepted in `150.483s`
- front-door router latency: `67.513s`
- Qwen usage: `165685` tokens, estimated `$0.06117807`
- GPT-5.5 usage: not captured as actual provider usage; estimated
  `73139-121920` tokens

The proof succeeded through:

- UX-compatible prompt submission.
- source-prompt context indexing.
- Mission Ledger extraction: 13 blocking commitments, `clear_to_execute`.
- 13/13 Commitment Work Packets.
- adaptive packet review skip.
- scheduler graph acceptance.
- Work Queue child materialization.
- parallel frontier selection and launch of three independent context-scout
  nodes.

The proof failed before any implementation edit landed.

## Root Causes

### 1. Resource Packet Bounds Were Not Safe

`compileImplementationContextSnapshotPacket` could internally collect more
file refs than the public packet schema allows. The compiler cap and schema
cap diverged: the compiler allowed more refs than the Zod packet contract.
When the packet exceeded `resolvedTargetFileRefs` bounds, a `too_big` schema
error escaped as an exception. The scheduler then surfaced an unclassified
worker-adapter failure and scheduled retry, even though the real issue was a
resource-materialization boundary problem.

This violates the runtime rule: resource compilers must never throw opaque
schema errors into worker execution. They must return bounded readiness or
split/repair results.

### 2. Context Limitations Were Treated As Implementation-Usable

Context scout produced `accepted_with_limitations` handoffs with reason codes
such as:

- `context_scout_runtime_verified_fallback_used`
- `context_scout_tool_first_verified_context_used`

Those handoffs were allowed to flow toward implementation without a canonical
per-consumer decision that the limitation was nonblocking. Structured fields
such as `hasNonRuntimeContextSource` and `runtimeOnlyContextDetected` existed
in the runtime shape, but were not consistently populated and enforced as the
readiness source of truth.

Runtime-supplied verified refs are useful evidence, but they are not a clean
substitute for model-authored context substance. They should be
`accepted_with_limitations` or `needs_review_nonblocking` until the scheduler
proves the limitation is nonblocking for the exact downstream implementation
group.

### 3. Context Repair Nodes Were Created Without Consumers

After context/resource failure, the scheduler created or selected additional
context/acquisition nodes, but some had zero consumer edges. In the same
frontier, implementation nodes could still be considered alongside the repair
nodes. A context repair node without a consumer edge cannot prove that it
repairs the blocked implementation. It is diagnostic work, not executable
readiness progress.

### 4. Parallel Frontier Failed As A Whole

Parallel frontier execution used a branch pattern where one schema/resource
exception could collapse the adapter result while sibling branches continued
emitting. The Work Queue then showed mixed signals: retry scheduling,
continuing events, and an unclassified terminal failure. Parallel execution
must isolate branch failures into node-level results and preserve sibling
evidence.

### 5. Owner Readback Hid The Exact Boundary Failure

The latest readback showed that a worker adapter threw, but not the exact
schema path, branch id, node id, compiler input/output counts, context
limitation class, or repair consumer edge state. The operator should not have
to inspect raw artifacts to see whether the failure is provider/model,
resource compiler, context sufficiency, scheduler edge, or frontier
isolation.

## Architecture Decision

Graph acceptance is not execution readiness. Context acceptance is not
resource readiness. Resource compilation is not allowed to throw opaque
exceptions into worker execution. Parallel frontier execution is a scheduler
superstep that must return one result per branch.

The runtime must own the following:

- resource packet bounds and split policy.
- Zod/schema parse safety.
- readiness result shape.
- context limitation enforcement.
- context repair consumer edges.
- parallel frontier branch isolation.
- owner-facing failure telemetry.

The model owns:

- semantic context usefulness.
- whether a limitation is actually nonblocking for a named downstream work
  unit.
- repair intent and missing context questions.
- sufficiency judgment after runtime supplies bounded refs and packets.

## Required Runtime Contracts

### Safe Resource Materialization

Every resource compiler must return a `ResourceMaterializationResult`:

- `status: "accepted" | "split_required" | "context_repair_required" |
"needs_review"`
- `packetRef` when accepted.
- `blockingReasonCodes` when not accepted.
- `schemaDiagnostics` with exact paths.
- `inputCounts` and `outputCounts`.
- `maxBounds` from a shared named bound policy.
- `suggestedSplits` when output exceeds packet bounds.
- `targetCommitmentIds`.
- `targetNodeIds`.

No production compiler may call `parse` in a way that throws into the worker
adapter. It must use safe parsing and convert schema failures into readiness
evidence.

Implementation context packet bounds must come from one source, such as:

- `IMPLEMENTATION_CONTEXT_PACKET_MAX_TARGET_FILE_REFS`
- `IMPLEMENTATION_CONTEXT_PACKET_MAX_SNAPSHOT_BYTES`
- `IMPLEMENTATION_CONTEXT_PACKET_MAX_VALIDATION_REFS`
- `IMPLEMENTATION_CONTEXT_PACKET_MAX_CONTEXT_REFS`

The schema, compiler, tests, readback, and Work Queue diagnostics must consume
those same constants.

### Context Limitation Enforcement

Context handoff readiness must include a canonical
`ContextSufficiencyState`:

- `status: "accepted" | "accepted_with_limitations" |
"needs_review_nonblocking" | "needs_repair_blocking" | "rejected"`
- `hasModelAuthoredSubstance`
- `hasNonRuntimeContextSource`
- `runtimeOnlyContextDetected`
- `verifiedRefCount`
- `modelAuthoredRefCount`
- `limitationClassifications`
- `blockingLimitations`
- `nonblockingLimitations`
- `downstreamConsumerNodeIds`
- `consumerSpecificWaivers`

Implementation/test/review workers may execute with limitations only when:

1. the limitation is explicitly classified as nonblocking for the exact
   downstream consumer, and
2. the model-authored sufficiency review cites the consumer node id or work
   unit id, and
3. runtime validates all referenced files/refs exist and are readable, and
4. Work Queue readback records the waiver and its limitations.

Runtime fallback verified refs alone cannot create clean context success.

### Context Repair Consumer Edges

Any context repair, acquisition, or scout prerequisite created after a
blocked node must have at least one of:

- a `context_supplies` edge to the blocked consumer node.
- an edge to a synthesis/barrier node that supplies the blocked consumer.
- an explicit diagnostic-only lifecycle state that cannot unlock
  implementation.

The scheduler must reject or auto-compile consumer edges for repair intent
that names blocked node ids. A zero-consumer context node may run only as
diagnostic evidence and cannot satisfy readiness for implementation.

### Parallel Frontier Isolation

Parallel frontier execution must run as a superstep with branch-level
results:

- `superstepId`
- `branchId`
- `nodeId`
- `nodeKind`
- `capabilityId`
- `targetCommitmentIds`
- `status`
- `failureClass`
- `errorPath`
- `repairAction`
- `evidenceRefs`
- `readinessStateRef`

The scheduler must use `Promise.allSettled` or equivalent isolation. One
branch failure must not erase sibling results. Terminal job failure is allowed
only for supervisor/system invariants, not ordinary node-level resource,
context, validation, or provider failures. Ordinary branch failures return to
the scheduler as `needs_review`, `context_repair_required`,
`split_required`, or `repair_required` evidence.

### Owner-Facing Telemetry

`latest-run-state.json`, Work Queue active graph readback, and scheduler
progress events must include:

- current checkpoint.
- active superstep id.
- branch ids and node ids.
- node objective and downstream consumer.
- model/task class/provider where applicable.
- resource compiler input/output counts.
- schema path and exact bound when rejected.
- context limitation status.
- consumer edge status.
- next legal transition.
- replay boundary id.

This telemetry must be bounded and raw-storage safe. It must not persist raw
prompts, raw model responses, raw provider logs, raw tool logs, raw DB rows,
or secrets.

## Replay And Proof Gates

Before another full Product/Spec proof, run a boundary replay from the latest
accepted graph/frontier checkpoint or an equivalent fixture generated from
`native-exec-68321aa82d7d6146`.

The replay passes only if:

- oversized implementation resource packets become `split_required` or
  `context_repair_required`, not thrown exceptions.
- context handoffs with runtime fallback limitations do not unlock
  implementation without consumer-specific nonblocking waivers.
- context repair nodes have consumer edges or diagnostic-only state.
- one failing parallel branch produces a node-level failure result while
  sibling branch evidence remains visible.
- Work Queue readback shows the exact failed path, bound, node, branch, and
  next action.

The full Product/Spec proof remains blocked until this boundary replay passes.

## Implementation Targets

Likely source areas:

- `extensions/execution-platform/src/workflows/node-resource-materialization.ts`
- `extensions/execution-platform/src/workflows/implementation-context-snapshot-compiler.ts`
- `extensions/execution-platform/src/workflows/context-scout-execution-packet.ts`
- `extensions/execution-platform/src/workflows/runtime-node-readiness-transition-engine.ts`
- `extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts`
- `extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts`
- `extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts`
- `extensions/execution-platform/src/codex-bridge/context-scout-node-executor.ts`
- `extensions/execution-platform/src/work-queue/execution-read-model.ts`
- boundary replay scripts under `scripts/`

## Regression Tests

Add focused tests proving:

- compiler/schema bounds cannot diverge for target file refs.
- resource compiler safe-parse returns structured diagnostics on oversize
  packets.
- `accepted_with_limitations` context with runtime fallback reason codes does
  not open implementation readiness by default.
- consumer-specific nonblocking context limitation waivers can unlock only the
  named downstream node.
- context repair intent compiles nodes with `context_supplies` edges to
  blocked consumers.
- zero-consumer context repair nodes are diagnostic-only.
- parallel frontier branch failures do not throw the whole adapter result.
- sibling branch evidence remains available after one branch fails.
- Work Queue readback exposes schema path, bound, branch, node, and replay
  boundary.

## Non-Goals

- Do not weaken packet schemas so oversized work silently passes.
- Do not truncate file refs or context evidence to make bounds pass.
- Do not treat runtime-supplied verified refs as clean context success.
- Do not add Product/Spec-specific route or prompt heuristics.
- Do not reintroduce static/fallback runners.
- Do not allow worker adapters to turn resource compiler errors into generic
  provider/model failure.
- Do not store full resource packet bodies in artifact metadata. Use payload
  refs plus bounded manifests.

## 2026-05-22 Follow-Up: Systemic Frontier Failure And Typed Locks

The latest Product/Spec checkpointed proof reached a much stronger graph
state, but failed before implementation edits:

- 50 graph nodes and 52 edges were accepted.
- 22 context handoff packets, 24 context scout execution packets, 16 node
  execution packets/readiness states, and 17 implementation context packets
  were produced.
- no implementation source edits landed.
- multiple implementation branches failed with the same manifest false
  positive:
  `parallel_frontier_branch_error:runtime work graph metadata manifest violation at node status metadata patch.implementationResourceMaterializationInputC`.

Two platform faults were identified:

1. **Repeated sibling branch exception churn.** Branch isolation preserved
   sibling evidence, but the scheduler kept trying sibling nodes that hit the
   same root exception. The scheduler now needs a systemic failure guard: if
   the same branch failure signature repeats across sibling nodes or across
   the current frontier plus previous branch failures, halt as `needs_review`
   with one root cause instead of returning to orchestration churn.
2. **Validation commands were treated as write locks.** Implementation nodes
   sharing a validation command were serialized because
   `validationCommandRefs` were included in generic target refs and then mapped
   to `write:*` conflict keys. Conflict keys must be typed:
   implementation/write locks come from target/write/edit refs, while
   validation commands produce `validation:*` locks only.

Required readback:

- branch id and node id.
- failure class, schema path, and bounded error summary.
- systemic failure signature hash and affected node ids when applicable.
- selected nodes and skipped conflict reasons with typed lock names.
- sibling evidence refs that survived the failure.

The guard must not collapse all branch failures into terminal job failure. It
only prevents repeating the same systemic runtime exception across independent
frontier branches.
