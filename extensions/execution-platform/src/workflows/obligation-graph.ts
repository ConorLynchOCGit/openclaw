import { createHash } from "node:crypto";
import { z } from "zod";
import type { JsonValue } from "../runtime-job-repository.ts";
import type { MissionContractLedger } from "./mission-contract-ledger.ts";

const boundedString = (max: number) => z.string().trim().min(1).max(max);
const boundedStringArray = (maxItems: number, maxChars = 360) =>
  z.array(z.string().trim().min(1).max(maxChars)).max(maxItems).default([]);

export const OBLIGATION_GRAPH_ARTIFACT_TYPE = "execution_platform.obligation_graph";
export const OBLIGATION_GRAPH_SCHEMA_VERSION = "execution-platform.obligation-graph.v1";

export const ObligationKindSchema = z.enum([
  "executable",
  "read_only_grounding",
  "validation",
  "review",
  "closeout",
  "constraint",
  "prerequisite",
  "evidence_requirement",
]);

export type ObligationKind = z.infer<typeof ObligationKindSchema>;

export const ObligationGraphRecordSchema = z
  .object({
    obligationId: boundedString(180),
    obligationKind: ObligationKindSchema,
    commitmentIds: boundedStringArray(12, 160),
    ownerIntentSummary: boundedString(1_200),
    successCondition: boundedString(1_200),
    evidenceExpectation: boundedString(1_200),
    authorityScopeRefs: boundedStringArray(24, 320),
    dependencyRefs: boundedStringArray(24, 320),
    constraintRefs: boundedStringArray(24, 320),
    sourceRefs: boundedStringArray(32, 360),
    riskRefs: boundedStringArray(16, 320),
    selectedCapabilityHints: boundedStringArray(12, 180),
    executionIntentHint: z.string().trim().max(180).nullable().default(null),
    resourceRequirementKinds: boundedStringArray(12, 180),
    rawStorageFlags: z.literal(false),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
  })
  .strict();

export type ObligationGraphRecord = z.infer<typeof ObligationGraphRecordSchema>;

export const ObligationGraphSchema = z
  .object({
    artifactKind: z.literal("obligation_graph"),
    schemaVersion: z.literal(OBLIGATION_GRAPH_SCHEMA_VERSION),
    graphId: boundedString(180),
    graphRef: boundedString(420),
    graphHash: boundedString(90),
    missionId: boundedString(180),
    sourceMissionLedgerRef: z.string().trim().max(420).nullable().default(null),
    obligations: z.array(ObligationGraphRecordSchema).max(80),
    blockedObligationIds: boundedStringArray(40, 180),
    reasonCodes: boundedStringArray(80, 240),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
  })
  .strict();

export type ObligationGraph = z.infer<typeof ObligationGraphSchema>;

export type ObligationDraft = Partial<ObligationGraphRecord> & {
  obligationId: string;
};

export type ObligationToolCall =
  | {
      tool: "obligation.create";
      obligationId: string;
      commitmentIds?: string[];
      ownerIntentSummary?: string;
    }
  | {
      tool: "obligation.classify_kind";
      obligationId: string;
      obligationKind: ObligationKind;
      rationale?: string;
    }
  | {
      tool: "obligation.add_success_condition";
      obligationId: string;
      successCondition: string;
    }
  | {
      tool: "obligation.add_evidence_expectation";
      obligationId: string;
      evidenceExpectation: string;
    }
  | {
      tool: "obligation.add_dependency";
      obligationId: string;
      dependencyRef: string;
    }
  | {
      tool: "obligation.add_constraint";
      obligationId: string;
      constraintRef: string;
    }
  | {
      tool: "obligation.mark_non_executable";
      obligationId: string;
      obligationKind: Exclude<ObligationKind, "executable">;
      evidenceExpectation?: string;
    }
  | {
      tool: "obligation.mark_executable_candidate";
      obligationId: string;
      executionIntentHint: string;
      selectedCapabilityHints?: string[];
      resourceRequirementKinds?: string[];
    }
  | {
      tool: "obligation.add_source_ref";
      obligationId: string;
      sourceRef: string;
    }
  | {
      tool: "obligation.add_risk_ref";
      obligationId: string;
      riskRef: string;
    }
  | {
      tool: "obligation.submit_graph";
      graphId?: string;
    }
  | {
      tool: "obligation.repair_missing_kind";
      obligationId: string;
      obligationKind: ObligationKind;
    }
  | {
      tool: "obligation.repair_missing_success_condition";
      obligationId: string;
      successCondition: string;
    }
  | {
      tool: "obligation.repair_missing_evidence_expectation";
      obligationId: string;
      evidenceExpectation: string;
    }
  | {
      tool: "obligation.block_with_reason";
      obligationId: string;
      reason: string;
    };

export type ObligationToolCompileResult = {
  status: "accepted" | "blocked";
  graph: ObligationGraph | null;
  drafts: ObligationDraft[];
  blockedObligationIds: string[];
  appliedToolNames: string[];
  rejectedToolCalls: JsonValue[];
  reasonCodes: string[];
  missingFieldsByObligationId: Record<string, string[]>;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type ObligationGraphAuthorParseResult =
  | {
      status: "parsed";
      parsed: Record<string, unknown>;
      topLevelKeys: string[];
      outputBytes: number;
      outputHash: string;
      reasonCodes: string[];
      rawResponseStored: false;
      rawProviderLogStored: false;
    }
  | {
      status: "blocked";
      parsed: null;
      topLevelKeys: string[];
      outputBytes: number;
      outputHash: string;
      reasonCodes: string[];
      rawResponseStored: false;
      rawProviderLogStored: false;
    };

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown, max = 1_000): string {
  return typeof value === "string" ? value.trim().replace(/\s+/gu, " ").slice(0, max) : "";
}

function stringArray(value: unknown, maxItems = 12, maxChars = 360): string[] {
  const source = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return unique(
    source
      .filter((item): item is string => typeof item === "string")
      .map((item) => stringValue(item, maxChars))
      .filter(Boolean),
    maxItems,
  );
}

function unique(values: Array<string | null | undefined>, max = 32): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const next = stringValue(value ?? "", 420);
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

function toolCallsFromModelOutputs(modelOutputs: unknown[]): Record<string, unknown>[] {
  const calls: Record<string, unknown>[] = [];
  for (const output of modelOutputs) {
    const record = asRecord(output);
    const candidates = [
      record.obligationActions,
      record.obligationToolCalls,
      record.toolCalls,
      record.actions,
    ];
    for (const candidate of candidates) {
      if (!Array.isArray(candidate)) {
        continue;
      }
      for (const item of candidate) {
        const call = asRecord(item);
        const input = asRecord(call.input);
        const tool = stringValue(call.tool ?? call.toolId ?? call.name);
        if (tool) {
          calls.push({ ...input, ...call, tool });
        }
      }
    }
  }
  return calls;
}

export function parseObligationGraphAuthorOutput(
  responseText: string | null,
): ObligationGraphAuthorParseResult {
  const source = responseText?.trim() ?? "";
  const outputBytes = Buffer.byteLength(source, "utf8");
  const outputHash = `sha256:${sha256Text(source)}`;
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/iu)?.[1]?.trim();
  const candidates = [
    source,
    fenced ?? "",
    source.includes("{") ? source.slice(source.indexOf("{"), source.lastIndexOf("}") + 1) : "",
  ].filter((candidate) => candidate.trim().startsWith("{"));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const record = parsed as Record<string, unknown>;
        return {
          status: "parsed",
          parsed: record,
          topLevelKeys: Object.keys(record).slice(0, 40),
          outputBytes,
          outputHash,
          reasonCodes: ["obligation_graph_author_output_parsed"],
          rawResponseStored: false,
          rawProviderLogStored: false,
        };
      }
    } catch {
      continue;
    }
  }
  return {
    status: "blocked",
    parsed: null,
    topLevelKeys: [],
    outputBytes,
    outputHash,
    reasonCodes: ["obligation_graph_author_output_parse_failed"],
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

export function obligationGraphAuthorNeedsRepair(result: {
  parse: ObligationGraphAuthorParseResult;
  compile?: ObligationToolCompileResult | null;
}): boolean {
  if (result.parse.status !== "parsed") {
    return true;
  }
  return result.compile?.status === "blocked";
}

export function obligationGraphAuthorRepairPayload(input: {
  originalPayload: JsonValue;
  parse: ObligationGraphAuthorParseResult;
  compile?: ObligationToolCompileResult | null;
}): JsonValue {
  return {
    repairMode: "obligation_graph_small_verb_shape_repair",
    originalPayload: input.originalPayload,
    priorAttemptDiagnostics: {
      parseStatus: input.parse.status,
      topLevelKeys: input.parse.topLevelKeys,
      outputBytes: input.parse.outputBytes,
      outputHash: input.parse.outputHash,
      compileStatus: input.compile?.status ?? null,
      appliedToolNames: input.compile?.appliedToolNames ?? [],
      rejectedToolCallCount: input.compile?.rejectedToolCalls.length ?? 0,
      blockedObligationIds: input.compile?.blockedObligationIds ?? [],
      missingFieldsByObligationId: input.compile?.missingFieldsByObligationId ?? {},
      reasonCodes: unique(
        [...input.parse.reasonCodes, ...(input.compile?.reasonCodes ?? [])],
        80,
      ),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    },
    requiredOutputShape: {
      obligationActions: [
        {
          tool: "obligation.create",
          obligationId: "stable-obligation-id",
          commitmentIds: ["commitment-id"],
          ownerIntentSummary: "bounded owner intent summary",
        },
        {
          tool: "obligation.classify_kind",
          obligationId: "stable-obligation-id",
          obligationKind: "executable",
        },
        {
          tool: "obligation.add_success_condition",
          obligationId: "stable-obligation-id",
          successCondition: "bounded success condition",
        },
        {
          tool: "obligation.add_evidence_expectation",
          obligationId: "stable-obligation-id",
          evidenceExpectation: "bounded evidence expectation",
        },
        {
          tool: "obligation.submit_graph",
        },
      ],
    },
    forbiddenOutputShapes: [
      "top_level_obligations_array",
      "prebuilt_obligation_graph_object",
      "markdown_or_prose",
      "worker_packets",
      "graph_nodes",
    ],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

function draftFor(
  draftsById: Map<string, ObligationDraft>,
  obligationId: string,
): ObligationDraft {
  const existing = draftsById.get(obligationId);
  if (existing) {
    return existing;
  }
  const created: ObligationDraft = { obligationId };
  draftsById.set(obligationId, created);
  return created;
}

function missingFieldsForDraft(draft: ObligationDraft): string[] {
  const missing: string[] = [];
  if (!draft.obligationKind) {
    missing.push("obligationKind");
  }
  if (!stringValue(draft.ownerIntentSummary, 1_200)) {
    missing.push("ownerIntentSummary");
  }
  if (!stringValue(draft.successCondition, 1_200)) {
    missing.push("successCondition");
  }
  if (!stringValue(draft.evidenceExpectation, 1_200)) {
    missing.push("evidenceExpectation");
  }
  if (!draft.commitmentIds || draft.commitmentIds.length === 0) {
    missing.push("commitmentIds");
  }
  return missing;
}

export function obligationToolManifest(): JsonValue {
  return {
    toolFamily: "obligation",
    outputContract: "execution-platform.obligation-graph.v1",
    requiredOutputShape: {
      obligationActions: [
        {
          tool: "obligation.create",
          obligationId: "obl-stable-id",
          commitmentIds: ["commitment-id"],
          ownerIntentSummary: "bounded owner intent summary",
        },
        {
          tool: "obligation.classify_kind",
          obligationId: "obl-stable-id",
          obligationKind: "executable",
        },
        {
          tool: "obligation.add_success_condition",
          obligationId: "obl-stable-id",
          successCondition: "bounded success condition",
        },
        {
          tool: "obligation.add_evidence_expectation",
          obligationId: "obl-stable-id",
          evidenceExpectation: "bounded evidence expectation",
        },
        {
          tool: "obligation.submit_graph",
        },
      ],
    },
    forbiddenOutputShapes: [
      "Do not return a top-level obligations array.",
      "Do not return a prebuilt obligationGraph object.",
      "Do not return prose, markdown, or direct graph records.",
      "Return only a JSON object with top-level obligationActions.",
    ],
    tools: [
      "obligation.create",
      "obligation.classify_kind",
      "obligation.add_success_condition",
      "obligation.add_evidence_expectation",
      "obligation.add_dependency",
      "obligation.add_constraint",
      "obligation.mark_non_executable",
      "obligation.mark_executable_candidate",
      "obligation.add_source_ref",
      "obligation.add_risk_ref",
      "obligation.submit_graph",
      "obligation.repair_missing_kind",
      "obligation.repair_missing_success_condition",
      "obligation.repair_missing_evidence_expectation",
      "obligation.block_with_reason",
    ],
    requiredPerObligationFields: [
      "obligationId",
      "obligationKind",
      "commitmentIds",
      "ownerIntentSummary",
      "successCondition",
      "evidenceExpectation",
    ],
    conditionality:
      "Executable obligations may carry executionIntentHint/capability/resourceRequirementKinds. Read-only, validation, review, closeout, constraint, prerequisite, and evidence_requirement obligations must not invent worker packet fields.",
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

export function applyObligationToolCallsToDraft(input: {
  missionId: string;
  graphId: string;
  graphRefPrefix: string;
  sourceMissionLedgerRef?: string | null;
  ledger: MissionContractLedger;
  modelOutputs: unknown[];
}): ObligationToolCompileResult {
  const calls = toolCallsFromModelOutputs(input.modelOutputs);
  const draftsById = new Map<string, ObligationDraft>();
  const appliedToolNames: string[] = [];
  const rejectedToolCalls: JsonValue[] = [];
  const blockedObligationIds: string[] = [];
  let graphSubmitted = false;

  for (const rawCall of calls) {
    const tool = stringValue(rawCall.tool);
    const obligationId = stringValue(rawCall.obligationId, 180);
    if (!tool || (tool !== "obligation.submit_graph" && !obligationId)) {
      rejectedToolCalls.push({
        tool,
        reason: "missing_tool_or_obligation_id",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      });
      continue;
    }
    const draft = obligationId ? draftFor(draftsById, obligationId) : null;
    switch (tool) {
      case "obligation.create":
        draft!.commitmentIds = unique(stringArray(rawCall.commitmentIds, 12, 160), 12);
        draft!.ownerIntentSummary = stringValue(rawCall.ownerIntentSummary, 1_200);
        appliedToolNames.push(tool);
        break;
      case "obligation.classify_kind":
      case "obligation.repair_missing_kind": {
        const parsed = ObligationKindSchema.safeParse(rawCall.obligationKind);
        if (!parsed.success) {
          rejectedToolCalls.push({ tool, obligationId, reason: "invalid_obligation_kind" });
          break;
        }
        draft!.obligationKind = parsed.data;
        appliedToolNames.push(tool);
        break;
      }
      case "obligation.add_success_condition":
      case "obligation.repair_missing_success_condition":
        draft!.successCondition = stringValue(rawCall.successCondition, 1_200);
        appliedToolNames.push(tool);
        break;
      case "obligation.add_evidence_expectation":
      case "obligation.repair_missing_evidence_expectation":
        draft!.evidenceExpectation = stringValue(rawCall.evidenceExpectation, 1_200);
        appliedToolNames.push(tool);
        break;
      case "obligation.add_dependency":
        draft!.dependencyRefs = unique([...(draft!.dependencyRefs ?? []), rawCall.dependencyRef as string], 24);
        appliedToolNames.push(tool);
        break;
      case "obligation.add_constraint":
        draft!.constraintRefs = unique([...(draft!.constraintRefs ?? []), rawCall.constraintRef as string], 24);
        appliedToolNames.push(tool);
        break;
      case "obligation.mark_non_executable": {
        const parsed = ObligationKindSchema.safeParse(rawCall.obligationKind);
        if (!parsed.success || parsed.data === "executable") {
          rejectedToolCalls.push({ tool, obligationId, reason: "invalid_non_executable_kind" });
          break;
        }
        draft!.obligationKind = parsed.data;
        if (stringValue(rawCall.evidenceExpectation, 1_200)) {
          draft!.evidenceExpectation = stringValue(rawCall.evidenceExpectation, 1_200);
        }
        appliedToolNames.push(tool);
        break;
      }
      case "obligation.mark_executable_candidate":
        draft!.obligationKind = "executable";
        draft!.executionIntentHint = stringValue(rawCall.executionIntentHint, 180) || null;
        draft!.selectedCapabilityHints = unique(stringArray(rawCall.selectedCapabilityHints, 12, 180), 12);
        draft!.resourceRequirementKinds = unique(
          stringArray(rawCall.resourceRequirementKinds, 12, 180),
          12,
        );
        appliedToolNames.push(tool);
        break;
      case "obligation.add_source_ref":
        draft!.sourceRefs = unique([...(draft!.sourceRefs ?? []), rawCall.sourceRef as string], 32);
        appliedToolNames.push(tool);
        break;
      case "obligation.add_risk_ref":
        draft!.riskRefs = unique([...(draft!.riskRefs ?? []), rawCall.riskRef as string], 16);
        appliedToolNames.push(tool);
        break;
      case "obligation.block_with_reason":
        blockedObligationIds.push(obligationId);
        draft!.riskRefs = unique(
          [...(draft!.riskRefs ?? []), `blocked:${stringValue(rawCall.reason, 300)}`],
          16,
        );
        appliedToolNames.push(tool);
        break;
      case "obligation.submit_graph":
        graphSubmitted = true;
        appliedToolNames.push(tool);
        break;
      default:
        rejectedToolCalls.push({ tool, obligationId, reason: "unknown_obligation_tool" });
    }
  }

  const drafts = [...draftsById.values()];
  const missingFieldsByObligationId: Record<string, string[]> = {};
  for (const draft of drafts) {
    const missing = missingFieldsForDraft(draft);
    if (missing.length > 0) {
      missingFieldsByObligationId[draft.obligationId] = missing;
    }
  }
  const graphBlocked =
    !graphSubmitted ||
    drafts.length === 0 ||
    Object.keys(missingFieldsByObligationId).length > 0 ||
    blockedObligationIds.length > 0;
  const obligations = drafts
    .filter((draft) => missingFieldsForDraft(draft).length === 0)
    .map((draft) =>
      ObligationGraphRecordSchema.parse({
        obligationId: draft.obligationId,
        obligationKind: draft.obligationKind,
        commitmentIds: unique(draft.commitmentIds ?? [], 12),
        ownerIntentSummary: stringValue(draft.ownerIntentSummary, 1_200),
        successCondition: stringValue(draft.successCondition, 1_200),
        evidenceExpectation: stringValue(draft.evidenceExpectation, 1_200),
        authorityScopeRefs: unique(draft.authorityScopeRefs ?? [], 24),
        dependencyRefs: unique(draft.dependencyRefs ?? [], 24),
        constraintRefs: unique(draft.constraintRefs ?? [], 24),
        sourceRefs: unique(draft.sourceRefs ?? [], 32),
        riskRefs: unique(draft.riskRefs ?? [], 16),
        selectedCapabilityHints: unique(draft.selectedCapabilityHints ?? [], 12),
        executionIntentHint: draft.executionIntentHint ?? null,
        resourceRequirementKinds: unique(draft.resourceRequirementKinds ?? [], 12),
        rawStorageFlags: false,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      }),
    );
  const bodyForHash = {
    missionId: input.missionId,
    obligations,
    blockedObligationIds: unique(blockedObligationIds, 40),
  };
  const graphHash = `sha256:${sha256(bodyForHash)}`;
  const graphRef = `${input.graphRefPrefix}/${graphHash.slice(7, 23)}`;
  const graph = graphBlocked
    ? null
    : ObligationGraphSchema.parse({
        artifactKind: "obligation_graph",
        schemaVersion: OBLIGATION_GRAPH_SCHEMA_VERSION,
        graphId: input.graphId,
        graphRef,
        graphHash,
        missionId: input.missionId,
        sourceMissionLedgerRef: input.sourceMissionLedgerRef ?? null,
        obligations,
        blockedObligationIds: [],
        reasonCodes: [
          "obligation_graph_model_authored",
          "obligation_graph_tools_accepted",
          "obligation_graph_scheduler_intake_ready",
        ],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      });

  return {
    status: graph ? "accepted" : "blocked",
    graph,
    drafts,
    blockedObligationIds: unique(blockedObligationIds, 40),
    appliedToolNames: unique(appliedToolNames, 80),
    rejectedToolCalls: rejectedToolCalls.slice(0, 40) as JsonValue[],
    reasonCodes: unique(
      [
        graphSubmitted ? "obligation_graph_submitted" : "obligation_graph_submit_tool_missing",
        drafts.length > 0 ? "obligation_graph_drafts_present" : "obligation_graph_no_drafts",
        ...Object.entries(missingFieldsByObligationId).flatMap(([id, fields]) =>
          fields.map((field) => `obligation_missing_${field}:${id}`),
        ),
        ...blockedObligationIds.map((id) => `obligation_blocked:${id}`),
        ...(graph ? ["obligation_graph_accepted"] : ["obligation_graph_blocked"]),
      ],
      80,
    ),
    missingFieldsByObligationId,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

export function summarizeObligationGraphForScheduler(graph: ObligationGraph | null): JsonValue | null {
  if (!graph) {
    return null;
  }
  return {
    graphId: graph.graphId,
    graphRef: graph.graphRef,
    graphHash: graph.graphHash,
    missionId: graph.missionId,
    obligationCount: graph.obligations.length,
    executableCount: graph.obligations.filter((obligation) => obligation.obligationKind === "executable").length,
    nonExecutableCount: graph.obligations.filter((obligation) => obligation.obligationKind !== "executable").length,
    obligations: graph.obligations.map((obligation) => ({
      obligationId: obligation.obligationId,
      obligationKind: obligation.obligationKind,
      commitmentIds: obligation.commitmentIds,
      ownerIntentSummary: obligation.ownerIntentSummary,
      successCondition: obligation.successCondition,
      evidenceExpectation: obligation.evidenceExpectation,
      dependencyRefs: obligation.dependencyRefs,
      constraintRefs: obligation.constraintRefs,
      sourceRefs: obligation.sourceRefs.slice(0, 12),
      selectedCapabilityHints: obligation.selectedCapabilityHints,
      executionIntentHint: obligation.executionIntentHint,
      resourceRequirementKinds: obligation.resourceRequirementKinds,
      rawStorageFlags: false,
    })),
    reasonCodes: graph.reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

export function obligationAuthorPayloadFromLedger(input: {
  ledger: MissionContractLedger;
  missionLedgerRef: string | null;
}): JsonValue {
  return {
    missionId: input.ledger.missionId,
    missionLedgerRef: input.missionLedgerRef,
    ownerObjectiveSummary: input.ledger.ownerObjectiveSummary,
    blockingCommitments: input.ledger.blockingCommitments.map((commitment) => ({
      commitmentId: commitment.commitmentId,
      commitmentText: commitment.commitmentText,
      whyItMatters: commitment.whyItMatters,
      expectedEvidenceDescription: commitment.expectedEvidenceDescription,
      remainingWork: commitment.remainingWork,
      blocking: commitment.blocking,
      status: commitment.status,
    })),
    nonBlockingCommitments: input.ledger.nonBlockingCommitments.map((commitment) => ({
      commitmentId: commitment.commitmentId,
      commitmentText: commitment.commitmentText,
      whyItMatters: commitment.whyItMatters,
      expectedEvidenceDescription: commitment.expectedEvidenceDescription,
      remainingWork: commitment.remainingWork,
      blocking: commitment.blocking,
      status: commitment.status,
    })),
    safetyConstraints: input.ledger.safetyConstraints.map((constraint) => ({
      constraintId: constraint.constraintId,
      constraintText: constraint.constraintText,
      boundaryKind: constraint.boundaryKind,
      enforcementOwner: constraint.enforcementOwner,
    })),
    toolManifest: obligationToolManifest(),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}
