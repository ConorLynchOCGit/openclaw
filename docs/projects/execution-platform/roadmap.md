# Execution Platform Roadmap

## Dedicated DB Boundary

The live Execution Platform substrate now uses the dedicated
`execution_platform` database. Current Work Queue planning/readback state has
been copied there as bounded DB state, so active queue readback is no longer
on the Model Memory fallback boundary. Runtime jobs remain lifecycle truth.

## Runtime Toolification Queue

The active queue is reprioritized around a pre-proof toolification block.
Product/Spec Planning remains the next major live UX proof, but it is blocked
until the runtime path can prove real utility-aware delegation and commitment
evidence closure.

Pre-proof items now recorded in the DB Work Queue:

1. `openclaw-convergence.toolification-01-runtime-tool-call-kernel` - Runtime Tool-Call Kernel And Trace Store. **Complete.**
2. `openclaw-convergence.active-queue-50` - Cost-Aware Capability Policy. **Complete.**
3. `openclaw-convergence.active-queue-22` - Scheduler Toolification And Split Planning/Execution. **Complete.**
4. `openclaw-convergence.active-queue-21` - Worker Tool Loops And Non-Codex File-Edit Worker / Kimi Implementation Lane Hardening. **Complete.**
   4a. `openclaw-convergence.non-codex-worker-loop-v2` - Non-Codex Worker Loop v2 context expansion, multi-step edit, repair, and evidence-claim proof. **Complete.**
   4b. `openclaw-convergence.non-codex-tool-using-worker` - Model-Agnostic Non-Codex Tool-Using Worker Loop. **Complete.**
   4c. `openclaw-convergence.non-codex-large-task-decomposition` - Non-Codex Large-Task Decomposition And File-Edit Qualification. **Complete.**
5. `openclaw-convergence.toolification-05-mission-ledger-evidence-finalization` - Mission Ledger Evidence Claims And Finalization Handoff. **Complete.**
6. `openclaw-convergence.toolification-06-work-queue-tool-event-readback` - Work Queue Tool/Event Readback. **Complete.**

Proof item:

7. `openclaw-convergence.active-queue-34` - Product/Spec Planning Production Upgrade.

Post-proof items:

8. `openclaw-convergence.active-queue-31` - Memory, Retrieval, Context, And Proactivity Toolification.
9. `openclaw-convergence.active-queue-49` - Closeout Toolification And Legacy Retirement Soak.

## Product/Spec Planning Production Upgrade

Delivered in the current slice:

- scheduler-backed Product/Spec Planning registration and generic-runner rejection
- executable planning node capability manifest for orchestrator, research, capsule, human decision, proposal, compiler, and closeout roles
- scheduler policy that requires planning orchestrator first for Product/Spec Planning runtime graphs
- bounded Product/Spec Planning contracts for ResearchBrief, Planning Capsule, human decisions, and ActionGraphProposal compile readiness
- Work Queue readback for planning capsule refs, research refs/influence, stale assumptions, human decision state, action graph proposals, child summaries, compile readiness, validation, limitations, and ELI5 progress
- proposal-only boundary: child jobs remain unexecuted until a later compile/authority pass

## Cost-Aware Capability Policy

Completed on 2026-05-15.

- capability manifest v2 now records role class, workflow support, ideal task
  size, context capacity, expected strength, cost class, evidence fit, budget
  policy, failure modes, and escalation/repair guidance
- Runtime Work Graph Scheduler can require cost-aware utility evidence for
  add/run/retry/repair decisions
- production coding-team runner has cost-aware policy enforcement enabled
- orchestrator prompt contract requires utility/cost evidence and premium
  Codex justification
- Work Queue active graph progress readback surfaces selected capability,
  cost class, utility rationale, cost rationale, cheaper-option rationale,
  and considered capabilities
- live dedicated-DB proof closed
  `openclaw-convergence.active-queue-50` from accepted runtime closeout
  evidence

## Scheduler Toolification And Split Planning/Execution

Completed on 2026-05-16.

- scheduler decisions are traced through the Runtime Tool-Call Kernel using
  explicit scheduler tool ids for decomposition, node/edge creation,
  decomposition acceptance/rejection, next-node selection, human decision,
  needs-review, closeout request, and `worker.invoke`
- the production gateway runtime registers scheduler tools and passes the
  kernel into live `agent_team.coding` graph execution
- Work Queue active graph progress readback includes scheduler phase, latest
  scheduler tool id, and runtime-tool invocation refs
- live dedicated-DB proof executed context, implementation, and validation
  nodes through traced runtime operations and closed
  `openclaw-convergence.active-queue-22` through accepted closeout evidence

## Worker Tool Loops And Non-Codex File-Edit Worker

Completed on 2026-05-16.

- the generic file-edit worker adapter records Runtime Tool-Call Kernel traces
  for inspect, plan, patch proposal, patch apply, validation, repair/failure
  classification, escalation, and bounded evidence handoff
- Kimi is a production implementation lane on that generic adapter, not a
  proof-only micro-agent or one-shot patch oracle
- Kimi receives bounded file snapshots plus an orchestrator-style task packet
  with exact objective, target refs, context handoff, expected output,
  acceptance criteria, validation refs, and repair feedback
- failed Kimi attempts are atomic: patch/apply or validation failure restores
  the pre-attempt file snapshots before a retry or escalation
- Work Queue runtime readback links closed items back to the closeout runtime
  job and surfaces worker tool traces, changed-file refs, and validation refs
- live OpenRouter/Kimi proof edited
  `extensions/execution-platform/src/codex-bridge/kimi-live-source-edit-proof.ts`
  and its focused test, ran validation, recorded worker tool invocations, and
  closed `openclaw-convergence.active-queue-21` from accepted evidence
- worker-loop v2 proof then extended the lane with bounded context expansion
  requests, context provide/deny tool traces, multi-step edit plans,
  validation repair after context expansion, and commitment-linked evidence
  claims. Live OpenRouter/Kimi proof closed
  `openclaw-convergence.non-codex-worker-loop-v2` from accepted runtime
  closeout evidence.
- model-agnostic expansion then promoted the non-Codex worker lane to a
  reusable specialization contract with phase emissions. Kimi is the first
  production implementation specialization; non-Codex context scout, test
  writer, docs editor, and validation failure explainer are declared on the
  same substrate. Live OpenRouter/Kimi proof emitted 15 worker phase events,
  used repo search/read/test-inspection tools, repaired validation in the same
  loop, and closed `openclaw-convergence.non-codex-tool-using-worker` from
  accepted runtime closeout evidence.
- large-task decomposition hardening then made qualified non-Codex use a
  scheduler obligation instead of prompt theater. Complex coding missions now
  reject broad Codex-first plans, preserve task-family and model
  qualification refs through the decision compiler, route specialized
  capability executor keys to their intended executors, and require
  commitment-mapped non-Codex child tasks with handoff edges. The dedicated-DB
  proof executed context, Kimi implementation, validation explanation, and
  review nodes, materialized four Work Queue children, and closed
  `openclaw-convergence.non-codex-large-task-decomposition` from accepted
  runtime closeout evidence.

Mission Ledger Evidence Claims And Finalization Handoff and Work Queue
Tool/Event Readback completed on 2026-05-16.

- scheduler nodes now return explicit commitment-linked evidence claims.
- production `agent_team.coding` requires those claims before Mission Ledger
  evaluation can close work.
- the Mission Ledger evaluator accepts claimed evidence only and has one
  bounded repair attempt for malformed evaluator output.
- Work Queue owner readback and UI detail show active graph/tool progress,
  evidence claim refs, open commitments, current node, role/model, tool id,
  validation state, and next decision.
- live dedicated-DB proof closed both queue items from accepted runtime
  closeout evidence using runtime job
  `mission-ledger-tool-readback-1778907616712-job`.

Next pre-proof item: none. Next proof item: Product/Spec Planning Production
Upgrade live UX proof.
