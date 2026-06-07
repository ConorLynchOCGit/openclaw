import { createHash } from "node:crypto";
import { z } from "zod";
import type { JsonValue } from "../runtime-job-repository.ts";

export const MISSION_CONTRACT_LEDGER_SCHEMA_VERSION =
  "execution-platform.mission-contract-ledger.v1";
export const MISSION_CONTRACT_LEDGER_ARTIFACT_TYPE = "execution_platform.mission_contract_ledger";
export const MISSION_CONTRACT_EVALUATION_ARTIFACT_TYPE =
  "execution_platform.mission_contract_evaluation";

const boundedString = (max: number) => z.string().trim().min(1).max(max);
const optionalBoundedString = (max: number) => z.string().trim().max(max).nullable();
const stringList = (maxItems: number, maxChars = 260) =>
  z.array(boundedString(maxChars)).max(maxItems);

const MissionSafetyConstraintSchema = z
  .object({
    constraintId: boundedString(120),
    constraintText: boundedString(800),
    boundaryKind: z.enum([
      "authority",
      "storage",
      "lifecycle",
      "side_effect",
      "scope",
      "validation",
      "privacy",
      "security",
      "other",
    ]),
    evidenceRefs: stringList(12, 260),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
  })
  .strict();

const MissionStoragePolicySchema = z
  .object({
    rawPromptStorageAllowed: z.literal(false),
    rawResponseStorageAllowed: z.literal(false),
    rawTranscriptStorageAllowed: z.literal(false),
    rawProviderLogStorageAllowed: z.literal(false),
    rawToolLogStorageAllowed: z.literal(false),
    rawDbRowStorageAllowed: z.literal(false),
    secretsStorageAllowed: z.literal(false),
    boundedRefsOnly: z.literal(true),
  })
  .strict();

const MissionLifecycleBoundarySchema = z
  .object({
    workQueueLifecycleMutationAllowed: z.literal(false),
    deployAllowed: z.literal(false),
    outboundSendAllowed: z.literal(false),
    modelPromotionAllowed: z.literal(false),
    runtimeJobLifecycleOwner: z.literal("runtime_jobs"),
  })
  .strict();

export const MissionCommitmentStatusSchema = z.enum([
  "pending",
  "satisfied",
  "partially_satisfied",
  "impossible",
  "needs_review",
]);

export type MissionCommitmentStatus = z.infer<typeof MissionCommitmentStatusSchema>;

export const MissionCommitmentSchema = z
  .object({
    commitmentId: boundedString(120),
    commitmentText: boundedString(1_200),
    whyItMatters: boundedString(800),
    expectedEvidenceDescription: boundedString(900),
    sourceAnchorRefs: stringList(24, 360).optional(),
    sourceSpanRefs: stringList(24, 420).optional(),
    lexicalAnchors: stringList(24, 180).optional(),
    acceptedEvidenceRefs: stringList(20, 260),
    rejectedEvidenceRefs: stringList(20, 260),
    status: MissionCommitmentStatusSchema,
    rationale: optionalBoundedString(1_000),
    remainingWork: stringList(12, 500),
    blocking: z.boolean(),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
  })
  .strict();

export type MissionCommitment = z.infer<typeof MissionCommitmentSchema>;

export const MissionContractRevisionProposalSchema = z
  .object({
    revisionId: boundedString(120),
    proposedBy: boundedString(120),
    rationale: boundedString(1_000),
    affectedCommitmentIds: stringList(12, 120),
    proposedCommitmentTexts: stringList(20, 1_000),
    status: z.enum(["proposed", "accepted", "rejected", "needs_review"]),
    evidenceRefs: stringList(20, 260),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
  })
  .strict();

export const MissionContractLedgerSchema = z
  .object({
    artifactKind: z.literal("mission_contract_ledger"),
    schemaVersion: z.literal(MISSION_CONTRACT_LEDGER_SCHEMA_VERSION),
    missionId: boundedString(160),
    sourceRuntimeJobId: optionalBoundedString(180),
    sourceWorkItemId: optionalBoundedString(180),
    ownerObjectiveSummary: boundedString(2_000),
    blockingCommitments: z.array(MissionCommitmentSchema).max(30),
    nonBlockingCommitments: z.array(MissionCommitmentSchema).max(30),
    explicitNonGoals: stringList(20, 600),
    safetyConstraints: z.array(MissionSafetyConstraintSchema).max(30).default([]),
    storagePolicy: MissionStoragePolicySchema.default({
      rawPromptStorageAllowed: false,
      rawResponseStorageAllowed: false,
      rawTranscriptStorageAllowed: false,
      rawProviderLogStorageAllowed: false,
      rawToolLogStorageAllowed: false,
      rawDbRowStorageAllowed: false,
      secretsStorageAllowed: false,
      boundedRefsOnly: true,
    }),
    lifecycleBoundary: MissionLifecycleBoundarySchema.default({
      workQueueLifecycleMutationAllowed: false,
      deployAllowed: false,
      outboundSendAllowed: false,
      modelPromotionAllowed: false,
      runtimeJobLifecycleOwner: "runtime_jobs",
    }),
    revisionProposals: z.array(MissionContractRevisionProposalSchema).max(12),
    ledgerStatus: z.enum(["pending", "satisfied", "needs_review"]),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    workQueueLifecycleMutated: z.literal(false),
  })
  .strict();

export type MissionContractLedger = z.infer<typeof MissionContractLedgerSchema>;

export const MissionCommitmentEvaluationSchema = z
  .object({
    artifactKind: z.literal("mission_commitment_evaluation"),
    schemaVersion: z.literal(MISSION_CONTRACT_LEDGER_SCHEMA_VERSION),
    evaluationId: boundedString(160),
    missionId: boundedString(160),
    commitmentUpdates: z
      .array(
        z
          .object({
            commitmentId: boundedString(120),
            status: MissionCommitmentStatusSchema,
            acceptedEvidenceRefs: stringList(20, 260),
            rejectedEvidenceRefs: stringList(20, 260),
            rationale: boundedString(1_000),
            remainingWork: stringList(12, 500),
          })
          .strict(),
      )
      .max(30),
    revisionProposals: z.array(MissionContractRevisionProposalSchema).max(12),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    workQueueLifecycleMutated: z.literal(false),
  })
  .strict();

export type MissionCommitmentEvaluation = z.infer<typeof MissionCommitmentEvaluationSchema>;

export const MISSION_LEDGER_NATIVE_TOOL_IDS = [
  "mission.add_blocking_commitment",
  "mission.add_nonblocking_commitment",
  "mission.add_non_goal",
  "mission.add_safety_constraint",
  "mission.attach_source_anchor",
  "mission.attach_source_span",
  "mission.attach_lexical_anchor",
] as const;

export type MissionLedgerNativeToolId = (typeof MISSION_LEDGER_NATIVE_TOOL_IDS)[number];

export type MissionLedgerNativeToolDefinition = {
  name: string;
  canonicalToolId: MissionLedgerNativeToolId;
  description: string;
  inputSchema: JsonValue;
};

export type MissionLedgerToolCall = {
  tool: MissionLedgerNativeToolId;
  input: Record<string, unknown>;
};

export type MissionLedgerToolCompileResult = {
  status: "accepted" | "blocked";
  ledger: MissionContractLedger | null;
  draft: Record<string, unknown>;
  appliedToolNames: string[];
  rejectedToolCalls: JsonValue[];
  missingFields: string[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

export type MissionContractLedgerSummary = {
  missionId: string;
  ledgerStatus: MissionContractLedger["ledgerStatus"];
  blockingCommitmentCount: number;
  openBlockingCommitmentCount: number;
  safetyConstraintCount: number;
  commitments: Array<{
    commitmentId: string;
    commitmentText: string;
    expectedEvidenceDescription: string;
    status: MissionCommitmentStatus;
    blocking: boolean;
    acceptedEvidenceRefs: string[];
    remainingWork: string[];
    sourceAnchorRefs?: string[];
    sourceSpanRefs?: string[];
    lexicalAnchors?: string[];
  }>;
  rawPromptStored: false;
  rawResponseStored: false;
};

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function uniqueStringList(values: Array<string | null | undefined>, max = 30): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const next = typeof value === "string" ? bounded(value, 900) : "";
    if (!next || seen.has(next)) {
      continue;
    }
    seen.add(next);
    output.push(next);
    if (output.length >= max) {
      break;
    }
  }
  return output;
}

export function missionLedgerProviderToolName(toolId: string): string {
  return toolId.replace(/[^a-zA-Z0-9_-]/gu, "_").slice(0, 64);
}

export function missionLedgerCanonicalToolIdFromProviderName(
  providerToolName: string,
): MissionLedgerNativeToolId | null {
  for (const toolId of MISSION_LEDGER_NATIVE_TOOL_IDS) {
    if (missionLedgerProviderToolName(toolId) === providerToolName) {
      return toolId;
    }
  }
  return null;
}

function missionLedgerStringArraySchema(): JsonValue {
  return { type: "array", items: { type: "string" } };
}

function missionLedgerEnumSchema(values: readonly string[]): JsonValue {
  return { type: "string", enum: [...values] };
}

function missionLedgerToolRequiredFields(toolId: MissionLedgerNativeToolId): string[] {
  const fields: Record<MissionLedgerNativeToolId, string[]> = {
    "mission.add_blocking_commitment": [
      "commitmentId",
      "commitmentText",
      "whyItMatters",
      "expectedEvidenceDescription",
    ],
    "mission.add_nonblocking_commitment": [
      "commitmentId",
      "commitmentText",
      "whyItMatters",
      "expectedEvidenceDescription",
    ],
    "mission.add_non_goal": ["nonGoal"],
    "mission.add_safety_constraint": ["constraintId", "constraintText", "boundaryKind"],
    "mission.attach_source_anchor": ["commitmentId", "sourceAnchorRef"],
    "mission.attach_source_span": ["commitmentId", "sourceSpanRef"],
    "mission.attach_lexical_anchor": ["commitmentId", "lexicalAnchor"],
  };
  return fields[toolId];
}

function missionLedgerToolProperties(toolId: MissionLedgerNativeToolId): Record<string, JsonValue> {
  const properties: Record<string, JsonValue> = {
    reasonCodes: missionLedgerStringArraySchema(),
  };
  if (
    toolId === "mission.add_blocking_commitment" ||
    toolId === "mission.add_nonblocking_commitment"
  ) {
    properties.commitmentId = { type: "string" };
    properties.commitmentText = { type: "string" };
    properties.whyItMatters = { type: "string" };
    properties.expectedEvidenceDescription = { type: "string" };
    properties.remainingWork = missionLedgerStringArraySchema();
    properties.sourceAnchorRefs = missionLedgerStringArraySchema();
    properties.sourceSpanRefs = missionLedgerStringArraySchema();
    properties.lexicalAnchors = missionLedgerStringArraySchema();
  }
  if (toolId === "mission.add_non_goal") {
    properties.nonGoal = { type: "string" };
  }
  if (toolId === "mission.add_safety_constraint") {
    properties.constraintId = { type: "string" };
    properties.constraintText = { type: "string" };
    properties.boundaryKind = missionLedgerEnumSchema(
      MissionSafetyConstraintSchema.shape.boundaryKind.options,
    );
    properties.evidenceRefs = missionLedgerStringArraySchema();
  }
  if (toolId === "mission.attach_source_anchor") {
    properties.commitmentId = { type: "string" };
    properties.sourceAnchorRef = { type: "string" };
  }
  if (toolId === "mission.attach_source_span") {
    properties.commitmentId = { type: "string" };
    properties.sourceSpanRef = { type: "string" };
  }
  if (toolId === "mission.attach_lexical_anchor") {
    properties.commitmentId = { type: "string" };
    properties.lexicalAnchor = { type: "string" };
  }
  return properties;
}

export function missionLedgerNativeToolDefinitions(
  allowedToolIds: readonly MissionLedgerNativeToolId[],
): MissionLedgerNativeToolDefinition[] {
  return allowedToolIds.map((toolId) => ({
    name: missionLedgerProviderToolName(toolId),
    canonicalToolId: toolId,
    description: `Author one Mission Ledger small verb through ${toolId}. Runtime applies the tool to the canonical ledger draft and validates structure only.`,
    inputSchema: {
      type: "object",
      additionalProperties: true,
      properties: missionLedgerToolProperties(toolId),
      required: missionLedgerToolRequiredFields(toolId),
    },
  }));
}

export function missionLedgerToolCallFromNativeToolCall(input: {
  providerToolName: string;
  toolArguments: Record<string, unknown>;
}): MissionLedgerToolCall | null {
  const tool = missionLedgerCanonicalToolIdFromProviderName(input.providerToolName);
  return tool ? { tool, input: input.toolArguments } : null;
}

function missionLedgerCallsFromOutputs(outputs: unknown[]): MissionLedgerToolCall[] {
  const calls: MissionLedgerToolCall[] = [];
  for (const output of outputs) {
    const record = asRecord(output);
    const candidates = [record.missionLedgerToolCalls, record.toolCalls, record.actions];
    for (const candidate of candidates) {
      if (!Array.isArray(candidate)) {
        continue;
      }
      for (const raw of candidate) {
        const rawRecord = asRecord(raw);
        const tool = stringValue(rawRecord.tool ?? rawRecord.toolId ?? rawRecord.name, "", 120);
        if (MISSION_LEDGER_NATIVE_TOOL_IDS.includes(tool as MissionLedgerNativeToolId)) {
          calls.push({
            tool: tool as MissionLedgerNativeToolId,
            input: { ...asRecord(rawRecord.input), ...rawRecord },
          });
        }
      }
    }
  }
  return calls;
}

function missionLedgerDraftMissingFields(draft: Record<string, unknown>): string[] {
  const missing: string[] = [];
  const blockingCommitments = Array.isArray(draft.blockingCommitments)
    ? draft.blockingCommitments
    : [];
  if (blockingCommitments.length === 0) {
    missing.push("blockingCommitments");
  }
  for (const commitment of blockingCommitments) {
    const record = asRecord(commitment);
    const commitmentId = stringValue(record.commitmentId, "unknown", 120);
    const sourceAnchors = stringArray(record.sourceAnchorRefs, 24, 360);
    const sourceSpans = stringArray(record.sourceSpanRefs, 24, 420);
    const lexicalAnchors = stringArray(record.lexicalAnchors, 24, 180);
    if (sourceAnchors.length === 0 && sourceSpans.length === 0) {
      missing.push(`blockingCommitmentSourceGrounding:${commitmentId}`);
    }
    if (lexicalAnchors.length === 0) {
      missing.push(`blockingCommitmentLexicalAnchors:${commitmentId}`);
    }
  }
  return missing;
}

function updateDraftCommitment(
  draft: Record<string, unknown>,
  commitmentId: string,
  update: (commitment: Record<string, unknown>) => void,
): boolean {
  for (const key of ["blockingCommitments", "nonBlockingCommitments"] as const) {
    const commitments = Array.isArray(draft[key]) ? (draft[key] as unknown[]) : [];
    for (const commitment of commitments) {
      const record = asRecord(commitment);
      if (stringValue(record.commitmentId, "", 120) === commitmentId) {
        update(record);
        return true;
      }
    }
  }
  return false;
}

export function applyMissionLedgerToolCallsToDraft(input: {
  missionId: string;
  sourceRuntimeJobId?: string | null;
  sourceWorkItemId?: string | null;
  ownerObjectiveSummary: string;
  modelOutputs: unknown[];
}): MissionLedgerToolCompileResult {
  const calls = missionLedgerCallsFromOutputs(input.modelOutputs);
  const draft: Record<string, unknown> = {
    blockingCommitments: [],
    nonBlockingCommitments: [],
    explicitNonGoals: [],
    safetyConstraints: [],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
  const appliedToolNames: string[] = [];
  const rejectedToolCalls: JsonValue[] = [];
  for (const call of calls) {
    const args = call.input;
    switch (call.tool) {
      case "mission.add_blocking_commitment":
      case "mission.add_nonblocking_commitment": {
        const commitment = {
          commitmentId: stringValue(args.commitmentId, "", 120),
          commitmentText: stringValue(args.commitmentText, "", 1_200),
          whyItMatters: stringValue(
            args.whyItMatters,
            "Mission requirement from owner prompt.",
            800,
          ),
          expectedEvidenceDescription: stringValue(
            args.expectedEvidenceDescription,
            "Model-authored evidence refs must show this commitment was handled.",
            900,
          ),
          sourceAnchorRefs: stringArray(args.sourceAnchorRefs, 24, 360),
          sourceSpanRefs: stringArray(args.sourceSpanRefs, 24, 420),
          lexicalAnchors: stringArray(args.lexicalAnchors, 24, 180),
          remainingWork: stringArray(args.remainingWork, 12, 500),
          status: "pending",
          blocking: call.tool === "mission.add_blocking_commitment",
        };
        if (!commitment.commitmentId || !commitment.commitmentText) {
          rejectedToolCalls.push({ tool: call.tool, reason: "commitment_missing_id_or_text" });
          break;
        }
        const key =
          call.tool === "mission.add_blocking_commitment"
            ? "blockingCommitments"
            : "nonBlockingCommitments";
        draft[key] = [...(Array.isArray(draft[key]) ? (draft[key] as unknown[]) : []), commitment];
        appliedToolNames.push(call.tool);
        break;
      }
      case "mission.attach_source_anchor": {
        const commitmentId = stringValue(args.commitmentId, "", 120);
        const sourceAnchorRef = stringValue(args.sourceAnchorRef, "", 360);
        if (!commitmentId || !sourceAnchorRef) {
          rejectedToolCalls.push({
            tool: call.tool,
            reason: "source_anchor_missing_commitment_or_ref",
          });
          break;
        }
        const updated = updateDraftCommitment(draft, commitmentId, (commitment) => {
          commitment.sourceAnchorRefs = uniqueStringList(
            [...stringArray(commitment.sourceAnchorRefs, 24, 360), sourceAnchorRef],
            24,
          );
        });
        if (!updated) {
          rejectedToolCalls.push({
            tool: call.tool,
            reason: "source_anchor_commitment_missing",
            commitmentId,
          });
          break;
        }
        appliedToolNames.push(call.tool);
        break;
      }
      case "mission.attach_source_span": {
        const commitmentId = stringValue(args.commitmentId, "", 120);
        const sourceSpanRef = stringValue(args.sourceSpanRef, "", 420);
        if (!commitmentId || !sourceSpanRef) {
          rejectedToolCalls.push({
            tool: call.tool,
            reason: "source_span_missing_commitment_or_ref",
          });
          break;
        }
        const updated = updateDraftCommitment(draft, commitmentId, (commitment) => {
          commitment.sourceSpanRefs = uniqueStringList(
            [...stringArray(commitment.sourceSpanRefs, 24, 420), sourceSpanRef],
            24,
          );
        });
        if (!updated) {
          rejectedToolCalls.push({
            tool: call.tool,
            reason: "source_span_commitment_missing",
            commitmentId,
          });
          break;
        }
        appliedToolNames.push(call.tool);
        break;
      }
      case "mission.attach_lexical_anchor": {
        const commitmentId = stringValue(args.commitmentId, "", 120);
        const lexicalAnchor = stringValue(args.lexicalAnchor, "", 180);
        if (!commitmentId || !lexicalAnchor) {
          rejectedToolCalls.push({
            tool: call.tool,
            reason: "lexical_anchor_missing_commitment_or_anchor",
          });
          break;
        }
        const updated = updateDraftCommitment(draft, commitmentId, (commitment) => {
          commitment.lexicalAnchors = uniqueStringList(
            [...stringArray(commitment.lexicalAnchors, 24, 180), lexicalAnchor],
            24,
          );
        });
        if (!updated) {
          rejectedToolCalls.push({
            tool: call.tool,
            reason: "lexical_anchor_commitment_missing",
            commitmentId,
          });
          break;
        }
        appliedToolNames.push(call.tool);
        break;
      }
      case "mission.add_non_goal":
        draft.explicitNonGoals = uniqueStringList(
          [
            ...(Array.isArray(draft.explicitNonGoals) ? (draft.explicitNonGoals as string[]) : []),
            stringValue(args.nonGoal, "", 600),
          ],
          20,
        );
        appliedToolNames.push(call.tool);
        break;
      case "mission.add_safety_constraint":
        draft.safetyConstraints = [
          ...(Array.isArray(draft.safetyConstraints) ? (draft.safetyConstraints as unknown[]) : []),
          {
            constraintId: stringValue(args.constraintId, "", 120),
            constraintText: stringValue(args.constraintText, "", 800),
            boundaryKind: stringValue(args.boundaryKind, "other", 120),
            evidenceRefs: stringArray(args.evidenceRefs, 12, 260),
          },
        ];
        appliedToolNames.push(call.tool);
        break;
    }
  }
  const missingFields = missionLedgerDraftMissingFields(draft);
  const normalized = normalizeMissionContractLedger({
    value: draft,
    missionId: input.missionId,
    sourceRuntimeJobId: input.sourceRuntimeJobId,
    sourceWorkItemId: input.sourceWorkItemId,
    ownerObjectiveSummary: input.ownerObjectiveSummary,
  });
  const accepted = missingFields.length === 0;
  return {
    status: accepted ? "accepted" : "blocked",
    ledger: accepted ? normalized : null,
    draft,
    appliedToolNames,
    rejectedToolCalls,
    missingFields,
    reasonCodes: [
      "mission_ledger_native_tool_compile",
      accepted
        ? "mission_ledger_native_tool_compile_accepted"
        : "mission_ledger_native_tool_compile_blocked",
      accepted
        ? "mission_ledger_runtime_submitted_after_required_fields"
        : "mission_ledger_authoring_blocked",
      ...missingFields.map((field) => `mission_ledger_missing:${field}`),
      ...rejectedToolCalls.map((call) => {
        const reason = asRecord(call).reason;
        return `mission_ledger_rejected:${typeof reason === "string" ? reason : "unknown"}`;
      }),
    ],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

function bounded(value: string, max: number): string {
  return value.trim().replace(/\s+/gu, " ").slice(0, max);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown, fallback: string, max = 1_000): string {
  return typeof value === "string" && value.trim() ? bounded(value, max) : fallback;
}

function stringArray(value: unknown, maxItems: number, maxChars = 260): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => bounded(item, maxChars))
        .slice(0, maxItems)
    : [];
}

function statusValue(value: unknown): MissionCommitmentStatus {
  return MissionCommitmentStatusSchema.safeParse(value).success
    ? (value as MissionCommitmentStatus)
    : "pending";
}

function normalizeCommitment(
  value: unknown,
  fallbackIdPrefix: string,
  blocking: boolean,
): MissionCommitment | null {
  const record = asRecord(value);
  const commitmentText = stringValue(record.commitmentText ?? record.text, "", 1_200);
  if (!commitmentText) {
    return null;
  }
  const commitmentId =
    stringValue(record.commitmentId ?? record.id, "", 120) ||
    `${fallbackIdPrefix}-${hashText(commitmentText).slice(0, 12)}`;
  return {
    commitmentId,
    commitmentText,
    whyItMatters: stringValue(record.whyItMatters, "Mission requirement from owner prompt.", 800),
    expectedEvidenceDescription: stringValue(
      record.expectedEvidenceDescription,
      "Model-authored evidence refs must show this commitment was handled.",
      900,
    ),
    sourceAnchorRefs: stringArray(record.sourceAnchorRefs, 24, 360),
    sourceSpanRefs: stringArray(record.sourceSpanRefs, 24, 420),
    lexicalAnchors: stringArray(record.lexicalAnchors, 24, 180),
    acceptedEvidenceRefs: stringArray(record.acceptedEvidenceRefs, 20),
    rejectedEvidenceRefs: stringArray(record.rejectedEvidenceRefs, 20),
    status: statusValue(record.status),
    rationale: typeof record.rationale === "string" ? bounded(record.rationale, 1_000) : null,
    remainingWork: stringArray(record.remainingWork, 12, 500),
    blocking: typeof record.blocking === "boolean" ? record.blocking : blocking,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

function normalizeSafetyConstraint(value: unknown, index: number) {
  const record = asRecord(value);
  const constraintText = stringValue(record.constraintText ?? record.text, "", 800);
  if (!constraintText) {
    return null;
  }
  const boundaryKind = [
    "authority",
    "storage",
    "lifecycle",
    "side_effect",
    "scope",
    "validation",
    "privacy",
    "security",
    "other",
  ].includes(String(record.boundaryKind))
    ? String(record.boundaryKind)
    : "other";
  return MissionSafetyConstraintSchema.parse({
    constraintId:
      stringValue(record.constraintId ?? record.id, "", 120) ||
      `constraint-${index + 1}-${hashText(constraintText).slice(0, 8)}`,
    constraintText,
    boundaryKind,
    evidenceRefs: stringArray(record.evidenceRefs, 12),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  });
}

export function normalizeMissionContractLedger(input: {
  value: unknown;
  missionId: string;
  sourceRuntimeJobId?: string | null;
  sourceWorkItemId?: string | null;
  ownerObjectiveSummary: string;
}): MissionContractLedger {
  const record = asRecord(input.value);
  const blockingCommitments = (
    Array.isArray(record.blockingCommitments) ? record.blockingCommitments : []
  )
    .map((item) => normalizeCommitment(item, "blocking", true))
    .filter((item): item is MissionCommitment => Boolean(item))
    .slice(0, 30);
  const nonBlockingCommitments = (
    Array.isArray(record.nonBlockingCommitments) ? record.nonBlockingCommitments : []
  )
    .map((item) => normalizeCommitment(item, "nonblocking", false))
    .filter((item): item is MissionCommitment => Boolean(item))
    .slice(0, 30);
  const fallbackBlocking =
    blockingCommitments.length > 0
      ? []
      : [
          normalizeCommitment(
            {
              commitmentId: "owner-objective",
              commitmentText: bounded(input.ownerObjectiveSummary, 1_200),
              whyItMatters:
                "This preserves the owner's stated mission when the model omits details.",
              expectedEvidenceDescription:
                "Final evidence refs must show the owner objective was actually completed or explicitly revised.",
              sourceAnchorRefs: [],
              sourceSpanRefs: [],
              lexicalAnchors: [],
              status: "pending",
              blocking: true,
            },
            "blocking",
            true,
          ),
        ].filter((item): item is MissionCommitment => Boolean(item));
  const ledger = {
    artifactKind: "mission_contract_ledger" as const,
    schemaVersion: MISSION_CONTRACT_LEDGER_SCHEMA_VERSION,
    missionId: stringValue(record.missionId, input.missionId, 160),
    sourceRuntimeJobId: input.sourceRuntimeJobId ?? null,
    sourceWorkItemId: input.sourceWorkItemId ?? null,
    ownerObjectiveSummary: bounded(input.ownerObjectiveSummary, 2_000),
    blockingCommitments: [...blockingCommitments, ...fallbackBlocking].slice(0, 30),
    nonBlockingCommitments,
    explicitNonGoals: stringArray(record.explicitNonGoals, 20, 600),
    safetyConstraints: (Array.isArray(record.safetyConstraints) ? record.safetyConstraints : [])
      .map((item, index) => normalizeSafetyConstraint(item, index))
      .filter((item): item is z.infer<typeof MissionSafetyConstraintSchema> => Boolean(item))
      .slice(0, 30),
    storagePolicy: {
      rawPromptStorageAllowed: false,
      rawResponseStorageAllowed: false,
      rawTranscriptStorageAllowed: false,
      rawProviderLogStorageAllowed: false,
      rawToolLogStorageAllowed: false,
      rawDbRowStorageAllowed: false,
      secretsStorageAllowed: false,
      boundedRefsOnly: true,
    },
    lifecycleBoundary: {
      workQueueLifecycleMutationAllowed: false,
      deployAllowed: false,
      outboundSendAllowed: false,
      modelPromotionAllowed: false,
      runtimeJobLifecycleOwner: "runtime_jobs",
    },
    revisionProposals: [],
    ledgerStatus: "pending" as const,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
  };
  return recomputeMissionLedgerStatus(MissionContractLedgerSchema.parse(ledger));
}

export function parseMissionContractLedger(value: unknown): MissionContractLedger {
  return recomputeMissionLedgerStatus(MissionContractLedgerSchema.parse(value));
}

export function parseMissionCommitmentEvaluation(value: unknown): MissionCommitmentEvaluation {
  return MissionCommitmentEvaluationSchema.parse(value);
}

export function missionCommitmentIsClosed(commitment: MissionCommitment): boolean {
  return commitment.status === "satisfied" || commitment.status === "impossible";
}

export function openBlockingMissionCommitments(ledger: MissionContractLedger): MissionCommitment[] {
  const blockingCommitments = Array.isArray(ledger.blockingCommitments)
    ? ledger.blockingCommitments
    : [];
  return blockingCommitments.filter((commitment) => !missionCommitmentIsClosed(commitment));
}

export function missionLedgerHasOpenBlockingCommitments(ledger: MissionContractLedger): boolean {
  return openBlockingMissionCommitments(ledger).length > 0;
}

export function recomputeMissionLedgerStatus(ledger: MissionContractLedger): MissionContractLedger {
  const openBlocking = openBlockingMissionCommitments(ledger);
  return {
    ...ledger,
    ledgerStatus:
      openBlocking.length === 0
        ? "satisfied"
        : openBlocking.some((commitment) => commitment.status === "needs_review")
          ? "needs_review"
          : "pending",
  };
}

export function applyMissionCommitmentEvaluation(input: {
  ledger: MissionContractLedger;
  evaluation: MissionCommitmentEvaluation;
  availableEvidenceRefs?: string[];
}): MissionContractLedger {
  const available = new Set(input.availableEvidenceRefs ?? []);
  const updateById = new Map(
    input.evaluation.commitmentUpdates.map((update) => [update.commitmentId, update]),
  );
  const apply = (commitment: MissionCommitment): MissionCommitment => {
    const update = updateById.get(commitment.commitmentId);
    if (!update) {
      return commitment;
    }
    const refs = update.acceptedEvidenceRefs.filter(
      (ref) => available.size === 0 || available.has(ref),
    );
    return {
      ...commitment,
      status: update.status,
      acceptedEvidenceRefs: refs,
      rejectedEvidenceRefs: update.rejectedEvidenceRefs,
      rationale: update.rationale,
      remainingWork: update.remainingWork,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    };
  };
  return recomputeMissionLedgerStatus(
    MissionContractLedgerSchema.parse({
      ...input.ledger,
      blockingCommitments: input.ledger.blockingCommitments.map(apply),
      nonBlockingCommitments: input.ledger.nonBlockingCommitments.map(apply),
      revisionProposals: [
        ...input.ledger.revisionProposals,
        ...input.evaluation.revisionProposals,
      ].slice(0, 12),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
    }),
  );
}

export function summarizeMissionContractLedger(
  ledger: MissionContractLedger,
): MissionContractLedgerSummary {
  const blockingCommitments = Array.isArray(ledger.blockingCommitments)
    ? ledger.blockingCommitments
    : [];
  const nonBlockingCommitments = Array.isArray(ledger.nonBlockingCommitments)
    ? ledger.nonBlockingCommitments
    : [];
  const safetyConstraints = Array.isArray(ledger.safetyConstraints) ? ledger.safetyConstraints : [];
  const commitments = [...blockingCommitments, ...nonBlockingCommitments].map((commitment) => ({
    commitmentId: commitment.commitmentId,
    commitmentText: commitment.commitmentText,
    expectedEvidenceDescription: commitment.expectedEvidenceDescription,
    status: commitment.status,
    blocking: commitment.blocking,
    acceptedEvidenceRefs: commitment.acceptedEvidenceRefs.slice(0, 8),
    remainingWork: commitment.remainingWork.slice(0, 6),
    sourceAnchorRefs: (commitment.sourceAnchorRefs ?? []).slice(0, 8),
    sourceSpanRefs: (commitment.sourceSpanRefs ?? []).slice(0, 8),
    lexicalAnchors: (commitment.lexicalAnchors ?? []).slice(0, 8),
  }));
  return {
    missionId: ledger.missionId,
    ledgerStatus: ledger.ledgerStatus,
    blockingCommitmentCount: blockingCommitments.length,
    openBlockingCommitmentCount: openBlockingMissionCommitments(ledger).length,
    safetyConstraintCount: safetyConstraints.length,
    commitments,
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

export function missionContractLedgerArtifactRef(input: {
  runtimeJobId: string;
  missionId: string;
  revision?: number;
}): string {
  return `runtime-job://${input.runtimeJobId}/mission-contract-ledger/${input.missionId}${
    input.revision ? `/${input.revision}` : ""
  }`;
}

export function missionContractLedgerHash(ledger: MissionContractLedger): string {
  return hashText(JSON.stringify(ledger));
}

export function missionContractLedgerToJson(ledger: MissionContractLedger): JsonValue {
  return ledger as unknown as JsonValue;
}
