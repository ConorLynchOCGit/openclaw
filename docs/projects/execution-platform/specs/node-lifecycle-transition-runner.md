---
summary: "Canonical spec for the NodeLifecycleTransitionRunner: the workflow-agnostic lifecycle engine that drains legal node transitions before the scheduler may ask the global orchestrator for graph repair."
title: "Node Lifecycle Transition Runner"
---

# Node Lifecycle Transition Runner

Date: 2026-05-28

Status: P0 pre-proof governing spec. This supersedes scheduler-local
post-resource lifecycle helpers as the production architecture for advancing
WorkIntent, node resource demand, target selection, resource materialization,
worker readiness, validation, evidence, and closeout gates.

2026-05-28 correction: this runner is not complete while any production
component outside the runner still authors lifecycle gates, next legal local
transitions, or global-scheduler eligibility. The governing corrective spec is
[Canonical Lifecycle Convergence And Residue Excision](/projects/execution-platform/specs/canonical-lifecycle-convergence-and-residue-excision).
The next tranche collapses scheduler readiness, WorkIntent context resolution,
capability transition inference, resource materialization, worker tool-surface
derivation, readback, and replay onto this runner as the sole authority.

2026-05-29 ownership consolidation update: code search showed that the
failure class is wider than any single domain-resource-selection bug. Focus,
demand open, specialist narrowing, domain resource selection, action gate,
worker action, validation, evidence, readback, and root-cause collapse must
all be runner-owned transitions. The governing consolidation spec is
[Node Lifecycle Transition Ownership Consolidation](/projects/execution-platform/specs/node-lifecycle-transition-ownership-consolidation).
It explicitly forbids a separate `DomainResourceSelectionRunner`, direct
lifecycle provider calls in closure proof paths, duplicate model-facing tool
dialects, helper modules that decide lifecycle gates, and worker prompt menus
not derived from `NodeLifecycleProjection.nextLegalTransitions`.

2026-05-31 worker context correction: the runner must no longer require
pre-worker implementation materialization for implementation/test/docs-edit
worker readiness. The governing worker-context spec is
[Worker-Owned Context Search/Read Lifecycle](/projects/execution-platform/specs/worker-owned-context-search-read-lifecycle).
The runner may start a worker from a partial packet when objective,
commitments, restrictions, authority, capability, validation expectations,
evidence expectations, and legal context/action tools are present. Missing
semantic context is handled by runner-projected worker context transitions,
not by scheduler-side materialization or fixed snapshots.

Governing related specs:

- [Worker-Owned Context Search/Read Lifecycle](/projects/execution-platform/specs/worker-owned-context-search-read-lifecycle)
- [Node Lifecycle Transition Ownership Consolidation](/projects/execution-platform/specs/node-lifecycle-transition-ownership-consolidation)
- [Runtime Node Readiness And Transition Engine](/projects/execution-platform/specs/runtime-node-readiness-transition-engine)
- [Generic Orchestration Runtime](/projects/execution-platform/specs/generic-orchestration-runtime)
- [Mandatory Context Focus And Target Selection Boundary](/projects/execution-platform/specs/mandatory-context-focus-and-target-selection-boundary)
- [Node-Local Context Demand And Legacy Evisceration](/projects/execution-platform/specs/node-local-node-resource-demand-and-legacy-evisceration)
- [Runtime Artifact Payload Store And Bounded Manifests](/projects/execution-platform/specs/runtime-artifact-payload-store-and-bounded-manifests)
- [Operator Frontier Readback And Latest Run State](/projects/execution-platform/specs/operator-frontier-readback-and-latest-run-state)

## Why This Exists

The Product/Spec replay exposed a higher-order control-plane failure:
node-local lifecycle states existed, but they were not authoritative. The
scheduler could still fall through to the global orchestrator while nodes had
legal local transitions such as:

- `resource.focus.accept`
- `resource.demand.open`
- `resource.scout.submit_exact_handles`
- `resource.selection.propose`
- `node.execution_packet.mark_resource_ledger_ready`
- `worker.patch.force_author_from_plan`
- `worker.validation.run_structural_default`
- `worker.evidence.claim_from_validation`

The current implementation keeps too much lifecycle behavior inside
`RuntimeWorkGraphScheduler.tryAdvancePostResourceWorkIntentLifecycle`. That
helper is optional, scans only `planned` WorkIntent nodes, may skip repeated
status/hash states before applying legal transitions, and lets
`requestValidDecision()` call the global scheduler when a local lifecycle gate
is still open.

That is the architectural bug. The system needs one mandatory
`NodeLifecycleTransitionRunner`.

## First Principles

1. Models author semantic intent, focus, target selection, sufficiency,
   implementation plan, patch semantics, and closeout judgment.
2. Runtime owns schemas, refs, hashes, manifests, payload storage, authority,
   budgets, locks, lifecycle transitions, validation execution, evidence
   structure, and readback projection.
3. A graph node schedules work. It is not the source of executable semantics.
4. A `NodeExecutionContract`/`NodeExecutionPacket` defines executable
   semantics.
5. A `NodeLifecycleProjection` is the only gate state readback and scheduler
   may use after graph acceptance.
6. Global graph repair is illegal while any node has a pending legal
   lifecycle transition.
7. `nodeStatus === "planned"` is not the eligibility boundary. Nodes in
   `needs_review` can still have legal local lifecycle transitions.
8. Repeated no-progress collapse must happen after the runner proves no legal
   transition can advance the node, not before.
9. The lifecycle engine must be workflow/domain generic. Coding is the first
   proof domain, not the only domain.
10. No raw prompts, raw responses, transcripts, provider logs, tool logs,
    command logs, raw DB rows, secrets, or hidden reasoning may be stored.
11. Helper modules are retained only as stateless contract/compiler/parser/
    structural-validation libraries. Any helper that decides a lifecycle gate,
    next legal transition, global-scheduler eligibility, worker tool menu, or
    readback first-open gate is a competing lifecycle owner and must be
    deleted, split, or moved behind a runner handler.
12. Lifecycle proof and replay paths must exercise the same runner handlers as
    production. Direct prompt-only model proof paths are diagnostics, not
    closure evidence.

## Canonical Runtime Position

The runner sits inside `RuntimeWorkGraphScheduler.run`, between frontier
execution and global graph-decision calls.

Required order:

```text
read graph snapshot
  -> run executable frontier if ready
  -> drain NodeLifecycleTransitionRunner
  -> promote deterministic executable nodes if no lifecycle transitions remain
  -> evaluate completion
  -> only then request global orchestrator graph decision
```

Hard invariant:

```text
requestValidDecision() must assert:
  no pending NodeLifecycleProjection has canCallGlobalScheduler === false
  and no pending legal local transition exists.
```

If that assertion fails, the scheduler must return a bounded
`node_lifecycle_transition_runner_blocked_global_scheduler` artifact instead
of invoking the orchestrator.

## Core Artifact: NodeLifecycleProjection

`NodeLifecycleProjection` is a compact manifest artifact. It must not embed
large context bodies, prompt bodies, provider bodies, file contents, diffs, or
raw logs.

Required fields:

```ts
type NodeLifecycleProjection = {
  artifactKind: "execution_platform.node_lifecycle_projection";
  schemaVersion: "execution-platform.node-lifecycle-projection.v1";
  projectionRef: string;
  projectionHash: string;
  runtimeJobId: string;
  workflowId: string;
  graphId: string;
  nodeId: string;
  branchId: string | null;
  capabilityId: string | null;
  lifecycleTransitionProfileRef: string | null;
  currentLifecycleState: string;
  currentGate: string;
  nodeStatus: string;
  executionIntent: string | null;
  evidenceMode: string[];
  nextLegalTransitions: string[];
  acceptedArtifactRefs: string[];
  blockedArtifactRefs: string[];
  requestArtifactRefs: string[];
  diagnosticArtifactRefs: string[];
  providerDiagnosticRefs: string[];
  rootCauseSignature: {
    signatureRef: string;
    signatureHash: string;
    stage: string;
    nodeKind: string;
    capabilityId: string | null;
    currentGate: string;
    missingFields: string[];
    reasonCodes: string[];
    contractVersion: string | null;
  } | null;
  canCallGlobalScheduler: boolean;
  rawPromptStored: false;
  rawResponseStored: false;
  rawTranscriptStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogStored: false;
  rawDbRowsStored: false;
  hiddenReasoningStored: false;
};
```

Projection bodies larger than the metadata cap must be split into:

- compact manifest metadata on graph/checkpoint/tool records;
- artifact-backed body/payload refs for detailed lists;
- bounded summaries and counts in readback.

The official overflow strategy is manifest in metadata plus body artifact,
not truncating semantic content and not increasing metadata limits.

## Runner API

Required public interface:

```ts
type NodeLifecycleTransitionRunner = {
  project(input: {
    graphId: string;
    snapshot: RuntimeWorkGraphSnapshot;
    node: TeamGraphNode;
  }): NodeLifecycleProjection;

  drain(input: {
    graphId: string;
    iteration: number;
    snapshot: RuntimeWorkGraphSnapshot;
    maxTransitions: number;
  }): Promise<NodeLifecycleDrainResult>;
};
```

`NodeLifecycleDrainResult`:

```ts
type NodeLifecycleDrainResult = {
  status: "continue" | "needs_review" | "failed";
  actionTaken: boolean;
  hasPendingLegalTransitions: boolean;
  blockedGlobalScheduler: boolean;
  refs: string[];
  projections: NodeLifecycleProjection[];
  reasonCodes: string[];
  continueLoop: boolean;
};
```

The runner must refresh the graph snapshot after each successful transition
that updates node metadata, node status, artifact refs, graph edges, or
resource packets.

## Lifecycle Eligibility

The runner must consider every non-terminal graph node with a capability,
contract, WorkIntent, NodeExecutionPacket, NodeResourceLedger, target-selection
state, validation state, evidence state, or next legal transition.

Eligible node statuses include:

- `planned`
- `needs_review` when the reason is a recoverable lifecycle gate
- `needs_repair`
- `blocked` when the blockage maps to a legal repair transition
- stale `running` only when runtime heartbeat/lease state proves the work is
  no longer live and the workflow policy permits repair

Terminal statuses excluded by default:

- `succeeded`
- `failed`
- `canceled`
- terminal human-blocked states unless a human resume event exists

`nodeStatus === "planned"` must never be the sole eligibility filter.

## Transition Profiles

Extend the capability manifest with transition profile fields:

```ts
type RuntimeNodeCapability = {
  lifecycleTransitionProfileRef: string;
  allowedLifecycleTransitions: string[];
  requiredLifecycleTools: string[];
  domainResourceKinds: string[];
};
```

`lifecycleTransitionProfileRef` points to a workflow/capability transition
profile. The runner validates that a transition is allowed by the profile
before invoking it.

Example coding profile:

```json
{
  "profileRef": "lifecycle-profile://agent_team.coding/source_edit.v1",
  "domainResourceKinds": ["repo_file", "file_window", "symbol", "test_command", "diff", "validation_result"],
  "allowedLifecycleTransitions": [
    "resource.focus.accept",
    "resource.focus.mark_unanswerable",
    "resource.demand.open",
    "resource.scout.submit_exact_handles",
    "resource.selection.propose",
    "node.execution_packet.mark_resource_ledger_ready",
    "node.execution_packet.promote_worker_action_ready",
    "worker.edit.plan",
    "worker.patch.force_author_from_plan",
    "worker.validation.run_structural_default",
    "worker.evidence.claim_from_validation"
  ],
  "requiredLifecycleTools": [
    "resource.focus.accept",
    "resource.demand.open",
    "resource.scout.submit_exact_handles",
    "resource.selection.propose"
  ]
}
```

Transition profiles are not deterministic semantic classifiers. They are
capability declarations. The model or workflow chooses the semantic
capability; runtime validates that the selected capability exposes the
required lifecycle tools.

## Initial Transition Handlers

The first implementation must register handlers for the currently failing
coding/Product/Spec path:

1. `resource_focus_required`
   - Request or replay the model-authored `ResourceObjectiveFocus` small-verb
     turn.
   - Allowed model tools: `resource.focus.accept`,
     `resource.focus.mark_unanswerable`.
   - Runtime validates legal handle membership, required fields, count,
     budget, manifest storage, and authority only.
2. `resource_focus_blocked`
   - Retry only when the blocker is structurally repairable and below the
     configured attempt cap.
   - Otherwise emit a terminal root-cause artifact. Do not call the global
     scheduler.
3. `resource_demand_open_pending`
   - Open `NodeResourceDemandSession` from the accepted focus ref and legal
     universe ref.
   - Hydrate from artifact refs; do not rebuild semantic seeds from current
     node metadata.
4. `resource_demand_open`
   - Fulfill exact model-selected handles directly.
   - If selected handles are broad/vague, dispatch the consumer-bound
     specialist narrowing subturn; runtime must not choose line ranges.
5. `resource_narrowing_required` / `resourceNarrowingStatus: dispatch_ready`
   - Invoke the specialist narrowing selector.
   - Allowed model tools: `resource.scout.submit_exact_handles`,
     `resource.scout.mark_narrowing_blocked`.
   - Append accepted exact windows to `NodeResourceLedger`.
6. `resource_ledger_ready`
   - Accept context for the consumer or require target selection according to
     capability/evidence mode.
7. `domain_resource_selection_required`
   - Invoke model-authored resource selection from ledger evidence and legal
     authority universe.
   - Runtime validates refs, capability, authority, snapshots, and counts.
8. `domain_action_gate_blocked`
   - Materialize missing snapshots, validation refs/defaults, or produce a
     precise upstream blocker.
9. `worker_action_ready`
   - Execute worker small-verb loop.
   - After accepted plan, force patch-author subturn or typed upstream
     blocker.
10. `post_action_validation`
    - Run targeted validation or structural default validation.
11. `evidence_closure`
    - Compile evidence claims from changed files, validation refs, task ids,
      node ids, and commitment ids. Model review can judge sufficiency later.

Each handler returns structured transition evidence, refs, status, and a
metadata patch. No handler may silently call the global orchestrator as a
fallback.

## Scheduler Integration Requirements

Remove or replace:

- `tryAdvancePostResourceWorkIntentLifecycle` as a scheduler-local helper;
- lifecycle scans that filter only `nodeStatus === "planned"`;
- repeated status/hash skip logic that runs before legal transition
  evaluation;
- readback-specific reason-code inference as the source of lifecycle truth;
- global scheduler graph repair for resource focus, resource demand,
  specialist narrowing, domain resource selection, action-gate hydration, validation,
  or evidence closure gates.

Add:

- `NodeLifecycleTransitionRunner` construction in the scheduler options or
  scheduler constructor;
- mandatory runner drain before `requestValidDecision()`;
- assertion that `requestValidDecision()` cannot run when any
  `NodeLifecycleProjection.canCallGlobalScheduler === false`;
- bounded projection artifact emission per transition;
- no-progress collapse only after the runner proves no legal transition is
  actionable.

## Readback Integration

Readback must consume `NodeLifecycleProjection` as the canonical gate input.

`firstOpenGate` must prefer:

1. active non-terminal `NodeLifecycleProjection.currentGate`;
2. latest runner root-cause artifact;
3. branch-scoped frontier/readiness state;
4. fresh run-scoped proof manifest;
5. checkpoint fallback only when no runtime state exists and the confidence is
   explicitly `stale_checkpoint_fallback`.

Readback must not independently re-infer gates from broad reason-code sets
when a projection exists.

Required gate names include:

- `resource_focus_required`
- `resource_focus_blocked`
- `resource_demand_open_pending`
- `resource_demand_open`
- `resource_narrowing_required`
- `resource_ledger_ready`
- `domain_resource_selection_required`
- `domain_resource_selection_blocked`
- `domain_action_gate_blocked`
- `worker_action_ready`
- `post_action_validation`
- `evidence_closure`
- `node_lifecycle_root_cause_collapsed`

## No-Progress Collapse

The runner computes no-progress signatures over:

```text
stage
nodeKind
capabilityId
currentGate
missingFields
reasonCodes
contractVersion
transitionProfileRef
```

If the same signature repeats across the same node or sibling nodes without
new accepted refs, it emits one root-cause artifact and halts that branch. It
must preserve successful sibling evidence and must not keep reporting
`running` or `node_completed` for equivalent blockers.

## General-Domain Architecture

This move is domain-general if transition profiles are capability-defined and
resource kinds are abstract.

Generic lifecycle shape:

```text
intent accepted
  -> focus required
  -> context/resource demand opened
  -> evidence ledger ready
  -> resource selection required
  -> execution packet hydrated
  -> worker/action ready
  -> validation required
  -> evidence closure
  -> review/closeout
```

Coding specialization:

- resources: files, symbols, tests, snapshots, diffs, validation output;
- semantic model choices: context focus, target selection, file-change
  intent, patch plan, sufficiency.

Research specialization:

- resources: sources, citations, claims, datasets, freshness evidence;
- semantic model choices: source focus, claim relevance, citation
  sufficiency.

Operations specialization:

- resources: logs, metrics, incidents, runbooks, deployment refs;
- semantic model choices: incident hypothesis, telemetry focus, remediation
  proposal.

Design/content specialization:

- resources: assets, style rules, screenshots, generated variants, review
  notes;
- semantic model choices: visual target, asset relevance, acceptance review.

The runner is therefore a generalized dynamic workflow engine: scheduler
decides what work exists; lifecycle profiles decide which transitions are
legal; models author semantic choices inside small verbs; runtime validates
structure and advances state.

## Regression And Proof Gates

The P0 implementation item cannot close until these pass:

1. `needs_review + resource_demand_open` still advances lifecycle.
2. Accepted focus automatically opens demand.
3. Broad focus invokes specialist narrowing.
4. Lifecycle pending prevents global scheduler calls.
5. Stale blockers cannot override newer accepted artifacts.
6. Readback reports the runner gate exactly.
7. `requestValidDecision()` throws or returns a bounded blocker when pending
   lifecycle projections exist.
8. Capability transition profile rejects unregistered lifecycle tools.
9. A non-coding fixture uses the same runner with non-file `domainResourceKinds`.
10. Replay from the current Product/Spec focus/demand boundary proves the
    runner drains legal transitions before global scheduler repair.

Real-model proof gate:

- Use a Product/Spec-class middle-lane task, not a one-line toy.
- The run must show:
  `WorkIntent -> focus -> demand -> specialist narrowing if needed -> ledger
  -> target selection -> write gate -> edit/blocked result -> validation
  -> evidence/readback`.
- Any default graph-level context scout fanout or context synthesis path is a
  failing result.

## Work Queue Placement

This is the next P0 item before Product/Spec proof substrate replay and the
full proof. The proof substrate scrub, gateway OOM diagnostics, middle-lane
replay, and Product/Spec proof remain required, but they must execute after
the lifecycle runner is authoritative; otherwise they can still fall through
to the old global scheduler behavior.
