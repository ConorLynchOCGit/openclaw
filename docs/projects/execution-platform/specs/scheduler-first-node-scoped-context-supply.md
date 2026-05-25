# Scheduler-First Node-Scoped Context Supply

Status on 2026-05-20: accepted architecture direction. This spec supersedes
the mandatory Product/Spec proof path that ran one context scout per high-level
commitment before scheduler graph creation.

2026-05-24 implementation update: node-scoped context supply now runs through
the production context broker and canonical readiness state. WorkIntent nodes
with `context_handoff` requirements block at `node_scoped_context_supply`
until consumer-scoped context exists; context scout prerequisites carry a
broker request ref, target node id, semantic question, candidate resource
refs, and `context_supplies` edge; and accepted-with-limitations context is
blocking unless the consumer node has an explicit limitation waiver ref.

## Problem

The previous complex-work funnel was:

1. Mission Ledger.
2. Commitment Work Packets.
3. context scout per commitment.
4. global context synthesis.
5. scheduler graph.
6. implementation.

That path front-loads context discovery before the runtime knows the actual
work units. A Mission Ledger commitment is often a broad outcome, not an
executable unit of work. Scouting broad commitments produces useful discovery
but often misses the exact target refs, snapshots, validation commands, and
handoff detail needed by an implementation worker. The result is a recurring
`accepted_with_limitations` context state followed by implementation-readiness
blocks.

## Canonical Flow

The canonical complex-work flow is now:

1. Mission Ledger.
2. Commitment Work Packets.
3. scheduler creates a draft work-intent graph from packets.
4. runtime evaluates the first executable frontier.
5. ready nodes run immediately subject to locks and budgets.
6. nodes missing context/resources ask the runtime context broker for the
   exact missing material.
7. context scouts run per consumer request in parallel only when inherited or
   cached context is insufficient.
8. implementation-readiness gate evaluates each node.
9. unready nodes receive context repair, resource materialization, split/ask,
   or needs-review decisions.
10. cross-node synthesis runs only when coordination requires it.

The scheduler determines the work units first. Context scout then gathers
context for those work units. This keeps semantic decomposition in the model
and executable schema, refs, authority, budgets, storage, and lifecycle in the
runtime.

## Work-Intent Graph

A work-intent graph is a runtime graph of intended work units. It is not yet a
promise that every implementation node is executable.

The canonical WorkIntent contract is defined in
`work-intent-control-plane-contract.md`. This spec governs context supply for
those WorkIntent consumers.

Each `WorkIntentNode` carries:

- runtime-generated node id.
- workflow id and graph id.
- model-authored work-unit title.
- mapped Mission Ledger commitment ids.
- source CommitmentWorkPacket refs.
- worker-facing objective.
- bounded task scope.
- expected human-readable output.
- acceptance criteria.
- downstream consumer.
- context questions.
- likely repo areas when known.
- validation needs.
- capability-selection intent.
- cost/quality rationale.
- dependency or parallelism rationale.
- stop-if-missing rules.
- runtime-derived evidence expectations.

The model authors intent and rationale. Runtime compiles node ids, node kinds,
executor keys, worker refs, expected evidence classes, storage flags, graph
edges, authority flags, budgets, retry policy, and Work Queue child refs.

## Node-Scoped Context Supply

Context supply is node-scoped for implementation-bearing nodes.

Each context-scout request receives:

- the draft work node contract.
- mapped CommitmentWorkPacket refs and bounded packet summaries.
- relevant original prompt refs or bounded excerpts.
- likely repo areas.
- exact context questions.
- downstream implementation requirements.
- stop-if-missing rules.

Context scout output must include:

- supplied node id.
- commitment ids.
- verified target refs.
- resolved workspace/repo-root status.
- readable snapshots or bounded excerpts for existing files.
- existing APIs, types, functions, and tests relevant to the node.
- recommended edit points.
- validation refs or validation discovery instructions.
- risks, blockers, and limitations.
- downstream implementation handoff.
- evidence claims.

Clean acceptance requires implementation-critical target refs and snapshots
when the downstream node is an implementation node. Useful partial context can
be `accepted_with_limitations`, but it must block only affected downstream
implementation nodes and be visible in Work Queue readback.

The runtime may inherit or reuse accepted context by ref, but inheritance is
structural only. The model or human must still own semantic sufficiency. If
the inherited context is marked `accepted_with_limitations`, the consumer node
must carry an explicit waiver ref before implementation or other
side-effecting execution can unlock.

## Optional Synthesis

Global synthesis is not mandatory before scheduling.

Runtime may trigger synthesis when:

- multiple nodes target the same file or symbol.
- scout outputs conflict.
- dependency ordering is ambiguous.
- an integration sequence spans nodes.
- shared API/schema decisions are required.
- validation plans collide.
- evidence closure depends on multiple nodes.

Synthesis should run on bounded scout summaries and node contracts. It should
normally be scoped to the conflict or coordination group, not the whole
mission. Runtime first performs deterministic ref merge/dedupe; the model
judges semantic coordination and integration strategy.

If no cross-node coordination is required, ready nodes move directly to
execution selection.

For the coding-team Product/Spec proof path, synthesis is not default glue and
must not compile groups directly into implementation nodes. It is allowed only
when a WorkflowDefinition, accepted structure review, or model-authored
coordination rationale explicitly requires it for conflicting refs,
overlapping ownership, shared API/schema decisions, integration ordering,
validation-plan conflict, or evidence dependency.

## Implementation Readiness Gate

Implementation nodes cannot invoke model/provider workers until they pass
readiness.

Required fields:

- commitment ids.
- worker-facing objective.
- target refs resolved against repo/workspace root.
- existing file snapshots or explicit new-file intent.
- context handoff summary.
- validation refs or validation discovery plan.
- evidence claim expectations.
- authority and scope bounds.
- downstream consumer.

If readiness fails, classify it as upstream context failure rather than worker
failure. The next scheduler action must be context repair, node split,
human decision, or needs-review. Runtime compiles repair nodes; the model
provides only semantic missing-context intent.

## Post-Context Implementation Task Compiler

The scheduler-first flow deliberately separates a high-level work-intent graph
from an executable implementation graph. A draft work node is not the same
thing as a worker-ready implementation node.

After node-scoped context scout, runtime must compile one or more
`ImplementationTaskPacket`s for each implementation-bearing draft work node.
Those packets carry concrete target file refs, file snapshots or explicit
new-file intents, allowed edit scope, validation refs, expected patch shape,
and evidence-claim expectations. Only accepted implementation task packets can
materialize executable implementation nodes.

This prevents a broad work group such as "implement Product/Spec workflow
definition readiness" from being sent directly to Kimi or another
non-Codex file-edit worker with only directory refs. Directory-level refs seed
context discovery; they do not satisfy implementation readiness.

See
`post-context-implementation-task-compiler.md` for the detailed packet,
split, graph-mutation, readback, and proof-harness requirements.

## Parallelism

Node-scoped context scouts should run in parallel subject to workflow,
provider, model, and global runtime budgets. Scheduler execution may run
ready implementation nodes in parallel when file ownership, dependency, and
validation scopes do not collide.

Context scout fanout is demand-driven. Runtime should not spawn a context
scout for every commitment or every work node when no downstream consumer is
blocked on that context. Split children inherit accepted parent context by ref
and request additional context only for specific readiness gaps.

The owner-facing readback must expose active scouts, node readiness, blockers,
selected model/worker, token/cost where available, and the next scheduler
decision.

## Replay Requirements

The Product/Spec proof harness must support checkpoints after:

- Mission Ledger.
- Commitment Work Packets.
- draft work graph.
- node-scoped context scouts.
- optional synthesis.
- readiness evaluation.
- implementation.
- validation.
- closeout.

The main pre-implementation replay lane should start from accepted
CommitmentWorkPackets, compile the draft work graph, run node-scoped context
scouts, evaluate readiness, and stop before implementation unless the caller
explicitly asks to continue.

Boundary replay must use the same scheduler-first topology as production. A
replay that starts from accepted context supply may import accepted context
handoff nodes as evidence, but it must not manufacture a
`context_synthesis` barrier as default glue. The next graph decision still
belongs to the scheduler/compiler: draft work units, capability selection,
context prerequisites, resource materialization, and worker frontier selection.

The legacy `after-context-synthesis` boundary is diagnostic-only. It may be
used to inspect old checkpoints that already contain an explicit synthesis
node, but it is not a valid Product/Spec proof path and must require an
explicit diagnostic flag. New replay graphs from packet/context boundaries
must not contain `context_synthesis` unless a WorkflowDefinition, accepted
structure-review decision, or model-authored coordination rationale explicitly
requires synthesis for overlapping file ownership, conflicting scout outputs,
shared schema/API decisions, integration ordering, validation-plan conflict,
or evidence dependency.

## Retired Path

The old mandatory path:

`commitment packets -> context scout per commitment -> global synthesis -> scheduler graph`

is not a production default. It may exist only as a labeled diagnostic fixture
or workflow-definition-specific exception for workflows that require broad
discovery before work-unit decomposition.
