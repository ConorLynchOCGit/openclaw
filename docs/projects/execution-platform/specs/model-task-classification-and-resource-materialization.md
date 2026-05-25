# Model Task Classification And Resource Materialization

Date: 2026-05-20

Status: source-of-truth pre-Product/Spec proof blocker. This spec converts
the latest Product/Spec proof failure into a generic runtime architecture
upgrade rather than a Product/Spec-specific patch.

2026-05-21 update: the resource-materialization principle now explicitly
extends to context scout. The follow-on spec
`context-scout-execution-packet-and-request-context-repair.md` defines the
`ContextScoutExecutionPacket`, context-scout provider timeout derivation, and
semantic request-context repair compiler required before the Product/Spec
proof can proceed.

2026-05-21 later update: resource materialization also requires a canonical
payload/body storage boundary. The Product/Spec proof for
`native-exec-78e1b33861780884` reached implementation resource
materialization and failed because full implementation packet bodies were
still written to artifact metadata. The follow-on spec
`runtime-artifact-payload-store-and-bounded-manifests.md` defines the
payload store, bounded manifests, hydration path, and replay gate.

2026-05-22 update: the Product/Spec proof for
`native-exec-5a786db6b86b6c6d` exposed a task-class budget mismatch inside
packet authoring. The semantic packet author uses `local_semantic_extraction`
and may need a larger output budget; targeted field completion uses
`schema_normalization` and must use the schema-normalizer's smaller token and
timeout policy. Runtime model-call preflight should block mismatched
requests, but the caller must preserve the exact policy mismatch instead of
relabeling it as model semantic failure. Packet targeted normalization now
has a distinct 2,400 token / 30s budget and packet fanout failures terminalize
as a typed `needs_review` boundary.

2026-05-22 second update: the Product/Spec proof for
`native-exec-560e1b96c47fae7a` exposed the same bounded-manifest principle at
the generic orchestration runtime result boundary. The runtime result artifact
must not inline the full scheduler result after a large dynamic graph run.
It now stores a bounded manifest with node/ref counts, capped ids/refs,
readiness summary, and scheduler summary; the full scheduler state remains in
runtime graph snapshots, scheduler progress, role invocation artifacts, and
payload-backed node resources.

## Problem

The latest Product/Spec Planning proof showed that the scheduler can create a
reasonable high-level work graph, run context scout, and record context
freshness. It still failed before implementation because the implementation
node did not receive worker-ready resources:

- target file refs were missing.
- target file snapshots were missing.
- target snapshot hashes were missing.
- readable file snapshots were missing.
- context freshness was reported as satisfied even though executable
  implementation resources were absent.

That is not a Kimi/Qwen implementation failure. It is a resource
materialization failure between context handoff and worker invocation.

The generic lesson is broader: every node executor needs a canonical resource
packet before execution. Context freshness, useful handoff text, and
commitment mapping are necessary, but they are not sufficient to run a node.
The runtime must compile workflow-specific resources into a canonical
`NodeExecutionPacket` and make readiness state a single source of truth.

## Governing Principle

Models own semantic work:

- task meaning.
- rationale.
- usefulness.
- sufficiency judgment.
- capability fit.
- review and closeout judgment.

Runtime owns execution substrate:

- schema.
- refs.
- resource materialization.
- snapshots and hashes.
- authority.
- persistence.
- lifecycle.
- budgets and timeouts.
- tool execution.
- canonical readiness state.

No model should be asked to invent runtime-owned fields such as executable
node ids, executor keys, worker refs, snapshot hashes, storage flags,
authority grants, evidence enums, or lifecycle transitions.

## Queue Item 1: Model Task Classification And Utility Router v2

Implementation status: complete on 2026-05-20.

Production artifacts:

- `extensions/execution-platform/src/model-tasks/model-task-classification.ts`
  defines the canonical task classes, policies, retry/escalation settings,
  telemetry envelope, policy exceptions, and resource-materialization
  provider-call guard.
- `extensions/execution-platform/src/model-tasks/model-call-runtime-tool.ts`
  requires task classification metadata for `model.call` and emits bounded
  policy/telemetry metadata without raw prompt/response/provider storage.
- Dynamic coding-team global reasoning, packet, scheduler, context synthesis,
  role-model, and non-Codex tool-selection call sites now pass task
  classification metadata through the runtime progress path.
- `extensions/execution-platform/src/observability/runtime-execution-span.ts`
  and `extensions/execution-platform/src/work-queue/execution-read-model.ts`
  expose task class, policy ref, reasoning mode, parser mode, and telemetry
  in owner-facing progress/readback.

Validation evidence:

- focused classifier/readback tests passed.
- focused dynamic graph runner tests passed.
- proof artifact:
  `.artifacts/execution-platform/model-task-classification-proof.json`.

### Purpose

Make model selection and runtime policy depend on task shape, not on a loose
role name or a prompt-level instinct to use the strongest model.

### Canonical Task Classes

`global_reasoning`

- Used for Mission Ledger, cross-commitment decomposition, architecture
  tradeoffs, graph structure review, maximality review, and final closeout
  sufficiency.
- Default model policy: strongest reasoning lane.
- Reasoning mode: high enough for global tradeoffs.
- Timeout: long, with progress spans.
- Retry: bounded repair only from field-specific diagnostics.
- Escalation: human review when the same structural blocker repeats.

`local_semantic_extraction`

- Used for commitment packet substance, context scout summaries, validation
  summaries, evidence summaries, source prompt excerpt interpretation, and
  localized handoff drafting.
- Default model policy: fast no/low-reasoning lane qualified for structured
  output.
- Reasoning mode: none or minimal.
- Timeout: short per item, retry only failed item.
- Escalation: stronger model only when output is empty, unusable, or fails
  substance gates after bounded retry.

`schema_normalization`

- Used for enum selection, field completion, alias repair, result
  normalization, and contract completion after semantic content exists.
- Default model policy: fast structured lane.
- Reasoning mode: none.
- Timeout: very short.
- Retry: field-specific only; do not regenerate full objects.
- Escalation: runtime terminalizes as needs_review if a valid structured
  patch cannot be produced.

`tool_selection`

- Used when the model chooses among model-visible tools or capabilities.
- Default model policy: fast structured lane for local choices; reasoning
  lane for global tradeoff choices.
- Runtime compiles tool ids, authority, refs, budgets, storage flags, and
  invocation envelopes.

`resource_materialization`

- Runtime-only class. No provider call should own this class.
- Produces `NodeExecutionPacket`s and domain resource packets.
- Runtime resolves refs, reads allowed files, snapshots resources, hashes
  payloads, validates authority, and records tool traces.

`implementation_patch`

- Used for bounded file edits from accepted implementation task packets.
- Default model policy: qualified implementation lane based on task size,
  file count, tool needs, validation risk, and cost.
- Reasoning mode: none/minimal for patch authoring unless the task is
  architecture-heavy.
- Runtime owns edit transaction, file reads, patch application, validation,
  rollback, and evidence claims.

`validation_classification`

- Used for validation result interpretation, failure-to-commitment mapping,
  and repair plan drafting.
- Default model policy: fast semantic lane for local failures; reasoning lane
  for cross-system ambiguity.
- Runtime owns command execution, command refs, bounded result refs, and
  validation evidence packets.

`closeout_judgment`

- Used for final maximality, sufficiency, and limitation judgment.
- Default model policy: strongest reasoning lane.
- Runtime owns evidence packet refs, profile gates, Mission Ledger status,
  tool trace coverage, Work Queue readback refs, and finalization lifecycle.

### Runtime Contract

Every model call must be classified before dispatch. The classification
selects:

- model policy ref.
- provider/model ref.
- reasoning mode.
- response format and parser mode.
- timeout and heartbeat budget.
- retry and escalation rules.
- token/cost telemetry requirements.
- raw-storage flags.
- expected output contract.

Classification is deterministic by call site and workflow definition. The
model may justify exceptions, but runtime must record the exception and the
policy ref that allowed it.

### Acceptance Criteria

- model calls in router, Mission Ledger, packets, context scout, scheduler,
  implementation, validation, and closeout are tagged with one canonical task
  class.
- Work Queue/readback can show phase, task class, model ref, reasoning mode,
  timeout, retry count, token/cost where available, and escalation reason.
- fast structured models are not asked to perform global reasoning.
- reasoning models are not used for trivial schema normalization unless an
  explicit escalation reason exists.

## Queue Item 2: Generic Node Resource Materialization Layer

### Purpose

Create a workflow-agnostic `NodeExecutionPacket` and resource compiler so
every graph node receives the resources needed to execute, or blocks before
provider/tool invocation.

### NodeExecutionPacket

Required base fields:

- `packetId`
- `workflowId`
- `runtimeJobId`
- `graphId`
- `nodeId`
- `nodeKind`
- `capabilityId`
- `executorKey`
- `workerRef`
- `targetCommitmentIds`
- `sourcePacketRefs`
- `sourceContextRefs`
- `resourcePacketKind`
- `resourcePacketRef`
- `readinessStatus`
- `readinessReasonCodes`
- `blockingLimitations`
- `nonblockingLimitations`
- `validationRefs`
- `evidenceClaimExpectations`
- `authorityScope`
- `storagePolicy`
- `budgetPolicy`
- `rawPromptStored: false`
- `rawResponseStored: false`
- `rawProviderLogStored: false`
- `rawToolLogStored: false`

The base packet is generic. Domain-specific resource packets supply the
workflow payload.

### Coding Resource Packet

For coding nodes, the compiler must produce:

- resolved target file refs.
- readable target file snapshots.
- file snapshot hashes.
- allowed edit scope.
- explicit new-file intents when no existing file target exists.
- parent directory snapshots for new files.
- must-read refs.
- likely-modify refs.
- existing APIs/types/symbols.
- related tests.
- validation command refs or validation discovery plan.
- dependency notes.
- expected patch shape.
- worker-facing objective.
- stop-if-missing rules.

Directory refs may seed resource discovery. They do not satisfy
implementation readiness.

### Future Domain Packets

The same materialization layer should support domain-specific packets:

- research: source refs, freshness status, citation refs, external-assumption
  expiry, blocked-source diagnostics.
- planning: Planning Capsule refs, decision refs, proposal refs, compile
  readiness refs.
- design: brand asset refs, target surface refs, style constraints,
  accessibility constraints, screenshot/mockup refs.
- marketing: audience refs, channel refs, offer refs, compliance constraints,
  source-fact refs.
- memory/proactivity: retrieval refs, memory freshness, supersession/conflict
  refs, context pack refs, owner-review gates.
- QA: validation plan refs, command refs, environment refs, result refs,
  failure classification refs.

### Runtime Tools

The materialization layer exposes runtime tools:

- `node.compile_execution_packet`
- `node.evaluate_readiness`
- `node.record_readiness_blocker`
- `node.promote_ready_packet`
- `node.plan_resource_repair`

Workflow plugins provide domain compilers. The generic runtime owns the base
packet lifecycle and readiness semantics.

### Acceptance Criteria

- scheduler-backed production nodes cannot execute without a
  `NodeExecutionPacket`.
- node readiness is evaluated from the packet, not from scattered graph
  metadata.
- materialization failures route to context repair, split, human decision,
  or needs_review before any worker/model invocation.
- Work Queue readback shows resource packet kind, packet ref, readiness
  status, missing resources, blocking limitations, nonblocking limitations,
  and next repair action.

## Queue Item 3: Implementation Context Snapshot Compiler

Queue Item 2 implementation status: **complete 2026-05-20**. The runtime now
owns `NodeExecutionPacket` compilation, coding resource packet compilation,
readiness evaluation, scheduler resource-materialization tools, production
coding workflow enforcement, DynamicAgentTeamGraphRunner pre-worker packet
attachment, Work Queue resource readback, and the TS validation tooling repair
needed for the next pass.

Queue Item 3 implementation status: **complete 2026-05-20**. The production
coding-team runner now compiles an `ImplementationContextPacket` before
worker invocation, snapshots target files, verifies new-file parent
directories, treats directory refs as discovery seeds, emits implementation
task packet refs, and blocks implementation when context/materialized
resources are incomplete.

### Purpose

Fix the current Product/Spec blocker by compiling context handoffs into
worker-ready implementation resources.

### Runtime Tools

`context.resolve_target_refs`

- input: work-intent node, accepted context handoff refs, context packet refs,
  likely repo areas, and code-intelligence refs.
- output: resolved target refs, missing refs, nonexistent refs, directory-only
  refs, candidate files, new-file-intent candidates.
- runtime owns path resolution, repo/workspace root resolution, and authority
  checks.
- implemented as a runtime-owned compiler boundary in
  `implementation-context-snapshot-compiler.ts`; model output may supply
  candidate target intent, but not executable path authority.

`repo.snapshot_target_files`

- input: resolved file refs and allowed read scope.
- output: file snapshots, hashes, repo revision, freshness status, missing or
  unreadable diagnostics.
- runtime owns file reads and snapshot persistence.
- snapshots store refs/hashes/byte counts only; raw file content is not
  persisted in runtime tool traces.

`context.compile_implementation_context_packet`

- input: resolved refs, file snapshots, handoff summary, existing APIs/types,
  tests, validation hints, limitations.
- output: coding resource packet.
- model may judge whether limitations are semantically blocking; runtime owns
  packet shape and refs.
- output is `ImplementationContextPacket v1`, not a worker prompt.

`implementation.compile_task_packet`

- input: coding resource packet, capability policy, workflow evidence
  profile, work-intent node, commitments.
- output: `ImplementationTaskPacket` plus executable node creation request.
- runtime derives node ids, executor keys, worker refs, evidence classes,
  budget, retry policy, and Work Queue child refs.
- output is one or more `ImplementationTaskPacket v3` objects. Multiple
  packets are a split-materialization instruction, not permission to invoke a
  broad worker.

`implementation.evaluate_readiness`

- input: implementation task packet.
- output: canonical readiness status and reason codes.
- no implementation worker runs unless this returns ready.
- production runner emits this readiness into Work Queue readback before
  execution.

### Readiness Semantics

Clean ready requires:

- at least one readable existing target file snapshot, or explicit new-file
  intent with parent directory snapshot and integration refs.
- current repo/worktree identity.
- fresh snapshot hashes.
- accepted context handoff summary.
- commitment mapping.
- validation refs or validation discovery plan.
- bounded allowed edit scope.
- evidence claim expectations.

Completion evidence:

- `extensions/execution-platform/src/workflows/implementation-context-snapshot-compiler.ts`
- `extensions/execution-platform/src/workflows/implementation-context-snapshot-compiler.test.ts`
- `scripts/execution-platform-run-implementation-context-snapshot-compiler-proof.mjs`
- `.artifacts/execution-platform/implementation-context-snapshot-compiler/proof.json`

`accepted_with_limitations` context can unlock implementation only if every
limitation is explicitly nonblocking for the target task packet. Otherwise
the node remains blocked and the scheduler receives a focused repair action.

### Acceptance Criteria

- replay of the failed `wu-002` Product/Spec point produces concrete target
  file snapshots and a worker-ready packet, or returns a precise upstream
  context/materialization blocker.
- Kimi/Qwen/Codex implementation workers are never invoked with directory-only
  targets or missing snapshots.
- owner readback distinguishes context useful-but-insufficient from
  implementation worker failure.

## Queue Item 4: Structured Tool/Schema Adapter Hardening

### Purpose

Make fast models useful by giving them small typed contracts, clear output
limits, and provider-profile policies that detect no-content/schema failure
without broad rescue churn.

### Provider Profile Gates

Every fast-model structured call must declare:

- provider/model ref.
- no-thinking or low-reasoning setting.
- maximum input bytes.
- maximum output tokens.
- response format mode.
- parser mode.
- expected finish/native finish reasons.
- soft timeout.
- hard timeout.
- retry policy for no-content.
- empty output retry budget.
- schema repair policy.
- escalation model policy.
- telemetry fields.

### Contract Rules

- fast models operate on one small semantic unit at a time.
- semantic extraction and schema normalization are separate task classes.
- field repair receives exact missing field paths and preserved accepted
  fields.
- runtime compiles canonical objects after semantic output exists.
- raw provider output is not stored; bounded hashes, lengths, finish reasons,
  usage, latency, and reason codes are stored.

### Acceptance Criteria

- no-content failures record input size, output length, timeout, finish
  reason when available, retry count, and model settings.
- retry repeats the same bounded semantic task, not the whole phase.
- schema repair cannot regenerate already accepted semantic content.
- GPT-5.5 rescue is exceptional and visible, not a normal hidden path.

### Implementation Evidence

Status: complete as of 2026-05-20.

Production objects:

- `StructuredAdapterProviderProfile` in
  `extensions/execution-platform/src/model-tasks/structured-tool-schema-adapter.ts`.
- `structuredAdapterPreflight(...)` blocks runtime-only provider calls,
  oversize input, output-token overrun, and timeout overrun before provider
  invocation. It never truncates or compacts input.
- `structuredAdapterDiagnostics(...)` records bounded provider evidence:
  attempt, status, latency, content length, finish/native finish reason,
  error reason, input bytes, output hash, usage, cost, and raw-storage flags.
- `classifyStructuredAdapterOutcome(...)` distinguishes successful output,
  same bounded-task retry, field-specific schema repair, explicit escalation,
  and terminal needs-review.
- `model.call` and the OpenRouter role client both enforce the adapter
  contract.
- Work Queue readback surfaces adapter profile, diagnostics, and outcome.

Behavioral decisions:

- a no-content fast-model retry must resend the same bounded task; it cannot
  disable JSON mode, change reasoning settings, or broaden the prompt.
- GPT-5.5 rescue is an explicit escalation outcome, not a hidden fallback.
- schema repair is field-specific and must preserve accepted semantic fields.
- raw prompts, raw responses, and raw provider logs remain non-persistent.

Validation:

- `extensions/execution-platform/src/model-tasks/structured-tool-schema-adapter.test.ts`
- `extensions/execution-platform/src/model-tasks/model-task-classification.test.ts`
- `extensions/execution-platform/src/codex-bridge/live-agent-team-runner.test.ts`
- `extensions/execution-platform/src/work-queue/execution-read-model.test.ts`
- `.artifacts/execution-platform/structured-tool-schema-adapter/proof.json`

## Queue Item 5: Scheduler Readiness State Unification

### Purpose

Remove contradictory readiness states such as "context freshness satisfied"
and "implementation target snapshots missing" both being treated as possible
green lights.

### Canonical Readiness Object

`NodeReadinessState` is the only readiness object the scheduler, compiler,
executor, replay harness, and Work Queue readback may use.

Required fields:

- `nodeId`
- `runtimeJobId`
- `graphId`
- `workflowId`
- `readinessStatus`: `not_evaluated`, `blocked`, `ready`, `ready_with_limitations`,
  `needs_repair`, `needs_review`
- `phase`: `work_intent`, `context_supply`, `resource_materialization`,
  `implementation_ready`, `executing`, `validation_ready`, `closeout_ready`
- `resourcePacketRef`
- `freshnessStatus`
- `snapshotStatus`
- `contextStatus`
- `validationStatus`
- `authorityStatus`
- `evidenceStatus`
- `blockingReasonCodes`
- `nonblockingReasonCodes`
- `repairAction`
- `nextAllowedTransitions`

### State Rules

- context freshness cannot imply implementation readiness.
- accepted context cannot imply target snapshots.
- target snapshots cannot imply validation readiness.
- validation passing cannot imply evidence closure.
- closeout cannot run as success while blocking commitments remain open.
- replay harness checkpoints must read the same readiness object as
  production scheduler execution.

### Acceptance Criteria

- scheduler, post-context compiler, replay harness, Work Queue readback, and
  node executor invocation all consume the same readiness object.
- contradictory status combinations are impossible or terminalize as
  needs_review with reason codes.
- repeated repair for the same missing field/resource without progress halts.

### Implementation Evidence

Status: complete as of 2026-05-20.

Production objects:

- `NodeReadinessState` in
  `extensions/execution-platform/src/workflows/node-resource-materialization.ts`.
- `evaluateNodeReadinessState(...)` composes readiness from
  `NodeExecutionPacket`, `CodingResourcePacket`, implementation context
  metadata, context limitations, validation refs/discovery plans, authority
  scope, evidence expectations, and raw-storage policy.
- `buildMissingNodeExecutionPacketReadinessState(...)` gives missing execution
  packets the same canonical readiness shape, so the scheduler cannot fall
  back to an ad hoc boolean or opaque needs-review state.
- `RuntimeWorkGraphScheduler` now records and gates on canonical readiness
  before worker invocation.
- `DynamicAgentTeamGraphRunner` persists readiness state into progress events
  and node metadata.
- Work Queue readback exposes readiness state, state ref, phase, status,
  repair action, next transitions, sub-statuses, blockers, and limitations.

State rules enforced:

- fresh context plus missing snapshots is blocked.
- accepted context with blocking limitations is blocked.
- snapshots without validation refs or a validation discovery plan are blocked.
- `ready_with_limitations` can execute only when limitations are explicitly
  nonblocking.
- missing `NodeExecutionPacket` creates a canonical blocked state with
  `compile_node_execution_packet` as the next transition.

Validation:

- `extensions/execution-platform/src/workflows/node-resource-materialization.test.ts`
- `extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts`
- `extensions/execution-platform/src/work-queue/execution-read-model.test.ts`
- `.artifacts/execution-platform/scheduler-readiness-state-unification/proof.json`

## Queue Item 6: Product/Spec Replay Proof

Status: complete as of 2026-05-21.

### Purpose

Replay the failed Product/Spec boundary before another full proof.

### Replay Target

Use the failed `wu-002` class of checkpoint where context handoff existed but
implementation target refs/snapshots were missing.

### Pass Conditions

Replay passes only if:

- context handoff compiles through `context.resolve_target_refs`.
- file refs are resolved or missing refs are precisely reported.
- readable target file snapshots and hashes are produced when existing files
  are targeted.
- explicit new-file intent plus parent directory snapshot is produced when
  new files are required.
- `ImplementationTaskPacket` is compiled.
- canonical `NodeReadinessState` is ready or a precise upstream blocker.
- Kimi/Qwen receives a worker-ready packet if continuing into worker
  invocation.
- Work Queue/readback shows materialization phase, resource refs, readiness
  status, blocker or next action, wall time, and token/cost telemetry.

The replay must not count as pass if it merely reruns context scout, produces
directory refs, or claims context freshness while target snapshots are absent.

Completion evidence:

- `.artifacts/execution-platform/product-spec-replay-proof-resource-materialization/proof.json`
- `scripts/execution-platform-run-product-spec-boundary-replay.mjs`
- focused validation of resource materialization, implementation context,
  scheduler readiness, and Work Queue readback tests.

Important implementation detail: full implementation/resource/node packet
bodies are stored as runtime artifacts. Runtime graph node metadata stores
refs and compact readiness/readback summaries only, so replay cannot exceed
the graph metadata cap or make stale packet bodies look canonical.

Implementation correction: "runtime artifacts" means payload/body storage
plus bounded manifests. It does not mean copying full packet JSON into
`runtime_job_artifacts.metadata`. Any implementation/resource/node packet
body that can exceed metadata bounds must be stored in the Runtime Artifact
Payload Store and hydrated by ref.

## Queue Item 7: Full Product/Spec Proof

Status: blocked by `Runtime Node Readiness And Transition Engine` as of
2026-05-21.

The resource-materialization replay proved that the runtime can compile
worker-ready packets at the replay boundary. The next full proof exposed a
different generic scheduler hole: after accepting a work graph, the scheduler
still approved an `implementation` node while `context_supply` had zero
accepted target nodes. That bypass happened before
`NodeExecutionPacket` materialization could protect the worker path.

Therefore the full proof is now queue item 8. Queue item 7 is
`Runtime Node Readiness And Transition Engine`, defined in
`runtime-node-readiness-transition-engine.md`.

## Queue Item 7: Runtime Node Readiness And Transition Engine

### Purpose

Make node lifecycle transitions a production runtime contract so graph
acceptance cannot bypass context supply, resource materialization, capability
preconditions, or worker-execution readiness.

### Scope

Implement the generic transition engine that sits between accepted graph state
and worker execution:

- evaluate dependency-ready frontier nodes.
- classify each node as work intent, prerequisite, barrier, executable, or
  blocked.
- validate capability execution preconditions.
- create prerequisite context/research/human/resource/validation/closeout
  nodes when preconditions are missing.
- compile or require `NodeExecutionPacket` and domain resource packet refs.
- open an executable frontier only for ready nodes.
- convert missing preconditions into scheduler readiness evidence.
- prevent `worker_adapter_threw:unclassified` from missing context/resource
  gates.
- expose transition state and next allowed transitions in Work Queue readback.

### Pass Conditions

The transition-engine pass is complete only if:

- `scheduler.approve_and_run_first_node` cannot run a non-executable node.
- accepted graph plus missing `context_supply` creates context prerequisites
  or blocks with exact transition diagnostics.
- implementation/test/review/closeout workers cannot run from work-intent
  nodes.
- prerequisite nodes are generated from capability/workflow preconditions,
  not prompt-specific Product/Spec heuristics.
- readiness failure returns `needs_review` with `NodeReadinessState` and
  transition refs, not unclassified adapter failure.
- boundary replay of `native-exec-eb9bbce0b5e01416` failure class proves no
  worker invocation before executable readiness.
- Work Queue readback shows lifecycle phase, blocker, next transition,
  prerequisite nodes, executable frontier, and ELI5 progress.

### Governing Spec

`runtime-node-readiness-transition-engine.md`

## Queue Item 8: Context Scout Execution Packet And Request-Context Repair

Status: closed from checkpointed proof evidence as of 2026-05-21.

The transition engine prevented immediate worker execution without context,
but the next proof showed context scout itself still used oversized
monolithic role prompts and request-context repair still exposed
model-authored runtime envelope fields. That failure class is governed by
`context-scout-execution-packet-and-request-context-repair.md`.
The following checkpointed proof advanced beyond that older call-shape class
and exposed queue item 9.

## Queue Item 9: Parallel Frontier Resource Boundary Hardening

Status: next pre-Product/Spec proof blocker as of 2026-05-21.

The context-scout packet work advanced the proof into parallel frontier
execution. The latest checkpointed proof then exposed a new generic boundary
failure:

- resource packet compiler/schema bounds diverged and emitted a thrown
  `too_big` schema error instead of a scheduler-owned readiness result.
- `accepted_with_limitations` context handoffs with runtime fallback evidence
  could unlock implementation without a consumer-specific nonblocking waiver.
- context repair/acquisition nodes could exist without consumer edges.
- one parallel branch exception could collapse the adapter result while
  sibling branches continued emitting.

This failure class is governed by
`parallel-frontier-resource-boundary-hardening.md`.

## Queue Item 10: Full Product/Spec Proof

### Purpose

Rerun the Product/Spec Planning production workflow proof from the top only
after the replay proof, transition-engine proof, context-scout execution
packet proof, and parallel-frontier/resource-boundary proof pass.

### Pass Conditions

The full proof passes only if:

- front door uses the production UX-equivalent payload path.
- Mission Ledger is valid and visible.
- Commitment Work Packets are worker-ready and bounded.
- draft work-intent graph is accepted.
- node-scoped context scouts run where required.
- resource materialization produces `NodeExecutionPacket`s.
- executable implementation nodes run only from ready packets.
- non-Codex/Codex model selection follows task classification and capability
  utility policy.
- implementation produces real source edits.
- validation and repair run through runtime tools.
- evidence claims close blocking commitments.
- Work Queue readback shows active phase, node, task class, model, resource
  packet, validation, blockers, next action, wall time, and token/cost.
- closeout is model-authored and accepted from evidence packets.

## Queue Reconciliation

This spec supersedes narrow queue entries that treated context freshness,
post-context task compilation, model policy, and schema adapter stability as
separate local repairs. Those concerns now belong to one resource
materialization and model-task classification block.

The older scheduler-first node-scoped context supply and post-context
implementation task compiler specs remain valid as detailed sub-specs, but
the queue should execute them through:

- `Model Task Classification And Utility Router v2`
- `Generic Node Resource Materialization Layer`
- `Implementation Context Snapshot Compiler`
- `Structured Tool/Schema Adapter Hardening`
- `Scheduler Readiness State Unification`

Old generated Product/Spec proof child items are runtime diagnostics, not
roadmap work. They should be archived or superseded through Work Queue
generated-item lifecycle policy and must not sit between the platform blockers
and the next full Product/Spec proof.
