import type { DurableMemoryRecord, MemoryEdge, MemoryEvent } from "../../mmv2/contracts.ts";
import {
  adaptLegacyObjectToDurableMemory,
  projectDurableMemoryToLegacyRecord,
  projectDurableMemoryToSupportItems,
  projectMemoryEdgeToSupersessionLink,
  projectMemoryEventToLegacyWriteEvent,
} from "../../mmv2/storage-compatibility.ts";
import { deriveMemoryIdentity } from "../../semantic-identity.ts";
import type {
  ModelMemoryObjectRecord,
  ModelMemorySourceRecord,
  ModelMemorySourceWindowRecord,
  ModelMemorySupportItemRecord,
  ModelMemorySupersessionLinkRecord,
  ModelMemoryWriteEventRecord,
} from "../../storage-database-contract.ts";
import { toLegacyObject } from "./codecs.ts";

type LegacyCompatRepository = {
  getDurableMemory(memoryId: string): Promise<DurableMemoryRecord | undefined>;
  appendSourceRef(
    memoryId: string,
    sourceRef: DurableMemoryRecord["source_refs"][number],
    updatedAt: string,
  ): Promise<DurableMemoryRecord | undefined>;
  markDurableMemoryStatus(input: {
    memoryId: string;
    status: DurableMemoryRecord["status"];
    updatedAt: string;
    supersededByMemoryId?: string | null;
  }): Promise<DurableMemoryRecord | undefined>;
  insertMemoryEvent(record: MemoryEvent): Promise<MemoryEvent>;
  upsertMemoryEdge(record: MemoryEdge): Promise<MemoryEdge>;
  listSources(): Promise<ModelMemorySourceRecord[]>;
  listSourceWindows(sourceId?: string): Promise<ModelMemorySourceWindowRecord[]>;
  listDurableMemories(): Promise<DurableMemoryRecord[]>;
  listMemoryEvents(): Promise<MemoryEvent[]>;
  listMemoryEdges(): Promise<MemoryEdge[]>;
  upsertDurableMemory(record: DurableMemoryRecord): Promise<DurableMemoryRecord>;
};

function mapLifecycleStateToStatus(
  lifecycleState: ModelMemoryObjectRecord["lifecycleState"],
): DurableMemoryRecord["status"] {
  switch (lifecycleState) {
    case "superseded":
      return "superseded";
    case "conflict_hold":
      return "conflicted";
    case "expired":
      return "deleted";
    case "provisional":
      return "inactive";
    case "active":
    default:
      return "active";
  }
}

function projectLegacyRecordForRuntimeCompat(record: DurableMemoryRecord): ModelMemoryObjectRecord {
  const projected = projectDurableMemoryToLegacyRecord(record);
  const identity = deriveMemoryIdentity(toLegacyObject(projected));
  return {
    ...projected,
    normalizedSubject: identity.normalizedSubject,
    normalizedTitle: identity.normalizedTitle,
    normalizedSearchText: identity.normalizedSearchText,
    scopeKey: identity.scopeKey,
    identityKey: identity.identityKey,
    slotKey: identity.slotKey,
  };
}

export async function findActiveMemoryObjectByIdentity(
  repository: LegacyCompatRepository,
  identityKey: string,
): Promise<ModelMemoryObjectRecord | undefined> {
  const memoryObjects = await listMemoryObjects(repository);
  return memoryObjects.find(
    (record) =>
      record.identityKey === identityKey &&
      record.lifecycleState === "active" &&
      !record.supersededAt,
  );
}

export async function findActiveMemoryObjectBySlot(
  repository: LegacyCompatRepository,
  slotKey: string,
): Promise<ModelMemoryObjectRecord | undefined> {
  const memoryObjects = await listMemoryObjects(repository);
  return memoryObjects.find(
    (record) =>
      record.slotKey === slotKey && record.lifecycleState === "active" && !record.supersededAt,
  );
}

export async function insertMemoryObject(
  repository: LegacyCompatRepository,
  record: ModelMemoryObjectRecord,
): Promise<ModelMemoryObjectRecord> {
  const createdAt = record.createdAt ?? new Date();
  await repository.upsertDurableMemory(
    adaptLegacyObjectToDurableMemory({
      memoryId: record.id,
      object: toLegacyObject(record),
      sourceWindowId: record.sourceWindowId ?? record.id,
      sourceKind: "document",
      createdAt,
      status: mapLifecycleStateToStatus(record.lifecycleState),
    }),
  );
  return (await listMemoryObjects(repository)).find((entry) => entry.id === record.id)!;
}

export async function insertSupportItem(
  repository: LegacyCompatRepository,
  record: ModelMemorySupportItemRecord,
): Promise<ModelMemorySupportItemRecord> {
  const durable = await repository.getDurableMemory(record.memoryObjectId);
  if (!durable) {
    throw new Error(`Cannot attach support to missing durable memory ${record.memoryObjectId}`);
  }
  await repository.appendSourceRef(
    record.memoryObjectId,
    {
      source_ingest_event_id: record.sourceWindowId,
      source_type: record.derivedFromSourceKind,
      source_id: record.sourceWindowId,
      speaker: "unknown",
      created_at: record.createdAt.toISOString(),
      segment_id: record.sourceWindowId,
      start_char: 0,
      end_char: 0,
      evidence_quote: durable.canonical_text,
    },
    record.createdAt.toISOString(),
  );
  return record;
}

export async function markMemoryObjectSuperseded(
  repository: LegacyCompatRepository,
  id: string,
  supersededAt: Date,
): Promise<void> {
  await repository.markDurableMemoryStatus({
    memoryId: id,
    status: "superseded",
    updatedAt: supersededAt.toISOString(),
  });
}

export async function activateMemoryObject(
  repository: LegacyCompatRepository,
  id: string,
  activatedAt: Date,
  _activationBasis: string,
): Promise<void> {
  await repository.markDurableMemoryStatus({
    memoryId: id,
    status: "active",
    updatedAt: activatedAt.toISOString(),
  });
}

export async function expireProvisionalMemoryObjects(
  repository: LegacyCompatRepository,
  expiredAt: Date,
  olderThan: Date,
): Promise<void> {
  const records = await repository.listDurableMemories();
  await Promise.all(
    records
      .filter(
        (record) =>
          record.status === "inactive" &&
          new Date(record.created_at).getTime() < olderThan.getTime(),
      )
      .map((record) =>
        repository.markDurableMemoryStatus({
          memoryId: record.memory_id,
          status: "deleted",
          updatedAt: expiredAt.toISOString(),
        }),
      ),
  );
}

export async function insertWriteEvent(
  repository: LegacyCompatRepository,
  record: ModelMemoryWriteEventRecord,
): Promise<ModelMemoryWriteEventRecord> {
  const eventType =
    record.decision === "supersede"
      ? "memory_superseded"
      : record.decision === "attach_support"
        ? "memory_merged"
        : record.decision === "quarantine"
          ? "candidate_quarantined"
          : record.decision === "reject"
            ? "candidate_rejected"
            : "memory_inserted";
  await repository.insertMemoryEvent({
    memory_event_id: record.id,
    schema_version: "memory_event.v1",
    event_type: eventType,
    occurred_at: record.createdAt.toISOString(),
    actor: "system",
    source_ingest_event_id: record.sourceWindowId,
    candidate_id: record.candidateIdentityKey ?? null,
    memory_id: record.memoryObjectId ?? null,
    target_memory_ids: record.supersededObjectId ? [record.supersededObjectId] : [],
    payload: {
      decision_codes: record.decisionCodes,
      contract_name: record.contractName,
      contract_version: record.contractVersion,
      model_id: record.modelId,
    },
  });
  return record;
}

export async function insertSupersessionLink(
  repository: LegacyCompatRepository,
  record: ModelMemorySupersessionLinkRecord,
): Promise<ModelMemorySupersessionLinkRecord> {
  await repository.upsertMemoryEdge({
    edge_id: record.id,
    schema_version: "memory_edge.v1",
    from_memory_id: record.replacementObjectId,
    to_memory_id: record.priorObjectId,
    edge_type: "supersedes",
    created_at: record.createdAt.toISOString(),
    metadata: { reason_code: record.reasonCode },
  });
  return record;
}

export async function listMemoryObjects(
  repository: LegacyCompatRepository,
): Promise<ModelMemoryObjectRecord[]> {
  const records = await repository.listDurableMemories();
  return records.map(projectLegacyRecordForRuntimeCompat);
}

export async function listSupportItems(
  repository: LegacyCompatRepository,
): Promise<ModelMemorySupportItemRecord[]> {
  const records = await repository.listDurableMemories();
  return records.flatMap(projectDurableMemoryToSupportItems);
}

export async function listSupportItemsForMemoryObject(
  repository: LegacyCompatRepository,
  memoryObjectId: string,
): Promise<ModelMemorySupportItemRecord[]> {
  const supportItems = await listSupportItems(repository);
  return supportItems.filter((record) => record.memoryObjectId === memoryObjectId);
}

export async function listWriteEvents(
  repository: LegacyCompatRepository,
): Promise<ModelMemoryWriteEventRecord[]> {
  const events = await repository.listMemoryEvents();
  return events.map(projectMemoryEventToLegacyWriteEvent);
}

export async function listSupersessionLinks(
  repository: LegacyCompatRepository,
): Promise<ModelMemorySupersessionLinkRecord[]> {
  const edges = await repository.listMemoryEdges();
  return edges
    .map(projectMemoryEdgeToSupersessionLink)
    .filter((entry): entry is ModelMemorySupersessionLinkRecord => Boolean(entry));
}

export async function snapshot(repository: LegacyCompatRepository) {
  return {
    sources: await repository.listSources(),
    sourceWindows: await repository.listSourceWindows(),
    memoryObjects: await listMemoryObjects(repository),
    supportItems: await listSupportItems(repository),
    writeEvents: await listWriteEvents(repository),
    supersessionLinks: await listSupersessionLinks(repository),
    durableMemories: await repository.listDurableMemories(),
    memoryEvents: await repository.listMemoryEvents(),
    memoryEdges: await repository.listMemoryEdges(),
  };
}
