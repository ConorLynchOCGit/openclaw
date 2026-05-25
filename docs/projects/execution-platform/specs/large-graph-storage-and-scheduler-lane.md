---
summary: "Pre-Product/Spec lane proving large runtime graphs stay payload-backed, metadata-bounded, frontier-first, and operator-readable."
title: "Large Graph Storage And Scheduler Lane"
---

# Large Graph Storage And Scheduler Lane

Date: 2026-05-22

Status: implemented and provider-free lane-proven.

Work Queue item:
`openclaw-convergence.product-spec-large-graph-storage-scheduler-lane`.

Proof:
`.artifacts/execution-platform/large-graph-storage-scheduler-lane/proof.json`

## Purpose

The Product/Spec proof reached a large accepted graph before implementation and
then failed on artifact metadata size. The immediate artifact was
`execution.generic_orchestration_runtime_result`, but the real risk class was
larger:

- body-heavy packet/resource/runtime-result artifacts can drift back into
  metadata through adjacent production attach paths;
- graph node metadata can accumulate context/resource arrays until it becomes
  a hidden payload store;
- scheduler progress/readback can become too large or too opaque for owner
  diagnosis;
- a ready implementation branch can be starved by more graph expansion.

This lane proves the generic runtime can store and read a large workflow graph
without increasing metadata limits, truncating semantic bodies into success, or
adding Product/Spec-specific exceptions.

## Non-Negotiable Rules

- Do not raise the runtime artifact metadata limit.
- Do not store full packets, snapshots, resource materialization bodies,
  scheduler results, prompt text, raw provider responses, raw command logs,
  raw tool logs, raw DB rows, or hidden reasoning in metadata.
- Do not compress body payloads into metadata.
- Do not use proof-only storage paths for production artifact types.
- Do not let graph node metadata become a second payload substrate.
- Do not weaken scheduler readiness gates to pass the proof.
- Do not count graph expansion as progress when a ready legal frontier branch
  exists.

## Production Changes

### Artifact Contracts

The runtime artifact contract registry now covers all body-bearing production
artifacts used by the large-graph resource/materialization path:

- `execution_platform.implementation_context_packet`
- `execution_platform.implementation_resource_materialization_result`
- `execution_platform.implementation_task_packet`
- `execution_platform.coding_resource_packet`
- `execution_platform.node_execution_packet`
- `execution_platform.node_readiness_state`
- `execution.generic_orchestration_runtime_result`

The live scheduler progress artifact is also contract-covered as a bounded
manifest:

- `agent_team.scheduler_progress`
- `execution_platform.scheduler_progress`
- `execution_platform.latest_run_state`

Body-bearing artifacts must use
`RuntimeJobRepository.attachRuntimeArtifactByContract(...)`. Direct
`attachJsonPayloadArtifact(...)` is rejected for registered body-bearing
artifact types because it bypasses contract metadata and clean raw-storage
policy.

### Implementation Resource Materialization

`DynamicAgentTeamGraphRunner` now persists:

- implementation resource materialization results;
- node readiness states;

through the runtime artifact contract path. Those bodies live in the runtime
artifact payload store. Artifact metadata contains only payload refs, hashes,
byte counts, bounded summaries, target ids, readiness status, reason codes,
and raw-storage flags.

### Graph Metadata

Graph node metadata remains manifest-only. The guard now distinguishes bounded
reference objects from embedded bodies:

- arrays of `context_snapshot_ref` objects are allowed when they are bounded
  reference objects with raw-storage flags false;
- packet/resource body-shaped fields are still rejected;
- large upstream context snapshot arrays are not copied wholesale into node
  metadata.

When the scheduler attaches upstream context snapshots to a node before
execution, it stores:

- a bounded sample of context snapshot refs;
- `providedContextSnapshotRefCount`;
- `providedContextSnapshotRefsTruncated`;
- bounded string snapshot refs.

Full context remains available through handoff/context/resource artifacts and
payload refs, not graph metadata.

## Lane Proof

The provider-free proof script builds and runs a synthetic large graph:

- 90 graph nodes;
- 100 graph edges;
- large implementation context packet;
- large implementation resource materialization result;
- large implementation task packet;
- node readiness state;
- generic orchestration runtime result with intentionally large scheduler body;
- scheduler progress and latest-run-state readback.

It passes only if:

- all body-bearing artifacts are payload-backed;
- artifact metadata remains comfortably below runtime metadata limits;
- `execution.generic_orchestration_runtime_result` stores only a bounded
  manifest while the full result body is payload-backed;
- graph node metadata stays under the limit even with many upstream context
  snapshot refs;
- scheduler executes the ready implementation branch before asking the
  orchestrator to expand the graph;
- Work Queue readback surfaces latest-run-state/current graph progress from
  compact runtime artifacts.

Latest proof result:

- node count: 90;
- edge count: 100;
- executed node:
  `implementation-ready-large-graph`;
- payload-backed artifact types:
  `execution_platform.implementation_context_packet`,
  `execution_platform.implementation_resource_materialization_result`,
  `execution_platform.implementation_task_packet`,
  `execution_platform.node_readiness_state`,
  `execution.generic_orchestration_runtime_result`;
- largest metadata manifest in proof: under 8 KB;
- latest-run-state metadata: under 5 KB.

## Regression Tests

Focused tests prove:

- the contract registry registers resource materialization and node readiness
  bodies as payload-required;
- direct JSON payload writes are rejected for registered body-bearing artifact
  types;
- resource materialization and node readiness bodies hydrate from payload
  storage and do not leak snapshots into metadata;
- graph metadata accepts bounded context snapshot ref arrays without treating
  them as embedded payload bodies;
- scheduler bounds upstream context snapshot refs before writing node metadata.

## Remaining Pre-Proof Step

The next pre-proof item is Mission Ledger Stability Diagnostics. It should
measure ledger/packet variance, no-content retries, rescue frequency, and
phase/model cost before the Product/Spec Planning production proof. This
large-graph lane does not weaken Mission Ledger or packet gates; it only proves
the runtime can carry their large downstream graph safely.
