# Runtime Artifact Payload Store And Bounded Manifests

Date: 2026-05-21

Status: implemented as the canonical runtime storage boundary for large
Execution Platform JSON artifacts. This is a generic storage/readback
boundary, not a Product/Spec-specific fix. The next Product/Spec proof should
replay the failed implementation-resource boundary before rerunning from the
top.

Work Queue item:
`openclaw-convergence.runtime-artifact-payload-store-bounded-manifests`.

## Failure Evidence

The checkpointed Product/Spec proof for runtime job
`native-exec-78e1b33861780884` reached the first real implementation
frontier and then failed before any implementation worker could make source
edits.

Observed evidence:

- prompt hash:
  `64c74c8c5ecee1ac51099bccb895f3fe4f225778614692015ec2b4450d364922`
- prompt length: `17694`
- final status: `needs_review`
- runtime job state: `failed`
- failure reason codes:
  - `worker_adapter_threw`
  - `worker_adapter_threw:artifact_metadata_limit`
- first open gate: `context_supply`
- graph state at failure: 9 nodes, 11 edges, 3 role invocations.
- graph included context scout, implementation, validation, reviewer, and
  closeout nodes.
- context scout and context-repair scout nodes produced accepted handoff
  evidence.
- implementation nodes never reached Kimi/Qwen/Codex file-edit execution.
- terminal artifacts:
  - `.artifacts/execution-platform/product-spec-checkpointed-test-summary-native-exec-78e1b33861780884-final.json`
  - `.artifacts/execution-platform/latest-run-state-native-exec-78e1b33861780884-final.json`

The failure was not a code-edit model failure. It was a runtime storage
boundary failure while materializing implementation resources.

## Immediate Code Smell

`DynamicAgentTeamGraphRunner` still writes large resource packets as runtime
artifact metadata:

- `execution_platform.implementation_context_packet`
- `execution_platform.implementation_resource_materialization_result`
- `execution_platform.implementation_task_packet`

The repository enforces bounded artifact metadata. That limit is correct.
The bug is that full payload bodies are being stored in metadata instead of a
payload/body store with bounded manifests.

This contradicts the existing architecture decisions:

- graph node metadata stores refs and compact summaries only.
- full packet bodies are runtime artifacts.
- worker execution hydrates bounded resource packets by ref.
- metadata is not the payload container.

## Governing Principle

Metadata is for indexing, readback, routing, and bounded summaries.

Payload storage is for full structured artifacts, resource packets, context
bundles, file snapshot bundles, validation result bodies, and other large
runtime-owned data.

No production path may make successful execution depend on a large object
fitting inside runtime artifact metadata.

## Non-Negotiable Rules

- Do not raise the artifact metadata limit as the fix.
- Do not truncate resource packets to make metadata storage pass.
- Do not compress large packet bodies into metadata.
- Do not rerun context scout or scheduler planning when the real failure is
  payload persistence.
- Do not call a storage-body path a fallback. It is the canonical production
  artifact path.
- Do not store raw prompts, raw model responses, hidden reasoning, raw
  provider logs, raw command logs, raw tool logs, raw DB rows, secrets, or
  unbounded transcripts in payload storage.
- Do not let graph node metadata become a second source of truth for resource
  packet bodies.

## Architecture

### Runtime Artifact Payload Store

The first-class runtime artifact payload store persists and hydrates full
structured artifact bodies outside artifact metadata.

Required interface:

- `putJsonPayload(input)`
  - validates raw-storage policy.
  - JSON serializes deterministically enough for hashing.
  - computes `sha256`.
  - computes byte count.
  - enforces max payload size and sharding policy.
  - writes the body to the canonical runtime payload substrate.
  - returns `payloadRef`, `sha256`, `byteCount`, `contentType`, and
    `createdAt`.
- `getJsonPayload(ref)`
  - validates authority and job/workflow scope.
  - loads the payload body.
  - verifies content hash when available.
  - returns typed JSON for compiler/worker hydration.
- `putJsonPayloadParts(input)`
  - shards large structured resources into bounded parts.
  - returns root manifest plus part manifests.
- `hydratePayloadManifest(input)`
  - resolves a root manifest and its parts into a typed body.
  - refuses missing, mismatched, stale, or over-limit parts.

Implemented backing:

- `execution_platform.runtime_job_artifact_payloads`
- repository APIs:
  - `putJsonPayload`
  - `getJsonPayload`
  - `attachJsonPayloadArtifact`
  - `hydrateJsonPayloadArtifact`
  - `putJsonPayloadParts`
  - `hydrateJsonPayloadParts`

This table lives in the Execution Platform runtime DB boundary and is not a
Model Memory or proof-only file path.

### Bounded Artifact Manifest

Every large artifact attachment should write only a bounded manifest to
`runtime_job_artifacts.metadata`.

Required manifest fields:

- `artifactKind`
- `schemaVersion`
- `runtimeJobId`
- `workflowId`
- `graphId`
- `nodeId`
- `artifactType`
- `artifactRef`
- `payloadRef`
- `contentHash`
- `byteCount`
- `partCount`
- `partRefs`
- `boundedSummary`
- `targetCommitmentIds`
- `targetNodeIds`
- `resourcePacketKind`
- `readinessStatus`
- `reasonCodes`
- `inputCounts`
- `outputCounts`
- `maxBounds`
- `hydrationToolId`
- `createdBy`
- `rawPromptStored: false`
- `rawResponseStored: false`
- `rawProviderLogStored: false`
- `rawToolLogStored: false`
- `rawCommandLogStored: false`
- `rawDbRowsStored: false`
- `secretsStored: false`

Manifest metadata must remain comfortably under the repository metadata
limit. The implementation should include a focused guard such as
`assertBoundedArtifactManifestMetadata(...)` so future contributors cannot
accidentally embed full packet bodies again.

### Content Addressing

Payload refs should be content-addressed or content-hash-linked:

- `runtime-artifact-payload://<runtimeJobId>/<artifactType>/<sha256>`
- or an equivalent DB-backed ref that includes the content hash.

The exact URI shape is runtime-owned. The important invariant is that
readback, replay, scheduler, and worker hydration can verify that the manifest
points at the expected payload body.

### Sharding

Large resource artifacts should shard at natural boundaries.

For coding implementation resources:

- root `ImplementationContextPacket` manifest.
- `ImplementationTaskPacket` manifests.
- `CodingResourcePacket` manifest.
- `NodeExecutionPacket` manifest.
- file snapshot bundle manifests.
- optional per-file snapshot manifests for large file bodies.
- validation plan/result manifests.

The root packet should reference part refs instead of embedding all
expensive bodies in metadata. Worker-facing hydration can assemble the exact
body needed for that worker invocation.

### Lazy File Snapshot Hydration

File snapshots should not be duplicated into every metadata or packet
container.

The canonical flow for implementation workers:

1. scheduler selects a ready implementation node.
2. runtime resolves the `NodeExecutionPacket` manifest.
3. runtime hydrates the `CodingResourcePacket` by payload ref.
4. runtime hydrates or refreshes target file snapshots by refs/hashes.
5. runtime verifies workspace root, repo revision/fingerprint when available,
   allowed edit scope, denied refs, target hashes, and validation refs.
6. worker receives a bounded implementation task packet plus file snapshots
   or snapshot refs as allowed by worker profile.

If file snapshots are stale or missing, the node blocks at resource
materialization. It does not call the implementation worker.

### Runtime Tools

Register storage as first-class runtime tools, not ad hoc repository calls:

- `artifact.payload.put_json`
- `artifact.payload.put_json_parts`
- `artifact.payload.get_json`
- `artifact.payload.attach_manifest`
- `artifact.payload.hydrate_manifest`

Tool traces must be bounded and owner-readable:

- payload ref.
- artifact type.
- byte count.
- hash prefix.
- part count.
- storage status.
- failure class.
- next legal transition.

Raw payload body should not be copied into the tool trace.

### Scheduler And Readiness Integration

Resource materialization must distinguish:

- semantic context missing.
- target refs missing.
- file snapshots missing.
- packet schema invalid.
- payload storage failed.
- artifact manifest exceeded bounds.
- worker readiness failed.

Storage failures are storage-bound resource failures. They should produce
readiness evidence and replayable artifacts. They should not be mislabeled as
context scout failures, provider failures, Kimi failures, or generic
`worker_adapter_threw` exceptions.

When payload persistence fails:

- record `resource_storage_failed`.
- include exact artifact type, node id, branch id, byte count, metadata byte
  count, and storage phase.
- keep sibling frontier evidence.
- return to scheduler with `needs_review` or `retry_storage_boundary`.
- recommend replay from resource materialization, not from Mission Ledger,
  packet authoring, or context scout.

### Work Queue Readback

Owner-facing readback must show payload/manifest state without dumping bodies:

- artifact type.
- payload ref.
- content hash prefix.
- byte count.
- part count.
- readiness state.
- node id.
- branch id.
- target commitments.
- storage failure class if any.
- replay boundary.
- ELI5 summary.

Readback must make clear when a node has context but is blocked by resource
packet storage.

### Boundary Replay

The replay harness must support restarting at the resource-storage boundary:

- after accepted graph.
- after accepted context handoff.
- before implementation-context packet persistence.
- before implementation worker invocation.

The replay should not rerun upstream Mission Ledger, packet authoring,
scheduler decomposition, or context scout when the checkpoint already has
accepted upstream evidence.

## Implementation Scope

### Production Code

Patched production areas:

- runtime DB migration:
  `extensions/execution-platform/migrations/0008_runtime_job_artifact_payloads.sql`
- runtime job repository payload APIs:
  `extensions/execution-platform/src/runtime-job-repository.ts`
- scheduler/runtime tool registry:
  `extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts`
- production dynamic runner implementation/resource packet persistence:
  `extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts`
- Work Queue execution read model:
  `extensions/execution-platform/src/work-queue/execution-read-model.ts`
- checkpointed Product/Spec boundary replay helper:
  `scripts/execution-platform-run-product-spec-boundary-replay.mjs`

### Artifact Types To Convert First

Required for this blocker:

- `execution_platform.implementation_context_packet`: converted to payload
  plus bounded manifest.
- `execution_platform.implementation_resource_materialization_result`:
  converted to payload plus bounded manifest.
- `execution_platform.implementation_task_packet`: converted to payload plus
  bounded manifest for every task packet, not a sliced subset.
- `execution_platform.coding_resource_packet`: converted to payload plus
  bounded manifest.
- `execution_platform.node_execution_packet`: converted to payload plus
  bounded manifest.
- implementation file snapshot bundles.

Audit and convert any similarly large resource packet paths found in the same
storage surfaces:

- context handoff packets.
- context scout execution packets.
- context synthesis input/output manifests.
- validation/QA packets and result bodies.
- closeout evidence/finalization packets.

Small summaries, readiness objects, and readback manifests may remain in
metadata if they pass the bounded-manifest guard.

## Validation

Focused validation completed:

- `pnpm test:file extensions/execution-platform/src/runtime-job-repository.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts`
  - 3 files passed.
  - 176 tests passed.
- `pnpm tsgo:fast extensions/execution-platform/src/runtime-job-repository.ts extensions/execution-platform/src/runtime-job-repository.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts extensions/execution-platform/src/work-queue/execution-read-model.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts`
  - passed; the command fell back to full-repo verification by script policy.

Focused tests now prove:

- a large `ImplementationContextPacket` that exceeds artifact metadata limits
  persists successfully as payload plus bounded manifest.
- manifest metadata remains below the configured limit.
- payload hydration round-trips the full typed packet without truncation.
- JSON payload parts can be persisted and hydrated from a root parts payload.
- graph node metadata no longer embeds implementation context/task,
  resource, or node execution packet bodies in the patched runner paths.
- Work Queue readback surfaces payload manifest refs and does not hydrate or
  dump large bodies.
- scheduler runtime tools expose payload put/get/parts/manifest operations as
  first-class bounded runtime operations.

Still required before the full Product/Spec proof:

- replay from the `native-exec-78e1b33861780884` resource-storage failure
  class or an equivalent current checkpoint.
- prove the replay reaches worker-ready implementation packet materialization
  or returns a precise storage-bound blocker.

## Pass Conditions

Implementation pass conditions now satisfied:

- no production implementation/resource packet path writes full packet bodies
  to artifact metadata.
- all required large resource artifacts have payload refs and bounded
  manifests.
- hydration is available to scheduler, replay, readback, and worker
  invocation.

Remaining proof gate:

- the failed Product/Spec resource-storage boundary must be replayed before a
  top-of-pipe Product/Spec proof is counted.

## Non-Goals

- no metadata limit increase.
- no truncation of resource packets.
- no prompt-level workaround.
- no Product/Spec-specific storage special case.
- no proof-only payload path.
- no raw provider/prompt/transcript/log storage.

## 2026-05-22 Follow-Up: Manifest-Safe Resource Summary Metrics

The latest Product/Spec checkpointed proof failed before worker editing with
`worker_adapter_threw:artifact_metadata_limit`. Inspection showed the actual
fault was not an oversized payload body. The runner was writing resource
materialization count/max maps into graph node status metadata with keys such
as `targetFileSnapshots`. The graph metadata guard correctly treats that key as
a possible embedded file-snapshot body, but in this case the value was only a
numeric count.

The fix is schema-safe manifest construction, not a metadata limit increase:

- resource materialization payload bodies remain in payload storage.
- graph metadata/readback summaries expose numeric metric names such as
  `targetFileSnapshotCount`, `implementationTaskPacketCount`, and
  `targetFileSnapshotMax`.
- body-like keys such as `targetFileSnapshots`, `implementationTaskPackets`,
  `contextPacket`, and `payloadBody` remain rejected in graph metadata unless
  they are bounded manifest refs.
- focused tests must prove both sides: real embedded bodies still fail, while
  resource-materialization metric summaries pass.

This preserves the manifest-only graph metadata invariant while removing the
false positive that blocked resource materialization.
