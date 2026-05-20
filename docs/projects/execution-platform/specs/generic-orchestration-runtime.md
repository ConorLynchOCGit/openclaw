# Generic Orchestration Runtime

## Implementation Status

Status on 2026-05-17: `openclaw-convergence.generic-orchestration-runtime-engine`
is implemented as the first production spine layer.

The new source module
`extensions/execution-platform/src/workflows/generic-orchestration-runtime.ts`
wraps the existing scheduler-backed Runtime Work Graph path with a canonical
workflow-agnostic runtime boundary. It performs production readiness through
workflow definitions/plugins, requires the Runtime Tool-Call Kernel for
production workflows, runs the scheduler through a single runtime entrypoint,
and rejects scheduler success that lacks graph execution evidence.

The live `agent_team.coding` runner now invokes this generic runtime before
running scheduler execution. Production uses
`GenericOrchestrationRuntime.runSchedulerGraph(...)`, so the generic runtime
constructs and runs `RuntimeWorkGraphScheduler` from scheduler options instead
of receiving an opaque proof callback. It records bounded
`execution.generic_orchestration_runtime_result` artifacts. Work Queue
readback surfaces the generic runtime status, graph id, executed/added node
ids, decision refs, and reason codes. This is not a separate proof runner; it
is wired into the production scheduler-backed coding-team path.

The lower-level `RuntimeWorkflowGraphEngine` remains as the readiness resolver
inside the generic runtime. It is not a competing workflow brain.

Status update on 2026-05-17:
`openclaw-convergence.generic-staged-scheduler-protocol` is implemented as the
production graph-creation gate for scheduler-backed workflows.
`agent_team.coding` and `agent_team.product_spec_planning` workflow plugins now
declare staged scheduler protocol readiness, runtime-derived node envelopes,
runtime-derived expected evidence, model-authored structure review, first-node
approval, and simple-only direct implementation first-move policy. The generic
runtime refuses production scheduler execution unless scheduler options require
the staged protocol. The scheduler rejects production node creation that
bypasses staged compiler metadata or lacks edges/explicit parallelism.

This moves the staged scheduler protocol from a targeted coding-team repair
into the generic orchestration runtime contract. Models choose intent,
rationale, capability, commitment mapping, success criteria, and graph
structure rationale; runtime owns executable schema, refs, evidence classes,
storage flags, and lifecycle metadata.

Status update on 2026-05-17:
`openclaw-convergence.generic-node-executor-evidence-contract` is implemented
as the generic node-result and commitment-evidence layer. Scheduler-backed
node execution now compiles worker-specific outputs into canonical
`generic_workflow_node_execution_result` objects before Mission Ledger handoff.
Those results include runtime job, graph, node, workflow, role, capability,
executor, worker, model/tool, validation, changed-file, human-decision,
closeout, owner-summary, limitation, and ELI5 refs. Evidence claims carry
runtime-derived claim ids and producing node/capability/executor identity.

Production success now requires explicit canonical evidence claims whenever
the mission/workflow requires evidence. Generic artifact refs, role reports,
process completion, degraded closeout, or fixture output cannot imply node,
commitment, workflow, or closeout success.

## Purpose

OpenClaw needs one canonical orchestration runtime for complex workflow
execution. Coding, Product/Spec Planning, research, docs/skills, QA,
architecture, design, marketing, model memory, proactivity, and human tasks
should not each grow separate runner brains with different lifecycle,
evidence, closeout, or Work Queue semantics.

The target is a workflow-agnostic runtime engine anchored in:

- runtime jobs as lifecycle truth.
- Runtime Work Graph as orchestration truth.
- Runtime Tool-Call Kernel as side-effect and trace truth.
- Mission Ledger as commitment truth.
- explicit evidence claims as closure truth.
- Work Queue as projection/readback/control.
- model-authored review as semantic sufficiency judgment.

## First Principles

1. Runtime jobs own lifecycle.
2. Work Queue does not own lifecycle.
3. Runtime graph state owns orchestration.
4. Runtime tools execute bounded side effects and record traces.
5. Workflow definitions own workflow policy.
6. Models judge intent, plan quality, delegation, context usefulness, evidence
   sufficiency, and closeout quality.
7. Deterministic runtime validates schema, refs, bounds, authority, storage,
   dependencies, budgets, executor coverage, and lifecycle separation.
8. Process completion is not task success.
9. Degraded/system closeout is diagnostic-only.
10. No raw prompts, raw responses, transcripts, provider logs, tool logs,
    command logs, DB rows, secrets, or hidden reasoning are stored.

## Runtime Components

### RuntimeWorkerSupervisor

The supervisor is infrastructure, not a workflow brain.

It may:

- claim runtime jobs.
- renew leases and heartbeats.
- enforce timeout, cancellation, and retry policy.
- select a registered adapter by job type.
- invoke the generic orchestration runtime.
- terminalize from accepted runtime evidence.

It must not:

- know coding, planning, research, Kimi, Codex, memory, or closeout semantics.
- synthesize success from process completion.
- bypass Runtime Tool-Call Kernel traces.
- mutate Work Queue lifecycle directly.

### GenericOrchestrationRuntime

The generic runtime is the canonical execution engine for complex workflows.
It should wrap or replace `RuntimeWorkGraphScheduler` behind a
workflow-agnostic API.

It owns:

- graph creation and durable graph state.
- Mission Ledger gating.
- Commitment Work Packet authoring.
- source-prompt/context supply.
- staged scheduler protocol.
- capability selection and cost policy enforcement.
- node creation, graph edges, dependency readiness, and parallel branches.
- node execution through registered executors.
- validation/repair/review loops.
- human pause/resume.
- Mission Ledger evidence closure.
- closeout readiness.
- model-authored completion review.
- Work Queue projection events.
- loop guards and terminalization.

It must not hard-code coding-team, Product/Spec Planning, design, marketing,
research, QA, memory, or docs semantics. Those semantics belong in workflow
definitions, plugins, capability manifests, node executors, and evidence
profiles.

### WorkflowDefinition

Every production workflow registers a workflow definition with:

- workflow id and status.
- input contract.
- Mission Ledger profile.
- role coverage profile.
- allowed capabilities.
- required and optional role classes.
- required phases.
- context needs.
- source prompt policy.
- capability utility policy.
- runtime tool families.
- model and worker policy refs.
- evidence profile.
- human task policy.
- closeout policy.
- completion review policy.
- Work Queue projection policy.
- live proof requirements.

A workflow without a production-ready definition and executor coverage cannot
produce production success.

### WorkflowPlugin

Workflow plugins bind definitions to executable node behavior.

A plugin supplies:

- workflow id.
- definition ref.
- orchestration policy ref.
- executor keys.
- node executors.
- runtime tool families.
- capability manifest subset.
- role coverage profile.
- validation expectations.
- readback projection refs.

Plugin registration alone is not success. Production readiness requires
executor coverage, Runtime Tool Kernel availability, evidence profile gates,
model-authored closeout, and completion review.

### Capability Manifest

Capabilities are the scheduler's model-visible menu of available work.

Each capability must include:

- capability id.
- role class.
- graph node kind.
- executor key.
- worker ref.
- model policy refs.
- cost class.
- expected strength.
- context capacity.
- ideal task size.
- tool access.
- qualification refs.
- expected evidence classes.
- failure modes.
- escalation rules.

The orchestrator should choose the cheapest sufficiently capable next node
that advances a commitment, reduces uncertainty, distributes context, enables
parallelism, or creates reusable evidence. It should not default to the
strongest model merely because that model is strongest.

## Canonical Execution Flow

### Phase 1: Route Compile

The front door compiles an execution request:

- executor workflow id.
- subject workflow ids.
- target subject refs.
- requested capabilities.
- constraints.
- authority snapshot.
- storage policy.
- prompt hash and volatile prompt ref.

Safety constraints travel to Mission Ledger and compile boundaries. They
should not block routing unless the primary request is prohibited.

### Phase 2: Mission Ledger

The model extracts:

- owner objective.
- blocking commitments.
- nonblocking commitments.
- explicit non-goals.
- safety constraints.
- authority boundary.
- storage boundary.
- lifecycle boundary.

The runtime validates shape, refs, bounds, storage flags, and authority.

### Phase 3: Commitment Work Packet Authoring

The Mission Ledger may stay high-level. Worker delegation cannot.

A model-authored packet pass receives the full original prompt as volatile
input and produces `CommitmentWorkPacket` objects with:

- commitment id.
- owner intent summary.
- what the commitment means operationally.
- likely repo/artifact/domain areas.
- context questions.
- target refs when known.
- stop-if-missing rules.
- evidence claim requirements in human language.
- validation needs.
- acceptance criteria.
- downstream consumers.
- raw-storage flags.

Deterministic packet wrappers are not acceptable as the primary handoff.

### Phase 4: Context Supply Chain

Context is a first-class supply chain, not a side effect of summary text.

The runtime provides:

- source prompt index.
- bounded source-prompt excerpt request/provide/deny tools.
- repo/file/artifact context tools.
- memory retrieval/context-pack tools.
- research tools where the workflow requires current external facts.
- context handoff packet compiler.

Workers can request missing context. If required context is missing, the node
must stop as `needs_review` or request repair/context, not guess.

### Phase 5: Staged Scheduler

Complex workflows must not ask the model for one huge executable graph JSON.
The scheduler uses narrow model/tool steps:

1. `draft_commitment_work_breakdown`
2. `select_capabilities_for_work_units`
3. `define_node_contracts`
4. `define_edges_or_parallelism`
5. `compile_runtime_graph`
6. `review_compiled_graph`
7. `accept_graph`
8. `approve_and_run_first_node`

The model authors intent, rationale, work units, capability choices,
human-readable expected outputs, success criteria, and dependency rationale.
The runtime derives node ids, node kinds, executor keys, worker refs,
expected-evidence classes, storage flags, trace refs, Work Queue child refs,
and authority/lifecycle fields.

No implementation node may run for a complex mission until the graph is
compiled, reviewed, and accepted.

### Phase 6: Node Execution

Each graph node executes through a registered node executor:

- model role.
- worker adapter.
- file-edit adapter.
- validation adapter.
- research adapter.
- memory adapter.
- human task adapter.
- closeout adapter.

Every node has:

- node id.
- commitment ids advanced.
- role class.
- capability id.
- exact objective.
- bounded input refs.
- expected output.
- success criteria.
- downstream consumer.
- budget.
- stop/escalation condition.

Every production node result compiles into
`generic_workflow_node_execution_result` before it can advance the graph:

- runtime job id.
- graph id.
- node id.
- workflow id.
- role class and role id.
- capability id.
- executor key.
- worker ref.
- status.
- model/tool/script/DB refs.
- output refs.
- evidence claims.
- validation refs.
- changed-file refs.
- human-decision refs.
- closeout refs.
- limitations.
- bounded owner summary and ELI5 summary.
- raw-storage and authority/lifecycle flags.

### Phase 7: Evidence Claims

Every node result that advances work returns explicit evidence claims:

```json
{
  "commitmentId": "commitment-id",
  "evidenceRef": "artifact://bounded/ref",
  "evidenceKind": "source_change",
  "claimSummary": "Bounded summary of what this proves.",
  "limitations": [],
  "rawPromptStored": false,
  "rawResponseStored": false,
  "rawProviderLogStored": false
}
```

Runtime validates refs, known commitment ids, evidence kind, raw-storage
flags, and lifecycle boundaries. The Mission Ledger evaluator and reviewer
judge semantic sufficiency.

Runtime also derives:

- evidence claim id.
- producing node id.
- producing capability id.
- producing executor key.
- validation refs.
- changed-file refs.
- artifact refs.
- sufficiency judgment ref when model-authored review exists.

If a node succeeds without required evidence claims, references an unknown
commitment, cites a missing evidence ref, stores raw content, grants
authority, or mutates Work Queue/runtime lifecycle, the node result becomes
`needs_review` and returns to the scheduler repair/escalation path.

### Phase 8: Repair, Continuation, And Human Pause/Resume

Validation failure, schema failure, missing context, or weak evidence returns
to the scheduler with bounded diagnostics.

The scheduler can:

- call context again.
- split work.
- call a cheaper/specialized worker.
- escalate to Codex/GPT-5.5.
- call validation/test.
- call review.
- ask the human operator.
- revise packets.
- terminalize as `needs_review`.

Human tasks are graph nodes with bounded prompt summary, required response
shape, deadline, resume ref, and decision refs. Human input cannot grant
authority beyond policy.

### Phase 9: Finalization

Clean success requires:

- accepted Mission Ledger state.
- accepted workflow evidence profile.
- accepted runtime graph/tool evidence.
- accepted evidence claims for blocking commitments.
- model-authored Closeout Capsule.
- accepted completion review.
- Work Queue readback.

Closeout cannot run as clean success while blocking commitments remain open.
Degraded/system closeout cannot satisfy production success.

## Work Queue Readback

Work Queue owner readback should show:

- parent item.
- child graph items.
- active phase.
- active node.
- role/model/worker ref.
- why selected.
- objective.
- target refs.
- expected output.
- validation state.
- produced evidence.
- open commitments.
- context blockers.
- human tasks.
- closeout state.
- limitations.
- ELI5.

Work Queue derives active/closed state from DB runtime evidence and closeout
transitions. Code edits are not required to close items.

## Production Success Gates

The generic orchestration runtime is complete only when:

- the runtime engine executes coding without coding-specific runner control
  flow.
- `agent_team.product_spec_planning` can plug in as a workflow plugin.
- graph creation uses staged tools instead of one-shot executable JSON.
- runtime compiles canonical graph envelopes.
- node executors use generic input/output/evidence contracts.
- validation failures repair inside the same runtime job when recoverable.
- human tasks pause and resume through graph state.
- graph nodes materialize into Work Queue child readback.
- closeout cannot succeed without real evidence.
- generic/legacy runners cannot produce production success.
- Product/Spec Planning passes as the first non-coding workflow proof.

## Work Queue Breakdown

This architecture should be delivered as six queue items:

1. Generic Orchestration Runtime Engine.
2. Generic Staged Scheduler Protocol.
3. Generic Node Executor And Evidence Claim Contract.
4. Product/Spec Planning Workflow Plugin Production Proof.
5. Starter Workflow Plugin Migration.
6. Future Team Workflow Readiness.

Items 1-3 should happen before the next Product/Spec Planning proof. Item 4
is the proof. Items 5-6 follow after Product/Spec proves the spine.
