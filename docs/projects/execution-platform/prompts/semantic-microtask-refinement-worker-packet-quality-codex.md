# Semantic Microtask Refinement And Worker Packet Quality - Codex Execution Prompt

Run this with Codex against the OpenClaw repo. Do not run it through
OpenClaw/OpenClaw UX. This is a pre-proof platform hardening item.

## Objective

Implement the maximal production version of
`openclaw-convergence.semantic-microtask-refinement-worker-packet-quality`
from
`docs/projects/execution-platform/specs/semantic-microtask-refinement-and-worker-packet-quality.md`.

The goal is to close the worker-boundary gap exposed by the Product/Spec
after-resource replay smoke: payload-backed worker invocation exists, but
the runtime can still feed broad work-intent/file chunks to a non-Codex
worker. A work-intent node is not an implementation task. Repo scope is not
target scope. Runtime must not invent semantic edit intent.

## Required Architecture

Implement this from first principles, without Product/Spec shortcuts:

1. Model owns semantic microtask decomposition and file/symbol change intent.
2. Runtime owns canonical ids, refs, snapshots, schema compilation, storage,
   authority, lifecycle, replay, readiness, and worker invocation gates.
3. `repoScopeRefs`, directory refs, and approved repo areas are discovery or
   authority scope only. They must not be treated as executable target refs.
4. Existing-file implementation packets require target snapshots and
   model-authored file-change intent whenever the task spans multiple files
   or multiple commitments.
5. New-file implementation packets may proceed only through explicit
   `newFileIntents` and parent-directory snapshots.
6. Context handoff limitations remain blocking unless a consumer-specific
   waiver exists.
7. Boundary replay worker smoke must rollback edits by default and persist
   only reviewed/accepted edits under an explicit operator flag.

## Implementation Requirements

- Extend `ImplementationTaskPacket` with `fileChangeIntents`.
- Include file-change intent refs in coding resource packets and worker
  prompts.
- Preserve context scout `recommendedEditPoints`, limitations, and
  handoff summaries through production context handoff artifacts and replay
  reconstruction.
- Feed recommended edit points into implementation context/resource
  compilation as model-authored file-change intents.
- Update the post-context implementation task compiler so broad directory or
  multi-file work blocks as context/microtask repair unless concrete
  file-change intent covers the executable target refs.
- Keep new-file intent support first-class: do not require existing-file
  snapshots for explicit new-file targets, but do require parent snapshots
  and validation/readiness evidence.
- Make boundary replay stop using repo scope as executable target scope.
- Make boundary replay block before worker invocation when old checkpoints do
  not contain enough semantic handoff substance.
- Keep all payloads bounded and manifest-safe. Do not store raw prompts, raw
  provider responses, raw file bodies, raw command logs, or raw DB rows in
  metadata.

## Validation

Run focused tests:

```bash
pnpm test:file extensions/execution-platform/src/workflows/implementation-context-snapshot-compiler.test.ts extensions/execution-platform/src/workflows/node-resource-materialization.test.ts extensions/execution-platform/src/workflows/mission-work-packets.test.ts extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.test.ts
pnpm test:file extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.test.ts extensions/execution-platform/src/workflows/context-broker.test.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts
pnpm tsgo:fast extensions/execution-platform/src/workflows/mission-work-packets.ts extensions/execution-platform/src/workflows/node-resource-materialization.ts extensions/execution-platform/src/workflows/post-context-implementation-task-compiler.ts extensions/execution-platform/src/workflows/implementation-context-snapshot-compiler.ts extensions/execution-platform/src/workflows/context-broker.test.ts extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts
node --check scripts/execution-platform-run-product-spec-boundary-replay.mjs
```

Then run the latest Product/Spec boundary replay from before resource
materialization. Pass only if it either:

- compiles Grade A worker-ready packets with file-change intent, target
  snapshots, validation refs, and context refs; or
- blocks before worker invocation with exact missing microtask/context fields.

Do not count worker invocation as proof if the packet is broad, directory-only,
or file-chunked without semantic edit intent.

## Deep Completion Question

After implementation and validation, do a code review, not a memory-based
answer, and ask:

Did we maximally implement Semantic Microtask Refinement And Worker Packet
Quality as a production runtime boundary? Are worker packets now first-class,
payload-backed, model-intent-bearing, replayable, readback-visible, and
blocked from false execution when context/microtask substance is missing? Are
there any fallback, compatibility, Product/Spec-specific, regex/semantic
forest, or arbitrary file-chunking paths that can still invoke production
workers with poor packets? Is there any additional hardening, optimization,
extension, or refactor needed before Product/Spec proof replay?

If the answer is not an unqualified yes, patch the missing layer, rerun
focused validation, update docs/artifacts/Work Queue, and ask the question
again.
