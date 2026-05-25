# Native Agentic Coding Harness Convergence

Date: 2026-05-18

Status: active architecture update after Product/Spec Planning replay
diagnostics.

## Problem

The Product/Spec Planning replay finally produced a valid post-synthesis graph,
but the runtime still selected one broad first implementation node. The
mechanical parallel frontier scheduler exists, but the accepted graph did not
expose a useful runnable frontier. A single foundation node became the
dependency bottleneck, so runtime execution remained serial and biased toward
Codex.

The replay also exposed a separate supervision/readback problem. The bounded
artifacts showed that the post-synthesis graph model call finished in roughly
four minutes and the node-selection call finished shortly after, but the local
process still appeared to be running. That means the replay/app-server
supervision layer can make completed work look opaque or hung.

The architectural gap is not lack of native OpenClaw primitives. The platform
already has the pieces needed for a Claude Code/Codex-class harness:

- Runtime Work Graph.
- Generic Orchestration Runtime.
- Runtime Tool-Call Kernel and trace store.
- RuntimeWorkerSupervisor leases, retries, timeout, cancellation, and job
  lifecycle.
- Work Queue event store, delta/readback APIs, and control bridge.
- Context Engine and Model Memory context-pack registry.
- provider stream wrappers for OpenAI, OpenRouter, Moonshot/Kimi, tool
  streams, reasoning compatibility, and prompt-cache behavior.
- source-prompt excerpt tools.
- validation/QA runtime tools.
- closeout generation and closeout finalization runtime tools.
- script, DB-operation, and model-task middleware toolification.
- skill inventory and skill trigger surfaces.

The gap is that several coding-team stages still behave like bespoke harnesses
or large JSON decisions rather than native OpenClaw agent/tool loops.

## Target Architecture

OpenClaw should converge on one native agentic coding harness:

1. Runtime jobs own lifecycle.
2. Runtime Work Graph owns orchestration.
3. Runtime Tool-Call Kernel owns side effects, model-call spans, tool-call
   spans, timeouts, cancellation, and bounded trace evidence.
4. RuntimeWorkerSupervisor owns worker leases, retries, cancellation,
   heartbeat, and terminalization.
5. Work Queue owns operator projection, live readback, event deltas, and
   control commands.
6. Context Engine and Model Memory context packs supply bounded reusable
   context.
7. Provider stream wrappers own provider/model-specific streaming, reasoning,
   tool, and cache behavior.
8. Workflow definitions and plugins own workflow-specific role/capability/
   evidence policy.
9. Models decide semantic meaning, usefulness, delegation, and sufficiency.
10. Runtime owns schema, refs, bounds, authority, lifecycle, persistence,
    budgets, locks, and executable graph compilation.

No production coding-team success path should depend on a proof-only runner,
opaque app-server process, generic role report, one-shot patch oracle, bare
JSON decision, degraded closeout, or Work Queue lifecycle mutation outside
runtime evidence.

## Required Pre-Product/Spec Work

These items block finishing the Product/Spec Planning proof because the current
proof repeatedly reaches their failure class.

### 0. Non-Codex Tool Worker Runtime And Patch-JSON Retirement

Update, 2026-05-18: the Product/Spec boundary replay reached real
implementation nodes and invoked the Kimi/non-Codex lane, but the lane still
depended on a giant JSON patch proposal. The model returned non-JSON output
and the adapter failed at parse time before runtime-owned file inspection,
editing, validation, repair, or evidence emission could run.

This is now a pre-proof blocker. The production non-Codex lane must be a real
runtime tool worker, not a one-shot patch oracle:

- model chooses the next tool action, edit intent, failure meaning, repair
  strategy, and escalation rationale.
- runtime owns file reads/writes, patch application, validation execution,
  refs, schemas, evidence classes, persistence, budgets, locks, lifecycle, and
  raw-storage policy.
- provider/model profiles must pass qualification before scheduler selection.
- Work Queue readback must show worker tool progress, context requests, edit
  plans, patch results, validation state, repair state, evidence claims, and
  escalation reasons.
- the old giant patch proposal adapter is test/compat only and cannot produce
  production clean success.

Source-of-truth spec:
[Non-Codex Tool Worker Runtime](/projects/execution-platform/specs/non-codex-tool-worker-runtime).

### 1. Supervision And Model-Call Progress Convergence

The replay/gateway/app-server path must surface model-call progress and exit
state accurately.

Implementation status, 2026-05-18:

- Dynamic coding-team model calls now support a canonical bounded model-call
  progress span with `spanId`, phase, model/provider refs, input hash,
  response hash, response shape summary, timeout, elapsed time, heartbeat
  count, and raw-storage false flags.
- Codex app-server JSON scheduler calls, Mission Ledger calls, packet-review
  calls, Mission Ledger evaluation calls, context-synthesis calls, and role
  model calls emit those spans into `agent_team.scheduler_progress`.
- Product/Spec boundary replay emits the same model-call progress events and
  explicitly closes the Codex app-server client after replay model calls so a
  completed result artifact does not leave the replay looking live forever.
- `RuntimeWorkerSupervisor` records adapter start, completion, and failure
  events around adapter execution so claimed jobs have visible supervision
  state before or after graph-level emissions.
- Work Queue owner readback now exposes `activeGraphProgress.modelCallProgress`
  with the active span, phase, elapsed time, timeout, model/provider, response
  shape summary, and bounded diagnostic reason codes.
- Span-level observability now generalizes this into `RuntimeExecutionSpan`
  evidence across scheduler progress, Runtime Tool Kernel traces,
  RuntimeWorkerSupervisor adapter phases, validation commands, boundary
  replay, and closeout finalization. Work Queue readback exposes
  `activeGraphProgress.spanProgress`, and closeout finalization requires
  runtime execution span refs before clean acceptance.

Update, 2026-05-19:

- Repair Classification Before Retry is wired into the production scheduler.
  Failed or needs-review node outcomes produce a bounded
  `RuntimeRepairClassification` through the scheduler runtime tool path before
  retry, repair, escalation, or upstream replay can proceed.
- Needs-review retries without an accepted target classification ref are
  structurally rejected. Terminal/no-retry classifications cannot be retried as
  same-node work.
- Work Queue active graph readback surfaces the latest repair classification
  beside span progress, so operators can see what failed, why the selected
  boundary is the next repair point, what refs are preserved, and what action
  comes next.

Production requirements:

- every orchestrator, worker, closeout, validation, and replay model call runs
  through a runtime model-call span with start, heartbeat, first-event when
  available, completion, timeout, cancel, response-shape summary, payload
  hash, response hash, model/provider refs, budget, elapsed time, and raw
  storage flags.
- replay harnesses exit when result artifacts are written or explicitly detach
  child handles.
- app-server handles are closed or supervised so completed replays cannot look
  live forever.
- Work Queue readback shows whether the active state is a model call, runtime
  tool call, worker tool loop, graph scheduling step, validation command, or
  process-supervision cleanup.
- stale-progress detection distinguishes "model still running" from "result
  written but process did not exit."

This should reuse Runtime Tool-Call Kernel, RuntimeWorkerSupervisor, provider
stream wrappers, Work Queue events, and existing bounded artifact policy.

### 2. Post-Synthesis Graph Optimizer And Parallel Supersteps

The runtime must not accept a post-synthesis graph that serializes independent
work behind a broad foundation implementation node.

Implementation status, 2026-05-18:

- Runtime Work Graph scheduling now computes dependency layers and a bounded
  runnable-frontier readback after graph updates.
- Dependency-ready nodes run as runtime-selected supersteps instead of forcing
  a new orchestrator model call for obvious graph execution choices.
- Supersteps respect `maxParallelNodeExecutions` and conflict domains for file
  write scope, validation scope, runtime job refs, Work Queue refs, human
  decision refs, explicit no-parallel refs, and graph dependencies. Provider
  /model capacity is enforced as a counted budget, not a conflict mutex, so
  independent peers can run up to the declared provider limit.
- Successful sibling branches remain completed while failed or needs-review
  branches return to the orchestrator for repair/escalation.
- Production coding-team plugins defer closeout while executable graph nodes
  remain planned or need review.
- Post-synthesis graph quality checks now reject broad Codex dependency
  chokepoints where an `implementation_complex` node structurally gates most
  downstream work.
- Work Queue readback now surfaces `activeGraphProgress.parallelFrontier`,
  including superstep, ready/selected/running/completed/blocked/needs-review
  nodes, skipped conflict reasons, dependency layer count, join-ready nodes,
  context synthesis refs, implementation-group count, and provider concurrency
  budget key/limit/runnable/selected/skipped nodes when available.

Production requirements:

- after accepted context synthesis, compile a dependency-layered graph from
  implementation groups, dependency map, parallelism plan, target refs,
  worker-fit rationale, and risks.
- reject foundation chokepoints where one `implementation_complex` node gates
  most downstream work unless the model-authored structure review proves the
  prerequisite is genuinely indivisible.
- split unavoidable shared foundation work into the smallest scaffold/contract
  node possible, then expose independent implementation leaves.
- runtime computes runnable frontiers after every graph update.
- runtime partitions frontiers by conflict domain: file write scope,
  validation scope, provider/model concurrency, DB/runtime lifecycle refs,
  Work Queue refs, human decision refs, and explicit graph dependency edges.
- runtime applies provider/model concurrency as counted budget selection,
  allowing safe bounded parallelism rather than serializing all same-provider
  nodes.
- non-conflicting nodes run concurrently as a superstep.
- successful sibling branches remain checkpointed; failed branches repair or
  retry without rerunning accepted siblings.
- Work Queue readback shows parallel group id, ready nodes, running nodes,
  conflict locks, skipped nodes, join readiness, failed branches, and next
  scheduler decision.

The model may propose dependency/parallelism rationale. Runtime owns the actual
parallel execution legality, locks, budgets, and idempotency.

### 3. Non-Codex Worker Harness Convergence

Kimi and future non-Codex workers should be production coding lanes, not patch
oracles or proof lanes.

Update, 2026-05-19: the first massive-leap gate split non-Codex worker model
policy into controller, context-decision, patch, validation-repair, evidence,
and escalation slots. Production worker loops now block unqualified Kimi
controller use before provider calls, preserve Kimi as a bounded
reasoning-none patch author, and expose slot/gate state in bounded readback.

Production requirements:

- worker execution uses a native OpenClaw tool loop: inspect, request context,
  read files, inspect tests, plan edits, propose patch, apply patch atomically,
  run validation, classify failure, repair/escalate, emit evidence claims.
- worker inputs use `ImplementationTaskPacket` plus context handoff refs,
  source prompt excerpt refs, validation refs, target refs, allowed scope,
  acceptance criteria, stop/escalation conditions, and budget policy.
- `ImplementationTaskPacket v3` is the canonical non-Codex implementation
  handoff. It includes worker-selection rationale, expected output, allowed
  and denied file refs, context packet refs, source-prompt excerpt refs,
  context-synthesis refs, prior node output refs, expected evidence claim
  kinds, stop/escalation rules, and budget policy refs. Runtime owns packet
  schema, refs, bounds, raw-storage flags, and worker-readiness validation.
- provider profiles carry reasoning policy, output budget, context budget,
  max turns, max tool calls, patch size limits, validation capability, known
  failure modes, and escalation rules.
- Kimi/OpenRouter reasoning output is constrained for patch-generation turns
  so reasoning budget cannot starve final structured output.
- every worker phase emits bounded Work Queue/runtime progress.
- useful model output is parsed through tolerant, model-output diagnostics
  before deciding model failure.
- worker success requires changed-file refs or accepted no-op evidence,
  validation refs where required, and commitment-mapped evidence claims.

This should reuse the existing model-agnostic worker loop, provider stream
wrappers, Runtime Tool-Call Kernel, context-pack registry, validation tools,
and Mission Ledger evidence-claim contract.

Implementation status on 2026-05-18:

- `ImplementationTaskPacket v3` was expanded and validated before non-Codex
  worker/provider calls.
- production `agent_team.coding` Kimi nodes build the packet from scheduler
  metadata, context handoffs, source-prompt excerpt refs, context-synthesis
  refs, prior node outputs, approved repo scope, and approved validation
  commands.
- the model-agnostic file-edit adapter passes the packet to the
  `NonCodexToolUsingWorkerLoop` when the runtime tool kernel is available.
- missing context is non-terminal and routes to explicit bounded context
  acquisition; missing objective/scope/criteria blocks before provider calls.
- Kimi provider profile now records task families, ideal task size, context
  and output budgets, reasoning mode, JSON reliability mode, failure modes,
  and escalation rules. Patch-generation turns exclude provider reasoning
  output so response budget is preserved for structured edit output.
- Work Queue scheduler progress projects non-Codex worker tool/evidence refs,
  context request refs, edit step ids, changed-file refs, validation refs,
  and commitment evidence claim refs.

Implementation status on 2026-05-19:

- non-Codex file mutation now uses `EditTransactionEngine`; clean production
  completion requires closed edit transaction evidence, validation refs, and
  commitment-linked evidence claims.
- Work Queue readback can show edit transaction refs, phase/status, repair
  count, changed-file refs, validation refs, and evidence refs.

### 4. Validation Executor And Repair Loop Convergence

Validation must be a real execution/evaluation lane.

Implementation status on 2026-05-19:

- validation nodes now build canonical `ValidationTaskPacket` v2 before any
  command execution. The packet records workflow id, Mission Ledger refs,
  Commitment Work Packet refs, context snapshot refs, commitment ids, exact
  validation objective, runtime-owned approved command definitions, command
  summaries, target refs, changed file refs, context refs, implementation
  output refs, expected evidence classes, failure mapping expectations, repair
  handoff expectations, downstream consumer, timeout/budget refs, stop
  conditions, and raw-storage false flags.
- invalid validation packets stop as `needs_review` before command execution,
  instead of treating missing commands or commitments as a passing validation
  lane.
- validation execution uses the validation/QA Runtime Tool-Call Kernel path
  for plan, command selection, run-command intent, result summary, failure
  classification, failure-to-commitment mapping, repair plan, coverage review,
  and evidence acceptance.
- runtime derives approved command refs and command definitions from
  scheduler-approved validation sources. The model does not invent command
  authority, and arbitrary shell-shaped strings do not become approved
  validation refs.
- failed validation now creates bounded repair handoff artifacts, same-job
  `repair` graph nodes, and `validation_failed` / `repair_requested` graph
  edges so repair remains in the Runtime Work Graph instead of becoming a
  terminal artifact-only note.
- validation/QA evidence packets now carry task packet refs, failure
  classification refs, commitment-map refs, repair plan refs, repair node
  refs, and repair handoff refs.
- Work Queue readback surfaces validation task packet refs, command refs,
  command summaries, current command ref/status, repair node refs, repair
  handoff refs, tool invocation refs, result refs, blocking commitment ids,
  evidence packet refs, and the owner-readable latest validation summary.

Production requirements:

- validation plans are model-authored but command execution is runtime-owned.
- approved command refs execute through the validation/script runtime tool
  boundary.
- validation results are summarized with bounded refs, not raw logs.
- failures map to commitment ids.
- recoverable failures return repair tasks to the scheduler within the same
  runtime job.
- validation workers can be non-Codex/model-agnostic when qualified.
- final success is impossible without accepted validation evidence for
  commitments that require validation.

This should reuse validation/QA runtime tools, script runtime tools, Mission
Ledger evidence claims, and closeout finalization gates.

### 5. Boundary Replay Checkpoint Completion

Replayability is part of production hardening, not a separate proof shortcut.

Production requirements:

- checkpoint refs exist for router, Mission Ledger, packet authoring, packet
  review, context scout, context synthesis, graph compile, node selection,
  worker execution, validation, review, readback, and closeout.
- replay uses the same runtime repositories, workflow definitions, scheduler,
  capability registry, tool kernel, and node executors as live UX.
- replay may inject persisted upstream artifacts, but it must not use a
  parallel proof-only scheduler or worker.
- each replay result records whether the reused upstream boundary was accepted,
  stale, or insufficient.
- replay artifacts are bounded and safe: hashes, refs, summaries, reason
  codes, no raw prompts/responses/logs.

Implementation status on 2026-05-18:

- `BoundaryReplayService` is the canonical checkpoint/plan service for this
  lane. It builds bounded checkpoint artifacts, validates replay policy and
  raw-storage/authority flags, records runtime job artifacts, records Runtime
  Work Graph checkpoints, emits replay events, lists checkpoints, and compiles
  replay plans.
- Checkpoint recording is idempotent for repeated boundary writes: existing
  checkpoint artifacts and graph checkpoints are reused rather than creating
  duplicate graph checkpoint primary keys.
- Replay plans require the requested boundary plus required upstream
  checkpoints to be accepted, fresh, identity-matched, and safe before
  `status: accepted`; otherwise replay is `needs_review` or `blocked`.
- Production `agent_team.coding` records replay checkpoints for router payload,
  Mission Ledger, CommitmentWorkPacket author/review, context scout, context
  synthesis, graph compile, worker execution, validation repair, review/QA,
  closeout finalization, and Work Queue readback.
- Work Queue active graph readback surfaces `boundaryReplay` with checkpoint
  refs, graph checkpoint refs, plan refs, latest checkpoint kind, replay
  start/safety/freshness/continuation state, accepted/stale/rejected refs,
  summaries, reason codes, and bounded raw-storage flags.
- The dynamic runner now passes workflow `maxParallelNodeExecutions` into the
  Runtime Work Graph scheduler so replayed checkpoints and live execution use
  the same frontier/superstep behavior.
- The scheduler now has a runtime-owned completion readiness gate: if
  executable graph nodes are terminal, blocking Mission Ledger commitments are
  satisfied, and closeout node evidence exists, it records completion readiness
  and terminalizes success without a redundant model decision.

## Post-Product/Spec Work

These items do not have to block the Product/Spec proof if the pre-proof items
above pass, but they are required to surpass Codex/Claude Code over broader
workloads.

### Context Pack Supply Chain

Promote commitment packets, context scout handoffs, synthesis artifacts,
worker results, validation summaries, closeout capsules, skills, and Work
Queue readback into reusable Context Engine/Model Memory context packs.

### Work Queue Event Push And Control UX

Move beyond bounded polling toward event push for high-volume parallel work,
using Work Queue event cursors and existing gateway/websocket foundations.

### Skill And Role Harness Integration

Use skill inventory and skill triggers to supply role-specific guidance to
node executors without padding every prompt.

### Multi-Workflow Plugin Breadth

Apply the same native harness to Product/Spec Planning, research, docs/skills,
QA, architecture, design, marketing, and future teams through workflow
definitions/plugins instead of new runner brains.

### Provider Qualification Expansion

Qualify additional non-Codex models and role specializations for docs edits,
test-writing edits, frontend scoped edits, validation explanation, research,
and reviewer work.

## Proof Gates

The Product/Spec proof should not be considered passed unless:

- full prompt reaches Mission Ledger, packet author, context, scheduler, and
  workers through volatile input refs.
- commitment packets are worker-ready.
- context scout and synthesis are accepted before implementation.
- post-synthesis graph exposes dependency layers and parallel frontiers where
  work is independent.
- broad Codex implementation is used only with explicit cost/quality
  justification.
- non-Codex workers receive concrete scoped packets when selected.
- runtime executes parallel supersteps when frontier legality allows.
- validation runs through runtime-owned validation tools.
- evidence claims close Mission Ledger commitments.
- Work Queue readback shows live phase, node, model, tool, blocker, frontier,
  validation, and closeout state.
- closeout finalization is model-authored and accepted.

## Massive-Leap Follow-Up

The latest failure review expanded the convergence work into a twelve-item
hardening plan covering provider tool-call separation, edit transactions,
worker phase splitting, provider capability profiles, context freshness,
repo-analysis context scout, safe parallel supersteps, worktree-per-node
isolation, production boundary replay, first-class validation, span-level
observability, and repair classification before retry.

Source-of-truth details are in
[Native Agentic Coding Massive Leap Specs](/projects/execution-platform/specs/native-agentic-coding-massive-leap).
