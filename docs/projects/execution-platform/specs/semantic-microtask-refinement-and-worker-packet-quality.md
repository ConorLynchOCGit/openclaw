# Semantic Microtask Refinement And Worker Packet Quality

Date: 2026-05-23

Status: pre-Product/Spec proof blocker created from the after-resource worker
smoke. This is a generic coding-team runtime boundary, not a Product/Spec
shortcut.

Work Queue item:
`openclaw-convergence.semantic-microtask-refinement-worker-packet-quality`.

## Failure Evidence

The latest boundary replay proved that the runtime could hydrate a
`NodeExecutionPacket` and invoke the non-Codex worker, but the first worker
smoke was not acceptable implementation evidence.

Observed behavior:

- replay boundary: `after-resource-materialization`
- source runtime job: `product-spec-replay-mpido4ii`
- selected node:
  `g-3acda2f0ac-implementation-wu-context-evidence-closeout:task:1`
- worker received target snapshots and made source edits in the first smoke;
- Codex review rejected the edits because they hard-coded Product/Spec-specific
  fields into generic Work Queue contracts;
- the follow-up smoke rolled workspace edits back by default, then failed on
  Kimi patch no-content plus Qwen repair JSON failure.

The bad edit was not only a model/provider issue. The task packet itself was
too broad:

- one packet spanned multiple commitments;
- target refs were a mechanical file chunk, not a semantic microtask;
- the objective asked for context supply, evidence claims, closeout gates, and
  Work Queue readback in one worker task;
- replay was treating `repoScopeRefs` as executable target refs instead of
  discovery/authority scope.

## First-Principles Diagnosis

A work-intent node is not an implementation task.

The runtime may compile a broad work-intent graph from Mission Ledger and
Commitment Work Packets, but it must not convert that graph into arbitrary
file chunks and call the result a worker-ready implementation packet. A
non-Codex file-edit worker needs a concrete semantic edit unit:

- target files;
- why each file matters;
- intended change per file or symbol;
- accepted context handoff refs;
- snapshots or explicit new-file intent;
- validation refs or discovery plan;
- commitment evidence expectations.

Runtime can validate that those fields exist, point at real refs, fit bounds,
and obey authority. Runtime cannot invent the semantic edit intent.

## Boundary Rule

Model owns:

- semantic microtask decomposition;
- file/symbol change intent;
- why a file should be edited or only inspected;
- whether a task is suitable for a non-Codex worker or requires Codex
  integration;
- whether context limitations are nonblocking for a named consumer.

Runtime owns:

- canonical ids;
- refs, hashes, storage, bounds, authority, lifecycle, and validation shape;
- packet schema compilation;
- replay checkpoints;
- readback projection;
- worker invocation gates.

## Required Runtime Behavior

### Repo Scope Is Not Target Scope

`repoScopeRefs`, approved repo areas, and directory refs are discovery or
authority scope. They may seed context search and allowed edit bounds. They
must not be treated as executable target refs.

Executable target refs must come from one of:

- model-authored graph node `targetRefs`;
- accepted context handoff `relevantFileRefs` plus model-authored
  `recommendedEditPoints`;
- a semantic microtask refinement artifact;
- explicit new-file intents with parent directory snapshots.

### Semantic Microtask Refinement

Before creating executable implementation nodes from broad post-context work,
runtime must require semantic file-change intent.

The canonical refinement body is:

- `refinementId`
- `runtimeJobId`
- `workflowId`
- `graphId`
- `sourceNodeId`
- `sourceWorkUnitId`
- `targetCommitmentIds`
- `sourceContextHandoffRefs`
- `sourceCommitmentPacketRefs`
- `microtasks[]`

Each microtask includes:

- `microtaskId`
- `title`
- `exactEditObjective`
- `targetCommitmentIds`
- `targetFileRefs`
- `fileChangeIntents[]`
- `expectedPatchShape`
- `validationRefs` or `validationDiscoveryPlan`
- `acceptanceCriteria`
- `evidenceClaimExpectations`
- `nonCodexSuitability`
- `codexEscalationCondition`
- `knownLimitations`

Each `fileChangeIntent` includes:

- `fileRef`
- `symbolOrRegion`
- `intendedChange`
- `whyThisFile`

Runtime may compile `fileChangeIntent` entries from existing model-authored
context-scout recommended edit points. If the handoff only supplies file refs
or directory candidates, runtime must request microtask refinement or context
repair instead of chunking files mechanically.

### Worker Packet Gate

`ImplementationTaskPacket` carries `fileChangeIntents`.

For multi-file or multi-commitment tasks, the packet is not worker-ready
unless every existing target file has a file-change intent, or an explicit
new-file intent covers the target. Missing intent coverage is a
context/refinement blocker, not a worker failure.

For broad directory-only context, the post-context compiler returns
`context_repair_required` unless model-authored file-change intents cover the
resulting concrete files.

### Accepted-With-Limitations Context

Context handoff limitations are blocking for implementation unless an explicit
consumer-specific waiver exists. Reconstructed context summaries must preserve
handoff limitations and recommended edit points. If old checkpoint artifacts
do not carry enough handoff substance to prove worker readiness, replay must
block at the context/resource boundary and emit the missing fields.

### Worker-Smoke Persistence

Boundary replay worker smoke rolls file edits back by default and records
changed-file refs for review. Persisting worker edits requires an explicit
operator flag after Codex review accepts them. A smoke that edits but fails
review is diagnostic evidence, not proof success.

## Success Gates

- Replay no longer treats `repoScopeRefs` as executable targets.
- Directory-only or broad target refs cannot produce worker-ready packets
  without model-authored file-change intents.
- Multi-file or multi-commitment `ImplementationTaskPacket`s expose
  `fileChangeIntents` in worker prompts and resource packets.
- Accepted-with-limitations context cannot unlock implementation without a
  consumer waiver.
- The latest failed Product/Spec graph either:
  - blocks before worker invocation with exact missing microtask/context
    fields, or
  - compiles a Grade A worker packet and runs a smoke whose edits pass Codex
    review before persistence.
- Work Queue/readback surfaces the blocker as packet/context quality, not as
  Kimi/Qwen failure when the worker input is not good enough.

## Proof Order

1. Focused unit tests for packet gate and directory/repo-scope handling.
2. `before-resource-materialization` replay against the latest failed graph.
3. `after-resource-materialization --execute-workers` smoke only when the
   packet is Grade A.
4. Full Product/Spec proof from the top after the replay boundary passes.
