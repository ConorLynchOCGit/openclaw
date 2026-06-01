import { createHash } from "node:crypto";

import type { JsonValue } from "../runtime-job-repository.ts";

export type RuntimeDiagnosticStorageFlags = {
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogStored: false;
  rawDbRowsStored: false;
  secretsStored: false;
};

export type ProviderResponseShapeDiagnostic = RuntimeDiagnosticStorageFlags & {
  artifactKind: "execution_platform.provider_response_shape_diagnostic";
  schemaVersion: "execution-platform.provider-response-shape-diagnostic.v1";
  diagnosticRef: string;
  modelRef: string | null;
  providerId: string | null;
  providerPath: string | null;
  providerRequestId: string | null;
  profileRef: string | null;
  taskClass: string | null;
  callSite: string | null;
  reasoningModeSent: string | null;
  responseFormatSent: string | null;
  parserMode: string | null;
  requestByteCount: number | null;
  maxOutputTokens: number | null;
  timeoutMs: number | null;
  timeoutState: string | null;
  providerStarted: boolean;
  preflightAccepted: boolean | null;
  preflightBlockingReason: string | null;
  httpStatus: number | null;
  latencyMs: number | null;
  nativeFinishReason: string | null;
  finishReason: string | null;
  choiceCount: number | null;
  bodyKeys: string[];
  choiceKeys: string[];
  messageKeys: string[];
  errorKeys: string[];
  contentLengthByChoice: number[];
  parsedContentLength: number | null;
  usageAvailable: boolean;
  usageUnavailableReason: string | null;
  retryNumber: number | null;
  concurrencySlot: string | null;
  inputBundleRef: string | null;
  inputBundleHash: string | null;
  outputHash: string | null;
  failureClass: string | null;
  reasonCodes: string[];
};

export type HeapPhaseSnapshot = RuntimeDiagnosticStorageFlags & {
  artifactKind: "execution_platform.heap_phase_snapshot";
  schemaVersion: "execution-platform.heap-phase-snapshot.v1";
  snapshotRef: string;
  phase: string;
  gateKind: string | null;
  graphId: string | null;
  nodeId: string | null;
  branchId: string | null;
  heapUsedBytes: number;
  heapTotalBytes: number;
  rssBytes: number;
  externalBytes: number;
  arrayBuffersBytes: number;
  graphNodeCount: number | null;
  graphEdgeCount: number | null;
  activeBranchCount: number | null;
  largestMetadataBytes: number | null;
  largestMetadataRef: string | null;
  largestArtifactBodyBytes: number | null;
  largestArtifactBodyRef: string | null;
  latestRunStateMetadataBytes: number | null;
  schedulerProgressMetadataBytes: number | null;
  workQueueProjectionMetadataBytes: number | null;
  providerRequestByteCount: number | null;
  reasonCodes: string[];
};

const FALSE_STORAGE_FLAGS: RuntimeDiagnosticStorageFlags = {
  rawPromptStored: false,
  rawResponseStored: false,
  rawProviderLogStored: false,
  rawToolLogStored: false,
  rawCommandLogStored: false,
  rawDbRowsStored: false,
  secretsStored: false,
};

function bounded(value: unknown, max = 260): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function boundedStrings(value: unknown, max = 24): string[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value.filter(
            (item): item is string => typeof item === "string" && item.trim().length > 0,
          ),
        ),
      ]
        .map((item) => item.trim().slice(0, 260))
        .slice(0, max)
    : [];
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : null;
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function hashJson(value: JsonValue): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function byteCount(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
}

function bodyKeys(value: unknown): string[] {
  const body = record(value);
  return body ? Object.keys(body).sort().slice(0, 24) : [];
}

function choiceShape(value: unknown): { choiceCount: number | null; choiceKeys: string[]; messageKeys: string[]; contentLengths: number[] } {
  const source = record(value);
  const choices = Array.isArray(source?.choices)
    ? source.choices.map((choice) => record(choice)).filter((choice): choice is Record<string, unknown> => Boolean(choice))
    : [];
  const firstChoice = choices[0] ?? null;
  const message = record(firstChoice?.message);
  const contentLengths = choices
    .map((choice) => {
      const text = record(choice.message)?.content;
      return typeof text === "string" ? text.length : null;
    })
    .filter((length): length is number => typeof length === "number");
  return {
    choiceCount: choices.length > 0 ? choices.length : null,
    choiceKeys: firstChoice ? Object.keys(firstChoice).sort().slice(0, 24) : [],
    messageKeys: message ? Object.keys(message).sort().slice(0, 24) : [],
    contentLengths,
  };
}

export function captureProviderResponseShapeDiagnostic(input: {
  diagnosticRef?: string | null;
  modelRef?: unknown;
  providerId?: unknown;
  providerPath?: unknown;
  providerRequestId?: unknown;
  profileRef?: unknown;
  taskClass?: unknown;
  callSite?: unknown;
  reasoningModeSent?: unknown;
  responseFormatSent?: unknown;
  parserMode?: unknown;
  requestByteCount?: unknown;
  maxOutputTokens?: unknown;
  timeoutMs?: unknown;
  timeoutState?: unknown;
  providerStarted?: unknown;
  preflightAccepted?: unknown;
  preflightBlockingReason?: unknown;
  httpStatus?: unknown;
  latencyMs?: unknown;
  nativeFinishReason?: unknown;
  finishReason?: unknown;
  choiceCount?: unknown;
  body?: unknown;
  bodyKeys?: unknown;
  choiceKeys?: unknown;
  messageKeys?: unknown;
  errorKeys?: unknown;
  contentLengthByChoice?: unknown;
  parsedContentLength?: unknown;
  usage?: unknown;
  usageUnavailableReason?: unknown;
  retryNumber?: unknown;
  concurrencySlot?: unknown;
  inputBundleRef?: unknown;
  inputBundleHash?: unknown;
  outputHash?: unknown;
  failureClass?: unknown;
  reasonCodes?: unknown;
}): ProviderResponseShapeDiagnostic {
  const shape = choiceShape(input.body);
  const diagnosticCore: JsonValue = {
    modelRef: bounded(input.modelRef, 260),
    providerId: bounded(input.providerId, 180),
    providerPath: bounded(input.providerPath, 180),
    profileRef: bounded(input.profileRef, 360),
    taskClass: bounded(input.taskClass, 160),
    callSite: bounded(input.callSite, 260),
    requestByteCount: numberOrNull(input.requestByteCount),
    retryNumber: numberOrNull(input.retryNumber),
  };
  const usageAvailable = Boolean(record(input.usage));
  return {
    artifactKind: "execution_platform.provider_response_shape_diagnostic",
    schemaVersion: "execution-platform.provider-response-shape-diagnostic.v1",
    diagnosticRef:
      bounded(input.diagnosticRef, 600) ??
      `provider-diagnostic://response-shape/${hashJson(diagnosticCore).slice(0, 24)}`,
    modelRef: bounded(input.modelRef, 260),
    providerId: bounded(input.providerId, 180),
    providerPath: bounded(input.providerPath, 180),
    providerRequestId: bounded(input.providerRequestId, 260),
    profileRef: bounded(input.profileRef, 360),
    taskClass: bounded(input.taskClass, 160),
    callSite: bounded(input.callSite, 260),
    reasoningModeSent: bounded(input.reasoningModeSent, 120),
    responseFormatSent: bounded(input.responseFormatSent, 160),
    parserMode: bounded(input.parserMode, 160),
    requestByteCount: numberOrNull(input.requestByteCount),
    maxOutputTokens: numberOrNull(input.maxOutputTokens),
    timeoutMs: numberOrNull(input.timeoutMs),
    timeoutState: bounded(input.timeoutState, 120),
    providerStarted: booleanOrNull(input.providerStarted) ?? true,
    preflightAccepted: booleanOrNull(input.preflightAccepted),
    preflightBlockingReason: bounded(input.preflightBlockingReason, 500),
    httpStatus: numberOrNull(input.httpStatus),
    latencyMs: numberOrNull(input.latencyMs),
    nativeFinishReason: bounded(input.nativeFinishReason, 160),
    finishReason: bounded(input.finishReason, 160),
    choiceCount: numberOrNull(input.choiceCount) ?? shape.choiceCount,
    bodyKeys: boundedStrings(input.bodyKeys, 24).length
      ? boundedStrings(input.bodyKeys, 24)
      : bodyKeys(input.body),
    choiceKeys: boundedStrings(input.choiceKeys, 24).length
      ? boundedStrings(input.choiceKeys, 24)
      : shape.choiceKeys,
    messageKeys: boundedStrings(input.messageKeys, 24).length
      ? boundedStrings(input.messageKeys, 24)
      : shape.messageKeys,
    errorKeys: boundedStrings(input.errorKeys, 24),
    contentLengthByChoice: Array.isArray(input.contentLengthByChoice)
      ? input.contentLengthByChoice
          .map((value) => numberOrNull(value))
          .filter((value): value is number => value !== null)
          .slice(0, 12)
      : shape.contentLengths.slice(0, 12),
    parsedContentLength: numberOrNull(input.parsedContentLength),
    usageAvailable,
    usageUnavailableReason:
      bounded(input.usageUnavailableReason, 260) ??
      (usageAvailable ? null : "provider_usage_unavailable_or_not_reported"),
    retryNumber: numberOrNull(input.retryNumber),
    concurrencySlot: bounded(input.concurrencySlot, 160),
    inputBundleRef: bounded(input.inputBundleRef, 600),
    inputBundleHash: bounded(input.inputBundleHash, 180),
    outputHash: bounded(input.outputHash, 180),
    failureClass: bounded(input.failureClass, 260),
    reasonCodes: boundedStrings(input.reasonCodes, 40),
    ...FALSE_STORAGE_FLAGS,
  };
}

export function captureHeapPhaseSnapshot(input: {
  snapshotRef?: string | null;
  phase: string;
  gateKind?: unknown;
  graphId?: unknown;
  nodeId?: unknown;
  branchId?: unknown;
  memoryUsage?: NodeJS.MemoryUsage;
  graphNodeCount?: unknown;
  graphEdgeCount?: unknown;
  activeBranchCount?: unknown;
  metadataObjects?: Array<{ ref?: string; value: unknown }>;
  artifactBodies?: Array<{ ref?: string; byteCount?: number | null; value?: unknown }>;
  latestRunStateMetadataBytes?: unknown;
  schedulerProgressMetadataBytes?: unknown;
  workQueueProjectionMetadataBytes?: unknown;
  providerRequestByteCount?: unknown;
  reasonCodes?: unknown;
}): HeapPhaseSnapshot {
  const memory = input.memoryUsage ?? process.memoryUsage();
  const largestMetadata = (input.metadataObjects ?? [])
    .map((item) => ({ ref: item.ref ?? null, bytes: byteCount(item.value) }))
    .sort((left, right) => right.bytes - left.bytes)[0];
  const largestBody = (input.artifactBodies ?? [])
    .map((item) => ({
      ref: item.ref ?? null,
      bytes: typeof item.byteCount === "number" ? Math.trunc(item.byteCount) : byteCount(item.value),
    }))
    .sort((left, right) => right.bytes - left.bytes)[0];
  const core: JsonValue = {
    phase: input.phase,
    gateKind: bounded(input.gateKind, 180),
    graphId: bounded(input.graphId, 260),
    nodeId: bounded(input.nodeId, 260),
  };
  return {
    artifactKind: "execution_platform.heap_phase_snapshot",
    schemaVersion: "execution-platform.heap-phase-snapshot.v1",
    snapshotRef:
      bounded(input.snapshotRef, 600) ??
      `heap-phase://execution-platform/${hashJson(core).slice(0, 24)}`,
    phase: bounded(input.phase, 180) ?? "unknown",
    gateKind: bounded(input.gateKind, 180),
    graphId: bounded(input.graphId, 260),
    nodeId: bounded(input.nodeId, 260),
    branchId: bounded(input.branchId, 260),
    heapUsedBytes: Math.trunc(memory.heapUsed),
    heapTotalBytes: Math.trunc(memory.heapTotal),
    rssBytes: Math.trunc(memory.rss),
    externalBytes: Math.trunc(memory.external),
    arrayBuffersBytes: Math.trunc(memory.arrayBuffers),
    graphNodeCount: numberOrNull(input.graphNodeCount),
    graphEdgeCount: numberOrNull(input.graphEdgeCount),
    activeBranchCount: numberOrNull(input.activeBranchCount),
    largestMetadataBytes: largestMetadata?.bytes ?? null,
    largestMetadataRef: bounded(largestMetadata?.ref, 600),
    largestArtifactBodyBytes: largestBody?.bytes ?? null,
    largestArtifactBodyRef: bounded(largestBody?.ref, 600),
    latestRunStateMetadataBytes: numberOrNull(input.latestRunStateMetadataBytes),
    schedulerProgressMetadataBytes: numberOrNull(input.schedulerProgressMetadataBytes),
    workQueueProjectionMetadataBytes: numberOrNull(input.workQueueProjectionMetadataBytes),
    providerRequestByteCount: numberOrNull(input.providerRequestByteCount),
    reasonCodes: boundedStrings(input.reasonCodes, 40),
    ...FALSE_STORAGE_FLAGS,
  };
}

export function assertDiagnosticManifestBounds(input: {
  label: string;
  value: JsonValue;
  maxBytes: number;
}): { label: string; byteCount: number; maxBytes: number; status: "ok" } {
  const byteLength = byteCount(input.value);
  if (byteLength > input.maxBytes) {
    throw new Error(
      `diagnostic_manifest_overflow:${input.label}:${byteLength}:${input.maxBytes}`,
    );
  }
  return {
    label: input.label,
    byteCount: byteLength,
    maxBytes: input.maxBytes,
    status: "ok",
  };
}
