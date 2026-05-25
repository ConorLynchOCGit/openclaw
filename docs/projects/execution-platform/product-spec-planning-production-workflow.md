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
5. WorkIntent compilation creates non-runnable semantic work contracts before
   executable nodes exist. WorkIntent carries model-authored execution intent,
   capability fit, expected output, resource needs, downstream consumers, and
   evidence expectations.
6. Node-scoped Context Supply Chain provides bounded source-prompt excerpts,
   repo/project context, memory/context-pack refs when relevant, and research
   refs when current external facts are needed. Context is requested for the
   specific downstream WorkIntent/node, not as a giant global fanout.
7. Staged Scheduler Protocol compiles accepted WorkIntent/resource readiness
   into runtime-owned node envelopes.
8. `NodeReadinessState` is the single readiness truth for scheduler frontier
   selection, replay, Work Queue readback, and worker invocation.
9. Runtime resource materialization hydrates `NodeExecutionPacket` plus the
   matching domain resource packet before any worker/provider call can count
   as execution.
10. Runtime node executors produce canonical node results and explicit
    commitment evidence claims.
11. Validation/compile readiness, Work Queue readback, closeout, and
    completion review gate final success.
12. Boundary Replay checkpoints allow restart from accepted boundaries without
    rerunning the full funnel.

Product/Spec Planning must not be executed by the deleted generic queued
workflow runner, a proof-only script, or a Product/Spec-specific compatibility
path. Generic queued workflow dispatch must not be reintroduced.

Context synthesis is not default glue in the Product/Spec proof path. It may
run only when the workflow definition, model-authored WorkIntent structure
review, or an accepted coordination policy explicitly requires cross-node
synthesis for shared dependency decisions, file ownership conflicts,
integration sequencing, or validation-plan conflicts. Accepted synthesis
artifacts are coordination evidence; they do not directly compile into
implementation nodes.

## 2026-05-25 Pre-Proof Status

The current pre-proof queue has closed the WorkIntent/control-plane recovery
items through `openclaw-convergence.control-plane-06-worker-small-verb-edit-smoke`.
The remaining blocker before the full Product/Spec production proof is:

- `openclaw-convergence.control-plane-07-readback-telemetry-proof`
  - Owner Readback And Telemetry Proof.

The full Product/Spec proof must not run until owner-facing readback shows the
current WorkIntent/node, execution intent, evidence mode, readiness ref,
active model/tool/phase, blocker or next legal transition, wall time, usage
availability, and bounded artifact refs from compact runtime state.

The worker-smoke evidence that the proof may rely on is:

- runtime job: `native-exec-272cf2d51fcba75b`;
- graph: `product-spec-replay-f69b40c5defa3687`;
- boundary: `after-resource-materialization`;
- proof artifact:
  `.artifacts/execution-platform/product-spec-replay-proof-resource-materialization/proof.json`;
- result: one Product/Spec-derived source-edit node received hydrated
  execution/resource/context/task packet refs, ran through the small-verb
  worker loop, applied a bounded edit, ran structural validation, recorded
  commitment-linked evidence, and rolled back the changed file for review.

The next proof also requires a working live gateway and clean validation/build
evidence before submitting the OpenClaw run.

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

## Product/Spec Planning System Contract

Product/Spec Planning is a planning workflow, not a code implementation
workflow and not a child-job executor. Its job is to convert owner intent into
decision-ready planning artifacts that can later be promoted through explicit
authority boundaries.

The system must produce these canonical planning outcomes:

1. `PlanningIntentRecord`
   - owner objective, target product/system area, planning horizon,
     constraints, non-goals, authority limits, known uncertainties, and
     stale-external-assumption warnings.
2. `ResearchBrief`
   - optional; selected only when current external facts materially affect
     planning quality.
3. `PlanningCapsule`
   - the durable core planning artifact, revised until it is decision-ready
     or explicitly limited.
4. `HumanPlanningDecision`
   - optional; required when owner preference, policy, tradeoff, or authority
     cannot be inferred by the model/runtime.
5. `ActionGraphProposal`
   - proposed child work, dependencies, workflows, validations, risks, and
     authority needs.
6. `CompileRuntimePlanResult`
   - compile-readiness evaluation for the proposal; proves child feasibility,
     not child execution.
7. `ProductSpecPlanningCloseout`
   - model-authored finalization mapped to Mission Ledger commitments and
     runtime evidence.

Planning artifacts are commitment evidence only when attached through the
generic evidence-claim contract. A pretty capsule, markdown report, or final
assistant message does not close commitments by itself.

## Canonical Product/Spec Node Shape

The native Product/Spec planning graph is expected to contain this shape when
the corresponding work is needed:

1. `planning_orchestrator`
   - first executable planning node;
   - converts Mission Ledger and Commitment Work Packets into planning work
     units, research decisions, capsule requirements, human decision needs,
     and proposal expectations;
   - may decide that research or human decision is not required, but must
     record model-authored rationale.
2. `web_research`
   - optional node class;
   - produces bounded ResearchBriefs with source refs, retrieval date,
     confidence, limitations, and planning implications.
3. `planning_capsule`
   - produces draft and revision artifacts;
   - maps every relevant commitment to capsule evidence, limitations, or
     open decisions.
4. `human_task`
   - only when a bounded owner decision is required;
   - cannot grant new runtime authority beyond workflow policy.
5. `action_graph_compile`
   - authors ActionGraphProposal and evaluates compile readiness;
   - may propose child work but cannot create child runtime jobs.
6. `reviewer`
   - model/human review of planning sufficiency, stale assumptions, open
     risks, and proposal feasibility when required by profile or risk.
7. `closeout`
   - model-authored finalization over accepted evidence, not degraded system
     closeout.

The graph may split nodes for parallel research, capsule sections, proposal
branches, or review lanes when the scheduler can preserve commitment mapping,
evidence expectations, and downstream consumers. Parallelism is a scheduler
choice; runtime still owns node ids, lifecycle, refs, tool execution, and
readback state.

## Planning Artifact Contracts

### PlanningIntentRecord

Required fields:

- owner objective;
- target subject/system refs;
- planning scope;
- non-goals;
- constraints and authority limits;
- known facts and source refs;
- uncertainty list;
- research-needed decision;
- human-decision-needed decision;
- evidence expectations.

### ResearchBrief

Required fields:

- research question;
- source refs and retrieval dates;
- bounded findings;
- source quality and confidence;
- limitations;
- stale-assumption warnings;
- planning implications;
- commitment ids affected.

ResearchBriefs cannot store raw pages, raw provider output, hidden reasoning,
or unbounded copied source material.

### PlanningCapsule

The capsule is the primary owner-facing planning artifact. It must be useful
to a product/engineering owner without requiring artifact spelunking.

Required fields:

- owner objective;
- problem statement;
- current system facts and source refs;
- user/customer/product assumptions;
- non-goals;
- constraints and tradeoffs;
- proposed product/spec shape;
- data/workflow/runtime implications;
- UI/readback implications where relevant;
- validation and rollout plan;
- risk register;
- open decisions;
- human decision refs;
- research influence refs;
- ActionGraphProposal refs;
- compile-readiness state;
- limitations;
- ELI5 summary.

### ActionGraphProposal

Required fields:

- proposed child actions;
- target workflows or role/capability classes;
- dependency graph;
- authority requirements;
- context/resource needs;
- validation requirements;
- evidence expectations;
- risk and rollback notes;
- proposed Work Queue child-item summaries.

ActionGraphProposal is proposal authority only. It must not enqueue child
runtime jobs, mutate child Work Queue lifecycle, mark child work complete, or
claim implementation success.

### CompileRuntimePlanResult

Required fields:

- proposal ref and hash;
- schema validation status;
- dependency validation status;
- missing decision list;
- authority readiness;
- workflow/executor availability;
- child feasibility;
- Work Queue child-item materialization policy;
- compile-readiness state;
- limitations and required next owner/system action.

Compile readiness means the proposal is structurally promotable through a
later explicit authority boundary. It does not mean child execution happened.

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

For coding-team proof prompts that target Product/Spec as a subject, the
coding path must remain WorkIntent-first:

```text
prompt -> route -> Mission Ledger -> Commitment Work Packets -> WorkIntent
-> node-scoped context/resource requirements -> NodeReadinessState
-> NodeExecutionPacket + domain resource packet -> worker small-verb loop
-> validation -> evidence -> review/readback/closeout
```

The forbidden production shortcut is:

```text
context_synthesis group -> implementation node
```

Runtime may normalize structured aliases and derive runtime-owned fields, but
it must not classify semantic work type through deterministic substrings,
Product/Spec keyword checks, or proof-only heuristics.

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
