# Product/Spec Checkpointed Proof Framework

Product/Spec Planning proof runs must be evaluated as a checkpointed generic
orchestration runtime pipeline, not as a single end-state verdict.

This framework now assumes Product/Spec Planning is a production workflow
plugin on the canonical runtime spine. The proof must exercise
WorkflowDefinition/plugin readiness, GenericOrchestrationRuntime, Mission
Ledger, Commitment Work Packets, Context Supply Chain, staged scheduler tools,
runtime node executors, evidence claims, Work Queue projection, closeout, and
completion review. It must not pass through a bespoke Product/Spec runner or
the generic queued workflow runner.

The core rule is:

> Never evaluate a downstream node until every upstream handoff it depends on
> is proven high quality.

Failure at a later node is treated as a symptom of the pipe leading into that
node until the upstream handoffs are proven strong.

## Checkpoint Ladder

### 1. Payload And Router

Required evidence:

- prompt hash and length match the submitted prompt.
- full prompt reaches the runtime payload as volatile input.
- selected executor workflow and target subject refs are split correctly.
- Product/Spec Planning is the executor only when the owner asks for planning,
  spec, capsule, or action-graph proposal work.
- Product/Spec Planning is a target subject, not the executor, when the owner
  asks to implement, test, harden, or wire Product/Spec Planning code.
- safety boundaries are carried as constraints, not early regex blockers.
- route compiles through the same UX-compatible payload shape used by live
  submissions and replay.

Stop conditions:

- prompt truncation.
- wrong executor workflow.
- safety text blocks the route.
- replay/direct payload diverges from the UX-compatible shape.

### 2. Mission Ledger

Required evidence:

- model-authored Mission Ledger exists.
- owner objective is preserved.
- constraints and requested work are separated.
- blocking commitments cover the prompt's real deliverables.
- evidence expectations are meaningful but do not ask the model to invent
  runtime-owned schema.

Stop conditions:

- missing Mission Ledger.
- blocked/invalid mission gate.
- commitments omit major deliverables.
- commitments are too generic for downstream work.

### 3. Commitment Work Packets

Required evidence:

- model-authored CommitmentWorkPackets exist for all blocking commitments.
- packet quality review is accepted.
- each packet contains worker objective, context scout objective,
  implementation objective, validation objective, review objective, likely
  repo areas, context questions, acceptance criteria, stop-if-missing rules,
  downstream consumer, and evidence-claim expectations.
- packets receive full original prompt access as volatile input and source
  prompt refs as bounded persistence.
- packet review stores pre-review packet refs, model review notes, blocking
  versus nonblocking defects, and original-versus-repaired packet refs.

Stop conditions:

- packets are deterministic wrappers.
- packet quality review is missing or not accepted.
- likely repo areas are empty without model-authored reason.
- a human engineer or child agent would need to guess what to do next.

### 4. Context Supply

Required evidence:

- context scout tool loop artifact exists before implementation work.
- verified file refs are present.
- context handoff packet is present.
- repo-analysis tool traces are present for repo search, bounded file reading,
  symbol inspection, related-test discovery, context handoff, limitations, and
  context evidence claims when scout runs.
- context handoff packet carries implementation and synthesis summaries,
  commitment packet refs, source-prompt excerpt refs, symbol refs, test refs,
  and bounded context evidence refs.
- required/provided context snapshot refs are present when the downstream
  worker depends on scout, synthesis, replay, prompt excerpt, file snapshot, or
  memory context.
- missing, stale, rejected, or unknown snapshots block worker execution before
  provider invocation and surface as context insufficiency, not model failure.
- sufficiency review is accepted before implementation.
- context scout can request prompt excerpts or more context when needed.
- Product/Spec-class proof can run one context scout per commitment packet in
  parallel when packets are independent.
- a synthesis step combines accepted context handoffs before downstream graph
  selection when the graph needs cross-commitment coherence.
- boundary replay for the context-scout phase persists the intended graph
  shape: per-packet scout nodes, a synthesis barrier node, and
  `context_supplies` edges with readiness/blocker metadata.

Stop conditions:

- implementation starts before accepted context when context is required.
- context scout produces generic JSON without verified refs.
- sufficiency review rejects or needs repair.

### 5. Context Synthesis

Required evidence:

- bounded `context_synthesis_input_manifest` artifact exists before the core
  synthesis model call.
- the manifest contains model-authored packet/scout briefs, bounded refs,
  constraints, source-prompt section refs, and budget status; it does not
  contain raw prompt, raw response, raw provider log, raw tool log, raw DB
  rows, or deterministically guessed semantic compression.
- if the manifest is too large, synthesis stops as `needs_review` with a
  split/model-selection policy instead of silently truncating.
- accepted context synthesis artifact exists when multiple commitment/context
  packets feed one graph.
- synthesis preserves implementation groups, dependencies, worker-fit hints,
  relevant refs, blockers, and stop-if-missing rules.
- group guidance may be authored as `groupPlanningGuidance`,
  `recommendedImplementationGroups`, `implementationGroups`, `workGroups`, or
  `groups`; the runtime normalizes these general aliases before judging the
  boundary failed.
- missing group guidance triggers one focused field repair that preserves the
  existing synthesis and asks only for the missing group field.
- synthesis carries accepted context snapshot refs forward so implementation,
  validation, review, and closeout nodes can prove fresh upstream context.
- downstream scheduler input includes the actual synthesis detail, not only a
  short summary or artifact ref.

Stop conditions:

- scheduler selection receives only a bounded summary when full synthesis
  detail is needed.
- synthesis collapses independent work into one broad implementation without
  rationale.
- synthesis omits blockers that should prevent implementation.
- manifest budget is exceeded and the runtime truncates anyway.
- group guidance is missing after focused repair.

### 6. Scheduler Graph

Required evidence:

- staged scheduler protocol artifacts exist for work breakdown, capability
  selection, node contract definition, edges/parallelism, runtime graph
  compile, structure review, graph acceptance, and first-node approval.
- graph has nodes plus handoff edges or explicit parallelism justification.
- nodes map to commitments.
- capability selection is cost-aware.
- Work Queue child/action items are materialized from graph nodes.
- broad Codex implementation does not monopolize the graph without explicit
  cost/quality justification.
- runtime derives node ids, node kinds, executor keys, worker refs,
  expected-evidence classes, storage flags, authority flags, lifecycle
  metadata, and Work Queue child refs.
- runtime derives and validates context freshness gates before worker nodes
  invoke model/provider adapters.

Stop conditions:

- no graph.
- nodes have no edges and no parallelism justification.
- graph collapses into broad implementation before upstream context is
  accepted.
- child Work Queue materialization is missing.
- model is asked to invent runtime-owned node or evidence schema.

### 7. Worker Execution

Required evidence:

- workers receive the relevant packet, context handoff, allowed files, target
  refs, validation refs, budget policy, and stop conditions.
- non-Codex/Kimi work is concrete and scoped when selected.
- Codex escalation is justified.
- file changes map to commitment ids.

Stop conditions:

- worker input is under-specified.
- adapter rejects useful model output through schema choke.
- source-edit task produces no source edit and still tries to succeed.

### 8. Validation And Repair

Required evidence:

- validation plan maps to commitments.
- commands run through approved runtime/script boundary.
- failure classification maps to commitments.
- recoverable failures return to scheduler repair in the same runtime job.

Stop conditions:

- validation claims success without command refs.
- repair loops without evidence advancement.
- validation failure terminalizes prematurely without repair/escalation.

### 9. Closeout And Readback

Required evidence:

- accepted Mission Ledger evidence claims.
- validation refs.
- workflow evidence profile evaluation.
- runtime tool trace refs.
- Work Queue readback refs.
- model-authored Closeout Capsule and finalization handoff.
- accepted model-authored completion review.
- human-readable summary, limitations, and ELI5.

Stop conditions:

- degraded/system closeout tries to count as success.
- open blocking commitments remain.
- final output is used as truth without runtime evidence.

## Failure Attribution

Every failure is classified as one of:

- `input_starvation`: previous stage did not provide enough detail.
- `contract_choke`: useful model intent was rejected or distorted by schema,
  parser, normalizer, or compiler.
- `step_overload`: one model/tool call was asked to do too much.
- `local_execution_failure`: current node had good inputs but failed.
- `observability_gap`: runtime may be doing work but readback cannot explain
  what, why, or with which evidence.

Do not patch the symptom node until upstream handoffs have been inspected.

## Repair Rule

Repairs must be architectural and general:

- no prompt-specific routing keywords.
- no semantic forests.
- no deterministic usefulness judgment.
- no exact-output patching.
- no proof-only success path.

Allowed deterministic repairs:

- schema/ref/bounds/storage/authority validation.
- general alias normalization for structured fields.
- compiler derivation of runtime-owned fields.
- stronger tracing/readback.
- checkpoint/replay boundaries.

Semantic quality remains model-authored or human-reviewed.

## Runtime Harness Behavior

The checkpoint harness may stop a run early only on hard runtime facts:

- wrong route.
- missing or invalid Mission Ledger.
- missing or rejected packet quality review.
- implementation before accepted context.
- graph collapse into broad implementation before required upstream gates.
- missing child Work Queue materialization after graph node creation.
- degraded closeout success attempt.
- stale boundary replay identity or prompt/payload hash mismatch.
- live/replay payload parity failure.

For qualitative weakness, the harness emits bounded artifacts for model/human
review and marks the gate `needs_review`; it does not pretend deterministic
code judged semantic quality.

The harness must also write compact latest-run-state evidence on every
checkpoint and terminal event. That file is the operator continuity contract
across context compaction: it must include current phase, graph/node, active
role/model/provider, blocker summary, next action, wall time, model usage
availability, retry state, and raw-storage flags. It must not store raw
prompts, raw model responses, raw tool logs, raw provider logs, raw DB rows, or
secrets.

Gate statuses distinguish blocking proof failure from available qualitative
review:

- `passed` and `accepted_with_limitations` may continue when later gates do not
  depend on the limitation.
- `review_available_nonblocking` means a human/model review artifact is useful
  but the harness must not present it as a failed hard gate.
- `needs_review`, `failed`, `blocked`, and missing required evidence remain
  hard stop states.

## Boundary Replay Runtime Contract

Boundary replay is now a production diagnostic/restart surface, not a
proof-only runner.

Accepted replay requires:

- a `boundary_replay_checkpoint` artifact for the requested boundary.
- accepted upstream checkpoints for every required earlier boundary.
- matching runtime job id, graph id, workflow id, prompt hash, and payload
  hash when provided.
- `replayStartPolicy: allowed_from_checkpoint`.
- `replaySafetyStatus: safe_to_replay`.
- `replayFreshnessStatus: fresh`.
- accepted artifact refs for the boundary.
- bounded raw-storage/authority/lifecycle false flags.

Replay plans are readback/control artifacts. They do not bypass the Runtime
Work Graph scheduler, workflow definitions/plugins, Runtime Tool-Call Kernel,
capability registry, or node executors. If a boundary is missing, stale,
rejected, or identity-mismatched, replay must stop as `needs_review` or
`blocked` with explicit missing/stale/rejected refs.

Work Queue readback must expose boundary replay state under active graph
progress so an operator can see which checkpoint is reusable, what upstream
boundaries are accepted, and what exact continuation is allowed.

## Context Synthesis Graph Compile Handoff

Context synthesis has two different consumers and they must not share one
truncated contract:

- owner/readback artifacts need bounded summaries that may omit detail.
- the scheduler graph compiler needs every implementation group required to
  build the executable post-synthesis graph.

The canonical scheduler handoff is
`context_synthesis_graph_compile_handoff`, not the owner-facing
`context_synthesis` artifact summary. It contains:

- synthesis ref and hash;
- implementation readiness;
- total implementation group count;
- included implementation group count;
- all included group contracts needed for compilation: objective,
  commitment ids, handoff refs, target/file refs, recommended capabilities,
  success criteria, expected output, validation/review needs, worker-fit
  rationale, dependency and parallelism fields;
- dependency map and global validation/review/readback context;
- `compileHandoffComplete`.

Runtime behavior:

- If the compile handoff is complete, post-synthesis graph compilation may
  create implementation, validation, review, readback, and closeout nodes.
- If the handoff is incomplete or the reported group count exceeds the
  included group count, the scheduler stops as `needs_review` with exact
  group-count diagnostics.
- Artifact metadata may still truncate for storage/readback, but that
  truncation is never allowed to shrink the executable graph.
- A replay `max_iterations` stop is a checkpoint/needs-review condition, not a
  hard execution failure. Scheduler terminal graph status must preserve that
  distinction so operators can resume from the correct boundary.
