# Product/Spec Checkpointed Proof Framework

2026-05-28 shared resource-lifecycle alignment: Product/Spec proof evidence
is now split into two proof families:

1. Coding vertical proof with `agent_team.coding` as executor and
   `agent_team.product_spec_planning` as target subject. This proves the
   coding team can implement real Product/Spec Planning framework code through
   the shared lifecycle.
2. Product/Spec Planning workflow proof with
   `agent_team.product_spec_planning` as executor. This proves the planning
   domain can produce PlanningIntentRecord, ResearchBrief when needed,
   PlanningCapsule, HumanPlanningDecision when needed, ActionGraphProposal,
   CompileRuntimePlanResult, readback, and closeout without executing child
   work.

Both proof families use the same shared domain-resource lifecycle:

```text
WorkIntentGraph
  -> NodeExecutionContract
  -> ResourceObjectiveFocus
  -> NodeResourceDemandSession
  -> NodeResourceLedger
  -> DomainResourceSelection
  -> ProgressiveNodeExecutionPacket
  -> DomainActionGate
  -> worker small-verb loop
  -> validation
  -> evidence
```

Coding maps this to file windows, target selection, write gate, patch
authoring, structural validation, and changed-file evidence. Product/Spec
Planning maps it to prompt sections, project facts, research briefs, planning
capsules, action graph proposals, compile readiness, human decision refs, and
planning evidence. `resource_fulfillment`, graph-level `context_scout` fanout, and
`context_synthesis` are not positive proof gates.

2026-05-29 Product/Spec domain-profile proof: the framework now has a
middle-lane real-model proof for Product/Spec as executor at
`.artifacts/execution-platform/product-spec-domain-profile-real-model-proof/manifest.json`.
This is not the final full Product/Spec proof. It proves that the executor
profile no longer inherits coding snapshot/write readiness: the model selects
planning-domain resources, authors planning intent, and runtime validates
planning artifacts, evidence profile, runner action-tool projection, bounded
manifests, and no child execution auto-start.

2026-05-28 convergence correction: the proof harness must not run again as a
positive closure candidate until
[Canonical Lifecycle Convergence And Residue Excision](/projects/execution-platform/specs/canonical-lifecycle-convergence-and-residue-excision)
passes. The replay proof must consume `NodeLifecycleProjection` and canonical
run-scoped proof manifests, not scheduler-local readiness, WorkIntent
status-to-transition maps, packet-level context coverage, context handoff
artifacts, graph-level scout fanout, or stale checkpoint labels. If a replay
path reaches old context handoff/scout/synthesis topology, it is negative
evidence and must block closure.

2026-05-27 update: Product/Spec proof success now requires the architecture
transition closure in
[Architecture Transition Closure And Context Objective Focus](/projects/execution-platform/specs/architecture-transition-closure-and-resource-objective-focus).
The checkpoint harness must not use packet-level context coverage,
graph-level context scout fanout, broad context supply, or context-synthesis
readiness as the main proof gate. After accepted packets, valid proof state
comes from canonical node-local execution state: `ResourceObjectiveFocus`,
`NodeResourceDemandSession`, `NodeResourceLedger`, scope revision lifecycle,
target selection, write gate, validation, evidence, and root-cause collapse.
If a broad scout/synthesis path appears by default, the proof fails before
implementation.

2026-05-27 proof-harness gate update: the checkpoint harness first-open gate
is now a canonical node-local projection. It cannot report retired
`resource_fulfillment`, graph-level context scout coverage, or context-synthesis
readiness as proof progress after packets. Retired topology is
`graph_compile_invalid`; stale retired checkpoint labels with no canonical
node-local state are rejected as missing runtime state. The canonical gate
vocabulary includes context focus, demand, scope revision, ledger readiness,
target selection, write gate, validation, evidence closure, and root-cause
terminal state. Latest-run-state and proof summary writes carry manifest byte
guards so large bodies must remain artifact-backed.

2026-05-28 run-scoped substrate update: Product/Spec replay closeout must be
based on a proof-run manifest under
`.artifacts/execution-platform/proof-runs/<run-id>/manifest.json`. The shared
latest files `product-spec-boundary-replay-result.json`,
`product-spec-replay-proof-admission-gate.json`, and resource-materialization
`proof.json` may exist only as convenience mirrors. They are not closeout
truth. The admission gate and closeout script must reject known stale runtime
job ids, known stale graph ids, retired graph-level context acquisition
topology, component-only proofs, and any proof artifact that is not scoped to
the current proof run. Freshness is a closure predicate, not just a source
label: the manifest must record `closurePredicateStatus: "admitted"`,
`proofClosureAllowed: true`, and every closure artifact ref must resolve under
the same `<run-id>` as the manifest. Shared latest files and mismatched
proof-run refs are operator mirrors or negative evidence, never proof closure.
The manifest remains bounded metadata; any large proof body stays in
artifact-backed files referenced by the manifest.

2026-05-27 target-selection hardening: proof success also requires that
`ResourceObjectiveFocus` is not optional. Context requirements, node resource demand,
and scout specialist subturns must cite an accepted focus decision, and
source-edit snapshots must cite accepted model-authored target selection.
Runtime-compiled broad `targetRefs`, packet `likelyRepoAreas`, approved repo
scope, or context prose cannot count as selected executable targets.

2026-05-28 focus-first replay gate: after accepted packets, proof replay must
show the scheduler either accepting a model-authored
`ResourceObjectiveFocusDecision` or stopping at
`context_focus_required`/`context.focus.request_for_work_intent`. A replay that
opens `context.demand.open`, context scout specialist work, target selection,
resource materialization, or worker execution before accepted focus is invalid.
The harness should report this as a canonical focus/readiness gate, not as
generic `resource_fulfillment`, stale graph context coverage, or worker failure.

2026-05-28 middle-lane closure gate: `blocker-closure-06` closes only from a
run-scoped Product/Spec middle-lane proof manifest. The positive proof
boundary is `node-local-middle-lane`, and it must prove a real implementation
node traversed WorkIntent acceptance, model-authored context focus,
`NodeResourceDemandSession`, specialist/narrowed context fulfillment,
`NodeResourceLedger`, model-authored target selection, hydrated write gate,
worker edit, structural validation, and evidence emission. Older
`after_resource_materialization` component proofs are supporting evidence
only unless wrapped by this run-scoped manifest and admitted by the
Product/Spec replay proof gate.

2026-05-25 update: Product/Spec proof is blocked until
`openclaw-convergence.control-plane-07-readback-telemetry-proof` passes and
the live gateway build/start checks are clean. The latest accepted worker
smoke is runtime job `native-exec-272cf2d51fcba75b`, graph
`product-spec-replay-f69b40c5defa3687`, boundary
`after-resource-materialization`, with proof artifact
`.artifacts/execution-platform/product-spec-replay-proof-resource-materialization/proof.json`.
The proof showed a hydrated Product/Spec-derived source-edit node running
through the small-verb worker loop, structural validation, commitment
evidence, and rollback-after-review. The remaining pre-proof concern is not
worker edit capability; it is owner-facing readback/telemetry plus live
gateway readiness.

2026-05-24 update: Product/Spec checkpoint replay must use the same
WorkIntent-first, scheduler-first topology as production. Replay must not
inject `context_synthesis` as default glue and must not count legacy
after-context-synthesis checkpoints as production proof success unless the
workflow explicitly requires synthesis for coordination.

Product/Spec Planning proof runs must be evaluated as a checkpointed generic
orchestration runtime pipeline, not as a single end-state verdict.

This framework now assumes Product/Spec Planning is a production workflow
plugin on the canonical shared resource lifecycle. The proof must exercise
WorkflowDefinition/plugin readiness, GenericOrchestrationRuntime, Mission
Ledger, Commitment Work Packets, resource focus, node-local resource demand,
resource ledger, domain resource selection, staged scheduler tools, runtime
node executors, evidence claims, Work Queue projection, closeout, and
completion review. It must not pass through a bespoke Product/Spec runner,
the generic queued workflow runner, default graph context scout fanout, or
context synthesis glue.

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
- production packet model review is skipped/retired; packet acceptance comes
  from model-authored packet compilation plus runtime structural readiness.
- each packet contains worker objective, context scout objective,
  implementation objective, validation objective, review objective, likely
  repo areas, context questions, acceptance criteria, stop-if-missing rules,
  downstream consumer, and evidence-claim expectations.
- packets receive full original prompt access as volatile input and source
  prompt refs as bounded persistence.
- packet diagnostics store pre-review packet refs, compiler/readiness reason
  codes, and structural risk signals. Qualitative packet review is diagnostic
  only and must not gate production or trigger repair.

Stop conditions:

- packets are deterministic wrappers.
- compiled packet structural readiness fails.
- likely repo areas are empty without model-authored reason.
- a human engineer or child agent would need to guess what to do next.

### 4. Resource Focus And Node-Local Resource Demand

Required evidence:

- after Commitment Work Packets, the scheduler produces an accepted
  WorkIntentGraph and NodeExecutionContract state before any context
  acquisition.
- the accepted proof path uses node-local `NodeResourceDemandSession`s and
  per-node `NodeResourceLedger`s. Current implementation names may still use
  `NodeResourceDemandSession` and `NodeResourceLedger` during migration, but proof
  readback and specs must treat them as shared resource lifecycle artifacts,
  not a global context phase.
- a real implementation node must be able to start from a partial execution
  packet, request exact resources locally, receive scoped refs/windows or
  planning resource refs, select domain resources, and proceed to the domain
  action gate.
- broad context scout fanout is not proof success.
- graph-visible context scout prerequisites are not default readiness repair.
- context requirements are compiled from an accepted
  `ResourceObjectiveFocus` or current `ResourceObjectiveFocus` migration
  artifact, not by copying
  every packet question, candidate repo ref, target ref, prompt summary, and
  repo summary into the provider payload.
- over-profile context units execute the production scope-revision lifecycle
  or terminalize with a root-cause artifact. A recorded scope-revision request
  alone is not proof progress.
- WorkIntent resource readiness is satisfied from consumer-bound demand and
  ledger state. Graph `context_supplies` edges count only when an explicit
  workflow-defined coordination capability appended its output to the
  consumer ledger.
- context frontier/shard execution can count only when it is internal
  fulfillment for a consumer-bound demand session and returns to that node.
- resource demand is scoped to WorkIntent/node consumers and their resource
  requirements; broad context scout batches cannot satisfy implementation
  readiness unless they compile into consumer-specific handoff refs.
- context scout tool loop artifacts exist for implementation-bearing draft
  work nodes before those nodes execute.
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
- `accepted_with_limitations` context does not unlock implementation unless
  each limitation is explicitly nonblocking for the exact downstream consumer
  node/work unit.
- runtime-supplied verified refs are limitation evidence, not clean context
  success, unless accompanied by model-authored context substance and a
  consumer-specific sufficiency decision.
- context scout can request prompt excerpts or more context when needed.
- Product/Spec-class proof runs context scout per draft work node in parallel
  when nodes are independent.
- synthesis is optional and scoped to cross-node coordination needs such as
  file ownership overlap, conflicting scout outputs, shared dependency
  decisions, integration sequencing, or validation-plan conflicts.
- boundary replay for context phases persists the draft work graph,
  node-local demand sessions, ledger manifests, node-scoped scout subturns
  when used, readiness results, and target-selection state.
- replay from packet/context boundaries must use the scheduler-first graph
  path. It must not synthesize a global `context_synthesis` node simply
  because accepted context scout artifacts exist.
- `after-context-synthesis` replay is retired. It must not exist as a passing
  Product/Spec proof path, diagnostic closure path, or compatibility path.

Stop conditions:

- implementation starts before accepted context when context is required.
- context scout produces generic JSON without verified refs.
- sufficiency review rejects or needs repair.
- context handoff relies only on runtime fallback refs and no
  consumer-specific nonblocking waiver exists.
- the proof harness injects `context_synthesis` as default glue instead of
  letting the scheduler/compiler decide whether synthesis is required.
- a replay reports success from broad scout output, global synthesis,
  context-frontier merge alone, or any context artifact that is not attached
  to the exact consumer node's demand session and ledger.

### 5. Context Synthesis

Required evidence:

- default context synthesis is retired from Product/Spec proof success.
- no proof harness may create, require, or accept a `context_synthesis` node
  unless a future workflow introduces a new explicit coordination capability
  with its own governing spec and proof gate.
- old context synthesis artifacts are historical evidence only; they cannot
  unlock implementation, satisfy context readiness, or close replay.
- any old tests/proofs expecting context synthesis as default glue must be
  deleted or rewritten under the legacy purge queue item.

Stop conditions:

- any `context_synthesis` executor registration appears in the production
  coding-team executor map.
- replay still exposes an `after-context-synthesis` boundary.
- a context synthesis artifact is treated as implementation readiness.
- compatibility flags can resurrect the old context synthesis path.

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
- runtime evaluates node readiness transitions after graph acceptance and
  before worker nodes invoke model/provider adapters.
- graph acceptance opens no implementation/test/review/closeout worker until
  the node is in an executable lifecycle state.
- missing context/resource preconditions create prerequisite nodes or precise
  transition blockers, not worker adapter failures.
- Work Queue readback shows the active transition, executable frontier,
  prerequisite nodes, blocker, and next allowed transition.
- context repair/acquisition nodes created after a blocker have
  `context_supplies` consumer edges or diagnostic-only lifecycle.
- resource packet compilation returns structured readiness evidence such as
  `accepted`, `split_required`, `context_repair_required`, or `needs_review`;
  schema/bounds failures do not throw into worker adapters.
- parallel frontier supersteps isolate branch outcomes and preserve sibling
  evidence when one branch fails.
- Work Queue/latest-run-state readback includes exact schema path, packet
  bound, branch id, node id, context limitation, consumer edge state, and
  replay boundary for every blocking scheduler failure.

Stop conditions:

- no graph.
- nodes have no edges and no parallelism justification.
- graph collapses into broad implementation before upstream context is
  accepted.
- graph acceptance directly approves a non-executable implementation node.
- `resource_fulfillment` is waiting while implementation execution begins.
- child Work Queue materialization is missing.
- model is asked to invent runtime-owned node or evidence schema.
- missing preconditions surface as `worker_adapter_threw` instead of
  scheduler readiness evidence.
- resource compiler schema error or packet bound error escapes as a thrown
  adapter exception.
- context repair nodes have no consumers and are treated as readiness
  progress.
- one parallel branch failure collapses the entire frontier result or hides
  sibling evidence.

### 7. Resource Materialization

Before worker execution, the proof must pass a dedicated resource
materialization boundary.

Required evidence:

- replay can restart at `before_resource_materialization` without rerunning
  router, Mission Ledger, Commitment Work Packets, scheduler graph selection,
  or context scout when those upstream artifacts exist.
- replay can restart at `after_resource_materialization` and hydrate
  `NodeExecutionPacket` plus domain resource packet manifests.
- `NodeReadinessState` is the single readiness truth for scheduler frontier
  selection, replay, Work Queue readback, proof gates, and worker invocation
  guards.
- graph node metadata contains only bounded manifests: refs, hashes, counts,
  short summaries, readiness status, reason codes, and Work Queue child refs.
- full implementation context packets, task packets, coding resource packets,
  file snapshots, context packets, split-task arrays, raw prompts, raw
  responses, raw provider/tool/command/DB logs, raw DB rows, secrets, and
  hidden reasoning are absent from graph metadata.
- resource packet bodies are stored in the runtime payload/body store and
  hydratable by ref.
- old checkpoint artifacts normalize into current readiness state when safe,
  or fail with exact missing refs and blocker paths.
- latest-run-state shows current boundary, active nodes, blockers, payload
  refs, wall time, token usage or labeled estimates, and next legal
  transition.
- `split_required` is accepted as a runtime transition only when the parent
  node is marked aggregate/non-runnable, child executable nodes are compiled
  from split task packets, child Work Queue items are materialized, and child
  `NodeReadinessState` objects are present.
- parent implementation nodes that exceed packet bounds do not retry as
  runnable nodes; they roll up child execution/evidence.

Stop conditions:

- replay restarts from an earlier broad boundary when a narrower resource
  boundary exists.
- graph metadata carries packet bodies or large nested arrays.
- implementation worker invokes before `NodeReadinessState` is executable.
- missing snapshots, stale refs, payload hydration failures, or checkpoint
  shape mismatches surface as worker failures instead of readiness evidence.
- Work Queue readback and latest-run-state disagree about the active blocker.
- `post_resource_task_split_required_for_file_resolved_microtasks` or an
  equivalent split-required result leaves the parent runnable or loops without
  creating executable children.
- resource materialization failures surface as
  `worker_adapter_threw:unclassified`.

### 8. Worker Execution

Required evidence:

- workers receive the relevant packet, context handoff, allowed files, target
  refs, validation refs, budget policy, and stop conditions.
- non-Codex/Kimi work is concrete and scoped when selected.
- source-edit workers receive a hydrated `NodeExecutionPacket`, hydrated
  domain resource packet, implementation task packet, implementation context
  packet when required, and canonical `NodeReadinessState`.
- large-file source edits use explicit bounded snapshot windows from
  `targetRegion`, `targetRegions`, or `lineRanges`; runtime must not send
  whole 7k-12k line files or infer important windows from prose.
- the small-verb worker loop owns the lifecycle: context/tool selection,
  edit planning, forced patch authoring, runtime patch application,
  structural or targeted validation, evidence claim recording, and
  rollback/review before persistence.
- Codex escalation is justified.
- file changes map to commitment ids.

Stop conditions:

- worker input is under-specified.
- adapter rejects useful model output through schema choke.
- source-edit task produces no source edit and still tries to succeed.
- worker starts from manifest-only or stale resource refs.
- patch lane repeats broad context reads after the context budget is spent
  instead of planning, editing, or returning an upstream blocker.

### 9. Validation And Repair

Required evidence:

- validation plan maps to commitments.
- commands run through approved runtime/script boundary.
- failure classification maps to commitments.
- recoverable failures return to scheduler repair in the same runtime job.

Stop conditions:

- validation claims success without command refs.
- repair loops without evidence advancement.
- validation failure terminalizes prematurely without repair/escalation.

### 10. Closeout And Readback

Required evidence:

- accepted Mission Ledger evidence claims.
- validation refs.
- workflow evidence profile evaluation.
- runtime tool trace refs.
- Work Queue readback refs.
- model-authored Closeout Capsule and finalization handoff.
- accepted model-authored completion review.
- human-readable summary, limitations, and ELI5.
- owner-facing latest-run/readback state includes WorkIntent id/title,
  execution intent, evidence mode, selected capability/executor, readiness
  ref/status, active model/tool/phase, blocker, schema/policy path where
  blocked, walltime, token/cost usage availability, bounded artifact refs, and
  next legal transition.

Stop conditions:

- degraded/system closeout tries to count as success.
- open blocking commitments remain.
- final output is used as truth without runtime evidence.
- readback requires raw log scans or artifact spelunking to understand the
  current node/model/tool/blocker/next transition.

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
