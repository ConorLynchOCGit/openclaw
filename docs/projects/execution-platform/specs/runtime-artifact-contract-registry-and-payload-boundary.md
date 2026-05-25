---
summary: "Typed runtime artifact contracts, payload-backed body storage, and manifest-only metadata enforcement for Execution Platform artifacts."
title: "Runtime Artifact Contract Registry And Payload Boundary"
---

# Runtime Artifact Contract Registry And Payload Boundary

## Purpose

The Runtime Artifact Payload Store solved the first storage failure class:
large resource packets can be persisted outside artifact metadata. The latest
Product/Spec proof showed the next class of failure: body-bearing artifacts are
still written from multiple production surfaces through ad hoc `attachArtifact`
calls, and each surface decides for itself whether an artifact body belongs in
metadata or the payload store.

That is too brittle. Artifact storage policy must be a first-class runtime
contract, not a local convention.

This spec defines a `RuntimeArtifactContractRegistry` and a single production
attach path that enforces:

- metadata is a bounded manifest;
- full bodies live in the Runtime Artifact Payload Store or a domain payload
  store;
- raw storage flags are explicit and false by default;
- hydrate/readback/replay code consumes payload refs, not hidden metadata
  bodies;
- body-bearing artifact types cannot regress to metadata storage from new
  code paths.

## Problem

The proof run that reached 82 graph nodes, 86 graph edges, 13 context handoff
packets, 2 implementation context packets, 2 resource materialization results,
and 35 implementation task packets still stopped before implementation edits.
The immediate terminal blocker was an artifact metadata limit:

`artifact metadata exceeds 65536 bytes; artifactType=execution.generic_orchestration_runtime_result`

That single artifact has been bounded, but code review surfaced the larger
pattern:

- Commitment Work Packet pre-review, post-review, replay, and final packet
  artifacts can still include full `commitmentWorkPacket` bodies in metadata.
- Context Scout execution packets can still include full execution packet
  bodies in metadata.
- Context handoff packets can still include full handoff bodies in metadata.
- Generic runtime result/readback artifacts can duplicate large scheduler
  state instead of manifest refs.
- Graph metadata has a manifest-only guard, but it is graph-specific and
  key-pattern based.

The current system relies on developers remembering which artifact types are
large. That is the wrong boundary. Runtime code should reject invalid storage
for registered artifact types before proof runs discover it.

## Architectural Principle

Models and workflow executors may produce semantic artifact content. Runtime
owns persistence, metadata bounds, raw-storage flags, ref/hydration shape, and
lifecycle.

No model, node executor, proof harness, or workflow plugin should decide that a
large artifact body can be stored in metadata. The contract registry makes that
decision once.

## Canonical Components

### `RuntimeArtifactContractRegistry`

The registry defines one contract per production artifact type.

Contract fields:

- `artifactType`: the concrete runtime artifact type.
- `contractId`: stable id used in tests, readback, and migration notes.
- `domain`: `mission`, `packet`, `context`, `scheduler`, `resource`,
  `worker`, `validation`, `closeout`, `work_queue`, or future workflow domain.
- `storagePolicy`:
  - `metadata_manifest_only`: artifact is small and metadata-only by design.
  - `payload_required`: body must be written to the payload store.
  - `payload_parts_required`: large body is split into bounded payload parts.
  - `debug_metadata_only`: allowed only for proof/fixture diagnostics, never
    clean production success evidence.
- `manifestSchemaRef`: schema for the bounded metadata manifest.
- `bodySchemaRef`: schema for the payload body when payload-backed.
- `maxManifestBytes`: hard upper bound for metadata.
- `maxBodyBytes`: hard upper bound for the payload body or part.
- `summaryBuilder`: deterministic function that converts body to bounded
  owner-facing metadata.
- `payloadWritePolicy`: compression, chunking, hash, version, retention, and
  redaction policy.
- `hydrateToolId`: runtime tool/ref used to hydrate the payload for replay or
  worker handoff.
- `rawStoragePolicy`: explicit raw prompt/response/log/db-row flags.
- `legacyHydration`: optional normalizer for old checkpoint artifacts. It may
  hydrate semantically valid old metadata bodies, but it must never bless new
  metadata-body writes.
- `cleanSuccessEligible`: whether this artifact type can count as production
  success evidence.

### `attachRuntimeArtifactByContract(...)`

All production artifact writes use a single attach path:

1. Resolve contract by `artifactType`.
2. Validate the body or manifest against the contract.
3. Build bounded manifest metadata.
4. If `payload_required`, write body through the Runtime Artifact Payload
   Store and attach only payload refs, hash, size, schema version, and summary.
5. If `metadata_manifest_only`, reject oversized or body-shaped metadata.
6. Assert raw-storage flags.
7. Attach the artifact through the repository.
8. Emit a runtime tool trace/span for storage, manifest size, payload size,
   hydration ref, and policy id.

Direct repository `attachArtifact(...)` remains a low-level primitive. It is
not a production workflow API for registered artifact types.

### `hydrateRuntimeArtifactByContract(...)`

Replay, Work Queue readback, scheduler repair, and worker handoff use a
matching hydrate API:

1. Load artifact metadata.
2. Resolve contract.
3. If payload-backed, read payload by ref/hash and validate body schema.
4. If legacy metadata exists and contract allows `legacyHydration`, normalize
   to the current body shape and return a diagnostic `legacyHydrated: true`.
5. If body is missing or invalid, emit an exact missing-ref/schema diagnostic.

Hydration is explicit. No replay or worker code should reach into artifact
metadata looking for a body-bearing key.

## Initial Registered Artifact Types

The first pass must register and enforce these production artifact classes:

- `execution_platform.commitment_work_packet`
- `execution_platform.commitment_work_packet.pre_review`
- `execution_platform.commitment_work_packet.post_review`
- `execution_platform.commitment_work_packet.post_repair`
- `execution_platform.commitment_work_packet.replay`
- `execution_platform.context_scout_execution_packet`
- `execution_platform.context_handoff_packet`
- `execution_platform.implementation_context_packet`
- `execution_platform.implementation_task_packet`
- `execution_platform.coding_resource_packet`
- `execution_platform.node_execution_packet`
- `execution.generic_orchestration_runtime_result`
- `execution_platform.scheduler_progress`
- `execution_platform.latest_run_state`

Large body types should be `payload_required`. `scheduler_progress` and
`latest_run_state` may remain manifest-only only if their contract caps branch,
node, edge, readiness, and token arrays.

## Body-Bearing Metadata Is Forbidden

Production code must not store these metadata keys for registered artifact
types unless the contract marks the artifact as `debug_metadata_only`:

- full prompt text;
- raw provider responses;
- raw transcripts;
- raw command/tool logs;
- full Commitment Work Packets;
- full Context Scout execution packets;
- full context handoff packets;
- full implementation context/task/resource/node execution packets;
- full scheduler snapshots;
- full graph node lists, edge lists, or repeated readiness arrays.

This is not a regex semantic-forest decision. The artifact contract knows
which artifact type is body-bearing. The guard rejects registered body-bearing
types when body-shaped metadata is supplied.

## Migration And Compatibility

Old checkpoint artifacts may exist with bodies in metadata. The migration
policy is:

- read old artifacts only through `legacyHydration`;
- write a normalized payload-backed replacement when the old body is
  semantically valid;
- emit `legacyArtifactHydrated` diagnostics;
- never write new metadata bodies for clean production evidence;
- mark unhydratable old artifacts with exact missing fields/refs so replay can
  stop at the right boundary.

No compatibility path may be a production success path.

## Tests

Required focused tests:

1. Every registered body-bearing artifact rejects direct metadata body storage.
2. Registered body-bearing artifacts can be attached only through
   `attachRuntimeArtifactByContract(...)`.
3. Payload-backed attach writes bounded metadata with payload ref, hash, byte
   count, schema version, and summary.
4. Hydration validates payload hash and schema.
5. Legacy metadata hydration works only when the contract explicitly allows it.
6. Raw storage flags remain false unless a contract explicitly permits bounded
   raw storage.
7. Repo-wide guard fails if production code calls direct `attachArtifact` with
   a registered body-bearing artifact type.
8. Large fixtures for Commitment Work Packets, context handoffs,
   implementation context packets, and generic runtime results stay under
   metadata bounds.

## Proof Gate

Before the next Product/Spec proof, run a storage lane using the latest failed
graph/checkpoint and a synthetic large graph:

- hydrate existing Commitment Work Packets and context handoffs;
- attach payload-backed replacements where needed;
- write generic orchestration runtime result manifests under the metadata
  limit;
- prove replay can hydrate resource packets from payload refs;
- prove Work Queue readback shows artifact summaries, payload refs, sizes, and
  no raw storage flags.

## Natural Follow-Ons

After the pre-proof pass:

- add an artifact contract coverage report to the Runtime Toolification Truth
  Registry;
- add retention and pruning policy by contract domain;
- add payload part compaction and archival;
- add owner-facing artifact inspector readback for payload refs;
- add cross-workflow artifact contracts for planning, research, design, and
  marketing workflows before those teams become production paths.
