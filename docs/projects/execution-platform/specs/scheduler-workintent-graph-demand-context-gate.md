---
summary: "Strict WorkIntentGraph acceptance, consumer-bound context requirements, graph edge invariants, and first-open-gate projection before Product/Spec proof resumes."
title: "Scheduler WorkIntentGraph And Demand-Context Gate"
---

# Scheduler WorkIntentGraph And Demand-Context Gate

Date: 2026-05-26

Status: P0 pre-Product/Spec proof blocker.

## Why This Exists

The latest Product/Spec replay from the completed Mission Ledger proved that
the packet boundary can complete cleanly: all commitment packets were accepted,
packet review was skipped, no GPT rescue was used, and no packet provider
error blocked the run. The run then failed at the scheduler/context boundary.

The scheduler created a graph containing `work_intent` and `context_scout`
nodes with no dependency edges. Owner readback collapsed the open gate to
`resource_fulfillment`, even though the real blocker was graph contract invalidity:
context scouts were present without consumer-bound context requirement edges,
and the WorkIntent graph had not been accepted as a strict non-runnable
control-plane graph before context execution.

This is not a packet bug, a Qwen/Kimi bug, or an implementation worker bug. It
is a control-plane contract failure.

## Governing Architecture

Accepted packets must feed scheduler-first decomposition:

```text
Commitment Work Packets
  -> WorkIntentGraph
  -> capability validation
  -> NodeExecutionContract
  -> ResourceRequirementPacket
  -> ContextScoutExecutionPacket / resource materialization
  -> NodeExecutionPacket
  -> worker execution
```

Graph nodes schedule work. Payload-backed contracts define work. Context
scouts are resource/context suppliers for declared consumers; they are not
default graph glue.

## 1. Strict WorkIntentGraph Acceptance Gate

The runtime must accept a `WorkIntentGraph` before any context scout node is
created for Product/Spec coding-team proof work.

Every `WorkIntent` must carry model-authored:

- semantic execution intent;
- selected capability;
- target commitment ids;
- expected evidence mode;
- resource requirement class;
- objective and expected output;
- dependency or explicit independent-root declaration.

Runtime validates structure only:

- required fields are present;
- declared values are registered in manifests;
- ids, refs, hashes, bounds, lifecycle, and storage flags are valid;
- dependency edges or independent-root declarations are structurally valid.

Runtime must not decide semantic relevance, context sufficiency, target file
meaning, or task quality from prose, path names, Product/Spec strings, or
artifact refs.

## 2. Context Requirements Are Separate From Graph Nodes

`context_scout` must not be default graph glue. A scheduler or runtime context
node must be backed by a `ResourceRequirementPacket`.

The required transition is:

```text
WorkIntent / NodeExecutionContract
  -> ResourceRequirementPacket
  -> ContextScoutExecutionPacket
  -> context_supplies edge to declared consumer
```

The scheduler may emit semantic context need through model-authored fields, but
runtime compiles ids, broker refs, requirement refs, edge ids, lifecycle, and
readback projection.

## Capability Manifest Binding

WorkIntent acceptance also requires a structural capability-manifest binding.
For each model-authored WorkIntent, runtime validates that:

- the selected capability id exists in the runtime capability manifest;
- the model-authored execution intent is explicitly supported by that
  capability;
- the capability can run as WorkIntent state before executable promotion;
- metadata schema refs, executor key, worker ref, allowed adapters, budget and
  parallelism policy refs are declared;
- model-backed capabilities declare model policy refs, while deterministic or
  human capabilities declare their deterministic/human adapter instead;
- required context, resource packet, snapshot, validation, authority, and
  evidence claim classes are structurally known;
- repair and blocked transitions are declared and projected as legal next
  transitions.

Runtime may reject missing or invalid manifest fields with precise diagnostics.
Runtime may not choose a different capability or decide capability-fit quality
from strings, filenames, Product/Spec prose, artifact refs, or node titles.

The canonical model-facing small verb for independent non-runnable WorkIntent
root acceptance is `scheduler.work_intent.accept_roots`.

## 3. Orphan Context Scouts Are Invalid

A `context_scout` node is invalid unless it is one of:

- a consumer-bound context node with a `ResourceRequirementPacket` ref and an
  outgoing `context_supplies` edge to the declared consumer;
- an explicit workflow-defined coordination node with a registered policy ref;
- a diagnostic-only node that cannot unlock implementation or satisfy
  `resource_fulfillment`.

Broad packet-level context scouts are disallowed in the production
Product/Spec proof path unless a workflow definition explicitly declares them.

## 4. Graph Edge Invariants

`scheduler.accept_staged_graph` must reject graph decisions when structural
dependency invariants are not satisfied:

- a multi-node graph with zero edges is invalid unless every node is explicitly
  marked as an independent root with model-authored rationale and runtime-valid
  capability;
- context nodes must have outgoing consumer edges;
- implementation/resource nodes must have inbound dependency or resource edges
  when their capability manifest requires prior context/materialization;
- WorkIntent nodes must be non-runnable until accepted and validated;
- context scouts cannot be created before an accepted WorkIntent consumer or
  contract boundary exists.

Parallelism is a structural declaration, not a loophole. A
`parallelIndependentNodesJustification` can prove sibling work may run
concurrently, but it cannot make context scouts consumer-less or convert broad
packet context into implementation readiness.

## 5. First-Open-Gate Projection

Owner readback must derive `firstOpenGate` from canonical graph/readiness state.

If graph structure is invalid, readback must say:

```text
graph_compile_invalid
```

or a more precise structural gate such as:

```text
work_intent_graph_invalid
resource_requirement_missing
context_scout_orphaned
```

It must not collapse an invalid graph to `resource_fulfillment`.

When `resource_fulfillment` is legitimately open, readback must include:

- node id;
- contract ref;
- consumer id;
- context requirement ref;
- missing context refs;
- blocker reason codes;
- next legal transition.

## 6. Demand-Driven Context Remains The Target

The target architecture remains:

```text
Accepted packets
  -> scheduler creates WorkIntents/contracts
  -> context generated per node/contract as needed
```

No global context synthesis, broad context scout fanout, or broad packet-level
context supply may be treated as production success unless explicitly
workflow-defined.

## 7. Required Regression Tests

Add focused coverage for the exact failure:

- accepted packets followed by scheduler graph with context scouts and zero
  edges must fail as `graph_compile_invalid`;
- a context scout without a consumer edge must fail;
- a context scout without a `ResourceRequirementPacket` ref must fail unless it
  is diagnostic-only or explicit workflow coordination;
- a broad packet-context gate must not become `firstOpenGate` after WorkIntent
  planning;
- a valid path must be:

```text
WorkIntent
  -> NodeExecutionContract
  -> ResourceRequirementPacket
  -> scoped context scout / resource materialization
```

## Acceptance Criteria

- DB Work Queue has a P0 pre-proof item for this gate before
  `openclaw-convergence.active-queue-34`.
- Production scheduler policy rejects orphan context scouts and multi-node
  zero-edge graphs without structurally valid independent-root declarations.
- Node-scoped context supply compiles `ResourceRequirementPacket` refs before
  context scout execution.
- Readback/proof gates report graph invalidity before `resource_fulfillment` when
  graph structure is invalid.
- Focused tests cover both Product/Spec replay shape and a generic
  non-Product/Spec fixture.
- No deterministic semantic classifiers, Product/Spec-specific runtime
  branches, substring forests, or file-scoring heuristics are introduced.
