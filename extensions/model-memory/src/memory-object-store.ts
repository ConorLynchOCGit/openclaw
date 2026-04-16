import { buildDeterministicUuid } from "./deterministic-uuid.ts";
import { deriveMemoryIdentity, type MemoryIdentityDescriptor } from "./semantic-identity.ts";
import type { ModelMemoryObject } from "./semantic-schema.ts";
import type {
  ModelMemoryObjectRecord,
  ModelMemorySupportItemRecord,
  ModelMemorySupersessionLinkRecord,
  ModelMemoryWriteEventRecord,
  ModelMemorySourceKind,
} from "./storage-database-contract.ts";
import {
  decideWritePolicy,
  type ExistingStoredObject,
  type WritePolicyDecision,
} from "./write-policy.ts";

export type StoredCaptureInput = {
  sourceWindowId: string;
  sourceKind?: ModelMemorySourceKind;
  object: ModelMemoryObject;
  contractName: string;
  contractVersion: string;
  modelId: string;
};

export type StoreWriteResult = {
  decision: WritePolicyDecision["decision"];
  memoryObject?: ModelMemoryObjectRecord;
  supportItem?: ModelMemorySupportItemRecord;
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
    lifecycleState: record.lifecycleState,
  };
}

function buildObjectRecord(
  input: StoredCaptureInput,
  identity: MemoryIdentityDescriptor,
  policy: Extract<WritePolicyDecision, { decision: "write" | "supersede" }>,
  createdAt: Date,
): ModelMemoryObjectRecord {
  const activatedAt = policy.lifecycleState === "active" ? createdAt : undefined;
  return {
    id: buildDeterministicId("memory", identity.identityKey),
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
    lifecycleState: policy.lifecycleState,
    activationBasis: policy.activationBasis,
    confidence: input.object.confidence,
    durability: input.object.durability,
    suggestedReviewMode: input.object.reviewMode,
    executedReviewMode: policy.executedReviewMode,
    rationaleCodes: input.object.rationaleCodes ?? [],
    identityKey: identity.identityKey,
    slotKey: identity.slotKey,
    contractName: input.contractName,
    contractVersion: input.contractVersion,
    modelId: input.modelId,
    createdAt,
    activatedAt,
  };
}

function buildSupportFingerprint(input: StoredCaptureInput): string {
  return `${input.sourceKind ?? "document"}:${input.sourceWindowId}`;
}

function buildSupportItemRecord(
  memoryObjectId: string,
  input: StoredCaptureInput,
  policy: Extract<WritePolicyDecision, { decision: "attach_support" | "write" | "supersede" }>,
  createdAt: Date,
): ModelMemorySupportItemRecord {
  const supportFingerprint = buildSupportFingerprint(input);
  return {
    id: buildDeterministicId("support", `${memoryObjectId}:${supportFingerprint}`),
    memoryObjectId,
    sourceWindowId: input.sourceWindowId,
    provenance: input.object.provenance,
    supportFingerprint,
    supportKind: policy.support.supportKind,
    countsForReinforcement: policy.support.countsForReinforcement,
    derivedFromSourceKind: input.sourceKind ?? "document",
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
  supportItemId?: string,
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
    supportItemId,
    decisionCodes: policy.decisionCodes,
    contractName: input.contractName,
    contractVersion: input.contractVersion,
    modelId: input.modelId,
    createdAt,
  };
}

function findExistingSupport(
  supportItems: ModelMemorySupportItemRecord[],
  memoryObjectId: string,
  input: StoredCaptureInput,
): ModelMemorySupportItemRecord | undefined {
  const supportFingerprint = buildSupportFingerprint(input);
  return supportItems.find(
    (record) =>
      record.memoryObjectId === memoryObjectId && record.supportFingerprint === supportFingerprint,
  );
}

export class InMemoryMemoryObjectStore {
  private memoryObjects: ModelMemoryObjectRecord[] = [];
  private supportItems: ModelMemorySupportItemRecord[] = [];
  private writeEvents: ModelMemoryWriteEventRecord[] = [];
  private supersessionLinks: ModelMemorySupersessionLinkRecord[] = [];
  private clock = 1;

  writeCapturedObject(input: StoredCaptureInput): StoreWriteResult {
    const identity = deriveMemoryIdentity(input.object);
    const existingByIdentity = this.memoryObjects.find(
      (record) =>
        !record.supersededAt &&
        record.lifecycleState !== "expired" &&
        record.identityKey === identity.identityKey,
    );
    const existingBySlot = identity.slotKey
      ? this.memoryObjects.find(
          (record) =>
            !record.supersededAt &&
            record.lifecycleState !== "expired" &&
            record.slotKey === identity.slotKey,
        )
      : undefined;
    const targetForSupport = existingByIdentity;
    const policy = decideWritePolicy({
      object: input.object,
      identity,
      sourceKind: input.sourceKind ?? "document",
      existingByIdentity: existingByIdentity
        ? extractStoredObjectShape(existingByIdentity)
        : undefined,
      existingBySlot: existingBySlot ? extractStoredObjectShape(existingBySlot) : undefined,
      targetAlreadyHasSourceSupport: targetForSupport
        ? Boolean(findExistingSupport(this.supportItems, targetForSupport.id, input))
        : false,
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

    if (policy.decision === "attach_support") {
      const supportItem =
        findExistingSupport(this.supportItems, policy.memoryObjectId, input) ??
        buildSupportItemRecord(policy.memoryObjectId, input, policy, createdAt);
      if (!this.supportItems.some((record) => record.id === supportItem.id)) {
        this.supportItems.push(supportItem);
      }

      if (policy.activateTargetObjectId) {
        const existing = this.memoryObjects.find(
          (record) => record.id === policy.activateTargetObjectId,
        );
        if (existing) {
          existing.lifecycleState = "active";
          existing.activationBasis = policy.activationBasis ?? "support_attachment";
          existing.activatedAt = createdAt;
          existing.expiredAt = undefined;
        }
      }

      const writeEvent = buildWriteEventRecord(
        this.writeEvents.length,
        input,
        identity,
        policy,
        createdAt,
        policy.memoryObjectId,
        supportItem.id,
      );
      this.writeEvents.push(writeEvent);
      return {
        decision: policy.decision,
        supportItem,
        writeEvent,
      };
    }

    const memoryObject = buildObjectRecord(input, identity, policy, createdAt);
    this.memoryObjects.push(memoryObject);
    const supportItem = buildSupportItemRecord(memoryObject.id, input, policy, createdAt);
    this.supportItems.push(supportItem);

    let supersessionLink: ModelMemorySupersessionLinkRecord | undefined;
    if (policy.decision === "supersede") {
      const superseded = this.memoryObjects.find(
        (record) => record.id === policy.supersededObjectId,
      );
      if (superseded) {
        superseded.supersededAt = createdAt;
        superseded.lifecycleState = "superseded";
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
      supportItem.id,
    );
    this.writeEvents.push(writeEvent);

    return {
      decision: policy.decision,
      memoryObject,
      supportItem,
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
      supportItems: this.supportItems.map((record) => ({ ...record })),
      writeEvents: this.writeEvents.map((record) => ({ ...record })),
      supersessionLinks: this.supersessionLinks.map((record) => ({ ...record })),
    };
  }
}
