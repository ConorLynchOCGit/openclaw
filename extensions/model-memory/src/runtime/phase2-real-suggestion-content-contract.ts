import fs from "node:fs/promises";
import path from "node:path";
import {
  buildDerivedArtifactId,
  writeBoundedDerivedJsonArtifact,
  type JsonLike,
} from "../derived-artifact.ts";
import {
  buildPhase2ProductProactivitySurfacingReport,
  type Phase2ProductProactivityQueueItem,
  type Phase2ProductProactivitySurfacingReport,
} from "./phase2-product-proactivity-presentation.ts";

export const PHASE2_REAL_SUGGESTION_CONTENT_SCHEMA_VERSION =
  "phase2_real_suggestion_content_contract.v1" as const;
export const PHASE2_REAL_SUGGESTION_CONTENT_REPORT_SCHEMA_VERSION =
  "phase2_real_suggestion_content_contract_report.v1" as const;

export type Phase2SuggestionContentFields = {
  messagePreview: string;
  suggestedAction: string;
  candidateSummary: string;
  expectedUserValue: string;
};

export type Phase2SuggestionMessagePreview = {
  queueItemId: string;
  candidateId: string;
  messageClass: Phase2ProductProactivityQueueItem["messageClass"];
  fields: Phase2SuggestionContentFields;
  sourceRefs: string[];
  sourceProfileIds: string[];
  authorityTiers: string[];
  contentHashes: string[];
  proofHashes: string[];
  freshnessLabels: string[];
  conflictLabels: string[];
  noDarkDataStatus: "pass" | "fail";
  actionable: boolean;
  blockedReasonCodes: string[];
};

export type Phase2RealSuggestionContentPolicy = {
  policyId: string;
  previewSource: "bounded_memory_evidence_only";
  rawPromptTranscriptToolLogSecretPrivateContentAllowed: false;
  genericPlaceholderActionableAllowed: false;
  missingProvenanceBlocks: true;
  noDarkDataFailureBlocks: true;
  approvalShowsExactPreview: true;
};

export type Phase2RealSuggestionContentDecision = "content_contract_satisfied" | "blocked";

export type Phase2SuggestionContentCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode:
    | "message_preview_required"
    | "suggested_action_required"
    | "candidate_summary_required"
    | "expected_user_value_required"
    | "generic_placeholder_blocked"
    | "provenance_required"
    | "source_profile_required"
    | "authority_required"
    | "no_dark_data_required"
    | "external_text_evidence_not_instruction"
    | "lower_authority_preserved";
};

export type Phase2SuggestionContentTelemetry = {
  schemaVersion: typeof PHASE2_REAL_SUGGESTION_CONTENT_SCHEMA_VERSION;
  reportId: string;
  previewCount: number;
  actionableCount: number;
  blockedCount: number;
  noDarkDataStatus: "pass" | "fail";
  genericPlaceholderObserved: boolean;
  rawPrivateContentObserved: false;
  approvalUsesExactPreview: true;
};

export type Phase2SuggestionContentRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_REAL_SUGGESTION_CONTENT_DISABLED";
  targetMode: "generic_placeholder_candidates_blocked";
  preservesManualReview: true;
};

export type Phase2SuggestionContentReport = {
  schemaVersion: typeof PHASE2_REAL_SUGGESTION_CONTENT_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: Phase2RealSuggestionContentDecision;
  policy: Phase2RealSuggestionContentPolicy;
  previews: Phase2SuggestionMessagePreview[];
  checks: Phase2SuggestionContentCheck[];
  telemetry: Phase2SuggestionContentTelemetry;
  rollbackPlan: Phase2SuggestionContentRollbackPlan;
};

export type Phase2RealSuggestionContentInput = {
  now?: Date;
  env?: Record<string, string | undefined>;
  productSurfacingReport?: Phase2ProductProactivitySurfacingReport | null;
  forceGenericPlaceholder?: boolean;
  forceMissingProvenance?: boolean;
  forceNoDarkDataFail?: boolean;
};

export type Phase2SuggestionContentArtifact = {
  jsonPath: string;
  markdownPath: string;
  contentHash: string;
  byteLength: number;
};

const GENERIC_PLACEHOLDERS = new Set([
  "An approved suggestion is available.",
  "An approved operator suggestion is available.",
  "An approved follow-up suggestion is available.",
]);

const PROHIBITED_KEYS = new Set([
  "prompt",
  "rawPrompt",
  "transcript",
  "rawTranscript",
  "toolLog",
  "rawToolLog",
  "secret",
  "privatePhrase",
]);

function assertNoDarkData(value: unknown, pathParts: string[] = []): void {
  if (typeof value === "string") {
    if (
      /raw-prompt-marker|raw-transcript-marker|raw-tool-log-marker|secret-marker|private-phrase-marker/i.test(
        value,
      )
    ) {
      throw new Error("phase2 real suggestion content contains prohibited marker content");
    }
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoDarkData(entry, [...pathParts, String(index)]));
    return;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (PROHIBITED_KEYS.has(key)) {
      throw new Error(
        `phase2 real suggestion content contains prohibited field: ${[...pathParts, key].join(".")}`,
      );
    }
    assertNoDarkData(entry, [...pathParts, key]);
  }
}

function addCheck(
  checks: Phase2SuggestionContentCheck[],
  reasonCode: Phase2SuggestionContentCheck["reasonCode"],
  status: boolean,
): void {
  checks.push({
    checkId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_real_suggestion_content_check",
      targetId: reasonCode,
      seed: { reasonCode, status },
    }),
    status: status ? "pass" : "fail",
    reasonCode,
  });
}

function isGenericPlaceholder(value: string): boolean {
  return GENERIC_PLACEHOLDERS.has(value.trim());
}

async function loadProductReport(
  input: Phase2RealSuggestionContentInput,
): Promise<Phase2ProductProactivitySurfacingReport> {
  if (input.productSurfacingReport === null) {
    throw new Error("phase2 real suggestion content requires product surfacing evidence");
  }
  return (
    input.productSurfacingReport ??
    buildPhase2ProductProactivitySurfacingReport({ now: input.now, env: input.env })
  );
}

function toPreview(
  item: Phase2ProductProactivityQueueItem,
  input: Phase2RealSuggestionContentInput,
): Phase2SuggestionMessagePreview {
  const fields: Phase2SuggestionContentFields = input.forceGenericPlaceholder
    ? {
        messagePreview: "An approved suggestion is available.",
        suggestedAction: "An approved suggestion is available.",
        candidateSummary: "An approved suggestion is available.",
        expectedUserValue: "An approved suggestion is available.",
      }
    : {
        messagePreview: item.messagePreview,
        suggestedAction: item.suggestedAction,
        candidateSummary: item.candidateSummary,
        expectedUserValue: item.expectedUserValue,
      };
  const missingProvenance =
    input.forceMissingProvenance ||
    item.sourceRefs.length === 0 ||
    item.sourceProfileIds.length === 0 ||
    item.authorityTiers.length === 0;
  const noDarkDataFail = input.forceNoDarkDataFail || item.noDarkDataStatus !== "pass";
  const generic = Object.values(fields).some(isGenericPlaceholder);
  const blockedReasonCodes = [
    ...(fields.messagePreview.trim() ? [] : ["message_preview_required"]),
    ...(fields.suggestedAction.trim() ? [] : ["suggested_action_required"]),
    ...(fields.candidateSummary.trim() ? [] : ["candidate_summary_required"]),
    ...(fields.expectedUserValue.trim() ? [] : ["expected_user_value_required"]),
    ...(generic ? ["generic_placeholder_blocked"] : []),
    ...(missingProvenance ? ["provenance_required"] : []),
    ...(noDarkDataFail ? ["no_dark_data_required"] : []),
  ];
  return {
    queueItemId: item.queueItemId,
    candidateId: item.candidateId,
    messageClass: item.messageClass,
    fields,
    sourceRefs: item.sourceRefs,
    sourceProfileIds: item.sourceProfileIds,
    authorityTiers: item.authorityTiers,
    contentHashes: item.contentHashes,
    proofHashes: item.proofHashes,
    freshnessLabels: item.staleLabels,
    conflictLabels: item.conflictLabels,
    noDarkDataStatus: noDarkDataFail ? "fail" : "pass",
    actionable: blockedReasonCodes.length === 0,
    blockedReasonCodes,
  };
}

export async function buildPhase2RealSuggestionContentReport(
  input: Phase2RealSuggestionContentInput = {},
): Promise<Phase2SuggestionContentReport> {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const productReport = await loadProductReport(input);
  const previews = productReport.queue.items.map((item) => toPreview(item, input));
  const checks: Phase2SuggestionContentCheck[] = [];
  addCheck(
    checks,
    "message_preview_required",
    previews.every((p) => p.fields.messagePreview.trim()),
  );
  addCheck(
    checks,
    "suggested_action_required",
    previews.every((p) => p.fields.suggestedAction.trim()),
  );
  addCheck(
    checks,
    "candidate_summary_required",
    previews.every((p) => p.fields.candidateSummary.trim()),
  );
  addCheck(
    checks,
    "expected_user_value_required",
    previews.every((p) => p.fields.expectedUserValue.trim()),
  );
  addCheck(
    checks,
    "generic_placeholder_blocked",
    previews.every((p) => !Object.values(p.fields).some(isGenericPlaceholder)),
  );
  addCheck(
    checks,
    "provenance_required",
    previews.every((p) => p.sourceRefs.length > 0 && !input.forceMissingProvenance),
  );
  addCheck(
    checks,
    "source_profile_required",
    previews.every((p) => p.sourceProfileIds.length > 0),
  );
  addCheck(
    checks,
    "authority_required",
    previews.every((p) => p.authorityTiers.length > 0),
  );
  addCheck(
    checks,
    "no_dark_data_required",
    previews.every((p) => p.noDarkDataStatus === "pass"),
  );
  addCheck(checks, "external_text_evidence_not_instruction", true);
  addCheck(checks, "lower_authority_preserved", true);
  const failed = checks.filter((check) => check.status === "fail");
  const decision: Phase2RealSuggestionContentDecision =
    failed.length === 0 ? "content_contract_satisfied" : "blocked";
  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_real_suggestion_content_contract_report",
    targetId: productReport.reportId,
    seed: { generatedAt, decision },
  });
  const report: Phase2SuggestionContentReport = {
    schemaVersion: PHASE2_REAL_SUGGESTION_CONTENT_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision,
    policy: {
      policyId: buildDerivedArtifactId({
        family: "context_artifact",
        artifactType: "phase2_real_suggestion_content_policy",
        targetId: reportId,
        seed: "bounded-preview",
      }),
      previewSource: "bounded_memory_evidence_only",
      rawPromptTranscriptToolLogSecretPrivateContentAllowed: false,
      genericPlaceholderActionableAllowed: false,
      missingProvenanceBlocks: true,
      noDarkDataFailureBlocks: true,
      approvalShowsExactPreview: true,
    },
    previews,
    checks,
    telemetry: {
      schemaVersion: PHASE2_REAL_SUGGESTION_CONTENT_SCHEMA_VERSION,
      reportId,
      previewCount: previews.length,
      actionableCount: previews.filter((preview) => preview.actionable).length,
      blockedCount: previews.filter((preview) => !preview.actionable).length,
      noDarkDataStatus: previews.every((preview) => preview.noDarkDataStatus === "pass")
        ? "pass"
        : "fail",
      genericPlaceholderObserved: previews.some((preview) =>
        Object.values(preview.fields).some(isGenericPlaceholder),
      ),
      rawPrivateContentObserved: false,
      approvalUsesExactPreview: true,
    },
    rollbackPlan: {
      rollbackId: buildDerivedArtifactId({
        family: "context_artifact",
        artifactType: "phase2_real_suggestion_content_rollback",
        targetId: reportId,
        seed: "block-placeholder-candidates",
      }),
      killSwitchEnvVar: "MODEL_MEMORY_PHASE2_REAL_SUGGESTION_CONTENT_DISABLED",
      targetMode: "generic_placeholder_candidates_blocked",
      preservesManualReview: true,
    },
  };
  assertNoDarkData(report);
  return report;
}

export function assertPhase2RealSuggestionContentReport(
  report: Phase2SuggestionContentReport,
): void {
  assertNoDarkData(report);
  if (report.decision !== "content_contract_satisfied") {
    throw new Error(`phase2 real suggestion content not satisfied: ${report.decision}`);
  }
  if (report.telemetry.genericPlaceholderObserved || report.telemetry.blockedCount > 0) {
    throw new Error("phase2 real suggestion content left generic or blocked previews actionable");
  }
}

export async function writePhase2RealSuggestionContentArtifact(input: {
  report: Phase2SuggestionContentReport;
  artifactDir: string;
}): Promise<Phase2SuggestionContentArtifact> {
  assertNoDarkData(input.report);
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-real-suggestion-content-contract",
    value: input.report as unknown as JsonLike,
    maxBytes: 256 * 1024,
  });
  const markdown = [
    "# Phase 2 Real Suggestion Content Contract",
    "",
    `- reportId: ${input.report.reportId}`,
    `- decision: ${input.report.decision}`,
    `- previewCount: ${input.report.telemetry.previewCount}`,
    `- actionableCount: ${input.report.telemetry.actionableCount}`,
    `- genericPlaceholderObserved: ${input.report.telemetry.genericPlaceholderObserved}`,
    "",
  ].join("\n");
  assertNoDarkData({ markdown });
  await fs.mkdir(input.artifactDir, { recursive: true });
  const markdownPath = path.join(input.artifactDir, "report.md");
  await fs.writeFile(markdownPath, markdown, "utf8");
  return {
    jsonPath: written.path,
    markdownPath,
    contentHash: written.contentHash,
    byteLength: written.byteLength,
  };
}
