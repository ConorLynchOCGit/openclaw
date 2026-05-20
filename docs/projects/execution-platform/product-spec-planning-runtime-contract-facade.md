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

`WorkflowQueuedRunner` and facade compatibility surfaces are not production
success paths for Product/Spec Planning. They may exist only as migration or
diagnostic context and must reject Product/Spec production execution with
`product_spec_planning_requires_scheduler_backed_runner`.

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
