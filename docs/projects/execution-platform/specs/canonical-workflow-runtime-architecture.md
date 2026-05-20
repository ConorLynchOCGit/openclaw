# Canonical Workflow Runtime Architecture

## Purpose

OpenClaw workflow execution should converge on one durable execution spine.
Workflow-specific logic should be plugins on that spine, not separate runner
brains with different success semantics.

This spec documents the first-principles refactor from the current mixed
runner architecture toward a canonical runtime workflow engine.

## External Design References

The target architecture follows production patterns from durable workflow and
agent runtimes:

- Temporal separates deterministic workflow orchestration from side-effecting
  activities, and records event history as execution truth:
  `https://docs.temporal.io/workflows`,
  `https://docs.temporal.io/activities`.
- LangGraph treats durable graph checkpoints, resume, streaming, and
  human-in-the-loop as core runtime primitives:
  `https://docs.langchain.com/oss/python/langgraph/durable-execution`.
- OpenAI Agents SDK exposes handoffs as structured tool operations with
  validated inputs and traceable execution:
  `https://openai.github.io/openai-agents-python/handoffs/`.
- OpenHands separates conversation state, the agent loop, provider-agnostic
  model access, typed tools, workspace execution, emitted events, skills, and
  security:
  `https://docs.openhands.dev/sdk/arch/sdk`.

OpenClaw should use the same boundary shape:

- runtime jobs own lifecycle truth.
- runtime workflow graph state owns orchestration truth.
- runtime tools own bounded side-effect execution and traces.
- workflow definitions own domain policy.
- Work Queue owns projection, readback, and control.
- proof scripts observe production paths only.

## Current Runner Boundaries

Current production code has four relevant surfaces:

- `DynamicAgentTeamGraphRunner` is the production scheduler-backed coding-team
  path for `agent_team.coding`.
- `WorkflowQueuedRunner` is a narrower generic workflow dispatcher for
  workflows that are not yet scheduler-backed. It must not be used to prove
  dynamic delegation.
- `RuntimeWorkerSupervisor` is the job-claim, lease, heartbeat, timeout,
  adapter-invocation, and terminalization layer. It is infrastructure, not a
  workflow brain.
- proof scripts are validation harnesses. They must not become production
  execution paths or bypass gateway/runtime APIs.

This division is now too ambiguous. The coding path has the strongest runtime
graph behavior, while the generic path can still look production-shaped without
being scheduler-backed. The first-principles target is one workflow graph
engine with workflow plugins.

## Target Architecture

### Intent Front Door Executor/Subject Split

The canonical engine receives workflow jobs after routing has separated:

- the executor workflow that owns the runtime graph.
- the target subject workflows or refs the work concerns.
- the requested capabilities the executor must support.
- constraints that must be honored by Mission Ledger, compiler, runtime tool,
  and closeout gates.

This split is part of the canonical architecture. A workflow named in a prompt
is not necessarily the executor. For example, a request to build or harden
Product/Spec Planning is a coding-team execution request with Product/Spec
Planning as subject; a request to draft a product plan can be a Product/Spec
Planning execution request.

The workflow definition registry validates executable capability support for
the selected executor. It does not choose a different executor through
keyword-specific fallback rules.

### Runtime Worker Supervisor

`RuntimeWorkerSupervisor` remains deliberately dumb.

It may:

- claim runtime jobs.
- renew leases.
- enforce timeout/cancel.
- select a registered adapter by job type.
- invoke the canonical workflow runtime engine.
- record bounded adapter results.
- terminalize based on engine evidence.

It must not:

- know coding, planning, research, memory, Kimi, Codex, or closeout semantics.
- execute workflow-specific control flow.
- synthesize success from process completion.
- bypass Runtime Tool Kernel traces.

### Canonical Workflow Runtime Engine

`RuntimeWorkGraphScheduler` should become, or be wrapped by, a canonical
`RuntimeWorkflowGraphEngine`.

The engine owns:

- durable graph execution.
- decomposition and graph acceptance.
- node scheduling.
- child node creation.
- role/agent/worker invocation through node executors.
- human pause/resume.
- validation repair loops.
- mission ledger commitment closure.
- closeout readiness and finalization.
- loop guards and terminal states.
- runtime tool invocation tracing.

The engine is workflow-agnostic. It receives a workflow definition, graph
state, mission ledger, capability manifest, node executors, and runtime tool
kernel. It does not hard-code coding-team or product/spec semantics.

### Workflow Definition Registry

Every production workflow registers a `WorkflowDefinition`:

- workflow id.
- input contract.
- mission ledger profile.
- role coverage profile.
- capability manifest subset.
- allowed node kinds.
- node executor map.
- runtime tool permissions.
- model/worker policy.
- evidence claim profile.
- human task policy.
- closeout policy.
- Work Queue projection policy.
- live proof requirements.

The registry is the only production source for workflow executability. A
workflow without a registered definition cannot execute as production.

Current implementation:

- `workflow-definition.ts` defines workflow definition, closeout policy,
  completion-review policy, validation, and definition-resolution artifacts.
- `workflow-definition-registry.ts` registers current workflow truth:
  `agent_team.coding` is production-ready; Product/Spec Planning, web
  research, docs/skills, QA/test, and architecture/spec are registered as
  needing scheduler/executor migration before production execution.
- `runtime-workflow-graph-engine.ts` evaluates production readiness from the
  registry, executor coverage, scheduler-backed status, compatibility status,
  and Runtime Tool Kernel availability.
- production coding-team execution resolves the canonical definition before
  scheduler work.
- generic queued workflow dispatch records definition resolution and refuses
  scheduler-backed or migration-needed workflows.

### Workflow Plugins

`agent_team.coding` becomes a workflow plugin, not a special runner brain.
Coding-specific logic should move into:

- `agent-team-coding.workflow-definition`.
- coding capability manifest.
- coding role coverage profile.
- coding node executors.
- coding validation profile.
- coding closeout policy.

`agent_team.product_spec_planning`, web research, docs/skills, QA/test, and
architecture/spec review should use the same plugin shape.

### Node Executors And Agents

Graph nodes are still executed by individual agents, workers, tools, or human
tasks. The scheduler coordinates; it does not replace agents.

Examples:

- `context_scout` node -> context scout model/agent.
- `implementation_standard` node -> non-Codex file-edit worker lane such as
  Kimi when qualified for the task family.
- `implementation_complex` node -> Codex adapter when policy justifies the
  higher-cost lane.
- `validation_test` node -> test/validation executor.
- `review` node -> reviewer model/agent.
- `web_research` node -> research worker adapter.
- `planning_capsule_draft` node -> product/spec planner model.
- `human_decision` node -> human task adapter.
- `closeout` node -> `closeout.generate`.

Each executor returns bounded evidence claims, runtime tool refs, limitations,
and raw-storage flags. The Mission Ledger consumes explicit claims; it does
not infer success from generic artifacts.

### Runtime Tool Kernel

All side-effecting or externally observable operations should route through
Runtime Tool Kernel tool families:

- model calls.
- worker invocations.
- script/validation commands.
- DB operations.
- memory retrieval/capture/context insertion.
- research.
- human task request/resume.
- closeout generation.
- file-edit worker loop phases.

Tool traces are evidence and progress diagnostics. They do not replace runtime
job lifecycle truth, graph state, or Mission Ledger commitment closure.

### Completion Review And Finalization

Deep completion review is a first-class workflow finalization policy, not a
prompt footer.

Each production workflow definition can require a `completionReviewPolicy`
that specifies:

- reviewer role class.
- model policy ref.
- required evidence classes.
- allowed outcomes.
- the deep completion question.
- raw-storage flags.

The runtime creates an `execution.workflow_completion_review` artifact from
the model-authored Closeout Capsule and bounded evidence refs. The deterministic
gate validates only that the review exists, required refs are present, raw
storage is false, and the outcome is accepted. The model-authored closeout and
completion review judge whether implementation was actually maximal,
production-grade, and not proof-shaped.

Clean workflow success must not come from a repeated prompt footer,
degraded/system closeout, or process completion. It requires:

- registered workflow definition.
- runtime workflow engine readiness.
- runtime graph/tool evidence.
- Mission Ledger evidence claims where applicable.
- accepted workflow evidence profile.
- model-authored Closeout Capsule.
- accepted workflow completion-review gate.

### Work Queue Projection

Work Queue remains projection/readback/control.

It should derive owner-visible state from:

- runtime jobs.
- runtime workflow graphs.
- graph nodes and edges.
- runtime tool invocations.
- Mission Ledger commitments and evidence claims.
- human tasks.
- validation refs.
- closeout capsule refs.

When a graph node is created, the Work Queue should materialize a DB-backed
child/action item. The owner should see active worker, objective, why selected,
input refs, expected output, current phase, validation state, evidence
produced, open commitments, next decision, limitations, and ELI5 progress.

Generated child materialization must use the generated-item lifecycle contract.
Runtime graph children, proof diagnostics, middleware fixtures, proactivity
seeds, and human tasks are different item classes with different terminal
policies. A diagnostic proof child may be useful evidence, but it must not
remain in the default owner active queue after its parent proof closes or
terminalizes. A real failed owner child must remain actionable. This distinction
belongs in runtime/DB metadata and repository transitions, not in title/id
prefix heuristics.

See `work-queue-generated-item-lifecycle.md`.

### Proof Scripts

Proof scripts may:

- submit through production gateway/runtime APIs.
- observe runtime job, graph, tool trace, Work Queue, and closeout readback.
- assert bounded evidence.

Proof scripts must not:

- import runner internals to execute a private path.
- create fake graph success.
- mutate Work Queue lifecycle outside runtime/closeout APIs.
- count a fixture path as production proof.

## Migration Plan

### Step 1: Workflow Definition Registry

Add the canonical registry and require every production workflow execution to
resolve a definition before it can run.

Acceptance:

- registered workflows expose node kinds, executor keys, role coverage,
  evidence profile, closeout policy, and proof requirements.
- unregistered workflows cannot execute as production.
- Product/Spec Planning is registered but cannot use generic runner fallback.

Status: complete on 2026-05-16. Proof artifacts:

- `.artifacts/execution-platform/canonical-workflow-runtime-definition-contract-proof.json`
- `.artifacts/execution-platform/canonical-workflow-runtime-graph-engine-proof.json`
- `.artifacts/execution-platform/canonical-workflow-runtime-completion-review-proof.json`
- `.artifacts/execution-platform/canonical-workflow-runtime-readback-proof.json`
- `.artifacts/execution-platform/canonical-workflow-runtime-adoption-gate-proof.json`

### Step 2: Canonical Engine Adapter

Wrap or rename `RuntimeWorkGraphScheduler` as the canonical
`RuntimeWorkflowGraphEngine`.

Acceptance:

- engine is workflow-agnostic.
- engine receives a `WorkflowDefinition`.
- engine can execute coding-team graphs without coding-specific branches in
  the engine itself.

### Step 3: Coding Workflow Plugin Extraction

Extract coding-specific policy and executors out of
`DynamicAgentTeamGraphRunner` into the `agent_team.coding` workflow plugin.

Acceptance:

- `DynamicAgentTeamGraphRunner` becomes an adapter/shim or is retired.
- coding graph execution still supports decomposition, Kimi/non-Codex lanes,
  Codex escalation, validation repair, review, human tasks, and closeout.
- Work Queue readback remains at least as rich as before extraction.

### Step 4: Generic Runner Retirement

Remove production completion behavior from `WorkflowQueuedRunner`.

Acceptance:

- generic queued runner cannot mark workflow work complete.
- non-scheduler-backed workflows are either blocked, migrated to workflow
  definitions, or explicitly test-only.
- Product/Spec Planning cannot run through the generic runner.

### Step 5: Product/Spec Planning As Workflow Plugin

Implement Product/Spec Planning using the same canonical engine and registry.

Acceptance:

- planning orchestrator.
- optional web research.
- ResearchBrief.
- Planning Capsule draft/revision.
- human planning decision.
- ActionGraphProposal.
- compile/runtime-plan readiness.
- planning closeout.
- Work Queue child/progress/readback.

This is the Product/Spec Planning slice intended to run through OpenClaw.

### Step 6: Starter Workflow Migration

Migrate web research, docs/skills, QA/test, and architecture/spec review to
workflow definitions.

Acceptance:

- no starter workflow relies on generic dispatcher completion.
- each workflow has evidence profiles, closeout policy, and Work Queue
  readback.

### Step 7: Proof Harness Hardening

Convert proof scripts to black-box production observers.

Acceptance:

- proof scripts submit runtime jobs or UX prompts through approved APIs.
- proof scripts do not execute private runner internals.
- fixture-only scripts are clearly test-only and cannot set production status.

### Step 8: Compatibility Retirement

Delete or hard-disable old static and fallback execution paths.

Acceptance:

- no production flag can reactivate semantic/static/generic runner success.
- no degraded/system closeout can satisfy production success.
- no runner can succeed without mission ledger, graph, node evidence, tool
  traces, validation/review as required, and model-authored closeout.

## Build Path Through Product/Spec Planning

The sorted path to the next Product/Spec Planning OpenClaw proof is:

1. Workflow Evidence Profiles And Tool Trace Readback Hardening. **Complete.**
2. Canonical Workflow Runtime Engine And Workflow Definition Registry.
3. Coding Team Plugin Extraction From Dynamic Runner.
4. Generic Workflow Runner Production Retirement.
5. Product/Spec Planning Production Upgrade via OpenClaw.

## Generic Orchestration Contract

All scheduler-backed workflows now share these canonical runtime objects:

1. `WorkflowDefinition`
   - workflow id, status, production flag, scheduler-backed flag.
   - evidence profile id.
   - workflow plugin policy refs.
   - `WorkflowOrchestrationPolicy`.
2. `WorkflowOrchestrationPolicy`
   - required and optional phases.
   - required and optional role classes.
   - allowed capability ids.
   - context needs and source-prompt policy.
   - cost-aware capability policy.
   - human decision policy.
   - runtime tool families.
   - closeout/finalization/readback refs.
3. `CommitmentWorkPacket`
   - model-authored, full-prompt-aware, per-commitment handoff input.
4. `ContextHandoffPacket`
   - context scout output and downstream worker handoff.
5. `GenericWorkflowNodeExecutionResult`
   - role class, capability id, bounded refs, evidence claims, limitations,
     raw-storage flags, and no Work Queue lifecycle mutation.

The runtime validates shape, refs, bounds, authority, storage flags, executor
coverage, and lifecycle ownership. Models judge plan quality, delegation
quality, context usefulness, evidence sufficiency, and final work quality.

Workflow-specific code should be limited to definitions, plugin executor
registration, capability metadata, evidence profile requirements, and
workflow-specific model/tool prompts. The scheduler and Work Queue readback
should remain workflow-agnostic.

## Future Team Families

Design and marketing are registered as migration-state workflow definitions so
their future teams inherit the same contract before they are executable:

- `workflow.design`
- `workflow.marketing`

They cannot produce production success until executable plugins, role
coverage, evidence profiles, runtime tool traces, model-authored closeout, and
Work Queue readback are present.

## Generic Orchestration Runtime Engine Build Path

The generic orchestration contract is not enough by itself. The next
architecture step is a production runtime engine that executes all complex
workflows through one workflow-agnostic spine.

Source-of-truth spec:

- `generic-orchestration-runtime.md`

The six-item build path is:

1. Generic Orchestration Runtime Engine.
2. Generic Staged Scheduler Protocol.
3. Generic Node Executor And Evidence Claim Contract.
4. Product/Spec Planning Workflow Plugin Production Proof.
5. Starter Workflow Plugin Migration.
6. Future Team Workflow Readiness.

Items 1-3 should run before Product/Spec Planning. Product/Spec Planning is
then the first non-coding proof that the generic runtime works. Starter
workflow breadth and future design/marketing teams should follow after the
spine is proven.

The Product/Spec Planning prompt should be run only after the remaining
canonical runtime items are green. The proof must show:

- route selected: `agent_team.product_spec_planning`.
- valid Mission Ledger.
- accepted decomposition graph.
- Product/Spec node diversity.
- web research if current external assumptions are needed.
- Planning Capsule lifecycle.
- human planning decision if the prompt requires owner choice.
- ActionGraphProposal and compile readiness.
- child Work Queue materialization.
- active worker/tool progress emissions.
- validation/review.
- model-authored closeout via `closeout.generate`.

## Non-Goals

- Do not move lifecycle truth into Work Queue.
- Do not make proof scripts execution paths.
- Do not add deterministic semantic routing or prompt-specific exception
  lists.
- Do not preserve generic runner production success as a convenience fallback.
- Do not let Product/Spec Planning create or execute child jobs without an
  approved compile/runtime authority boundary.
