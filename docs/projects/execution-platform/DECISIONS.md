# Execution Platform Decisions

## 2026-05-19 Fallback Retirement Includes Canonical-Path Refactor

Decision: the `Fallback And Compatibility Retirement` queue item is not only
cleanup. It must include a bounded production-path refactor that removes
reachable retired runners, proof pilots, degraded closeout paths, and stale
type-contract drift before Product/Spec Planning can be a valid proof.

Implementation update: production workflow dispatch now goes through
`ProductionWorkflowExecutionFactory`; non-agent-team generic workflow jobs fail
closed with diagnostic runtime evidence instead of using `WorkflowQueuedRunner`;
the public runtime barrel exports `CodingTeamRuntimeJobRunner` instead of the
legacy `AgentTeamQueuedRunner` name; retired/proof-era low-level adapters are
not public runtime exports; generated debug/proof Work Queue rows are archived
through lifecycle reconciliation; and `pnpm tsgo:fast` is a passing gate again.

Consequences:

- production workflow execution should enter through one canonical factory or
  fail-closed diagnostic path.
- queued runners, static single-job role sequences, patch-JSON adapters, and
  legacy proof pilots must not be public production options.
- degraded/system closeout remains diagnostic-only and cannot satisfy
  workflow success, Work Queue closeout, or evidence profile acceptance.
- compatibility readback maps must be derived from canonical registries.
- proof and replay harnesses remain useful, but lifecycle closeout must happen
  only through accepted runtime closeout/control APIs.
- `pnpm tsgo:fast` must stop carrying the workflow-definition/
  evidence-profile exception; full TypeScript validation is part of this
  retirement pass.

## 2026-05-19 Compound Coding Tools Are Runtime Operations, Not Parser Shortcuts

Decision: non-Codex workers may use model-selected compound coding tools for
common scoped implementation tasks, but compound tools are first-class Runtime
Tool Kernel operations and must preserve the same runtime-truth boundary as
atomic tools.

Consequences:

- models choose the compound tool and semantic edit intent.
- runtime owns refs, allowed file scope, edit transaction ids, patch
  application, validation execution, evidence refs, repair classification,
  storage flags, and lifecycle.
- compound success requires changed-file refs, validation refs, evidence
  claims, and a closed edit transaction.
- compound failures are `needs_review` with repair classification refs, not
  hidden retries or fake implementation evidence.
- Work Queue readback must surface compound tool id and internal sub-event
  phases so owners can see the worker's current operation without raw
  transcripts or logs.

## 2026-05-19 Coding Executor Capability Leap Requires Code Intelligence Before Product/Spec Proof

Decision: before the next Product/Spec Planning production proof, the coding
executor team must close the largest remaining coding-harness gaps identified
by the Codex, Claude Code, and OpenCode comparison. The governing spec is
[Coding Executor Team Capability Leap](/projects/execution-platform/specs/coding-executor-team-capability-leap).

Consequences:

- LSP/Tree-sitter-backed code intelligence becomes a shared runtime service
  for context scout, scheduler, workers, validation, review, and closeout.
- Context scout must run as a real tool loop over code intelligence and prompt
  excerpts; runtime-supplied refs alone are not clean context success.
- Context synthesis is a required barrier before complex implementation graph
  selection, and the scheduler must receive synthesis substance, not only an
  artifact ref.
- Worker-internal model/tool phases must emit operator-visible spans.
- Non-Codex workers need traceable compound coding tools so cheaper models can
  execute scoped tasks without brittle low-level choreography.
- Remaining fallback/proof/compatibility execution paths must be removed from
  production success before the Product/Spec proof can count.
- Product/Spec Planning remains the near-term proof, but it follows these
  coding-harness capability-leap blockers in the DB Work Queue.

## 2026-05-19 Worker-Internal Progress Is Owner-Facing Runtime Evidence

Decision: non-Codex worker loops must emit bounded worker-internal progress
that survives into scheduler progress, RuntimeExecutionSpan summaries, and
Work Queue active graph readback. Node-level progress alone is not sufficient
for long model/tool/edit/validation loops.

Consequences:

- controller model turns, selected tool calls, validation, repair, stale
  context refresh, evidence handoff, provider no-content, and timeout
  boundaries expose packet/context/code-intelligence refs, active tool/status,
  validation command, edit transaction state, output hash/content length,
  provider latency/timeout/finish/token diagnostics, blocker, and next
  decision.
- Work Queue readback has a `workerInternal` block so operators can inspect
  what a non-Codex worker is doing without raw transcript or raw log storage.
- bounded model-lane proof is required for this class of readback: a model
  must be able to reconstruct active worker state and next decision from the
  same readback shape the owner sees.
- raw prompts, raw responses, raw provider logs, raw tool logs, raw command
  logs, raw DB rows, secrets, and hidden reasoning remain prohibited.

## 2026-05-19 TypeScript Semantic Backend Is The First LSP-Parity Path

Decision: Code Intelligence semantic parity for the current OpenClaw repo is
served first by a TypeScript language-service backend behind the canonical
`code.*` Runtime Tool Kernel surface. A separate external JSON-RPC LSP fleet
remains a later multi-language extension, not a prerequisite for TS/JS
production semantic coverage.

Consequences:

- models keep using the same `code.*` tool IDs; runtime selects and records the
  semantic backend.
- backend/schema details are runtime-owned: backend id, health refs, workspace
  snapshot refs, diagnostic version refs, project config refs, fallback state,
  latency, result counts, and limitations.
- structural parsing remains available only as explicit degraded mode and
  cannot masquerade as semantic success.
- context scout, synthesis, implementation, validation, review, closeout, and
  Work Queue readback can all inspect whether semantic output was used,
  limited, stale, or unavailable.

## 2026-05-19 Repair Classification Gates Retry

Decision: production scheduler-backed workflows may not retry, repair,
escalate, or resume from a failed/needs-review node until runtime has recorded
a bounded repair classification tied to the failed node, runtime spans,
runtime tool refs, scheduler decision, affected commitments, and selected
repair boundary.

Consequences:

- blind same-kind retry is structurally invalid for needs-review nodes.
- worker-internal retry loops are covered by the same invariant. A worker may
  not silently retry validation repair, stale patch repair, provider
  no-content, timeout, or adapter-contract choke as private control flow
  without a bounded repair classification and retry-gate decision.
- runtime-owned classification validates schema, refs, storage flags, and
  lifecycle safety; semantic sufficiency remains a model/orchestrator judgment
  on the next decision.
- context, packet, graph, validation, provider, worker, evidence, and closeout
  failures route to the boundary that can actually repair the blocker instead
  of defaulting to implementation or closeout churn.
- Work Queue readback must show the latest repair class, failed boundary,
  selected repair boundary, repair strategy, affected commitment ids, failed
  field paths, and expected next action.
- worker result/readback contracts must carry repair classification refs and
  summaries so the operator can see why a retry happened before the scheduler
  receives the final node result.

## 2026-05-19 Runtime Execution Spans Are Production Evidence

Decision: scheduler-backed production workflows must emit bounded
`RuntimeExecutionSpan` evidence across model calls, runtime tools, worker
phases, scheduler decisions, graph nodes, validation commands, edit
transactions, repair, replay, and closeout.

Consequences:

- Work Queue readback must show active/recent/stale/blocked span state with
  model/tool/worker refs, objective, input/output/evidence refs, blocker,
  next action, and ELI5.
- Runtime Tool-Call Kernel and RuntimeWorkerSupervisor contribute span
  metadata/events without becoming separate lifecycle truth sources.
- Closeout finalization evidence packets require runtime execution span refs;
  missing span coverage is needs-review evidence, not clean success.
- Span metadata remains bounded and carries raw-storage false flags. Raw
  prompts, raw responses, raw provider logs, raw tool logs, raw command logs,
  raw DB rows, and secrets are never span payloads.

## 2026-05-19 Worker Execution Requires Fresh Runtime Context Snapshots

Decision: production scheduler-backed workflows must treat worker-facing
context as runtime evidence, not incidental prompt text. Worker nodes that
depend on context must carry bounded `ContextSnapshotRef` inputs and cannot
invoke model/provider adapters when required context snapshots are missing,
stale, rejected, or unknown.

Consequences:

- source prompt indexes/excerpts, Commitment Work Packets, context scout
  handoffs, context synthesis artifacts, file snapshots, validation results,
  boundary replay checkpoints, and future memory context packs all share the
  same bounded snapshot contract.
- runtime code validates snapshot shape, refs, freshness, prompt hash, payload
  hash, repo/worktree identity, and staleness policy. Models judge semantic
  sufficiency but do not own snapshot schema or lifecycle.
- implementation, validation, repair, review, docs/planning, and closeout
  style nodes block before provider invocation when their context snapshots
  are not fresh enough.
- Work Queue readback must distinguish context insufficiency from model
  failure and show refresh action, snapshot refs, stale/missing/rejected refs,
  current phase, and owner-readable blocker summaries.

## 2026-05-19 Non-Codex Workers Use Split Controller Author Applicator Phases

Decision: production non-Codex file-edit workers must run through explicit
controller, author, runtime-applicator, validation/repair, evidence, and
escalation phases. The production file-edit adapter enables strict phase
authority so controller/context slots cannot apply source edits directly.

Consequences:

- controller/context model turns may select next work, request bounded context,
  or escalate, but cannot mutate files.
- patch-author turns write bounded edit plans/content only; runtime applicator
  phases apply through `EditTransactionEngine`.
- validation repair and evidence authoring are separate phases with their own
  model slots and refs.
- worker phase refs/records are runtime evidence and must appear in scheduler
  progress, adapter diagnostics, and Work Queue readback.
- low-level diagnostic tests may exercise raw tool mechanics, but production
  adapter execution uses strict phase authority.

## 2026-05-19 Non-Codex Edits Require Edit Transactions

Decision: production non-Codex file-edit workers must mutate repository files
through `EditTransactionEngine`. Runtime owns transaction ids, scope,
snapshots, apply, conflict diagnostics, validation linkage, rollback/discard,
evidence refs, raw-storage flags, and close state. Models author semantic edit
intent, patch content, repair rationale, and evidence summaries only.

Consequences:

- changed-file refs without a closed edit transaction cannot produce clean
  production success.
- natural-language "I edited" claims and giant patch-proposal JSON remain
  insufficient as production evidence.
- validation failures may repair inside the same transaction; structural
  failures can be rolled back from transaction snapshots.
- Work Queue readback and scheduler progress must surface transaction refs,
  phase/status, files touched, validation refs, repair count, evidence refs,
  and blockers.
- future non-Codex test/docs/frontend workers should reuse the same
  transaction boundary instead of creating parallel file mutation paths.

## 2026-05-19 Non-Codex Worker Model Slots

Decision: Non-Codex implementation workers use explicit per-turn model slots,
not one model/profile for the whole tool loop. Qwen3-Coder-Next is the cheap
controller/context/validation-repair/evidence/escalation lane. Kimi K2.6 is
the scoped patch lane with `reasoningMode: none`.

Consequences:

- Kimi patch/worker turns must not use `reasoningMode: omit` in production
  worker paths.
- Patch generation remains Kimi until another model passes the patch
  generation gate; Qwen may control and repair the loop before router or
  context-scout defaults are promoted.
- The capability manifest must expose the split policy so the scheduler can
  reason about cost and model fit without defaulting every worker turn to the
  strongest model.
- Per-stage latency and valid-output benchmarks are required before promoting
  Qwen to router or context-scout defaults.

## 2026-05-18 Non-Codex Implementation Requires Runtime Tools

Decision: Kimi and future non-Codex implementation workers must use a
model-agnostic runtime tool worker for production file-edit work. A giant
model-authored JSON patch proposal is test/compat only and cannot satisfy
production implementation evidence, Mission Ledger commitments, Work Queue
closeout, or clean workflow success.

Consequences:

- models choose semantic next actions, edit intent, repair strategy,
  sufficiency, and escalation rationale.
- runtime owns file reads/writes, patch application, validation execution,
  refs, schemas, evidence classes, persistence, budgets, locks, lifecycle,
  authority, and raw-storage policy.
- provider/model profiles require qualification evidence before scheduler
  selection for production implementation capabilities.
- Work Queue readback must expose worker tool progress, context requests, edit
  plans, patch results, validation state, repairs, evidence claims, and
  escalation reasons.
- broad Codex escalation remains available, but must record why cheaper or
  specialized qualified workers were unsuitable for the scoped task.

## 2026-05-19 Provider Capability Profiles Are Runtime Selection Truth

Decision: Provider Capability Profiles are the canonical production runtime
truth for scheduler worker/model selection. They are derived from the Runtime
Node Capability Manifest and are not a second model-authored schema.

Consequences:

- the model selects semantic capability/profile fit and rationale.
- runtime derives executable node kind, executor key, worker ref, required
  metadata schema, evidence kinds, budget, allowed tools, qualification gates,
  and raw-storage policy.
- production selection rejects missing, workflow-invalid, diagnostic-only,
  contract-only, or unqualified profiles.
- broad Codex/GPT-5.5 implementation remains available as premium escalation,
  but profile-backed cost/quality justification is required when cheaper
  qualified workers exist.
- Work Queue readback must expose selected profile id, worker ref, role class,
  cost/latency class, context capacity, qualification refs, considered profile
  ids, and why cheaper profiles were rejected.

## 2026-05-18 Product/Spec Planning Is Native To Generic Orchestration

Decision: Product/Spec Planning technical specs must describe
`agent_team.product_spec_planning` as a production workflow plugin on the
generic orchestration runtime, not as a bespoke scheduler path, queued-runner
contract facade, or Product/Spec-specific compatibility lane.

Consequences:

- Product/Spec execution requires WorkflowDefinition/plugin readiness,
  GenericOrchestrationRuntime, Runtime Work Graph scheduler, Runtime
  Tool-Call Kernel traces, Mission Ledger, Commitment Work Packets, Context
  Supply Chain, staged scheduler protocol, generic node execution/evidence
  claims, workflow evidence profile, model-authored closeout, completion
  review, and Work Queue readback.
- Product/Spec can be an executor workflow for planning/spec/capsule/proposal
  work or a target subject for coding-team implementation work. Routing owns
  this executor/subject split; the scheduler must not rediscover it through
  Product/Spec-specific keyword rules.
- `WorkflowQueuedRunner` and facade compatibility docs are historical or
  diagnostic only for Product/Spec; production Product/Spec execution must be
  scheduler-backed and must reject generic queued fallback with
  `product_spec_planning_requires_scheduler_backed_runner`.
- ActionGraphProposal remains proposal authority only. Child runtime jobs or
  human tasks require a later explicit compile/authority boundary.
- Product/Spec proof evaluation follows the checkpointed generic runtime
  ladder, including source-prompt parity, packet quality, context supply,
  context synthesis, staged graph compile, node execution, validation/repair,
  closeout, and boundary replay.

## 2026-05-17 Long Tasks Need Explicit Runtime Budgets And Live Progress

Decision: Product/Spec-class and other long-running workflow nodes must not
inherit tiny/default runtime-tool windows. Runtime task budgets are
workflow/capability/node policy objects that feed scheduler runtime tools,
worker invocation, timeout/abort behavior, lease/heartbeat windows, and Work
Queue active readback.

Consequences:

- budget classes are explicit: `tiny`, `standard`, `complex`, and
  `long_running`.
- Product/Spec Planning `planning_orchestrator` work derives a
  `long_running` budget with a one-hour runtime tool/model-call window.
- scheduler progress events and Work Queue readback expose budget policy ref,
  budget class, timeout windows, progress interval, stale-progress window,
  lease timeout, heartbeat interval, elapsed time, remaining time, and
  heartbeat state.
- timeout/abort is Runtime Tool-Call Kernel evidence. It is recorded as
  bounded failed tool evidence and cannot be mistaken for clean process
  success.
- readback must be bounded and recent-run focused so proof retries do not make
  the operator stare at stale or latency-heavy state.

## 2026-05-17 Context Scout Requires Accepted Tool-Loop Evidence

Decision: production implementation nodes that require upstream context may
not run from generic context summaries or legacy context-scout pilot
artifacts. They require an accepted `ContextScoutToolLoopRun` with verified
file refs, runtime tool invocation refs, a sufficiency review, and a context
handoff packet ref.

Consequences:

- context scout is a first-class Runtime Tool-Call Kernel surface through
  `context_scout.tool_loop`.
- model-authored context scout output judges usefulness and sufficiency;
  runtime validates refs, storage flags, bounds, handoff presence, and whether
  sufficiency was accepted.
- Work Queue readback must show context scout loop refs, tool refs,
  sufficiency summary, verified/rejected refs, handoff refs, and blockers.
- legacy `agent_team.context_scout` artifacts remain diagnostic-only and do
  not count as production success evidence.

## 2026-05-19 Context Scout Repo-Analysis Tools And Synthesis Barrier

Decision: context scout must be a repository-analysis worker with canonical
tool traces and synthesis-ready handoff evidence. A scout cannot count as
production-ready context merely because runtime discovered file refs.

Consequences:

- production context scout paths emit first-class repo-analysis runtime tools:
  `repo.search`, `repo.list_files`, `file.read`, `file.inspect_symbols`,
  `test.find_related`, `context.handoff`, `context.limitations`,
  `context.evidence_claim`, and `context.request_more_context`.
- model-authored scout output remains responsible for semantic usefulness:
  existing patterns, risks, edit points, validation suggestions, and bounded
  handoff summaries. Runtime owns refs, bounds, storage flags, tool traces,
  and synthesis readiness metadata.
- `ContextHandoffPacket` is the handoff contract for both implementation and
  synthesis. It carries commitment packet refs, prompt excerpt refs, symbol
  refs, test refs, synthesis summaries, and context evidence refs.
- parallel context scout replay must materialize the graph shape it is
  proving: per-packet scout nodes, a context synthesis barrier, and
  `context_supplies` edges. A set of scout nodes with no synthesis join is
  incomplete graph evidence.
- Work Queue readback must show scout synthesis readiness and blockers, not
  only lifecycle status.

## 2026-05-19 Context Synthesis Is A Scheduler Handoff Contract

Decision: accepted context synthesis is a production scheduler handoff
contract, not a short artifact ref or summary. It is the required barrier
between per-commitment context scout fanout and downstream implementation
graph compilation for complex coding-team work.

Consequences:

- context synthesis must carry implementation groups, file ownership,
  cheaper-worker suitability, Codex escalation rationale, expected outputs,
  evidence-claim expectations, validation needs, review needs, risks,
  integration requirements, dependency or explicit parallelism, and
  worker-fit summary before implementation selection.
- runtime owns source context refs, snapshot freshness, storage flags,
  bounds, and graph compilation; the model owns semantic grouping,
  readiness, worker fit, risks, and human-readable handoff judgment.
- if the model omits runtime-owned context snapshot refs, normalization
  preserves the runtime-provided fresh refs instead of losing provenance.
- Work Queue readback must expose active context synthesis status and
  graph-compile readiness, not just a generic active node.
- a bounded model lane is required before closing this unit so the contract is
  proven model-usable, not only fixture-usable.

## 2026-05-17 Architecture Red-Team Gate Before Major Proofs

Decision: OpenClaw should use a reusable Architecture Red-Team And Research
Gate before expensive proof runs, new workflow families, major
model/runtime/tool contract changes, and repeated failure loops.

Implementation status: completed as first-class workflow
`agent_team.architecture_red_team` on 2026-05-17. The DB Work Queue item
`openclaw-convergence.architecture-red-team-research-gate` closed from
accepted runtime closeout evidence.

Consequences:

- long-form live UX/runtime proofs require a Level 2 formal red-team gate.
- new workflow/team families or repeated systemic failures require a Level 3
  architecture reset review.
- P0 risks block major proofs unless explicitly accepted by the owner.
- research informs architecture; it does not count as proof.
- the gate must not execute the target proof unless separately authorized.

## 2026-05-17 Validation And QA Are Runtime Tool Operations

Decision: production validation and QA must produce bounded Runtime Tool-Call
Kernel traces and evidence packets before they can count toward clean workflow
success.

Consequences:

- models may author validation plans, classify failures, judge coverage, judge
  evidence sufficiency, and propose repairs.
- runtime owns approved command refs, command execution boundaries, result
  refs, tool invocation refs, evidence packet shape, raw-storage flags, and
  Work Queue readback.
- accepted validation evidence requires validation refs plus runtime tool
  invocation refs.
- failed validation becomes scheduler repair input with bounded failure and
  repair refs.
- missing validation/QA runtime tools in production is `needs_review`, not a
  fallback success path.

## 2026-05-17 Proactive model-heavy hardening uses staged tools and runtime compilers

Decision: router/front door, validation/QA, closeout/finalization, Work Queue
human tasks, Model Memory, retrieval, context packs, proactivity, and future
workflow families must follow the same boundary now enforced in generic
orchestration: models author semantic intent, rationale, usefulness, and
sufficiency judgments; runtime compiles canonical schema, ids, refs, storage
flags, authority boundaries, lifecycle state, DB writes, and tool traces.

Consequences:

- the router stays thin and stops acting as a semantic safety/compiler layer.
- safety-boundary language such as "do not deploy" moves to Mission
  Ledger/compile boundaries unless the primary requested outcome is
  prohibited.
- validation failures become scheduler repair evidence when recoverable,
  rather than terminal process failure.
- closeout finalization requires evidence packets, Mission Ledger status,
  workflow evidence profile state, runtime tool traces, Work Queue readback,
  model-authored Closeout Capsule, and model-authored maximality review.
- Model Memory capture/retrieval/context/proactivity must use staged tools
  and runtime-owned write/context/Work Queue refs before being called
  production-primary.
- deterministic code may validate shape, refs, bounds, idempotency, cooldowns,
  storage, authority, and lifecycle separation, but must not judge memory
  worthiness, retrieval usefulness, opportunity quality, or work sufficiency.
- the Work Queue has been reprioritized so router, validation/QA, and closeout
  hardening run before the next Product/Spec Planning live proof.

## 2026-05-17 Node execution success requires canonical evidence claims

Decision: production scheduler nodes cannot claim success from worker process
completion, generic artifact refs, role reports, or degraded placeholders.
Every production node result must compile into the canonical generic node
execution result contract and, when the workflow/mission requires evidence,
must carry commitment-mapped evidence claims.

Consequences:

- runtime owns node execution ids, evidence claim ids, executor refs, worker
  refs, storage flags, authority flags, lifecycle flags, and evidence refs.
- workers/models may author bounded claim summaries, limitations, and
  qualitative self-reports, but they do not grant authority or lifecycle
  success.
- Mission Ledger closure receives explicit evidence claims; generic artifacts
  do not imply commitment closure.
- workflow evidence profiles can be evaluated from canonical node evidence.
- Work Queue readback must show structured evidence claims in owner-readable
  form.
- any production path that succeeds without canonical node evidence is a
  regression.

## 2026-05-17 Production workflow graph creation must use the generic staged scheduler protocol

Decision: production workflow plugins cannot create executable graph nodes
from model-authored node envelopes. Complex production graph creation must use
the generic staged scheduler protocol, where the model authors work units,
capability selections, node contracts, and edge/parallelism rationale while
runtime derives node ids, node kinds, executor keys, worker refs,
qualification refs, expected evidence, storage flags, and lifecycle metadata.

Consequences:

- production plugins must declare staged protocol readiness and simple-only
  direct implementation first-move policy.
- generic runtime scheduler execution must explicitly opt into staged protocol
  requirements.
- scheduler validation rejects production node creation that bypasses runtime
  compilation or asks models to provide runtime-owned expected-evidence enums.
- graph structure requires edges or explicit parallel-independent rationale.
- Work Queue readback must expose the staged scheduler policy so owners can
  see whether a workflow is running through the canonical path.
- legacy/proof fixtures must be updated to staged intent instead of weakening
  production gates.

## 2026-05-17 Generic orchestration runtime is the production execution spine

Decision: scheduler-backed production workflows must execute through
`GenericOrchestrationRuntime`, not through workflow-specific runner brains or
proof-only harnesses.

Consequences:

- the generic runtime validates WorkflowDefinition and WorkflowPlugin
  readiness before scheduler execution.
- Runtime Tool-Call Kernel availability is required for production workflows.
- scheduler success without graph evidence is `needs_review`, not success.
- Work Queue readback must surface generic runtime status and graph evidence.
- `RuntimeWorkflowGraphEngine` remains a readiness resolver inside the generic
  runtime; it is not a second execution brain.
- workflow-specific code should move toward plugins, node executors, evidence
  profiles, and readback projections under this runtime boundary.

## 2026-05-16 Maximum toolification is a staged working interface, not trace-only JSON

Decision: complex workflow orchestration must stop asking a model to produce
one executable graph JSON object. Runtime Tool Kernel traces are necessary but
not sufficient; the model must work through narrow typed scheduler tools and
the runtime must compile canonical graph envelopes.

Consequences:

- Mission Ledger remains Phase A because it is well-shaped.
- complex graph creation is split into work breakdown, capability selection,
  node contract definition, edge/parallelism definition, runtime graph
  compilation, structure review, validation/acceptance, and first-node
  execution.
- the model owns intent, rationale, work units, capability choices,
  human-readable expected outputs, success criteria, downstream consumers, and
  semantic quality review.
- runtime owns node ids, node kinds, executor keys, worker refs, expected
  evidence enums, trace ids, storage flags, authority flags, lifecycle state,
  and Work Queue child materialization.
- the next Product/Spec Planning proof is blocked until
  `agent_team.coding` uses this staged scheduler protocol in production.
- the source-of-truth spec is
  `specs/maximum-toolification-architecture.md`.

## 2026-05-16 Maximum toolification applies to every model/workflow contract

Decision: the staged-tool principle applies beyond the scheduler. Router,
Mission Ledger, capability policy, worker/file-edit adapters, validation/QA,
closeout, Work Queue/human tasks, Model Memory/proactivity, research,
docs/skills, QA/test, architecture/spec, and gateway/background work must all
avoid asking models to hand-author runtime-owned schema fields.

Consequences:

- each surface gets typed runtime tools or staged compiler phases where the
  model authors intent/rationale/judgment and runtime compiles canonical ids,
  refs, evidence enums, storage flags, lifecycle, authority, and traces.
- strict JSON can remain an interchange format for a narrow tool call, but it
  is not by itself a sufficient working interface for compound work.
- Work Queue items have been added for each maximum-toolification surface so
  these improvements do not disappear after Product/Spec Planning.
- Product/Spec Planning remains the near-term proof objective, but the staged
  scheduler protocol is the immediate pre-proof blocker.

## 2026-05-16 Background heartbeat must yield to active owner turns

Decision: heartbeat/proactivity is background work and must not start when the
target base session has accepted owner work in flight, even if command queues
are temporarily empty.

Consequences:

- `chat.send` marks an owner turn active as soon as it accepts the turn.
- heartbeat preflight checks owner-turn activity for the resolved base session
  and skips with `owner-turn-in-flight`.
- isolated `:heartbeat` sibling sessions still yield to the base owner turn.
- abort, completion, and error clear the activity record.
- TTL cleanup prevents stale activity from suppressing background work forever.

## 2026-05-16 Long prompt UX submission is byte transport, not source code

Decision: live UX proof submissions should use file/stdin prompt transport
instead of embedding prompt text in shell commands, JavaScript template
strings, or heredocs that can reinterpret prompt examples.

Consequences:

- long prompts with code fences, template-string backticks, `${...}` examples,
  shell snippets, and quotes are treated as UTF-8 data.
- `scripts/openclaw-submit-prompt-via-ux.mjs --prompt-file <path>` or
  `--stdin` is the preferred operator submission path for long proofs.
- bounded artifacts record prompt hash, length, source kind, run refs, and
  completion evidence only.
- raw prompts, raw responses, and raw transcripts are not stored in proof
  artifacts.

## 2026-05-16 Models choose work; runtime owns runtime schema

Decision: scheduler/model contracts must not ask models to invent
runtime-owned fields when the runtime already has the source of truth.

Consequences:

- models provide objective, role rationale, selected capability, commitment
  mapping, expected human-readable output, success criteria, cost/utility
  rationale, and stop/escalation condition.
- deterministic runtime code compiles canonical node envelopes, executor refs,
  runtime ids, expected evidence, storage flags, and authority boundaries.
- fields such as graph node kind, executor key, worker ref, expected-evidence
  enums, and decision ids are derived from the capability manifest, Mission
  Ledger, workflow evidence profile, and runtime graph state.
- repair requests should be field-specific and preserve accepted fields.

## 2026-05-16 Parallelism is a runtime lane/graph policy, not a routing workaround

Decision: the next Product/Spec Planning proof should not wait for parallelism,
but OpenClaw needs a first-class parallelism architecture immediately after
that proof.

Consequences:

- prompt-file UX submission is equivalent at the browser/chat transport layer:
  the file bytes are filled into the same operator textarea and submitted with
  the same send/queue button as manual UX input. Before the next long proof,
  run a short rebuild-time smoke that verifies dispatch/run evidence and prompt
  hash match.
- the current owner-turn heartbeat guard is intentionally conservative:
  heartbeat/proactivity skips while accepted owner work is active on the base
  session or isolated heartbeat sibling. This protects the next proof, but it
  is not the final concurrency model.
- the final model is lane/conflict-domain scheduling: owner turns,
  heartbeat/proactivity, workflow jobs, human resumes, memory writes, and
  validation jobs can run concurrently only when their write surfaces and
  leases do not conflict.
- inside one runtime effort, graph execution should support fan-out/fan-in
  parallel child nodes, join semantics, retry-only-failed-branch behavior,
  per-provider/model concurrency limits, file-scope locks, and Work Queue
  visibility.
- every production model/tool contract needs an explicit compiler boundary:
  model-owned fields are task intent and rationale; runtime-owned fields are
  ids, executor refs, evidence enums, storage flags, authority, lifecycle, and
  trace refs.

The source-of-truth follow-up spec is
`specs/runtime-parallelism-and-contract-boundaries.md`.

## 2026-05-16 Routing separates executor workflow from target subject

Decision: intent routing must not use one `workflowId` to mean both "who does
the work" and "what the work is about."

Consequences:

- router output includes `executorWorkflowId`, `subjectWorkflowIds`,
  `targetSubjectRefs`, `requestedCapabilities`, and `constraints`.
- `workflowId` is a compatibility alias for `executorWorkflowId`; conflicting
  values are invalid.
- workflow contracts expose executable capability summaries. The validator
  checks that the executor workflow can perform the requested capability
  classes without making semantic quality judgments.
- a prompt like "implement Product/Spec Planning" should select an executor
  workflow with code-edit/test/docs/review authority and preserve Product/Spec
  Planning as the target subject.
- safety constraints such as "do not deploy" or "do not store raw logs" are
  carried as constraints for Mission Ledger/compile boundaries. They are not
  route blockers unless the primary requested outcome is itself prohibited.
- native submit may repair an executor/capability mismatch once by asking the
  model to reselect the executor while preserving subject and constraints.
- Work Queue readback must show executor, subject, requested capabilities, and
  constraints so owner diagnostics are human-readable.

This is the generic replacement for the previous fragile edge case where
Product/Spec Planning was selected as the executor for work that was actually
about implementing Product/Spec Planning.

## 2026-05-16 Generated Work Queue children need explicit lifecycle policy

Decision: generated proof diagnostics, middleware fixtures, and runtime graph
children must carry explicit origin and terminal-policy metadata. They cannot
be treated as ordinary owner-planned Work Queue items by default.

Consequences:

- proof scripts must create diagnostic children through a generated-item API,
  not raw `createWorkItem(...)`.
- generated children must declare origin, parent item, runtime job refs where
  available, terminal policy, retention policy, and raw-storage flags.
- failed proof diagnostics and middleware fixtures archive into debug evidence
  instead of remaining in the owner active queue as `needs_review`.
- failed real owner-planned child work remains owner-visible `needs_review`.
- accepted parent closeout reconciles generated children according to terminal
  policy.
- default active queue/readback excludes debug-only generated proof rows, while
  admin/debug readback can still inspect them.
- Product/Spec Planning should not be rerun as the next proof until this
  lifecycle cleanup lands, because otherwise proof-generated children can keep
  drifting the active queue.

Implementation update: this cleanup has landed. `WorkQueueRepository` now has
a generated-item creation path, runtime graph children carry generated
lifecycle metadata, middleware fixture/proof diagnostic creators use
debug-only generated lifecycle metadata, default active/readback queries hide
debug-only generated items, and terminal projection reconciliation archives
debug-only proof/helper items instead of leaving them as owner work. Live DB
cleanup archived 9 middleware fixture rows and 20 Generic Workflow Runner
proof diagnostic rows.

## 2026-05-16 Workflow evidence profiles gate production success

Decision: every production workflow must pass a workflow-specific evidence
profile before it can claim clean success. A model-authored closeout is
required but no longer sufficient by itself.

Consequences:

- `execution.workflow_evidence_profile_evaluation` is the canonical bounded
  artifact for workflow success/readback gating.
- deterministic code validates only shape, refs, required evidence classes,
  raw-storage flags, and whether model-authored closeout exists.
- model-authored review/closeout remains responsible for qualitative
  judgment.
- `agent_team.coding` success now requires runtime graph evidence, scheduler
  tool traces, worker tool traces, source-change refs, validation refs,
  review refs, Work Queue readback refs, and model-authored closeout.
- generic queued workflow dispatch cannot succeed from closeout alone.
- Work Queue readback must show profile id, status, accepted/missing evidence
  classes, reason codes, artifact refs, and deep-completion review
  requirements.

## 2026-05-16 Workflow execution converges on one canonical graph engine

Decision: OpenClaw workflow execution should have one durable runtime spine.
Workflow-specific behavior must be registered as workflow definitions/plugins
on that spine, not implemented as separate production runner brains.

Consequences:

- `RuntimeWorkerSupervisor` remains infrastructure only: claim jobs, renew
  leases, enforce timeout/cancel, invoke the selected adapter/engine, and
  terminalize from evidence. It must not own workflow semantics.
- `RuntimeWorkGraphScheduler` becomes or is wrapped by a canonical
  `RuntimeWorkflowGraphEngine` used by every production workflow.
- `DynamicAgentTeamGraphRunner` should be decomposed into the
  `agent_team.coding` workflow plugin: coding capability manifest, role
  coverage profile, node executors, validation profile, and closeout policy.
- `WorkflowQueuedRunner` cannot remain a production completion path. It may
  submit to the canonical engine during migration, or become test-only.
- `agent_team.product_spec_planning`, web research, docs/skills, QA/test, and
  architecture/spec review should register workflow definitions rather than
  relying on bespoke dispatcher code.
- Graph nodes are still executed by individual agents/workers/tools/human
  adapters. The scheduler coordinates and records evidence; it does not
  replace the agents.
- Proof scripts must be black-box production observers. They may submit
  through gateway/runtime APIs and inspect runtime evidence, but they must not
  execute private runner internals or fixture-only paths.
- Product/Spec Planning should run through OpenClaw only after the canonical
  workflow registry/engine path is in place and the generic production runner
  path cannot fake workflow success.

Implementation update: the first production step is complete. The workflow
definition registry, `RuntimeWorkflowGraphEngine`, and model-authored
completion-review gate now exist as runtime objects. Production
`agent_team.coding` resolves its definition and checks engine readiness before
scheduler execution. Generic queued workflow dispatch records definition
resolution and refuses scheduler-backed or migration-needed workflows instead
of claiming completion. Completion review is part of the closeout/finalization
flow, not a repeated prompt footer: deterministic runtime requires the review
object, evidence refs, and gate; the model-authored closeout/review judges
whether work was maximally complete.

## 2026-05-15 Capability selection is cost-aware utility scheduling

Decision: Runtime Work Graph scheduling must treat worker/model selection as a
model-authored utility decision, not a "pick the strongest model" default.

Consequences:

- capability manifest v2 is the scheduling substrate for coding-team and
  future workflow graph nodes.
- every production add/run/retry/repair decision can be required to include
  selected capability, executor, target commitments, utility rationale, cost
  rationale, duplicate-work rationale, expected evidence, downstream consumer,
  and stop/escalation condition.
- premium Codex/GPT 5.5 lanes require a bounded explanation when cheaper
  same-role capabilities exist.
- deterministic code validates shape, refs, executor mapping, storage flags,
  authority, budgets, and commitment ids; it does not judge semantic quality.
- Work Queue readback must show the capability/cost rationale so the owner can
  see why a node was selected.
- broad Codex monopoly is no longer an acceptable default for complex
  multi-commitment work.

## 2026-05-15 Runtime tool calls are first-class runtime evidence

Decision: runtime tool calls are durable, typed Execution Platform operations
with bounded traces in the dedicated runtime DB.

Consequences:

- tool definitions, invocations, events, and artifact refs are persisted under
  `execution_platform`.
- Runtime Work Graph node execution can be traced as `worker.invoke`.
- future scheduler, worker, Mission Ledger, memory, closeout, and Work Queue
  readback passes must consume this kernel instead of creating parallel
  progress/evidence stores.
- raw prompts, responses, transcripts, provider logs, tool logs, command logs,
  raw DB rows, secrets, and unbounded logs remain prohibited.

Follow-up hardening decision: the kernel owns timeout/abort enforcement,
explicit cancellation, terminal idempotency, cursor pagination, and scoped trace
retention. Downstream schedulers and worker loops should call these kernel
primitives instead of implementing parallel timeout, cancel, pagination, or
trace-pruning behavior.

## 2026-05-15 Dedicated Execution Platform runtime database

Decision: live Execution Platform runtime and Work Queue state should use a
dedicated `execution_platform` database resolved from
`config.env.vars.EXECUTION_PLATFORM_DATABASE_URL`.

Consequences:

- Model Memory database reuse is no longer the live Execution Platform
  boundary.
- the old shared-runtime approval flag is not needed for this configuration.
- Work Queue planning/readback rows were copied into the dedicated database as
  bounded metadata and refs only.
- runtime jobs remain lifecycle truth and Work Queue remains
  projection/readback/control.
- gateway restart for this boundary must preserve port, auth, pairing, device
  identity, and ACP endpoint.

## 2026-05-15 Toolified Runtime Scheduling Before Product/Spec Proof

Decision: the next Product/Spec Planning live UX proof is blocked until the
runtime graph layer is toolified enough to make delegation, evidence, utility,
and progress first-class runtime operations.

Consequences:

- graph planning and graph execution are separate phases.
- complex work cannot run implementation before accepted decomposition.
- model-selected capabilities compile into canonical executable nodes.
- node selection must account for cost, quality, context distribution,
  specialization, parallelism, redundancy, and commitment evidence needs.
- Codex/GPT 5.5 cannot monopolize multi-commitment work unless the
  orchestrator records why cheaper/specialized nodes are unsuitable.
- Kimi is one implementation lane on the Non-Codex File-Edit Worker Loop, not
  a broad patch oracle or a separate proof-only worker path.
- Production non-Codex child work must be selected through qualified
  task-family metadata and evidence refs. Complex coding missions may not
  silently fall back to broad Codex implementation as their first move.
- Capability executor keys are execution-routing truth for scheduler nodes;
  generic node-kind/role fallbacks may not hide that a specialized executor is
  unavailable.
- node outputs must claim Mission Ledger commitments; generic artifacts do not
  imply closure.
- Work Queue readback must surface tool/app-server progress and active graph
  state.
- finalization must terminalize quickly as `needs_review` when worker evidence
  cannot be mapped to commitments.

## 2026-05-15 Product/Spec Planning Is Scheduler-First

Decision: `agent_team.product_spec_planning` is first-class but scheduler-backed only.

Consequences:

- generic workflow execution must reject Product/Spec Planning instead of producing fake contract artifacts
- Runtime Work Graph scheduler must require `planning_orchestrator` before Product/Spec Planning child nodes execute
- Product/Spec Planning can propose ActionGraphProposal and compile-readiness artifacts, but cannot create or execute child runtime jobs itself
- human planning input is bounded decision evidence and does not grant authority or mutate lifecycle; readback must show pending, accepted, rejected, and not-required states rather than a generic present/missing flag
- Work Queue readback displays planning artifacts, bounded decision options, bounded Mission Ledger evidence state, and graph state while runtime jobs remain lifecycle truth
- final success needs model-authored closeout plus accepted runtime evidence, not degraded/system-only closeout

## 2026-05-17 Product/Spec Planning Production Plugin

Decision: Product/Spec Planning production readiness requires a canonical
workflow plugin, not just a workflow contract and scheduler guardrails.

Consequences:

- `agent_team.product_spec_planning` is `production_ready` and
  `productionEnabled` in the workflow definition registry.
- `workflow-plugin.agent_team.product_spec_planning.v1` is registered in the
  default workflow plugin registry.
- production readiness fails if planner, research, capsule, human-task,
  action-graph, compiler, or closeout executor keys are missing.
- generic queued workflow dispatch still rejects Product/Spec Planning; only
  the Runtime Workflow Graph Engine plus scheduler path can satisfy production
  readiness.
- child action proposals remain proposal-only until a later compile/authority
  boundary creates runtime jobs or human tasks.
- Work Queue owner readback must expose bounded evidence buckets for workflow
  registration, executable node mapping, orchestrator-first proof,
  compile-readiness validation, and Mission Ledger evidence claim refs instead
  of forcing owners to infer those claims from mixed diagnostic reason codes.

## 2026-05-16 Mission Ledger Closure Is Claim-First

Decision: Mission Ledger commitments close from explicit node-authored
evidence claims, not from generic artifact refs or process completion.

Consequences:

- production scheduler nodes that advance Mission Ledger commitments must
  return `evidenceClaims` naming the commitment id, evidence ref, evidence
  kind, bounded summary, limitations, and raw-storage flags.
- deterministic code validates claim shape, known commitment ids, existing
  refs, storage flags, and impossible claim kinds; it does not judge semantic
  sufficiency.
- the model-authored Mission Ledger evaluator receives claimed evidence refs
  as the only acceptable closure candidates.
- malformed evaluator output gets one bounded repair pass; persistent failure
  moves the job to `needs_review` with diagnostic evidence.
- Work Queue owner readback must expose evidence-claim refs and active
  graph/tool progress so the owner can see what evidence is expected,
  produced, accepted, and still open.

## 2026-05-17 Commitment Packets Are The Child-Worker Boundary

Decision: scheduler child delegation must be packet-backed. A Mission Ledger
commitment compiles into `CommitmentWorkPacket`; context scout output is
passed as `ContextHandoffPacket`; non-Codex file-edit workers receive
`ImplementationTaskPacket v2`.

Consequences:

- child agents receive exact objectives, commitment ids, target refs,
  validation refs, and acceptance criteria instead of only a shortened task
  summary.
- Kimi and other non-Codex file-edit workers are judged from packet-aware
  diagnostics: target refs present, acceptance criteria present, packet ref,
  JSON/diff/search-replace shape, context requests, schema state, and
  validation outcome.
- runtime derives/validates schema and storage boundaries; models judge
  usefulness and sufficiency.
- scheduler graph edge tool traces cannot precede successful DB edge
  persistence. Symbolic future milestones are stored as metadata; unknown
  accidental node refs are rejected before DB write.

## 2026-05-17 Product/Spec Proof Readback Must Be Node-First

Decision: owner-facing Product/Spec proof diagnostics must preserve the latest
active node and Mission Ledger detail even when later bookkeeping events are
recorded.

Consequences:

- `work_queue_child_sync` events must not erase the active node objective,
  rationale, model, target refs, and cost-aware decision from Work Queue
  readback.
- Mission Ledger commitments shown to the owner include why each commitment
  matters and the expected evidence description.
- commitment work packets are bounded owner-visible progress refs; they prove
  the scheduler compiled Mission Ledger commitments into child-worker packets
  without storing raw prompt or response text.
- direct replay harnesses must stream bounded progress snapshots while the
  runtime worker is active. A silent terminal-only harness is not acceptable
  for diagnosing long Product/Spec runs.
- GPT 5.5 via Codex is the default advanced front-door model for long
  Product/Spec prompts; cheaper triage may allow/escalate but should not be
  the final advanced adjudicator.

## 2026-05-17 Context Supply Must Be Sufficient Before Worker Delegation

Decision: every delegated worker must receive enough input to succeed. Mission
Ledger commitments may stay high-level, but worker handoff packets and context
handoffs must be model-authored, bounded, and specific before implementation
workers run.

Consequences:

- `CommitmentWorkPacket` includes commitment meaning, context request hints,
  required evidence-claim descriptions, stop-if-missing rules, and quality
  review refs.
- source prompts are exposed to child workers through a bounded section index,
  not raw prompt storage.
- context scout may request bounded source-prompt excerpts by section ref; the
  runtime provides or denies those excerpts through traced `source_prompt.*`
  tool calls.
- prompt excerpts are volatile model input only. Persistent evidence stores
  prompt hash, excerpt hash, refs, bounded summaries, and raw-storage flags.
- implementation workers that require upstream context handoff stop as
  `needs_review` when no `ContextHandoffPacket` exists.
- deterministic code validates refs, bounds, storage flags, and handoff
  presence; model-authored review still judges context usefulness.

## 2026-05-17 Orchestration Is A Generic Workflow Contract

Decision: coding-team orchestration improvements must live in canonical
workflow contracts, not only in `agent_team.coding` runner code.

Consequences:

- every workflow definition has a `WorkflowOrchestrationPolicy` covering
  required phases, required/optional role classes, context needs,
  source-prompt access, cost-aware capability policy, human decision policy,
  runtime tool families, finalization policy, and readback policy.
- model-authored workflow behavior remains responsible for judgment:
  commitments, work-packet quality, context usefulness, capability rationale,
  evidence sufficiency, and closeout maximality.
- deterministic runtime owns schema, refs, bounds, raw-storage flags,
  capability/node envelopes, executor coverage, and lifecycle authority.
- future design, marketing, research, QA, docs, architecture, and planning
  teams must use the same Mission Ledger -> CommitmentWorkPacket -> Context
  Handoff -> Staged Scheduler -> Node Executor -> Evidence Claim ->
  Model Closeout chain.
- workflows that are registered but not executor-migrated stay
  `registered_needs_executor_migration`; registry presence alone cannot create
  production success.
- scheduler node results are validated against a generic node-result contract
  so coding-only evidence assumptions do not leak into new workflow families.

## 2026-05-17 Generic Runtime Before Product/Spec Proof

Decision: build the generic orchestration runtime engine before the next
Product/Spec Planning proof.

Rationale:

- the previous pass created policy/contract substrate, not a complete generic
  runtime engine.
- Product/Spec Planning is the first serious non-coding workflow proof and
  should validate the generic runtime, not a Product/Spec-specific workaround.
- building every future workflow first would over-abstract without proof, but
  running Product/Spec before the engine exists risks repeating the same
  orchestration failures.

Consequences:

- the immediate queue becomes:
  1. Generic Orchestration Runtime Engine.
  2. Generic Staged Scheduler Protocol.
  3. Generic Node Executor And Evidence Claim Contract.
  4. Product/Spec Planning Workflow Plugin Production Proof.
  5. Starter Workflow Plugin Migration.
  6. Future Team Workflow Readiness.
- items 1-3 are pre-Product/Spec blockers.
- Product/Spec Planning remains the first live proof of the generic runtime
  spine.
- design, marketing, research, docs, QA, and architecture should inherit the
  runtime after Product/Spec proves the path.

## 2026-05-17 Closeout Finalization Gates Production Success

Decision: production workflow success requires accepted closeout finalization
evidence, not only scheduler completion or a Closeout Capsule.

Consequences:

- `closeout.finalize` is a Runtime Tool-Call Kernel family.
- production dynamic workflows must produce a bounded finalization evidence
  packet and accepted finalization tool ref before clean success.
- degraded/system closeout remains diagnostic-only.
- bare `create_closeout`, process completion, missing validation/profile/
  readback/tool refs, open blocking commitments, raw storage, and authority or
  lifecycle mutation cannot satisfy clean success.
- Work Queue readback must show finalization packet refs, handoff refs,
  accept/reject refs, missing reason codes, maximality, limitations, ELI5, and
  next action.
