# Execution Platform Status

## 2026-05-15 Dedicated Execution Platform DB Boundary Activated

Live Execution Platform runtime and Work Queue storage now resolves from
`config.env.vars.EXECUTION_PLATFORM_DATABASE_URL` to the dedicated
`execution_platform` database.

- boundary kind: `dedicated_execution_platform_db`
- readiness: `ready`
- Work Queue live linkage: enabled
- Model Memory DB reused: false
- shared-runtime approval flag: not required

The existing DB-backed Work Queue planning state was copied into the dedicated
database as bounded planning metadata, version summaries, dependency refs, and
artifact refs only. Runtime jobs remain lifecycle truth; Work Queue remains
projection/readback/control. The gateway was restarted after the config
change, and local plus Tailscale health/readiness passed without changing
port, auth, pairing, device identity, or ACP endpoint.

## 2026-05-15 Runtime Toolification Queue Recorded

The next Product/Spec Planning live UX proof is not the immediate next step.
The pre-proof queue now requires six production-grade platform passes:

1. Runtime Tool-Call Kernel And Trace Store. **Complete.**
2. Cost-Aware Capability Policy. **Complete.**
3. Scheduler Toolification And Split Planning/Execution. **Complete.**
4. Worker Tool Loops. **Complete, with worker-loop v2 proof.**
5. Mission Ledger Evidence Claims And Finalization Handoff. **Complete.**
6. Work Queue Tool/Event Readback. **Complete.**

These passes turn delegation into a first-class scheduling decision with
utility policy: expected quality gain, token/cost budget,
context-distribution value, role specialization, parallelism opportunity,
redundancy penalty, and evidence needed to close commitments.

Product/Spec Planning remains the next major live UX proof, but it should run
only after the pre-proof toolification queue passes. Memory/proactivity and
closeout toolification continue after that proof unless they are needed to
repair a Product/Spec blocker.

## 2026-05-15 Runtime Tool-Call Kernel Completed

The runtime now has a production Runtime Tool-Call Kernel and durable trace
store in the dedicated `execution_platform` database.

- migration: `0006_runtime_tool_call_trace_store.sql`
- tables: runtime tool definitions, invocations, events, and artifact refs
- modules: `RuntimeToolRegistry`, `RuntimeToolTraceRepository`,
  `RuntimeToolKernel`
- first production integration: Runtime Work Graph node execution can be
  traced as `worker.invoke`
- live proof: bounded diagnostic tool invocation succeeded on the dedicated DB
- hardening proof: timeout/abort, explicit cancel, cursor pagination, scoped
  retention pruning, and adoption boundary map passed against the dedicated DB

This does not complete cost-aware scheduling, full scheduler toolification,
Kimi worker loops, Mission Ledger finalization, or rich Work Queue tool/event
readback.

## 2026-05-15 Cost-Aware Capability Policy Completed

Runtime Work Graph scheduling now enforces cost-aware capability decisions
for production coding-team jobs. The capability manifest carries workflow
support, role class, ideal task size, context capacity, expected strength,
cost class, evidence fit, budget policy, and escalation/repair metadata.

The scheduler validates model-authored utility decisions before adding or
running nodes. Each accepted node must name the selected capability, executor,
target commitments, utility rationale, cost rationale, duplicate-work
rationale, expected evidence, downstream consumer, and stop/escalation
condition. Premium Codex use must justify why cheaper same-role options are
insufficient. Deterministic code validates shape, refs, bounds, storage flags,
executor mapping, and commitment ids; it does not judge semantic quality.

Live dedicated-DB proof passed:

- broad premium first-move attempt was rejected.
- repaired graph used context scout, the Kimi implementation lane, and
  validation nodes.
- Mission Ledger commitments closed from bounded evidence refs.
- Work Queue active progress readback now includes capability/cost rationale.
- DB Work Queue item `openclaw-convergence.active-queue-50` closed from
  accepted runtime closeout evidence.

Artifacts:

- `.artifacts/execution-platform/cost-aware-capability-policy-live-proof.json`
- `.artifacts/execution-platform/cost-aware-capability-policy-summary.json`
- `.artifacts/execution-platform/cost-aware-capability-policy-final-artifact-index.json`

## 2026-05-16 Scheduler Toolification And Split Planning Completed

Runtime Work Graph Scheduler decisions are now traced through the Runtime
Tool-Call Kernel, not only worker-node execution. The production gateway
runtime constructs a scheduler tool registry and kernel, registers scheduler
tools plus `worker.invoke`, and passes the kernel into the live
`agent_team.coding` graph runner.

The scheduler now records bounded tool traces for:

- `scheduler.decompose_mission`
- `scheduler.create_graph_node`
- `scheduler.create_graph_edge`
- `scheduler.accept_decomposition_graph`
- `scheduler.reject_decomposition_graph`
- `scheduler.select_next_node`
- `scheduler.request_human_decision`
- `scheduler.mark_needs_review`
- `scheduler.create_closeout_request`
- `worker.invoke`

Work Queue active graph readback now includes scheduler tool trace state:
current scheduler phase, latest tool id, and invocation refs. The proof run
used the dedicated Execution Platform DB, created a runtime job and graph,
accepted a decomposition graph, executed context/implementation/validation
nodes through traced worker invocations, requested closeout, and closed DB
Work Queue item `openclaw-convergence.active-queue-22` from accepted runtime
closeout evidence.

Artifacts:

- `.artifacts/execution-platform/scheduler-toolification-split-planning-preflight.json`
- `.artifacts/execution-platform/scheduler-toolification-split-planning-trace-proof.json`
- `.artifacts/execution-platform/scheduler-toolification-split-planning-summary.json`

## 2026-05-16 Worker Tool Loops And Non-Codex File-Edit Worker Completed

The generic file-edit worker adapter now treats non-Codex implementation work
as a first-class traced worker loop instead of a one-shot patch oracle.

Production behavior now covered:

- worker-loop runtime tool ids for file context inspection, edit planning,
  patch proposal, patch application, validation, failure classification,
  repair, escalation, and evidence handoff
- Kimi implementation lane receives bounded file snapshots and rich
  orchestrator-style microtask packets rather than vague "go edit code"
  instructions
- failed Kimi attempts are atomic; patch/apply failures, no-op edits, and
  validation failures restore the pre-attempt file snapshot before retry or
  escalation
- structured diagnostics capture response shape, schema/normalization state,
  rejection stage, model refs, latency, token budget, and bounded reason
  codes without raw prompt/response/provider-log storage
- Work Queue readback now links closed items back to their closeout runtime
  job and can surface worker tool traces, changed-file refs, and validation
  refs from scheduler progress

Live dedicated-DB proof passed:

- model/provider: `moonshotai/kimi-k2.6` through OpenRouter
- runtime job:
  `non-codex-file-edit-worker-1778895735946-job`
- graph:
  `non-codex-file-edit-worker-1778895735946-graph`
- source edits:
  `extensions/execution-platform/src/codex-bridge/kimi-live-source-edit-proof.ts`
  and
  `extensions/execution-platform/src/codex-bridge/kimi-live-source-edit-proof.test.ts`
- validation:
  `pnpm test:file extensions/execution-platform/src/codex-bridge/kimi-live-source-edit-proof.test.ts`
- DB Work Queue closeout:
  `openclaw-convergence.active-queue-21` closed from accepted runtime
  closeout evidence

Artifacts:

- `.artifacts/execution-platform/non-codex-file-edit-worker-loop-preflight.json`
- `.artifacts/execution-platform/non-codex-file-edit-worker-live-proof-summary.json`
- `.artifacts/execution-platform/non-codex-file-edit-worker-live-proof-quality-review.json`
- `.artifacts/execution-platform/non-codex-file-edit-worker-live-proof-readback.json`

Mission Ledger Evidence Claims And Finalization Handoff and Work Queue
Tool/Event Readback are now complete. Product/Spec Planning is the next major
live UX proof.

## 2026-05-16 Model-Agnostic Non-Codex Worker Loop Completed

The non-Codex implementation lane has been promoted from a Kimi-specific
patch path to a model-agnostic tool-using worker contract.

Production behavior now covered:

- canonical worker phases: plan, explore, edit, validate, repair/escalate,
  and evidence handoff
- bounded phase emissions for worker loop start, planning, tool selection,
  tool execution, edit planning, and terminal completion/needs-review
- reusable specialization manifest for Kimi implementation, non-Codex
  context scout, non-Codex test writer, non-Codex docs editor, validation
  failure explainer, and a contract-only frontend editor placeholder
- Kimi remains the first production implementation specialization on the
  generic loop, using Runtime Tool-Call Kernel repo/search/read/test tools,
  edit/validation/evidence tools, source edits, validation repair, and
  commitment-linked evidence claims
- Work Queue readback now surfaces worker tool ids as well as invocation
  refs, changed-file refs, validation refs, and ELI5 progress
- the live proof harness now generates a fresh per-run edit target and has a
  top-level timeout so reruns cannot silently hang or falsely fail on an
  already-applied field

Live OpenRouter/Kimi proof passed:

- model/provider: `moonshotai/kimi-k2.6` through OpenRouter
- runtime job:
  `non-codex-tool-using-worker-1778902828075-job`
- graph:
  `non-codex-tool-using-worker-1778902828075-graph`
- fresh proof field: `toolUsingWorkerTraceRefs46003efd`
- worker phase events: 15
- source edits:
  `extensions/execution-platform/src/codex-bridge/kimi-live-source-edit-proof.ts`
  and
  `extensions/execution-platform/src/codex-bridge/kimi-live-source-edit-proof.test.ts`
- validation refs:
  `validation://non-codex-tool-using-worker/e95a54c58bd130b4` and
  `validation://non-codex-tool-using-worker/576a624d164aec4c`
- DB Work Queue closeout:
  `openclaw-convergence.non-codex-tool-using-worker` closed from accepted
  runtime closeout evidence

Artifacts:

- `.artifacts/execution-platform/non-codex-tool-using-worker-live-proof-summary.json`
- `.artifacts/execution-platform/non-codex-tool-using-worker-live-proof-quality-review.json`
- `.artifacts/execution-platform/non-codex-tool-using-worker-live-proof-readback.json`

## 2026-05-16 Model-Agnostic Worker Multi-Model Qualification Completed

The model-agnostic worker substrate now has an explicit qualification matrix.
This prevents the scheduler from treating every model on the generic adapter
as production-ready just because the adapter contract exists.

Production behavior now covered:

- candidate profiles for Kimi, DeepSeek v4 Flash, DeepSeek v4 Pro, and Codex
  escalation include provider refs, task families, cost/latency class,
  context capacity, edit limits, tool profile refs, escalation targets, and
  raw-storage flags
- Runtime Node Capability Manifest entries now expose
  `modelQualificationProfileIds` and
  `productionSelectionRequiresQualification`
- Cost-Aware Capability Utility Decisions now require
  `selectedModelQualificationProfileId` and `qualificationEvidenceRefs` when
  selecting a production non-Codex/model-agnostic worker
- the live qualification proof uses prior accepted Kimi source-edit evidence
  for implementation and fresh bounded OpenRouter calls plus a separate
  model-authored reviewer pass for support-lane qualification
- DB Work Queue item
  `openclaw-convergence.model-agnostic-worker-qualification` closed from
  accepted runtime closeout evidence

Live qualification result:

- `moonshotai/kimi-k2.6`: production-qualified for `small_source_edit`
- `deepseek/deepseek-v4-flash`: production-qualified for
  `repo_context_scout` and `validation_failure_explanation`
- `deepseek/deepseek-v4-pro`: candidate for `test_writing_edit`; not
  production-qualified because it produced a test plan, not source-edit
  evidence
- `docs_spec_edit`, `test_writing_edit`, and `frontend_scoped_edit` still
  require dedicated live file-edit proofs before production selection

Artifacts:

- `.artifacts/execution-platform/model-agnostic-worker-qualification-preflight.json`
- `.artifacts/execution-platform/model-agnostic-worker-qualification-run-index.json`
- `.artifacts/execution-platform/model-agnostic-worker-qualification-matrix.json`
- `.artifacts/execution-platform/model-agnostic-worker-qualification-summary.json`

## 2026-05-16 Non-Codex Large-Task Decomposition Completed

The scheduler now prevents large coding missions from collapsing back to a
single broad Codex implementation node when cheaper qualified non-Codex lanes
should do useful work first.

Production behavior now covered:

- complex coding missions cannot start with a broad `implementation_complex`
  Codex node
- first accepted complex decomposition must include commitment-mapped child
  nodes and either handoff/dependency edges or an explicit parallel
  justification
- non-Codex/model-agnostic production nodes must include a task family,
  selected model qualification profile, qualification evidence refs, exact
  objective, expected output, acceptance criteria, downstream consumer, and
  stop/escalation condition
- orchestrator decision normalization preserves task-family and qualification
  fields instead of dropping them into thin metadata
- scheduler executor lookup now honors capability executor keys, so
  specialized nodes such as `non_codex_context_scout` and
  `non_codex_validation_failure_explainer` can run through their intended
  executor lanes instead of generic role fallbacks
- reviewer capability coverage is explicit, so complex coding closeout can
  require review without relying on undeclared role behavior

Dedicated-DB runtime proof passed:

- runtime job:
  `non-codex-decomposition-1778905961225-job`
- graph:
  `non-codex-decomposition-1778905961225-graph`
- rejected invalid broad Codex-first decision:
  `non_codex_decomposition_codex_broad_first_for_complex_mission`
- accepted graph: 4 nodes, 3 handoff edges
- executed nodes: context scout, Kimi implementation lane, validation
  explainer, reviewer
- DB Work Queue child materialization: 4 closed child items
- DB Work Queue closeout:
  `openclaw-convergence.non-codex-large-task-decomposition` closed from
  accepted runtime closeout evidence

Artifacts:

- `.artifacts/execution-platform/non-codex-decomposition-qualification-preflight.json`
- `.artifacts/execution-platform/non-codex-decomposition-qualification-run-index.json`
- `.artifacts/execution-platform/non-codex-decomposition-qualification-summary.json`

## 2026-05-16 Non-Codex Worker Loop V2 Completed

The Kimi/non-Codex implementation lane now has a stronger production worker
loop instead of only a scoped one-shot edit path.

Additional production behavior now covered:

- model-authored bounded context expansion requests before editing
- runtime tool traces for context request/provide/deny events
- multi-step edit plans with step ids, target refs, validation expectations,
  rollback boundaries, and commitment ids
- validation-driven repair after context expansion within the same worker run
- commitment-linked evidence claims handed back to the scheduler/Work Queue
- larger bounded Kimi attempt budget so context expansion and one repair turn
  can both complete without starving the loop

Live dedicated-DB proof passed:

- model/provider: `moonshotai/kimi-k2.6` through OpenRouter
- runtime job:
  `non-codex-worker-loop-v2-1778898154883-job`
- graph:
  `non-codex-worker-loop-v2-1778898154883-graph`
- source edits:
  `extensions/execution-platform/src/codex-bridge/kimi-live-source-edit-proof.ts`
  and
  `extensions/execution-platform/src/codex-bridge/kimi-live-source-edit-proof.test.ts`
- validation refs:
  `validation://non-codex-worker-loop-v2/e95a54c58bd130b4` and
  `validation://non-codex-worker-loop-v2/576a624d164aec4c`
- DB Work Queue closeout:
  `openclaw-convergence.non-codex-worker-loop-v2` closed from accepted
  runtime closeout evidence

Artifacts:

- `.artifacts/execution-platform/non-codex-worker-loop-v2-preflight.json`
- `.artifacts/execution-platform/non-codex-worker-loop-v2-live-proof-summary.json`
- `.artifacts/execution-platform/non-codex-worker-loop-v2-live-proof-quality-review.json`
- `.artifacts/execution-platform/non-codex-worker-loop-v2-live-proof-readback.json`

## 2026-05-16 Mission Ledger Claims And Tool/Event Readback Completed

Mission Ledger closure now depends on explicit commitment evidence claims
instead of generic artifact inference. Scheduler node results can return
bounded `evidenceClaims`; production `agent_team.coding` requires those
claims for Mission Ledger evaluation. The deterministic layer validates
claim refs, storage flags, and commitment ids; the model-authored Mission
Ledger evaluator judges sufficiency using only claimed evidence refs.

Finalization handoff is stricter:

- missing evidence claims keep commitments open and return to the
  orchestrator instead of allowing generic closeout churn.
- Mission Ledger evaluator JSON gets one bounded repair attempt before the
  job moves to `needs_review`.
- accepted evidence refs come from claims, not unclaimed output artifacts.
- degraded/system closeout remains diagnostic-only and cannot produce clean
  production success.

Work Queue owner readback now surfaces active graph/tool progress:

- active node, role, model, objective, phase, selected tool, validation state,
  evidence refs, evidence-claim refs, open commitments, blocker summary, and
  next decision.
- UI detail renders a Runtime graph progress section from DB-backed readback.

Dedicated-DB proof passed:

- runtime job:
  `mission-ledger-tool-readback-1778907616712-job`
- graph:
  `mission-ledger-tool-readback-1778907616712-graph`
- graph shape: 5 nodes with context, implementation, validation, readback,
  and review coverage
- child Work Queue items materialized: 5
- Mission Ledger status: satisfied with zero open blocking commitments
- DB Work Queue items closed:
  `openclaw-convergence.toolification-05-mission-ledger-evidence-finalization`
  and `openclaw-convergence.toolification-06-work-queue-tool-event-readback`

Artifacts:

- `.artifacts/execution-platform/mission-ledger-tool-event-readback-preflight.json`
- `.artifacts/execution-platform/mission-ledger-tool-event-readback-summary.json`
- `.artifacts/execution-platform/mission-ledger-tool-event-readback-work-queue-readback.json`

## 2026-05-15 Product/Spec Planning Production Upgrade

`agent_team.product_spec_planning` is treated as a scheduler-backed workflow in source. The generic workflow queued runner rejects it with `product_spec_planning_requires_scheduler_backed_runner`; Product/Spec Planning must run through Runtime Work Graph scheduler policy.

Live behavior now covered by source and focused tests:

- first executable Product/Spec Planning node must be `planning_orchestrator`
- bounded ResearchBriefs require source refs, citation refs for claims, assumptions, freshness/staleness notes, and raw-storage flags
- Work Queue owner readback projects Planning Capsule, research influence, stale external assumptions, human decision, ActionGraphProposal, compile readiness, validation, Mission Ledger, limitations, and ELI5 fields
- proposed children remain proposal-only until a later compile/authority boundary
- Work Queue lifecycle remains readback/control projection, not runtime lifecycle truth
