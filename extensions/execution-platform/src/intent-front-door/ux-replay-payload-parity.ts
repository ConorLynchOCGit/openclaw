import { createHash } from "node:crypto";
import { z } from "zod";
import type { JsonValue } from "../runtime-job-repository.ts";

const boundedString = (max: number) => z.string().trim().min(1).max(max);

export const UX_REPLAY_PAYLOAD_PARITY_SCHEMA_VERSION =
  "execution-platform.ux-replay-runtime-payload-parity.v1";

export const UX_REPLAY_PAYLOAD_ENVELOPE_VERSION =
  "execution-platform.ux-runtime-payload-envelope.v1";

export const UxReplayPayloadSubmissionSurfaceSchema = z.enum([
  "live_ux",
  "ux_prompt_file",
  "replay",
  "direct_native",
  "diagnostic_only",
]);

export type UxReplayPayloadSubmissionSurface = z.infer<
  typeof UxReplayPayloadSubmissionSurfaceSchema
>;

const falseFlags = {
  rawPromptStored: z.literal(false),
  rawResponseStored: z.literal(false),
  rawTranscriptStored: z.literal(false),
  rawProviderLogStored: z.literal(false),
  rawToolLogStored: z.literal(false),
  rawCommandLogStored: z.literal(false),
  rawDbRowsStored: z.literal(false),
  secretsStored: z.literal(false),
  deployRequested: z.literal(false),
  outboundSendRequested: z.literal(false),
  modelPromotionRequested: z.literal(false),
  authorityGranted: z.literal(false),
  controlsApplied: z.literal(false),
  workQueueLifecycleMutated: z.literal(false),
  runtimeLifecycleMutated: z.literal(false),
};

export const UxReplayPayloadOwnerPromptRefSchema = z
  .object({
    promptHash: boundedString(90),
    promptLength: z.number().int().min(1),
    sourcePromptRef: boundedString(320),
    promptFileRef: boundedString(320).nullable(),
    sourcePromptContextIndexRef: boundedString(320),
    sourcePromptResolutionStatus: z.enum(["resolved", "unresolved", "not_present", "unsupported"]),
    rawPromptStored: z.literal(false),
  })
  .strict();

export const UxReplayPayloadChatRefsSchema = z
  .object({
    sessionRef: boundedString(240).nullable(),
    conversationRef: boundedString(240).nullable(),
    turnRef: boundedString(240).nullable(),
    ownerTurnInFlightRef: boundedString(240).nullable(),
  })
  .strict();

export const UxReplayPayloadRouteRefsSchema = z
  .object({
    routeSelected: boundedString(120),
    workflowId: boundedString(180),
    executorWorkflowId: boundedString(180),
    jobType: boundedString(160),
    responseMode: boundedString(120),
    executeNow: z.boolean(),
    routerDecisionRef: boundedString(320),
    routerToolProtocolRef: boundedString(320).nullable(),
    routerToolInvocationRefs: z.array(boundedString(320)).max(40),
    requestCompilerRef: boundedString(320),
    missionLedgerHandoffRef: boundedString(320),
  })
  .strict();

export const UxReplayPayloadExecutionRefsSchema = z
  .object({
    runtimeJobId: boundedString(240).nullable(),
    runtimeJobPayloadHash: boundedString(90).nullable(),
    queueName: boundedString(120),
    workItemId: boundedString(240).nullable(),
    idempotencyScope: boundedString(240),
    idempotencyKeyHash: boundedString(90),
    graphId: boundedString(240).nullable(),
  })
  .strict();

export const UxReplayPayloadMissionLedgerRefsSchema = z
  .object({
    missionLedgerInputRef: boundedString(320),
    missionLedgerPromptHash: boundedString(90),
    missionLedgerRef: boundedString(320).nullable(),
    commitmentPacketInputRef: boundedString(320),
    commitmentPacketRef: boundedString(320).nullable(),
  })
  .strict();

export const UxReplayPayloadSchedulerRefsSchema = z
  .object({
    workflowDefinitionRef: boundedString(320),
    capabilityManifestRef: boundedString(320),
    schedulerHandoffRefs: z.array(boundedString(320)).min(1).max(40),
    graphCompilerRefs: z.array(boundedString(320)).max(40),
    acceptedGraphRef: boundedString(320).nullable(),
  })
  .strict();

export const UxReplayPayloadSafetyFlagsSchema = z.object(falseFlags).strict();

export const UxReplayPayloadParityEnvelopeSchema = z
  .object({
    artifactKind: z.literal("ux_replay_runtime_payload_parity_envelope"),
    schemaVersion: z.literal(UX_REPLAY_PAYLOAD_PARITY_SCHEMA_VERSION),
    payloadEnvelopeVersion: z.literal(UX_REPLAY_PAYLOAD_ENVELOPE_VERSION),
    submissionSurface: UxReplayPayloadSubmissionSurfaceSchema,
    diagnosticOnly: z.boolean(),
    ownerPrompt: UxReplayPayloadOwnerPromptRefSchema,
    chatRefs: UxReplayPayloadChatRefsSchema,
    routeRefs: UxReplayPayloadRouteRefsSchema,
    executionRefs: UxReplayPayloadExecutionRefsSchema,
    missionLedgerRefs: UxReplayPayloadMissionLedgerRefsSchema,
    schedulerRefs: UxReplayPayloadSchedulerRefsSchema,
    safetyStorageFlags: UxReplayPayloadSafetyFlagsSchema,
    parityHash: boundedString(90),
    reasonCodes: z.array(boundedString(180)).max(40),
  })
  .strict();

export type UxReplayPayloadParityEnvelope = z.infer<typeof UxReplayPayloadParityEnvelopeSchema>;

export type BuildUxReplayPayloadParityEnvelopeInput = Omit<
  UxReplayPayloadParityEnvelope,
  "artifactKind" | "schemaVersion" | "payloadEnvelopeVersion" | "parityHash" | "reasonCodes"
> & {
  reasonCodes?: string[];
};

export type UxReplayPayloadParityComparison = {
  artifactKind: "ux_replay_payload_parity_comparison";
  schemaVersion: typeof UX_REPLAY_PAYLOAD_PARITY_SCHEMA_VERSION;
  accepted: boolean;
  expectedSurface: UxReplayPayloadSubmissionSurface;
  actualSurface: UxReplayPayloadSubmissionSurface;
  expectedParityHash: string;
  actualParityHash: string;
  mismatchPaths: string[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawTranscriptStored: false;
  rawLogsStored: false;
};

export type UxReplayPayloadProofEligibility = {
  artifactKind: "ux_replay_payload_proof_eligibility";
  accepted: boolean;
  submissionSurface: UxReplayPayloadSubmissionSurface;
  parityHash: string;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawTranscriptStored: false;
  rawLogsStored: false;
};

export function buildUxReplayPayloadParityEnvelope(
  input: BuildUxReplayPayloadParityEnvelopeInput,
): UxReplayPayloadParityEnvelope {
  const base = {
    artifactKind: "ux_replay_runtime_payload_parity_envelope",
    schemaVersion: UX_REPLAY_PAYLOAD_PARITY_SCHEMA_VERSION,
    payloadEnvelopeVersion: UX_REPLAY_PAYLOAD_ENVELOPE_VERSION,
    ...input,
    parityHash: "pending",
    reasonCodes: [
      ...(input.reasonCodes ?? []),
      `submission_surface:${input.submissionSurface}`,
      input.diagnosticOnly ? "diagnostic_only_payload" : "production_proof_payload",
    ].slice(0, 40),
  } satisfies UxReplayPayloadParityEnvelope;
  const parityHash = hashJson(normalizeUxReplayPayloadForParity(base));
  return UxReplayPayloadParityEnvelopeSchema.parse({ ...base, parityHash });
}

export function normalizeUxReplayPayloadForParity(
  envelope: UxReplayPayloadParityEnvelope,
): JsonValue {
  return {
    payloadEnvelopeVersion: envelope.payloadEnvelopeVersion,
    proofCriticalPrompt: {
      promptHash: envelope.ownerPrompt.promptHash,
      promptLength: envelope.ownerPrompt.promptLength,
      sourcePromptRef: envelope.ownerPrompt.sourcePromptRef,
      promptFileRef: envelope.ownerPrompt.promptFileRef,
      sourcePromptContextIndexRef: envelope.ownerPrompt.sourcePromptContextIndexRef,
      sourcePromptResolutionStatus: envelope.ownerPrompt.sourcePromptResolutionStatus,
    },
    route: {
      routeSelected: envelope.routeRefs.routeSelected,
      workflowId: envelope.routeRefs.workflowId,
      executorWorkflowId: envelope.routeRefs.executorWorkflowId,
      jobType: envelope.routeRefs.jobType,
      responseMode: envelope.routeRefs.responseMode,
      executeNow: envelope.routeRefs.executeNow,
      routerToolProtocolRef: envelope.routeRefs.routerToolProtocolRef,
      routerToolInvocationRefs: envelope.routeRefs.routerToolInvocationRefs,
      missionLedgerHandoffRef: envelope.routeRefs.missionLedgerHandoffRef,
    },
    execution: {
      queueName: envelope.executionRefs.queueName,
      workItemId: envelope.executionRefs.workItemId,
      idempotencyScope: envelope.executionRefs.idempotencyScope,
      idempotencyKeyHash: envelope.executionRefs.idempotencyKeyHash,
    },
    missionLedger: envelope.missionLedgerRefs,
    scheduler: {
      workflowDefinitionRef: envelope.schedulerRefs.workflowDefinitionRef,
      capabilityManifestRef: envelope.schedulerRefs.capabilityManifestRef,
      schedulerHandoffRefs: envelope.schedulerRefs.schedulerHandoffRefs,
      graphCompilerRefs: envelope.schedulerRefs.graphCompilerRefs,
    },
    safetyStorageFlags: envelope.safetyStorageFlags,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawLogsStored: false,
  } satisfies JsonValue;
}

export function compareUxReplayPayloadParity(input: {
  expected: UxReplayPayloadParityEnvelope;
  actual: UxReplayPayloadParityEnvelope;
}): UxReplayPayloadParityComparison {
  const expected = UxReplayPayloadParityEnvelopeSchema.parse(input.expected);
  const actual = UxReplayPayloadParityEnvelopeSchema.parse(input.actual);
  const expectedNormalized = normalizeUxReplayPayloadForParity(expected);
  const actualNormalized = normalizeUxReplayPayloadForParity(actual);
  const mismatchPaths = collectMismatchPaths(expectedNormalized, actualNormalized);
  const accepted =
    mismatchPaths.length === 0 &&
    validateUxReplayPayloadProofEligibility(actual).accepted &&
    !expected.diagnosticOnly;
  return {
    artifactKind: "ux_replay_payload_parity_comparison",
    schemaVersion: UX_REPLAY_PAYLOAD_PARITY_SCHEMA_VERSION,
    accepted,
    expectedSurface: expected.submissionSurface,
    actualSurface: actual.submissionSurface,
    expectedParityHash: expected.parityHash,
    actualParityHash: actual.parityHash,
    mismatchPaths,
    reasonCodes: [
      ...(accepted ? ["ux_replay_payload_parity_accepted"] : ["ux_replay_payload_parity_rejected"]),
      ...(mismatchPaths.length > 0
        ? mismatchPaths.map((path) => `parity_mismatch:${path}`).slice(0, 20)
        : ["proof_critical_fields_match"]),
      ...validateUxReplayPayloadProofEligibility(actual).reasonCodes,
    ].slice(0, 40),
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawLogsStored: false,
  };
}

export function validateUxReplayPayloadProofEligibility(
  envelope: UxReplayPayloadParityEnvelope,
): UxReplayPayloadProofEligibility {
  const parsed = UxReplayPayloadParityEnvelopeSchema.parse(envelope);
  const missing = [
    parsed.ownerPrompt.sourcePromptRef ? null : "source_prompt_ref_missing",
    parsed.ownerPrompt.sourcePromptContextIndexRef
      ? null
      : "source_prompt_context_index_ref_missing",
    parsed.routeRefs.routerDecisionRef ? null : "router_decision_ref_missing",
    parsed.routeRefs.requestCompilerRef ? null : "request_compiler_ref_missing",
    parsed.routeRefs.missionLedgerHandoffRef ? null : "mission_ledger_handoff_ref_missing",
    parsed.missionLedgerRefs.missionLedgerInputRef ? null : "mission_ledger_input_ref_missing",
    parsed.missionLedgerRefs.commitmentPacketInputRef
      ? null
      : "commitment_packet_input_ref_missing",
    parsed.schedulerRefs.schedulerHandoffRefs.length > 0 ? null : "scheduler_handoff_refs_missing",
  ].filter((code): code is string => Boolean(code));
  const surfaceAllowed =
    parsed.submissionSurface === "live_ux" ||
    parsed.submissionSurface === "ux_prompt_file" ||
    parsed.submissionSurface === "replay";
  const accepted = surfaceAllowed && !parsed.diagnosticOnly && missing.length === 0;
  return {
    artifactKind: "ux_replay_payload_proof_eligibility",
    accepted,
    submissionSurface: parsed.submissionSurface,
    parityHash: parsed.parityHash,
    reasonCodes: [
      ...(accepted ? ["ux_replay_payload_proof_eligible"] : ["ux_replay_payload_proof_ineligible"]),
      ...(surfaceAllowed ? [] : [`surface_not_proof_eligible:${parsed.submissionSurface}`]),
      ...(parsed.diagnosticOnly ? ["diagnostic_only_payload_not_proof_eligible"] : []),
      ...missing,
    ].slice(0, 40),
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawLogsStored: false,
  };
}

export function summarizeUxReplayPayloadParityEnvelope(
  envelope: UxReplayPayloadParityEnvelope,
): JsonValue {
  return {
    artifactKind: envelope.artifactKind,
    schemaVersion: envelope.schemaVersion,
    submissionSurface: envelope.submissionSurface,
    diagnosticOnly: envelope.diagnosticOnly,
    parityHash: envelope.parityHash,
    promptHash: envelope.ownerPrompt.promptHash,
    promptLength: envelope.ownerPrompt.promptLength,
    sourcePromptRef: envelope.ownerPrompt.sourcePromptRef,
    sourcePromptContextIndexRef: envelope.ownerPrompt.sourcePromptContextIndexRef,
    routeSelected: envelope.routeRefs.routeSelected,
    workflowId: envelope.routeRefs.workflowId,
    jobType: envelope.routeRefs.jobType,
    runtimeJobId: envelope.executionRefs.runtimeJobId,
    workItemId: envelope.executionRefs.workItemId,
    missionLedgerInputRef: envelope.missionLedgerRefs.missionLedgerInputRef,
    commitmentPacketInputRef: envelope.missionLedgerRefs.commitmentPacketInputRef,
    schedulerHandoffRefs: envelope.schedulerRefs.schedulerHandoffRefs,
    reasonCodes: envelope.reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawLogsStored: false,
  } satisfies JsonValue;
}

function collectMismatchPaths(left: unknown, right: unknown, path = "$"): string[] {
  if (Object.is(left, right)) {
    return [];
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) {
      return [path];
    }
    const maxLength = Math.max(left.length, right.length);
    return Array.from({ length: maxLength }, (_, index) =>
      collectMismatchPaths(left[index], right[index], `${path}[${index}]`),
    ).flat();
  }
  if (isRecord(left) || isRecord(right)) {
    if (!isRecord(left) || !isRecord(right)) {
      return [path];
    }
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].toSorted();
    return keys.flatMap((key) => collectMismatchPaths(left[key], right[key], `${path}.${key}`));
  }
  return [path];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hashJson(value: JsonValue): string {
  return createHash("sha256").update(stableStringify(value), "utf8").digest("hex");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .toSorted()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
