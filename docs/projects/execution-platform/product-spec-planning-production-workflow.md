# Product/Spec Planning Production Workflow

Product/Spec Planning is the first serious non-coding workflow proof for the
generic orchestration runtime. Its workflow id is
`agent_team.product_spec_planning`.

The workflow turns ambiguous owner intent into bounded planning artifacts:
Planning Capsules, optional ResearchBrief influence, human decision records,
ActionGraphProposal artifacts, compile-readiness state, and owner-readable
closeout. It proposes executable work; it does not execute child actions
without a later authority/compile boundary.

## Current Architecture

Product/Spec Planning is no longer specified as a bespoke planning runner.
It is a production workflow plugin on the canonical runtime spine:

1. Intent Front Door routes to an executor workflow and separately records
   target subjects.
2. `GenericOrchestrationRuntime` resolves `WorkflowDefinition` and
   `workflow-plugin.agent_team.product_spec_planning.v1`.
3. Mission Ledger records owner objective, constraints, commitments, and
   evidence expectations.
4. Commitment Work Packet authoring turns broad ledger commitments into
   worker-ready planning packets with full-prompt volatile access.
5. Context Supply Chain provides bounded source-prompt excerpts, repo/project
   context, memory/context-pack refs when relevant, and research refs when
   current external facts are needed.
6. Staged Scheduler Protocol compiles the planning graph from model-authored
   intent into runtime-owned node envelopes.
7. Runtime node executors produce canonical node results and explicit
   commitment evidence claims.
8. Validation/compile readiness, Work Queue readback, closeout, and
   completion review gate final success.
9. Boundary Replay checkpoints allow restart from accepted boundaries without
   rerunning the full funnel.

Product/Spec Planning must not be executed by `WorkflowQueuedRunner`, a
proof-only script, or a Product/Spec-specific compatibility path. Generic
queued workflow dispatch must reject it with
`product_spec_planning_requires_scheduler_backed_runner`.

## Workflow Definition And Plugin

The production definition is registered as
`workflow-definition.agent_team.product_spec_planning.v1`.

The production plugin is
`workflow-plugin.agent_team.product_spec_planning.v1`.

Required definition/plugin properties:

- `status: production_ready`.
- `productionEnabled: true`.
- `schedulerBacked: true`.
- Runtime Tool-Call Kernel required.
- staged scheduler protocol required.
- runtime-derived node envelopes required.
- runtime-derived expected evidence required.
- model-authored structure review required.
- first-node approval required.
- direct implementation first move is not a Product/Spec concern.
- degraded closeout success is blocked.
- raw prompt, raw response, raw transcript, raw provider log, raw tool log,
  raw command log, raw DB row, secret, and hidden-reasoning storage are
  forbidden.

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

Allowed planning capabilities:

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
tool kernel, evidence profile, closeout policy, or completion-review policy
blocks production success.

## Executor Workflow Versus Target Subject

Product/Spec Planning can be either an executor workflow or a target subject.

Examples:

- "Create a product/spec plan for this feature" can execute
  `agent_team.product_spec_planning`.
- "Implement the Product/Spec Planning workflow" must execute
  `agent_team.coding` with `agent_team.product_spec_planning` as a target
  subject.

The router must not infer executor workflow from the presence of the
Product/Spec name alone. It compiles executor workflow, subject workflow refs,
requested capabilities, constraints, authority snapshot, prompt hash, and
volatile prompt ref. Safety and authority constraints travel into Mission
Ledger and compile boundaries rather than regex/semantic routing blockers.

## Required Runtime Phases

Product/Spec Planning inherits the generic orchestration phase ladder:

1. `mission_ledger`
2. `commitment_packet_authoring`
3. `context_supply`
4. `work_breakdown`
5. `capability_selection`
6. `graph_compile`
7. `structure_review`
8. `graph_acceptance`
9. `node_execution`
10. `node_result_review`
11. `repair_or_escalation`
12. `validation`
13. `readback`
14. `closeout`
15. `completion_review`

Human decision is optional unless the Mission Ledger, Planning Capsule, or
compile boundary identifies an owner-only decision.

## Staged Scheduler Contract

Product/Spec Planning graph creation uses staged scheduler tools, not a
single model-authored executable graph JSON object.

The model authors:

- work units.
- planning rationale.
- capability choices.
- commitment mapping.
- human-readable expected output.
- success criteria.
- downstream consumers.
- edge/parallelism rationale.
- semantic sufficiency judgments.

The runtime derives:

- node ids.
- node kinds.
- executor keys.
- worker refs.
- expected evidence classes.
- trace refs.
- storage flags.
- authority flags.
- lifecycle metadata.
- Work Queue child refs.

Complex planning work cannot run node execution until the graph is compiled,
structure-reviewed, accepted, and first-node approved.

## Context Supply And Research

Product/Spec Planning receives the full original prompt only as volatile
runtime input. Persisted references are bounded hashes, source-prompt index
refs, excerpt refs, artifact refs, and context-pack refs.

Planning context must include:

- owner objective and constraints from Mission Ledger.
- worker-ready Commitment Work Packets.
- bounded source-prompt excerpts when needed.
- project/repo context refs where the plan affects existing systems.
- ResearchBrief refs when current external assumptions can affect the plan.
- stop-if-missing rules.
- downstream consumer and evidence-claim expectations.

Web research is selected by the orchestrator when current external facts,
market/product assumptions, platform capabilities, compliance expectations,
or user-facing claims materially affect the Planning Capsule. ResearchBrief
artifacts must contain bounded source refs, retrieval date, bounded findings,
confidence, limitations, stale-external-assumption warnings, and planning
implications. Raw pages and raw provider output are not stored.

## Planning Artifacts

### Planning Capsule

The Planning Capsule lifecycle is canonical. Capsules include:

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

Capsule draft and revision nodes produce canonical node execution results and
commitment evidence claims. A capsule artifact alone does not close a
commitment unless it is mapped through the generic evidence-claim contract.

### Human Planning Decisions

Human planning decisions are graph nodes with:

- bounded prompt summary.
- concrete options/tradeoffs.
- required response shape.
- operator ref.
- deadline/expiration state.
- blocking graph refs.
- resume ref/hash.
- bounded response refs.
- decision refs.

Human input can answer a bounded planning question. It cannot grant authority
outside workflow policy, bypass compile validation, or mutate lifecycle
directly.

### ActionGraphProposal

ActionGraphProposal is proposal authority only. It may suggest:

- child actions.
- dependencies.
- workflows.
- role/capability needs.
- validations.
- authority needs.
- context refs.
- risks.
- rollback notes.

It must not create runtime jobs, execute child actions, or close child work by
itself.

### Compile Runtime Plan

`compile_runtime_plan` validates:

- proposal schema.
- dependency graph.
- missing decisions.
- authority requirements.
- workflow/executor availability.
- storage safety.
- child feasibility.
- Work Queue child-item creation policy.
- compile-readiness state.

Compile readiness is evidence that a proposal could be promoted through a
later explicit authority boundary. It is not child execution.

## Node Results And Evidence Claims

Every production Product/Spec node result compiles into
`generic_workflow_node_execution_result` before it can advance the graph.

Each advancing result must include commitment-mapped evidence claims:

- `commitmentId`
- `evidenceRef`
- `evidenceKind`
- bounded claim summary
- limitations
- producing node/capability/executor identity
- raw-storage false flags

Runtime validates refs, known commitment ids, storage flags, authority flags,
and lifecycle separation. Model-authored review judges semantic sufficiency.
Generic artifacts, role reports, process completion, or degraded closeout do
not imply commitment closure.

## Work Queue Readback

Readback is owner-facing runtime truth projection. It must be human-readable
first and refs second.

Product/Spec readback shows:

- workflow definition and plugin refs.
- generic runtime status.
- runtime job and graph id.
- active phase, active node, role/model/worker ref.
- why the node was selected.
- objective and target refs.
- expected output.
- current validation state.
- produced evidence.
- open commitments.
- context blockers.
- research refs and bounded summary.
- Planning Capsule refs and lifecycle state.
- human decision status and options.
- ActionGraphProposal refs.
- compile-readiness state.
- proposed child actions.
- boundary replay state and reusable checkpoints.
- closeout and completion-review refs.
- limitations and ELI5 progress.

`product_spec_planning_owner_evidence_summary` remains a bounded readback
projection, not a lifecycle owner. It groups workflow registration,
executable capability/node mapping, planning-orchestrator proof, Planning
Capsule lifecycle, ActionGraphProposal compile-readiness, proposal
compile-validation, commitment evidence claims, proposed-child non-execution,
runtime-job creation flags, and raw-storage warnings.

## Success Gates

Clean Product/Spec Planning success requires:

- correct executor/subject routing.
- production WorkflowDefinition and WorkflowPlugin readiness.
- Runtime Tool-Call Kernel availability.
- valid Mission Ledger.
- accepted Commitment Work Packets.
- accepted context supply for context-dependent nodes.
- staged graph compile, structure review, graph acceptance, and first-node
  approval.
- node execution through registered executors.
- commitment-mapped evidence claims.
- validation/compile-readiness refs.
- Work Queue child/readback projection.
- accepted workflow evidence profile.
- model-authored Closeout Capsule.
- accepted completion review.
- no degraded/system closeout.
- no raw-storage, authority, or lifecycle violations.

## Production Status

The workflow definition, workflow plugin, capability manifest entries,
evidence profile, readback projection, and scheduler policy are registered in
source. Product/Spec Planning remains the next live proof target after the
native-harness convergence work because the proof must validate the generic
runtime spine, not a Product/Spec-specific runner.

Focused validation currently lives in:

- `product-spec-planning-plugin.test.ts`
- `workflow-definition-registry.test.ts`
- `runtime-workflow-graph-engine.test.ts`
- `runtime-node-capability-registry.test.ts`
- `runtime-work-graph-scheduler.test.ts`
- `execution-read-model.test.ts`

The next proof should run Product/Spec Planning through the same production
route, Mission Ledger, Commitment Work Packet authoring, Context Supply Chain,
staged scheduler, node executors, validation/compile readiness, closeout, and
Work Queue readback used by other scheduler-backed workflows.
