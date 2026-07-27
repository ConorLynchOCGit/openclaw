// Checks whether a requester can read or mutate task-flow records.
import { createHash } from "node:crypto";
import { normalizeOptionalString } from "@openclaw/normalization-core/string-coerce";
import { deliveryContextKey } from "../utils/delivery-context.shared.js";
import type { DeliveryContext } from "../utils/delivery-context.types.js";
import {
  findLatestTaskFlowForOwnerKey,
  getTaskFlowById,
  listTaskFlowsForOwnerKey,
} from "./task-flow-registry.js";
import type { JsonValue, TaskFlowRecord, TaskFlowStatus } from "./task-flow-registry.types.js";

const ACTIVE_TASK_FLOW_STATUSES = new Set<TaskFlowStatus>([
  "queued",
  "running",
  "waiting",
  "blocked",
]);

const TERMINAL_TASK_FLOW_STATUSES = new Set<TaskFlowStatus>([
  "succeeded",
  "failed",
  "cancelled",
  "lost",
]);

type GoverningArtifact = {
  ref?: string;
  digest?: string;
};

const TASK_FLOW_CORRECTION_SCHEMA = "openclaw.taskflow.correction.v1";
const MAX_GOVERNING_ARTIFACTS = 8;
const MAX_GOVERNING_ARTIFACT_VALUE_CHARS = 512;

export type ManagedTaskFlowCloseoutHandoff = {
  stateJson: {
    continuitySchema: typeof TASK_FLOW_CORRECTION_SCHEMA;
    priorFlowId: string;
    priorFlowRevision: number;
    governingArtifactsDigest: string;
    governingArtifactCount: number;
  };
  governingArtifacts: GoverningArtifact[];
};

export type ManagedTaskFlowCloseoutHandoffValidation =
  | { valid: true }
  | {
      valid: false;
      code:
        | "invalid_handoff"
        | "not_found"
        | "not_terminal_managed"
        | "revision_conflict"
        | "handoff_not_authorized"
        | "artifact_mismatch";
    };

/** Reads a flow only when it belongs to the caller owner key. */
export function getTaskFlowByIdForOwner(params: {
  flowId: string;
  callerOwnerKey: string;
}): TaskFlowRecord | undefined {
  const flow = getTaskFlowById(params.flowId);
  return flow &&
    normalizeOptionalString(flow.ownerKey) === normalizeOptionalString(params.callerOwnerKey)
    ? flow
    : undefined;
}

export function listTaskFlowsForOwner(params: { callerOwnerKey: string }): TaskFlowRecord[] {
  const ownerKey = normalizeOptionalString(params.callerOwnerKey);
  return ownerKey ? listTaskFlowsForOwnerKey(ownerKey) : [];
}

export function findLatestTaskFlowForOwner(params: {
  callerOwnerKey: string;
}): TaskFlowRecord | undefined {
  const ownerKey = normalizeOptionalString(params.callerOwnerKey);
  return ownerKey ? findLatestTaskFlowForOwnerKey(ownerKey) : undefined;
}

function findLatestManagedTaskFlowForOwnerMatching(params: {
  callerOwnerKey: string;
  statuses: ReadonlySet<TaskFlowStatus>;
}): TaskFlowRecord | undefined {
  return listTaskFlowsForOwner({ callerOwnerKey: params.callerOwnerKey }).find(
    (flow) => flow.syncMode === "managed" && params.statuses.has(flow.status),
  );
}

function readCompactArtifactValue(value: JsonValue | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized && normalized.length <= MAX_GOVERNING_ARTIFACT_VALUE_CHARS
    ? normalized
    : undefined;
}

function collectGoverningArtifacts(
  value: JsonValue | undefined,
  artifacts: GoverningArtifact[] = [],
): GoverningArtifact[] {
  if (!value || typeof value !== "object" || artifacts.length >= MAX_GOVERNING_ARTIFACTS) {
    return artifacts;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectGoverningArtifacts(entry, artifacts);
      if (artifacts.length >= MAX_GOVERNING_ARTIFACTS) {
        break;
      }
    }
    return artifacts;
  }

  const ref = readCompactArtifactValue(value.ref ?? value.artifactRef);
  const digest = readCompactArtifactValue(value.digest ?? value.artifactDigest);
  if (ref || digest) {
    artifacts.push({ ...(ref ? { ref } : {}), ...(digest ? { digest } : {}) });
  }
  for (const key of Object.keys(value).toSorted()) {
    collectGoverningArtifacts(value[key], artifacts);
    if (artifacts.length >= MAX_GOVERNING_ARTIFACTS) {
      break;
    }
  }
  return artifacts;
}

function digestGoverningArtifacts(artifacts: GoverningArtifact[]): string {
  return createHash("sha256").update(JSON.stringify(artifacts)).digest("hex");
}

export function buildManagedTaskFlowCloseoutHandoffForOwner(params: {
  flowId: string;
  callerOwnerKey: string;
}): ManagedTaskFlowCloseoutHandoff | undefined {
  const flow = getTaskFlowByIdForOwner({
    flowId: params.flowId,
    callerOwnerKey: params.callerOwnerKey,
  });
  if (!flow || flow.syncMode !== "managed" || !TERMINAL_TASK_FLOW_STATUSES.has(flow.status)) {
    return undefined;
  }
  const governingArtifacts = collectGoverningArtifacts(flow.stateJson);
  return {
    stateJson: {
      continuitySchema: TASK_FLOW_CORRECTION_SCHEMA,
      priorFlowId: flow.flowId,
      priorFlowRevision: flow.revision,
      governingArtifactsDigest: digestGoverningArtifacts(governingArtifacts),
      governingArtifactCount: governingArtifacts.length,
    },
    governingArtifacts,
  };
}

function readCloseoutHandoffState(value: JsonValue):
  | {
      priorFlowId: string;
      priorFlowRevision: number;
      governingArtifactsDigest: string;
      governingArtifactCount: number;
    }
  | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const priorFlowId = normalizeOptionalString(value.priorFlowId);
  const priorFlowRevision = value.priorFlowRevision;
  const governingArtifactsDigest = normalizeOptionalString(value.governingArtifactsDigest);
  const governingArtifactCount = value.governingArtifactCount;
  if (
    value.continuitySchema !== TASK_FLOW_CORRECTION_SCHEMA ||
    !priorFlowId ||
    typeof priorFlowRevision !== "number" ||
    !Number.isInteger(priorFlowRevision) ||
    !governingArtifactsDigest ||
    !/^[a-f0-9]{64}$/u.test(governingArtifactsDigest) ||
    typeof governingArtifactCount !== "number" ||
    !Number.isInteger(governingArtifactCount) ||
    governingArtifactCount < 0 ||
    governingArtifactCount > MAX_GOVERNING_ARTIFACTS
  ) {
    return undefined;
  }
  return {
    priorFlowId,
    priorFlowRevision,
    governingArtifactsDigest,
    governingArtifactCount,
  };
}

export function findLatestActiveManagedTaskFlowForOwner(params: {
  callerOwnerKey: string;
}): TaskFlowRecord | undefined {
  return findLatestManagedTaskFlowForOwnerMatching({
    callerOwnerKey: params.callerOwnerKey,
    statuses: ACTIVE_TASK_FLOW_STATUSES,
  });
}

export function findLatestTerminalManagedTaskFlowForOwner(params: {
  callerOwnerKey: string;
}): TaskFlowRecord | undefined {
  return findLatestManagedTaskFlowForOwnerMatching({
    callerOwnerKey: params.callerOwnerKey,
    statuses: TERMINAL_TASK_FLOW_STATUSES,
  });
}

export function validateManagedTaskFlowCloseoutHandoffForOwner(params: {
  callerOwnerKey: string;
  requesterOrigin?: DeliveryContext;
  stateJson: JsonValue;
}): ManagedTaskFlowCloseoutHandoffValidation {
  if (!normalizeOptionalString(params.callerOwnerKey)) {
    return { valid: false, code: "handoff_not_authorized" };
  }
  const handoff = readCloseoutHandoffState(params.stateJson);
  if (!handoff) {
    return { valid: false, code: "invalid_handoff" };
  }
  const flow = getTaskFlowById(handoff.priorFlowId);
  if (!flow) {
    return { valid: false, code: "not_found" };
  }
  if (flow.syncMode !== "managed" || !TERMINAL_TASK_FLOW_STATUSES.has(flow.status)) {
    return { valid: false, code: "not_terminal_managed" };
  }
  if (flow.ownerKey !== params.callerOwnerKey) {
    return { valid: false, code: "handoff_not_authorized" };
  }
  if (flow.revision !== handoff.priorFlowRevision) {
    return { valid: false, code: "revision_conflict" };
  }
  const priorOriginKey = deliveryContextKey(flow.requesterOrigin);
  const callerOriginKey = deliveryContextKey(params.requesterOrigin);
  if (!priorOriginKey || priorOriginKey !== callerOriginKey) {
    return { valid: false, code: "handoff_not_authorized" };
  }
  const currentArtifacts = collectGoverningArtifacts(flow.stateJson);
  if (
    currentArtifacts.length !== handoff.governingArtifactCount ||
    digestGoverningArtifacts(currentArtifacts) !== handoff.governingArtifactsDigest
  ) {
    return { valid: false, code: "artifact_mismatch" };
  }
  return { valid: true };
}

export function resolveTaskFlowForLookupTokenForOwner(params: {
  token: string;
  callerOwnerKey: string;
}): TaskFlowRecord | undefined {
  const direct = getTaskFlowByIdForOwner({
    flowId: params.token,
    callerOwnerKey: params.callerOwnerKey,
  });
  if (direct) {
    return direct;
  }
  const normalizedToken = normalizeOptionalString(params.token);
  const normalizedCallerOwnerKey = normalizeOptionalString(params.callerOwnerKey);
  if (!normalizedToken || normalizedToken !== normalizedCallerOwnerKey) {
    return undefined;
  }
  return findLatestTaskFlowForOwner({ callerOwnerKey: normalizedCallerOwnerKey });
}
