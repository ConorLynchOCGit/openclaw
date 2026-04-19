import {
  createPhaseMismatch,
  finalizePhaseResult,
  type MmV2PhaseComparisonResult,
} from "./proof-compare-shared.ts";
import type { MmV2RecordingExpectation } from "./proof-corpus.ts";
import type { ShadowMemoryBatch } from "./recording.ts";

export function compareRecordingPhase(
  recording: ShadowMemoryBatch,
  expectation?: MmV2RecordingExpectation,
): MmV2PhaseComparisonResult {
  const mismatches = [];
  const eventTypes = recording.memoryEvents.map((event) => event.event_type);
  const edgeTypes = recording.memoryEdges.map((edge) => edge.edge_type);
  const durableKinds = recording.durableMemories.map(
    (memory) => memory.kind ?? memory.artifact_type,
  );

  if (
    expectation?.durableMemoryCount !== undefined &&
    recording.durableMemories.length !== expectation.durableMemoryCount
  ) {
    mismatches.push(
      createPhaseMismatch(
        "recording",
        "durable_memory_count_mismatch",
        "Durable memory count did not match expectation.",
        { expectedCount: expectation.durableMemoryCount },
        { actualCount: recording.durableMemories.length },
      ),
    );
  }
  for (const eventType of expectation?.memoryEventTypesInclude ?? []) {
    if (!eventTypes.includes(eventType)) {
      mismatches.push(
        createPhaseMismatch(
          "recording",
          "missing_memory_event_type",
          "Expected memory event type was not present.",
          eventType,
          eventTypes,
        ),
      );
    }
  }
  for (const edgeType of expectation?.memoryEdgeTypesInclude ?? []) {
    if (!edgeTypes.includes(edgeType)) {
      mismatches.push(
        createPhaseMismatch(
          "recording",
          "missing_memory_edge_type",
          "Expected memory edge type was not present.",
          edgeType,
          edgeTypes,
        ),
      );
    }
  }
  for (const durableKind of expectation?.durableKindsInclude ?? []) {
    if (!durableKinds.includes(durableKind ?? null)) {
      mismatches.push(
        createPhaseMismatch(
          "recording",
          "missing_durable_kind",
          "Expected durable memory kind or artifact type was not present.",
          durableKind,
          durableKinds,
        ),
      );
    }
  }

  return finalizePhaseResult({
    phase: "recording",
    mismatches,
    actualCount: recording.durableMemories.length,
    expectedCount: expectation?.durableMemoryCount,
  });
}
