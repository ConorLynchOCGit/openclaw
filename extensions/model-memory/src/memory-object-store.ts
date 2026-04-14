import { buildDeterministicUuid } from "./deterministic-uuid.ts";
import { deriveMemoryIdentity, type MemoryIdentityDescriptor } from "./semantic-identity.ts";
import type { ModelMemoryObject } from "./semantic-schema.ts";
import type {
  ModelMemoryObjectRecord,
  ModelMemorySupersessionLinkRecord,
  ModelMemoryWriteEventRecord,
} from "./storage-database-contract.ts";
import {
  decideWritePolicy,
  type ExistingStoredObject,
  type WritePolicyDecision,
} from "./write-policy.ts";

export type StoredCaptureInput = {
  sourceWindowId: string;
  object: ModelMemoryObject;
  contractName: string;
  contractVersion: string;
  modelId: string;
};

export type StoreWriteResult = {
  decision: WritePolicyDecision["decision"];
  memoryObject?: ModelMemoryObjectRecord;
  writeEvent: ModelMemoryWriteEventRecord;
  supersessionLink?: ModelMemorySupersessionLinkRecord;
};

function buildDeterministicId(prefix: string, input: string): string {
  return buildDeterministicUuid(prefix, input);
}

function nowFromCounter(counter: number): Date {
  return new Date(counter * 1000);
}

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
    id: buildDeterministicId(
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
    id: buildDeterministicId(
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

export class InMemoryMemoryObjectStore {
  private memoryObjects: ModelMemoryObjectRecord[] = [];
  private writeEvents: ModelMemoryWriteEventRecord[] = [];
  private supersessionLinks: ModelMemorySupersessionLinkRecord[] = [];
  private clock = 1;

  writeCapturedObject(input: StoredCaptureInput): StoreWriteResult {
    const identity = deriveMemoryIdentity(input.object);
    const existingByIdentity = this.memoryObjects.find(
      (record) => !record.supersededAt && record.identityKey === identity.identityKey,
    );
    const existingBySlot = identity.slotKey
      ? this.memoryObjects.find(
          (record) => !record.supersededAt && record.slotKey === identity.slotKey,
        )
      : undefined;
    const policy = decideWritePolicy({
      object: input.object,
      identity,
      existingByIdentity: existingByIdentity
        ? extractStoredObjectShape(existingByIdentity)
        : undefined,
      existingBySlot: existingBySlot ? extractStoredObjectShape(existingBySlot) : undefined,
    });
    const createdAt = nowFromCounter(this.clock++);

    if (policy.decision === "ignore") {
      const writeEvent = buildWriteEventRecord(
        this.writeEvents.length,
        input,
        identity,
        policy,
        createdAt,
      );
      this.writeEvents.push(writeEvent);
      return {
        decision: policy.decision,
        writeEvent,
      };
    }

    if (policy.decision === "dedupe") {
      const writeEvent = buildWriteEventRecord(
        this.writeEvents.length,
        input,
        identity,
        policy,
        createdAt,
        policy.duplicateObjectId,
      );
      this.writeEvents.push(writeEvent);
      return {
        decision: policy.decision,
        writeEvent,
      };
    }

    const memoryObject = buildObjectRecord(input, identity, policy.executedReviewMode, createdAt);
    this.memoryObjects.push(memoryObject);

    let supersessionLink: ModelMemorySupersessionLinkRecord | undefined;
    if (policy.decision === "supersede") {
      const superseded = this.memoryObjects.find(
        (record) => record.id === policy.supersededObjectId,
      );
      if (superseded) {
        superseded.supersededAt = createdAt;
      }
      supersessionLink = {
        id: buildDeterministicId("supersession", `${policy.supersededObjectId}:${memoryObject.id}`),
        priorObjectId: policy.supersededObjectId,
        replacementObjectId: memoryObject.id,
        reasonCode: "slot_supersession",
        createdAt,
      };
      this.supersessionLinks.push(supersessionLink);
    }

    const writeEvent = buildWriteEventRecord(
      this.writeEvents.length,
      input,
      identity,
      policy,
      createdAt,
      memoryObject.id,
    );
    this.writeEvents.push(writeEvent);

    return {
      decision: policy.decision,
      memoryObject,
      writeEvent,
      supersessionLink,
    };
  }

  writeCapturedObjects(inputs: StoredCaptureInput[]): StoreWriteResult[] {
    return inputs.map((input) => this.writeCapturedObject(input));
  }

  snapshot() {
    return {
      memoryObjects: this.memoryObjects.map((record) => ({ ...record })),
      writeEvents: this.writeEvents.map((record) => ({ ...record })),
      supersessionLinks: this.supersessionLinks.map((record) => ({ ...record })),
    };
  }
}
