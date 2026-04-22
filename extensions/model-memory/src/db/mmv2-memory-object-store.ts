import { buildDeterministicUuid } from "../deterministic-uuid.ts";
import type { StoreWriteResult, StoredCaptureInput } from "../memory-object-store.ts";
import type { DurableMemoryRecord, MemoryEdge, MemoryEvent } from "../mmv2/contracts.ts";
import type { ShadowMemoryBatch } from "../mmv2/recording.ts";
import {
  adaptLegacyObjectToDurableMemory,
  projectMemoryEventToLegacyWriteEvent,
  projectMemoryEdgeToSupersessionLink,
} from "../mmv2/storage-compatibility.ts";
import { deriveMemoryIdentity } from "../semantic-identity.ts";
import type {
  ModelMemoryObjectRecord,
  ModelMemorySupportItemRecord,
  ModelMemorySupersessionLinkRecord,
} from "../storage-database-contract.ts";
import { decideWritePolicy, type ExistingStoredObject } from "../write-policy.ts";
import { DatabaseMemoryObjectStore } from "./database-memory-object-store.ts";
import { MmV2NativeRepository } from "./mmv2-native-repository.ts";

type LegacyEventDecision = StoreWriteResult["decision"] | "reject" | "quarantine";

function mapExistingStoredObject(record: ModelMemoryObjectRecord): ExistingStoredObject {
  return {
    id: record.id,
    kind: record.kind as ExistingStoredObject["kind"],
    identityKey: record.identityKey,
    slotKey: record.slotKey,
    lifecycleState: record.lifecycleState,
  };
}

function mapPolicyToStatus(
  decision: ReturnType<typeof decideWritePolicy>,
): DurableMemoryRecord["status"] {
  if (decision.decision === "ignore") {
    return "inactive";
  }
  if (decision.decision === "attach_support") {
    return "active";
  }
  if (decision.decision === "supersede") {
    return "active";
  }
  if (decision.decision === "write") {
    return decision.lifecycleState === "provisional" ? "inactive" : "active";
  }
  return "inactive";
}

function hasMatchingSupport(
  record: DurableMemoryRecord | undefined,
  input: StoredCaptureInput,
): boolean {
  if (!record) {
    return false;
  }
  return record.source_refs.some(
    (sourceRef) =>
      sourceRef.source_type === (input.sourceKind ?? "document") &&
      sourceRef.segment_id.startsWith(input.sourceWindowId),
  );
}

function buildEventForLegacyDecision(input: {
  sourceWindowId: string;
  createdAt: Date;
  decision: LegacyEventDecision;
  memoryId?: string;
  targetMemoryIds?: string[];
  payload?: Record<string, unknown>;
}): MemoryEvent {
  const eventType: MemoryEvent["event_type"] =
    input.decision === "supersede"
      ? "memory_superseded"
      : input.decision === "attach_support"
        ? "memory_merged"
        : input.decision === "reject"
          ? "candidate_rejected"
          : input.decision === "quarantine"
            ? "candidate_quarantined"
            : "memory_inserted";
  return {
    memory_event_id: buildDeterministicUuid(
      "mmv2-event",
      `${input.sourceWindowId}:${eventType}:${input.memoryId ?? "none"}:${input.createdAt.toISOString()}`,
    ),
    schema_version: "memory_event.v1",
    event_type: eventType,
    occurred_at: input.createdAt.toISOString(),
    actor: "system",
    source_ingest_event_id: input.sourceWindowId,
    candidate_id: null,
    memory_id: input.memoryId ?? null,
    target_memory_ids: input.targetMemoryIds ?? [],
    payload: input.payload ?? {},
  };
}

export class MmV2DatabaseMemoryObjectStore extends DatabaseMemoryObjectStore {
  private readonly mmv2Repository: MmV2NativeRepository;

  constructor(mmv2Repository: MmV2NativeRepository) {
    super(mmv2Repository);
    this.mmv2Repository = mmv2Repository;
  }

  async writeShadowBatch(batch: ShadowMemoryBatch): Promise<StoreWriteResult[]> {
    return this.mmv2Repository.withTransaction(async (repository) => {
      await repository.persistLiveMemoryBatch(batch);

      const memoryObjects = await repository.listMemoryObjects();
      const supersessionLinks = await repository.listSupersessionLinks();
      const supersessionByReplacement = new Map(
        supersessionLinks.map((link) => [link.replacementObjectId, link]),
      );
      return batch.memoryEvents.map((event) => {
        const eventDecision: LegacyEventDecision =
          event.event_type === "memory_superseded"
            ? "supersede"
            : event.event_type === "memory_merged" || event.event_type === "artifact_updated"
              ? "attach_support"
              : event.event_type === "candidate_rejected"
                ? "reject"
                : event.event_type === "candidate_quarantined"
                  ? "quarantine"
                  : "write";
        const decision: StoreWriteResult["decision"] =
          eventDecision === "reject" || eventDecision === "quarantine" ? "ignore" : eventDecision;
        const memoryObject = event.memory_id
          ? memoryObjects.find((record) => record.id === event.memory_id)
          : undefined;
        return {
          decision,
          memoryObject,
          writeEvent: projectMemoryEventToLegacyWriteEvent(event),
          supersessionLink: event.memory_id
            ? supersessionByReplacement.get(event.memory_id)
            : undefined,
        } satisfies StoreWriteResult;
      });
    });
  }

  async writeCapturedObject(input: StoredCaptureInput): Promise<StoreWriteResult> {
    const [result] = await this.writeCapturedObjects([input]);
    return result;
  }

  async writeCapturedObjects(inputs: StoredCaptureInput[]): Promise<StoreWriteResult[]> {
    return this.mmv2Repository.withTransaction(async (repository) => {
      const results: StoreWriteResult[] = [];

      for (const input of inputs) {
        const memoryObjects = await repository.listMemoryObjects();
        const durableMemories = await repository.listDurableMemories();
        const identity = deriveMemoryIdentity(input.object);
        const existingByIdentity = memoryObjects.find(
          (record) =>
            record.identityKey === identity.identityKey &&
            record.lifecycleState === "active" &&
            !record.supersededAt,
        );
        const existingBySlot = identity.slotKey
          ? memoryObjects.find(
              (record) =>
                record.slotKey === identity.slotKey &&
                record.lifecycleState === "active" &&
                !record.supersededAt,
            )
          : undefined;
        const targetDurable = existingByIdentity
          ? durableMemories.find((record) => record.memory_id === existingByIdentity.id)
          : undefined;
        const policy = decideWritePolicy({
          object: input.object,
          identity,
          sourceKind: input.sourceKind ?? "document",
          existingByIdentity: existingByIdentity
            ? mapExistingStoredObject(existingByIdentity)
            : undefined,
          existingBySlot: existingBySlot ? mapExistingStoredObject(existingBySlot) : undefined,
          targetAlreadyHasSourceSupport: hasMatchingSupport(targetDurable, input),
        });
        const createdAt = new Date();

        if (policy.decision === "ignore") {
          const event = buildEventForLegacyDecision({
            sourceWindowId: input.sourceWindowId,
            createdAt,
            decision: "reject",
            payload: { decision_codes: policy.decisionCodes },
          });
          await repository.insertMemoryEvent(event);
          results.push({
            decision: "ignore",
            writeEvent: projectMemoryEventToLegacyWriteEvent(event),
          });
          continue;
        }

        if (policy.decision === "attach_support") {
          const existingDurable = await repository.getDurableMemory(policy.memoryObjectId);
          if (!existingDurable) {
            throw new Error(
              `Missing durable memory for support attachment: ${policy.memoryObjectId}`,
            );
          }
          const sourceRef = adaptLegacyObjectToDurableMemory({
            memoryId: buildDeterministicUuid("mmv2-temp", input.sourceWindowId),
            object: input.object,
            sourceWindowId: input.sourceWindowId,
            sourceKind: input.sourceKind ?? "document",
            createdAt,
          }).source_refs[0];
          await repository.appendSourceRef(
            existingDurable.memory_id,
            sourceRef,
            createdAt.toISOString(),
          );
          if (policy.activateTargetObjectId) {
            await repository.markDurableMemoryStatus({
              memoryId: policy.activateTargetObjectId,
              status: "active",
              updatedAt: createdAt.toISOString(),
            });
          }
          const event = buildEventForLegacyDecision({
            sourceWindowId: input.sourceWindowId,
            createdAt,
            decision: "attach_support",
            memoryId: existingDurable.memory_id,
            payload: { decision_codes: policy.decisionCodes },
          });
          await repository.insertMemoryEvent(event);
          const supportItem: ModelMemorySupportItemRecord = {
            id: buildDeterministicUuid(
              "support",
              `${existingDurable.memory_id}:${input.sourceKind ?? "document"}:${input.sourceWindowId}`,
            ),
            memoryObjectId: existingDurable.memory_id,
            sourceWindowId: input.sourceWindowId,
            provenance: input.object.provenance,
            supportFingerprint: `${input.sourceKind ?? "document"}:${input.sourceWindowId}`,
            supportKind: policy.support.supportKind,
            countsForReinforcement: policy.support.countsForReinforcement,
            derivedFromSourceKind: input.sourceKind ?? "document",
            createdAt,
          };
          results.push({
            decision: "attach_support",
            supportItem,
            writeEvent: projectMemoryEventToLegacyWriteEvent(event),
          });
          continue;
        }

        const memoryId = buildDeterministicUuid("memory", identity.identityKey);
        const durableRecord = adaptLegacyObjectToDurableMemory({
          memoryId,
          object: input.object,
          sourceWindowId: input.sourceWindowId,
          sourceKind: input.sourceKind ?? "document",
          createdAt,
          status: mapPolicyToStatus(policy),
          supersedesMemoryIds: policy.decision === "supersede" ? [policy.supersededObjectId] : [],
        });
        await repository.upsertDurableMemory(durableRecord);

        let supersessionLink: ModelMemorySupersessionLinkRecord | undefined;
        let supersedeEdge: MemoryEdge | undefined;
        if (policy.decision === "supersede") {
          await repository.markDurableMemoryStatus({
            memoryId: policy.supersededObjectId,
            status: "superseded",
            updatedAt: createdAt.toISOString(),
            supersededByMemoryId: memoryId,
          });
          supersedeEdge = await repository.upsertMemoryEdge({
            edge_id: buildDeterministicUuid(
              "mmv2-edge",
              `${memoryId}:${policy.supersededObjectId}:supersedes`,
            ),
            schema_version: "memory_edge.v1",
            from_memory_id: memoryId,
            to_memory_id: policy.supersededObjectId,
            edge_type: "supersedes",
            created_at: createdAt.toISOString(),
            metadata: { source_window_id: input.sourceWindowId },
          });
          supersessionLink = projectMemoryEdgeToSupersessionLink(supersedeEdge);
        }

        const event = buildEventForLegacyDecision({
          sourceWindowId: input.sourceWindowId,
          createdAt,
          decision: policy.decision,
          memoryId,
          targetMemoryIds: policy.decision === "supersede" ? [policy.supersededObjectId] : [],
          payload: { decision_codes: policy.decisionCodes },
        });
        await repository.insertMemoryEvent(event);
        const memoryObject = (await repository.listMemoryObjects()).find(
          (record) => record.id === memoryId,
        );
        results.push({
          decision: policy.decision,
          memoryObject,
          writeEvent: projectMemoryEventToLegacyWriteEvent(event),
          supersessionLink,
        });
      }

      return results;
    });
  }

  snapshot() {
    return this.mmv2Repository.snapshot();
  }
}
