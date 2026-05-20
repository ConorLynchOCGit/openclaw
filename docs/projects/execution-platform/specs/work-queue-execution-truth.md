# Work Queue Execution Truth

Runtime jobs remain lifecycle truth. Work Queue remains projection, readback, and bounded control.

## Executor/Subject Readback Boundary

Work Queue readback must distinguish:

- executor workflow: the workflow responsible for execution evidence.
- subject workflows: workflows or surfaces the work is about.
- requested capabilities: what the executor was asked to perform.
- constraints: safety/policy boundaries carried into Mission Ledger and
  compile/finalization gates.

An item may therefore show `agent_team.coding` as executor and
`agent_team.product_spec_planning` as subject. The Work Queue must not infer
that the subject workflow owns lifecycle truth or that the subject workflow was
executed. Runtime jobs, graph state, tool traces, evidence claims, and
closeout refs remain the only production completion evidence.

## Generated Item Lifecycle Boundary

Generated Work Queue children are projection/readback objects, not automatically
owner-planned work.

Before the Product/Spec Planning proof runs again, generated children must
follow `work-queue-generated-item-lifecycle.md`.

Generated child classes:

- runtime graph child
- proof diagnostic
- middleware fixture
- proactivity seed
- human task

Every generated child must declare origin, parent work item, runtime job or
graph refs where available, terminal policy, retention policy, and raw-storage
flags. Default owner active queue readback excludes proof diagnostics,
middleware fixtures, and debug-only generated rows. Debug/admin readback may
show them as bounded evidence.

This prevents intentionally failed proof children from becoming owner-visible
`needs_review` work while preserving the correct behavior for failed real
runtime child work.

## Workflow Definition Projection Boundary

Work Queue readback should project canonical workflow graph state, not runner
identity folklore.

The owner-visible queue may show whether a job used the canonical workflow
engine, which workflow definition was loaded, which graph nodes were created,
which agents/workers/tools executed those nodes, and which evidence claims
closed Mission Ledger commitments. It must not treat
`DynamicAgentTeamGraphRunner`, `WorkflowQueuedRunner`, or any proof script as
the lifecycle truth source.

When the canonical workflow runtime refactor lands:

- parent Work Queue items should link to runtime job id, graph id, loaded
  workflow definition id, and final closeout ref.
- child/action items should be materialized from graph nodes for every
  production workflow, not only coding-team jobs.
- child items should show node kind, executor key, capability id, role/model
  refs, current phase, active worker/tool event, dependency/edge refs,
  evidence claims, validation state, human task state, and closeout state.
- generic queued dispatch evidence is diagnostic only unless it handed the job
  into the canonical graph engine.
- proof-script artifacts can support validation, but cannot create production
  queue success without runtime job/graph/tool/closeout evidence.

## Dedicated Runtime DB Boundary

Live Work Queue projection/control/readback state now lives in the dedicated
Execution Platform database:

- runtime substrate: `postgres-database://execution_platform`
- config source: `config.env.vars.EXECUTION_PLATFORM_DATABASE_URL`
- boundary: `dedicated_execution_platform_db`
- readiness: `ready`
- Work Queue live linkage: enabled

The Model Memory database remains Model Memory's database. It is not the
Execution Platform live Work Queue substrate unless a future explicitly shared
runtime DB architecture is approved and labeled.

## Runtime Toolification Readback Gate

Before the next Product/Spec Planning live proof, Work Queue readback must
consume runtime tool-call traces and app-server progress as first-class
bounded projection evidence.

For active graph work, readback must show:

- accepted decomposition graph status.
- current runtime tool operation.
- active node, role, model, worker, and capability.
- why this node was selected under cost-aware utility policy.
- target refs, file refs, command refs, and validation state.
- Mission Ledger commitments advanced by the node.
- Mission Ledger commitment rationale and expected evidence descriptions.
- bounded CommitmentWorkPacket refs generated from the Mission Ledger before
  child delegation.
- evidence refs produced and evidence claims awaiting model sufficiency
  review.
- open commitments, blockers, next scheduler decision, limitations, and ELI5
  progress.

The Work Queue must not close or mark a Product/Spec proof successful from
process completion, degraded/system closeout, generic artifacts, static graph
injection, or app-server heartbeat alone. Accepted Closeout Capsules may
update planning/readback status only when blocking Mission Ledger commitments
have accepted evidence.

For Product/Spec Planning, Work Queue owner readback displays:

- workflow and planning mode
- workflow definition/plugin readiness and Runtime Workflow Graph Engine refs
- Planning Capsule refs, ResearchBrief refs, research influence refs, and stale external assumptions
- human planning decision request refs, decision refs, pending/accepted/rejected/not-required state, bounded decision options, response shape, deadline, blocking graph refs, resume refs, and bounded response refs
- ActionGraphProposal refs, child proposal summaries, and compile-readiness state
- validation refs, Mission Ledger status, bounded ledger evidence state, closeout refs, limitations, and ELI5 progress
- runtime graph children, edges, role progress, and active scheduler progress
- active graph progress must preserve the latest useful active node fields
  even when newer child-sync/bookkeeping events arrive
- bounded owner evidence buckets for workflow registration, executable node mappings, orchestrator-first graph proof, action graph compile-readiness validation, and Mission Ledger commitment evidence claim refs

Product/Spec Planning readback must keep proposed children distinct from
executed children. ActionGraphProposal rows, child proposal summaries, and
compile-readiness refs are planning evidence until a later authority boundary
creates child runtime jobs or human tasks.
