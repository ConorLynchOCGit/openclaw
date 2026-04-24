import type {
  ExistingMemorySummary,
  MemoryEdge,
  MemoryEvent,
  DurableMemoryRecord,
} from "../mmv2/contracts.ts";
import type { ShadowMemoryBatch } from "../mmv2/recording.ts";
import type {
  ModelMemoryObjectRecord,
  ModelMemorySourceRecord,
  ModelMemorySourceWindowRecord,
  ModelMemorySupportItemRecord,
  ModelMemorySupersessionLinkRecord,
  ModelMemoryWriteEventRecord,
} from "../storage-database-contract.ts";
import { ModelMemoryCanonicalRepository } from "./canonical-repository.ts";
import {
  appendDurableMemorySourceRef,
  auditMmV2Integrity,
  getDurableMemoryRecord,
  insertMemoryEventRecord,
  insertMemoryEventRecords,
  listDurableMemoryRecords,
  listExistingDurableMemoryIds,
  listExistingMemorySummaries,
  listExistingMemorySummariesForCapture,
  listMemoryEdgeRecords,
  listMemoryEventRecords,
  markDurableMemoryRecordStatus,
  upsertDurableMemoryRecord,
  upsertDurableMemoryRecords,
  upsertMemoryEdgeRecord,
  upsertMemoryEdgeRecords,
} from "./mmv2-native-repository/durable-records.ts";
import {
  activateMemoryObject,
  expireProvisionalMemoryObjects,
  findActiveMemoryObjectByIdentity,
  findActiveMemoryObjectBySlot,
  insertMemoryObject,
  insertSupportItem,
  insertSupersessionLink,
  insertWriteEvent,
  listMemoryObjects,
  listSupportItems,
  listSupportItemsForMemoryObject,
  listSupersessionLinks,
  listWriteEvents,
  markMemoryObjectSuperseded,
  snapshot,
} from "./mmv2-native-repository/legacy-compat.ts";
import { persistLiveMemoryBatch } from "./mmv2-native-repository/live-batch.ts";
export type {
  DeferredLiveMemoryCandidate,
  DeferredLiveMemoryEdge,
  ListExistingMemorySummariesForCaptureInput,
  LiveMemoryPersistenceResult,
  LiveMemoryPersistenceTelemetry,
  MmV2IntegrityAuditReport,
} from "./mmv2-native-repository/types.ts";
import {
  listSourceRecords,
  listSourceWindowRecords,
  persistSourceRecord,
  persistSourceWindowRecords,
} from "./mmv2-native-repository/source-records.ts";
import type {
  ListExistingMemorySummariesForCaptureInput,
  LiveMemoryPersistenceResult,
  MmV2IntegrityAuditReport,
} from "./mmv2-native-repository/types.ts";
import type { ModelMemoryDbLane } from "./pool-lanes.ts";
import type { SqlClient } from "./sql-client.ts";
import { withSqlClientLane } from "./sql-client.ts";

export class MmV2NativeRepository extends ModelMemoryCanonicalRepository {
  override withSqlClient(sql: SqlClient): MmV2NativeRepository {
    return new MmV2NativeRepository(sql);
  }

  withDbLane(lane: ModelMemoryDbLane): MmV2NativeRepository {
    return new MmV2NativeRepository(withSqlClientLane(this.sql, lane));
  }

  withTransaction<T>(work: (repository: MmV2NativeRepository) => Promise<T>): Promise<T> {
    return this.sql.withTransaction((tx) => work(new MmV2NativeRepository(tx)));
  }

  async persistSource(record: ModelMemorySourceRecord): Promise<ModelMemorySourceRecord> {
    return persistSourceRecord(this.sql, record);
  }

  async persistSourceWindows(
    records: ModelMemorySourceWindowRecord[],
  ): Promise<ModelMemorySourceWindowRecord[]> {
    return persistSourceWindowRecords(this.sql, records);
  }

  async listSources(): Promise<ModelMemorySourceRecord[]> {
    return listSourceRecords(this.sql);
  }

  async listSourceWindows(sourceId?: string): Promise<ModelMemorySourceWindowRecord[]> {
    return listSourceWindowRecords(this.sql, sourceId);
  }

  async getDurableMemory(memoryId: string): Promise<DurableMemoryRecord | undefined> {
    return getDurableMemoryRecord(this.sql, memoryId);
  }

  async listExistingDurableMemoryIds(memoryIds: string[]): Promise<string[]> {
    return listExistingDurableMemoryIds(this.sql, memoryIds);
  }

  async upsertDurableMemory(record: DurableMemoryRecord): Promise<DurableMemoryRecord> {
    return upsertDurableMemoryRecord(this.sql, record);
  }

  async upsertDurableMemories(records: DurableMemoryRecord[]): Promise<DurableMemoryRecord[]> {
    return upsertDurableMemoryRecords(this.sql, records);
  }

  async appendSourceRef(
    memoryId: string,
    sourceRef: DurableMemoryRecord["source_refs"][number],
    updatedAt: string,
  ): Promise<DurableMemoryRecord | undefined> {
    return appendDurableMemorySourceRef({
      sql: this.sql,
      memoryId,
      sourceRef,
      updatedAt,
    });
  }

  async markDurableMemoryStatus(input: {
    memoryId: string;
    status: DurableMemoryRecord["status"];
    updatedAt: string;
    supersededByMemoryId?: string | null;
  }): Promise<DurableMemoryRecord | undefined> {
    return markDurableMemoryRecordStatus({
      sql: this.sql,
      ...input,
    });
  }

  async insertMemoryEvent(record: MemoryEvent): Promise<MemoryEvent> {
    return insertMemoryEventRecord(this.sql, record);
  }

  async insertMemoryEvents(records: MemoryEvent[]): Promise<MemoryEvent[]> {
    return insertMemoryEventRecords(this.sql, records);
  }

  async upsertMemoryEdge(record: MemoryEdge): Promise<MemoryEdge> {
    return upsertMemoryEdgeRecord(this.sql, record);
  }

  async upsertMemoryEdges(records: MemoryEdge[]): Promise<MemoryEdge[]> {
    return upsertMemoryEdgeRecords(this.sql, records);
  }

  async persistLiveMemoryBatch(batch: ShadowMemoryBatch): Promise<LiveMemoryPersistenceResult> {
    return persistLiveMemoryBatch(this, batch);
  }

  async listDurableMemories(): Promise<DurableMemoryRecord[]> {
    return listDurableMemoryRecords(this.sql);
  }

  async listMemoryEvents(): Promise<MemoryEvent[]> {
    return listMemoryEventRecords(this.sql);
  }

  async listMemoryEdges(): Promise<MemoryEdge[]> {
    return listMemoryEdgeRecords(this.sql);
  }

  async auditIntegrity(): Promise<MmV2IntegrityAuditReport> {
    return auditMmV2Integrity(this.sql);
  }

  async listExistingMemorySummaries(): Promise<ExistingMemorySummary[]> {
    return listExistingMemorySummaries(this.sql);
  }

  async listExistingMemorySummariesForCapture(
    input: ListExistingMemorySummariesForCaptureInput = {},
  ): Promise<ExistingMemorySummary[]> {
    return listExistingMemorySummariesForCapture(this.sql, input);
  }

  async findActiveMemoryObjectByIdentity(
    identityKey: string,
  ): Promise<ModelMemoryObjectRecord | undefined> {
    return findActiveMemoryObjectByIdentity(this, identityKey);
  }

  async findActiveMemoryObjectBySlot(
    slotKey: string,
  ): Promise<ModelMemoryObjectRecord | undefined> {
    return findActiveMemoryObjectBySlot(this, slotKey);
  }

  async insertMemoryObject(record: ModelMemoryObjectRecord): Promise<ModelMemoryObjectRecord> {
    return insertMemoryObject(this, record);
  }

  async insertSupportItem(
    record: ModelMemorySupportItemRecord,
  ): Promise<ModelMemorySupportItemRecord> {
    return insertSupportItem(this, record);
  }

  async markMemoryObjectSuperseded(id: string, supersededAt: Date): Promise<void> {
    return markMemoryObjectSuperseded(this, id, supersededAt);
  }

  async activateMemoryObject(
    id: string,
    activatedAt: Date,
    activationBasis: string,
  ): Promise<void> {
    return activateMemoryObject(this, id, activatedAt, activationBasis);
  }

  async expireProvisionalMemoryObjects(expiredAt: Date, olderThan: Date): Promise<void> {
    return expireProvisionalMemoryObjects(this, expiredAt, olderThan);
  }

  async insertWriteEvent(
    record: ModelMemoryWriteEventRecord,
  ): Promise<ModelMemoryWriteEventRecord> {
    return insertWriteEvent(this, record);
  }

  async insertSupersessionLink(
    record: ModelMemorySupersessionLinkRecord,
  ): Promise<ModelMemorySupersessionLinkRecord> {
    return insertSupersessionLink(this, record);
  }

  async listMemoryObjects(): Promise<ModelMemoryObjectRecord[]> {
    return listMemoryObjects(this);
  }

  async listSupportItems(): Promise<ModelMemorySupportItemRecord[]> {
    return listSupportItems(this);
  }

  async listSupportItemsForMemoryObject(
    memoryObjectId: string,
  ): Promise<ModelMemorySupportItemRecord[]> {
    return listSupportItemsForMemoryObject(this, memoryObjectId);
  }

  async listWriteEvents(): Promise<ModelMemoryWriteEventRecord[]> {
    return listWriteEvents(this);
  }

  async listSupersessionLinks(): Promise<ModelMemorySupersessionLinkRecord[]> {
    return listSupersessionLinks(this);
  }

  async snapshot() {
    return snapshot(this);
  }
}
