# Runtime Toolification And Utility Scheduling

## Purpose

The next platform pass replaces fragile "return JSON and hope" workflow
coordination with explicit runtime tool operations. Models still decide what
work should happen and judge semantic sufficiency. Deterministic runtime code
only validates tool shape, refs, bounds, authority, storage, dependencies,
budgets, and lifecycle separation.

This is the pre-proof substrate for the next Product/Spec Planning live UX
proof. The Product/Spec prompt should not be rerun until the pre-proof items
below are production-primary, wired into live execution, and validated through
runtime evidence.

## 2026-05-17 Update: Router Front Door Tool Protocol

`openclaw-convergence.toolification-14-router-front-door-tool-protocol` is
complete.

- `router.front_door` is a canonical Runtime Tool-Call Kernel family.
- The live gateway registers the six staged router tools for intent
  classification, constraint extraction, executor workflow selection, subject
  ref identification, execution request compile, and route contract
  validation.
- Accepted runtime jobs carry front-door tool protocol refs and a Mission
  Ledger handoff ref.
- Runtime owns canonical schema/refs/persistence/authority/lifecycle; the
  router model owns semantic route meaning and rationale.
- The legacy semantic fallback env path is test-only.

## 2026-05-17 Update: Validation And QA Toolification

`openclaw-convergence.toolification-18-validation-qa-toolification` is
complete.

- `validation.plan`, `validation.run`, `validation.result`,
  `validation.review`, and `qa.review` are canonical Runtime Tool-Call Kernel
  families.
- The live gateway registers tools for validation planning, approved command
  refs, result summaries, failure classification, failure-to-commitment
  mapping, repair plans, coverage review, accepted validation evidence,
  work-product review, and evidence-sufficiency review.
- Production coding-team validation nodes require the runtime tool kernel.
  Missing validation/QA tools produce `needs_review`; they do not enter a
  non-toolified compatibility success path.
- Runtime owns command refs, result refs, invocation refs, evidence packet
  shape, storage flags, and Work Queue readback. Models own validation plan
  quality, failure diagnosis, coverage/review judgment, and repair-plan
  usefulness.
- Work Queue active graph readback surfaces validation/QA state, plan refs,
  command refs, result refs, failure/repair refs, coverage/review refs,
  evidence packet refs, tool invocation refs, blocking commitment ids, and
  owner-readable validation summaries.

## 2026-05-17 Update: Closeout Finalization Toolchain

`openclaw-convergence.toolification-19-closeout-finalization-tools` is
complete.

- `closeout.finalize` is a canonical Runtime Tool-Call Kernel family.
- The live gateway registers tools for closeout evidence packet collection,
  Mission Ledger completion review, workflow evidence profile review,
  validation/QA evidence review, tool trace coverage review, Work Queue
  readback review, maximality review, finalization handoff compilation,
  accepted finalization, and rejected finalization.
- Production clean success now requires accepted closeout finalization
  evidence after workflow evidence profile and completion-review gates.
- Runtime owns packet shape, refs, missing evidence reason codes, storage
  flags, authority/lifecycle flags, and finalization accept/reject state.
  Models own maximality and usefulness judgment through the closeout/review
  chain.
- Degraded/system closeout, bare `create_closeout`, process completion, and
  missing finalization evidence remain diagnostic-only.
- Work Queue active graph readback surfaces finalization state, evidence
  packet refs, handoff refs, tool invocation refs, accept/reject refs,
  missing reason codes, maximality summary, limitations, ELI5, and
  recommended next action.

## 2026-05-16 Update: Toolification Must Become The Working Interface

The latest Product/Spec Planning proof attempts showed that Runtime Tool
Kernel traces alone do not solve orchestration failure. The system got through
Mission Ledger, then asked the orchestrator for one executable graph JSON
object that included graph structure, commitment coverage, node contracts,
edge/parallelism justification, cost-aware selection, non-Codex rules, no broad
implementation first, repair continuity, and runtime-owned schema boundaries.

That is too much for one model decision. It creates a deterministic reject
loop even when the model makes a reasonable next-step choice.

The next pre-proof item is therefore:

`openclaw-convergence.staged-scheduler-tool-protocol` - Staged Scheduler Tool
Protocol And Maximum Toolification Compiler.

Status update 2026-05-16: this item is complete for the production
`agent_team.coding` scheduler path. Complex missions now use staged model
intent plus runtime compilation instead of one-shot executable graph JSON.
The accepted production scheduler tools are:

- `scheduler.draft_commitment_work_breakdown`
- `scheduler.map_commitments_to_work_units`
- `scheduler.select_capabilities_for_work_units`
- `scheduler.define_node_contracts`
- `scheduler.define_edges_or_parallelism`
- `scheduler.compile_runtime_graph`
- `scheduler.review_compiled_graph`
- `scheduler.accept_staged_graph`
- `scheduler.approve_and_run_first_node`

The old accepted-decomposition production trace path
`scheduler.decompose_mission` is no longer emitted by accepted complex
decompositions.

It must land before the next Product/Spec Planning UX proof. The scheduler
must expose a staged tool protocol:

- `draft_commitment_work_breakdown`
- `select_capabilities_for_work_units`
- `define_node_contracts`
- `define_edges_or_parallelism`
- `compile_runtime_graph`
- `review_compiled_graph`
- `approve_and_run_first_node`

The model authors intent, work units, rationale, success criteria, and
semantic review. Runtime derives node envelopes, executor refs, evidence enums,
ids, storage flags, authority flags, and Work Queue child materialization.

See `maximum-toolification-architecture.md`.

## Owner-Turn And Prompt Transport Preflight

Before another long-form live UX proof, the operator submission path must
protect active owner work and transport prompt text as data:

- accepted owner `chat.send` turns register owner-turn activity before
  front-door/runtime handoff.
- heartbeat/proactivity checks owner-turn activity for the base session and
  isolated `:heartbeat` sibling before it runs. A busy owner turn returns
  `owner-turn-in-flight` rather than adding a competing heartbeat prompt.
- owner-turn records clear on completion/error/abort and expire by TTL after
  crashes.
- long prompts should be submitted with
  `scripts/openclaw-submit-prompt-via-ux.mjs --prompt-file <path>` or
  `--stdin` so code fences, template backticks, `${...}` examples, and shell
  snippets are never interpreted by the local wrapper.
- prompt-submission artifacts store hash/length/source/run evidence only.

This is a general background-work and transport boundary; it is not a
Product/Spec-specific workaround.

## Pre-Proof Required Passes

1. **Runtime Tool-Call Kernel And Trace Store** - complete 2026-05-15.
   - Add a canonical `RuntimeToolCall` envelope for model-requested runtime
     operations.
   - Persist bounded tool-call traces with tool id, role/model refs, input
     refs, produced refs, latency/cost metrics, status, reason codes, and
     raw-storage flags.
   - Tool traces are runtime evidence and Work Queue readback input. They do
     not grant authority, mutate Work Queue lifecycle, store raw prompts or
     provider output, or substitute for accepted mission evidence.

   Implemented production pieces:
   - durable `runtime_tool_definitions`, `runtime_tool_invocations`,
     `runtime_tool_events`, and `runtime_tool_artifacts` tables.
   - `RuntimeToolRegistry`, `RuntimeToolTraceRepository`, and
     `RuntimeToolKernel`.
   - Runtime Work Graph node execution can be wrapped as `worker.invoke`
     traces.
   - live dedicated-DB diagnostic proof passed.

   Hardening completed on 2026-05-15:
   - kernel-enforced timeout/abort handling wraps executor calls and records
     `runtime_tool_timeout` terminal evidence.
   - `cancelInvocation(...)` aborts active executors when present and marks
     invocations `canceled` idempotently.
   - terminal invocation completion is first-writer-wins; late executor
     returns are recorded as ignored diagnostic events instead of overwriting
     timeout/cancel/failed states.
   - trace history supports cursor pagination for large invocation sets.
   - retention/pruning is policy-scoped, preserves active/review/failed rows
     by default, can preserve artifact-backed rows, and supports dry-run
     evidence before deletion.
   - the adoption boundary has been promoted into a truth registry and gate
     for later scheduler, worker, memory, closeout, and Work Queue readback
     toolification.

1a. **Runtime Toolification Truth Registry And Adoption Gate** - complete
2026-05-16.

- `buildRuntimeToolificationTruthRegistry()` records each runtime surface
  with owner system area, current status, target status, canonical tool
  families, production entry refs, compatibility entry refs, blocker
  reason codes, and next queue item.
- `evaluateRuntimeToolificationAdoptionGate(...)` is the canonical
  overclaim guard. Production-primary or live-UX-proven status requires
  bounded evidence refs, runtime-tool invocation refs when traces are
  required, Work Queue readback refs when readback is required, closeout
  refs when closeout is required, live UX refs when live proof is
  required, and compatibility-retirement refs when retirement is required.
- Deterministic code validates only shape, refs, bounds, storage flags,
  and required proof kinds. It does not judge whether model-authored work
  is semantically good.
  - DB-backed Work Queue convergence readback surfaces the bounded registry
    summary from canonical registry truth for the registry item so
    active/closed queue views cannot be fooled by stale metadata.
  - The legacy `RUNTIME_TOOL_ADOPTION_BOUNDARY_MAP` is a compatibility
    export derived from the canonical registry.
  - `.toolification-` Work Queue closeouts require accepted adoption-gate
    evidence; missing or rejected gate evidence keeps the item in
    `needs_review`.
  - The approved proof command is
    `pnpm proof:execution-platform:toolification-truth-registry`.
  - The dedicated-DB proof rejected an intentional Product/Spec Planning
    live-UX overclaim and closed
    `openclaw-convergence.toolification-07-truth-registry-adoption-gate`
    from accepted runtime closeout evidence.

1b. **Model Call Toolification And Model Task Middleware Collapse** -
complete 2026-05-16.

- `model.call` is the canonical Runtime Tool-Call Kernel family for live
  model-task provider calls.
- The model-task middleware boundary is now a facade over runtime tools:
  contract lookup, input validation, route evidence, output validation,
  runtime-job completion/failure, and Work Queue readback stay in
  `ModelTaskRepository`.
- Provider prompts are passed as volatile executor-only tool input. They are
  not persisted in runtime tool invocation metadata, events, artifacts, or
  runtime job artifacts.
- Runtime tool traces persist bounded evidence only: invocation refs, model
  refs, provider refs, response hashes, structured-output hashes, usage,
  latency, status, and reason codes.
- Accepted structured JSON output can be handed back to the model-task facade
  for schema validation and runtime-job completion. Raw provider responses
  remain unstored.
- Live completion requires an injected `RuntimeToolKernel`. Missing kernel
  configuration fails closed before a model-task job is enqueued.
- `providerCallMade: true` is a trace-backed claim, not caller-provided truth.
  The model-task facade rejects clean completion unless a
  `model_task.runtime_tool_trace` artifact carries a `runtime-tool://...`
  invocation ref for the runtime job.
- Fixture/pilot model-task helpers stay provider-free. They may validate
  contract/lifecycle plumbing, but they cannot produce provider-call evidence
  or runtime tool invocation refs.
- `model-tasks/fallback.ts` remains classification-only. It can explain
  provider/schema failure classes, but it does not execute fallback provider
  calls and is not a production bypass around `model.call`.
- Work Queue middleware readback surfaces model-call runtime invocation refs
  so owner-facing readback can tie model tasks to tool traces.
- The runtime toolification truth registry now marks
  `model-call-toolification` as `production_primary`.
- Dedicated-DB proof created a real Codex app-server JSON model call through
  `model.call`, produced Work Queue readback, accepted the adoption gate, and
  closed
  `openclaw-convergence.toolification-08-model-call-toolification` from
  runtime closeout evidence.

1c. **Script And DB Operation Toolification** - complete 2026-05-16.

- `script.execute` is the canonical Runtime Tool-Call Kernel family for live
  script-job execution.
- `db_operation.execute` is the canonical Runtime Tool-Call Kernel family for
  live DB-operation execution.
- Script-job and DB-operation repositories remain the bounded facades for
  contract lookup, lifecycle, artifact attachment, and Work Queue readback.
  They no longer count clean live completion as production evidence unless
  runtime tool trace artifacts are attached when trace evidence is required.
- Runtime tool traces persist bounded metadata only: approved handler or
  operation refs, lane/kind, status, duration, hashes, validation refs, byte
  counts, telemetry refs, and raw-storage flags.
- Script execution accepts approved handler ids; it does not accept arbitrary
  shell command payloads.
- DB operation execution accepts approved operation ids; it does not accept
  raw SQL/query/statement payload fields or raw DB row storage.
- Work Queue middleware readback surfaces script and DB operation
  `runtime-tool://...` invocation refs.
- RuntimeWorkerSupervisor script/DB middleware adapters are runtime-tool
  backed. They must invoke `script.execute` or `db_operation.execute` and
  complete with trace evidence; direct handler completion is not a production
  success path.
- Direct model-task supervisor completion without a `model.call` trace is
  diagnostic `needs_review`, not provider-call success.
- Legacy proof helpers are explicit proof-only paths:
  `ScriptJobWorkerAdapter`, `runScriptMiddlewarePilot`, and
  `runDbOperationMiddlewarePilot` fail unless the caller passes
  `proofOnly: true`.
- Model Memory runtime middleware bridge integration uses `model.call` and
  `db_operation.execute` for its Execution Platform evidence jobs. It no
  longer directly completes live provider/DB-operation evidence without
  runtime tool traces.
- The runtime toolification truth registry marks
  `script-db-operation-toolification` as `production_primary`.
- Dedicated-DB proof ran live script and DB operation completions through
  `script.execute` and `db_operation.execute`, accepted the adoption gate,
  and closed
  `openclaw-convergence.toolification-09-script-db-toolification` from
  runtime closeout evidence.

1d. **Closeout Toolification And Legacy Retirement** - complete 2026-05-16.

- `closeout.generate` is the canonical Runtime Tool-Call Kernel family for
  production model-authored Closeout Capsule generation.
- The tool wraps `ModelCloseoutCapsuleReporter`; closeout inputs are volatile
  executor-only data and are not persisted as raw prompt/provider content.
- Runtime traces store bounded closeout refs, hashes, model refs, task-success
  state, role/opportunity counts, timing, reason codes, and raw-storage flags.
- Degraded/system Closeout Capsules are diagnostic `needs_review` evidence and
  cannot satisfy clean success or toolification adoption-gate success.
- The production gateway runtime registers `closeout.generate` alongside
  scheduler tools.
- The dynamic coding-team graph closeout executor invokes `closeout.generate`
  when a Runtime Tool Kernel is present; missing closeout tool wiring is not a
  clean production success path.
- The generic workflow queued runner invokes `closeout.generate` when a
  Runtime Tool Kernel is present and fails closed when neither kernel nor
  model-authored reporter is configured.
- The runtime toolification truth registry marks
  `closeout-generate-toolification` as `production_primary`.
- Dedicated-DB proof made a real Codex app-server model call through
  `closeout.generate`, accepted the adoption gate, and closed
  `openclaw-convergence.toolification-10-closeout-generate-toolification`
  from runtime closeout evidence.

1e. **Work Queue Generated Item Lifecycle And Proof Child Cleanup** -
required before the next Product/Spec Planning proof.

- Runtime toolification proofs may generate diagnostic Work Queue children,
  but those children are not owner-planned work by default.
- Generated children must carry origin and terminal-policy metadata.
- Proof diagnostics and middleware fixtures are archived/debug-only after
  parent proof closeout or terminal proof failure.
- Real owner/runtime graph child work remains actionable when failed.
- Default active queue readback excludes proof diagnostics and middleware
  fixtures while admin/debug readback preserves evidence.
- The current leaked middleware live-completion items and Generic Workflow
  Runner retirement proof children must be cleaned through repository/server
  transitions before Product/Spec Planning is rerun.

2. **Cost-Aware Capability Policy** - complete 2026-05-15.
   - Extend the capability manifest with cost, expected strength, context
     capacity, ideal task size, tool access, failure/escalation rules, and
     evidence fit.
   - The orchestrator must choose the cheapest sufficiently capable next node
     that advances a commitment, reduces uncertainty, creates reusable
     context, or opens parallelism.
   - Expensive Codex/GPT 5.5 usage must include model-authored justification
     when cheaper or more specialized nodes were available.

   Implemented production pieces:
   - `RuntimeNodeCapabilityManifest` schema version
     `execution-platform.runtime-node-capabilities.v2` includes workflow
     support, role class, ideal/max task size, context capacity, expected
     strength/weaknesses, token/dollar cost class, parallelism, retry/repair
     traits, failure modes, evidence kinds, commitment-fit kinds, and default
     budget policy.
   - `CostAwareCapabilityUtilityDecision` validates selected capability,
     graph node kind, executor key, target commitments, utility rationale,
     cost rationale, duplicate-work rationale, expected evidence, downstream
     consumer, stop/escalation condition, and raw-storage flags.
   - Runtime Work Graph Scheduler can require cost-aware utility evidence for
     add-node, run-node, retry, and validation-repair decisions.
   - premium/broad Codex choices require `whyCheaperOptionsWereInsufficient`
     when cheaper same-workflow same-role capabilities are available.
   - production coding-team scheduler enables the policy and sends the
     manifest to the GPT 5.5 orchestrator.
   - scheduler prompt contracts now treat cost-aware low-level fields as
     runtime-owned. The model selects capability, target commitments, utility
     rationale, cost rationale, duplicate-work rationale, and stop/escalation
     condition; the runtime derives node kind, executor key, expected evidence,
     worker refs, and decision ids.
   - production model-agnostic/non-Codex capability choices require model
     qualification profile refs and evidence refs before selection.
   - Work Queue active graph progress readback surfaces selected capability,
     cost class, utility/cost rationale, cheaper-option rationale, and
     considered capability ids.
   - dedicated-DB proof rejected a broad premium first move, repaired to a
     context/Kimi/validation graph, satisfied Mission Ledger commitments from
     bounded evidence, and closed
     `openclaw-convergence.active-queue-50` through runtime closeout evidence.

3. **Scheduler Toolification And Split Planning/Execution** - complete
   2026-05-16.
   - Split graph planning from graph execution. No implementation may run
     until the decomposition graph is accepted.
   - Scheduler decisions are traced through Runtime Tool-Call Kernel
     invocations:
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
   - Complex graphs require edges or an explicit parallel-independent
     justification. Nodes without dependency/handoff structure do not count as
     a workflow.
   - Production `agent_team.coding` receives the scheduler tool kernel from
     the gateway runtime; tests and proof scripts may construct the same
     kernel explicitly.
   - Work Queue active graph readback includes scheduler phase, latest tool
     id, and runtime-tool invocation refs.

4. **Worker Tool Loops**
   - Codex and Kimi workers use runtime tools for inspect, plan, patch,
     validate, repair, scope expansion, progress emission, and final evidence
     handoff.
   - Kimi is one implementation lane on the Non-Codex File-Edit Worker Loop,
     not a proof-only worker path or broad one-shot patch oracle. It
     receives concrete file refs, context-scout handoff, exact edit objective,
     expected patch shape, validation command refs, and bounded repair turns
     before escalation.
   - This pass is complete. The non-Codex file-edit worker loop records
     runtime tool traces for `worker.file_context.inspect`,
     `worker.file_edit.plan`, `worker.file_edit.propose_patch`,
     `worker.file_edit.apply_patch`, `worker.validation.run`,
     `worker.validation.classify_failure`, `worker.file_edit.repair`,
     `worker.file_edit.escalate`, and `worker.evidence.handoff`.
   - Kimi attempts are atomic. Failed apply/no-op/validation attempts restore
     the pre-attempt snapshots before repair or escalation, so partial failed
     edits cannot leak into the main worktree.
   - Worker-loop v2 adds model-authored context expansion requests, context
     provide/deny tool traces, multi-step edit plans, validation repair after
     context expansion, and commitment-linked evidence claims. The Kimi lane
     has a larger bounded attempt budget so context expansion and one repair
     cycle can both complete in a single worker run.
   - Work Queue readback links closed items to their closeout runtime jobs and
     surfaces worker tool ids, invocation refs, changed-file refs, and
     validation refs.
   - Worker-internal retry is now classified before retry. Validation repair,
     stale patch refresh, provider no-content, provider timeout, and
     diagnostic-only repair turns produce canonical `RuntimeRepairClassification`
     refs, pass through the shared retry gate, and surface in Work Queue
     Kimi/non-Codex readback.
   - Model-agnostic worker-loop expansion completed on 2026-05-16. The
     non-Codex worker substrate now has a reusable specialization manifest
     and phase-event contract. Kimi implementation is the first production
     specialization. Non-Codex context scout, test writer, docs editor, and
     validation failure explainer are production-declared specializations on
     the same generic contract; the frontend editor is contract-only until
     UI/screenshot validation tools are wired.
   - Multi-model qualification completed on 2026-05-16. Kimi is
     production-qualified for `small_source_edit`; DeepSeek v4 Flash is
     production-qualified for `repo_context_scout` and
     `validation_failure_explanation`; DeepSeek v4 Pro remains candidate for
     `test_writing_edit` until it produces real source-edit evidence.
   - Non-Codex large-task decomposition completed on 2026-05-16. Complex
     coding missions must decompose into commitment-mapped child tasks before
     implementation. Broad Codex implementation cannot be the first move for
     multi-commitment work. Production non-Codex nodes must carry task
     family, selected model qualification profile, qualification evidence
     refs, exact objective, acceptance criteria, downstream consumer, and
     stop/escalation condition. Capability executor keys are honored during
     scheduler execution so specialized nodes run through their intended
     executors.
   - Worker phase emissions now cover loop start, planning, tool selection,
     tool execution, edit planning, terminal completion/needs-review, and
     ELI5 progress. Phase events are bounded runtime evidence and Work Queue
     readback input; they do not store raw prompts, raw responses, raw
     provider logs, or raw tool logs.

5. **Mission Ledger Evidence Claims And Finalization Handoff** - complete
   2026-05-16.
   - Every node result must claim which Mission Ledger commitment it advances.
   - Deterministic code validates evidence refs exist and are bounded. A
     model-authored evaluator judges sufficiency.
   - If Codex or another worker finishes but evidence cannot be mapped to
     commitments, the job terminalizes quickly as `needs_review` with the
     exact missing mapping instead of hanging or drifting into generic nodes.
   - Production `agent_team.coding` now sets
     `requireEvidenceClaimsForMissionLedger`. Node results without claims for
     their mapped commitments do not reach Mission Ledger evaluation.
   - The evaluator payload is claim-first: accepted evidence must come from
     `evidenceClaims`, while unclaimed output artifacts remain diagnostic
     context only.
   - Malformed evaluator output gets one bounded repair pass and then
     terminalizes as `needs_review` with a diagnostic artifact.
   - Dedicated-DB proof closed the Mission Ledger with explicit source-change,
     validation, readback, context, and review claims.

6. **Work Queue Tool/Event Readback** - complete 2026-05-16.
   - Work Queue readback surfaces active phase, current node, current tool
     event kind, role/model refs, objective, files touched, validation command,
     evidence produced, open commitments, and next decision.
   - App-server progress is surfaced as bounded owner-visible progress, not
     only stored as artifacts.
   - Owner progress readback now includes `activeGraphProgress` with evidence
     claim refs, accepted/rejected commitment ids, finalization state, latest
     tool event kind, scheduler tool traces, worker tool traces, and recent
     progress event refs.
   - The Work Queue UI detail view renders a Runtime graph progress section so
     the owner can see the active node, role, model, objective, selected tool,
     validation state, open commitment count, evidence claims, and worker
     tools without reading raw artifacts.

7. **Workflow Evidence Profiles And Tool Trace Readback Hardening** -
   complete 2026-05-16.
   - Workflow profiles are canonical production gates for workflow success.
   - `agent_team.coding` requires runtime graph evidence, scheduler tool
     traces, worker tool traces, source-change refs, validation refs, review
     refs, Work Queue readback refs, and model-authored closeout.
   - Generic queued workflow dispatch cannot succeed from closeout alone.
   - Work Queue readback surfaces profile id, status, accepted/missing
     evidence classes, reason codes, artifact refs, and deep-completion review
     requirements.
   - DB Work Queue item
     `openclaw-convergence.toolification-11-workflow-evidence-profiles-readback`
     closed from accepted adoption-gate evidence.

Only after these production-primary toolification passes and the canonical
workflow-runtime convergence block should the next Product/Spec Planning live
UX proof be treated as meaningful evidence.

## Post-Proof Toolification Passes

Before Product/Spec Planning proves the scheduler path, continue with:

- **Canonical Workflow Runtime Engine And Workflow Definition Registry**:
  make workflow definitions the production source for executable workflows
  and make the graph engine workflow-agnostic.
- **Coding Team Plugin Extraction From Dynamic Runner**: move
  coding-specific policy/executors out of the dynamic runner into the
  `agent_team.coding` workflow definition.
- **Generic Workflow Runner Production Retirement**: remove production
  completion behavior from the generic dispatcher so it cannot fake dynamic
  workflow success.

After Product/Spec Planning proves the scheduler path, continue with:

- **Memory, Retrieval, Context, And Proactivity Toolification**: convert
  capture, retrieval query construction, memory ranking, context pack
  assembly, opportunity-seed drafting, dedupe/cooldown, and queue candidate
  promotion into traced runtime operations.

## Utility Policy

The orchestrator must not ask only "which model is best?" For every next-node
decision it must weigh:

- expected quality gain.
- token and dollar cost.
- context-distribution value.
- qualification evidence for the selected model/worker/task family.
- role specialization.
- parallelism opportunity.
- redundancy penalty.
- evidence needed to close specific Mission Ledger commitments.
- failure probability and escalation cost.

This policy prevents Codex monopoly without forcing prompt theater. Kimi,
context scout, research, test, review, and observability nodes are called when
they are the cheapest sufficiently capable way to advance a commitment, reduce
uncertainty, create reusable context, or prove work.

## Tool Boundary

Models may request tools and author semantic judgments. Runtime code may:

- validate schema and required refs.
- reject unknown capabilities, invalid executor keys, bad dependencies,
  over-budget requests, authority violations, and raw-storage attempts.
- execute approved tools and record bounded traces.
- compile model-selected capabilities into canonical node envelopes.

Runtime code must not:

- infer natural-language intent from keyword forests.
- decide semantic usefulness from deterministic heuristics.
- inject fallback graphs when model planning fails.
- promote process completion to success without accepted commitment evidence.

## Live Proof Readiness

The Product/Spec Planning proof is blocked until runtime evidence shows:

- accepted decomposition graph before implementation.
- cost-aware capability selection with expensive-model justification.
- tool-call traces for scheduler decisions.
- Non-Codex File-Edit Worker Loop / Kimi implementation-lane attempt when a
  scoped edit is suitable. **Complete.**
- Codex progress events surfaced in Work Queue readback.
- node evidence claims mapped to Mission Ledger commitments. **Complete.**
- finalization timeout and `needs_review` handoff when evidence mapping fails.
  **Complete for claim/evaluator handoff; timeout behavior remains owned by
  runtime tool-call kernel.**
- no production fallback to regex routing, static graph injection, degraded
  closeout success, or generic broad implementation as first move for complex
  work.

## 2026-05-17 Worker Packet Toolification Hardening

The scheduler no longer relies on a lossy task summary as the only child
worker input. Mission Ledger commitments compile into `CommitmentWorkPacket`
records, context scout output can be passed as `ContextHandoffPacket`, and
non-Codex file-edit workers receive `ImplementationTaskPacket v2`.

This is the runtime boundary for future Kimi and model-agnostic worker
expansion:

- the orchestrator/model chooses objective, role rationale, commitment
  mapping, and human-readable success criteria.
- runtime compiles bounded packets and canonical node envelopes.
- Kimi/non-Codex adapters receive exact objective, target refs, allowed refs,
  validation refs, context packet refs, and acceptance criteria.
- adapter diagnostics record whether target refs, acceptance criteria, packet
  refs, JSON, diff, search/replace, context requests, and schema state were
  present.
- tool traces may not report graph edge creation as completed until the DB
  edge is actually accepted.

This does not replay the Product/Spec Planning proof. It removes one class of
schema/contract choke before the next proof: child agents now receive the
runtime-owned work packets they need instead of being asked to infer work from
generic prompt summaries.

## Context Supply Chain Tools

The scheduler-backed coding-team path uses `source_prompt.context` runtime
tools to prevent downstream workers from being starved of the original owner
intent while preserving bounded-storage policy.

Runtime tools:

- `source_prompt.index`: creates bounded section refs and summaries for the
  resolved source prompt.
- `source_prompt.request_excerpt`: records a child-worker request for a
  specific prompt section.
- `source_prompt.provide_excerpt`: records that a bounded excerpt was provided
  as volatile model input.
- `source_prompt.deny_excerpt`: records that a request could not be satisfied.
- `context_scout.plan`: records the model-authored context objective,
  commitment mapping, and requested context questions.
- `context_scout.search_repo`: records bounded repo candidate refs supplied to
  the scout.
- `context_scout.read_file_refs`: records verified file refs and evidence
  hashes without raw file content.
- `context_scout.inspect_tests`: records validation-oriented context findings.
- `context_scout.request_prompt_excerpt` and
  `context_scout.receive_prompt_excerpt`: bridge source-prompt excerpt
  requests into the context-scout tool loop.
- `context_scout.verify_refs`: records runtime ref verification and rejected
  refs.
- `context_scout.review_sufficiency`: records model-authored context
  sufficiency status.
- `context_scout.emit_handoff_packet`: records accepted handoff packet refs.
- `context_scout.request_repair`: records bounded repair instructions when
  context is weak.

Contracts:

- `SourcePromptContextIndex` stores prompt hash, length, resolution status,
  bounded section refs, section summaries, reason codes, and raw-storage flags.
- `SourcePromptExcerptDecision` stores request id, section ref, excerpt ref,
  excerpt hash, excerpt length, bounded summary, reason codes, and
  raw-storage flags.
- `ContextHandoffPacket` is the implementation-facing output from context
  scout. It carries verified file refs, recommended edit points, patterns,
  risks, validation suggestions, limitations, and a bounded implementation
  handoff summary.
- `ContextScoutToolLoopRun` is the production context-scout evidence packet.
  It binds tool invocation refs, verified/rejected refs, source-prompt excerpt
  refs, sufficiency review, context handoff packet ref/hash, and raw-storage
  flags.

Execution rules:

- context scout receives CommitmentWorkPackets plus the source-prompt context
  index.
- context scout may request bounded excerpts; it then receives one follow-up
  turn with the excerpts as volatile input.
- implementation nodes that require upstream context handoff must not proceed
  without an accepted `ContextScoutToolLoopRun`. A standalone
  `ContextHandoffPacket` is not enough.
- Work Queue readback must surface source-prompt status, excerpt decisions,
  context scout tool-loop refs, runtime tool refs, verified/rejected file
  refs, context handoff refs, sufficiency summary, and blockers.
- legacy `agent_team.context_scout` pilot artifacts are diagnostic-only and
  cannot count as production success evidence.

This is not deterministic semantic judgment. Runtime validates only schema,
refs, bounds, raw-storage flags, and whether required handoff evidence exists.
Model-authored context/review roles judge usefulness.
