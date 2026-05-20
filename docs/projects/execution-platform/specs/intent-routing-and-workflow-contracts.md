# Intent Routing And Workflow Contracts

## Router Front Door Tool Protocol

Accepted production execution routing is now a staged Runtime Tool-Call
Kernel protocol:

1. `router.classify_owner_turn_intent`
2. `router.extract_constraints`
3. `router.select_executor_workflow`
4. `router.identify_subject_refs`
5. `router.compile_execution_request`
6. `router.validate_route_contract`

The model authors semantic routing only: primary outcome, requested actions,
constraints, executor workflow, subject refs, requested capabilities, and
rationale. Runtime code owns canonical tool invocation refs, schema
validation, bounded persistence, authority checks, lifecycle separation,
runtime-job compile, and Mission Ledger handoff refs.

Accepted runtime jobs carry:

- `routerToolProtocolRef`
- `routerToolInvocationRefs`
- `missionLedgerHandoffRef`
- source prompt hash/ref/length
- bounded constraint summaries for Mission Ledger

Safety-boundary text is not a route blocker unless the primary requested
outcome itself is prohibited. Constraints such as no deploy, no outbound
send, no model promotion, no raw storage, and no Work Queue lifecycle mutation
must be preserved for Mission Ledger/compile enforcement.

The legacy semantic fallback is test-only and cannot be enabled in production
with `OPENCLAW_LEGACY_SEMANTIC_INTENT_ROUTING_FALLBACK`.

## Capability/Subject Routing Split

Intent routing output separates execution ownership from the target subject.

Required conceptual fields:

- `executorWorkflowId`: the workflow that should execute the requested work.
- `subjectWorkflowIds`: workflow surfaces that are the subject of the work.
- `targetSubjectRefs`: bounded refs for target workflows, files, docs,
  runtime objects, or queue items.
- `requestedCapabilities`: capability classes the executor must support, such
  as `code_edit`, `test`, `docs_update`, `review`, `closeout`, `research`,
  `planning`, `compile_runtime_plan`, or `work_queue_readback`.
- `constraints`: negative or conditional policy boundaries such as no deploy,
  no outbound send, no model promotion, no install, no raw storage, and no
  Work Queue lifecycle mutation.

`workflowId` is retained only as a compatibility alias for
`executorWorkflowId`. For `workflow_execution`, a router result that provides
both fields with different values is invalid.

Examples:

- "implement Product/Spec Planning" means executor `agent_team.coding`,
  subject `agent_team.product_spec_planning`, requested capabilities
  `code_edit`, `test`, `docs_update`, `review`, `closeout`.
- "draft a plan/spec for a new feature" may mean executor
  `agent_team.product_spec_planning`, requested capabilities `planning` and
  possibly `research`, with no code-edit authority.
- "review existing architecture" may select the architecture/spec workflow or
  coding reviewer depending on requested capabilities, while preserving the
  reviewed system as a target subject.

The deterministic validator checks structural facts only:

- executor workflow exists.
- compatibility alias does not conflict.
- requested capabilities are known.
- selected executor advertises those executable capabilities.
- constraints are bounded and raw-storage flags remain false.

If the model chooses an executor that lacks requested capabilities, native
submit may run one bounded repair that asks the model to reselect an executor
while preserving the subject and constraints. It must not hard-code a
Product/Spec-specific exception.

Work Queue readback must project executor, subject, capabilities, and
constraints. This makes owner-facing failures explainable without treating the
target workflow as lifecycle truth.

## Runtime Toolification Boundary

Long implementation prompts should flow through:

```text
ordinary-chat allow gate
  -> advanced workflow route
  -> Mission Ledger
  -> scheduler decomposition tool calls
  -> tool-backed node execution
  -> evidence claims
  -> model-authored closeout
```

Routing should not duplicate Mission Ledger work. Safety constraints such as
"do not deploy" or "do not store raw logs" are mission constraints, not
workflow-route blockers unless the primary requested outcome itself is
prohibited.

Background heartbeat/proactivity must not participate in this route while an
owner turn is active. The gateway marks accepted owner chat turns before
front-door handoff, and heartbeat skips the base session and isolated heartbeat
sibling until the owner turn completes, aborts, errors, or expires by TTL.

Workflow contracts must expose executable capabilities with cost, strength,
context capacity, ideal task size, tool access, failure/escalation policy, and
required evidence shape. The orchestrator sees this manifest and selects the
cheapest sufficiently capable node that advances a commitment or reduces
uncertainty.

Generated Work Queue children created by workflow execution must use the
generated-item lifecycle contract. Routing and workflow contracts may request
runtime graph child materialization, human tasks, proof diagnostics, or
proactivity proposals, but those generated classes have different terminal
policies and owner visibility. Proof diagnostics must not leak into active
owner work.

## Long Prompt Transport

Long implementation prompts are operator input bytes, not shell or JavaScript
source. Live UX proof tooling should submit prompts through file/stdin based
transport:

```bash
node scripts/openclaw-submit-prompt-via-ux.mjs --prompt-file /path/to/prompt.txt --wait-for progress
```

The submission artifact records prompt hash, length, source kind, run refs,
and bounded completion evidence only. Raw prompt text, raw responses, and raw
transcripts remain outside proof artifacts.

## Runtime-Owned Field Boundary

Model/tool contracts must distinguish model-authored decisions from
runtime-owned schema:

- model-owned: selected capability, objective, role rationale, commitment
  mapping, expected human-readable output, success criteria, cost/utility
  rationale, and stop/escalation condition.
- runtime-owned: graph node kind, executor key, worker ref, runtime ids,
  expected-evidence enums, storage flags, authority boundaries, and canonical
  evidence requirements.

The deterministic layer compiles runtime-owned fields from the capability
manifest, Mission Ledger, workflow evidence profile, and current runtime graph
state. It should not ask the model to repeat fields the runtime can derive.
This keeps the model responsible for judgment while reducing schema choke.

## Product/Spec Planning

`agent_team.product_spec_planning` is a first-class workflow contract for
messy owner objectives that need bounded planning before execution. It is also
a normal target subject when the owner asks another workflow to build, test,
or harden the Product/Spec Planning implementation.

Routing contract:

- use Product/Spec Planning as executor for plan/spec/capsule/action-graph
  proposal work.
- use the coding workflow as executor and Product/Spec Planning as subject
  when the owner asks to implement, wire, test, harden, rebuild, or validate
  Product/Spec Planning code.
- do not route Product/Spec Planning through the generic workflow queued
  runner.
- generic workflow fallback must fail clearly with
  `product_spec_planning_requires_scheduler_backed_runner`.
- production Product/Spec Planning execution requires the canonical Runtime
  Workflow Graph Engine, the Product/Spec workflow plugin, scheduler executor
  coverage, and runtime-tool kernel evidence
- proposed child actions require a later compile/authority boundary before runtime jobs or human tasks are created
- the scheduler receives the compiled executor/subject split from routing;
  it does not rediscover the split through Product/Spec-specific keyword
  rules.

## Related Specs

- `runtime-toolification-and-utility-scheduling.md`
- `runtime-work-graph.md`
- `work-queue-execution-truth.md`
- `work-queue-generated-item-lifecycle.md`
- `runtime-parallelism-and-contract-boundaries.md`
