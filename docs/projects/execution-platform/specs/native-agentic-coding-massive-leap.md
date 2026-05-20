---
summary: "Detailed production specs for the twelve native agentic coding harness leaps required to move beyond brittle proof execution."
title: "Native Agentic Coding Massive Leap Specs"
---

# Native Agentic Coding Massive Leap Specs

Date: 2026-05-19

Status: active pre-Product/Spec and post-Product/Spec roadmap.

Update, 2026-05-19: the first item, Provider Tool-Call Capability Separation
And Kimi Tool-Caller Retirement, is implemented in the non-Codex worker loop
as a production gate. The runtime now resolves controller, context-decision,
patch, validation-repair, evidence, and escalation model slots separately;
Kimi is blocked as a production controller unless future qualification evidence
explicitly promotes it; Kimi patch-author use requires `reasoningMode: none`;
and Work Queue readback can surface model-slot and provider-capability gate
state from non-Codex implementation artifacts.

## Principle

The next harness upgrades are not prompt polish. They are runtime architecture
corrections. The repeated Product/Spec proof failures exposed the same boundary
class across multiple stages:

- models were asked to produce runtime-owned schema or giant JSON objects.
- workers were starved of the original prompt, concrete repo context, or
  worker-ready handoff detail.
- runtime accepted proof-shaped progress that was not executable work.
- expensive broad Codex lanes were selected when cheaper or more specialized
  lanes were under-specified.
- operator readback showed lifecycle labels, not the active decision, tool,
  file, validation, or blocker.

The canonical boundary is:

> Model decides semantic meaning, usefulness, sufficiency, objective, and
> repair strategy. Runtime owns schemas, refs, authority, persistence,
> lifecycle, tool execution, budgets, locks, validation, replay, and evidence
> storage.

Every item below must preserve that boundary. No item may reintroduce semantic
keyword forests, deterministic value judgments, giant patch JSON, degraded
closeout success, proof-only success paths, or live compatibility fallbacks.

## 1. Provider Tool-Call Capability Separation And Kimi Tool-Caller Retirement

Kimi has shown useful coding ability in bounded patch-generation tests, but it
has been unreliable as a long-running tool-calling controller inside the live
implementation lane. Treating one model as both controller and patch author
created no-content failures, long stalls, schema choke, and poor visibility.

Separate provider roles:

- controller model: selects next tool/action, requests context, classifies
  validation failures, chooses repair/escalation.
- patch author model: writes bounded edits after context snapshots are ready.
- reviewer/evidence model: maps runtime-owned file/validation refs to
  commitments.

Kimi is not the default controller for critical production edits until it
passes the controller qualification suite. Kimi may remain a patch author when
`reasoningMode: none`, bounded snapshots, exact edit objective, and validation
refs are present. Qwen or another fast coder model may serve as controller if
qualified. GPT-5.5 remains global reasoning/escalation.

Production objects: `ProviderCapabilityProfile`, `WorkerModelPolicy`, and
per-slot model budget records.

Success gates:

- Kimi critical-path controller use is disabled unless profile-qualified.
- Kimi patch calls use `reasoningMode: none` unless a benchmark proves another
  mode is better.
- worker loop can substitute a qualified controller without changing task
  semantics.
- Work Queue shows controller model, patch model, phase, timeout, and fallback
  reason when a slot changes.

Implementation requirements now satisfied:

- `ProviderCapabilitySlotProfile` and `ProviderCapabilitySlotGate` describe
  slot-level production qualification for controller, context-decision, patch,
  validation-repair, evidence, and escalation.
- the non-Codex worker loop evaluates that gate before any provider call.
- Kimi controller/context/repair/evidence/escalation slots fail closed with
  bounded reason codes.
- Kimi patch-author use remains production-qualified only with
  `reasoningMode: none`.
- readback metadata includes model slot policy and gate state.

Priority: pre-Product/Spec.

## 2. Edit Transaction Engine

Patch JSON makes the model responsible for file edit schema, diff boundaries,
and final shape. This is fragile. Codex-like agents succeed because the runtime
owns reads, writes, apply, validation, rollback, and evidence.

Introduce an `EditTransactionEngine` used by all non-Codex file-edit workers
and eventually by other code-writing roles. The engine owns transaction id,
target and denied scope, before snapshots, runtime patch application, conflict
detection, validation command refs, changed-file refs, rollback/discard,
commitment evidence mapping, and bounded artifacts.

Tool surface:

- `edit_transaction.start`
- `edit_transaction.read_file`
- `edit_transaction.plan`
- `edit_transaction.apply_patch`
- `edit_transaction.validate`
- `edit_transaction.repair`
- `edit_transaction.emit_evidence`
- `edit_transaction.rollback`
- `edit_transaction.close`

Success gates:

- production non-Codex edits cannot bypass edit transactions.
- changed files are always tied to transaction refs.
- validation failure can repair within the same transaction.
- Work Queue readback shows transaction phase, files touched, validation
  command, repair count, and evidence refs.
- no clean success from natural-language "I edited" claims.

Implementation requirements now satisfied:

- `EditTransactionEngine` is the runtime-owned mutation boundary for the
  non-Codex worker loop. It owns transaction ids, target/denied scope,
  before snapshots, apply results, validation refs, repair count, evidence
  claim refs, rollback refs, bounded reason codes, and raw-storage flags.
- `worker.edit.plan`, `worker.edit.apply_patch`, `worker.validation.run`,
  and `worker.evidence.claim` now attach transaction metadata to runtime tool
  results. A completed non-Codex worker result requires an accepted closed
  transaction, changed-file refs or accepted no-op evidence, validation refs,
  and commitment-linked evidence claims.
- the runtime tool registry exposes the canonical edit-transaction tool
  surface: `edit_transaction.start`, `read_file`, `plan`, `apply_patch`,
  `validate`, `repair`, `emit_evidence`, `rollback`, and `close`.
- failed schema/contract validation rollback now delegates to the transaction
  engine when a transaction exists.
- file-edit adapter diagnostics, scheduler progress, and Work Queue readback
  surface edit transaction refs, phase, status, repair count, changed files,
  validation refs, and evidence refs.

Priority: pre-Product/Spec.

## 3. Worker Controller / Author / Applicator Split

The current worker loop still risks asking one model call to inspect context,
choose tools, write edits, fit schema, classify errors, and emit evidence. That
recreates the same overload seen in scheduler graph construction.

Split implementation workers into three runtime phases:

1. Controller: decides next step and missing context.
2. Author: writes bounded edit intent or patch content for one transaction.
3. Applicator: runtime applies edits, runs validation, persists refs, and
   returns structured results.

The controller may call the author multiple times. The author never owns
lifecycle or persistence. The applicator never judges semantic sufficiency.

Success gates:

- controller can request more context before authoring.
- author cannot invent file refs or validation authority.
- applicator result is replayable without redoing upstream model calls.
- repeated failures classify before retry.

Implementation requirements now satisfied:

- `worker-controller-author-applicator.ts` defines the canonical split-phase
  contracts for controller decisions, edit-author requests/results,
  runtime-applicator requests/results, context requests, repair decisions,
  evidence authoring, escalation, phase refs, and bounded phase records.
- production `ModelAgnosticFileEditWorkerAdapter` invokes the non-Codex worker
  loop with strict phase authority. Context/controller slots may gather context
  and select next work, the patch slot authors edit plans/content, runtime
  applicator phases apply through `EditTransactionEngine`, validation/repair
  slots classify and repair failures, and evidence slots claim commitment
  evidence.
- strict production phase authority blocks controller/context slots from
  applying source edits directly. Blocked phase attempts become bounded worker
  phase evidence and cannot mutate files through the controller path.
- worker loop results, adapter diagnostics, scheduler progress, and Work Queue
  readback now expose worker phase refs/records alongside edit transaction
  refs, model slots, validation refs, and evidence refs.
- direct low-level diagnostic loop usage remains available for parser/tool
  mechanics tests, but production adapter execution uses strict split-phase
  policy.

Priority: pre-Product/Spec.

## 4. Provider Capability Profiles

The scheduler cannot choose the cheapest sufficiently capable worker if the
manifest only says a model exists. Weak profiles bias the orchestrator toward
GPT-5.5/Codex because it is obviously strongest.

Capability profiles become runtime truth for worker selection. Each profile
records role class, worker ref, model policy slot, cost class, latency class,
context capacity, ideal task size, tool access, qualified evidence kinds,
failure modes, and escalation policy. The model chooses semantic fit and
rationale. Runtime derives executable node kind, executor key, worker ref,
evidence profile, budget, and allowed tools.

Success gates:

- broad Codex use requires explicit cost/quality justification for
  multi-commitment missions.
- scheduler sees cheaper qualified alternatives when available.
- unqualified profiles cannot be selected for production nodes.
- profile readback shows why a worker was selected or rejected.

Implementation requirements now satisfied:

- `ProviderCapabilityProfile` and `ProviderCapabilityProfileRegistry` are
  registry-derived runtime objects, not a parallel editable manifest. Each
  profile is derived from `RuntimeNodeCapability` and carries profile id,
  capability id, graph node kind, executor key, worker ref, workflow/phase
  support, role class, model policy refs, qualification refs, production
  selectability, tool refs, authority boundaries, task-size limits, context
  capacity, cost/latency classes, evidence kinds, budget policy, failure modes,
  escalation targets, and raw-storage false flags.
- cost-aware capability validation now evaluates provider profile existence,
  production selectability, workflow support, qualification requirements, and
  raw-storage flags. Contract-only or diagnostic profiles cannot satisfy
  production node selection.
- model-facing manifests expose capability/profile fitness data while omitting
  runtime-owned executable fields. Models select capability/profile fit and
  rationale; runtime derives node kind, executor key, worker ref, evidence,
  budget, and tool authority.
- compiled scheduler nodes and node execution progress now surface profile
  readback: selected profile id, worker ref, role class, cost/latency,
  context capacity, production qualification requirements, selected model
  qualification profile, qualification refs, and considered profile ids.
- source-edit qualification defaults now prefer the Kimi patch-author
  qualification profile for implementation evidence instead of accidentally
  treating the Qwen controller slot as the source-edit qualification proof.

Priority: pre-Product/Spec.

## 5. Context Freshness And Snapshot Discipline

Workers can receive stale or too-thin context after replay, synthesis, or graph
repair. Implementation then fails downstream, but the visible symptom appears
at Kimi, validation, or graph scheduling.

Every worker-facing packet includes context freshness metadata. Runtime
validates context before node execution and lets workers request missing or
stale context.

Production object: `ContextSnapshotRef` with source ref/kind, captured time,
repo revision, prompt hash, commitment ids, staleness policy, and scope
summary.

Success gates:

- implementation cannot run on missing required context.
- stale replay checkpoints are blocked or refreshed.
- Work Queue shows context age, repo revision, source prompt hash, and
  refresh status.
- runtime distinguishes "context insufficient" from model failure.

Implementation requirements now satisfied:

- `ContextSnapshotRef` is the bounded runtime object for source prompt
  indexes/excerpts, Mission Ledger/packet context, context scout handoffs,
  context synthesis, file snapshots, validation results, boundary replay
  checkpoints, and future memory context packs.
- source prompt indexing and excerpt fulfillment emit prompt-hash-bound
  snapshot refs instead of relying on free-form context summaries.
- Commitment Work Packets, context handoff packets, implementation task
  packets, context synthesis artifacts, and boundary replay checkpoints carry
  required/provided/stale/missing/rejected snapshot refs, freshness status,
  refresh action, and bounded summaries.
- production workflow plugins require fresh context snapshots before worker
  execution. The Runtime Work Graph scheduler blocks worker/provider calls
  before implementation, validation, repair, review, docs/planning, or closeout
  style nodes execute when required snapshots are missing, stale, rejected, or
  unknown.
- scheduler progress and Work Queue active graph readback surface context
  freshness state, refresh action, source prompt hash, repo/worktree identity
  fields when available, and owner-readable blocker summaries.

Priority: pre-Product/Spec.

## 6. Repo-Analysis Context Scout

Context scout has still behaved too much like a JSON role response plus a
grounding parser. It needs to inspect the repository like a coding agent:
search, read, inspect symbols, compare tests, and produce worker-ready context.

Context scout becomes a tool-loop repo-analysis worker. One scout should run
per commitment packet when structurally safe; a synthesis node joins the
results before implementation graph selection.

Tool surface:

- `repo.search`
- `repo.list_files`
- `file.read`
- `file.inspect_symbols`
- `test.find_related`
- `context.handoff`
- `context.limitations`
- `context.evidence_claim`

Success gates:

- scout output includes model-authored repo findings, not just runtime-added
  verified refs.
- `runtime supplied refs only` is `accepted_with_limitations`, not clean
  success.
- scouts run concurrently by commitment packet under provider concurrency
  limits.
- synthesis receives all accepted/limited scout handoffs and explicitly
  decides whether implementation may proceed.

Implementation requirements now satisfied:

- context scout repo analysis operations are registered as canonical runtime
  tools: `repo.search`, `repo.list_files`, `file.read`,
  `file.inspect_symbols`, `test.find_related`, `context.handoff`,
  `context.limitations`, `context.evidence_claim`, and
  `context.request_more_context`.
- production context scout execution emits canonical repo-analysis tool traces
  in addition to the sufficiency/review boundary, with bounded file refs,
  bounded symbol/test refs, handoff summaries, limitations, evidence refs, and
  raw-storage false flags.
- `ContextHandoffPacket` now carries commitment packet refs, source-prompt
  excerpt refs, symbol refs, test refs, synthesis handoff summary, and context
  evidence refs so context synthesis and implementation workers do not have to
  infer repo intent from generic artifacts.
- `ContextScoutToolLoopRun` includes model-authored repo analysis findings,
  synthesis readiness, synthesis blockers, verified/rejected refs, runtime
  tool invocation refs, and sufficiency review state. Runtime-supplied refs
  alone cannot become clean scout success.
- the parallel context scout boundary replay materializes the intended graph
  shape for isolated testing: one scout per packet, a
  `context_synthesis_global_barrier` node, and `context_supplies` edges from
  each scout to synthesis with readiness/blocker metadata.
- Work Queue active graph readback now exposes context scout synthesis
  readiness, blockers, symbol refs, test refs, repo-analysis finding counts,
  and synthesis handoff summaries beside tool-loop/runtime-tool refs.

Priority: pre-Product/Spec.

## 7. Safe Parallelism And Supersteps

Parallel context scouts and implementation leaves are needed for latency and
context distribution, but uncontrolled parallelism can create file conflicts,
validation conflicts, provider throttling, and unreadable operator state.

Runtime computes dependency layers and conflict domains. The scheduler proposes
semantic parallelism; runtime decides legal supersteps.

Conflict domains:

- file write paths.
- validation resources.
- DB/runtime refs.
- Work Queue refs.
- provider/model concurrency.
- human decision refs.
- graph dependency edges.

Provider/model concurrency is not a binary conflict domain. Runtime treats it
as a counted budget: provider/profile/model peers may run together up to the
declared `providerConcurrencyLimit`, while excess siblings remain planned for
the next superstep. This prevents the old false serialization where a shared
provider class acted like a mutex and erased the latency benefit of parallel
context scouts or scoped implementation leaves.

Success gates:

- context scouts run in parallel when independent.
- implementation nodes run in parallel only when conflict-free.
- failed branch does not rerun accepted sibling branches.
- Work Queue shows frontier, running nodes, lock conflicts, join readiness,
  and blocked branches.
- Work Queue shows provider concurrency budget key, limit, runnable nodes,
  selected nodes, and skipped nodes for each bounded provider/model budget.

Priority: pre-Product/Spec for scout/frontier; worktree-per-node can follow
after proof for broader parallel edits.

## 8. Worktree Per Implementation Node

Parallel implementation is limited if all workers edit the same working tree.
Even with locks, one broad workspace encourages serialization and raises the
cost of failed branches.

Each implementation node may run in an isolated worktree or patch workspace.
Runtime merges accepted transactions through the Edit Transaction Engine with
conflict detection and validation.

Success gates:

- independent implementation nodes do not block on a shared mutable workspace.
- merge conflicts become scheduler evidence, not silent failure.
- validation can run per branch and after merge.
- Work Queue shows branch workspace, merge state, conflicts, and cleanup.

Priority: post-Product/Spec unless the proof reaches implementation
parallelism and shared-workspace locking becomes the blocker.

## 9. Production Boundary Replay

Replay harnesses are essential for not redoing expensive upstream gates, but
they must be production-faithful. A replay that diverges from live UX or native
runtime creates false confidence.

Boundary replay becomes a production runtime service, not a proof script. It
records and resumes from accepted boundaries while using the same workflow
definition, scheduler, repositories, capability profiles, tool kernel, and node
executors as live UX.

Boundaries: router/front-door payload, Mission Ledger, commitment packet
author, packet review, context scouts, context synthesis, graph compile, node
selection, worker transaction, validation, review, closeout, and Work Queue
readback.

Success gates:

- replay checkpoint includes input hash, output hash, accepted state,
  freshness, authority, repo revision, and identity binding.
- replay cannot use stale or incompatible upstream artifacts.
- replay from a boundary skips only accepted upstream work.
- replay and UX payloads have parity evidence.
- replay planning evaluates the latest checkpoint for each required boundary,
  so a stale or blocked later checkpoint cannot be hidden by older accepted
  artifacts.
- accepted replay plans produce a production continuation contract through
  `GenericOrchestrationRuntime.runSchedulerGraph` and
  `RuntimeWorkGraphScheduler.run`, not a proof-script executor.
- Work Queue readback shows exact continuation action, continuation mode,
  latest accepted checkpoint, skipped upstream boundaries, resume artifact
  refs, and invalid replay reason codes.

Priority: pre-Product/Spec.

## 10. First-Class Validation / Test Worker

Validation cannot be a command afterthought. It must plan what to run, execute
through runtime, summarize failures, map them to commitments, and feed repair.

Validation is a scheduler node with its own model/tool loop and runtime-owned
command execution.

Tool surface:

- `validation.plan`
- `validation.select_commands`
- `validation.run_command`
- `validation.summarize_result`
- `validation.classify_failure`
- `validation.map_failure_to_commitments`
- `validation.propose_repair_plan`
- `validation.review_coverage`
- `validation.accept_validation_evidence`
- `qa.review_work_product`
- `qa.review_evidence_sufficiency`

Success gates:

- no success without validation evidence for commitments requiring validation.
- recoverable failures return repair work to the scheduler.
- failed validation does not terminalize the whole job unless unrecoverable.
- validation readback shows command, duration, failure summary, commitment
  impact, and repair node.

Implementation requirements now satisfied:

- `ValidationTaskPacket` v2 is the canonical production validation handoff.
  It carries workflow id, Mission Ledger refs, Commitment Work Packet refs,
  context snapshot refs, approved validation command definitions, validation
  objective, target/changed file refs, implementation output refs, expected
  evidence classes, failure mapping expectations, repair handoff
  expectations, downstream consumer, budget refs, stop/escalation conditions,
  and raw-storage false flags.
- validation/QA runtime tools include command selection, command execution,
  result summary, failure classification, failure-to-commitment mapping,
  repair planning, coverage review, evidence acceptance, and QA sufficiency
  review. `validation.run_command` requires both an approved command ref and
  the runtime-owned command definition.
- arbitrary shell-shaped strings are not converted into approved validation
  refs. Runtime accepts only bounded approved refs or known safe
  runtime-approved `pnpm test:file` / `pnpm tsgo:*` command shapes.
- production scheduler validation nodes emit bounded Work Queue progress for
  planning, command selection, each command run, command result, failure
  classification, repair handoff, accepted evidence packet creation, and
  validation boundary checkpoint recording.
- recoverable validation failure creates same-job repair node/edge handoff
  evidence with failed validation refs, failure classification refs,
  failure-to-commitment refs, repair plan refs, target refs, changed file refs,
  and validation command refs to rerun.
- Work Queue readback surfaces validation command refs/summaries, current
  command ref/status, result refs, failure refs, repair plan refs, repair node
  refs, repair handoff refs, evidence packet refs, blocking commitment ids,
  latest summary, and raw command log false flags.

Priority: pre-Product/Spec.

## 11. Span-Level Observability And Readback

The owner repeatedly lacked visibility into what was happening during long
model calls, packet authoring, scout fanout, graph selection, and Kimi edits.
Log-line storage is not enough; the operator needs active span state.

Every model call, tool call, worker phase, scheduler decision, validation
command, transaction, repair, replay checkpoint, and closeout step emits a
bounded span with start, heartbeat, progress, completion/failure, refs, and
owner-readable summary.

Success gates:

- Work Queue readback can answer: what is running, why, which model/tool, what
  input refs, what output refs, what blocker, and what happens next.
- long calls emit heartbeat/progress spans.
- no stage can be opaque for minutes without diagnostic state.
- spans are bounded and do not store raw provider output.

Implementation requirements now satisfied:

- `RuntimeExecutionSpan` v1 is the canonical bounded span contract for
  scheduler/model/tool/worker/validation/transaction/replay/closeout phases.
- scheduler-backed coding-team progress emits `runtime_execution.span` events
  and span refs from the central progress path, so every scheduler phase,
  model-call heartbeat, graph node, validation command, closeout finalization,
  and boundary replay checkpoint has bounded span readback.
- Runtime Tool-Call Kernel trace events and invocation metadata now carry
  execution span metadata without creating a second lifecycle truth source.
- RuntimeWorkerSupervisor emits supervisor heartbeat and adapter execution
  spans for claim/lease/adapter visibility.
- Work Queue `activeGraphProgress.spanProgress` projects active, recent,
  stale, and blocked spans with model/tool/worker refs, objective, input and
  output refs, evidence refs, blocker, next action, and ELI5.
- clean closeout finalization requires runtime execution span refs in the
  Closeout Evidence Packet; missing span coverage is needs-review evidence,
  not clean production success.

Priority: pre-Product/Spec.

## 12. Repair Classification Before Retry

Retries without classification waste time and can make the system more
fragile. A failure may come from missing context, invalid schema, stale replay,
provider timeout, insufficient worker capability, validation failure, or bad
upstream decomposition.

Every repair loop starts with failure classification. The classifier is
model-authored where semantic judgment is required and runtime-owned where
shape/authority/ref validation is required.

Implementation status, 2026-05-19:

- `RuntimeRepairClassification` v1 is the canonical bounded repair packet.
  It records runtime job, workflow, graph, node, failed boundary, failed span
  refs, failed scheduler decision, runtime tool refs, commitment ids, field
  paths, failure class, repair strategy, selected repair boundary, preserved
  refs, resume checkpoint refs, next action, stop/escalation condition, and
  raw-storage false flags.
- production scheduler node failures and needs-review outcomes record repair
  classification through `scheduler.classify_repair_or_escalation` before the
  scheduler returns to orchestrator repair.
- context freshness blocks now classify as context/stale-context repair
  evidence before worker retry is possible.
- needs-review retry decisions are rejected unless the target node carries a
  previous repair classification ref and the classification strategy permits
  repair. `terminal_needs_review` and `no_retry` classifications cannot be
  retried as same-node work.
- worker-internal retry loops use the same classification contract and the
  shared retry gate. The non-Codex tool worker records classifications before
  validation repair, missing actionable repair-tool retry, stale patch context
  refresh, provider no-content handling, timeout escalation, and terminal
  needs-review handoff.
- Work Queue active graph readback exposes latest repair classification state
  with failure class, failed boundary, repair strategy, selected repair
  boundary, affected commitments, failed field paths, reason codes, semantic
  review requirement, and expected next action.
- Work Queue Kimi/non-Codex implementation readback exposes worker-internal
  repair classification refs and bounded summaries so retry evidence is
  inspectable before the scheduler receives the final node result.

Failure classes include missing context, stale context, schema boundary
failure, provider no-content, provider timeout, unavailable tool, scope block,
repairable validation failure, unrecoverable validation failure, worker
capability insufficiency, upstream packet insufficiency, graph structure
insufficiency, and missing closeout evidence.

Success gates:

- no blind same-kind retry after a failure.
- repair cites failed span/decision id, failed field/path/ref, preserved
  fields, and proposed next action.
- if failure belongs upstream, scheduler resumes at the upstream boundary.
- Work Queue readback shows failure class and why the selected repair is
  expected to work.

Priority: pre-Product/Spec.

## Consolidated Pre-Proof Gates

Before rerunning the Product/Spec proof as a completion attempt, the platform
must prove:

1. context packets are authored with full prompt access and worker-ready
   detail.
2. context scouts run as repo-analysis tool loops and can fan out in parallel.
3. synthesis gates implementation graph creation.
4. graph selection uses capability profiles and avoids Codex monopoly unless
   justified.
5. non-Codex implementation uses edit transactions, not giant patch JSON.
6. validation is a first-class scheduler node.
7. repair classifies before retry.
8. replay can resume from the relevant accepted boundary.
9. Work Queue readback exposes active spans and blockers.
10. final success requires Mission Ledger evidence, validation, readback, and
    accepted model-authored closeout.

## Work Queue Mapping

Pre-Product/Spec items:

- Provider Tool-Call Capability Separation And Kimi Tool-Caller Retirement.
- Edit Transaction Engine.
- Worker Controller / Author / Applicator Split.
- Provider Capability Profiles.
- Context Freshness And Snapshot Discipline.
- Repo-Analysis Context Scout.
- Safe Parallelism And Supersteps.
- Production Boundary Replay.
- First-Class Validation / Test Worker.
- Span-Level Observability And Readback.
- Repair Classification Before Retry.

Post-Product/Spec item:

- Worktree Per Implementation Node, unless parallel implementation reaches
  shared-workspace conflict before proof completion.

## Confidence Review

The strategy is robust because the solution removes the known brittle boundary
classes instead of patching individual proof failures:

- giant model JSON is replaced by staged tools and runtime-owned schemas.
- broad worker selection is replaced by qualified capability profiles.
- stale/missing context becomes an explicit runtime state.
- context scout becomes a repo tool worker.
- implementation becomes transactions.
- validation and repair become graph nodes.
- replay becomes a production-faithful service.
- observability becomes span-level operator readback.

The main residual risk is implementation depth, not strategy. The queue must
not mark these complete from documentation or harness existence alone; each
item closes only with production wiring, focused tests, boundary replay proof,
Work Queue readback evidence, and no remaining production fallback path.
