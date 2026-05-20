# Product/Spec Planning Production Upgrade

You are OpenClaw working in `/root/services/openclaw-roles/live`.

This is the canonical, repo-owned Product/Spec Planning Production Upgrade
proof prompt. Do not use older `/tmp` recovered prompt copies. This prompt is
anchored in the current Work Queue specs and must be treated as a real
implementation task, not a proof-only exercise.

## Mission

Implement Product/Spec Planning as a first-class production workflow surface on
the canonical OpenClaw orchestration runtime.

The executor workflow for this prompt is the implementation/coding workflow
capable of repository edits, validation, review, docs, Work Queue updates, and
closeout. Product/Spec Planning is the target subject workflow being built and
validated.

Do not route this prompt to the incomplete Product/Spec Planning workflow as
the executor. If a workflow surface is being implemented, route to the coding
implementation workflow and record `agent_team.product_spec_planning` as the
target subject.

## Required Architecture

Product/Spec Planning must be native to the current generic orchestration
spine:

1. Intent Front Door separates executor workflow from target subject.
2. Generic Orchestration Runtime resolves `WorkflowDefinition` and workflow
   plugin readiness.
3. Mission Ledger records owner objective, constraints, commitments, and
   evidence expectations.
4. Commitment Work Packet Author creates worker-ready packets with full
   original prompt access.
5. Context Supply Chain provides bounded prompt excerpts, repo/project context,
   memory/context-pack refs when relevant, research refs when needed, and
   stop-if-missing rules.
6. Staged Scheduler Protocol authors intent in phases and lets runtime compile
   node envelopes, ids, executor keys, worker refs, expected evidence,
   authority, storage, lifecycle, and Work Queue child refs.
7. Runtime Tool-Call Kernel traces scheduler decisions, model calls, node
   execution, validation, compile checks, readback, closeout, and completion
   review.
8. Generic node executors produce canonical node results and explicit
   commitment evidence claims.
9. Workflow Evidence Profile, model-authored Closeout Capsule, and Completion
   Review gate final success.
10. Boundary Replay checkpoints allow restart from accepted boundaries without
    rerunning the full funnel.

Do not create a Product/Spec-specific runner, proof script, compatibility
adapter, generic queued workflow success path, degraded closeout path, or
deterministic semantic shortcut.

## Canonical Workflow Definition And Plugin

Create or update the production `WorkflowDefinition` for:

- workflow id: `agent_team.product_spec_planning`
- definition ref: `workflow-definition.agent_team.product_spec_planning.v1`
- plugin ref: `workflow-plugin.agent_team.product_spec_planning.v1`
- status: `production_ready`
- production enabled: true
- scheduler backed: true
- Runtime Tool-Call Kernel required
- staged scheduler protocol required
- runtime-derived node envelopes required
- runtime-derived expected evidence required
- model-authored structure review required
- first-node approval required
- degraded/system closeout blocked
- generic queued workflow runner blocked
- raw prompt/response/transcript/provider log/tool log/command log/DB row,
  secrets, and hidden reasoning storage forbidden

Required role classes:

- orchestrator
- planning
- review
- closeout

Optional role classes:

- research
- human
- implementation
- observability

Allowed capabilities:

- `planning_orchestrator`
- `web_research`
- `planning_capsule`
- `action_graph_compile`
- `human_task`
- `reviewer`
- `closeout`

Executor-key coverage must exist for:

- `role:orchestrator`
- `role:planning_orchestrator`
- `kind:orchestrator_plan`
- `kind:web_research`
- `kind:planning_capsule`
- `kind:human_task`
- `kind:action_graph_compile`
- `kind:compiler`
- `kind:closeout`

Missing definition, plugin registration, executor coverage, Runtime Tool-Call
Kernel, Workflow Evidence Profile, closeout policy, or completion-review policy
must block production success.

## Required Planning Flow

Product/Spec Planning must support this production graph shape:

1. `planning_orchestrator`
2. optional `web_research` or explicit model-authored no-research decision
3. `planning_capsule_draft`
4. optional `planning_capsule_revision`
5. optional `human_planning_decision`
6. `action_graph_proposal`
7. `compile_runtime_plan`
8. validation/review/readback nodes as needed
9. `planning_closeout`
10. completion review

The first executable node for a Product/Spec Planning runtime graph must be a
planning-orchestrator-class node. Non-planning nodes such as web research,
planning capsule, human task, action graph compile, compiler, and closeout must
wait for planning-orchestrator evidence.

## Staged Scheduler Requirements

The model must not hand-author executable graph internals. It decides semantic
intent and sufficiency. Runtime owns schema, refs, bounds, persistence,
authority, lifecycle, and tool execution.

The scheduler protocol must support:

- work-unit breakdown
- capability selection
- graph compile
- edge or parallelism structure review
- graph acceptance
- first-node approval
- run/repair/review/finalize

The model authors:

- work units
- planning rationale
- capability choices
- commitment mapping
- expected human-readable output
- success criteria
- downstream consumers
- edge/parallelism rationale
- semantic sufficiency judgments

The runtime derives:

- node ids
- node kinds
- executor keys
- worker refs
- expected evidence classes
- trace refs
- storage flags
- authority flags
- lifecycle metadata
- Work Queue child refs

Complex planning work cannot execute nodes until the graph is compiled,
structure-reviewed, accepted, and first-node approved.

## Context Supply And Research

Product/Spec Planning receives the full original prompt only as volatile
runtime input. Persisted refs are bounded hashes, source-prompt index refs,
excerpt refs, artifact refs, and context-pack refs.

Planning context must include:

- owner objective and constraints from Mission Ledger
- worker-ready Commitment Work Packets
- bounded source-prompt excerpts when needed
- project/repo context refs where the plan affects existing systems
- ResearchBrief refs when current external facts can affect the plan
- stop-if-missing rules
- downstream consumer and evidence-claim expectations

Web research must be selected when current external facts, market/product
assumptions, platform capabilities, compliance expectations, or user-facing
claims materially affect the Planning Capsule. ResearchBrief artifacts must
include bounded source refs, retrieval date, findings, confidence, limitations,
stale-external-assumption warnings, and planning implications. Do not store raw
pages or raw provider output.

## Planning Artifacts

Implement Planning Capsule lifecycle as canonical production artifacts.

Planning Capsule fields must include:

- owner objective
- problem statement
- non-goals
- system facts and refs
- research influence refs
- stale external assumptions
- design constraints
- workflow/runtime implications
- data-model implications
- UI/readback implications
- authority constraints
- validation and rollout plan
- open decisions
- human decision refs
- ActionGraphProposal refs
- compile-readiness state
- limitations
- ELI5 summary

Capsule draft and revision nodes must produce canonical node execution results
and commitment evidence claims. A capsule artifact alone does not close a
commitment unless it maps through the generic evidence-claim contract.

Human planning decisions must be graph nodes with bounded prompt summary,
concrete options/tradeoffs, required response shape, operator ref, deadline,
blocking graph refs, resume ref/hash, bounded response refs, and decision refs.
Human input can answer a bounded planning question. It cannot grant authority
outside workflow policy, bypass compile validation, or mutate lifecycle
directly.

ActionGraphProposal is proposal authority only. It may suggest child actions,
dependencies, workflows, role/capability needs, validations, authority needs,
context refs, risks, and rollback notes. It must not create runtime jobs,
execute child actions, or close child work by itself.

`compile_runtime_plan` must validate proposal schema, dependency graph, missing
decisions, authority requirements, workflow/executor availability, storage
safety, child feasibility, Work Queue child-item creation policy, and compile
readiness. Compile readiness is evidence that a proposal could be promoted
through a later explicit authority boundary. It is not child execution.

## Evidence Claims And Closeout

Every production Product/Spec node result must compile into
`generic_workflow_node_execution_result` before it can advance the graph.

Each advancing result must include commitment-mapped evidence claims:

- `commitmentId`
- `evidenceRef`
- `evidenceKind`
- bounded claim summary
- limitations
- producing node/capability/executor identity
- raw-storage false flags

Runtime validates refs, known commitment ids, storage flags, authority flags,
and lifecycle separation. Model-authored review judges semantic sufficiency.
Generic artifacts, role reports, process completion, or degraded closeout do
not imply commitment closure.

Clean success requires:

- accepted Mission Ledger
- accepted Commitment Work Packets
- accepted context supply for context-dependent nodes
- staged graph compile, structure review, graph acceptance, and first-node
  approval
- registered executor node execution
- commitment-mapped evidence claims
- validation and compile-readiness refs
- Work Queue readback projection
- accepted Workflow Evidence Profile
- model-authored Closeout Capsule
- accepted Completion Review

Degraded/system closeout is diagnostic-only everywhere. Do not mark the
workflow or Work Queue item succeeded without real closeout evidence.

## Work Queue Readback

Owner-facing readback must show:

- workflow definition and plugin refs
- generic runtime status
- runtime job and graph id
- active phase, active node, role/model/worker ref
- why the node was selected
- objective and target refs
- expected output
- current validation state
- produced evidence
- open commitments
- context blockers
- research refs and bounded summary
- Planning Capsule refs and lifecycle state
- human decision status and options
- ActionGraphProposal refs
- compile-readiness state
- proposed child actions
- boundary replay state and reusable checkpoints
- closeout and completion-review refs
- limitations and ELI5 progress

Work Queue child/action materialization must reflect runtime graph children
where policy says children should be visible, and proof/helper children must
not hang as active roadmap work.

## Model And Delegation Policy

Use cost-aware capability policy. The orchestrator should not ask “who is best”
in isolation. It should choose the cheapest sufficiently capable next node that
advances a commitment, reduces uncertainty, distributes context, enables
parallel work, or produces reusable evidence.

For multi-commitment work:

- do not let broad Codex implementation consume implementation, validation,
  review, and readback responsibilities unless the orchestrator explicitly
  proves cheaper or specialized nodes are unsuitable
- use context scout fanout and context synthesis before downstream
  implementation planning when repo context is needed
- use non-Codex lanes for sufficiently scoped implementation, validation,
  context request, evidence, and repair work where the manifest says they are
  capable
- allow Codex/GPT-5.5 for Mission Ledger, global scheduler reasoning, context
  synthesis core reasoning, integration/escalation, closeout acceptance, and
  review where high capability is justified

Do not call child agents just to prove they can be called. Every child node
must have a concrete objective, input refs, expected output, success criteria,
downstream consumer, and commitment mapping.

## Validation Requirements

Add or update focused tests for:

- workflow definition registration and plugin resolution
- Product/Spec generic-runner rejection
- planning-orchestrator-first graph policy
- executor-key and capability-manifest coverage
- ResearchBrief contract
- Planning Capsule draft/revision lifecycle
- human planning decision lifecycle
- ActionGraphProposal contract
- compile-readiness validation
- proposal-only child action boundary
- generic node result and evidence-claim mapping
- Work Queue planning readback
- degraded closeout rejection
- model-authored Closeout Capsule and Completion Review gating
- no raw-storage violations
- source/replay parity where relevant

Run the narrowest meaningful validation first, then broader validation as
needed. If TypeScript/build validation fails for unrelated drift, isolate and
report it; do not hide it.

## Documentation Requirements

Update relevant specs, decisions, roadmap, current slice, and indexes,
including:

- Product/Spec Planning production workflow spec
- planning lifecycle and proactivity spec
- runtime work graph spec
- workflow definition/generic orchestration specs
- Work Queue execution/readback truth specs
- decisions/status/roadmap/current slice

Docs must explain:

- executor workflow vs target subject
- planning workflow phases
- research selection and ResearchBrief contract
- Planning Capsule lifecycle
- human planning decision lifecycle
- ActionGraphProposal proposal-only boundary
- compile readiness
- Work Queue readback
- closeout/completion-review gates
- what remains after this proof, if anything

## Stop Conditions

Stop and return needs_review with exact diagnostics instead of pretending
success if:

- the router selects `agent_team.product_spec_planning` as executor for this
  implementation prompt instead of coding implementation with Product/Spec as
  target subject
- Mission Ledger is invalid after one bounded repair
- Commitment Work Packets are not worker-ready
- context-dependent nodes lack accepted context
- scheduler graph collapses into generic broad implementation
- graph has no edges or explicit parallel-independent justification
- child Work Queue materialization/readback is missing where required
- node executors are not registered
- evidence claims do not map to commitments
- validation/compile readiness is missing
- closeout is degraded/system-authored
- generic queued runner or proof-only path can claim production success

## Completion Review

After implementation and validation, ask and answer this with code review, not
from memory:

Did we maximally execute and implement Product/Spec Planning Production
Upgrade? Is Product/Spec Planning canonical production code, fully wired into
workflow definition registry, workflow plugin registry, generic orchestration
runtime, staged scheduler, capability registry, node executors, Runtime
Tool-Call Kernel, Mission Ledger evidence claims, validation/compile
readiness, Work Queue readback, model-authored closeout, completion review,
and boundary replay? Is there any way to improve, harden, optimize, sharpen,
extend, or otherwise make it stronger before calling the item complete? Are
there any fallback, compatibility, generic-runner, proof-only, dead-code, or
degraded-closeout paths that could still produce production success without
canonical evidence? Is anything still skeletal, unwired, or proof-shaped?

If the answer is not an unqualified yes, implement the missing hardening,
rerun focused validation, update docs/artifacts/Work Queue evidence, and repeat
the question. Do not stop at partial completion unless a real external
owner-only credential/configuration is missing and cannot be discovered from
existing config/auth registries.

## Required Final Evidence

The final report must include:

- route/executor/target-subject evidence
- Mission Ledger result
- Commitment Work Packet result
- context supply/research result
- scheduler graph result
- node executor result
- source edit summary
- validation summary
- Work Queue readback summary
- Planning Capsule lifecycle result
- ActionGraphProposal/compile-readiness result
- closeout/completion-review result
- limitations
- remaining queue items, if any
- clear statement whether `openclaw-convergence.active-queue-34` can be closed
  from accepted runtime evidence
