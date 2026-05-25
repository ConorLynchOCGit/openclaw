# Context Scout Execution Packet And Request-Context Repair Compiler

Date: 2026-05-21

Status: implemented and closed from checkpointed proof evidence. The latest
Product/Spec run advanced beyond the original oversized context-scout
prompt/provider-timeout/request-context-envelope failure class, then exposed
the downstream parallel-frontier/resource-boundary failure tracked in
`parallel-frontier-resource-boundary-hardening.md`. This spec records the fix
for the older Product/Spec proof failure and defines the DB Work Queue item:
`openclaw-convergence.context-scout-execution-packet-request-context-repair`.

2026-05-21 follow-up: the next checkpointed Product/Spec proof advanced past
this older call-shape failure and exposed a downstream scheduler/resource
boundary class: context limitations were not enforced per consumer, resource
packet bounds could throw into the worker adapter, context repair nodes could
lack consumers, and parallel frontier branch failures were not isolated. That
follow-on blocker is specified in
`parallel-frontier-resource-boundary-hardening.md` and must run before the
next full proof.

2026-05-24 follow-up: context scout execution packets now accept a
`contextBrokerRequest` summary compiled from canonical readiness state. Broker
dispatched scouts receive the requesting consumer node id, semantic question,
candidate resource refs, target node ids, and reason codes. This keeps the
model's job semantic and consumer-scoped while runtime owns ids, refs, edge
wiring, lifecycle, bounds, storage, and readback.

## Problem

The latest Product/Spec Planning proof proved the top of the runtime path,
then failed at the first context-supply boundary before implementation.

Runtime evidence:

- runtime job: `native-exec-06e162ea7066ac2e`
- prompt hash:
  `da653d2e62b859d27dd1ae409bcdec4ca638dac97c2b2338429651e7641731ea`
- route: `agent_team.coding`
- job type: `executor.agent_team`
- Mission Ledger: valid, `clear_to_execute`
- blocking commitments: 13
- Commitment Work Packets: 13/13 produced
- packet review: skipped
- graph: 10 nodes, 14 edges
- role invocations: 0
- first open gate: `context_supply`
- terminal result: `needs_review`

The root failure had two parts.

First, context scout model calls were blocked before provider execution by
structured-adapter preflight:

- prompt/input size was about 42 KB.
- the `local_semantic_extraction` policy max was 32 KB.
- requested call timeout was 900 seconds.
- the `local_semantic_extraction` hard timeout was 90 seconds.
- reason codes included:
  `structured_adapter_preflight_evaluated`,
  `structured_adapter_input_exceeds_policy_bound`,
  `structured_adapter_timeout_exceeds_policy_bound`, and
  `structured_adapter_preflight_blocked`.

The context scout call was receiving a monolithic role prompt that bundled
too much global state: full objective text, bounded but still broad
Commitment Work Packet summaries, source prompt index, source prompt excerpt
decisions, volatile excerpts, repo context index, and role instructions. That
violates the resource-materialization principle already documented for
implementation workers: each executor needs a bounded execution packet
compiled for its task, not a giant prompt dump.

Second, scheduler repair after missing context handoff fell back into the old
model-authored graph envelope failure. The runtime rejected repair attempts
with reasons including:

- `decision_new_nodes_missing`
- `staged_scheduler_model_authored_runtime_envelope_not_allowed`
- `node_id_missing`
- `generic_staged_scheduler_protocol_required_for_node_creation`
- `generic_staged_scheduler_node_not_compiled`

This means the scheduler still asks for `newNodes` in a request-context
repair path where the model should only provide semantic repair intent. The
runtime should compile node ids, capability ids, executor keys, worker refs,
expected evidence, storage flags, authority, edges, and lifecycle.

## Non-Goals

This item does not implement the Product/Spec Planning workflow itself. It
hardens the generic coding-team orchestration boundary so the Product/Spec
implementation proof can proceed to real context supply and implementation.

This item does not weaken structured-adapter policy by increasing byte limits
or timeouts until the bad call shape passes. It changes the call shape.

This item does not reintroduce model-authored runtime envelope fields for
repair. Runtime-owned schema remains runtime-owned.

## Governing Principles

1. Every model call receives enough context to succeed, but only through a
   task-bounded packet.
2. The model decides semantic needs, relevance, sufficiency, limitations, and
   repair intent.
3. Runtime owns schema, ids, refs, byte budgets, timeout budgets,
   persistence, authority, lifecycle, worker refs, executor keys, storage
   flags, and evidence enums.
4. Long node budgets and provider-call budgets are separate. A node may have
   a 15-minute total budget while an individual Qwen context-scout call has a
   90-second provider budget.
5. Context scout should use source-prompt indexes, bounded excerpt tools,
   repo/context tools, and commitment/work packet refs. It should not receive
   the full original prompt or full ledger in every call.
6. If a packet cannot fit inside policy, runtime should not truncate
   arbitrarily. It should compile a smaller ref-first packet, request a
   bounded excerpt, split the task, or terminalize with a precise blocker.
7. Missing context is scheduler evidence, not an implementation-worker
   failure.
8. Request-context repair is a semantic intent contract. Runtime compiles the
   graph mutation.
9. Owner readback must show the active node, target commitment ids,
   preflight bytes, timeout policy, selected model, provider-call status,
   emitted handoff packet, and next transition.
10. No raw prompts, raw provider responses, hidden reasoning, raw tool logs,
    raw command logs, raw DB rows, or secrets may be stored.

## External Architecture Anchors

This design follows the same production patterns already used in the broader
Execution Platform specs:

- durable graph execution should checkpoint side-effecting node work and make
  replay deterministic, as described in
  [LangGraph durable execution](https://docs.langchain.com/oss/python/langgraph/durable-execution).
- model/tool visibility should produce inspectable spans and traces, as
  described in
  [OpenAI Agents tracing](https://openai.github.io/openai-agents-js/guides/tracing/).
- constrained model outputs work best when the model is given a small typed
  contract and runtime validates the schema, as described in
  [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
- coding subagents work best with explicit responsibilities, bounded context,
  and task-specific tool access, consistent with
  [Claude Code subagents](https://code.claude.com/docs/en/sub-agents).
- multi-agent systems need explicit decomposition, context management, and
  traceable handoffs, consistent with Anthropic's
  [multi-agent research system writeup](https://www.anthropic.com/engineering/multi-agent-research-system).

## Proposed Architecture

Add a first-class `ContextScoutExecutionPacket` and compile it before any
context-scout provider call.

The packet is a domain resource packet for context-supply nodes. It is
analogous to `ImplementationTaskPacket` for implementation nodes, but it is
optimized for discovery, relevance judgment, and handoff production.

### ContextScoutExecutionPacket

Required fields:

- `packetId`
- `runtimeJobId`
- `workflowId`
- `graphId`
- `nodeId`
- `targetNodeIds`
- `targetCommitmentIds`
- `sourcePromptIndexRef`
- `commitmentPacketRefs`
- `commitmentPacketSummaries`
- `objective`
- `contextObjective`
- `downstreamConsumer`
- `requestedContextQuestions`
- `likelyRepoAreas`
- `knownTargetRefs`
- `allowedRepoScopeRefs`
- `validationNeedSummaries`
- `evidenceNeedSummaries`
- `stopIfMissing`
- `excerptRequestBudget`
- `repoContextBudget`
- `byteBudget`
- `modelTaskClass`
- `modelPolicyRef`
- `providerTimeoutMs`
- `rawPromptStored: false`
- `rawResponseStored: false`
- `rawProviderLogStored: false`
- `rawToolLogStored: false`
- `rawDbRowsStored: false`

Optional fields:

- `boundedPromptExcerptRefs`
- `repoContextIndexRef`
- `boundedRepoContextRefs`
- `memoryContextPackRefs`
- `priorContextHandoffRefs`
- `contextBrokerRequest`
- `blockingLimitationRefs`
- `nonblockingLimitationRefs`
- `contextRepairAttempt`
- `idempotencyKey`

The packet must contain the smallest sufficient context for the node. It
should normally include:

- the target work node objective.
- the target commitment ids and summaries.
- the specific context questions derived from the Commitment Work Packets and
  work node.
- the context broker semantic question and consumer node id when the scout is
  dispatched by a readiness blocker.
- likely repo areas and known target refs from packet/resource metadata.
- bounded references to source prompt sections, not the full prompt body.
- bounded references to repo context indexes, not full repo dumps.

### Packet Compilation Tool

Add a runtime tool:

`context_scout.build_execution_packet`

Inputs:

- runtime job ref.
- graph id.
- context scout node id.
- target node ids.
- target commitment ids.
- source prompt context index ref.
- Commitment Work Packet refs.
- known target refs and likely repo areas.
- requested context questions.
- downstream consumer.
- byte budget.
- model policy ref.

Outputs:

- `ContextScoutExecutionPacket` artifact ref.
- byte count.
- included section refs.
- omitted section summaries.
- explicit context gaps.
- preflight status.
- provider-call timeout budget.
- next allowed transition.

The tool must fail closed when it cannot build a useful packet inside policy.
It should emit a precise blocker instead of stuffing the prompt.

### Context Tools For The Scout

The context scout model should be able to call or request these bounded
runtime operations through the existing Runtime Tool Kernel:

- `context_scout.request_prompt_excerpt`
  - model selects source prompt section ids or asks for a bounded excerpt for
    a target question.
  - runtime returns excerpt refs and bounded summaries.
- `context_scout.request_repo_context`
  - model asks for file/directory/search context by bounded ref or query.
  - runtime validates scope, resolves refs, and returns bounded refs.
- `context_scout.emit_handoff_packet`
  - model emits semantic handoff content, relevant refs, confidence,
    limitations, missing context, and downstream guidance.
  - runtime validates refs and compiles a canonical handoff packet.
- `context_scout.classify_context_blocker`
  - model classifies why context is insufficient.
  - runtime maps the classification into scheduler repair input.

These tools replace monolithic prompt stuffing. They are also the right
abstraction for future non-coding workflows:

- research context supply asks for source/search refs.
- design context supply asks for brand/assets/reference refs.
- marketing context supply asks for audience/source-fact refs.
- planning context supply asks for product/user/current-external-assumption
  refs.
- memory context supply asks for retrieval/context-pack refs.

## Timeout And Budget Policy

The failure exposed a budget-boundary bug: the scheduler passed a 15-minute
role call timeout into a provider call classified as `local_semantic_extraction`.

Fix:

- node total budget remains a node lifecycle budget.
- provider call budget is derived separately from the model task policy and
  provider profile.
- context scout provider timeout must be:
  `min(remainingNodeBudgetMs, modelTaskPolicy.timeoutMs,
roleProfile.maxProviderTimeoutMs)`.
- context scout soft timeout must come from the same policy family.
- provider-call preflight must see the derived provider timeout, not the node
  total timeout.
- Work Queue readback must show both values:
  - node budget.
  - provider-call timeout.

For current coding context scout:

- task class: `local_semantic_extraction`
- default model: fast structured lane unless policy escalates
- default provider timeout: 90 seconds
- node lifecycle budget: can remain larger, for tool requests and retries
- retry: only failed packet/tool boundary, not whole role prompt

## Request-Context Repair Compiler

Add a semantic repair intent for context failures:

`requestContextIntent`

Allowed on decision kinds:

- `request_context`
- `repair_from_context_failure`
- `repair_from_validation` when validation fails due missing context
- `repair_from_worker_precondition` when worker readiness is blocked by
  context or target refs

Required model-authored fields:

- `failedNodeIds`
- `blockedTargetNodeIds`
- `targetCommitmentIds`
- `contextObjective`
- `missingContextQuestions`
- `whyNeededNow`
- `downstreamConsumer`
- `knownInputRefs`
- `knownTargetRefs`
- `limitationsToResolve`
- `stopIfMissing`
- `nonDuplicateRationale`

Runtime-derived fields:

- node ids.
- node kind.
- capability id.
- executor key.
- worker ref.
- storage flags.
- authority.
- graph edges.
- dependency/handoff edge labels.
- expected evidence.
- timeout policy.
- raw-storage flags.
- Work Queue child metadata.
- node lifecycle state.

The model must not author `newNodes`, `nodeId`, `nodeKind`, `executorKey`,
`workerRef`, storage flags, or evidence enums for this repair path.

### Compiler Behavior

The compiler must:

1. validate the semantic intent shape.
2. validate that failed/blocked node ids exist in the graph.
3. validate commitment ids against the Mission Ledger.
4. select a context-supply capability from the canonical capability registry.
5. compile a context scout prerequisite node.
6. compile handoff/dependency edges from context scout to blocked targets.
7. create or update graph node metadata with bounded refs.
8. emit Work Queue child/action items through the canonical lifecycle path.
9. set blocked implementation nodes to a non-executable readiness state.
10. emit owner-facing progress/readback.

If the same blocked node already has an equivalent context repair node in
flight, the compiler must not create a duplicate. It should attach the new
semantic context questions to the existing prerequisite when safe or emit a
`duplicate_context_repair_blocked` diagnostic.

### Repair Diagnostics

`missingFieldsForDecision` and related repair diagnostics must be aware of
the request-context path.

Bad diagnostic:

```json
{
  "missingFields": ["newNodes[0].nodeId"]
}
```

Good diagnostic:

```json
{
  "failedDecisionId": "decision-123",
  "contract": "requestContextIntent",
  "missingFields": [
    {
      "path": "requestContextIntent.contextObjective",
      "expectedType": "string",
      "whyRequired": "the runtime needs a semantic objective before compiling a context prerequisite node"
    }
  ],
  "forbiddenFields": [
    {
      "path": "newNodes",
      "whyForbidden": "request-context repair is runtime-compiled from semantic intent"
    }
  ],
  "preserveFields": ["failedNodeIds", "blockedTargetNodeIds", "targetCommitmentIds"]
}
```

## Readiness And Lifecycle Semantics

Context scout outcomes:

- `accepted`
  - the handoff satisfies the downstream node's context requirements.
- `accepted_with_limitations`
  - the handoff can advance planning or readback, but each limitation must be
    marked blocking or nonblocking per target node.
- `needs_context_repair`
  - context is insufficient but repair is possible with clearer questions,
    narrower target refs, additional prompt excerpts, repo discovery, memory
    retrieval, or human clarification.
- `needs_review`
  - runtime cannot safely continue without operator/model review.
- `failed`
  - unrecoverable under policy, authority, or budget.

Implementation nodes remain non-executable while their required context
handoff is missing, rejected, or accepted only with blocking limitations.

## Work Queue Readback

Owner-facing readback must include:

- active context scout node id.
- target node ids.
- target commitment ids.
- model task class.
- selected model/provider.
- node budget.
- provider-call timeout.
- input byte count.
- byte budget.
- preflight status.
- requested context questions.
- included packet refs.
- requested prompt excerpt refs.
- requested repo context refs.
- emitted handoff packet ref.
- limitations and blocker classification.
- downstream consumer.
- next transition.
- ELI5 summary.

Readback should make the latest failure obvious without raw logs:

> Context scout could not start because its compiled packet was 42 KB, above
> the 32 KB policy. Runtime must rebuild a smaller packet or split the scout.

After this fix, that failure should not happen during normal Product/Spec
proof because packet compilation enforces policy before provider preflight.

## Validation Plan

Add focused tests covering:

1. `ContextScoutExecutionPacket` compiler includes target packet refs,
   context questions, source prompt index refs, repo refs, budgets, and raw
   storage flags.
2. compiler rejects arbitrary truncation and emits a precise blocker when
   it cannot fit inside policy.
3. role model call timeout derives provider timeout from model task policy,
   not from node total budget.
4. context scout provider preflight receives a policy-valid timeout.
5. context scout provider preflight receives input within policy for the
   Product/Spec failed checkpoint.
6. context scout can request bounded prompt excerpts instead of receiving the
   full prompt.
7. context scout can request repo context refs.
8. context scout handoff packet validates refs and limitations.
9. `requestContextIntent` compiles into runtime-owned context prerequisite
   nodes and edges.
10. request-context repair rejects model-authored `newNodes`, `nodeId`,
    `executorKey`, and `workerRef`.
11. repair diagnostics for request-context missing fields point to
    `requestContextIntent.*`, not `newNodes.*`.
12. duplicate context repair nodes are deduped or blocked with precise
    diagnostics.
13. Work Queue readback surfaces preflight bytes, provider timeout, active
    node, target nodes, and next transition.
14. boundary replay from `native-exec-06e162ea7066ac2e` reaches provider call
    start or a precise semantic context blocker; it must not die at adapter
    preflight or runtime-envelope repair choke.

## Boundary Replay Requirement

Add a replay lane from the latest Product/Spec checkpoint:

- input: accepted Mission Ledger, Commitment Work Packets, accepted graph, and
  context-supply frontier from `native-exec-06e162ea7066ac2e`.
- run only context-supply packet compilation, context scout preflight/provider
  start, handoff emission, and request-context repair as needed.
- do not rerun router, Mission Ledger, packet authoring, or scheduler graph
  selection.
- pass only if:
  - context scout execution packets compile under policy,
  - provider timeout is policy-valid,
  - context scout handoffs or precise semantic blockers are emitted,
  - request-context repair compiles runtime-owned prerequisite nodes and
    edges without model-authored runtime envelopes,
  - Work Queue/readback includes the active context-supply state.

After this replay passes, rerun the full Product/Spec proof.

## Code Touchpoints

Expected implementation areas:

- `extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts`
  - replace monolithic context scout role prompt assembly with packet refs
    and context-scout execution packet compilation.
  - pass provider-call timeout derived from model task policy.
- `extensions/execution-platform/src/codex-bridge/live-agent-team-runner.ts`
  - preserve structured-adapter preflight diagnostics and enforce policy
    against provider-call timeout, not node lifecycle timeout.
- `extensions/execution-platform/src/codex-bridge/context-scout-node-executor.ts`
  - consume `ContextScoutExecutionPacket` and context-scout tools.
- `extensions/execution-platform/src/model-tasks/model-task-classification.ts`
  - ensure context scout policy has explicit byte and timeout budget.
- `extensions/execution-platform/src/model-tasks/structured-tool-schema-adapter.ts`
  - keep preflight strict; add tests proving it blocks bad call shapes.
- `extensions/execution-platform/src/workflows/orchestrator-graph-decision.ts`
  - add `requestContextIntent` and a runtime compiler path.
  - make repair diagnostics contract-aware.
- `extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts`
  - register context scout execution packet and request-context compiler
    runtime tools.
- `extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts`
  - invoke context packet compilation before role invocation.
  - block target nodes until context handoff readiness is accepted.
- `extensions/execution-platform/src/work-queue/execution-read-model.ts`
  - surface context-scout packet/preflight/repair state.
- `scripts/execution-platform-run-product-spec-boundary-replay.mjs`
  - add the context-supply boundary replay.

## Acceptance Criteria

This queue item is complete only when:

1. no production context scout role call can be built from a monolithic prompt
   dump.
2. context scout provider calls pass structured-adapter preflight with input
   bytes and provider timeout inside policy.
3. context scout can request additional bounded prompt/repo context through
   tool operations rather than receiving all possible context up front.
4. context handoff packets are canonical artifacts with bounded refs,
   limitation classification, and target node mappings.
5. implementation nodes stay non-executable when context is missing or
   blocking-limited.
6. request-context repair is semantic-only from the model and runtime-compiled
   into graph nodes/edges.
7. repair diagnostics do not ask the model for forbidden runtime envelope
   fields.
8. owner readback shows context packet, preflight, provider, handoff, blocker,
   and next-transition state.
9. focused tests and boundary replay pass.
10. docs, decisions, status, spec index, and DB Work Queue are updated.

## Work Queue Item

ID:
`openclaw-convergence.context-scout-execution-packet-request-context-repair`

Title:
Context Scout Execution Packet And Request-Context Repair Compiler

Priority:
P0, before `openclaw-convergence.active-queue-34`.

Depends on:

- `openclaw-convergence.runtime-node-readiness-transition-engine`
- `openclaw-convergence.structured-tool-schema-adapter-hardening`
- `openclaw-convergence.scheduler-readiness-state-unification`

Blocks:

- `openclaw-convergence.active-queue-34`

Description:

Replace monolithic context-scout role prompt assembly with a bounded
runtime-compiled `ContextScoutExecutionPacket`, derive provider-call timeouts
from model-task policy instead of node lifecycle budget, and replace
request-context graph repair with a semantic intent contract compiled into
runtime-owned context prerequisite nodes and edges.

Success gate:

Replay the failed Product/Spec context-supply boundary from
`native-exec-06e162ea7066ac2e`. Pass only if context scout execution packets
compile under policy, provider calls can start, context blockers or handoffs
are visible in readback, and request-context repair compiles without
model-authored runtime envelope fields.

## Implementation Notes 2026-05-21

Implemented in code:

- Added `ContextScoutExecutionPacket` as a workflow-owned packet contract in
  `extensions/execution-platform/src/workflows/context-scout-execution-packet.ts`.
- Context-scout packet compilation now derives provider timeout from
  `local_semantic_extraction` model-task policy, with current hard bound of
  90 seconds, instead of passing the 15-minute node lifecycle budget to the
  provider.
- The standalone context-scout executor now attaches the execution packet
  artifact, records `context_scout.build_execution_packet`,
  `context_scout.request_repo_context`, and
  `context_scout.classify_context_blocker` tool evidence, and uses the packet
  prompt for primary and repair model turns.
- The production dynamic runner now hard-disables the old context-scout
  `rolePrompt` path and uses `ContextScoutExecutionPacket` for context-scout
  provider calls. If the packet cannot compile under policy, the node returns
  `needs_review` with a precise packet blocker instead of calling the model.
- Request-context graph repair now accepts model-authored semantic
  `requestContextIntent` and compiles runtime-owned context-scout nodes,
  `context_supplies` edges, executor keys, worker refs, capability ids, and
  raw-storage flags.
- Request-context repair rejects model-authored `newNodes`/runtime-envelope
  fields instead of asking the model to repair `newNodes[0].nodeId`.
- Work Queue active graph readback now surfaces context-scout execution packet
  refs, packet byte counts, policy byte budget, provider timeout, compile
  status, and compile reason codes.

Validation completed:

- `pnpm test:file extensions/execution-platform/src/workflows/context-scout-execution-packet.test.ts extensions/execution-platform/src/workflows/orchestrator-graph-decision.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts extensions/execution-platform/src/codex-bridge/context-scout-node-executor.test.ts`
- `pnpm tsgo:fast`

Replay caveat:

- Attempted focused context-scout boundary replay tests hung in the existing
  replay harness after more than four minutes and were terminated. That is not
  counted as a successful boundary replay. The next proof step should either
  run the Product/Spec boundary replay harness with persisted checkpoint
  artifacts and wall-clock tracing, or first isolate the existing
  context-scout boundary replay harness hang so it cannot obscure packet
  compiler success/failure.
