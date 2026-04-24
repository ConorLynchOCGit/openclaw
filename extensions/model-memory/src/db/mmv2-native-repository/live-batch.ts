import { partitionMemoryEdgesByKnownEndpoints } from "../../ingestion/shared-pipeline.ts";
import type { MemoryEdge, MemoryEvent, DurableMemoryRecord } from "../../mmv2/contracts.ts";
import type { ShadowMemoryBatch } from "../../mmv2/recording.ts";
import type { SqlClient } from "../sql-client.ts";
import {
  batchWithPerRecordFallback,
  deleteMemoryEdgeById,
  supportsSavepointsInCurrentTransaction,
  withSavepoint,
} from "./transaction-support.ts";
import type {
  DeferredLiveMemoryCandidate,
  DeferredLiveMemoryEdge,
  LiveMemoryPersistenceResult,
} from "./types.ts";

type LiveBatchRepository = {
  getSqlClient(): SqlClient;
  withTransaction<T>(work: (repository: LiveBatchRepository) => Promise<T>): Promise<T>;
  listExistingDurableMemoryIds(memoryIds: string[]): Promise<string[]>;
  upsertDurableMemory(record: DurableMemoryRecord): Promise<DurableMemoryRecord>;
  markDurableMemoryStatus(input: {
    memoryId: string;
    status: DurableMemoryRecord["status"];
    updatedAt: string;
    supersededByMemoryId?: string | null;
  }): Promise<DurableMemoryRecord | undefined>;
  insertMemoryEvent(record: MemoryEvent): Promise<MemoryEvent>;
  insertMemoryEvents(records: MemoryEvent[]): Promise<MemoryEvent[]>;
  upsertMemoryEdge(record: MemoryEdge): Promise<MemoryEdge>;
};

export async function persistLiveMemoryBatch(
  repository: LiveBatchRepository,
  batch: ShadowMemoryBatch,
): Promise<LiveMemoryPersistenceResult> {
  const startedAt = Date.now();
  let operationCount = 0;
  const memoryEventsByMemoryId = new Map<string, MemoryEvent[]>();
  const standaloneMemoryEvents: MemoryEvent[] = [];
  for (const event of batch.memoryEvents) {
    if (event.memory_id) {
      const existing = memoryEventsByMemoryId.get(event.memory_id) ?? [];
      existing.push(event);
      memoryEventsByMemoryId.set(event.memory_id, existing);
    } else {
      standaloneMemoryEvents.push(event);
    }
  }
  const durableMemoryIds = new Set(batch.durableMemories.map((memory) => memory.memory_id));
  const deferredCandidates: DeferredLiveMemoryCandidate[] = [];
  const durableMemories = batch.durableMemories.filter((memory) => {
    if ((memoryEventsByMemoryId.get(memory.memory_id)?.length ?? 0) > 0) {
      return true;
    }
    deferredCandidates.push({
      memory_id: memory.memory_id,
      reason: "durable memory candidate has no event evidence",
      failure_class: "db_persistence",
      failure_stage: "persistence_boundary",
    });
    return false;
  });
  for (const memoryId of memoryEventsByMemoryId.keys()) {
    if (durableMemoryIds.has(memoryId)) {
      continue;
    }
    deferredCandidates.push({
      memory_id: memoryId,
      reason: "memory event references missing durable memory candidate",
      failure_class: "db_persistence",
      failure_stage: "persistence_boundary",
    });
  }
  const deferredCandidateIds = new Set(deferredCandidates.map((candidate) => candidate.memory_id));
  const memoryEventsByMemoryIdToPersist = new Map(
    [...memoryEventsByMemoryId.entries()].filter(
      ([memoryId]) => !deferredCandidateIds.has(memoryId),
    ),
  );
  const writtenMemoryIds: string[] = [];
  const writtenEventIds: string[] = [];
  const writtenEdgeIds: string[] = [];
  const deferredEdgesReport: DeferredLiveMemoryEdge[] = [];
  const endpointIds = batch.memoryEdges.flatMap((edge) => [edge.from_memory_id, edge.to_memory_id]);
  const loadExistingMemoryIds = async (
    transactionRepository: LiveBatchRepository,
  ): Promise<Set<string>> => {
    operationCount += 1;
    return new Set(
      await transactionRepository.listExistingDurableMemoryIds(
        endpointIds.filter((endpointId) => !durableMemoryIds.has(endpointId)),
      ),
    );
  };
  const persistCandidateUnit = async (input: {
    repository: LiveBatchRepository;
    existingMemoryIds: ReadonlySet<string>;
    memoryIndex: number;
    memory: DurableMemoryRecord;
    savepointsSupported: boolean;
  }): Promise<void> => {
    const { repository: transactionRepository, existingMemoryIds, memoryIndex, memory } = input;
    const candidateEvents = memoryEventsByMemoryIdToPersist.get(memory.memory_id) ?? [];
    const candidateEdges = batch.memoryEdges.filter(
      (edge) => edge.from_memory_id === memory.memory_id,
    );
    const candidateDeferredEdges: DeferredLiveMemoryEdge[] = [];
    const executeCandidate = async () => {
      operationCount += 1;
      await transactionRepository.upsertDurableMemory(memory);

      const knownMemoryIds = new Set([...existingMemoryIds, ...writtenMemoryIds, memory.memory_id]);
      const { validEdges, deferredEdges } = partitionMemoryEdgesByKnownEndpoints({
        edges: candidateEdges,
        knownMemoryIds,
      });
      candidateDeferredEdges.push(
        ...deferredEdges.map((entry) => ({
          edge_id: entry.edge.edge_id,
          edge_type: entry.edge.edge_type,
          from_memory_id: entry.edge.from_memory_id,
          to_memory_id: entry.edge.to_memory_id,
          reason: entry.reason,
        })),
      );

      const persistedEdges: MemoryEdge[] = [];
      for (const [edgeIndex, edge] of validEdges.entries()) {
        if (input.savepointsSupported) {
          try {
            await withSavepoint(
              transactionRepository.getSqlClient(),
              `memory_candidate_${memoryIndex}_edge_${edgeIndex}`,
              async () => {
                operationCount += 1;
                const persistedEdge = await transactionRepository.upsertMemoryEdge(edge);
                if (persistedEdge.edge_type === "supersedes") {
                  operationCount += 1;
                  const updated = await transactionRepository.markDurableMemoryStatus({
                    memoryId: persistedEdge.to_memory_id,
                    status: "superseded",
                    updatedAt: persistedEdge.created_at,
                    supersededByMemoryId: persistedEdge.from_memory_id,
                  });
                  if (!updated) {
                    throw new Error(
                      `superseded target memory not found: ${persistedEdge.to_memory_id}`,
                    );
                  }
                }
                persistedEdges.push(persistedEdge);
              },
            );
          } catch (error) {
            candidateDeferredEdges.push({
              edge_id: edge.edge_id,
              edge_type: edge.edge_type,
              from_memory_id: edge.from_memory_id,
              to_memory_id: edge.to_memory_id,
              reason: error instanceof Error ? error.message : String(error),
            });
          }
          continue;
        }

        try {
          operationCount += 1;
          const persistedEdge = await transactionRepository.upsertMemoryEdge(edge);
          try {
            if (persistedEdge.edge_type === "supersedes") {
              operationCount += 1;
              const updated = await transactionRepository.markDurableMemoryStatus({
                memoryId: persistedEdge.to_memory_id,
                status: "superseded",
                updatedAt: persistedEdge.created_at,
                supersededByMemoryId: persistedEdge.from_memory_id,
              });
              if (!updated) {
                throw new Error(
                  `superseded target memory not found: ${persistedEdge.to_memory_id}`,
                );
              }
            }
            persistedEdges.push(persistedEdge);
          } catch (error) {
            operationCount += 1;
            await deleteMemoryEdgeById(transactionRepository.getSqlClient(), edge.edge_id);
            candidateDeferredEdges.push({
              edge_id: edge.edge_id,
              edge_type: edge.edge_type,
              from_memory_id: edge.from_memory_id,
              to_memory_id: edge.to_memory_id,
              reason: error instanceof Error ? error.message : String(error),
            });
          }
        } catch (error) {
          candidateDeferredEdges.push({
            edge_id: edge.edge_id,
            edge_type: edge.edge_type,
            from_memory_id: edge.from_memory_id,
            to_memory_id: edge.to_memory_id,
            reason: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const eventsWithDeferredReports = candidateEvents.map((event) =>
        candidateDeferredEdges.length > 0
          ? {
              ...event,
              payload: {
                ...event.payload,
                deferred_memory_edges: candidateDeferredEdges,
              },
            }
          : event,
      );
      const persistedEvents =
        eventsWithDeferredReports.length === 1
          ? [await transactionRepository.insertMemoryEvent(eventsWithDeferredReports[0])]
          : eventsWithDeferredReports.length > 1
            ? await transactionRepository.insertMemoryEvents(eventsWithDeferredReports)
            : [];

      writtenMemoryIds.push(memory.memory_id);
      writtenEdgeIds.push(...persistedEdges.map((edge) => edge.edge_id));
      writtenEventIds.push(...persistedEvents.map((event) => event.memory_event_id));
    };

    if (input.savepointsSupported) {
      await withSavepoint(
        transactionRepository.getSqlClient(),
        `memory_candidate_${memoryIndex}`,
        executeCandidate,
      );
    } else {
      await executeCandidate();
    }
    deferredEdgesReport.push(...candidateDeferredEdges);
  };

  const savepointsSupported = await repository.withTransaction((transactionRepository) =>
    supportsSavepointsInCurrentTransaction(transactionRepository.getSqlClient()),
  );
  if (savepointsSupported) {
    await repository.withTransaction(async (transactionRepository) => {
      const existingMemoryIds = await loadExistingMemoryIds(transactionRepository);
      for (const [memoryIndex, memory] of durableMemories.entries()) {
        try {
          await persistCandidateUnit({
            repository: transactionRepository,
            existingMemoryIds,
            memoryIndex,
            memory,
            savepointsSupported: true,
          });
        } catch (error) {
          deferredCandidates.push({
            memory_id: memory.memory_id,
            reason: error instanceof Error ? error.message : String(error),
            failure_class: "db_persistence",
            failure_stage: "persistence_boundary",
          });
        }
      }
      const persistedStandaloneEvents = await batchWithPerRecordFallback({
        sql: transactionRepository.getSqlClient(),
        savepointPrefix: "memory_event",
        records: standaloneMemoryEvents,
        batch: async (records) => {
          operationCount += 1;
          return transactionRepository.insertMemoryEvents(records);
        },
        single: async (record) => {
          operationCount += 1;
          return transactionRepository.insertMemoryEvent(record);
        },
        defer: () => undefined,
      });
      writtenEventIds.push(...persistedStandaloneEvents.map((event) => event.memory_event_id));
    });
  } else {
    const existingMemoryIds = await loadExistingMemoryIds(repository);
    for (const [memoryIndex, memory] of durableMemories.entries()) {
      try {
        await repository.withTransaction(async (transactionRepository) => {
          await persistCandidateUnit({
            repository: transactionRepository,
            existingMemoryIds,
            memoryIndex,
            memory,
            savepointsSupported: false,
          });
        });
      } catch (error) {
        deferredCandidates.push({
          memory_id: memory.memory_id,
          reason: error instanceof Error ? error.message : String(error),
          failure_class: "db_persistence",
          failure_stage: "persistence_boundary",
        });
      }
    }
    for (const standaloneEvent of standaloneMemoryEvents) {
      try {
        await repository.withTransaction(async (transactionRepository) => {
          operationCount += 1;
          const persistedEvent = await transactionRepository.insertMemoryEvent(standaloneEvent);
          writtenEventIds.push(persistedEvent.memory_event_id);
        });
      } catch {
        // Standalone reject/quarantine events remain best-effort in the pg-mem fallback path.
      }
    }
  }

  return {
    durableMemoriesWritten: writtenMemoryIds,
    memoryEventsWritten: writtenEventIds,
    memoryEdgesWritten: writtenEdgeIds,
    deferredCandidates,
    deferredEdges: deferredEdgesReport,
    telemetry: {
      rowsAttempted: {
        durableMemories: batch.durableMemories.length,
        memoryEvents: batch.memoryEvents.length,
        memoryEdges: batch.memoryEdges.length,
      },
      rowsWritten: {
        durableMemories: writtenMemoryIds.length,
        memoryEvents: writtenEventIds.length,
        memoryEdges: writtenEdgeIds.length,
      },
      rowsDeferred: {
        candidates: deferredCandidates.length,
        memoryEdges: deferredEdgesReport.length,
      },
      transactionLatencyMs: Date.now() - startedAt,
      operationCount,
    },
  };
}
