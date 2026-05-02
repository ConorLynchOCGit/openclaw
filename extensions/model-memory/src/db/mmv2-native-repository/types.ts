import type { MemoryEdge } from "../../mmv2/contracts.ts";

export type ListExistingMemorySummariesForCaptureInput = {
  projectId?: string | null;
  workspaceId?: string | null;
  sessionId?: string | null;
  kinds?: string[];
  memoryIds?: string[];
  queryText?: string | null;
  limit?: number;
};

export type DeferredLiveMemoryCandidate = {
  memory_id: string;
  reason: string;
  failure_class: "db_persistence";
  failure_stage: "persistence_boundary";
};

export type DeferredLiveMemoryEdge = {
  edge_id: string;
  edge_type: MemoryEdge["edge_type"];
  from_memory_id: string;
  to_memory_id: string;
  reason: string;
};

export type LiveMemoryPersistenceTelemetry = {
  rowsAttempted: {
    durableMemories: number;
    memoryEvents: number;
    memoryEdges: number;
  };
  rowsWritten: {
    durableMemories: number;
    memoryEvents: number;
    memoryEdges: number;
  };
  rowsDeferred: {
    candidates: number;
    memoryEdges: number;
  };
  transactionLatencyMs: number;
  operationCount: number;
};

export type LiveMemoryPersistenceResult = {
  durableMemoriesWritten: string[];
  memoryEventsWritten: string[];
  memoryEdgesWritten: string[];
  deferredCandidates: DeferredLiveMemoryCandidate[];
  deferredEdges: DeferredLiveMemoryEdge[];
  telemetry: LiveMemoryPersistenceTelemetry;
};

export type MmV2IntegrityAuditReport = {
  memoriesWithoutEvents: string[];
  eventsWithoutSourceRefs: string[];
  edgesWithoutEndpoints: string[];
  staleProjectionReferences: string[];
  orphanSourceSegments: string[];
};
