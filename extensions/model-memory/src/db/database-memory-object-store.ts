import { buildDeterministicUuid } from "../deterministic-uuid.ts";
import type { StoreWriteResult, StoredCaptureInput } from "../memory-object-store.ts";
import { deriveMemoryIdentity, type MemoryIdentityDescriptor } from "../semantic-identity.ts";
import type { ModelMemoryObject } from "../semantic-schema.ts";
import type {
  ModelMemoryObjectRecord,
  ModelMemorySupersessionLinkRecord,
  ModelMemoryWriteEventRecord,
} from "../storage-database-contract.ts";
import {
  decideWritePolicy,
  type ExistingStoredObject,
  type WritePolicyDecision,
} from "../write-policy.ts";
import { ModelMemoryCanonicalRepository } from "./canonical-repository.ts";

function extractStoredObjectShape(record: ModelMemoryObjectRecord): ExistingStoredObject {
  return {
    id: record.id,
    kind: record.kind as ModelMemoryObject["kind"],
    identityKey: record.identityKey,
    slotKey: record.slotKey,
  };
}

function buildObjectRecord(
  input: StoredCaptureInput,
  identity: MemoryIdentityDescriptor,
  executedReviewMode: "auto_accept",
  createdAt: Date,
): ModelMemoryObjectRecord {
  return {
    id: buildDeterministicUuid(
      "memory",
      `${input.sourceWindowId}:${identity.identityKey}:${input.contractVersion}`,
    ),
    sourceWindowId: input.sourceWindowId,
    canonicalClass: input.object.canonicalClass,
    kind: input.object.kind,
    payload: input.object.payload,
    normalizedSubject: identity.normalizedSubject,
    normalizedTitle: identity.normalizedTitle,
    normalizedSearchText: identity.normalizedSearchText,
    scope: input.object.scope ?? {},
    scopeKey: identity.scopeKey,
    provenance: input.object.provenance,
    confidence: input.object.confidence,
    durability: input.object.durability,
    suggestedReviewMode: input.object.reviewMode,
    executedReviewMode,
    rationaleCodes: input.object.rationaleCodes ?? [],
    identityKey: identity.identityKey,
    slotKey: identity.slotKey,
    contractName: input.contractName,
    contractVersion: input.contractVersion,
    modelId: input.modelId,
    createdAt,
  };
}

function buildWriteEventRecord(
  index: number,
  input: StoredCaptureInput,
  identity: MemoryIdentityDescriptor,
  policy: WritePolicyDecision,
  createdAt: Date,
  memoryObjectId?: string,
): ModelMemoryWriteEventRecord {
  return {
    id: buildDeterministicUuid(
      "write",
      `${index}:${input.sourceWindowId}:${identity.identityKey}:${policy.decision}`,
    ),
    sourceWindowId: input.sourceWindowId,
    candidateIdentityKey: identity.identityKey,
    decision: policy.decision,
    memoryObjectId,
    supersededObjectId: policy.decision === "supersede" ? policy.supersededObjectId : undefined,
    decisionCodes: policy.decisionCodes,
    contractName: input.contractName,
    contractVersion: input.contractVersion,
    modelId: input.modelId,
    createdAt,
  };
}

export class DatabaseMemoryObjectStore {
  private counter = 1;

  constructor(
    private readonly repository: ModelMemoryCanonicalRepository,
    private readonly createdAtFactory: () => Date = () => new Date(this.counter++ * 1000),
  ) {}

  async writeCapturedObject(input: StoredCaptureInput): Promise<StoreWriteResult> {
    return this.repository.withTransaction(async (repository) => {
      const identity = deriveMemoryIdentity(input.object);
      const existingByIdentity = await repository.findActiveMemoryObjectByIdentity(
        identity.identityKey,
      );
      const existingBySlot = identity.slotKey
        ? await repository.findActiveMemoryObjectBySlot(identity.slotKey)
        : undefined;
      const policy = decideWritePolicy({
        object: input.object,
        identity,
        existingByIdentity: existingByIdentity
          ? extractStoredObjectShape(existingByIdentity)
          : undefined,
        existingBySlot: existingBySlot ? extractStoredObjectShape(existingBySlot) : undefined,
      });
      const createdAt = this.createdAtFactory();
      const writeEventIndex = (await repository.listWriteEvents()).length;

      if (policy.decision === "ignore") {
        const writeEvent = await repository.insertWriteEvent(
          buildWriteEventRecord(writeEventIndex, input, identity, policy, createdAt),
        );
        return {
          decision: policy.decision,
          writeEvent,
        };
      }

      if (policy.decision === "dedupe") {
        const writeEvent = await repository.insertWriteEvent(
          buildWriteEventRecord(
            writeEventIndex,
            input,
            identity,
            policy,
            createdAt,
            policy.duplicateObjectId,
          ),
        );
        return {
          decision: policy.decision,
          writeEvent,
        };
      }

      const memoryObject = await repository.insertMemoryObject(
        buildObjectRecord(input, identity, policy.executedReviewMode, createdAt),
      );

      let supersessionLink: ModelMemorySupersessionLinkRecord | undefined;
      if (policy.decision === "supersede") {
        await repository.markMemoryObjectSuperseded(policy.supersededObjectId, createdAt);
        supersessionLink = await repository.insertSupersessionLink({
          id: buildDeterministicUuid(
            "supersession",
            `${policy.supersededObjectId}:${memoryObject.id}`,
          ),
          priorObjectId: policy.supersededObjectId,
          replacementObjectId: memoryObject.id,
          reasonCode: "slot_supersession",
          createdAt,
        });
      }

      const writeEvent = await repository.insertWriteEvent(
        buildWriteEventRecord(writeEventIndex, input, identity, policy, createdAt, memoryObject.id),
      );

      return {
        decision: policy.decision,
        memoryObject,
        writeEvent,
        supersessionLink,
      };
    });
  }

  async writeCapturedObjects(inputs: StoredCaptureInput[]): Promise<StoreWriteResult[]> {
    const results: StoreWriteResult[] = [];
    for (const input of inputs) {
      results.push(await this.writeCapturedObject(input));
    }
    return results;
  }

  snapshot() {
    return this.repository.snapshot();
  }
}
