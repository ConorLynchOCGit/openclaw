# Execution Prompt: Execution Intent, Evidence Mode, And Worker Dispatch

You are Codex working in the OpenClaw repository. Implement the
`openclaw-convergence.execution-intent-evidence-mode-worker-dispatch` Work
Queue item as a production runtime slice, not a proof-only patch.

Read these specs before editing:

- `docs/projects/execution-platform/specs/execution-intent-evidence-mode-and-worker-dispatch.md`
- `docs/projects/execution-platform/specs/demand-driven-frontier-orchestration-and-context-broker.md`
- `docs/projects/execution-platform/specs/post-context-implementation-task-compiler.md`
- `docs/projects/execution-platform/specs/resource-materialization-boundary-replay-and-canonical-node-readiness.md`
- `docs/projects/execution-platform/specs/non-codex-tool-worker-runtime.md`
- `docs/projects/execution-platform/CURRENT_SLICE.md`
- `docs/projects/execution-platform/STATUS.md`
- `docs/projects/execution-platform/DECISIONS.md`

Objective:

Implement explicit execution intent and runtime-compiled evidence mode across
staged graph compile, resource materialization, replay selection, worker
dispatch, readback, tests, docs, and Work Queue artifacts so read-only/source
grounding work can never be misrouted into changed-file worker lanes.

Core architecture:

- Model-authored field: `executionIntent`.
- Runtime-owned field: canonical `evidenceMode`, derived from selected
  capability plus execution intent and workflow/resource profile.
- Runtime validates structural compatibility between execution intent,
  capability, evidence mode, executor key, worker ref, authority, resource
  packet, and node readiness.
- Runtime must not infer intent from prompt prose, node ids, title words,
  regexes, commitment names, or Product/Spec-specific phrases.
- Runtime may normalize only general field-name/enum aliases such as
  `source-edit` to `source_edit`.
- Source-grounding/read-only evidence may close read-first commitments, but it
  is not changed-file evidence and cannot satisfy file-edit worker readiness.

Implementation requirements:

1. Add a canonical execution intent/evidence mode module.
   - Supported intents must include source grounding, context supply,
     resource materialization, source edit, validation, review, docs,
     readback, closeout, human decision, and an explicit `unspecified`
     invalid/default state.
   - Supported evidence modes must include read-only, changed-file,
     validation, review, context handoff, planning artifact, human decision,
     and closeout evidence.
   - Add structural normalization helpers for enum spelling only.
   - Add a compatibility helper that rejects intent/capability mismatches.

2. Wire staged scheduler compile.
   - The model-facing staged scheduler protocol must ask for
     `executionIntent` on work units/node contracts.
   - The model must not author `evidenceMode`, executor keys, node kinds,
     worker refs, or expected evidence enums.
   - The runtime compiler must derive evidence mode and canonical node
     envelopes.
   - Reject conflicts with field-specific diagnostics and repair reason codes.
   - Preserve rejected node diagnostics, including work unit id, selected
     capability id, execution intent, and compatibility reason.

3. Wire post-context implementation task compilation.
   - `ImplementationTaskPacket` must carry execution intent and evidence mode.
   - The post-context compiler must require explicit `source_edit` intent and
     `changed_file_evidence` before creating executable file-edit packets.
   - Missing intent, read-only intent, or missing changed-file evidence must
     return context/resource repair evidence, not a worker invocation.

4. Wire NodeExecutionPacket and NodeReadinessState.
   - Node execution packets and readiness states must carry execution intent
     and evidence mode.
   - Implementation readiness must block unless intent is `source_edit` and
     evidence mode contains `changed_file_evidence`.
   - Readiness repair action should point to evidence/intent repair when that
     is the exact blocker.

5. Wire production dynamic runner and replay harness.
   - Production graph runner must pass scheduler metadata intent/evidence into
     resource materialization.
   - Replay selection must select only edit-required nodes for executable
     worker smokes.
   - Read-only/source-grounding nodes must be proved by read-only evidence
     executors or reported as no ready edit-required node; they must not be
     silently coerced into file-edit tasks.

6. Update docs and Work Queue.
   - Update technical specs, decisions, status, roadmap, and prompt docs.
   - Add/rerank the Work Queue item before Product/Spec proof.
   - Product/Spec proof remains blocked until this item passes focused tests,
     type checks, and after-resource replay evidence.

7. Validation.
   - Add positive tests for source-edit implementation flow.
   - Add negative tests for source-grounding/read-only work selected with
     edit-capable implementation capability.
   - Add negative tests for implementation task packets and readiness states
     missing `source_edit` or `changed_file_evidence`.
   - Run focused tests for graph decision, work packets, resource
     materialization, implementation context compiler, context broker, and the
     replay path as applicable.
   - Run scoped TypeScript validation.
   - Run the Product/Spec after-resource boundary replay from the latest
     checkpoint and verify it no longer executes a source-grounding node as an
     edit worker.

Deep completion question:

After the implementation and validation are complete, do a code review across
the modified scheduler, resource materialization, worker-dispatch, replay,
readback, tests, docs, and Work Queue paths. Answer:

Did we maximally implement this queue item as canonical production runtime
behavior? Is execution intent model-authored, evidence mode runtime-owned, and
worker dispatch structurally gated everywhere it can matter? Can any
compatibility, fallback, proof-only, or stale path still route read-only work
to an edit worker or claim changed-file success without changed-file evidence?
Are diagnostics and replay evidence strong enough for the Product/Spec proof?

If the answer is not an unqualified yes, implement the missing hardening,
rerun focused validation, update docs/artifacts/Work Queue, and ask the deep
completion question again.
