# Maximum Toolification Architecture

Date: 2026-05-16

Status: source-of-truth architecture update. This is now a pre-Product/Spec
Planning blocker because the latest live UX attempts showed that trace-only
toolification does not fix model contract choke.

## Problem

The current Mission Ledger phase is well-shaped: the model extracts owner
objective, constraints, commitments, and evidence expectations. The next
scheduler phase then asks the orchestrator to produce an executable graph in
one large JSON decision while satisfying too many concerns at once:

- graph structure.
- commitment coverage.
- node contracts.
- edge or parallelism justification.
- cost-aware capability selection.
- non-Codex qualification rules.
- anti-Codex-monopoly rules.
- no broad implementation first.
- repair continuity.
- runtime-owned schema boundaries.

That shape repeatedly creates schema/contract choke. The model can make a
reasonable planning move, but the runtime rejects it because it is being asked
to hand-author runtime-owned graph envelopes instead of using a staged working
interface.

The important lesson is that runtime tool traces are not enough. Maximum
toolification means the model works through narrow typed runtime operations
whose outputs are compiled into canonical runtime objects.

## Design Principle

For every model-assisted runtime system:

- the model chooses intent, rationale, work units, capability choices,
  human-readable outputs, success criteria, and semantic judgments.
- runtime tools expose the next narrow operation the model can perform.
- deterministic code compiles canonical ids, envelopes, executor refs,
  evidence enums, storage flags, authority flags, lifecycle state, and trace
  refs.
- deterministic code validates shape, refs, bounds, storage, authority,
  dependencies, budgets, and lifecycle separation.
- model-authored review judges semantic sufficiency and usefulness.

Runtime-owned schema fields must not be requested from the model when they can
be derived from Mission Ledger, workflow definition, capability manifest,
evidence profile, graph state, or tool registry.

## Scheduler Staged Tool Protocol

The scheduler must replace single-shot decomposition JSON with a staged tool
protocol:

1. `draft_commitment_work_breakdown`
   - model maps Mission Ledger commitments into work units.
   - no executor refs, graph node kinds, edge ids, or evidence enums.
2. `select_capabilities_for_work_units`
   - model picks cheapest sufficiently capable capabilities from the manifest.
   - model explains utility, cost, specialization, context-distribution value,
     parallelism opportunity, and why cheaper options are insufficient when
     needed.
3. `define_node_contracts`
   - model supplies objective, role rationale, bounded input refs, expected
     human-readable output, success criteria, and downstream consumer.
4. `define_edges_or_parallelism`
   - model explains dependencies, handoffs, joins, or explicit independent
     parallel branches.
5. `compile_runtime_graph`
   - runtime derives canonical node envelopes, executor keys, expected
     evidence, ids, storage flags, and Work Queue child materialization refs.
6. `review_compiled_graph`
   - model reviews whether the compiled graph actually covers the mission
     before execution.
7. `approve_and_run_first_node`
   - runtime validates and starts the first runnable node or terminalizes with
     field-specific repair diagnostics.

The phases are:

- Phase A: Mission Ledger.
- Phase B: Work Breakdown.
- Phase C: Capability Selection.
- Phase D: Runtime Graph Compiler.
- Phase E: Structure Review.
- Phase F: Runtime validation/acceptance.
- Phase G: Scheduler node execution.

No implementation node may run for a complex mission until the staged graph is
compiled, reviewed, and accepted.

### Production Status: Staged Scheduler Tool Protocol

Status: implemented for the production `agent_team.coding` scheduler path on
2026-05-16.

The scheduler now treats complex decomposition as a staged tool protocol:

- `draft_commitment_work_breakdown`: model maps Mission Ledger commitments to
  work units.
- `select_capabilities_for_work_units`: model selects capability ids and
  rationale; runtime derives node kind, executor key, worker ref,
  qualification defaults, and evidence kinds.
- `define_node_contracts`: model writes worker-facing objectives, expected
  output, success criteria, and downstream consumer.
- `define_edges_or_parallelism`: model explains dependency/handoff edges or
  explicitly parallel-independent work.
- `compile_runtime_graph`: runtime compiles canonical graph envelopes.
- `review_compiled_graph`: model-authored structure review is recorded as
  bounded scheduler progress.
- `accept_staged_graph`: runtime accepts the compiled graph before execution.
- `approve_and_run_first_node`: scheduler records first-node execution
  approval separately from graph compilation.

The model no longer needs to invent runtime-owned fields for complex graph
creation. Runtime-owned fields include graph node kind, executor key, worker
ref, required metadata schema ref, canonical node id, selected node kind,
selected executor key, and expected evidence enums.

The validation lane for Product/Spec Planning proved a planning orchestrator
node, web research node, handoff edge, capability-derived cost/evidence
metadata, owner-facing progress events, and no legacy production
`scheduler.decompose_mission` acceptance tool.

## Maximum Toolification By System

### Prompt Router And Intent Front Door

Current posture: executor/subject split and prompt-file transport are in
place. The remaining maximum-toolification target is a typed tool sequence:

- `classify_owner_turn_intent`
- `extract_constraints`
- `select_executor_workflow`
- `compile_execution_request`
- `validate_route_contract`

The model should choose intent, executor rationale, subject refs, and
constraints. Runtime derives route ids, workflow ids where already known,
authority flags, storage flags, and Mission Ledger handoff refs.

Detailed solution:

- `classify_owner_turn_intent` returns primary outcome, ambiguity state,
  whether execution is requested, and human-readable rationale.
- `extract_constraints` separates prohibited primary requests from ordinary
  safety constraints such as no deploy, no outbound send, no model promotion,
  no raw storage, and no Work Queue lifecycle mutation.
- `select_executor_workflow` chooses the workflow that owns the requested
  executable capabilities. Named target workflows are subjects unless the
  owner asks that workflow to perform its own domain work.
- `identify_subject_refs` returns bounded target refs for workflows, docs,
  files, runtime jobs, Work Queue items, and prior artifacts.
- `compile_execution_request` creates the canonical executor request with
  prompt hash, executor workflow id, subject refs, requested capabilities,
  constraints, authority snapshot, storage policy, and Mission Ledger input
  ref.
- `validate_route_contract` validates schema, executor capability support,
  authority, raw-storage flags, and blocked primary outcomes.

Pass gates:

- safety-boundary language cannot block routing when the primary request is
  permitted.
- long implementation prompts route by capability, not target subject text.
- route repair diagnostics are field-specific and preserve accepted fields.
- route artifacts contain only hashes, refs, reason codes, and bounded
  summaries.

### Mission Ledger

Current posture: strongest model contract in the stack. Keep it as the first
phase, but expose its downstream obligations as scheduler tools rather than
burying them in generic artifacts.

Maximum target:

- `draft_mission_contract`
- `repair_mission_contract`
- `map_commitment_evidence_requirements`
- `compile_commitment_ids`
- `accept_mission_contract`

Runtime derives commitment ids, evidence class enums, raw-storage flags, and
finalization gates.

Detailed solution:

- `draft_mission_contract` extracts objective, explicit non-goals, blocking
  commitments, nonblocking commitments, constraints, authority boundary,
  storage boundary, and lifecycle boundary.
- `repair_mission_contract` receives exact structural diagnostics and returns
  only repaired fields plus preserved accepted fields.
- `map_commitment_evidence_requirements` lets the model describe what evidence
  would prove each commitment in human language.
- `compile_commitment_ids` creates canonical ids, evidence classes, and
  blocking/finalization gates from the model-authored contract.
- `accept_mission_contract` validates refs, bounds, raw-storage flags,
  authority, and lifecycle separation.

Pass gates:

- scheduler cannot run without an accepted ledger.
- invalid ledger gets bounded repair, then terminal `needs_review` if still
  invalid.
- downstream node results must claim evidence against commitment ids; generic
  artifacts do not imply closure.

### Runtime Work Graph Scheduler

Current posture: the staged scheduler protocol is now production-primary for
scheduler-backed workflow graph creation. Complex production graph creation is
not accepted from a model-authored executable node envelope; the model supplies
staged intent and runtime compiles executable graph schema.

Maximum target status: generic executor/evidence contract is implemented for
the scheduler-backed production path. Node executors now compile into
canonical `generic_workflow_node_execution_result` objects with structured
commitment-mapped evidence claims. The remaining maximum-toolification work
moves this same contract deeper into future workflow families and model/tool
surfaces rather than inventing another node-result shape.

Detailed solution:

- introduce durable staged decomposition state on the graph checkpoint:
  work breakdown, capability selections, node contracts, structure review,
  compiled graph, acceptance state, and repair diagnostics.
- remove production acceptance of one-shot executable graph JSON for complex
  missions.
- compile model-authored work units into canonical graph nodes and Work Queue
  children.
- run model-authored structure review before any implementation node can run.
- keep repair field-specific: missing path, expected type, why required,
  preserve fields, failed decision id.

Pass gates:

- the previously failing Product/Spec mission ledger and capability manifest
  compile through staged tools in a lane proof before UX rerun.
- broad implementation cannot be first executable node for a multi-commitment
  mission.
- no fallback graph injection, static sequence, or proof-only runner can
  produce production success.

### Capability And Utility Policy

Current posture: cost-aware manifest exists. Maximum target is a tool-call
compiler around capability selection:

- `rank_candidate_capabilities`
- `select_capability_for_work_unit`
- `explain_expensive_capability_use`
- `compile_capability_selection`

The model selects capability and rationale. Runtime derives graph node kind,
executor key, worker ref, model profile ref, expected evidence, and budget
defaults.

Detailed solution:

- capability manifest vNext records cost, expected strength, context capacity,
  tool access, ideal task size, task-family qualification refs, failure modes,
  escalation rules, and evidence fit.
- `rank_candidate_capabilities` exposes eligible capabilities for a work unit.
- `select_capability_for_work_unit` requires utility rationale, cost
  rationale, context-distribution value, role specialization, parallelism
  opportunity, redundancy penalty, and stop/escalation condition.
- `compile_capability_selection` derives node kind, executor key, worker ref,
  budget, expected evidence, and qualification refs.

Pass gates:

- Codex/GPT 5.5 cannot monopolize multi-commitment work unless cheaper or
  specialized nodes are explicitly unsuitable.
- non-Codex lanes require qualification evidence for the selected task family.
- deterministic validation checks capability support; model review judges
  whether the choice is wise.

Current implementation update, 2026-05-19: Provider Capability Profiles are
now the canonical runtime-derived selection objects. The profile registry is
derived from the Runtime Node Capability Manifest, so model-facing capability
choice, scheduler validation, worker refs, qualification gates, budget/tool
authority, and Work Queue readback no longer depend on separate editable
profile truth.

### Worker And File-Edit Adapters

Current posture: Kimi/non-Codex worker loop is tool-using and qualified for
some task families, but Product/Spec boundary replay showed that a giant JSON
patch proposal remains in the implementation lane. That path is not maximum
toolification. The production target is now the
[Non-Codex Tool Worker Runtime](/projects/execution-platform/specs/non-codex-tool-worker-runtime):
the model works through stepwise runtime tools and runtime applies edits,
runs validation, records evidence, and owns refs/schema. Maximum target:

- `inspect_target_refs`
- `request_more_context`
- `draft_edit_plan`
- `propose_patch`
- `apply_patch`
- `run_validation`
- `classify_validation_failure`
- `repair_patch`
- `claim_commitment_evidence`

This pattern should be model-agnostic. Kimi is one qualified specialization,
not the architecture.

Detailed solution:

- all model file-edit workers use one adapter contract with model-specific
  specializations for task size, preferred context shape, and repair budget.
- giant model-authored patch JSON is test/compat only; it cannot be a
  production success path.
- `inspect_target_refs` and `request_more_context` are separate from edit
  planning so weak context does not become a failed patch.
- `draft_edit_plan` produces steps, target files, assumptions, and validation
  plan.
- patch proposals are single tool-loop actions, not all-in-one completion
  payloads; runtime applies patches through the approved boundary.
- `run_validation`, `classify_validation_failure`, and `repair_patch` happen
  inside the worker loop when budget allows.
- `claim_commitment_evidence` maps changed-file refs, validation refs, and
  limitations to Mission Ledger commitments.

Pass gates:

- no file-change evidence means no implementation success.
- failed apply/no-op/validation attempts roll back before repair or
  escalation.
- worker internal phases emit progress events visible in Work Queue readback.

### Validation, QA, And Repair

Current posture: validation is traceable, but repair can still depend on
generic failure artifacts.

Maximum target:

- `select_validation_plan`
- `run_validation_command`
- `summarize_validation_result`
- `map_failure_to_commitments`
- `draft_repair_plan`
- `accept_validation_evidence`

Runtime owns approved command refs, exit status, bounded log summaries, and
artifact refs. Model judges whether the failure explains unmet commitments and
whether repair is appropriate.

Detailed solution:

- `select_validation_plan` chooses focused and broad validation based on the
  Mission Ledger, workflow evidence profile, changed files, and risk.
- `run_validation_command` executes only approved command refs through runtime
  tools.
- `summarize_validation_result` stores bounded summaries, exit status, command
  hash, duration, and artifact refs.
- `map_failure_to_commitments` lets the model connect failures to commitments
  and decide whether the failure is related.
- `draft_repair_plan` creates a bounded repair objective for the scheduler.
- `accept_validation_evidence` gates clean success.

Pass gates:

- a failed validation becomes scheduler repair evidence unless explicitly
  unrecoverable.
- skipped validation is visible, justified, and cannot silently pass.
- final success requires accepted validation evidence for commitments that
  require tests or checks.

### Closeout And Completion Review

Current posture: `closeout.generate` is production-primary and degraded
closeout is diagnostic-only.

Maximum target:

- `assemble_closeout_evidence_packet`
- `generate_closeout_capsule`
- `review_completion_maximality`
- `compile_finalization_handoff`
- `accept_or_reject_closeout`

Runtime owns packet refs, evidence refs, raw-storage flags, and terminalization.
Model judges quality and whether work was maximal.

Detailed solution:

- `assemble_closeout_evidence_packet` gathers Mission Ledger state, graph
  nodes, tool traces, source-change refs, validation refs, Work Queue readback,
  human decisions, and limitations.
- `generate_closeout_capsule` remains the model-authored closeout tool.
- `review_completion_maximality` asks a model to judge whether the work is
  complete, production-grade, and not proof-shaped.
- `compile_finalization_handoff` produces terminal evidence refs and owner
  readback payloads.
- `accept_or_reject_closeout` deterministic gate checks required refs,
  raw-storage flags, accepted evidence profile, and no open blocking
  commitments.

Pass gates:

- degraded/system closeout is diagnostic-only everywhere.
- closeout cannot run as success while blocking commitments remain open.
- final owner readback cites closeout ref, validation refs, tool refs, and
  limitations.

### Work Queue And Human Tasks

Current posture: DB-backed Work Queue and generated child lifecycle exist.

Maximum target:

- `materialize_runtime_child_item`
- `update_child_from_node_event`
- `create_human_decision_task`
- `resume_human_decision_task`
- `roll_up_parent_status`
- `render_owner_readback_delta`

Runtime owns DB transitions, idempotency, queue rank, parent/child links, and
audit events. Models may draft human-readable summaries and recommended
choices, but human task UX must explain the actual decision being requested.

Detailed solution:

- every owner-visible graph node materializes through
  `materialize_runtime_child_item`.
- `update_child_from_node_event` keeps DB child state aligned with graph node
  state, runtime job refs, active worker, validation, and evidence claims.
- `create_human_decision_task` creates an explicit decision with plain-language
  question, available choices, impact, deadline, blocking nodes, and resume
  ref.
- `resume_human_decision_task` accepts bounded operator input and resumes the
  graph without granting authority beyond policy.
- `roll_up_parent_status` closes or blocks parents based on child terminal
  state and intentional-open refs.
- `render_owner_readback_delta` emits efficient progress/readback deltas.

Pass gates:

- parent/child state is DB/runtime-derived, not file-tracker-derived.
- human task prompts are useful to a real operator, not trigger-test text.
- Work Queue UI/readback shows active node, worker/model, objective, phase,
  validation, human task, closeout, and ELI5.

### Model Memory, Retrieval, Context, And Proactivity

Current posture: model-task and DB-operation middleware are collapsed onto
runtime tools, and Model Memory has an integration spec. The dedicated memory
toolification pass is still open.

Maximum target:

- capture tools:
  - `memory.capture.prepare_source_window`
  - `memory.capture.draft_candidates`
  - `memory.capture.classify_durability`
  - `memory.capture.detect_conflict_or_supersession`
  - `memory.capture.review_raw_storage_risk`
  - `memory.capture.compile_write_refs`
  - `memory.capture.commit_memory_ref`
  - `memory.capture.postwrite_quality_review`
- retrieval/context tools:
  - `memory.retrieval.draft_intent`
  - `memory.retrieval.select_sources`
  - `memory.retrieval.compile_queries`
  - `memory.retrieval.fetch_candidates`
  - `memory.retrieval.rank_candidates`
  - `memory.context.assemble_pack`
  - `memory.context.review_pack_usefulness`
  - `memory.context.insert_pack_ref`
- compaction tools:
  - `memory.compaction.inspect_budget`
  - `memory.compaction.draft_summary`
  - `memory.compaction.review_loss_risk`
  - `memory.compaction.commit_ledger_update`
- proactivity tools:
  - `memory.proactivity.extract_opportunity_candidates`
  - `memory.proactivity.dedupe_and_cooldown_check`
  - `memory.proactivity.model_adjudicate_usefulness`
  - `memory.proactivity.project_to_work_queue_candidate`
  - `memory.proactivity.owner_review_gate`

The model judges memory usefulness, relevance, and opportunity quality. Runtime
owns route-aware budgets, context pack refs, MMV2 write refs, cooldowns,
dedupe/idempotency, and Work Queue generated-item lifecycle.

Detailed solution:

- capture runs as interpret -> candidate review -> durable write compile ->
  MMV2 write -> readback.
- retrieval runs as purpose definition -> candidate gathering -> relevance
  review/ranking -> context pack assembly -> route-aware insertion.
- proactivity runs as candidate extraction -> duplicate/cooldown review ->
  usefulness adjudication -> Planning Capsule or Work Queue proposal compile.
- compaction runs as budget inspection -> model-authored summary proposal ->
  loss/risk review -> bounded ledger update.
- Work Queue projection of proactivity and skill candidates uses generated
  item lifecycle and review-gated status.

Pass gates:

- all production memory model calls use runtime tools or memory-specific tools
  implemented over `model.call`.
- all durable writes use DB-operation/runtime tool evidence.
- no default bootstrap memory flooding remains in production context
  insertion.
- dense capture, retrieval, context pack, and proactivity usefulness receive
  model-authored qualitative review.

## Proactive Hardening For Other Model-Heavy Systems

The same boundary applies to every remaining model-heavy system:

> Model decides semantic meaning, usefulness, sufficiency, and quality.
> Runtime owns schema, refs, bounds, persistence, authority, lifecycle, and
> tool execution.

This section is the architecture record for the next proactive hardening
block. It exists because the scheduler failures showed a recurring failure
class: a model is asked to emit a large runtime-owned JSON envelope,
deterministic code rejects a field, and the system spends effort repairing
schema instead of doing work. The correction is narrow staged tools plus
runtime compilers.

### Router And Front Door

Routing should be thin. It should answer "what kind of owner turn is this and
which executor should receive it?" It should not decide workflow success,
compile action graphs, or perform semantic safety blocking from regular
safety-boundary language.

Canonical staged tools:

- `router.classify_owner_turn_intent`
- `router.extract_constraints`
- `router.select_executor_workflow`
- `router.identify_subject_refs`
- `router.compile_execution_request`
- `router.validate_route_contract`

The model chooses the primary outcome, ambiguity state, executor rationale,
subject refs, and constraints. Runtime derives route ids, executor workflow
ids, authority snapshots, storage policy, Mission Ledger input refs, and
blocked-primary-outcome state. Safety constraints such as "do not deploy" and
"do not store raw logs" become Mission Ledger/compile boundaries, not routing
blockers unless the primary requested outcome is prohibited.

### Validation And QA

Validation should be a scheduler input, not a terminal kill switch.

Canonical staged tools:

- `qa.validation.plan`
- `qa.validation.compile_commands`
- `qa.validation.execute_command`
- `qa.validation.summarize_result`
- `qa.validation.classify_failure`
- `qa.validation.map_failure_to_commitments`
- `qa.validation.propose_repair_plan`
- `qa.validation.accept_or_escalate`

The model authors the validation plan, failure meaning, related commitment
mapping, and repair strategy. Runtime owns approved command refs, execution,
exit status, bounded log summaries, command hashes, duration, and artifact
refs. Recoverable failures return to the scheduler as repair evidence. Final
success requires accepted validation evidence for blocking commitments that
require tests or checks.

### Closeout Finalization

Closeout is a finalization workflow, not a last assistant message.

Canonical staged tools:

- `closeout.collect_evidence_packet`
- `closeout.generate_capsule`
- `closeout.review_mission_completion`
- `closeout.review_maximality`
- `closeout.project_opportunities`
- `closeout.compile_finalization_handoff`
- `closeout.accept_or_reject_finalization`

Runtime requires Mission Ledger status, evidence claims, workflow evidence
profile state, runtime tool traces, Work Queue readback refs, model-authored
Closeout Capsule, and model-authored maximality review. Degraded/system
closeout is diagnostic only and cannot close a production workflow.

### Shared Compiler And Guardrail Primitives

Every proactive hardening item should share these primitives instead of
rebuilding them per subsystem:

- `ToolContractCompiler`: compiles model-authored intent/rationale into
  canonical runtime schema.
- `ToolRepairDiagnostics`: field path, expected type, why required, valid
  alternatives, failed decision id, and preserved accepted fields.
- `TraceVisibilityProfile`: owner-visible phase, objective, selected refs,
  status, evidence produced, next action, and ELI5.
- `RawStorageGuard`: rejects raw prompts, raw responses, raw transcripts, raw
  provider/tool/command logs, raw DB rows, secrets, and unbounded source text.
- `AuthorityBoundaryGuard`: prevents router, memory, validation, closeout,
  and proactivity from granting approval, controls, model promotion, runtime
  lifecycle truth, or Work Queue lifecycle mutation.
- `ToolificationAdoptionGate`: no work item closes as toolified unless live
  production-path tool traces, readback refs, and closeout evidence exist.

### Pre-Proof Placement

Product/Spec Planning remains the near-term proof objective, but three
hardening items should now run before the next long Product/Spec proof because
they directly reduce the failure classes already seen in live attempts:

1. Router And Front Door Tool Protocol.
2. Validation And QA Toolification.
3. Closeout Finalization Toolchain.

Full Model Memory toolification should follow the Product/Spec proof unless a
memory-specific proof becomes the immediate goal. Memory is high value, but it
is not the current Product/Spec blocker.

### Product/Spec Planning

Current posture: intended Product/Spec Planning implementation remains the
near-term proof objective, not something to pre-build here.

Maximum target for that proof:

- `planning_orchestrator`
- `web_research_plan`
- `web_research_brief`
- `planning_capsule_draft`
- `planning_capsule_revision`
- `human_planning_decision`
- `action_graph_proposal`
- `compile_runtime_plan`
- `planning_closeout`

The coding team may implement this workflow, but the platform must first give
the coding team the staged scheduler protocol so it can decompose and execute
the implementation without schema choke.

Pass gates for the later Product/Spec proof:

- route selects the implementation executor when the owner asks to build the
  workflow, and selects Product/Spec Planning when the owner asks it to plan.
- implementation prompt creates scheduler-backed workflow registration,
  planning nodes, research brief contract, Planning Capsule lifecycle,
  action-graph proposal/compile readiness, human planning decision, Work Queue
  readback, validation, and model-authored closeout.
- proof demonstrates child Work Queue materialization and meaningful emissions.

### Research, Docs/Skills, QA/Test, Architecture/Spec

Current posture: these have worker adapter history but are not all canonical
workflow plugins.

Maximum target:

- each workflow registers a `WorkflowDefinition`.
- each workflow exposes capabilities through the manifest.
- each workflow uses staged tool contracts for planning, source gathering,
  drafting, validation, review, and closeout.
- no generic queued workflow path may produce production success for these
  workflows without workflow definition, Mission Ledger, tool traces, evidence
  profile, and model-authored closeout.

Detailed solution:

- web research tools: `plan_search`, `run_search`, `open_source_ref`,
  `extract_claims`, `build_research_brief`, `review_source_quality`,
  `mark_stale_assumption`.
- docs/skills tools: `discover_doc_targets`, `draft_doc_or_skill_update`,
  `validate_doc_refs`, `review_skill_candidate`, `compile_docs_closeout`.
- QA/test tools: `select_validation_plan`, `draft_test_edit`,
  `run_validation`, `review_failure`, `compile_qa_closeout`.
- architecture/spec tools: `draft_architecture_brief`, `compare_alternatives`,
  `review_risks`, `draft_decision_record`, `compile_implementation_handoff`.

Pass gates:

- each workflow has a production `WorkflowDefinition`.
- each workflow has owner-readable Work Queue projection.
- each workflow has a live UX/runtime proof before being called production
  ready.

### Gateway, Submission, Heartbeat, And Background Work

Current posture: prompt-file transport and owner-turn heartbeat guard are in
place.

Maximum target:

- `submit_owner_prompt`
- `ack_runtime_job`
- `stream_runtime_progress`
- `schedule_background_lane`
- `pause_or_cancel_runtime_job`
- `resume_human_task`

Prompt text is volatile input. Artifacts store only hashes, refs, lengths, and
bounded status. Background work should move from coarse suppression to
lane/conflict-domain scheduling after the Product/Spec proof.

Detailed solution:

- `submit_owner_prompt` records prompt hash/source and creates accepted owner
  turn activity.
- `ack_runtime_job` returns runtime job id and Work Queue refs immediately
  when execution is created.
- `stream_runtime_progress` exposes graph/tool/worker progress to chat and
  Work Queue UI.
- `schedule_background_lane` allows heartbeat/proactivity only when conflict
  domains do not overlap with foreground owner work.
- `pause_or_cancel_runtime_job` and `resume_human_task` become first-class
  operator control tools.

Pass gates:

- heartbeat cannot supersede accepted owner work.
- later parallel lanes can run concurrently only with explicit conflict-domain
  safety.
- progress visibility comes from runtime events, not fragile assistant text
  matching.

## Work Queue Placement

This spec creates a new pre-proof item:

`openclaw-convergence.staged-scheduler-tool-protocol`

Title: Staged Scheduler Tool Protocol And Maximum Toolification Compiler.

It must run before Product/Spec Planning because the last blocker occurred
before any Product/Spec work executed. The Product/Spec prompt should not be
rerun until the staged scheduler protocol accepts the previously failing
mission ledger/capability manifest and starts a real first node.

Post-proof maximum-toolification items remain:

- Runtime Parallel Graph Execution And Join Semantics.
- Session And Background Work Concurrency Lanes.
- Work Queue Parallel Runtime Visibility And Control.
- Model Contract Compiler Consolidation.
- Memory, Retrieval, Context, And Proactivity Toolification.

## Acceptance Gate For The New Pre-Proof Item

The item is complete only when:

- single-shot executable graph JSON is no longer the production decomposition
  path for complex missions.
- staged scheduler tools are production-primary for `agent_team.coding` and
  the generic production plugin contract.
- runtime compiles canonical graph envelopes from model-authored work units,
  capability selections, node contracts, and structure review.
- lane tests use the actual failed Product/Spec mission ledger/capability
  manifest and accept a decomposition graph without running implementation.
- Work Queue readback shows staged progress and field-specific repair
  diagnostics.
- broad implementation cannot start first on a multi-commitment mission.
- no fallback graph injection or proof-shaped static sequence can produce
  production success.
