# Product/Spec Planning Production Workflow

Product/Spec Planning is the first serious non-coding workflow proof for the
generic orchestration runtime. Its workflow id is
`agent_team.product_spec_planning`.

The workflow turns ambiguous owner intent into bounded planning artifacts:
Planning Capsules, optional ResearchBrief influence, human decision records,
ActionGraphProposal artifacts, compile-readiness state, and owner-readable
closeout. It proposes executable work; it does not execute child actions
without a later authority/compile boundary.

## 2026-05-28 Canonical Resource-Lifecycle Alignment

Product/Spec Planning now inherits the shared domain-resource lifecycle
defined in
[Shared Domain Resource Lifecycle And Product/Spec Alignment](/projects/execution-platform/specs/shared-domain-resource-lifecycle-and-product-spec-alignment).
It must not define a parallel planning-only runner, planning-only lifecycle,
or planning-only scheduler repair path.

The shared rule is:

```text
one lifecycle spine
  many workflow domain profiles
  coding is one specialization
  Product/Spec Planning is another specialization
```

The generic runtime vocabulary is resource/action based:

```text
WorkIntentGraph
  -> NodeExecutionContract
  -> ResourceObjectiveFocus
  -> NodeResourceDemandSession
  -> NodeResourceLedger
  -> DomainResourceSelection
  -> ProgressiveNodeExecutionPacket
  -> DomainActionGate
  -> worker small-verb loop
  -> validation
  -> evidence
  -> review/readback/closeout
```

Coding maps those shared concepts to file windows, target files, write gates,
patch authoring, validation commands, and changed-file evidence. Product/Spec
Planning maps them to source prompt sections, owner constraints, project
facts, research briefs, planning capsules, action graph proposals, compile
readiness, human decision refs, and planning evidence.

The source-level binding for that mapping is
`SharedDomainResourceLifecycleProfile` plus `RuntimeNodeCapability`
domain-profile fields. Product/Spec Planning capabilities must advertise the
`product_spec_planning` profile, planning resource kinds, planning action gate
kinds, and planning worker action tools such as `planning.capsule.draft`,
`planning.action_graph.propose`, and
`planning.compile_readiness.evaluate`. They must not inherit coding file
snapshot requirements, `worker.edit.plan`, or patch-author tools.

2026-05-29 source re-spec status: Product/Spec Planning is now explicitly
resource-manifest based at the workflow plugin boundary. Its scheduler policy
uses `resourceReadinessPolicy: domain_resource_manifest`,
`freshContextSnapshotsRequiredForWorkerExecution: false`, and
`domainResourceManifestRequiredForWorkerExecution: true`. Its runtime tool
families include `resource.focus`, `resource.demand`, `resource.ledger`,
`resource.selection`, `domain.action_gate`, and `artifact.payload`; they do
not include `node.resource_materialization` as Product/Spec executor
readiness.

The evidence profile now requires `planning_intent` before Product/Spec
Planning can claim clean workflow success. Planning intent, capsule revision,
and Product/Spec closeout have source validators that reject raw prompt,
raw response, raw logs, child execution auto-start, missing authority refs,
and unbounded body-shaped metadata.

The Product/Spec domain-profile re-spec proof records this as runtime
evidence at
`.artifacts/execution-platform/product-spec-domain-profile-real-model-proof/manifest.json`.
That proof used real model calls for planning-domain resource focus and
planning intent authoring, then validated the Product/Spec planning artifacts
and evidence profile without exposing coding write tools or storing raw
provider payloads.

Historical terms such as `resource_fulfillment`, graph-level `context_scout`
fanout, `context_synthesis` glue, `target_selection` as a generic concept,
and `write_gate` as a generic concept are not canonical Product/Spec Planning
architecture. They may appear only as historical references or coding-domain
mappings. They must not be production success paths for Product/Spec
Planning.

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
   worker-ready planning packets through model-authored source-ref selection
   and model-authored packet execution intent through
   `packet.semantic.set_execution_intent` after source bundle selection.
   Packet authors do not receive the full prompt by default; they receive a
   validated `PacketSourceBundle` compiled from refs the model selected from
   the source prompt context index. Runtime validates refs and byte budgets
   but does not choose semantically "important" prompt content.
5. WorkIntent compilation creates non-runnable semantic work contracts before
   executable nodes exist. WorkIntent carries model-authored execution intent,
   capability fit, expected output, resource needs, downstream consumers, and
   evidence expectations.
6. `ResourceObjectiveFocus` asks the model or human to choose the exact
   resource focus from a legal resource universe. Runtime compiles the legal
   universe from authority, refs, manifests, and prior artifacts; runtime does
   not decide semantic relevance.
7. `NodeResourceDemandSession` opens for a specific consumer node when the
   focus identifies needed resources. Exact selected handles can be fulfilled
   directly. Broad handles require a consumer-bound specialist subturn or
   model-authored narrowing.
8. `NodeResourceLedger` stores payload-backed resource observations,
   patterns, risks, edit/action points, validation recommendations,
   limitations, and provider diagnostics as compact manifests plus payload
   refs.
9. `DomainResourceSelection` chooses the meaningful resources to act on from
   ledger evidence. For coding this is target files and file-change intent.
   For Product/Spec Planning this is planning inputs, capsule inputs, research
   inputs, action graph proposal inputs, or compile-readiness inputs.
10. `ProgressiveNodeExecutionPacket` plus the domain resource packet carries
   the node's executable contract. Read/resource phases may start with partial
   packets. Mutating/action tools remain blocked until the domain action gate
   proves required resources, authority, validation, and evidence paths.
11. `NodeLifecycleTransitionRunner` is the single local lifecycle authority
   for current gate, next legal local transition, and permission to call the
   global scheduler/orchestrator.
12. Runtime node executors produce canonical node results and explicit
    commitment evidence claims.
13. Validation/compile readiness, Work Queue readback, closeout, and
    completion review gate final success.
14. Boundary Replay checkpoints allow restart from accepted boundaries without
    rerunning the full funnel.

Product/Spec Planning must not be executed by the deleted generic queued
workflow runner, a proof-only script, or a Product/Spec-specific compatibility
path. Generic queued workflow dispatch must not be reintroduced.

Context synthesis is not default glue in the Product/Spec path. Future
cross-node coordination must be an explicit workflow-defined coordination
capability on the shared resource lifecycle. Retired `context_synthesis`
glue, after-context-synthesis replay boundaries, and graph-level context
scout fanout cannot satisfy Product/Spec proof gates.

## 2026-05-25 Pre-Proof Status

The WorkIntent/control-plane recovery items are closed through worker smoke
and owner readback evidence, but the full Product/Spec production proof is
now blocked by the generic contract-spine gap documented in
`specs/execution-contract-spine-resource-requirements-and-frontier-state.md`.

The proof must not run until the runtime proves:

- graph nodes remain scheduling envelopes with manifest-only metadata;
- executable semantics live in payload-backed `NodeExecutionContract`s and
  `NodeExecutionPacket`s;
- split children inherit parent execution intent, evidence mode, capability,
  context requirements, validation requirements, and evidence requirements;
- WorkIntent compiles through `ResourceRequirementPacket` before context scout;
- context scouts are consumer-scoped and demand-driven;
- context synthesis is explicit coordination only, not default glue;
- repeated sibling materialization blockers collapse into one root-cause
  artifact;
- branch-scoped frontier/readiness readback preserves successful sibling
  evidence and shows failed-branch blockers;
- scheduler calls expose bounded model-call observability envelopes;
- validation evidence is phase-scoped and cannot fake implementation success;
- `firstOpenGate` comes from canonical readiness/frontier state.

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

## 2026-05-26 Code-Verified Blocker Closure Before Next Proof

The current execution proof blocker is no longer a single context-scout or
worker-loop bug. The proof is blocked by the full code-verified tranche in
[Code-Verified Product/Spec Blocker Closure Plan](/projects/execution-platform/specs/code-verified-product-spec-blocker-closure-plan).

The workflow contract for Product/Spec must therefore be read with these
additional constraints:

- accepted Commitment Work Packets feed `WorkIntentGraph` planning before
  context execution;
- context is demand-driven by consumer WorkIntent/context requirements;
- context shard lifecycle is payload-backed resource execution, not default
  graph fanout;
- shard handoffs must contain model-authored substance and accepted handoff
  refs before they can satisfy WorkIntent context;
- accepted-with-limitations context cannot unlock implementation unless the
  consumer has an explicit waiver;
- target selection and `FileChangeIntent` run after accepted context and
  before `NodeExecutionPacket` hydration;
- directory-level or broad scheduler refs are not executable source-edit
  authority;
- worker execution starts only from hydrated packets, snapshots, target
  selection, validation refs or structural validation fallback, and
  commitment/evidence mapping;
- owner readback must project the actual current gate and root cause from
  canonical readiness/frontier state.

These constraints are generic orchestration-runtime requirements. They apply
to future planning, research, QA, human-task, and coding workflows with their
own domain resource packets; they are not Product/Spec-specific semantic
shortcuts.

## Commitment Packet Source Selection And Execution Intent

The latest Mission-Ledger replay (`product-spec-replay-mplzlt47`) failed
before scheduler planning because Commitment Work Packet authoring remained
too broad and too implementation-shaped:

- two Qwen packet-author lanes returned no content twice at the 150s timeout
  boundary;
- one proof-run commitment failed because the packet contract still required
  `expectedImplementationOutput`;
- successful packet calls still carried roughly 27-30KB input and produced
  large semantic outputs.

The Product/Spec proof must therefore pass the packet boundary defined in
[Commitment Packet Source Selection And Execution Intent](/projects/execution-platform/specs/commitment-packet-source-selection-and-execution-intent)
before it proceeds to scheduler planning.

Required Product/Spec packet behavior:

- every commitment packet selects source refs from the prompt context index
  with a model-authored `packet.source_refs.select` or windowed source-ref
  equivalent;
- runtime compiles a payload-backed `PacketSourceBundle` and rejects invalid
  or over-budget refs without choosing replacement semantic content;
- every packet declares model-authored canonical execution intent through
  `packet.semantic.set_execution_intent` or an explicitly accepted diagnostic
  preauthor intent;
- `source_edit` packets require concrete implementation expected output;
- proof, validation, review, closeout, artifact-lifecycle, and
  source-grounding packets use canonical execution intents plus
  intent-specific output fields and must not be forced through
  `expectedImplementationOutput`;
- targeted normalization repairs only exact missing intent-specific semantic
  fields and emits primary-call-grade provider diagnostics;
- packet fanout cannot advance with ambiguous running lanes, opaque field
  failures, GPT rescue hidden as success, or missing selected source bundle
  refs.

This preserves the intended Product/Spec architecture:

```text
Mission Ledger
  -> Commitment Work Packets with source bundles and execution intent
  -> WorkIntent DAG
  -> capability validation
  -> demand-driven node-scoped context
  -> NodeExecutionPacket / domain resource packet
  -> worker or planning executor
```

It does not reintroduce broad context synthesis, full-prompt packet flooding,
deterministic source relevance heuristics, or runtime-authored semantic
content.

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

Product/Spec Planning inherits the shared resource/action lifecycle. The
owner-facing phase names may be planning-specific, but runtime state must
project from `NodeLifecycleProjection` and the shared lifecycle gates.

1. `mission_ledger`
2. `commitment_packet_authoring`
3. `work_intent_graph`
4. `capability_selection`
5. `graph_compile`
6. `structure_review`
7. `graph_acceptance`
8. `resource_focus`
9. `resource_demand`
10. `resource_ledger`
11. `domain_resource_selection`
12. `domain_action_gate`
13. `node_execution`
14. `node_result_review`
15. `repair_or_escalation`
16. `validation`
17. `readback`
18. `closeout`
19. `completion_review`

Human decision is optional unless the Mission Ledger, Planning Capsule, or
compile boundary identifies an owner-only decision.

`resource_fulfillment` is not a canonical runtime phase for Product/Spec Planning.
If historical artifacts or readback surfaces still report `resource_fulfillment`,
they must be treated as stale projection or coding-domain compatibility
language, not as Product/Spec planning truth.

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
-> ResourceObjectiveFocus -> NodeResourceDemandSession -> NodeResourceLedger
-> DomainResourceSelection -> ProgressiveNodeExecutionPacket
-> DomainActionGate -> worker small-verb loop
-> validation -> evidence -> review/readback/closeout
```

The forbidden production shortcut is:

```text
context_synthesis group -> implementation node
```

Runtime may normalize structured aliases and derive runtime-owned fields, but
it must not classify semantic work type, resource relevance, target/action
selection, or sufficiency through deterministic substrings, Product/Spec
keyword checks, or proof-only heuristics.

## Resource Demand, Planning Context, And Research

Product/Spec Planning receives the full original prompt only as volatile
runtime input. Persisted references are bounded hashes, source-prompt index
refs, excerpt refs, artifact refs, and context-pack refs.

Planning resource demand can include:

- owner objective and constraints from Mission Ledger.
- worker-ready Commitment Work Packets.
- bounded source-prompt excerpts when needed.
- project/repo context refs where the plan affects existing systems.
- ResearchBrief refs when current external assumptions can affect the plan.
- stop-if-missing rules.
- downstream consumer and evidence-claim expectations.

The model or human authors `ResourceObjectiveFocus` for each node. Runtime
compiles the legal resource universe and validates selected handles, authority,
budgets, storage, and lifecycle. Runtime does not choose the meaningful
prompt section, project fact, research question, planning artifact, action
graph input, or compile-readiness input.

When selected resource handles are too broad to fulfill exactly, Product/Spec
Planning must use the same shared specialist-narrowing lifecycle as coding:
a consumer-bound specialist subturn selects exact legal resource handles or
returns a typed blocker. Runtime must not silently truncate prompt sections,
rank research facts, or pick planning inputs.

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
- staged graph compile, structure review, graph acceptance, and first-node
  approval.
- accepted `ResourceObjectiveFocus` for resource-dependent nodes.
- node-local `NodeResourceDemandSession` and `NodeResourceLedger` evidence
  when resources are needed.
- model-authored `DomainResourceSelection` before any planning action gate or
  coding write gate can unlock.
- `NodeLifecycleTransitionRunner` projection as the owner of current gate,
  next legal local transitions, and global-scheduler permission.
- domain action gate readiness for planning capsule, research, human
  decision, action graph proposal, compile readiness, or closeout nodes.
- node execution through registered executors.
- commitment-mapped evidence claims.
- validation/compile-readiness refs.
- Work Queue child/readback projection.
- accepted workflow evidence profile.
- model-authored Closeout Capsule.
- accepted completion review.
- no degraded/system closeout.
- no raw-storage, authority, or lifecycle violations.
- no `resource_fulfillment`, graph-level `context_scout`, or `context_synthesis`
  positive proof path.

## Coding-System Product/Spec Framework Implementation Proof

Before the final full Product/Spec Planning workflow proof, the OpenClaw
coding system must implement a real Product/Spec framework slice with
`agent_team.coding` as executor and `agent_team.product_spec_planning` as
target subject. This is the proof that the new coding vertical can do
meaningful framework work rather than Codex directly patching every missing
piece.

This proof runs after shared resource lifecycle contracts, Product/Spec
domain profile updates, small-verb tool surface definition, capability
manifest upgrades, and proof-framework split. It runs before the final source
inventory gate and before the full Product/Spec Planning workflow proof.

The implementation proof must include:

- a real framework source change, not a toy edit;
- at least one Product/Spec Planning domain resource/action contract or
  tool-surface update;
- capability/readback/proof wiring for that domain resource or action;
- node-local resource focus, resource demand, resource ledger, domain
  resource selection, domain action gate, worker action, validation, and
  evidence;
- changed-file evidence, validation evidence, and commitment evidence claims;
- run-scoped proof manifests and artifact-backed bodies;
- explicit negative evidence that broad context/scout/synthesis paths did not
  count as success.

The final source inventory gate must run after this proof so it can detect any
legacy terms or compatibility paths introduced by the coding system.

## Production Status

The workflow definition, workflow plugin, capability manifest entries,
evidence profile, readback projection, and scheduler policy are registered in
source. Product/Spec Planning remains the next live proof target after the
shared resource-lifecycle alignment work because the proof must validate the
generic runtime spine, not a Product/Spec-specific runner.

Focused validation currently lives in:

- `product-spec-planning-plugin.test.ts`
- `workflow-definition-registry.test.ts`
- `runtime-workflow-graph-engine.test.ts`
- `runtime-node-capability-registry.test.ts`
- `runtime-work-graph-scheduler.test.ts`
- `execution-read-model.test.ts`

The next proof should run Product/Spec Planning through the same production
route, Mission Ledger, Commitment Work Packet authoring, WorkIntentGraph,
resource focus, node-local resource demand, resource ledger, domain resource
selection, staged scheduler, node executors, validation/compile readiness,
closeout, and Work Queue readback used by other scheduler-backed workflows.
