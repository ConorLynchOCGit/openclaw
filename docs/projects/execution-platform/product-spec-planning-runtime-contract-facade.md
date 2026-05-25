# Product/Spec Planning Runtime Contract Facade

This document is historical context for the earlier Product/Spec runtime
contract facade. The production architecture has moved on: Product/Spec
Planning is now a workflow plugin on the generic orchestration runtime, not a
queued-runner contract facade.

## Current Rule

Product/Spec Planning production execution must use:

- `workflow-definition.agent_team.product_spec_planning.v1`
- `workflow-plugin.agent_team.product_spec_planning.v1`
- `GenericOrchestrationRuntime`
- `RuntimeWorkGraphScheduler`
- Runtime Tool-Call Kernel traces
- Mission Ledger and Commitment Work Packets
- Context Supply Chain
- staged scheduler protocol
- generic node execution/evidence claim contract
- workflow evidence profile
- model-authored closeout
- completion review
- Work Queue runtime readback

The deleted generic queued workflow runner and facade compatibility surfaces
are not production, migration, or diagnostic success paths for Product/Spec
Planning. Product/Spec production execution must enter through canonical
workflow definitions/plugins and the runtime graph engine.

## Current Product/Spec Planning System Contract

This facade document is not the Product/Spec Planning system spec. The current
system contract is defined in
`product-spec-planning-production-workflow.md` and requires Product/Spec
Planning to produce planning/proposal artifacts through the generic runtime
spine:

- `PlanningIntentRecord`
- optional `ResearchBrief`
- `PlanningCapsule`
- optional `HumanPlanningDecision`
- `ActionGraphProposal`
- `CompileRuntimePlanResult`
- `ProductSpecPlanningCloseout`

The native Product/Spec graph shape is planning-first:

1. `planning_orchestrator`
2. optional `web_research`
3. `planning_capsule`
4. optional `human_task`
5. `action_graph_compile`
6. `reviewer`
7. `closeout`

Product/Spec Planning has proposal authority only. It can propose child work,
dependencies, validations, authority needs, and Work Queue child summaries; it
cannot execute child runtime jobs, mutate child lifecycle state, or claim child
implementation success without a later explicit authority boundary.

For coding-team prompts that target Product/Spec Planning as the subject, the
coding control plane must remain WorkIntent-first:

```text
prompt -> route -> Mission Ledger -> Commitment Work Packets -> WorkIntent
-> node-scoped context/resource requirements -> NodeReadinessState
-> NodeExecutionPacket + domain resource packet -> worker small-verb loop
-> validation -> evidence -> review/readback/closeout
```

The retired production shortcut remains forbidden:

```text
context_synthesis group -> implementation node
```

## Still Valid Contract Boundaries

These policy boundaries remain valid under the new runtime:

- no raw prompt, raw response, raw transcript, raw provider log, raw tool log,
  raw command log, DB row, secret, or hidden-reasoning storage.
- no direct Work Queue lifecycle mutation.
- Mission Ledger is required for clean success.
- Product/Spec artifacts are planning/proposal authority only.
- ActionGraphProposal requires compile readiness before any later child
  execution boundary.
- proposed child actions do not create runtime jobs by themselves.

## Replacement Source Of Truth

Use these docs for current implementation guidance:

- `product-spec-planning-production-workflow.md`
- `specs/generic-orchestration-runtime.md`
- `specs/runtime-work-graph.md`
- `specs/product-spec-checkpointed-proof-framework.md`
- `specs/maximum-toolification-architecture.md`
- `specs/work-queue-execution-truth.md`
