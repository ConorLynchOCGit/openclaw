# Product/Spec Planning Workflow Plugin Production Proof

You are OpenClaw working in `/root/services/openclaw-roles/live`.

This is the canonical execution prompt for Work Queue item
`openclaw-convergence.active-queue-34`: Product/Spec Planning Workflow Plugin
Production Proof.

This is a real production-grade implementation/proof task. It is not a
proof-shaped demo, not a narrow edge-case patch, and not a compatibility
exercise. Execute through the canonical OpenClaw runtime spine and close the
item only from accepted runtime evidence.

This is an implementation and proof task for an existing workflow/plugin/system:
Product/Spec Planning. Finish the production implementation, harden the runtime
integration, run meaningful proof coverage, review the result, and close the
work only from accepted runtime evidence.

## Source Specs To Read First

Read and use these source-of-truth specs before changing code or running the
proof:

- `docs/projects/execution-platform/product-spec-planning-production-workflow.md`
- `docs/projects/execution-platform/specs/product-spec-checkpointed-proof-framework.md`
- `docs/projects/execution-platform/specs/requirement-map-intake-decomposition.md`
- `docs/projects/execution-platform/specs/scheduler-graph-patch-runner.md`
- `docs/projects/execution-platform/specs/openclaw-native-node-execution.md`
- `docs/projects/execution-platform/specs/runner-owned-worker-execution-session.md`
- `docs/projects/execution-platform/specs/node-lifecycle-transition-ownership-consolidation.md`
- `docs/projects/execution-platform/specs/canonical-workflow-runtime-architecture.md`
- `docs/projects/execution-platform/specs/generic-orchestration-runtime.md`
- `docs/projects/execution-platform/specs/runtime-work-graph.md`
- `docs/projects/execution-platform/specs/maximum-toolification-architecture.md`
- `docs/projects/execution-platform/specs/runtime-toolification-and-utility-scheduling.md`
- `docs/projects/execution-platform/specs/runtime-node-readiness-transition-engine.md`
- `docs/projects/execution-platform/specs/execution-intent-evidence-mode-and-worker-dispatch.md`
- `docs/projects/execution-platform/specs/native-agentic-coding-harness-convergence.md`
- `docs/projects/execution-platform/specs/work-queue-execution-truth.md`
- `docs/projects/execution-platform/specs/work-queue-generated-item-lifecycle.md`
- `docs/projects/execution-platform/CURRENT_SLICE.md`
- `docs/projects/execution-platform/STATUS.md`

## Mission

Implement, harden, and prove Product/Spec Planning as a first-class production
workflow plugin on the canonical generic orchestration runtime.

Before submitting or running the proof, verify the pre-proof queue state:

- all `openclaw-convergence.contract-spine-*` pre-proof items must be closed
  from accepted runtime/readback/replay evidence.
- `openclaw-convergence.control-plane-07-readback-telemetry-proof` must
  remain closed from accepted runtime/readback evidence.
- the live gateway must build and start cleanly from the current tree.
- the canonical prompt artifact for this proof must be this file, with its
  prompt hash recorded in the run report.

The Product/Spec Planning workflow id is:

- `agent_team.product_spec_planning`

The production workflow definition and plugin are:

- `workflow-definition.agent_team.product_spec_planning.v1`
- `workflow-plugin.agent_team.product_spec_planning.v1`

The proof must demonstrate that Product/Spec Planning runs through the same
runtime spine used by scheduler-backed workflows:

1. Intent Front Door / UX-equivalent payload.
2. `IntakeStageRunner`.
3. replayable source prompt artifact with bounded addressing only.
4. `RequirementMap` authoring with model-authored requirements, roles, and
   bounded source refs.
5. `SchedulerStageRunner` graph-patch planning from RequirementMap inventory.
6. runtime-derived graph/node envelopes from `SchedulerGraphPatch`.
7. `NodeLifecycleTransitionRunner` node lifecycle ownership.
8. persisted `NodeExecutionSnapshot` artifacts.
9. `runNodeAgentSession` into a real OpenClaw native agent session.
10. `openclaw.resource.read`, normal OpenClaw tools/skills/subagents, and
    terminal `node.finish`.
11. evidence claims mapped to RequirementMap coverage.
12. validation/compile-readiness.
13. Work Queue child/readback projection.
14. model-authored Closeout Capsule.
15. completion review.
16. boundary replay checkpoints for accepted gates.

The current coding-team scheduler spine is SchedulerGraphPatch-first:

```text
prompt -> route -> IntakeStageRunner
-> source prompt artifact ref
-> RequirementMap
-> SchedulerStageRunner creates SchedulerGraphPatch node seeds, edges, and coverage
-> RuntimeGraphRepository persists runtime graph nodes/edges
-> NodeLifecycleTransitionRunner projects executable node lifecycle
-> NodeLifecycleTransitionRunner persists NodeExecutionSnapshot
-> runNodeAgentSession starts/resumes execution-coding OpenClaw agent
-> agent reads source prompt refs and repo through OpenClaw tools/subagents
-> agent edits/plans/validates or blocks
-> agent terminalizes with node.finish
-> validation -> evidence -> review/readback/closeout
```

Do not reintroduce the forbidden shortcut:

```text
context_synthesis group -> implementation node
```

Do not execute Product/Spec child actions; Product/Spec may propose child
actions and prove compile readiness only.

## Required Architecture

Product/Spec Planning must be native to the current generic orchestration
spine. Do not build or preserve:

- a Product/Spec-specific runner.
- a proof-only runner.
- deleted generic queued-runner production success for Product/Spec.
- generic queued workflow fallback success.
- degraded/system closeout success.
- deterministic semantic routing shortcuts.
- prompt-specific keyword exceptions.
- model-authored executable node envelopes.
- model-authored executor keys, node kinds, worker refs, evidence enums, or
  storage/authority flags.
- WorkIntent graph-control nodes, WorkIntent promotion, WorkIntent-owned
  `nextLegalTransitions`, or `OrchestratorGraphDecision` as the scheduler
  product.
- model-authored scheduler submit ceremonies or JSON-shaped scheduler tool
  calls.
- raw prompt, raw response, raw transcript, raw provider log, raw tool log,
  raw command log, raw DB row, hidden-reasoning, or secret storage.

The model decides semantic intent, usefulness, and sufficiency. Runtime owns
schema, refs, bounds, persistence, authority, lifecycle, tool execution, node
ids, executor keys, node kinds, worker refs, expected evidence classes, storage
flags, Work Queue child refs, and transition readiness.

## Workflow Definition And Plugin Gates

Confirm or implement the production definition/plugin with:

- status `production_ready`.
- `productionEnabled: true`.
- scheduler-backed execution.
- Runtime Tool-Call Kernel required.
- SchedulerStageRunner provider-native small-verb protocol required.
- runtime-derived node envelopes required.
- runtime-derived expected evidence required.
- model-authored structure review required.
- NodeLifecycleTransitionRunner required for node lifecycle/readiness before execution.
- OpenClaw-native node execution required for executable nodes.
- `NodeExecutionSnapshot`, `runNodeAgentSession`, `openclaw.resource.read`, and
  `node.finish` required for node execution.
- no required pre-worker context sufficiency, resource-focus, or
  resource-materialization gate before worker invocation.
- degraded/system closeout blocked.
- completion review required.
- proposal-only compile authority for ActionGraphProposal.

Required role classes:

- `orchestrator`
- `planning`
- `review`
- `closeout`

Optional role classes:

- `research`
- `human`
- `implementation`
- `observability`

Allowed Product/Spec capabilities:

- `planning_orchestrator`
- `web_research`
- `planning_capsule`
- `action_graph_compile`
- `human_task`
- `reviewer`
- `closeout`

Executor-key coverage must exist for:

- `role:orchestrator`
- `role:planning_orchestrator`
- `kind:orchestrator_plan`
- `kind:web_research`
- `kind:planning_capsule`
- `kind:human_task`
- `kind:action_graph_compile`
- `kind:compiler`
- `kind:closeout`

Missing workflow definition, plugin registration, executor coverage, runtime
tool kernel, evidence profile, closeout policy, completion-review policy, or
readback projection blocks success.

## Product/Spec Planning Runtime Flow

The Product/Spec planning graph must support:

1. `planning_orchestrator`
2. optional `web_research`, or an explicit model-authored no-research decision
3. `planning_capsule_draft`
4. optional `planning_capsule_revision`
5. optional `human_planning_decision`
6. `action_graph_proposal`
7. `compile_runtime_plan`
8. validation/review/readback nodes as needed
9. `planning_closeout`
10. completion review

The first executable node in a Product/Spec Planning runtime graph must be
planning-orchestrator-class. Research, capsule, human task, action-graph,
compiler, review, readback, and closeout nodes must wait for upstream evidence
and transition readiness.

## Product/Spec Planning System To Build And Prove

This proof is not only checking the harness. It must build or verify the
actual Product/Spec Planning system as a first-class workflow.

The system must convert an owner planning request into these canonical
artifacts and lifecycle states:

1. `PlanningIntentRecord`
   - objective, scope, target subject/system refs, non-goals, constraints,
     authority limits, uncertainties, research-needed decision,
     human-decision-needed decision, and evidence expectations.
2. `ResearchBrief`
   - optional; source refs, retrieval date, findings, confidence,
     limitations, stale-assumption warnings, and planning implications.
3. `PlanningCapsule`
   - owner-ready plan with problem statement, system facts, research
     influence, design constraints, workflow/runtime/data/UI/readback
     implications, validation/rollout plan, risks, open decisions,
     limitations, and ELI5.
4. `HumanPlanningDecision`
   - optional bounded decision node with options, tradeoffs, required response
     shape, blocking graph refs, and resume refs.
5. `ActionGraphProposal`
   - proposed child actions, workflows/capabilities, dependencies,
     validations, authority needs, context/resource needs, evidence
     expectations, risks, rollback notes, and proposed Work Queue child-item
     summaries.
6. `CompileRuntimePlanResult`
   - proposal schema/dependency/authority/workflow/executor/child-feasibility
     validation, missing decisions, compile-readiness state, and limitations.
7. `ProductSpecPlanningCloseout`
   - model-authored finalization mapped to RequirementMap coverage,
     planning artifacts, compile-readiness evidence, readback refs, and
     completion-review status.

The system must maintain proposal-only authority. Product/Spec Planning may
propose child work and prove compile readiness; it must not execute proposed
child actions, enqueue child runtime jobs, mutate child lifecycle state, or
claim implementation success without a later explicit authority boundary.

## SchedulerGraphPatch And Transition Readiness

Use the `SchedulerStageRunner` graph-patch protocol. Do not ask the model to
hand-author executable graph internals, full staged scheduler JSON drafts,
WorkIntent graph-control nodes, WorkIntent promotion, or scheduler-owned
lifecycle transitions.

Required scheduler stages:

- coverage and node grouping from accepted RequirementMap inventory.
- capability binding only when runtime cannot bind a single legal candidate.
- non-obvious dependency ordering.
- runtime-only `SchedulerGraphPatch` compile.
- graph patch persistence.
- frontier readiness evaluation.
- executable frontier opening.
- run/repair/review/finalize.

Runtime must derive canonical node envelopes from `SchedulerGraphPatch` and
evaluate node lifecycle through `NodeLifecycleTransitionRunner`. Graph patch
acceptance is not execution readiness.

`scheduler.approve_and_run_first_node` is retired/disabled and must not be a
production execution bypass. Execution must go through:

- `scheduler.evaluate_frontier_readiness`
- `scheduler.open_executable_frontier`
- `scheduler.record_node_transition`

Missing context/resource/authority/validation/evidence preconditions must
create precise node-local transition blockers or typed graph-amendment
requests when genuinely mission-level work is missing. They must not surface as
unclassified worker adapter failures or scheduler-local repair.

Implementation-bearing coding nodes inside this proof must use the current
OpenClaw-native node execution contract:

- repo scope and source prompt refs are authority/navigation scope, not proof
  that the agent has understood the work.
- executable nodes may start only when `NodeLifecycleTransitionRunner` has a
  valid objective, authority, RequirementMap refs, capability, and configured
  OpenClaw agent profile.
- node execution starts from a persisted `NodeExecutionSnapshot`, not from a
  worker packet, start contract, materialized context packet, or replay-only
  task packet.
- the agent must hydrate the snapshot and requirement/source refs with
  `openclaw.resource.read`.
- implementation work must use normal OpenClaw repo search/read/edit/validate
  tools and may use subagents, with subagent outputs visible to the parent
  session before terminal finish.
- terminal node status must be a `node.finish` call with bounded evidence refs
  or a precise blocker/escalation, never assistant prose.
- every graph node seed must carry model-authored objective/work kind and
  covered RequirementMap ids; runtime derives node ids, node kinds, executor
  keys, worker refs, evidence modes, storage flags, and lifecycle metadata.

## Context, Research, And Planning Artifacts

Product/Spec Planning receives full original prompt access only as volatile
runtime input. Persist bounded refs only.

Planning context must include:

- source prompt artifact/body refs used only for bounded addressing.
- accepted RequirementMap requirements with source refs. Runtime validates
  shape/refs only; downstream runners reopen prompt refs when they need more
  source intent.
- typed RequirementMap records with conditional execution and evidence fields
  by requirement role.
- project/repo context refs where the plan affects existing systems.
- memory/context-pack refs when relevant.
- ResearchBrief refs when current external facts affect the plan.
- stop-if-missing rules.
- downstream consumers.
- evidence-claim expectations.

Select web research when current external facts, market/product assumptions,
platform capabilities, compliance expectations, or user-facing claims materially
affect the Planning Capsule. ResearchBrief artifacts must contain bounded
source refs, retrieval date, bounded findings, confidence, limitations,
stale-external-assumption warnings, and planning implications. Do not store raw
pages or raw provider output.

Planning Capsule artifacts must include:

- owner objective.
- problem statement.
- non-goals.
- system facts and refs.
- research influence refs.
- stale external assumptions.
- design constraints.
- workflow/runtime implications.
- data-model implications.
- UI/readback implications.
- authority constraints.
- validation and rollout plan.
- open decisions.
- human decision refs.
- ActionGraphProposal refs.
- compile-readiness state.
- limitations.
- ELI5 summary.

ActionGraphProposal is proposal authority only. It may suggest child actions,
dependencies, workflows, role/capability needs, validations, authority needs,
context refs, risks, and rollback notes. It must not execute child runtime jobs
or mutate child lifecycle state.

`compile_runtime_plan` validates proposal schema, dependency graph, missing
decisions, authority requirements, workflow/executor availability, storage
safety, child feasibility, Work Queue child-item creation policy, and compile
readiness. Compile readiness means a proposal can be promoted through a later
explicit authority boundary; it is not child execution.

## Evidence, Readback, And Closeout

Every advancing Product/Spec node result must compile into the generic
workflow node execution result contract and produce explicit commitment-mapped
evidence claims:

- `commitmentId`
- `evidenceRef`
- `evidenceKind`
- bounded claim summary
- limitations
- producing node/capability/executor identity
- raw-storage false flags

Runtime validates refs, known commitment ids, storage flags, authority flags,
and lifecycle separation. Model-authored review judges sufficiency.

Work Queue readback must show:

- workflow definition/plugin refs.
- runtime job and graph id.
- active phase, active node, role/model/worker ref.
- why the node was selected.
- objective and target refs.
- current transition readiness.
- executable frontier.
- prerequisite nodes and blockers.
- validation state.
- produced evidence.
- open commitments.
- research refs and bounded summary.
- Planning Capsule refs and lifecycle state.
- human decision status and options.
- ActionGraphProposal refs.
- compile-readiness state.
- proposed child actions.
- boundary replay checkpoints.
- closeout/completion-review refs.
- limitations and ELI5 progress.
- walltime by phase.
- token/cost burn by model where provider usage is available, or first-class
  labeled estimates/unavailable reasons where usage is unavailable.

Clean success requires model-authored closeout and accepted completion review.
Degraded/system closeout is diagnostic only and must never count as success.

## Checkpointed Proof Requirements

Run the proof as a checkpointed generic orchestration runtime pipeline. Do not
evaluate a downstream node until every upstream handoff it depends on is
proven high quality.

Treat older worker-smoke and middle-lane artifacts as historical evidence
only. The current proof must not rely on pre-worker resource materialization,
worker packets, broad context supply, or non-Codex worker loops. It must show
that accepted requirements feed `SchedulerGraphPatch`, runnable runtime graph
nodes start under `NodeLifecycleTransitionRunner` ownership, node snapshots are
persisted, OpenClaw native agent sessions run through `runNodeAgentSession`,
agents use real OpenClaw tools against real source material, and evidence
closes accepted RequirementMap coverage and downstream runtime evidence
contracts.

The remaining pre-proof gate is owner readback/telemetry. It must show, from
compact runtime state and Work Queue projection rather than raw logs:

- runtime node id/title.
- execution intent and evidence mode.
- selected capability and executor.
- node lifecycle projection gate/ref.
- node execution snapshot ref and node agent session ref when execution starts.
- active node/branch/phase.
- active model/provider/tool call.
- blocker and schema/policy path when blocked.
- walltime and token/cost availability.
- bounded artifact refs.
- next legal transition.

The proof must record checkpoint evidence for:

1. Payload and router.
2. RequirementMap.
3. SchedulerStageRunner `SchedulerGraphPatch`.
4. RuntimeGraph persistence.
5. NodeLifecycleTransitionRunner snapshot preparation.
6. OpenClaw native node session.
7. Worker/Planning execution.
8. Validation and Repair.
9. Closeout and Readback.

At every checkpoint, persist compact latest-run-state evidence with:

- current phase.
- graph id and active node.
- active role/model/provider.
- blocker summary.
- next action.
- wall time.
- model usage availability.
- retry state.
- raw-storage flags.

Do not persist raw prompts or raw model/provider/tool logs.

Stop early only for hard runtime facts:

- wrong route.
- missing/invalid RequirementMap.
- missing/rejected SchedulerGraphPatch.
- missing RuntimeGraph nodes.
- missing NodeExecutionSnapshot for executable node.
- OpenClaw node agent profile/tool/skill unavailable.
- graph collapse into broad implementation before upstream gates.
- missing Work Queue child materialization after graph node creation.
- degraded closeout success attempt.
- payload/replay hash mismatch.
- node agent session failure caused by missing upstream snapshot/authority/ref
  hydration.

For qualitative weakness, emit bounded model/human review artifacts and mark
`needs_review`; do not pretend deterministic code judged semantic quality.

## Failure Investigation Rule

If the run fails, do not patch the symptom narrowly.

Classify the failure across the full upstream pipe:

- `input_starvation`
- `contract_choke`
- `step_overload`
- `local_execution_failure`
- `observability_gap`
- `model_policy_mismatch`
- `runtime_transition_failure`
- `worker_adapter_failure`
- `readback_or_lifecycle_projection_failure`

Inspect runtime artifacts, graph state, Work Queue readback, latest-run-state,
model usage telemetry, transition readiness evidence, node executor inputs,
bounded provider diagnostics, and validation/repair records.

If the cause is architectural, propose and implement a general fix that moves
OpenClaw closer to a powerful, non-brittle generic orchestration/scheduler
system and a robust dynamic coding team executor. Do not introduce
Product/Spec-only heuristics, semantic forests, regex blockers, deterministic
usefulness judgments, or compatibility fallbacks.

For open architectural questions, do narrowly targeted web research. Search for
the specific failure class, not broad agentic-coding generalities. Use findings
to justify a general architecture fix. Record sources in the final report if
web research is used.

## Validation Requirements

Run focused validation for every touched layer, then full relevant validation.
At minimum, consider:

- `product-spec-planning-plugin.test.ts`
- `workflow-definition-registry.test.ts`
- `runtime-work-graph-scheduler.test.ts`
- `runtime-node-capability-registry.test.ts`
- `execution-read-model.test.ts`
- `requirement-map.test.ts`
- `intake-stage-runner.test.ts`
- `scheduler-stage-runner.test.ts`
- `runtime-artifact-contracts.test.ts`
- `node-agent-session.test.ts`
- `execution-platform-agent-team-runner.test.ts`
- OpenClaw-native node execution tests when implementation handoff changes.
- validation/QA tests when validation or repair changes.
- closeout/completion-review tests when closeout changes.
- `architecture-residue-source-inventory.test.ts`
- `pnpm tsgo:fast`

Before running the Product/Spec proof, validate live gateway readiness:

- run the full relevant check/test/build suite for the live gateway and
  Execution Platform surfaces touched by this pass;
- rebuild or reload the gateway only through approved scripts;
- prove the gateway process/container starts and answers its health/readiness
  probe;
- if the live gateway is down, diagnose and fix the source/build/runtime
  issue before submitting the proof;
- do not call Product/Spec proof ready while gateway dist, imports, plugins,
  or container startup are broken.

Run the Product/Spec checkpointed proof from the top after fixes:

`node --import tsx scripts/execution-platform-run-product-spec-checkpointed-test.mjs --prompt-file docs/projects/execution-platform/prompts/product-spec-planning-workflow-plugin-production-proof-openclaw.md`

Record walltime and token burn by phase and model during the run. If usage is
missing for a model, record the exact missing-usage reason and the best
available estimate label separately from measured usage.

If implementation produces source edits, review the diff as Codex before
calling it acceptable. If the edits are not production-grade, fix them, rerun
validation, and continue.

## Deep Completion Question

After the core work and proof run, perform an explicit code review and answer:

Did we maximally execute and implement this queue item? Is Product/Spec
Planning canonical production code, fully wired into workflow definition
registry, workflow plugin registry, generic orchestration runtime,
SchedulerGraphPatch runner, capability registry, node executors, Runtime
Tool-Call Kernel, RequirementMap coverage, validation/compile readiness, Work
Queue readback, model-authored closeout, completion review, and boundary replay? Is
there any way to improve, harden, optimize, sharpen, extend, or otherwise make
it stronger before calling the item complete? Are there any fallback,
compatibility, generic-runner, proof-only, dead-code, degraded-closeout, or
direct-execution bypass paths that could still produce production success
without canonical evidence? Is anything still skeletal, unwired, or
proof-shaped?

If the answer is not an unqualified yes:

- implement the missing hardening.
- rerun focused validation.
- rerun the relevant proof boundary or full proof.
- update docs/artifacts/Work Queue evidence.
- ask the question again.

Do not stop at partial completion unless a real external owner-only
credential/configuration is missing and cannot be discovered from existing
config/auth registries. If blocked by external owner-only config, complete
every non-blocked code, test, doc, Work Queue, and artifact update, then record
the exact blocker and nearest replay checkpoint.

## Required Final Report

Report:

- prompt hash and proof prompt file.
- route/executor/target-subject evidence.
- RequirementMap result.
- SchedulerGraphPatch result.
- scheduler graph result.
- transition readiness/executable frontier result.
- node execution snapshot refs.
- OpenClaw node agent session result.
- `openclaw.resource.read` and `node.finish` result.
- source edit summary.
- validation summary.
- Work Queue child/readback summary.
- Planning Capsule lifecycle result.
- ActionGraphProposal/compile-readiness result.
- closeout/completion-review result.
- walltime by phase.
- token/cost burn by model, with measured/unavailable/estimated clearly
  labeled.
- failure classification and root cause if failed.
- architectural fixes implemented, if any.
- validation commands and results.
- limitations.
- remaining queue items, if any.
- clear statement whether `openclaw-convergence.active-queue-34` can be closed
  from accepted runtime evidence.
