# Post-Context Implementation Task Compiler

Status on 2026-05-20: accepted architecture direction and next
pre-Product/Spec proof blocker.

## Problem

The latest Product/Spec Planning proof produced a valid coding-team graph at
the high-level work-group layer, but promoted those groups into executable
implementation nodes too early.

Observed graph shape:

1. context scout for workflow/plugin readiness.
2. context scout for scheduler/runtime boundary.
3. context scout for planning capsule, human decision, and action compile.
4. context scout for Work Queue, closeout, and docs.
5. four implementation nodes.
6. one validation node.
7. reviewer.
8. closeout.

That graph is appropriate as a work-intent graph. It is not appropriate as an
executable implementation graph.

The first implementation node selected `implementation_microtask` and
`worker.kimi.file-implementation` while carrying directory-level target refs
such as `extensions/execution-platform/src/workflows/` and
`docs/projects/execution-platform/`. The implementation-readiness gate
correctly blocked the node because it lacked readable target file refs and
file snapshots. This is an upstream context/task-compilation failure, not a
Kimi implementation failure.

## Product/Spec Node Shape Clarification

The Product/Spec Planning implementation proof runs under `agent_team.coding`.
It should not execute Product/Spec runtime nodes such as:

- `planning_orchestrator`
- `web_research`
- `planning_capsule_draft`
- `planning_capsule_revision`
- `human_planning_decision`
- `action_graph_proposal`
- `compile_runtime_plan`

Those are target workflow primitives to build, register, test, and prove. The
coding-team graph should contain coding implementation tasks whose objectives
explicitly build those primitives. Their absence as executing nodes in the
coding graph is not a defect. The defect is when the coding implementation
groups do not break those deliverables into concrete file-resolved tasks.

## Canonical Two-Layer Graph

Complex coding workflow graph creation has two layers:

1. work-intent graph.
2. executable task graph.

The work-intent graph is model-authored intent compiled by runtime:

- high-level work groups.
- commitment mappings.
- context questions.
- likely repo areas.
- capability intent.
- dependency/parallelism rationale.
- downstream consumers.
- validation needs.

The executable task graph is runtime-compiled after context supply:

- concrete implementation task packets.
- readable target file snapshots or explicit new-file intents.
- exact validation refs.
- allowed edit scopes.
- evidence claim expectations.
- capability-specific node contracts.
- dependency edges over concrete file ownership and handoff refs.

Implementation workers may run only from executable task graph nodes.

The compiler must also preserve the semantic distinction between
source-grounding/read-only evidence and edit-required implementation. A
post-context packet with no changed-file evidence requirement is not an
`ImplementationTaskPacket`; it is a read-only/source-grounding execution
packet routed to a context/review executor. The model authors the
`executionIntent`; runtime compiles the evidence mode and dispatch contract.
See
`execution-intent-evidence-mode-and-worker-dispatch.md`.

The upstream `WorkIntent` contract is defined in
`work-intent-control-plane-contract.md`. This compiler may only accept
`source_edit` WorkIntents for `ImplementationTaskPacket` output.

## ImplementationTaskPacket v3

`ImplementationTaskPacket` is the canonical post-context handoff from
scheduler/context supply to implementation workers.

Required fields:

- `packetId`
- `executionIntent: "source_edit"` for file-edit workers
- `evidenceMode` including `changed_file_evidence`
- `sourceWorkUnitId`
- `sourceGraphNodeId`
- `workflowId`
- `runtimeJobId`
- `graphId`
- `targetCommitmentIds`
- `sourceCommitmentPacketRefs`
- `sourceContextHandoffRefs`
- `objective`
- `expectedPatchShape`
- `expectedOutput`
- `successCriteria`
- `downstreamConsumer`
- `targetFileRefs`
- `targetFileSnapshots`
- `allowedEditScope`
- `newFileIntents`
- `mustReadRefs`
- `likelyModifyRefs`
- `validationCommandRefs`
- `validationDiscoveryPlan`
- `existingApisAndTypes`
- `knownTests`
- `dependencyNotes`
- `riskAndBlastRadius`
- `stopIfMissing`
- `evidenceClaimExpectations`
- `capabilityFit`
- `costAndEscalationPolicy`
- `rawPromptStored: false`
- `rawResponseStored: false`
- `rawProviderLogStored: false`
- `rawToolLogStored: false`

Clean packet acceptance requires either:

- at least one readable existing target file snapshot, or
- an explicit new-file intent with parent directory snapshot and import/export
  integration refs.

Directory-only target refs are not executable implementation context. They may
seed context scout, but they cannot unlock a file-edit worker.

Read-only source-grounding tasks are not invalid; they are invalid only when
compiled as edit-required implementation packets. The correct transition is a
read-only evidence node or a scheduler repair asking the model to choose the
right execution intent/capability pair.

## Compiler Inputs

The compiler receives:

- accepted Mission Ledger.
- accepted Commitment Work Packets.
- work-intent graph node contract.
- node-scoped context scout handoff packet.
- verified context refs and snapshots.
- source prompt index/excerpt refs.
- capability manifest.
- workflow evidence profile.
- code intelligence refs when available.
- existing validation refs or validation discovery hints.
- current graph state and dependency edges.

The compiler is runtime-owned for schema, refs, lifecycle, authority, storage,
budget, and canonical node creation. Models may provide semantic judgment only
where needed:

- whether scout context is sufficient.
- whether a work group should split.
- which file ownership boundaries are coherent.
- whether implementation belongs on Kimi/Qwen/non-Codex, Codex, test author,
  docs editor, or reviewer.
- whether broad Codex integration is justified.

## Split Policy

After each context scout handoff, runtime must classify the work-intent node:

- `ready_as_single_task`
- `split_required`
- `context_repair_required`
- `human_decision_required`
- `codex_integration_required`
- `needs_review`

`split_required` is the default for broad Product/Spec implementation groups
that touch multiple runtime surfaces, such as workflow registration,
capability registry, scheduler policy, Work Queue readback, docs, and tests.

Split criteria:

- multiple unrelated directories.
- multiple new node primitives or executor surfaces.
- source and test/doc work mixed in one node.
- capability registry and executor implementation mixed with UX/readback.
- shared schema migration plus downstream consumers.
- unclear file ownership.
- multiple validation modes.
- target refs remain directories after context scout.

The split result is a set of implementation task packets, not model-authored
executable node envelopes.

## Capability Selection After Context

Capability selection for implementation must happen after file resolution.

Policy:

- `implementation_microtask` requires concrete file snapshots and a bounded
  edit scope.
- non-Codex implementation lanes are preferred for scoped source, docs, test,
  schema, and readback tasks once packets are concrete.
- `implementation_complex` is escalation/integration after cheaper scoped
  lanes are considered or when the packet crosses too many files/surfaces for
  cheaper workers.
- test-writing and validation tasks should use test/validation capabilities,
  not generic implementation.
- docs/readback tasks should use docs or observability/readback capabilities
  when available.

The model chooses semantic capability fit and rationale. Runtime derives node
kind, executor key, worker ref, evidence classes, budgets, retries, and Work
Queue child refs.

## Readiness Gate

Implementation readiness moves from node metadata to
`ImplementationTaskPacket` validation.

Before invoking a worker, runtime must prove:

- packet id is persisted.
- target commitments are mapped.
- accepted context handoff refs are attached.
- target file refs are readable or explicit new-file intents are present.
- snapshots are fresh for the current repo/worktree.
- validation refs or validation discovery plan exists.
- allowed edit scope is narrower than broad repository areas.
- expected patch shape is bounded.
- evidence claim expectations are present.
- selected capability is valid for packet complexity.

If any required field is missing, the scheduler must not invoke Kimi, Qwen,
Codex, validation, or docs workers. It must create context repair, work split,
human decision, or needs-review evidence.

## Graph Mutation Rules

Executable implementation nodes are created only from accepted
`ImplementationTaskPacket`s.

Runtime mutation rules:

- high-level implementation groups may remain as `work_intent` or
  non-runnable planned nodes.
- implementation-bearing work-intent nodes cannot be selected for execution.
- context scout handoff attaches to the work-intent node.
- post-context compiler emits one or more implementation task packets.
- runtime creates executable implementation/test/docs/readback nodes from
  those packets.
- edges preserve provenance:
  - work-intent node -> context scout.
  - context scout -> implementation task packet.
  - task packet -> executable implementation node.
  - implementation node -> validation/review/closeout.
- Work Queue child materialization must distinguish draft work groups from
  executable tasks.

## Proof Harness Requirements

The replay/proof harness must expose boundaries for:

- accepted Commitment Work Packets.
- work-intent graph accepted.
- node-scoped context scouts complete.
- implementation task packets compiled.
- executable task graph accepted.
- first implementation node readiness.
- worker invocation.
- validation.
- review.
- closeout.

The harness must not treat a high-level work-intent graph as proof that
implementation can run. It must fail closed when implementation task packets
are missing or directory-only.

The harness must also accept both `context_supplies` and runtime-compiled
handoff edges that are explicitly typed as context handoffs. Gate semantics
must align with production scheduler semantics so proof does not fail a valid
runtime graph due to edge-name drift.

## Work Queue Readback

Owner-facing readback must show both layers:

- work-intent groups.
- context scout status per group.
- implementation task packets derived from each group.
- readiness status per packet.
- executable nodes created from each packet.
- selected worker/model and cost policy.
- missing file refs, snapshots, validation refs, or context blockers.
- next scheduler decision.

The owner should be able to tell whether failure is:

- broad work-intent decomposition.
- context scout insufficiency.
- task-packet compilation.
- capability selection.
- worker/provider execution.
- validation.
- evidence/closeout.

## Acceptance Criteria

This feature is complete only when:

- production `agent_team.coding` cannot invoke implementation workers from
  high-level work-intent groups.
- post-context task-packet compilation is first-class runtime code, not proof
  script glue.
- Product/Spec-class replay from accepted packets produces work-intent groups,
  node-scoped context scouts, task packets, executable implementation nodes,
  validation/review/closeout nodes, and owner readback.
- Kimi/non-Codex implementation nodes receive file snapshots, scoped edit
  boundaries, validation refs, and evidence expectations.
- broad Codex is selected only when packet complexity justifies escalation.
- focused tests cover clean, split, repair, new-file, directory-only blocked,
  and harness edge-kind parity cases.
- stale/fallback paths cannot mark implementation success without accepted
  task packets and evidence claims.
- read-only source-grounding tasks cannot be sent to a file-edit worker or
  counted as changed-file proof.
