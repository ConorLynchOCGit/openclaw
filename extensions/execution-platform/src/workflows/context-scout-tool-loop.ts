import { createHash } from "node:crypto";
import { z } from "zod";
import { CODE_INTELLIGENCE_RUNTIME_TOOL_IDS } from "../code-intelligence/index.ts";
import type { JsonValue } from "../runtime-job-repository.ts";
import type { ContextHandoffPacket } from "./mission-work-packets.ts";

const boundedString = (max: number) => z.string().trim().min(1).max(max);
const stringList = (maxItems: number, maxChars = 260) =>
  z.array(boundedString(maxChars)).max(maxItems);

function bounded(value: string | null | undefined, max = 1_000): string {
  return (value ?? "").trim().replace(/\s+/gu, " ").slice(0, max);
}

function uniqueStrings(values: Array<string | null | undefined>, max = 24): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))]
    .map((value) => bounded(value, 260))
    .slice(0, max);
}

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function loopRef(kind: string, id: string, body: unknown): string {
  return `runtime-work-graph://${kind}/${id}/${sha256(body).slice(0, 16)}`;
}

export const CONTEXT_SCOUT_TOOL_LOOP_ARTIFACT_TYPE = "execution_platform.context_scout_tool_loop";

export const CONTEXT_SCOUT_TOOL_LOOP_TOOL_IDS = [
  "repo.search",
  "repo.list_files",
  "file.read",
  "file.inspect_symbols",
  "test.find_related",
  "context.handoff",
  "context.limitations",
  "context.evidence_claim",
  "context.request_more_context",
  "context_scout.plan",
  "context_scout.search_repo",
  "context_scout.read_file_refs",
  "context_scout.select_relevant_files",
  "context_scout.extract_existing_patterns",
  "context_scout.assess_risks",
  "context_scout.plan_edit_points",
  "context_scout.plan_validation",
  "context_scout.inspect_tests",
  "context_scout.request_prompt_excerpt",
  "context_scout.receive_prompt_excerpt",
  "context_scout.verify_refs",
  "context_scout.review_sufficiency",
  "context_scout.emit_handoff_packet",
  "context_scout.request_repair",
  ...CODE_INTELLIGENCE_RUNTIME_TOOL_IDS,
] as const;

// Runtime file refs are evidence anchors, not the context scout's semantic output.
// A context scout output MUST NOT be accepted solely from runtime-supplied refs.
// Acceptance requires model-authored substance in the sufficiency review and
// at least one acceptedContextSource !== "runtime_supplied" with
// runtimeSuppliedRefRejected === false. Runtime-supplied refs may be preserved
// as bounded evidence only after explicit model-authored verification.
// HARDENED: Any sufficiency review with status "accepted" or "accepted_with_limitations"
// MUST have requiresSubstantiveContext === true AND at least one verified ref with
// acceptedContextSource !== "runtime_supplied" and runtimeSuppliedRefRejected === false.
// If all verified refs have acceptedContextSource === "runtime_supplied", the review
// status MUST be downgraded to "needs_review_nonblocking" or "needs_repair".
// ENFORCED: The scheduler MUST reject implementation graph selection when the
// associated ContextScoutSufficiencyReview has no verified ref with
// acceptedContextSource !== "runtime_supplied" and runtimeSuppliedRefRejected === false.

export type ContextScoutToolLoopToolId = (typeof CONTEXT_SCOUT_TOOL_LOOP_TOOL_IDS)[number];

export const ContextScoutRepoAnalysisFindingSchema = z
  .object({
    findingId: boundedString(180),
    findingKind: z.enum([
      "repo_search",
      "file_summary",
      "symbol_summary",
      "test_surface",
      "existing_pattern",
      "risk",
      "edit_point",
      "validation_hint",
      "missing_context",
      "code_intelligence",
      "diagnostic_surface",
      "impact_radius",
    ]),
    fileRef: z.string().max(260).nullable(),
    symbolRef: z.string().max(260).nullable(),
    testRef: z.string().max(260).nullable(),
    boundedSummary: boundedString(900),
    downstreamUse: boundedString(700),
    sourceToolId: z.enum(CONTEXT_SCOUT_TOOL_LOOP_TOOL_IDS),
    evidenceRefs: stringList(16, 320),
    rawFileContentStored: z.literal(false),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
  })
  .strict();

export type ContextScoutRepoAnalysisFinding = z.infer<typeof ContextScoutRepoAnalysisFindingSchema>;

export const ContextScoutVerifiedFileRefSchema = z
  .object({
    fileRef: boundedString(260),
    evidenceRef: boundedString(320),
    evidenceHash: boundedString(90),
    boundedSummary: boundedString(700),
    reasonCodes: stringList(8, 160),
    acceptedContextSource: z
      .enum(["model_authored", "runtime_supplied", "hybrid"])
      .default("model_authored"),
    // HARDENED: true when the runtime-supplied ref was explicitly rejected or
    // overridden by model-authored discovery. If true, this ref MUST NOT count
    // toward the non-runtime context source requirement.
    runtimeSuppliedRefRejected: z.boolean().default(false),
    rejectedDuringSufficiencyReview: z.boolean().default(false),
    // INVARIANT: Raw content storage flags are explicitly false at schema level.
    rawFileContentStored: z.literal(false),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
  })
  .strict();

export type ContextScoutVerifiedFileRef = z.infer<typeof ContextScoutVerifiedFileRefSchema>;
export const ContextScoutRejectedRefSchema = z
  .object({
    ref: boundedString(260),
    reasonCodes: stringList(8, 160),
    rejectedContextSource: z.enum(["model_authored", "runtime_supplied", "hybrid"]),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
  })
  .strict();

export type ContextScoutRejectedRef = z.infer<typeof ContextScoutRejectedRefSchema>;

export const ContextSufficiencyReviewSchema = z
  .object({
    reviewSource: z.enum(["model_authored_context_scout_output", "model_authored_repair_review"]),
    status: z.enum([
      "accepted",
      "accepted_with_limitations",
      "needs_review_nonblocking",
      "needs_repair",
      "rejected",
    ]),
    requiresSubstantiveContext: z.literal(true),
    verifiedRefs: z.array(ContextScoutVerifiedFileRefSchema).max(48).default([]),
    rejectedRefs: z.array(ContextScoutRejectedRefSchema).max(48).default([]),
    rejectedRuntimeOnlyRefs: z.array(ContextScoutRejectedRefSchema).max(48).default([]),
    substantiveContextVerified: z.boolean().default(false),
    boundedRationale: boundedString(1_500),
    boundedSummary: boundedString(1_200),
    boundedRepairInstructions: boundedString(1_500),
    stopIfMissingRefs: stringList(8, 260),
    reviewerSummary: boundedString(1_200),
    sufficientForImplementation: z.boolean(),
    sufficientForValidation: z.boolean(),
    sufficientForReview: z.boolean(),
    missingInformation: stringList(12, 700).default([]),
    repairInstructions: stringList(12, 700).default([]),
    // HARDENED: Gate field set by scheduler. True only when at least one
    // verified ref has acceptedContextSource !== "runtime_supplied" and
    // runtimeSuppliedRefRejected === false.
    hasNonRuntimeContextSource: z.boolean().default(false),
    // HARDENED: True when all verified refs have acceptedContextSource ===
    // "runtime_supplied". Triggers scheduler rejection of implementation
    // graph selection regardless of other flags.
    runtimeOnlyContextDetected: z.boolean().default(false),
    rawFileContentStored: z.literal(false),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
  })
  .strict();

export type ContextSufficiencyReview = z.infer<typeof ContextSufficiencyReviewSchema>;

// HARDENED: Asserts that any accepted sufficiency review has at least one
// non-runtime-supplied verified ref. Runtime-only context is insufficient
// for implementation graph selection.
export function assertSufficiencyReviewAcceptance(review: ContextSufficiencyReview): void {
  const acceptedStatuses = ["accepted", "accepted_with_limitations"] as const;
  if (!acceptedStatuses.includes(review.status as (typeof acceptedStatuses)[number])) {
    return;
  }

  if (!review.requiresSubstantiveContext) {
    throw new Error(
      `Sufficiency review status ${review.status} requires requiresSubstantiveContext === true`,
    );
  }

  const hasNonRuntimeSource = review.verifiedRefs.some(
    (ref) => ref.acceptedContextSource !== "runtime_supplied" && !ref.runtimeSuppliedRefRejected,
  );
  if (!hasNonRuntimeSource) {
    throw new Error(
      `Sufficiency review status ${review.status} requires at least one verified ref with acceptedContextSource !== "runtime_supplied" and runtimeSuppliedRefRejected === false`,
    );
  }
}

// Hardened acceptance check: a sufficiency review cannot be accepted solely
// from runtime-supplied refs. At least one verified ref must have
// acceptedContextSource !== "runtime_supplied" and runtimeSuppliedRefRejected === false.
export function contextScoutSufficiencyReviewAccepted(review: ContextSufficiencyReview): boolean {
  const acceptableStatuses = ["accepted", "accepted_with_limitations"];
  if (!acceptableStatuses.includes(review.status)) {
    return false;
  }
  if (!review.requiresSubstantiveContext) {
    return false;
  }
  const hasNonRuntimeSource = review.verifiedRefs.some(
    (ref) =>
      ref.acceptedContextSource !== "runtime_supplied" &&
      !ref.runtimeSuppliedRefRejected &&
      !ref.rejectedDuringSufficiencyReview,
  );
  return hasNonRuntimeSource;
}

const RUNTIME_VERIFIED_FALLBACK_LIMITATION =
  "Model output did not provide verified repo file refs; runtime supplied verified context-tool file refs instead.";

export function contextScoutSufficiencyAllowsImplementation(
  review: ContextSufficiencyReview,
): boolean {
  if (!review.requiresSubstantiveContext) {
    return false;
  }
  if (!review.sufficientForImplementation) {
    return false;
  }
  if (review.status !== "accepted" && review.status !== "accepted_with_limitations") {
    return false;
  }
  // Scheduler gating: implementation selection depends on substantive accepted context
  if (!review.sufficientForValidation) {
    return false;
  }
  // Hard reject if any missingInformation indicates runtime-only context without model-authored evidencence
  const hasRuntimeOnlyGap = review.missingInformation.some(
    (info) => info.includes("runtime_supplied") || info.includes("no_model_authored_evidence"),
  );
  if (hasRuntimeOnlyGap) {
    return false;
  }
  // Hard reject if review source is not model_authored (e.g., fallback or hybrid)
  if (review.reviewSource !== "model_authored_context_scout_output") {
    return false;
  }
  return true;
}

export function inspectContextScoutModelAuthoredHandoffSubstance(input: {
  modelAuthoredSummary: string | null | undefined;
  recommendedEditPoints?: string[];
  existingPatterns?: string[];
  risks?: string[];
  validationSuggestions?: string[];
}): {
  hasModelAuthoredHandoffSubstance: boolean;
  summaryLength: number;
  nonSummarySubstanceSignalCount: number;
  missingFieldPaths: string[];
  reasonCodes: string[];
} {
  const recommendedEditPoints = input.recommendedEditPoints ?? [];
  const modelAuthoredEditPoints = recommendedEditPoints.filter(
    (point) => !point.includes("runtime_verified_context"),
  ).length;
  const nonSummarySubstanceSignalCount = [
    (input.existingPatterns?.length ?? 0) > 0,
    (input.risks?.length ?? 0) > 0,
    (input.validationSuggestions?.length ?? 0) >= 2,
    modelAuthoredEditPoints >= 2,
  ].filter(Boolean).length;
  const summaryLength = (input.modelAuthoredSummary ?? "").trim().length;
  const hasModelAuthoredHandoffSubstance =
    (summaryLength >= 220 && nonSummarySubstanceSignalCount >= 1) ||
    (summaryLength >= 140 && nonSummarySubstanceSignalCount >= 2);
  const missingFieldPaths = [
    ...(summaryLength < 140 ? ["handoffSummaryForImplementation"] : []),
    ...(nonSummarySubstanceSignalCount === 0
      ? ["existingPatterns", "risks", "validationSuggestions", "recommendedEditPoints"]
      : []),
    ...(summaryLength < 220 && nonSummarySubstanceSignalCount < 2
      ? ["handoffSummaryForImplementation.detail"]
      : []),
  ].slice(0, 8);
  return {
    hasModelAuthoredHandoffSubstance,
    summaryLength,
    nonSummarySubstanceSignalCount,
    missingFieldPaths,
    reasonCodes: hasModelAuthoredHandoffSubstance
      ? ["context_scout_model_authored_handoff_substance_present"]
      : [
          "context_scout_model_authored_handoff_substance_missing",
          `context_scout_handoff_summary_length:${summaryLength}`,
          `context_scout_handoff_signal_count:${nonSummarySubstanceSignalCount}`,
        ],
  };
}

export const ContextScoutToolLoopRunSchema = z
  .object({
    artifactKind: z.literal("context_scout_tool_loop"),
    schemaVersion: z.literal("execution-platform.context-scout-tool-loop.v1"),
    loopId: boundedString(180),
    loopRef: boundedString(320),
    graphId: boundedString(180),
    nodeId: boundedString(180),
    roleId: boundedString(120),
    modelRef: boundedString(260),
    targetCommitmentIds: stringList(24, 160),
    commitmentWorkPacketRefs: stringList(32, 320),
    requestedContextQuestions: stringList(24, 900),
    downstreamConsumer: boundedString(260),
    sourcePromptHash: z.string().max(90).nullable(),
    sourcePromptExcerptDecisionRefs: stringList(24, 320),
    sourcePromptExcerptProvidedRefs: stringList(24, 320),
    candidateFileRefs: stringList(80, 260),
    expectedRepoAreaRefs: stringList(60, 260),
    repoAnalysisFindings: z.array(ContextScoutRepoAnalysisFindingSchema).max(120).default([]),
    modelAuthoredFindingCount: z.number().int().nonnegative().default(0),
    synthesisReadiness: z
      .enum([
        "ready_for_synthesis",
        "ready_with_limitations",
        "needs_repair_before_synthesis",
        "blocked_missing_context",
      ])
      .default("blocked_missing_context"),
    synthesisBlockers: stringList(24, 700).default([]),
    verifiedFileRefs: z.array(ContextScoutVerifiedFileRefSchema).max(60),
    rejectedRefs: z.array(ContextScoutRejectedRefSchema).max(60),
    runtimeToolInvocationRefs: stringList(80, 320),
    codeIntelligenceResultRefs: stringList(80, 320).default([]),
    codeIntelligenceRuntimeToolInvocationRefs: stringList(80, 320).default([]),
    codeIntelligenceSymbolRefs: stringList(80, 320).default([]),
    codeIntelligenceDiagnosticRefs: stringList(80, 320).default([]),
    codeIntelligenceRelatedTestRefs: stringList(80, 320).default([]),
    codeIntelligenceImpactRefs: stringList(80, 320).default([]),
    codeIntelligenceSemanticModes: stringList(8, 80).default([]),
    codeIntelligenceLimitations: stringList(16, 700).default([]),
    contextHandoffPacketRef: z.string().max(320).nullable(),
    contextHandoffPacketHash: z.string().max(90).nullable(),
    sufficiencyReview: ContextSufficiencyReviewSchema,
    reasonCodes: stringList(40, 180),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
    rawFileContentStored: z.literal(false),
  })
  .strict();

export type ContextScoutToolLoopRun = z.infer<typeof ContextScoutToolLoopRunSchema>;

export function buildContextScoutVerifiedFileRefs(input: {
  fileRefs: string[];
  runtimeJobId: string;
  nodeId: string;
  reasonCodes?: string[];
  boundedSummariesByFileRef?: Record<string, string>;
}): ContextScoutVerifiedFileRef[] {
  return uniqueStrings(input.fileRefs, 60).map((fileRef) => {
    const body = {
      fileRef,
      nodeId: input.nodeId,
      reasonCodes: input.reasonCodes ?? ["context_scout_file_ref_verified"],
      boundedSummary: input.boundedSummariesByFileRef?.[fileRef] ?? null,
    };
    return ContextScoutVerifiedFileRefSchema.parse({
      fileRef,
      evidenceRef: `runtime-job://${input.runtimeJobId}/context-scout/verified-file/${sha256(body).slice(0, 16)}`,
      evidenceHash: sha256(body),
      boundedSummary: bounded(
        input.boundedSummariesByFileRef?.[fileRef] ??
          `Verified repo file ref for context scout handoff: ${fileRef}`,
        700,
      ),
      reasonCodes: input.reasonCodes ?? ["context_scout_file_ref_verified"],
      acceptedContextSource: (input.reasonCodes ?? []).includes(
        "context_scout_tool_first_verified_context_used",
      )
        ? "runtime_supplied"
        : "model_authored",
      rawFileContentStored: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    });
  });
}

export function buildContextScoutRepoAnalysisFindings(input: {
  runtimeJobId: string;
  nodeId: string;
  relevantFileRefs?: string[];
  symbolRefs?: string[];
  testRefs?: string[];
  existingPatterns?: string[];
  risks?: string[];
  recommendedEditPoints?: string[];
  validationSuggestions?: string[];
  missingInformation?: string[];
  codeIntelligenceResultRefs?: string[];
  codeIntelligenceSymbolRefs?: string[];
  codeIntelligenceDiagnosticRefs?: string[];
  codeIntelligenceRelatedTestRefs?: string[];
  codeIntelligenceImpactRefs?: string[];
  codeIntelligenceSemanticModes?: string[];
  codeIntelligenceLimitations?: string[];
}): ContextScoutRepoAnalysisFinding[] {
  const findings: ContextScoutRepoAnalysisFinding[] = [];
  const push = (finding: Omit<ContextScoutRepoAnalysisFinding, "findingId">) => {
    const body = { ...finding, nodeId: input.nodeId };
    findings.push(
      ContextScoutRepoAnalysisFindingSchema.parse({
        ...finding,
        findingId: `context-scout-finding:${input.nodeId}:${sha256(body).slice(0, 16)}`,
      }),
    );
  };
  for (const fileRef of uniqueStrings(input.relevantFileRefs ?? [], 40)) {
    push({
      findingKind: "file_summary",
      fileRef,
      symbolRef: null,
      testRef: null,
      boundedSummary: `Context scout identified repo file ${fileRef} as relevant for downstream work.`,
      downstreamUse: "Downstream worker should inspect this bounded file ref before editing.",
      sourceToolId: "file.read",
      evidenceRefs: [
        `runtime-job://${input.runtimeJobId}/context-scout/file/${sha256(fileRef).slice(0, 16)}`,
      ],
      rawFileContentStored: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    });
  }
  for (const symbolRef of uniqueStrings(input.symbolRefs ?? [], 40)) {
    const fileRef = symbolRef.split(":")[0] || null;
    push({
      findingKind: "symbol_summary",
      fileRef,
      symbolRef,
      testRef: null,
      boundedSummary: `Context scout identified ${symbolRef} as a likely symbol or file region for downstream inspection.`,
      downstreamUse:
        "Use this symbol or region to focus implementation instead of rereading unrelated files.",
      sourceToolId: "file.inspect_symbols",
      evidenceRefs: [
        `runtime-job://${input.runtimeJobId}/context-scout/symbol/${sha256(symbolRef).slice(0, 16)}`,
      ],
      rawFileContentStored: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    });
  }
  for (const testRef of uniqueStrings(input.testRefs ?? [], 32)) {
    push({
      findingKind: "test_surface",
      fileRef: testRef,
      symbolRef: null,
      testRef,
      boundedSummary: `Context scout identified ${testRef} as a likely validation or test surface.`,
      downstreamUse: "Validation planning should consider this bounded test ref.",
      sourceToolId: "test.find_related",
      evidenceRefs: [
        `runtime-job://${input.runtimeJobId}/context-scout/test/${sha256(testRef).slice(0, 16)}`,
      ],
      rawFileContentStored: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    });
  }
  for (const pattern of uniqueStrings(input.existingPatterns ?? [], 24)) {
    push({
      findingKind: "existing_pattern",
      fileRef: null,
      symbolRef: null,
      testRef: null,
      boundedSummary: pattern,
      downstreamUse: "Implementation should preserve or reuse this existing repo pattern.",
      sourceToolId: "context.handoff",
      evidenceRefs: [],
      rawFileContentStored: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    });
  }
  for (const risk of uniqueStrings(input.risks ?? [], 24)) {
    push({
      findingKind: "risk",
      fileRef: null,
      symbolRef: null,
      testRef: null,
      boundedSummary: risk,
      downstreamUse: "Scheduler, implementer, and reviewer should carry this risk forward.",
      sourceToolId: "context.limitations",
      evidenceRefs: [],
      rawFileContentStored: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    });
  }
  for (const point of uniqueStrings(input.recommendedEditPoints ?? [], 32)) {
    push({
      findingKind: "edit_point",
      fileRef: point.split(":")[0] || null,
      symbolRef: point,
      testRef: null,
      boundedSummary: point,
      downstreamUse:
        "Implementation worker should use this as a focused edit or inspection candidate.",
      sourceToolId: "context.handoff",
      evidenceRefs: [],
      rawFileContentStored: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    });
  }
  for (const suggestion of uniqueStrings(input.validationSuggestions ?? [], 24)) {
    push({
      findingKind: "validation_hint",
      fileRef: null,
      symbolRef: null,
      testRef: null,
      boundedSummary: suggestion,
      downstreamUse: "Validation worker should consider this check after implementation.",
      sourceToolId: "test.find_related",
      evidenceRefs: [],
      rawFileContentStored: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    });
  }
  for (const missing of uniqueStrings(input.missingInformation ?? [], 12)) {
    push({
      findingKind: "missing_context",
      fileRef: null,
      symbolRef: null,
      testRef: null,
      boundedSummary: missing,
      downstreamUse:
        "Do not proceed as clean context success until this blocker is handled or explicitly accepted as a limitation.",
      sourceToolId: "context.request_more_context",
      evidenceRefs: [],
      rawFileContentStored: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    });
  }
  for (const resultRef of uniqueStrings(input.codeIntelligenceResultRefs ?? [], 32)) {
    push({
      findingKind: "code_intelligence",
      fileRef: null,
      symbolRef: null,
      testRef: null,
      boundedSummary: `Code intelligence result available for context scout handoff: ${resultRef}`,
      downstreamUse:
        "Downstream context synthesis, implementation, and validation should inspect this bounded code-intelligence ref before editing.",
      sourceToolId: "code.search_symbols",
      evidenceRefs: [resultRef],
      rawFileContentStored: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    });
  }
  for (const symbolRef of uniqueStrings(input.codeIntelligenceSymbolRefs ?? [], 40)) {
    const fileRef = symbolRef.split(":")[0] || null;
    push({
      findingKind: "symbol_summary",
      fileRef,
      symbolRef,
      testRef: null,
      boundedSummary: `Code intelligence identified ${symbolRef} as a bounded symbol candidate.`,
      downstreamUse:
        "Use this code-intelligence symbol ref to focus context synthesis and implementation handoff.",
      sourceToolId: "code.get_document_symbols",
      evidenceRefs: input.codeIntelligenceResultRefs?.slice(0, 4) ?? [],
      rawFileContentStored: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    });
  }
  for (const diagnosticRef of uniqueStrings(input.codeIntelligenceDiagnosticRefs ?? [], 24)) {
    push({
      findingKind: "diagnostic_surface",
      fileRef: diagnosticRef.split(":")[0] || null,
      symbolRef: null,
      testRef: null,
      boundedSummary: `Code intelligence surfaced diagnostic context: ${diagnosticRef}`,
      downstreamUse:
        "Validation and implementation workers should preserve or resolve this diagnostic surface as appropriate.",
      sourceToolId: "code.get_diagnostics",
      evidenceRefs: input.codeIntelligenceResultRefs?.slice(0, 4) ?? [],
      rawFileContentStored: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    });
  }
  for (const testRef of uniqueStrings(input.codeIntelligenceRelatedTestRefs ?? [], 24)) {
    push({
      findingKind: "test_surface",
      fileRef: testRef,
      symbolRef: null,
      testRef,
      boundedSummary: `Code intelligence identified ${testRef} as a related validation candidate.`,
      downstreamUse: "Validation planning should consider this code-intelligence related test ref.",
      sourceToolId: "code.find_related_tests",
      evidenceRefs: input.codeIntelligenceResultRefs?.slice(0, 4) ?? [],
      rawFileContentStored: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    });
  }
  for (const impactRef of uniqueStrings(input.codeIntelligenceImpactRefs ?? [], 24)) {
    push({
      findingKind: "impact_radius",
      fileRef: impactRef,
      symbolRef: null,
      testRef: null,
      boundedSummary: `Code intelligence identified bounded impact candidate: ${impactRef}`,
      downstreamUse:
        "Scheduler and reviewer should use this impact ref to reason about blast radius and follow-up checks.",
      sourceToolId: "code.find_impact_radius",
      evidenceRefs: input.codeIntelligenceResultRefs?.slice(0, 4) ?? [],
      rawFileContentStored: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    });
  }
  for (const limitation of uniqueStrings(input.codeIntelligenceLimitations ?? [], 12)) {
    push({
      findingKind: "risk",
      fileRef: null,
      symbolRef: null,
      testRef: null,
      boundedSummary: limitation,
      downstreamUse:
        "Treat code-intelligence mode limitations as context quality constraints, not hidden success.",
      sourceToolId: "code.search_symbols",
      evidenceRefs: input.codeIntelligenceResultRefs?.slice(0, 4) ?? [],
      rawFileContentStored: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    });
  }
  return findings.slice(0, 120);
}

export function buildContextScoutToolLoopRun(input: {
  runtimeJobId: string;
  graphId: string;
  nodeId: string;
  roleId: string;
  modelRef: string;
  targetCommitmentIds: string[];
  commitmentWorkPacketRefs: string[];
  requestedContextQuestions: string[];
  downstreamConsumer?: string;
  sourcePromptHash?: string | null;
  sourcePromptExcerptDecisionRefs?: string[];
  sourcePromptExcerptProvidedRefs?: string[];
  candidateFileRefs?: string[];
  expectedRepoAreaRefs?: string[];
  verifiedFileRefs?: ContextScoutVerifiedFileRef[];
  rejectedRefs?: ContextScoutRejectedRef[];
  runtimeToolInvocationRefs?: string[];
  codeIntelligenceResultRefs?: string[];
  codeIntelligenceRuntimeToolInvocationRefs?: string[];
  codeIntelligenceSymbolRefs?: string[];
  codeIntelligenceDiagnosticRefs?: string[];
  codeIntelligenceRelatedTestRefs?: string[];
  codeIntelligenceImpactRefs?: string[];
  codeIntelligenceSemanticModes?: string[];
  codeIntelligenceLimitations?: string[];
  contextHandoffPacketRef?: string | null;
  contextHandoffPacket?: ContextHandoffPacket | null;
  modelAuthoredSummary: string;
  limitations?: string[];
  repoAnalysisFindings?: ContextScoutRepoAnalysisFinding[];
  groundingReasonCodes?: string[];
}): ContextScoutToolLoopRun {
  const verifiedFileRefs = input.verifiedFileRefs ?? [];
  const expectedRepoAreaRefs = uniqueStrings(input.expectedRepoAreaRefs ?? [], 60);
  const candidateFileRefs = uniqueStrings(input.candidateFileRefs ?? [], 80);
  const coverageRelevantExpectedRefs = expectedRepoAreaRefs.filter(
    (ref) =>
      ref.startsWith("extensions/") ||
      ref.startsWith("src/") ||
      ref.startsWith("ui/") ||
      ref.startsWith("packages/"),
  );
  const verifiedFileRefValues = verifiedFileRefs.map((ref) => ref.fileRef);
  const verifiedCandidateRefs = candidateFileRefs.filter((candidateRef) =>
    verifiedFileRefValues.includes(candidateRef),
  );
  const coversExpectedRepoArea =
    coverageRelevantExpectedRefs.length === 0 ||
    coverageRelevantExpectedRefs.some((expectedRef) =>
      verifiedFileRefValues.some(
        (fileRef) =>
          fileRef === expectedRef ||
          (expectedRef.endsWith("/") && fileRef.startsWith(expectedRef)) ||
          (!expectedRef.endsWith("/") && fileRef.startsWith(`${expectedRef}/`)),
      ),
    ) ||
    verifiedCandidateRefs.length > 0;
  const hasHandoff = Boolean(input.contextHandoffPacketRef && input.contextHandoffPacket);
  const handoff = input.contextHandoffPacket;
  const substance = inspectContextScoutModelAuthoredHandoffSubstance({
    modelAuthoredSummary: input.modelAuthoredSummary,
    recommendedEditPoints: handoff?.recommendedEditPoints,
    existingPatterns: handoff?.existingPatterns,
    risks: handoff?.risks,
    validationSuggestions: handoff?.validationSuggestions,
  });
  const summaryLength = substance.summaryLength;
  const hasModelAuthoredHandoffSubstance = substance.hasModelAuthoredHandoffSubstance;
  const usedRuntimeVerifiedFallback =
    (input.limitations ?? []).includes(RUNTIME_VERIFIED_FALLBACK_LIMITATION) ||
    (input.groundingReasonCodes ?? []).includes("context_scout_tool_first_verified_context_used");
  const codeIntelligenceSemanticModes = uniqueStrings(input.codeIntelligenceSemanticModes ?? [], 8);
  const usedStructuralCodeIntelligenceOnly =
    codeIntelligenceSemanticModes.includes("structural") &&
    !codeIntelligenceSemanticModes.some(
      (mode) => mode === "typescript_semantic" || mode === "lsp_semantic",
    );
  const structurallyUsable =
    hasHandoff &&
    verifiedFileRefs.length > 0 &&
    summaryLength > 0 &&
    coversExpectedRepoArea &&
    hasModelAuthoredHandoffSubstance;
  const sufficiencyStatus: ContextSufficiencyReview["status"] = structurallyUsable
    ? usedRuntimeVerifiedFallback || usedStructuralCodeIntelligenceOnly
      ? "accepted_with_limitations"
      : "accepted"
    : usedRuntimeVerifiedFallback &&
        hasHandoff &&
        verifiedFileRefs.length > 0 &&
        coversExpectedRepoArea
      ? "needs_review_nonblocking"
      : "needs_repair";
  const repoAnalysisFindings = input.repoAnalysisFindings ?? [];
  const modelAuthoredFindingCount = repoAnalysisFindings.filter(
    (finding) =>
      finding.findingKind !== "file_summary" ||
      !finding.evidenceRefs.some((ref) => ref.includes("/runtime_verified_context/")),
  ).length;
  const synthesisReadiness: ContextScoutToolLoopRun["synthesisReadiness"] =
    structurallyUsable && sufficiencyStatus === "accepted"
      ? "ready_for_synthesis"
      : structurallyUsable && sufficiencyStatus === "accepted_with_limitations"
        ? "ready_with_limitations"
        : verifiedFileRefs.length > 0 || hasHandoff
          ? "needs_repair_before_synthesis"
          : "blocked_missing_context";
  const missingInformation = [
    ...(verifiedFileRefs.length === 0 ? ["No verified repo file refs were produced."] : []),
    ...(!coversExpectedRepoArea
      ? [
          "Verified repo refs did not cover the expected source repo areas from the CommitmentWorkPackets.",
        ]
      : []),
    ...(!hasHandoff ? ["No context handoff packet was produced."] : []),
    ...(!hasModelAuthoredHandoffSubstance
      ? [
          `Context scout handoff did not include enough model-authored implementation substance beyond runtime-supplied file refs. Missing or weak fields: ${substance.missingFieldPaths.join(", ") || "unknown"}.`,
        ]
      : []),
    ...(usedRuntimeVerifiedFallback
      ? [
          "Runtime-supplied verified file refs were used to ground the packet; this cannot count as clean context-scout success.",
        ]
      : []),
    ...(usedStructuralCodeIntelligenceOnly
      ? [
          "Code intelligence returned structural degraded mode only; semantic parity was unavailable and must be accepted as a limitation before implementation.",
        ]
      : []),
    ...(input.limitations ?? []),
  ].slice(0, 12);
  const sufficiencyReview = ContextSufficiencyReviewSchema.parse({
    reviewSource: "model_authored_context_scout_output",
    status: sufficiencyStatus,
    requiresSubstantiveContext: true,
    reviewerSummary: bounded(
      input.modelAuthoredSummary || "Context scout did not provide enough summary for handoff.",
      1_200,
    ),
    boundedSummary: bounded(
      input.modelAuthoredSummary || "Context scout did not provide enough summary for handoff.",
      1_200,
    ),
    boundedRationale: bounded(
      structurallyUsable
        ? "Context scout produced verified refs, a bounded handoff packet, and model-authored implementation substance covering the requested packet."
        : missingInformation.join(" "),
      1_500,
    ),
    sufficientForImplementation: structurallyUsable,
    sufficientForValidation: structurallyUsable,
    sufficientForReview: structurallyUsable,
    missingInformation,
    repairInstructions: structurallyUsable
      ? []
      : [
          "Request more bounded context, verify concrete repo refs, and emit model-authored implementation substance before implementation.",
        ],
    boundedRepairInstructions: bounded(
      structurallyUsable
        ? "No repair required."
        : "Request more bounded context, verify concrete repo refs, and emit model-authored implementation substance before implementation.",
      1_500,
    ),
    verifiedRefs: verifiedFileRefs,
    rejectedRefs: input.rejectedRefs ?? [],
    rejectedRuntimeOnlyRefs: (input.rejectedRefs ?? []).filter((ref) =>
      ref.reasonCodes.includes("context_scout_runtime_supplied_ref_rejected"),
    ),
    substantiveContextVerified: verifiedFileRefs.some(
      (ref) => ref.acceptedContextSource !== "runtime_supplied" && !ref.runtimeSuppliedRefRejected,
    ),
    stopIfMissingRefs: uniqueStrings(structurallyUsable ? [] : input.commitmentWorkPacketRefs, 8),
    rawFileContentStored: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  });
  const base = {
    artifactKind: "context_scout_tool_loop" as const,
    schemaVersion: "execution-platform.context-scout-tool-loop.v1" as const,
    loopId: `${input.nodeId}:${sha256({
      commitmentWorkPacketRefs: input.commitmentWorkPacketRefs,
      verifiedFileRefs: verifiedFileRefs.map((ref) => ref.fileRef),
      contextHandoffPacketRef: input.contextHandoffPacketRef ?? null,
    }).slice(0, 12)}`,
    loopRef: "pending",
    graphId: bounded(input.graphId, 180),
    nodeId: bounded(input.nodeId, 180),
    roleId: bounded(input.roleId, 120),
    modelRef: bounded(input.modelRef, 260),
    targetCommitmentIds: uniqueStrings(input.targetCommitmentIds, 24),
    commitmentWorkPacketRefs: uniqueStrings(input.commitmentWorkPacketRefs, 32),
    requestedContextQuestions: uniqueStrings(input.requestedContextQuestions, 24),
    downstreamConsumer: bounded(input.downstreamConsumer ?? "implementation_and_validation", 260),
    sourcePromptHash: input.sourcePromptHash ?? null,
    sourcePromptExcerptDecisionRefs: uniqueStrings(input.sourcePromptExcerptDecisionRefs ?? [], 24),
    sourcePromptExcerptProvidedRefs: uniqueStrings(input.sourcePromptExcerptProvidedRefs ?? [], 24),
    candidateFileRefs,
    expectedRepoAreaRefs,
    repoAnalysisFindings,
    modelAuthoredFindingCount,
    synthesisReadiness,
    synthesisBlockers: structurallyUsable ? [] : missingInformation,
    verifiedFileRefs,
    rejectedRefs: input.rejectedRefs ?? [],
    runtimeToolInvocationRefs: uniqueStrings(input.runtimeToolInvocationRefs ?? [], 80),
    codeIntelligenceResultRefs: uniqueStrings(input.codeIntelligenceResultRefs ?? [], 80),
    codeIntelligenceRuntimeToolInvocationRefs: uniqueStrings(
      input.codeIntelligenceRuntimeToolInvocationRefs ?? [],
      80,
    ),
    codeIntelligenceSymbolRefs: uniqueStrings(input.codeIntelligenceSymbolRefs ?? [], 80),
    codeIntelligenceDiagnosticRefs: uniqueStrings(input.codeIntelligenceDiagnosticRefs ?? [], 80),
    codeIntelligenceRelatedTestRefs: uniqueStrings(input.codeIntelligenceRelatedTestRefs ?? [], 80),
    codeIntelligenceImpactRefs: uniqueStrings(input.codeIntelligenceImpactRefs ?? [], 80),
    codeIntelligenceSemanticModes,
    codeIntelligenceLimitations: uniqueStrings(input.codeIntelligenceLimitations ?? [], 16),
    contextHandoffPacketRef: input.contextHandoffPacketRef ?? null,
    contextHandoffPacketHash: input.contextHandoffPacket
      ? sha256(input.contextHandoffPacket)
      : null,
    sufficiencyReview,
    reasonCodes: uniqueStrings(
      [
        sufficiencyStatus === "accepted"
          ? "context_scout_tool_loop_accepted"
          : sufficiencyStatus === "accepted_with_limitations"
            ? "context_scout_tool_loop_accepted_with_limitations"
            : sufficiencyStatus === "needs_review_nonblocking"
              ? "context_scout_tool_loop_needs_review_nonblocking"
              : "context_scout_tool_loop_needs_repair",
        ...(hasModelAuthoredHandoffSubstance
          ? ["context_scout_model_authored_handoff_substance_present"]
          : [
              "context_scout_model_authored_handoff_substance_missing",
              ...substance.reasonCodes.slice(1, 4),
            ]),
        ...(usedRuntimeVerifiedFallback ? ["context_scout_runtime_verified_fallback_used"] : []),
        ...(usedStructuralCodeIntelligenceOnly
          ? ["context_scout_structural_code_intelligence_limitation_used"]
          : []),
        ...(input.groundingReasonCodes ?? []),
      ],
      40,
    ),
    rawPromptStored: false as const,
    rawResponseStored: false as const,
    rawProviderLogStored: false as const,
    rawToolLogStored: false as const,
    rawFileContentStored: false as const,
  };
  return ContextScoutToolLoopRunSchema.parse({
    ...base,
    loopRef: loopRef("context-scout-tool-loop", base.loopId, base),
  });
}

export function validateContextScoutToolLoopForImplementation(
  run: ContextScoutToolLoopRun | null | undefined,
): { valid: boolean; reasonCodes: string[] } {
  if (!run) {
    return { valid: false, reasonCodes: ["context_scout_tool_loop_missing"] };
  }
  const reasonCodes: string[] = [];
  if (!contextScoutSufficiencyAllowsImplementation(run.sufficiencyReview)) {
    reasonCodes.push("context_scout_sufficiency_not_accepted");
  }
  if (run.sufficiencyReview.status === "accepted_with_limitations") {
    reasonCodes.push("context_scout_accepted_with_limitations");
  }
  if (run.sufficiencyReview.status === "needs_review_nonblocking") {
    reasonCodes.push("context_scout_needs_review_nonblocking");
  }
  if (!run.sufficiencyReview.sufficientForImplementation) {
    reasonCodes.push("context_scout_not_sufficient_for_implementation");
  }
  if (run.verifiedFileRefs.length === 0) {
    reasonCodes.push("context_scout_verified_file_refs_missing");
  }
  if (!run.contextHandoffPacketRef) {
    reasonCodes.push("context_scout_handoff_packet_missing");
  }
  const blockingReasonCodes = reasonCodes.filter(
    (reasonCode) => reasonCode !== "context_scout_accepted_with_limitations",
  );
  return { valid: blockingReasonCodes.length === 0, reasonCodes };
}

export function summarizeContextScoutToolLoopRun(run: ContextScoutToolLoopRun): JsonValue {
  return {
    artifactKind: run.artifactKind,
    loopRef: run.loopRef,
    graphId: run.graphId,
    nodeId: run.nodeId,
    roleId: run.roleId,
    modelRef: run.modelRef,
    targetCommitmentIds: run.targetCommitmentIds,
    commitmentWorkPacketRefs: run.commitmentWorkPacketRefs,
    verifiedFileRefs: run.verifiedFileRefs.map((ref) => ref.fileRef),
    rejectedRefs: run.rejectedRefs.map((ref) => ref.ref),
    runtimeToolInvocationRefs: run.runtimeToolInvocationRefs,
    codeIntelligenceResultRefs: run.codeIntelligenceResultRefs,
    codeIntelligenceRuntimeToolInvocationRefs: run.codeIntelligenceRuntimeToolInvocationRefs,
    codeIntelligenceSymbolRefs: run.codeIntelligenceSymbolRefs,
    codeIntelligenceDiagnosticRefs: run.codeIntelligenceDiagnosticRefs,
    codeIntelligenceRelatedTestRefs: run.codeIntelligenceRelatedTestRefs,
    codeIntelligenceImpactRefs: run.codeIntelligenceImpactRefs,
    codeIntelligenceSemanticModes: run.codeIntelligenceSemanticModes,
    codeIntelligenceLimitations: run.codeIntelligenceLimitations,
    repoAnalysisFindingCount: run.repoAnalysisFindings.length,
    modelAuthoredFindingCount: run.modelAuthoredFindingCount,
    synthesisReadiness: run.synthesisReadiness,
    synthesisBlockers: run.synthesisBlockers,
    repoAnalysisFindings: run.repoAnalysisFindings
      .map((finding) => ({
        findingId: finding.findingId,
        findingKind: finding.findingKind,
        fileRef: finding.fileRef,
        symbolRef: finding.symbolRef,
        testRef: finding.testRef,
        boundedSummary: finding.boundedSummary,
        downstreamUse: finding.downstreamUse,
        sourceToolId: finding.sourceToolId,
        evidenceRefs: finding.evidenceRefs,
        rawFileContentStored: false,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      }))
      .slice(0, 40),
    contextHandoffPacketRef: run.contextHandoffPacketRef,
    sufficiencyStatus: run.sufficiencyReview.status,
    sufficiencySummary: run.sufficiencyReview.reviewerSummary,
    missingInformation: run.sufficiencyReview.missingInformation,
    repairInstructions: run.sufficiencyReview.repairInstructions,
    reasonCodes: run.reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  } satisfies JsonValue;
}
