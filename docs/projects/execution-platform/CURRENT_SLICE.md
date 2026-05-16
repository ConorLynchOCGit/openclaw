# Current Slice

## Dedicated Runtime DB Boundary

Update on 2026-05-15: the live Execution Platform runtime/Work Queue substrate
has been moved off Model Memory reuse and onto a dedicated
`execution_platform` database.

- source: `config.env.vars.EXECUTION_PLATFORM_DATABASE_URL`
- boundary: `dedicated_execution_platform_db`
- readiness: `ready`
- Work Queue live linkage may attach
- gateway restarted after config change; local/Tailscale health passed

This closes the prior Model Memory fallback identity blocker. The next
execution focus remains the Runtime Toolification pre-proof queue.

## Runtime Toolification Pre-Proof Queue

The current execution focus is no longer another immediate Product/Spec
Planning proof. The next queue block hardens the runtime path that proof
depends on:

- runtime tool-call kernel and traces. **Complete.**
- cost-aware capability policy. **Complete.**
- scheduler toolification with split planning/execution. **Complete.**
- worker tool loops for Kimi/Codex. **Complete, with worker-loop v2 proof.**
- non-Codex large-task decomposition and file-edit qualification. **Complete.**
- Mission Ledger evidence claims and finalization handoff. **Complete.**
- Work Queue tool/event readback. **Complete.**

Completion of those pre-proof items is required before rerunning the long
Product/Spec Planning prompt through the live UX.

Runtime Tool-Call Kernel And Trace Store completed on 2026-05-15. The next
Cost-Aware Capability Policy completed on 2026-05-15. A follow-up kernel
hardening proof also passed: executor timeout/abort, explicit cancel, terminal
idempotency, cursor pagination, scoped retention pruning, and adoption boundary
mapping are now production kernel capabilities.

Scheduler Toolification And Split Planning/Execution completed on
2026-05-16. Runtime scheduler decisions now emit Runtime Tool-Call Kernel
traces for decomposition, graph node/edge creation, decomposition acceptance,
next-node selection, human/needs-review/closeout requests, and `worker.invoke`
node execution. The live gateway runtime constructs and passes the scheduler
tool kernel into `agent_team.coding`, and Work Queue active graph readback
shows scheduler tool phase, latest tool id, and invocation refs.

The proof run closed DB Work Queue item `openclaw-convergence.active-queue-22`
from accepted runtime closeout evidence. The next active DB Work Queue item is
Worker Tool Loops And Non-Codex File-Edit Worker / Kimi Implementation Lane
Hardening.

Worker Tool Loops And Non-Codex File-Edit Worker / Kimi Implementation Lane
Hardening completed on 2026-05-16. The non-Codex file-edit worker loop now
records first-class Runtime Tool-Call Kernel traces for file context
inspection, edit planning, patch proposal, patch application, validation,
repair/failure classification, escalation when needed, and final bounded
evidence handoff. The Kimi lane receives bounded file snapshots and
orchestrator-style microtask packets, retries with bounded failure feedback,
and rolls failed attempts back before repair so partial edits cannot leak into
the main worktree. A live OpenRouter/Kimi proof made scoped source edits,
passed focused validation, and closed DB Work Queue item
`openclaw-convergence.active-queue-21` from accepted closeout evidence.

The next active DB Work Queue item is Mission Ledger Evidence Claims And
Finalization Handoff.

Non-Codex Worker Loop v2 completed on 2026-05-16. The Kimi lane now supports
model-authored bounded context expansion requests, multi-step edit plans,
validation-driven repair after context expansion, and commitment-linked
evidence claims. A live OpenRouter/Kimi proof requested bounded context,
edited `kimi-live-source-edit-proof.ts` and its focused test, repaired after
a controlled validation failure in the same worker run, emitted runtime tool
traces for context/plan/patch/validation/repair/evidence, and closed DB Work
Queue item `openclaw-convergence.non-codex-worker-loop-v2` from accepted
runtime closeout evidence.

Model-Agnostic Non-Codex Worker Loop completed on 2026-05-16. The worker
substrate now has a generic specialization manifest and phase-event contract,
with Kimi as the first production implementation specialization. The live
OpenRouter/Kimi proof used repo search/read/test-inspection tools, emitted 15
bounded phase events, applied a fresh source edit, repaired after a controlled
validation failure, passed focused validation, and closed DB Work Queue item
`openclaw-convergence.non-codex-tool-using-worker` from accepted runtime
closeout evidence.

Model-Agnostic Worker Multi-Model Qualification completed on 2026-05-16. The
generic worker substrate now has a live qualification matrix instead of
implicit trust by model name. Kimi is production-qualified for
`small_source_edit`; DeepSeek v4 Flash is production-qualified for
`repo_context_scout` and `validation_failure_explanation`; DeepSeek v4 Pro is
only candidate for `test_writing_edit` until it produces real source-edit
evidence. Cost-aware scheduler decisions now require model qualification
profile/evidence refs for production model-agnostic worker selection. DB Work
Queue item `openclaw-convergence.model-agnostic-worker-qualification` closed
from accepted runtime closeout evidence.

Non-Codex Large-Task Decomposition And File-Edit Qualification completed on
2026-05-16. The scheduler now has a reusable non-Codex decomposition policy
that rejects broad Codex implementation as the first move for complex coding
missions, requires qualified task-family metadata/evidence for production
non-Codex selections, preserves qualification fields through the orchestrator
decision compiler, and uses capability executor keys so specialized nodes can
run through their actual executors instead of generic role fallbacks. The
dedicated-DB proof rejected an invalid broad Codex-first plan, repaired to a
four-node graph with context, Kimi implementation, validation explanation, and
review nodes, recorded three handoff edges, materialized four DB Work Queue
child items, and closed DB Work Queue item
`openclaw-convergence.non-codex-large-task-decomposition` from accepted
runtime closeout evidence.

Mission Ledger Evidence Claims And Finalization Handoff and Work Queue
Tool/Event Readback completed on 2026-05-16. Scheduler node results now carry
commitment-linked evidence claims, production `agent_team.coding` requires
those claims for Mission Ledger evaluation, and Work Queue owner readback
renders runtime graph/tool progress from DB-backed scheduler events. The
dedicated-DB proof closed
`openclaw-convergence.toolification-05-mission-ledger-evidence-finalization`
and `openclaw-convergence.toolification-06-work-queue-tool-event-readback`
from accepted runtime closeout evidence.

The next active DB Work Queue item is Product/Spec Planning Production
Upgrade live UX proof. Additional model qualification items remain for
docs/spec edit, test-writing edit, and frontend scoped edit lanes before
those roles can be selected as production file-edit workers.

## Product/Spec Planning Production Runtime Surface

This slice upgrades Product/Spec Planning from protected registry/proof wiring to production scheduler/readback behavior.

Scope in this repo pass:

- scheduler policy: Product/Spec Planning executable graph work starts with `planning_orchestrator`
- contract policy: ResearchBriefs carry bounded source/citation/assumption/freshness/staleness evidence without raw storage
- readback policy: Work Queue owner readback shows capsule, research, human decision, action proposal, compile readiness, validation, Mission Ledger, active graph/progress, limitations, and ELI5 state
