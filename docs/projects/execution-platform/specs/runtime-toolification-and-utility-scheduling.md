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
   - adoption boundary map now states which surfaces are kernel-primary and
     which remain queued for later scheduler, worker, memory, closeout, and
     Work Queue readback toolification.

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

Only after these six passes should the next Product/Spec Planning live UX
proof be treated as meaningful evidence.

## Post-Proof Toolification Passes

After Product/Spec Planning proves the scheduler path, continue with:

- **Memory, Retrieval, Context, And Proactivity Toolification**: convert
  capture, retrieval query construction, memory ranking, context pack
  assembly, opportunity-seed drafting, dedupe/cooldown, and queue candidate
  promotion into traced runtime operations.
- **Closeout Toolification And Legacy Retirement Soak**: keep the
  human-readable closeout model-authored, but toolify evidence extraction,
  opportunity-seed extraction, and closeout acceptance. Remove production
  access to JSON parser fallbacks, static runners, degraded closeout success,
  and compatibility-only proof surfaces.

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
