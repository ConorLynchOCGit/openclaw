# Demand-Driven Context Broker And Lazy Readiness

Execute this queue item in the local Codex session, not through OpenClaw proof submission.

## Queue Item

`openclaw-convergence.demand-driven-context-broker-lazy-readiness`

## Source Specs

- `docs/projects/execution-platform/specs/demand-driven-frontier-orchestration-and-context-broker.md`
- `docs/projects/execution-platform/specs/runtime-work-graph.md`
- `docs/projects/execution-platform/specs/generic-orchestration-runtime.md`
- `docs/projects/execution-platform/specs/scheduler-first-node-scoped-context-supply.md`
- `docs/projects/execution-platform/specs/runtime-artifact-contract-registry-and-payload-boundary.md`
- `docs/projects/execution-platform/specs/operator-frontier-readback-and-latest-run-state.md`

## Objective

Implement the demand-driven context broker and lazy readiness layer as a first-class, production runtime feature. This is not a Product/Spec-specific patch. The runtime must be able to turn a blocked `NodeReadinessState` into a branch-scoped context request artifact, satisfy that request from inherited context when possible, or route it to context-scout repair when necessary.

The key architectural rule is:

> Model-authored workers decide semantic context needs and sufficiency. Runtime owns refs, payload storage, dedupe keys, lifecycle, readiness status, and Work Queue/readback projection.

## Required Implementation

1. Add a canonical context broker module.
   - Define `ContextBrokerRequest` as a strict schema with bounded fields.
   - Include runtime job, workflow, graph, requesting node, consumer node, commitments, required resource kind, semantic question, candidate refs, inherited context refs, known context refs, blocking semantics, budget/deadline, dedupe key, status, reason codes, and raw-storage false flags.
   - Provide builders for request refs, dedupe keys, summaries, and request construction from `NodeReadinessState` plus optional resource/node packets.
   - Preserve semantic text that came from upstream model-authored packets/readiness blockers, but do not let deterministic code invent substantive implementation meaning.

2. Register context broker artifacts in the runtime artifact contract registry.
   - Add payload-required contract `execution_platform.context_broker.request`.
   - Add body-key guard coverage so broker request bodies cannot be stored inside scheduler progress metadata.
   - Keep scheduler progress metadata manifest-only.

3. Register context broker runtime tools.
   - Add first-class scheduler runtime tool ids:
     - `context_broker.submit_request`
     - `context_broker.resolve_inherited_context`
     - `context_broker.dispatch_context_scout`
     - `context_broker.mark_consumer_ready`
   - Use bounded runtime-write/read-only authority as appropriate.
   - Ensure definitions expose schema refs and raw storage flags are false.

4. Wire broker requests into node readiness/resource materialization.
   - When a node materialization produces `repairAction: "request_context_repair"`, attach a payload-backed `execution_platform.context_broker.request` artifact.
   - Update node metadata and scheduler progress with request refs, broker status, dedupe key, reason codes, and target consumer node ids.
   - Do not unlock implementation from `accepted_with_limitations` context unless readiness state already proves it is nonblocking for that consumer.
   - Do not spawn global context fanout from this path. Broker requests must be branch-local.

5. Surface broker state in readback.
   - Work Queue/readback must show context broker state, latest request refs, request status counts, requesting/consumer node ids, blocking reason codes, and next transition.
   - Latest run/progress should include compact broker refs and summaries without scanning large payloads.

6. Add focused tests.
   - Broker builder: inherited accepted context can satisfy a request; missing/blocking context produces a context-scout-required request.
   - Dedupe: identical branch/local needs produce stable keys; different consumer/commitment/question changes the key.
   - Contract: broker request is payload-required and is rejected if embedded in scheduler progress metadata.
   - Runtime tools: broker tools are registered with correct authority/schema/storage flags.
   - Dynamic runner/readback: blocked readiness progress surfaces broker request refs and readback projection.

7. Update docs and queue status.
   - Mark this queue item complete only after code review and validation pass.
   - Update `STATUS.md`, `CURRENT_SLICE.md`, and roadmap/work queue docs to point to the next active item.
   - Record a bounded closeout artifact and update the DB Work Queue lifecycle only with evidence.

## Constraints

- No Product/Spec-only shortcuts.
- No regex or semantic-forest classification.
- No arbitrary truncation of meaningful model context.
- No raw prompt, raw response, raw provider log, raw tool log, raw command log, raw DB rows, or secrets storage.
- No broad compatibility fallback or legacy path.
- No raising artifact metadata limits.
- No implementation worker may edit until canonical readiness is executable.

## Validation

Run focused tests and scoped type validation at minimum:

- `pnpm test:file` for the new broker tests, artifact-contract tests, scheduler-runtime-tools tests, dynamic runner/readback tests touched by the patch.
- `pnpm tsgo:fast --` for changed TS files.

If full repo validation is blocked by pre-existing unrelated worktree/tooling failures, record the exact blocker and prove focused validation passed.

## Deep Completion Question

After implementation and validation, do a code-review pass before answering:

> Did we maximally execute and implement Demand-Driven Context Broker And Lazy Readiness? Is it canonical, payload-backed, generic across workflows, fully wired into production scheduler readiness/progress/readback, enforced against false implementation readiness, and visible in owner-facing readback? Is there any way to improve, harden, optimize, sharpen, extend, or otherwise make it stronger before moving to Expansion Controller And Dynamic Fanout Admission? Are there any compatibility/fallback/dead-code paths that could still unlock implementation without broker/readiness evaluation or hide broker state from readback? Is anything proof-shaped instead of live-wired?

If the answer is not an unqualified yes, implement the missing hardening, rerun validation, update docs/artifacts/Work Queue, and repeat the question.
