# Resource Materialization Boundary Replay And Canonical Node Readiness Prompt

Use this prompt for the next OpenClaw/Codex implementation pass.

```text
Implement Resource Materialization Boundary Replay And Canonical Node Readiness as a maximal production runtime pass.

This is not a generic hardening pass and not a Product/Spec-specific shortcut. It is the current pre-Product/Spec blocker in the Execution Platform runtime spine.

Read and honor these specs first:

- docs/projects/execution-platform/specs/resource-materialization-boundary-replay-and-canonical-node-readiness.md
- docs/projects/execution-platform/specs/runtime-artifact-payload-store-and-bounded-manifests.md
- docs/projects/execution-platform/specs/runtime-node-readiness-transition-engine.md
- docs/projects/execution-platform/specs/parallel-frontier-resource-boundary-hardening.md
- docs/projects/execution-platform/specs/product-spec-checkpointed-proof-framework.md
- docs/projects/execution-platform/specs/model-task-classification-and-resource-materialization.md
- docs/projects/execution-platform/specs/generic-orchestration-runtime.md

Failure evidence to anchor the pass:

- runtime job: native-exec-78e1b33861780884
- graph id: team-run-native-exec-78e1b33861780884-runtime-work-graph
- failed implementation nodes:
  - g-faee9af635-implementation-wu-002-plugin-runtime-wiring
  - g-faee9af635-implementation-wu-003-planning-artifacts-compile-readiness
  - g-faee9af635-implementation-wu-004-readback-projection
- graph reached 9 nodes, 11 edges, and 3 role invocations.
- context scout and context-repair scout handoffs were accepted.
- implementation workers did not receive executable input.
- post-payload-store replay from after-graph-selection returned needs_review with accepted_context_synthesis_or_node_scoped_context_required_before_after_graph_selection_replay.

2026-05-24 update: the reason code above is historical failure evidence.
Current replay semantics must not treat accepted context synthesis as a
production-success substitute for node-scoped context. `after-graph-selection`
requires node-scoped context supply; `after-context-synthesis` is
diagnostic-only.

Core objective:

Create a production resource-materialization replay boundary that can restart the Product/Spec proof exactly where it failed, compile implementation-resource packets into payload-backed artifacts, expose one canonical NodeReadinessState across scheduler/replay/readback/proof/worker guards, and only then allow implementation workers to execute.

Non-negotiable constraints:

- Do not raise artifact metadata limits.
- Do not truncate packet bodies to make metadata pass.
- Do not store full packet bodies in graph node metadata.
- Do not store raw prompts, raw model responses, raw provider logs, raw tool logs, raw command logs, raw DB rows, secrets, or hidden reasoning.
- Do not rerun Mission Ledger, Commitment Work Packets, graph selection, or context scout for a resource-materialization replay unless the upstream checkpoint is missing and cannot be normalized.
- Do not make Product/Spec-specific shortcuts. The result must be a generic orchestration runtime boundary usable by coding, planning, research, docs, QA, architecture, design, marketing, memory, proactivity, human-task, validation, and closeout workflows.
- Do not leave compatibility/fallback paths that can bypass canonical readiness.

Required implementation:

1. Add replay boundaries.

Implement first-class before_resource_materialization and after_resource_materialization boundaries in the Product/Spec boundary replay harness and production runtime replay/readback plumbing.

before_resource_materialization must load the accepted graph frontier, accepted context evidence, and target implementation/resource-bearing nodes, then run only resource materialization and readiness evaluation.

after_resource_materialization must load and hydrate NodeExecutionPacket/domain resource packet manifests, verify payload refs/hashes, verify NodeReadinessState, and proceed only to executable nodes.

Both boundaries must emit bounded artifacts and latest-run-state summaries.

2. Make NodeReadinessState canonical.

Create or complete a single NodeReadinessState contract consumed by:

- RuntimeWorkGraphScheduler/frontier selection.
- resource materialization.
- boundary replay harness.
- Work Queue readback.
- proof gates.
- worker invocation guards.
- closeout/finalization readiness where relevant.

It must distinguish work_intent, context_required, context_in_progress, context_ready, resource_materialization_required, resource_materialization_in_progress, resources_ready, executable, running, completed, needs_repair, needs_review, failed, and canceled.

It must carry dependency status, context status, context limitation status, resource status, payload refs, manifest refs, node execution packet refs, domain resource packet refs, validation refs, commitment ids, evidence refs, blockers, reason codes, next legal transitions, and replay boundary.

Remove or hard-disable production code that computes independent readiness truth from graph metadata, context freshness, or ad hoc proof gate checks.

3. Enforce manifest-only graph metadata.

Add a production graph metadata sanitizer/validator that rejects bodies and nested oversized data before graph node writes or updates.

Allowed metadata: ids, refs, hashes, byte counts, counts, bounded summaries, readiness status, reason codes, Work Queue child refs, raw-storage flags.

Forbidden metadata: full file snapshots, full target-ref arrays when large, full ImplementationTaskPackets, full ImplementationContextPackets, full context packets, synthesis bodies, split-task arrays with nested bodies, raw prompts/responses/logs/DB rows/secrets/hidden reasoning.

Violations must return structured readiness evidence such as metadata_manifest_violation, not worker_adapter_threw or unclassified failure.

4. Add checkpoint version normalizers.

Implement normalizers for existing checkpoint artifacts:

- context scout handoff.
- context repair handoff.
- node-scoped context state.
- implementation context packet manifests.
- implementation task packet manifests.
- coding resource packet manifests.
- node execution packet manifests.
- legacy graph node metadata that points at bodies.

Normalize only when safe: ids match, refs resolve, payloads can be migrated to payload storage, hashes and byte counts can be computed, raw-storage flags are safe, and authority boundaries are preserved.

If not safe, emit exact missing refs/paths/blockers and stop at needs_review without rerunning upstream phases.

5. Latest-run-state and Work Queue readback.

Write compact latest-run-state at every replay boundary and terminal event. Include runtime job id, graph id, current phase, replay boundary, active node ids, role/model/provider, active tool event kind, wall time by phase, token usage by phase/model when available, labeled estimates when actual usage is unavailable, payload refs, manifest refs, readiness status, blockers, next legal transition, and proof gate status.

Work Queue readback must surface the same boundary state without hydrating large payload bodies.

6. Resource-materialization lane proof.

Add a focused lane proof using runtime job native-exec-78e1b33861780884 and graph team-run-native-exec-78e1b33861780884-runtime-work-graph if available. If live DB state is unavailable, use bounded fixtures generated from that run.

Pass only if:

- replay starts at before_resource_materialization.
- no upstream phase reruns.
- implementation-bearing nodes receive canonical NodeReadinessState.
- resource packets are stored as payload bodies with bounded manifests.
- after_resource_materialization hydrates them.
- executable nodes are separated from blocked nodes.
- missing context for any node is represented as exact readiness blocker.
- graph node metadata stays within bounded manifest policy.
- no worker invokes before resources are ready.
- latest-run-state and Work Queue readback show the same result.

7. Validation.

Add focused tests for:

- before_resource_materialization does not rerun upstream phases.
- after_resource_materialization hydrates payload-backed packets.
- NodeReadinessState is used by scheduler, replay, readback, proof gates, and worker guards.
- graph metadata rejects body storage and accepts bounded manifests.
- checkpoint normalizers convert valid old artifacts and reject invalid ones with exact missing refs.
- resource materialization failures safe-return readiness evidence.
- implementation nodes with missing snapshots do not invoke workers.
- Work Queue readback and latest-run-state match.

Run focused tests and scoped type validation. Do not skip failing tests. If full repo validation hits unrelated known heap/tooling limits, record that separately and prove the changed files through the strongest scoped lane available.

8. Documentation and queue state.

Update the relevant docs, status, decisions, roadmap, and prompt/readback docs with the implemented architecture and proof evidence. Preserve the Product/Spec proof as the next full proof only after this boundary replay passes.

Deep completion question:

After the implementation, do a code review across the scheduler, replay harness, graph repository, resource materialization, Work Queue readback, worker guard, and docs. Then answer:

Did we maximally implement Resource Materialization Boundary Replay And Canonical Node Readiness as a production runtime boundary, with replayable before_resource_materialization and after_resource_materialization checkpoints, one canonical NodeReadinessState, manifest-only graph metadata, checkpoint normalizers, latest-run-state boundary writes, Work Queue readback, focused tests, and a lane proof against the failed Product/Spec graph? Are there any fallback, compatibility, proof-only, body-in-metadata, stale-readiness, worker-bypass, or Product/Spec-specific shortcuts left that could make implementation execute without canonical resource readiness or hide the true blocker from operators?

If the answer is not an unqualified yes, patch the missing production layer, rerun focused validation, update docs/artifacts/readback, and ask the question again. Do not stop at partial, future work, or needs_review unless an external owner-only credential/configuration is genuinely missing and every non-blocked code/test/doc/artifact update is complete.
```
