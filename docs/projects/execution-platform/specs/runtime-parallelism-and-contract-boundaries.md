# Runtime Parallelism And Contract Boundaries

Date: 2026-05-16

Status: documented follow-up architecture. This spec does not block the next
Product/Spec Planning UX proof.

## Why This Exists

The latest Product/Spec Planning proof attempts exposed three recurring
failure classes:

- long prompt submission needs byte-safe UX transport, not shell/template
  source interpolation.
- background heartbeat/proactivity must not supersede an accepted owner turn.
- model contracts must not ask models to invent runtime-owned schema fields
  such as executor keys, node kinds, evidence enums, runtime ids, or storage
  flags.

The immediate fixes are in place, but the longer-term architecture needs two
parallelism tracks:

- parallel child execution inside one runtime effort.
- concurrent prompts/background work across sessions without cross-talk.

## Transport Equivalence: `--prompt-file` And Real UX Input

`scripts/openclaw-submit-prompt-via-ux.mjs --prompt-file <path>` is a byte
transport wrapper around the same authenticated browser path used for manual
operator input:

1. read the prompt bytes from a UTF-8 file.
2. open the requested OpenClaw chat session through `OperatorBrowserHarness`.
3. fill the same operator chat textarea.
4. click the same `Send message` / `Queue message` button.
5. wait for the same websocket/rendered turn-start/progress evidence.
6. store only prompt hash, length, source kind, run refs, and bounded result
   refs.

The prompt-file path is therefore equivalent at the UX/browser submission
layer. The only difference is the prompt source: file bytes instead of manual
paste or CLI argument text.

Required smoke before the next long proof:

- rebuild/reload through the approved gateway path.
- submit a short transport-equivalence prompt via `--prompt-file`.
- verify the UI dispatch/run evidence includes a prompt hash match and runtime
  route evidence.
- then submit the full Product/Spec Planning prompt through the same
  `--prompt-file` path.

This smoke proves the rebuilt gateway accepts the file-fed UX path. It does not
need to re-prove all Product/Spec functionality.

## Runtime-Owned Field Boundary

The canonical boundary is:

- Model owns: objective, role rationale, selected capability, target
  commitments, cost/utility rationale, human-readable expected output, success
  criteria, downstream consumer, and stop/escalation condition.
- Runtime owns: graph node kind, executor key, worker ref, runtime ids,
  decision/trace ids where derivable, evidence enums, storage flags, authority
  flags, lifecycle state, tool invocation ids, Work Queue item ids, and bounded
  artifact refs.

The deterministic layer is a compiler and validator. It may derive canonical
runtime schema from a model-selected capability and Mission Ledger state. It
must not make semantic quality judgments.

## Current Contract Audit

Production live scheduler contract:

- `DynamicAgentTeamGraphRunner` now instructs the orchestrator to select
  capabilities and provide model-owned task fields.
- `orchestrator-graph-decision.ts` accepts capability ids and compiles them to
  canonical node envelopes.
- `runtime-work-graph-scheduler.ts` derives expected evidence from
  capability, Mission Ledger, and workflow evidence profile.

Remaining residue to track:

- `cost-aware-capability-policy.ts` still exposes legacy normalized fields
  (`selectedNodeKind`, `selectedExecutorKey`, `expectedEvidence`) in readback
  and validation objects. This is acceptable only while those values are
  derived from the selected capability or existing node, not required from
  model output.
- Product/Spec `ActionGraphProposal` currently requires
  `expectedEvidenceRefs` and `requiredContextRefs` only when actions are
  `compile_ready`. This is not a blocker for proposal-mode planning, but the
  compile path should eventually derive these refs from compiler policy,
  context pack refs, workflow evidence profile, and selected child workflow.
- Non-Codex worker tool loops ask models for `toolCalls`. This is model-owned
  tool selection, which is acceptable, but runtime tool invocation ids,
  budgets, storage flags, and trace ids must remain runtime-derived.
- Model Memory/proactivity still has strict JSON model calls. These are
  candidates for later toolification, especially capture adjudication,
  retrieval quality review, proactivity extraction/adjudication, and skill
  drafting.
- Proof scripts and tests still contain older runtime-owned fields. They must
  not be treated as production contracts.

Follow-up rule:

Any new model contract must have a paired compiler review answering:

- What does the model decide?
- What does runtime derive?
- What fields can be repaired from structural diagnostics?
- What fields are prohibited from model authorship?
- What bounded trace proves the compiler accepted or rejected the decision?

## Parallel Child Execution Inside One Runtime Effort

The target graph execution model is fan-out/fan-in with durable state:

- orchestrator proposes independent nodes with explicit dependency edges or
  explicit parallel-independent justification.
- scheduler groups runnable nodes into a superstep.
- scheduler executes independent nodes concurrently subject to budgets,
  locks, capability limits, and provider rate limits.
- node outputs are appended as bounded artifacts/events, not merged by text.
- join nodes run only after dependencies close or intentionally remain open.
- failures retry only failed branches when safe; successful sibling outputs are
  not repeated.

Conflict domains must be explicit:

- repo/file write locks: two implementation nodes cannot edit overlapping file
  scopes unless the graph has an ordered handoff.
- validation locks: expensive workspace validation should be deduped and
  serialized by command/scope hash.
- Work Queue lifecycle: runtime jobs remain lifecycle truth; child Work Queue
  rows are readback/control surfaces.
- memory writes: capture/proactivity writes need idempotent DB-operation refs.
- model/provider budgets: max parallel model calls per provider/model profile.
- human tasks: parallel human interrupts require stable interrupt ids and
  independent resume refs.

Minimum production design:

- `RuntimeWorkGraphScheduler` gets a runnable-set planner.
- `RuntimeToolCallKernel` runs node invocations with concurrency limits,
  timeout/abort, cancellation, and cursor-readable traces.
- `WorkQueueRepository` materializes every runtime graph node as a DB child
  item with status derived from node/runtime evidence.
- Work Queue UI/readback shows parallel groups, join state, active workers,
  waiting human decisions, locks, and blocked dependencies.

## Concurrent Prompts And Background Work

The current heartbeat fix serializes background heartbeat against an active
owner turn for the same base session. That is correct as a short-term
protection, but it is not the final concurrency model.

Target model:

- owner turns, background heartbeat, proactivity, workflow jobs, and human
  resumes each get distinct runtime lanes.
- lanes can run concurrently when their conflict domains do not overlap.
- a session-level foreground owner turn blocks only writes to that session
  transcript and owner-visible reply lane.
- heartbeat/proactivity can continue in a background lane if it does not write
  to the owner turn transcript or steal UX focus.
- runtime jobs expose progress through Work Queue/event streams instead of
  requiring chat-lane ownership.
- the existing web ingress/socket/event-push infrastructure should become the
  owner-facing event transport for active work rather than forcing polling.

Concurrency decisions must be deterministic policy, not model judgment:

- lane id.
- conflict domain ids.
- lease owner.
- allowed parallelism.
- cancellation propagation.
- retry/backoff policy.
- idempotency key.

Models can propose parallelism and rationale; runtime decides whether it is
allowed.

## External Design References

The architecture aligns with durable workflow and agent runtime patterns:

- LangGraph durable execution persists state so long-running or human-paused
  work can resume without reprocessing completed steps.
- LangGraph graph execution supports fan-out/fan-in parallel branches, with
  superstep-style execution and retry behavior for failed branches.
- LangGraph human-in-the-loop APIs model pause/resume with stable thread and
  interrupt metadata, including multiple simultaneous interrupts.
- Temporal workflows separate queries, signals, and updates; signals/updates
  are recorded as workflow history and can control running workflow state.
- Temporal child workflows model parent/child execution with cancellation and
  parent-close policy.
- OpenAI Agents SDK tracing records LLM generations, tool calls, handoffs,
  guardrails, and custom events as one workflow trace.

These patterns all point to the same OpenClaw direction: durable graph state,
typed tool/handoff events, explicit concurrency boundaries, and owner-visible
traces.

## Work Queue Placement

The staged scheduler protocol is now a pre-proof exception because the latest
Product/Spec attempt failed before implementation work ran. It must happen
before Product/Spec Planning:

0. Staged Scheduler Tool Protocol And Maximum Toolification Compiler
   - replace single-shot graph JSON with staged scheduler tools and a runtime
     compiler for complex missions.

The remaining items should stay after the Product/Spec Planning Production
Upgrade proof unless they become direct blockers:

1. Product/Spec Proof Latency Reduction And Parallel Runtime Follow-Up
   - source spec:
     `specs/product-spec-proof-latency-and-parallelism.md`.
   - parallelize packet authoring/review, context scout fan-out, runnable
     scheduler supersteps, non-Codex scoped worker execution, branch retry, and
     Work Queue parallel-group readback.
2. Runtime Parallel Graph Execution And Join Semantics
   - add runnable-set/superstep execution, graph join state, per-provider
     concurrency limits, file-scope locks, and retry-only-failed-branch logic.
3. Session And Background Work Concurrency Lanes
   - replace coarse owner-turn heartbeat suppression with lane/conflict-domain
     scheduling so heartbeat/proactivity can run concurrently when isolated.
4. Work Queue Parallel Runtime Visibility And Control
   - surface parallel groups, active workers, join state, lock state,
     cancellation, pause/resume, and human interrupts in DB readback and UI.
5. Model Contract Compiler Consolidation
   - audit every production model JSON/tool contract and move remaining
     runtime-owned schema construction into compiler/runtime code.
6. Memory, Retrieval, Context, And Proactivity Toolification
   - toolify Model Memory/proactivity model calls through the same runtime
     kernel and contract compiler boundary.

The Product/Spec Planning proof should proceed first after rebuild and
transport smoke because the current blocking issues for that proof were
submission, routing, scheduler, closeout, Work Queue generated children, and
contract-schema choke. Parallel execution is an upgrade path, not a proof
precondition.
