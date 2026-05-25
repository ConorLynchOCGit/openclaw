---
summary: "Scheduler execution order, no-progress detection, and Mission Ledger evaluation throttling for robust dynamic graph execution."
title: "Scheduler Frontier, No-Progress, And Evaluation Throttle"
---

# Scheduler Frontier, No-Progress, And Evaluation Throttle

## Purpose

The scheduler must act like a runtime graph executor, not a graph-expansion
loop that keeps asking the orchestrator for more context or repair nodes while
ready work waits. The latest Product/Spec proof reached a large graph and
created implementation task packets, but repeated scheduler progress artifacts
showed the runtime continuing to create or reuse context/prerequisite nodes
without executing ready frontier work.

This spec makes frontier execution, graph expansion, no-progress detection,
and Mission Ledger evaluation order explicit.

## Implementation Status

Implemented and lane-proven on 2026-05-22.

Production coding-team runtime construction now enables
`preferExecutableFrontierBeforeOrchestrator`, so an executable ready frontier
runs before more orchestrator expansion or deterministic prerequisite
creation. The generic scheduler exposes canonical
`RuntimeWorkGraphSchedulerFrontierState`,
`RuntimeWorkGraphNoProgressSignature`, and Mission Ledger evaluation throttle
events through scheduler runtime tools and Work Queue readback.

Proof artifact:

- `.artifacts/execution-platform/scheduler-frontier-no-progress-evaluation-throttle/proof.json`

Validation:

- `pnpm test:file extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts`
- `pnpm test:file extensions/execution-platform/src/work-queue/execution-read-model.test.ts`
- `pnpm tsgo:fast extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts extensions/execution-platform/src/work-queue/execution-read-model.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts`

## Problems To Solve

### Ready Work Can Be Starved

The scheduler currently evaluates missing node-scoped context before running
the ready parallel frontier. That can be correct early in a graph, but it
becomes harmful after resource packets and executable nodes already exist. The
runtime can keep discovering or reusing prerequisite nodes instead of running
available work.

### Reused Nodes And Edges Count As Progress

Scheduler progress artifacts can report accepted decisions for nodes/edges
that already exist. Reusing a node or edge is useful information, but it is
not forward progress by itself. A reused-only iteration must not reset loop
guards.

### Mission Ledger Evaluation Is Too Chatty

Context scout handoffs and context repair are important readiness evidence,
but they rarely close implementation commitments directly. Calling the
expensive global Mission Ledger evaluator after each scout can add latency and
does not change closure state. Evaluation should happen when evidence claims
can plausibly advance commitments or when finalization is requested.

## Canonical Scheduler Loop

Each scheduler superstep follows this order:

1. Load graph snapshot, open commitments, readiness state, active frontier,
   and previous progress signature.
2. If graph has executable ready frontier nodes, run a legal frontier
   superstep before creating additional prerequisite nodes.
3. If no executable frontier exists, compile the smallest missing prerequisite
   work from canonical readiness blockers.
4. If a model decision creates only already-existing nodes/edges and no
   readiness/evidence state changes, record a no-progress diagnostic.
5. If repeated no-progress signatures occur, halt as `needs_review` with a
   root-cause summary instead of spinning.
6. Evaluate Mission Ledger only when new evidence claims, validation results,
   closeout evidence, or finalization attempts can affect commitment status.
7. Persist compact latest-run-state and Work Queue active graph readback at
   every boundary.

## Executable Frontier Priority

The runtime must prefer executing ready work over expanding prerequisites when:

- at least one node has `NodeReadinessState.status = ready`;
- dependencies are satisfied or waived by explicit branch policy;
- resource packet refs are present and hydrated;
- context limitations are either absent or explicitly nonblocking for the
  target node;
- locks/conflict domains allow execution.

Prerequisite creation may preempt ready frontier only when:

- the ready node depends on missing context/resource/validation evidence;
- the candidate ready node is aggregate/non-runnable;
- the ready node has a branch blocker that must be repaired first;
- a workflow definition phase policy requires a join or review barrier before
  worker execution.

Every preemption must be recorded as a scheduler transition with a precise
reason code and affected node ids.

## No-Progress Signature

The scheduler writes a `NoProgressSignature` each iteration:

- graph id;
- iteration/superstep id;
- node count;
- edge count;
- executable frontier node ids;
- blocked node ids and blocker codes;
- open blocking commitment ids;
- new evidence claim refs;
- new readiness refs;
- new Work Queue child refs;
- created node ids;
- created edge ids;
- reused node ids;
- reused edge ids;
- selected model/tool decision id.

An iteration is progress only if at least one of these changes:

- new executable node;
- new edge that changes dependency/readiness;
- new accepted evidence claim;
- new resource/readiness payload ref;
- new Work Queue child item;
- executed frontier branch result;
- terminal blocker with a narrower diagnosis than the previous blocker.

Reused-only nodes/edges, repeated repair intents, repeated context requests,
or repeated generic review/closeout decisions do not count.

## Repeated Root-Cause Guard

If the same no-progress signature repeats across configurable consecutive
iterations, the scheduler must terminalize the runtime job as `needs_review`
with:

- repeated signature hash;
- repeated decision ids;
- repeated node/edge ids;
- current open commitments;
- current blocked nodes;
- missing readiness fields;
- next legal transition;
- owner-readable explanation.

This is not a failure of the worker. It is a scheduler boundary diagnostic.

## Mission Ledger Evaluation Throttle

Mission Ledger evaluation should be triggered by these event classes:

- implementation evidence claim produced;
- validation evidence produced;
- review/readback evidence produced;
- closeout/finalization requested;
- human decision evidence accepted;
- workflow evidence profile changed;
- explicit owner or scheduler request for mission status review.

Context scout, context handoff, context repair, source prompt indexing, and
graph shape changes update readiness and graph state. They do not call the
global Mission Ledger evaluator unless they include explicit commitment
closure claims.

The scheduler may batch multiple context/scout events and perform one
Mission Ledger status update at the end of a phase boundary.

## Toolification Boundary

The model should not regenerate the whole graph when a frontier or readiness
boundary fails. It should answer a small semantic tool:

- failed node ids;
- missing context questions;
- missing resource requirements;
- target commitment ids;
- why the current frontier cannot run;
- whether to repair prerequisite, split, escalate, or halt.

Runtime compiles nodes, ids, edges, capability ids, executor keys, and
readiness transitions.

## Tests

Required tests:

1. Ready frontier runs before deterministic context-supply expansion.
2. A missing readiness blocker creates only the smallest prerequisite work.
3. Reused-only node/edge decisions do not count as progress.
4. Repeated no-progress signatures halt with a root-cause diagnostic.
5. Context scout batches do not trigger Mission Ledger evaluation unless they
   include closure claims.
6. Validation/implementation/closeout evidence does trigger evaluation.
7. Work Queue readback shows active frontier, blocked frontier, no-progress
   reason, and next legal transition.
8. Scheduler repair after a blocked context/resource boundary uses semantic
   repair intent and runtime-owned graph compilation.

## Proof Gate

Before the next Product/Spec proof:

- replay the latest failed graph from the nearest post-resource or
  post-split boundary;
- show existing executable child frontier runs before additional context
  prerequisite creation;
- show reused-only graph decisions halt rather than spin;
- show Mission Ledger evaluation count is bounded during context-only phases;
- show Work Queue readback surfaces the current frontier and root cause.

## Natural Follow-Ons

After the Product/Spec proof:

- add workflow-specific phase budgets;
- add graph growth ratio guards;
- add cost governor integration so expensive global model calls are batched;
- add scheduler policy simulation for future workflow definitions;
- add cross-workflow no-progress proofs for docs, research, design, and
  marketing workflows.
