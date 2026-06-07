---
summary: "Current Product/Spec Planning production workflow architecture on RequirementMap, SchedulerGraphPatch, RuntimeGraph, NodeLifecycleRunner, and OpenClaw-native node sessions."
title: "Product/Spec Planning Production Workflow"
---

# Product/Spec Planning Production Workflow

Product/Spec Planning is a production workflow plugin on the generic
Execution Platform runtime. Its workflow id is:

```text
agent_team.product_spec_planning
```

It turns owner planning intent into bounded planning artifacts, compile
readiness, proposed child actions, and closeout. It does not execute proposed
child actions, mutate child lifecycle state, or claim implementation success
without a later explicit authority boundary.

This document supersedes older Product/Spec Planning architecture that used
Mission Ledger, Commitment Work Packets, WorkIntentGraph, pre-worker resource
focus/demand/materialization, discovery seeds, lexical-anchor products, or
bespoke non-Codex worker loops as live production proof gates.

## Canonical Runtime Path

Product/Spec Planning uses the same current runtime spine as coding and other
scheduler-backed workflows:

```text
RouterStageRunner
  -> IntakeStageRunner
      -> SourcePromptArtifact
      -> RequirementMap
  -> SchedulerStageRunner
      -> SchedulerGraphPatch
  -> RuntimeGraphRepository
      -> RuntimeGraphNode / RuntimeGraphEdge
  -> NodeLifecycleTransitionRunner
      -> NodeExecutionSnapshot
      -> runNodeAgentSession(nodeRunId)
      -> OpenClaw native agent session
      -> node.finish
  -> evidence / validation / review / closeout projection
```

The live semantic products are:

- `RequirementMap`: what must be done or proven.
- `RuntimeGraph`: who does it and in what order.
- `NodeLifecycleProjection`: how one node progresses.
- `NodeExecutionSnapshot`: bounded node-session source of truth.
- `node.finish`: the only terminal node-session outcome.

No live Product/Spec path may depend on a separate planning runner, proof-only
runner, WorkIntent promotion path, worker packet universe, context synthesis
glue, resource materialization gate, or degraded/system closeout.

## Executor Workflow Versus Target Subject

Product/Spec Planning can be an executor workflow or a target subject.

Use `agent_team.product_spec_planning` as executor when the owner asks for:

- product/spec planning.
- planning capsule generation.
- research-informed planning.
- action graph proposal.
- compile-readiness evaluation.
- bounded planning closeout.

Use `agent_team.coding` as executor when the owner asks to implement, wire,
refactor, test, harden, or delete code in the Product/Spec Planning system.
In that case Product/Spec Planning is only a target subject, and the proof is a
coding vertical proof.

The router must select executor workflow from requested action semantics, not
from the phrase "Product/Spec Planning" appearing in the prompt.

## Product/Spec Planning Runtime Responsibilities

When Product/Spec Planning is the executor, it produces planning evidence:

1. `PlanningIntentRecord`
   - owner objective, target subject/system refs, scope, constraints,
     non-goals, authority limits, known uncertainties, research-needed
     decision, human-decision-needed decision, and evidence expectations.
2. `ResearchBrief`
   - optional; bounded external/source findings, retrieval dates, confidence,
     limitations, stale-assumption warnings, and planning implications.
3. `PlanningCapsule`
   - owner-ready plan with problem statement, system facts, design constraints,
     workflow/runtime/data/UI/readback implications, validation and rollout
     plan, risks, open decisions, limitations, and ELI5.
4. `HumanPlanningDecision`
   - optional bounded owner decision node with options, tradeoffs, response
     shape, blocking refs, and resume refs.
5. `ActionGraphProposal`
   - proposed child actions, workflows/capabilities, dependencies,
     validations, authority needs, context/resource needs, evidence
     expectations, risks, rollback notes, and proposed Work Queue child-item
     summaries.
6. `CompileRuntimePlanResult`
   - proposal schema/dependency/authority/workflow/executor/child-feasibility
     validation, missing decisions, compile-readiness state, and limitations.
7. `ProductSpecPlanningCloseout`
   - finalization mapped to accepted RequirementMap requirements, planning
     artifacts, compile-readiness evidence, readback refs, and completion
     review status.

These products are evidence only when attached through the generic evidence
contract and accepted by runtime/readback. A polished markdown artifact or
assistant message is not closure truth.

## Graph Shape

The scheduler should build a compact RuntimeGraph from RequirementMap
inventory. The expected Product/Spec graph, when all work is needed, is:

```text
planning_orchestrator
  -> optional web_research
  -> planning_capsule
  -> optional human_task
  -> action_graph_compile
  -> mission_validation
  -> mission_review
  -> mission_closeout
```

Validation, review, and closeout are graph nodes by default. They are not
passive coverage flags and not worker self-claims. The scheduler may shard
research, planning, validation, or review only when there is a concrete
parallelism reason such as disjoint subsystems, independent research
questions, separate validation suites, or capability constraints.

Runtime owns node ids, node kinds, executor keys, worker refs, evidence modes,
storage flags, authority flags, and obvious tail ordering. The model authors
semantic grouping, concise objectives, non-obvious dependencies, and blocked
or deferred rationales.

## Node Execution

Every executable Product/Spec node runs through the same OpenClaw-native node
execution path as coding nodes:

```text
NodeLifecycleTransitionRunner
  -> NodeExecutionSnapshot
  -> execution-coding OpenClaw agent session initially
  -> execution-node-workflow skill
  -> normal OpenClaw tools, skills, subagents
  -> node.finish
```

Initially validation, review, closeout, planning, and action-graph compile
nodes may all use the configured `execution-coding` OpenClaw agent with
node-kind-specific snapshots and evidence contracts. Dedicated planning,
validation, review, or closeout agents should be added only after proof shows
that a single profile is too broad or materially wrong.

The node agent owns local cognition:

- reading the node snapshot.
- hydrating requirement refs and source-prompt refs.
- deriving search terms from real source material.
- repo/search/read/context work when the node affects code or runtime docs.
- planning or artifact authoring.
- validation iteration.
- local repair.
- subagent use.
- evidence synthesis.

`NodeLifecycleTransitionRunner` owns lifecycle and terminal acceptance:

- start permission.
- current gate.
- legal transition.
- authority narrowing.
- node execution snapshot persistence.
- evidence acceptance.
- blocker/escalation mapping.
- readback projection.

The runner must not infer cognitive microphases such as "keyword plan
accepted" or "context sufficiency accepted." It starts the agent session and
accepts only typed terminal results from `node.finish`.

## Intake Contract

Pre-scheduler intake has one semantic product: `RequirementMap`.

`IntakeStageRunner` must:

- persist one bounded source prompt artifact.
- walk the entire prompt in bounded windows.
- extract source-anchored candidate requirements through provider-native
  tools.
- consolidate candidates into compact final requirements.
- persist only requirement id/text/role/source refs plus coverage metadata.

It must not persist live Mission Ledger, ObligationGraph, DiscoveryBrief,
SchedulerIntakePacket, lexical-anchor, or discovery-seed products.

Downstream consumers reopen prompt refs through their own runner when needed.
The raw prompt remains the source of truth. RequirementMap is a navigation map,
not a lossy substitute for the prompt.

## Scheduler Contract

`SchedulerStageRunner` consumes RequirementMap and emits `SchedulerGraphPatch`.
It must not route through WorkIntent graph-control nodes, full staged
scheduler JSON drafts, `OrchestratorGraphDecision`, scheduler submit
ceremonies, or scheduler-local lifecycle transitions.

Scheduler owns:

- grouping requirements into coherent node seeds.
- deciding aggregate mission validation/review/closeout nodes.
- capability binding when runtime cannot bind unambiguously.
- non-obvious dependency edges.
- graph amendment from typed graph-level requests.
- typed scheduler no-progress.

Scheduler does not own worker-start permission, prompt/repo context search,
edit/action planning, validation repair, evidence gap repair, escalation, or
node-local readback.

## Proof Families

There are two separate proof families.

### Coding Vertical Proof

Executor: `agent_team.coding`

Target subject: `agent_team.product_spec_planning`

Purpose: prove that the coding vertical can implement meaningful Product/Spec
Planning framework work through the generic runtime and OpenClaw-native node
sessions.

This proof should include:

- a real framework source change, not a toy edit.
- RequirementMap coverage from the full prompt.
- SchedulerGraphPatch graph generation.
- RuntimeGraph node persistence.
- NodeLifecycleTransitionRunner snapshot preparation.
- OpenClaw native agent session start.
- source prompt/resource reads by the agent.
- repo search/read/edit/validation by the agent.
- `node.finish`.
- runtime evidence acceptance/readback.

If edits are made to prove the path, review the diff before closeout. If the
test intentionally uses the proof prompt as a live coding exercise and the
resulting edits are not intended to remain, they must be reverted only for the
files touched by the test and only after recording the proof evidence.

### Product/Spec Workflow Proof

Executor: `agent_team.product_spec_planning`

Purpose: prove that Product/Spec Planning can produce planning artifacts,
compile-readiness, readback, and closeout without executing child work.

This proof should include:

- correct executor routing.
- RequirementMap intake.
- SchedulerGraphPatch graph generation.
- planning nodes through OpenClaw-native node sessions.
- PlanningIntentRecord / ResearchBrief if needed / PlanningCapsule /
  ActionGraphProposal / CompileRuntimePlanResult.
- validation, review, and closeout nodes.
- no child runtime-job execution.
- no lifecycle mutation of proposed child work.

## Success Gates

Clean success requires:

- correct executor/target-subject routing.
- production WorkflowDefinition and WorkflowPlugin readiness.
- accepted RequirementMap with full prompt coverage.
- accepted SchedulerGraphPatch with graph nodes, edges, coverage, and mission
  tail nodes.
- RuntimeGraph persistence from the graph patch.
- `NodeLifecycleTransitionRunner` as the only node lifecycle owner.
- persisted `NodeExecutionSnapshot` for executable nodes.
- OpenClaw native agent session through `runNodeAgentSession`.
- agent use of `openclaw.resource.read` for node snapshots and prompt/source
  refs.
- normal OpenClaw tools/skills/subagents for local work.
- terminal `node.finish`.
- evidence refs accepted by runtime/readback.
- validation/review/closeout nodes where required.
- model-authored closeout and completion review.
- bounded artifacts and no raw prompt/response/provider/tool/command/DB log or
  hidden-reasoning storage.

No Product/Spec proof may pass through:

- Mission Ledger as live intake truth.
- Commitment Work Packets.
- WorkIntent graph-control nodes.
- resource focus/resource demand/materialization as a required pre-worker
  readiness chain.
- discovery seed or lexical-anchor products.
- worker packet/start-contract production success.
- non-Codex bespoke worker loops.
- replay-only worker execution.
- context synthesis as default glue.
- degraded/system closeout.

## Current Validation Targets

Focused validation should include the current live surfaces:

- `product-spec-planning-plugin.test.ts`
- `workflow-definition-registry.test.ts`
- `requirement-map.test.ts`
- `intake-stage-runner.test.ts`
- `scheduler-stage-runner.test.ts`
- `runtime-work-graph-scheduler.test.ts`
- `runtime-node-capability-registry.test.ts`
- `node-lifecycle-transition-runner.test.ts`
- `node-agent-session.test.ts`
- `execution-platform-agent-team-runner.test.ts`
- `execution-read-model.test.ts`
- `architecture-residue-source-inventory.test.ts`
- `pnpm tsgo:fast`

The next full proof should use the updated Product/Spec production prompt and
must report whether it is proving the coding vertical or the Product/Spec
planning workflow.
