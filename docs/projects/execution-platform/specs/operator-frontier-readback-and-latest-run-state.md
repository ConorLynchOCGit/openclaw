---
summary: "Owner-facing active frontier readback and compact latest-run-state for long multi-branch Execution Platform runs."
title: "Operator Frontier Readback And Latest Run State"
---

# Operator Frontier Readback And Latest Run State

## Purpose

The runtime can now create rich graph, readiness, resource, and tool artifacts,
but owner-facing readback still collapses too much into terminal artifacts or
single-node summaries. During long Product/Spec proofs, this causes the
operator to lose visibility into the actual active frontier, current branch
blockers, current model/tool activity, token usage, and next legal transition.

This spec makes compact active frontier state a first-class latest-run-state
and Work Queue readback contract.

## Implementation Status

Implemented on 2026-05-22.

Production wiring:

- `buildLatestRunState(...)` now includes bounded `activeFrontier` state with
  selected/running/completed/blocked/failed/needs-review/waiting node ids,
  open commitments, next transition, no-progress root cause, Mission Ledger
  throttle state, and branch-level blocker details.
- `DynamicAgentTeamGraphRunner` writes an
  `execution_platform.latest_run_state` metadata artifact and
  `execution.latest_run_state_updated` event after every
  `agent_team.scheduler_progress` boundary it emits.
- Work Queue owner progress readback projects `latestRunState` under active
  graph progress and agreement-checks graph id, selected nodes, blocked nodes,
  and scheduler transition against the latest scheduler frontier event.
- Latest-run-state remains manifest-only and stores no raw prompt, response,
  provider log, tool log, DB row, or secret body.

Proof and validation:

- provider-free proof:
  `.artifacts/execution-platform/operator-frontier-readback-latest-run-state/proof.json`
- focused tests:
  `pnpm test:file extensions/execution-platform/src/observability/latest-run-state.test.ts`
- readback regression:
  `pnpm test:file extensions/execution-platform/src/work-queue/execution-read-model.test.ts`
- scoped type validation:
  `pnpm tsgo:fast extensions/execution-platform/src/observability/latest-run-state.ts extensions/execution-platform/src/observability/latest-run-state.test.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts extensions/execution-platform/src/work-queue/execution-read-model.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts`

## Principle

Long workflow execution must be inspectable without scanning hundreds of
artifacts. At every boundary and terminal event, the runtime writes a compact
state object that answers:

- what is running;
- why it was selected;
- which model/tool/worker owns it;
- what it is waiting on;
- what evidence was produced;
- what remains blocked;
- what the next legal transition is.

This object is readback, not lifecycle truth. Runtime jobs, graph state,
tool traces, payload refs, and evidence claims remain the authoritative
substrates.

## `latest-run-state` Extensions

Add `activeFrontier` to latest-run-state:

```ts
type LatestRunActiveFrontier = {
  status: "planning" | "running" | "blocked" | "needs_review" | "finalizing" | "terminal";
  graphId: string;
  superstepId?: string;
  selectedNodeIds: string[];
  runningNodeIds: string[];
  completedNodeIds: string[];
  blockedNodeIds: string[];
  needsReviewNodeIds: string[];
  branchStates: LatestRunBranchState[];
  readinessRefs: string[];
  resourcePacketRefs: string[];
  evidenceClaimRefs: string[];
  schedulerDecisionRef?: string;
  noProgressSignatureRef?: string;
  nextTransition:
    | "run_frontier"
    | "materialize_resources"
    | "create_prerequisite_context"
    | "split_parent"
    | "repair_context"
    | "evaluate_mission"
    | "finalize"
    | "needs_review";
  eli5: string;
};
```

Branch state fields:

- `branchId`;
- `nodeId`;
- `nodeKind`;
- `capabilityId`;
- `executorKey`;
- `modelRef`;
- `workerRef`;
- `phase`;
- `objectiveSummary`;
- `whySelected`;
- `currentToolId`;
- `currentToolInvocationRef`;
- `targetRefSummary`;
- `readinessStatus`;
- `blockerCode`;
- `blockerSchemaPath`;
- `blockerSummary`;
- `resourcePacketRef`;
- `evidenceProducedRefs`;
- `elapsedMs`;
- `tokenUsage`;
- `nextTransition`;

All arrays are capped and include count fields when truncated. Full bodies
remain in payload/artifact stores.

## Work Queue Readback

Work Queue active graph progress should project the same state:

- active graph id;
- selected/running/blocked node ids;
- current role/model/tool per branch;
- node objective and why selected;
- readiness ref and resource packet ref;
- exact blocker code and schema path;
- context limitation state and consumer waiver state;
- token and wall-clock totals by branch/model when available;
- next legal transition;
- ELI5 owner summary.

The readback should never report a job as merely "running" when the active
frontier is actually blocked by a known schema/readiness/resource issue.

## Checkpoint And Compaction Resilience

`latest-run-state` must be updated:

- after prompt submission;
- after router/front door;
- after Mission Ledger;
- after Commitment Work Packet fanout;
- after context scout/context repair;
- after graph compile;
- after resource materialization;
- after split-required transitions;
- before and after every frontier superstep;
- after validation;
- after closeout/finalization;
- on terminal `succeeded`, `needs_review`, `failed`, or `canceled`.

After context compaction or operator reconnect, a reader should recover the
current phase and blocker from the latest state file without replaying the
entire artifact tree.

## Tests

Required tests:

1. Parallel frontier latest-run-state includes multiple branch states.
2. A resource-materialization blocker appears with schema path and next
   transition.
3. A no-progress halt appears as a root cause, not generic running state.
4. A terminal adapter outcome cannot be obscured by stale retry/pending state.
5. Work Queue readback and latest-run-state agree on graph id, active node ids,
   blocked node ids, and next transition.
6. Token/wall-clock totals are present when provider/runtime data exists and
   explicitly labeled as estimated when app-server usage is unavailable.
7. Bounded latest-run-state metadata stays under artifact storage limits.

## Natural Follow-Ons

After the pre-proof pass:

- add an owner-facing live delta stream for active frontier changes;
- add branch-level pause/resume/cancel controls;
- add timeline visualizations by superstep and branch;
- add token/cost trend projections during long proofs;
- add workflow-specific readback templates for planning, research, design,
  marketing, docs, and QA workflows.
