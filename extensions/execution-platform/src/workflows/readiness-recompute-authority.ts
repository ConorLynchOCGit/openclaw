import { createHash } from "node:crypto";
import type { JsonValue } from "../runtime-job-repository.ts";
import type {
  NodeExecutionContract,
  NodeExecutionPacket,
  NodeReadinessState,
} from "./node-resource-materialization.ts";

type JsonRecord = Record<string, unknown>;

function hashValue(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function stringArray(value: unknown, max = 80): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of value) {
    const normalized = stringValue(item);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(normalized);
    if (output.length >= max) {
      break;
    }
  }
  return output;
}

function unique(values: Array<string | null | undefined>, max = 80): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(normalized);
    if (output.length >= max) {
      break;
    }
  }
  return output;
}

function firstString(metadata: JsonRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = stringValue(metadata[key]);
    if (value) {
      return value;
    }
  }
  return null;
}

export type ReadinessProjectionFingerprint = {
  stateRef: string | null;
  readinessStatus: string | null;
  nodeExecutionContractRef: string | null;
  nodeExecutionContractHash: string | null;
  nodeExecutionPacketRef: string | null;
  nodeExecutionPacketHash: string | null;
  resourcePacketRef: string | null;
  resourcePacketHash: string | null;
  boundaryEpoch: string | null;
  lifecycleState: string | null;
  nextLegalTransitions: string[];
  contextLimitationWaiverRefs: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

export type ReadinessProjectionComparison = {
  artifactKind: "readiness_projection_comparison";
  schemaVersion: "execution-platform.readiness-projection-comparison.v1";
  nodeId: string;
  status: "current" | "stale" | "missing_projection";
  canUnlockExecution: boolean;
  stale: boolean;
  driftReasonCodes: string[];
  missingFields: string[];
  persisted: ReadinessProjectionFingerprint;
  current: ReadinessProjectionFingerprint;
  boundaryEpoch: string | null;
  currentBoundaryEpoch: string | null;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogStored: false;
  rawDbRowsStored: false;
  secretsStored: false;
};

export type ChildEpochEligibility = {
  artifactKind: "child_epoch_frontier_eligibility";
  schemaVersion: "execution-platform.child-epoch-frontier-eligibility.v1";
  nodeId: string;
  eligible: boolean;
  stale: boolean;
  boundaryEpoch: string | null;
  currentBoundaryEpoch: string | null;
  parentNodeId: string | null;
  parentContractHash: string | null;
  currentParentContractHash: string | null;
  parentResourcePacketHash: string | null;
  currentParentResourcePacketHash: string | null;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogStored: false;
  rawDbRowsStored: false;
  secretsStored: false;
};

export function hashReadinessProjectionPayload(value: unknown): string {
  return hashValue(value);
}

export function readinessFingerprintFromState(
  state: NodeReadinessState | null | undefined,
): ReadinessProjectionFingerprint {
  if (!state) {
    return {
      stateRef: null,
      readinessStatus: null,
      nodeExecutionContractRef: null,
      nodeExecutionContractHash: null,
      nodeExecutionPacketRef: null,
      nodeExecutionPacketHash: null,
      resourcePacketRef: null,
      resourcePacketHash: null,
      boundaryEpoch: null,
      lifecycleState: null,
      nextLegalTransitions: [],
      contextLimitationWaiverRefs: [],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    };
  }
  return {
    stateRef: state.stateRef,
    readinessStatus: state.readinessStatus,
    nodeExecutionContractRef: state.nodeExecutionContractRef,
    nodeExecutionContractHash: state.nodeExecutionContractHash,
    nodeExecutionPacketRef: state.nodeExecutionPacketRef,
    nodeExecutionPacketHash: state.nodeExecutionPacketHash,
    resourcePacketRef: state.domainResourcePacketRef ?? state.resourcePacketRef,
    resourcePacketHash: state.domainResourcePacketHash,
    boundaryEpoch: state.boundaryEpoch,
    lifecycleState: state.lifecycleState,
    nextLegalTransitions: state.nextLegalTransitions,
    contextLimitationWaiverRefs: state.contextLimitationWaiverRefs,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

export function readinessFingerprintFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): ReadinessProjectionFingerprint {
  const record = asRecord(metadata);
  const nestedState = asRecord(record.nodeReadinessState);
  return {
    stateRef: firstString(record, ["nodeReadinessStateRef", "stateRef"]),
    readinessStatus: firstString(record, ["nodeReadinessStatus", "readinessStatus"]),
    nodeExecutionContractRef: firstString(record, [
      "nodeExecutionContractRef",
      "contractRef",
      "nodeExecutionContract",
    ]),
    nodeExecutionContractHash: firstString(record, [
      "nodeExecutionContractHash",
      "contractHash",
    ]),
    nodeExecutionPacketRef: firstString(record, ["nodeExecutionPacketRef", "packetRef"]),
    nodeExecutionPacketHash: firstString(record, [
      "nodeExecutionPacketHash",
      "nodeExecutionPacketContentHash",
    ]),
    resourcePacketRef: firstString(record, [
      "resourcePacketRef",
      "domainResourcePacketRef",
      "codingResourcePacketRef",
    ]),
    resourcePacketHash: firstString(record, [
      "resourcePacketHash",
      "domainResourcePacketHash",
      "codingResourcePacketHash",
    ]),
    boundaryEpoch: firstString(record, [
      "boundaryEpoch",
      "childBoundaryEpoch",
      "currentBoundaryEpoch",
    ]),
    lifecycleState: firstString(record, ["nodeLifecycleState", "lifecycleState"]),
    nextLegalTransitions: unique([
      ...stringArray(record.nodeReadinessNextAllowedTransitions, 16),
      ...stringArray(record.nextLegalTransitions, 16),
      ...stringArray(nestedState.nextLegalTransitions, 16),
    ]),
    contextLimitationWaiverRefs: unique([
      ...stringArray(record.contextLimitationWaiverRefs, 40),
      ...stringArray(nestedState.contextLimitationWaiverRefs, 40),
    ]),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

export function currentReadinessFingerprint(input: {
  state: NodeReadinessState;
  nodeExecutionContract?: NodeExecutionContract | null;
  nodeExecutionPacket?: NodeExecutionPacket | null;
  resourcePacket?: JsonValue | null;
  boundaryEpoch?: string | null;
}): ReadinessProjectionFingerprint {
  const stateFingerprint = readinessFingerprintFromState(input.state);
  return {
    ...stateFingerprint,
    nodeExecutionContractRef:
      input.nodeExecutionContract?.contractRef ?? stateFingerprint.nodeExecutionContractRef,
    nodeExecutionContractHash:
      input.nodeExecutionContract?.contractHash ?? stateFingerprint.nodeExecutionContractHash,
    nodeExecutionPacketRef:
      input.nodeExecutionPacket?.packetRef ?? stateFingerprint.nodeExecutionPacketRef,
    nodeExecutionPacketHash:
      input.nodeExecutionPacket ? hashValue(input.nodeExecutionPacket) : stateFingerprint.nodeExecutionPacketHash,
    resourcePacketRef:
      stringValue(asRecord(input.resourcePacket).packetRef) ?? stateFingerprint.resourcePacketRef,
    resourcePacketHash:
      input.resourcePacket ? hashValue(input.resourcePacket) : stateFingerprint.resourcePacketHash,
    boundaryEpoch: input.boundaryEpoch ?? stateFingerprint.boundaryEpoch,
  };
}

export function compareReadinessProjectionToCurrent(input: {
  nodeId: string;
  persistedMetadata?: Record<string, unknown> | null;
  currentState: NodeReadinessState;
  nodeExecutionContract?: NodeExecutionContract | null;
  nodeExecutionPacket?: NodeExecutionPacket | null;
  resourcePacket?: JsonValue | null;
  boundaryEpoch?: string | null;
  currentBoundaryEpoch?: string | null;
}): ReadinessProjectionComparison {
  const persisted = readinessFingerprintFromMetadata(input.persistedMetadata);
  const current = currentReadinessFingerprint({
    state: input.currentState,
    nodeExecutionContract: input.nodeExecutionContract ?? null,
    nodeExecutionPacket: input.nodeExecutionPacket ?? null,
    resourcePacket: input.resourcePacket ?? null,
    boundaryEpoch: input.boundaryEpoch ?? input.currentBoundaryEpoch ?? null,
  });
  const missingFields: string[] = [];
  const reasonCodes: string[] = [];
  const hasProjection = Boolean(
    persisted.stateRef ||
      persisted.readinessStatus ||
      persisted.nodeExecutionPacketRef ||
      persisted.resourcePacketRef,
  );
  if (!hasProjection) {
    reasonCodes.push("readiness_projection_missing");
  }
  const requiredPersistedFields: Array<keyof ReadinessProjectionFingerprint> = [
    "stateRef",
    "readinessStatus",
    "nodeExecutionContractRef",
    "nodeExecutionContractHash",
    "nodeExecutionPacketRef",
    "nodeExecutionPacketHash",
    "resourcePacketRef",
    "resourcePacketHash",
  ];
  for (const field of requiredPersistedFields) {
    if (!persisted[field]) {
      missingFields.push(field);
    }
  }
  if ((input.currentBoundaryEpoch || current.boundaryEpoch) && !persisted.boundaryEpoch) {
    missingFields.push("boundaryEpoch");
  }
  for (const field of requiredPersistedFields) {
    const persistedValue = persisted[field];
    const currentValue = current[field];
    if (persistedValue && currentValue && persistedValue !== currentValue) {
      reasonCodes.push(`readiness_projection_${field}_mismatch`);
    }
  }
  if (
    persisted.boundaryEpoch &&
    (input.currentBoundaryEpoch ?? current.boundaryEpoch) &&
    persisted.boundaryEpoch !== (input.currentBoundaryEpoch ?? current.boundaryEpoch)
  ) {
    reasonCodes.push("readiness_projection_boundary_epoch_mismatch");
  }
  if (
    persisted.readinessStatus &&
    current.readinessStatus &&
    persisted.readinessStatus !== current.readinessStatus
  ) {
    reasonCodes.push("readiness_projection_status_mismatch");
  }
  const missingReasonCodes = missingFields.map(
    (field) => `readiness_projection_${field}_missing`,
  );
  const driftReasonCodes = unique([...reasonCodes, ...missingReasonCodes], 80);
  const currentReady =
    (current.readinessStatus === "ready" || current.readinessStatus === "ready_with_limitations") &&
    current.nextLegalTransitions.includes("execute_node");
  const stale = driftReasonCodes.length > 0;
  return {
    artifactKind: "readiness_projection_comparison",
    schemaVersion: "execution-platform.readiness-projection-comparison.v1",
    nodeId: input.nodeId,
    status: !hasProjection ? "missing_projection" : stale ? "stale" : "current",
    canUnlockExecution: hasProjection && !stale && currentReady,
    stale,
    driftReasonCodes,
    missingFields: unique(missingFields, 80),
    persisted,
    current,
    boundaryEpoch: persisted.boundaryEpoch ?? current.boundaryEpoch,
    currentBoundaryEpoch: input.currentBoundaryEpoch ?? current.boundaryEpoch,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
  };
}

export function projectReadinessDriftForReadback(
  comparison: ReadinessProjectionComparison | null | undefined,
): JsonValue {
  if (!comparison) {
    return null;
  }
  return {
    artifactKind: "readiness_projection_drift_readback",
    status: comparison.status,
    stale: comparison.stale,
    canUnlockExecution: comparison.canUnlockExecution,
    driftReasonCodes: comparison.driftReasonCodes,
    missingFields: comparison.missingFields,
    persistedStateRef: comparison.persisted.stateRef,
    currentStateRef: comparison.current.stateRef,
    boundaryEpoch: comparison.boundaryEpoch,
    currentBoundaryEpoch: comparison.currentBoundaryEpoch,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  } satisfies JsonValue;
}

export function evaluateChildEpochFrontierEligibility(input: {
  nodeId: string;
  nodeMetadata: Record<string, unknown>;
  graphMetadata?: Record<string, unknown> | null;
  currentBoundaryEpoch?: string | null;
  currentParentContractHash?: string | null;
  currentParentResourcePacketHash?: string | null;
}): ChildEpochEligibility {
  const metadata = input.nodeMetadata;
  const graphMetadata = asRecord(input.graphMetadata);
  const boundaryEpoch = firstString(metadata, [
    "boundaryEpoch",
    "childBoundaryEpoch",
    "replayBoundaryEpoch",
    "boundaryReplayEpoch",
  ]);
  const currentBoundaryEpoch =
    input.currentBoundaryEpoch ??
    firstString(metadata, ["currentBoundaryEpoch", "currentReplayBoundaryEpoch"]) ??
    firstString(graphMetadata, ["currentBoundaryEpoch", "boundaryEpoch", "boundaryReplayEpoch"]);
  const parentNodeId = firstString(metadata, [
    "parentNodeId",
    "replayParentNodeId",
    "boundaryReplayParentNodeId",
  ]);
  const parentContractHash = firstString(metadata, [
    "parentContractHash",
    "parentNodeExecutionContractHash",
  ]);
  const currentParentContractHash =
    input.currentParentContractHash ??
    firstString(metadata, ["currentParentContractHash", "currentParentNodeExecutionContractHash"]);
  const parentResourcePacketHash = firstString(metadata, [
    "parentResourcePacketHash",
    "parentDomainResourcePacketHash",
  ]);
  const currentParentResourcePacketHash =
    input.currentParentResourcePacketHash ??
    firstString(metadata, ["currentParentResourcePacketHash", "currentParentDomainResourcePacketHash"]);
  const explicitChildSurface = Boolean(
    boundaryEpoch ||
      parentNodeId ||
      booleanValue(metadata.boundaryReplayChild) === true ||
      booleanValue(metadata.replayChild) === true ||
      booleanValue(metadata.splitChildNode) === true,
  );
  const superseded =
    booleanValue(metadata.replayChildSuperseded) === true ||
    booleanValue(metadata.boundaryReplayChildSuperseded) === true ||
    booleanValue(metadata.nodeEpochSuperseded) === true ||
    booleanValue(metadata.childEpochSuperseded) === true;
  const reasonCodes = unique([
    ...(superseded ? ["child_epoch_superseded_not_executable"] : []),
    ...(explicitChildSurface && currentBoundaryEpoch && !boundaryEpoch
      ? ["child_epoch_missing"]
      : []),
    ...(boundaryEpoch && currentBoundaryEpoch && boundaryEpoch !== currentBoundaryEpoch
      ? ["child_epoch_boundary_epoch_mismatch"]
      : []),
    ...(parentContractHash &&
    currentParentContractHash &&
    parentContractHash !== currentParentContractHash
      ? ["child_epoch_parent_contract_hash_mismatch"]
      : []),
    ...(parentResourcePacketHash &&
    currentParentResourcePacketHash &&
    parentResourcePacketHash !== currentParentResourcePacketHash
      ? ["child_epoch_parent_resource_packet_hash_mismatch"]
      : []),
  ]);
  return {
    artifactKind: "child_epoch_frontier_eligibility",
    schemaVersion: "execution-platform.child-epoch-frontier-eligibility.v1",
    nodeId: input.nodeId,
    eligible: reasonCodes.length === 0,
    stale: reasonCodes.length > 0,
    boundaryEpoch,
    currentBoundaryEpoch,
    parentNodeId,
    parentContractHash,
    currentParentContractHash,
    parentResourcePacketHash,
    currentParentResourcePacketHash,
    reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
  };
}
