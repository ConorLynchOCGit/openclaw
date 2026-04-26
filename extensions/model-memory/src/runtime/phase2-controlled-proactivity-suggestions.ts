import fs from "node:fs/promises";
import path from "node:path";
import {
  buildDerivedArtifactId,
  uniqueSortedStrings,
  writeBoundedDerivedJsonArtifact,
  type JsonLike,
} from "../derived-artifact.ts";
import type { SourceAuthorityTier, SourceProfileId } from "../source-authority.ts";
import {
  buildPhase2ProactivityBoundaryReport,
  type Phase2ProactivityBoundaryInput,
  type Phase2ProactivityBoundaryReport,
  type Phase2ProactivityOutputClassification,
  type Phase2ProactivitySuggestion,
} from "./phase2-proactivity-action-boundary.ts";

export const PHASE2_CONTROLLED_PROACTIVITY_SUGGESTIONS_SCHEMA_VERSION =
  "phase2_controlled_proactivity_suggestions.v1" as const;
export const PHASE2_CONTROLLED_PROACTIVITY_SUGGESTIONS_REPORT_SCHEMA_VERSION =
  "phase2_controlled_proactivity_suggestions_report.v1" as const;

export type Phase2ControlledProactivitySuggestionDecision =
  | "controlled_suggestions_observed"
  | "outside_scope_report_only"
  | "rollback_disabled"
  | "blocked";

export type Phase2ControlledProactivitySuggestionConfig = {
  schemaVersion: typeof PHASE2_CONTROLLED_PROACTIVITY_SUGGESTIONS_SCHEMA_VERSION;
  configId: string;
  configHash: string;
  mode: "explicit_operator_eval";
  enabled: boolean;
  approvedScope: {
    sessionKey: string;
    operatorId: string;
    projectId: string;
  };
  defaultVisibleToOperators: false;
  userFacingProactiveMessagesEnabled: false;
  actionExecutionEnabled: false;
};

export type Phase2ControlledProactivitySuggestionPolicy = {
  schemaVersion: typeof PHASE2_CONTROLLED_PROACTIVITY_SUGGESTIONS_SCHEMA_VERSION;
  policyId: string;
  allowedEvidenceArtifactKinds: string[];
  allowedSuggestionCategories: Phase2ProactivityOutputClassification[];
  allowedSourceProfileIds: SourceProfileId[];
  allowedAuthorityTiers: SourceAuthorityTier[];
  maxEvidenceCount: number;
  maxSuggestionCount: number;
  maxEstimatedTokens: number;
  requireExplicitOperatorEvalScope: true;
  excludeInspectionOnly: true;
  blockStale: true;
  blockConflicts: true;
  requireNoDarkDataPass: true;
  prohibitUserFacingProactiveMessages: true;
  prohibitActionExecution: true;
  externalTextHandling: "evidence_not_instruction";
};

export type Phase2ControlledProactivitySuggestionEvidence = {
  evidenceId: string;
  sourceOutputId: string;
  evidenceArtifactIds: string[];
  sourceRefIds: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  semanticTruth: false;
  externalImperativeTextHandling: "evidence_not_instruction";
};

export type Phase2ControlledProactivitySuggestion = {
  suggestionId: string;
  sourceOutputId: string;
  classification: "report_only" | "suggestion_only";
  category: "operator_review" | "bounded_follow_up";
  evidence: Phase2ControlledProactivitySuggestionEvidence[];
  reasonCodes: string[];
  estimatedTokens: number;
  operatorVisibleReportOnly: true;
  userFacingProactiveMessage: false;
  hiddenChatInjection: false;
  actionExecution: "none";
};

export type Phase2ControlledProactivityRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_CONTROLLED_PROACTIVITY_SUGGESTIONS_DISABLED";
  targetMode: "planner_operator_reports_only";
  disablesControlledSuggestions: true;
};

export type Phase2ControlledProactivitySuggestionTelemetry = {
  schemaVersion: typeof PHASE2_CONTROLLED_PROACTIVITY_SUGGESTIONS_SCHEMA_VERSION;
  reportId: string;
  decision: Phase2ControlledProactivitySuggestionDecision;
  matchedScope: boolean;
  boundaryReportId?: string;
  suggestionIds: string[];
  blockedOutputIds: string[];
  evidenceArtifactIds: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  sourceRefIds: string[];
  contentHashes: string[];
  proofHashes: string[];
  reasonCodes: string[];
  noDarkDataStatus: "pass" | "fail";
  rollbackObserved: boolean;
  userFacingProactiveMessagesSent: false;
  actionExecutionObserved: false;
  hiddenChatInjectionObserved: false;
};

export type Phase2ControlledProactivitySuggestionCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode: string;
};

export type Phase2ControlledProactivitySuggestionReport = {
  schemaVersion: typeof PHASE2_CONTROLLED_PROACTIVITY_SUGGESTIONS_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: Phase2ControlledProactivitySuggestionDecision;
  config: Phase2ControlledProactivitySuggestionConfig;
  policy: Phase2ControlledProactivitySuggestionPolicy;
  boundaryReportId?: string;
  suggestions: Phase2ControlledProactivitySuggestion[];
  checks: Phase2ControlledProactivitySuggestionCheck[];
  rollbackPlan: Phase2ControlledProactivityRollbackPlan;
  noDarkDataStatus: "pass" | "fail";
  telemetry: Phase2ControlledProactivitySuggestionTelemetry;
  uiEvidence?: {
    sessionKey: string;
    proofMarker: string;
    outsideScopeRunId?: string | null;
    insideScopeRunId?: string | null;
    rollbackRunId?: string | null;
    terminalEvidence: boolean;
    assistantTextSha256?: string;
  };
};

export type Phase2ControlledProactivitySuggestionInput = Omit<
  Phase2ProactivityBoundaryInput,
  "uiEvidence"
> & {
  boundaryReport?: Phase2ProactivityBoundaryReport | null;
  requestScope?: {
    sessionKey: string;
    operatorId: string;
    projectId: string;
    purpose: "operator_eval" | "ordinary_chat";
  };
  approvedScope?: {
    sessionKey: string;
    operatorId: string;
    projectId: string;
  };
  env?: Record<string, string | undefined>;
  uiEvidence?: Phase2ControlledProactivitySuggestionReport["uiEvidence"];
};

export type Phase2ControlledProactivitySuggestionArtifact = {
  jsonPath: string;
  markdownPath: string;
  contentHash: string;
  byteLength: number;
};

const DEFAULT_SCOPE = {
  sessionKey: "main",
  operatorId: "phase2-operator",
  projectId: "openclaw",
} as const;

const PROHIBITED_KEYS = new Set([
  "raw_prompt",
  "rawPrompt",
  "promptText",
  "full_transcript",
  "fullTranscript",
  "raw_transcript",
  "rawTranscript",
  "raw_tool_log",
  "rawToolLog",
  "secret",
  "secrets",
  "private_phrase",
  "privatePhrase",
]);

const PROHIBITED_MARKER_PARTS = [
  ["raw", "-", "prompt", "-", "marker"],
  ["raw", "-", "transcript", "-", "marker"],
  ["raw", "-", "tool", "-", "log", "-", "marker"],
  ["secret", "-", "marker"],
  ["private", "-", "phrase", "-", "marker"],
] as const;

function clone<T extends JsonLike>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function assertNoProhibitedKeys(value: unknown, pathParts: string[] = []): void {
  if (!value || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoProhibitedKeys(entry, [...pathParts, String(index)]));
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (PROHIBITED_KEYS.has(key)) {
      throw new Error(
        `phase2 controlled proactivity suggestions contain prohibited field: ${[
          ...pathParts,
          key,
        ].join(".")}`,
      );
    }
    assertNoProhibitedKeys(nested, [...pathParts, key]);
  }
}

function assertNoDarkData(value: unknown): void {
  assertNoProhibitedKeys(value);
  const serialized = JSON.stringify(value).toLowerCase();
  for (const parts of PROHIBITED_MARKER_PARTS) {
    if (serialized.includes(parts.join(""))) {
      throw new Error(
        "phase2 controlled proactivity suggestions contain prohibited marker content",
      );
    }
  }
}

function addCheck(
  checks: Phase2ControlledProactivitySuggestionCheck[],
  checkId: string,
  condition: boolean,
  reasonCode: string,
): void {
  checks.push({ checkId, status: condition ? "pass" : "fail", reasonCode });
}

function readKillSwitch(env: Record<string, string | undefined> | undefined): boolean {
  const value = env?.MODEL_MEMORY_PHASE2_CONTROLLED_PROACTIVITY_SUGGESTIONS_DISABLED;
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "on";
}

function scopeMatches(input: Phase2ControlledProactivitySuggestionInput): boolean {
  const request = input.requestScope;
  const approved = input.approvedScope ?? DEFAULT_SCOPE;
  return (
    request?.purpose === "operator_eval" &&
    request.sessionKey === approved.sessionKey &&
    request.operatorId === approved.operatorId &&
    request.projectId === approved.projectId
  );
}

function buildPolicy(input: {
  generatedAt: string;
  boundaryReport?: Phase2ProactivityBoundaryReport;
}): Phase2ControlledProactivitySuggestionPolicy {
  return {
    schemaVersion: PHASE2_CONTROLLED_PROACTIVITY_SUGGESTIONS_SCHEMA_VERSION,
    policyId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_controlled_proactivity_suggestions_policy",
      targetId: "planner",
      seed: {
        generatedAt: input.generatedAt,
        boundaryReportId: input.boundaryReport?.reportId ?? null,
      },
    }),
    allowedEvidenceArtifactKinds: [
      "planner_default_operator_report",
      "runtime_graph_summary",
      "project_state_capsule",
      "retrieval_pack",
      "hierarchical_plan",
      "project_doc",
      "rollout_proof_report",
    ],
    allowedSuggestionCategories: ["report_only", "suggestion_only"],
    allowedSourceProfileIds: uniqueSortedStrings(
      input.boundaryReport?.telemetry.sourceProfileIds ?? [],
    ) as SourceProfileId[],
    allowedAuthorityTiers: uniqueSortedStrings(
      input.boundaryReport?.telemetry.authorityTiers ?? [],
    ) as SourceAuthorityTier[],
    maxEvidenceCount: 24,
    maxSuggestionCount: 6,
    maxEstimatedTokens: 2_000,
    requireExplicitOperatorEvalScope: true,
    excludeInspectionOnly: true,
    blockStale: true,
    blockConflicts: true,
    requireNoDarkDataPass: true,
    prohibitUserFacingProactiveMessages: true,
    prohibitActionExecution: true,
    externalTextHandling: "evidence_not_instruction",
  };
}

function buildConfig(input: {
  generatedAt: string;
  approvedScope: Phase2ControlledProactivitySuggestionConfig["approvedScope"];
  enabled: boolean;
  policyId: string;
}): Phase2ControlledProactivitySuggestionConfig {
  const seed = {
    generatedAt: input.generatedAt,
    approvedScope: input.approvedScope,
    enabled: input.enabled,
    policyId: input.policyId,
  };
  const configId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_controlled_proactivity_suggestions_config",
    targetId: input.approvedScope.projectId,
    seed,
  });
  return {
    schemaVersion: PHASE2_CONTROLLED_PROACTIVITY_SUGGESTIONS_SCHEMA_VERSION,
    configId,
    configHash: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_controlled_proactivity_suggestions_config_hash",
      targetId: configId,
      seed,
    }),
    mode: "explicit_operator_eval",
    enabled: input.enabled,
    approvedScope: input.approvedScope,
    defaultVisibleToOperators: false,
    userFacingProactiveMessagesEnabled: false,
    actionExecutionEnabled: false,
  };
}

function evidenceFromOutput(input: {
  output: Phase2ProactivitySuggestion;
  generatedAt: string;
}): Phase2ControlledProactivitySuggestionEvidence {
  return {
    evidenceId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_controlled_proactivity_suggestion_evidence",
      targetId: input.output.outputId,
      seed: input.generatedAt,
    }),
    sourceOutputId: input.output.outputId,
    evidenceArtifactIds: [...input.output.evidenceArtifactIds],
    sourceRefIds: [...input.output.sourceRefIds],
    sourceProfileIds: [...input.output.sourceProfileIds],
    authorityTiers: [...input.output.authorityTiers],
    contentHashes: [...input.output.contentHashes],
    proofHashes: [...input.output.proofHashes],
    semanticTruth: false,
    externalImperativeTextHandling: "evidence_not_instruction",
  };
}

function suggestionFromBoundaryOutput(input: {
  output: Phase2ProactivitySuggestion;
  generatedAt: string;
}): Phase2ControlledProactivitySuggestion {
  const evidence = evidenceFromOutput(input);
  const classification =
    input.output.classification === "report_only" ? "report_only" : "suggestion_only";
  return {
    suggestionId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_controlled_proactivity_suggestion",
      targetId: input.output.outputId,
      seed: input.generatedAt,
    }),
    sourceOutputId: input.output.outputId,
    classification,
    category: classification === "report_only" ? "operator_review" : "bounded_follow_up",
    evidence: [evidence],
    reasonCodes: uniqueSortedStrings([
      ...input.output.reasonCodes,
      "controlled_operator_eval_scope",
      "operator_visible_report_only",
      "no_user_facing_proactivity",
      "no_action_execution",
    ]),
    estimatedTokens: Math.max(128, evidence.evidenceArtifactIds.length * 96),
    operatorVisibleReportOnly: true,
    userFacingProactiveMessage: false,
    hiddenChatInjection: false,
    actionExecution: "none",
  };
}

export async function buildPhase2ControlledProactivitySuggestionReport(
  input: Phase2ControlledProactivitySuggestionInput = {},
): Promise<Phase2ControlledProactivitySuggestionReport> {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const killed = readKillSwitch(input.env);
  const matchedScope = scopeMatches(input);
  const boundaryReport =
    input.boundaryReport === null
      ? undefined
      : (input.boundaryReport ??
        (await buildPhase2ProactivityBoundaryReport({
          ...input,
          uiEvidence: undefined,
        })));
  const policy = buildPolicy({ generatedAt, boundaryReport });
  const approvedScope = input.approvedScope ?? { ...DEFAULT_SCOPE };
  const eligible =
    matchedScope &&
    !killed &&
    boundaryReport?.decision === "boundary_observed" &&
    boundaryReport.noDarkDataStatus === "pass" &&
    !boundaryReport.telemetry.proactiveUserMessagesSent &&
    !boundaryReport.telemetry.actionExecutionObserved;
  const config = buildConfig({
    generatedAt,
    approvedScope,
    enabled: eligible,
    policyId: policy.policyId,
  });
  const checks: Phase2ControlledProactivitySuggestionCheck[] = [];
  addCheck(
    checks,
    "scope:explicit_operator_eval",
    matchedScope,
    "explicit_operator_eval_scope_required",
  );
  addCheck(
    checks,
    "boundary:observed",
    boundaryReport?.decision === "boundary_observed",
    "proactivity_boundary_observed_required",
  );
  addCheck(
    checks,
    "no_dark_data:pass",
    boundaryReport?.noDarkDataStatus === "pass",
    "no_dark_data_required",
  );
  addCheck(
    checks,
    "messages:user_facing_disabled",
    boundaryReport?.telemetry.proactiveUserMessagesSent === false,
    "no_user_facing_proactivity",
  );
  addCheck(
    checks,
    "actions:execution_disabled",
    boundaryReport?.telemetry.actionExecutionObserved === false,
    "no_action_execution",
  );
  addCheck(checks, "rollback:not_active", !killed, "rollback_kill_switch_inactive");

  const candidateOutputs = (boundaryReport?.outputs ?? []).filter(
    (output) =>
      (output.classification === "report_only" || output.classification === "suggestion_only") &&
      output.evidenceArtifactIds.length > 0 &&
      !output.executed &&
      !output.userFacingProactiveMessage,
  );
  const suggestions = eligible
    ? candidateOutputs
        .slice(0, policy.maxSuggestionCount)
        .map((output) => suggestionFromBoundaryOutput({ output, generatedAt }))
    : [];
  const decision: Phase2ControlledProactivitySuggestionDecision = killed
    ? "rollback_disabled"
    : matchedScope
      ? suggestions.length > 0
        ? "controlled_suggestions_observed"
        : "blocked"
      : "outside_scope_report_only";
  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_controlled_proactivity_suggestions_report",
    targetId: approvedScope.projectId,
    seed: {
      generatedAt,
      boundaryReportId: boundaryReport?.reportId ?? null,
      decision,
      marker: input.proofMarker ?? null,
    },
  });
  const rollbackPlan: Phase2ControlledProactivityRollbackPlan = {
    rollbackId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_controlled_proactivity_suggestions_rollback",
      targetId: config.configId,
      seed: killed,
    }),
    killSwitchEnvVar: "MODEL_MEMORY_PHASE2_CONTROLLED_PROACTIVITY_SUGGESTIONS_DISABLED",
    targetMode: "planner_operator_reports_only",
    disablesControlledSuggestions: true,
  };
  const telemetry: Phase2ControlledProactivitySuggestionTelemetry = {
    schemaVersion: PHASE2_CONTROLLED_PROACTIVITY_SUGGESTIONS_SCHEMA_VERSION,
    reportId,
    decision,
    matchedScope,
    boundaryReportId: boundaryReport?.reportId,
    suggestionIds: uniqueSortedStrings(suggestions.map((suggestion) => suggestion.suggestionId)),
    blockedOutputIds: uniqueSortedStrings(boundaryReport?.telemetry.blockedOutputIds ?? []),
    evidenceArtifactIds: uniqueSortedStrings(
      suggestions.flatMap((suggestion) =>
        suggestion.evidence.flatMap((evidence) => evidence.evidenceArtifactIds),
      ),
    ),
    sourceProfileIds: uniqueSortedStrings(
      suggestions.flatMap((suggestion) =>
        suggestion.evidence.flatMap((evidence) => evidence.sourceProfileIds),
      ),
    ) as SourceProfileId[],
    authorityTiers: uniqueSortedStrings(
      suggestions.flatMap((suggestion) =>
        suggestion.evidence.flatMap((evidence) => evidence.authorityTiers),
      ),
    ) as SourceAuthorityTier[],
    sourceRefIds: uniqueSortedStrings(
      suggestions.flatMap((suggestion) =>
        suggestion.evidence.flatMap((evidence) => evidence.sourceRefIds),
      ),
    ),
    contentHashes: uniqueSortedStrings(
      suggestions.flatMap((suggestion) =>
        suggestion.evidence.flatMap((evidence) => evidence.contentHashes),
      ),
    ),
    proofHashes: uniqueSortedStrings(
      suggestions.flatMap((suggestion) =>
        suggestion.evidence.flatMap((evidence) => evidence.proofHashes),
      ),
    ),
    reasonCodes: uniqueSortedStrings(
      checks
        .map((check) => check.reasonCode)
        .concat(suggestions.flatMap((suggestion) => suggestion.reasonCodes)),
    ),
    noDarkDataStatus: boundaryReport?.noDarkDataStatus ?? "fail",
    rollbackObserved: killed || !config.enabled,
    userFacingProactiveMessagesSent: false,
    actionExecutionObserved: false,
    hiddenChatInjectionObserved: false,
  };
  const report: Phase2ControlledProactivitySuggestionReport = {
    schemaVersion: PHASE2_CONTROLLED_PROACTIVITY_SUGGESTIONS_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision,
    config,
    policy,
    boundaryReportId: boundaryReport?.reportId,
    suggestions,
    checks,
    rollbackPlan,
    noDarkDataStatus: telemetry.noDarkDataStatus,
    telemetry,
    uiEvidence: input.uiEvidence,
  };
  assertNoDarkData(report);
  return clone(
    report as unknown as JsonLike,
  ) as unknown as Phase2ControlledProactivitySuggestionReport;
}

export function assertPhase2ControlledProactivitySuggestionsObserved(
  report: Phase2ControlledProactivitySuggestionReport,
): void {
  assertNoDarkData(report);
  if (report.decision !== "controlled_suggestions_observed") {
    throw new Error(`phase2 controlled proactivity suggestions not observed: ${report.decision}`);
  }
  if (report.suggestions.length === 0) {
    throw new Error("phase2 controlled proactivity suggestions emitted no suggestions");
  }
  if (
    report.telemetry.userFacingProactiveMessagesSent ||
    report.telemetry.actionExecutionObserved ||
    report.telemetry.hiddenChatInjectionObserved
  ) {
    throw new Error("phase2 controlled proactivity suggestions escaped report-only posture");
  }
  if (
    report.suggestions.some(
      (suggestion) =>
        suggestion.userFacingProactiveMessage ||
        suggestion.actionExecution !== "none" ||
        !suggestion.operatorVisibleReportOnly,
    )
  ) {
    throw new Error("phase2 controlled proactivity suggestions emitted unsafe suggestion");
  }
}

export async function writePhase2ControlledProactivitySuggestionArtifact(input: {
  report: Phase2ControlledProactivitySuggestionReport;
  artifactDir: string;
}): Promise<Phase2ControlledProactivitySuggestionArtifact> {
  assertNoDarkData(input.report);
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-controlled-proactivity-suggestions",
    value: input.report,
  });
  const markdownPath = path.join(input.artifactDir, "report.md");
  const markdown = `${[
    "# Phase 2 Controlled Proactivity Suggestions Proof",
    "",
    `- reportId: ${input.report.reportId}`,
    `- decision: ${input.report.decision}`,
    `- boundaryReportId: ${input.report.boundaryReportId ?? "none"}`,
    `- suggestions: ${input.report.suggestions.length}`,
    `- matchedScope: ${input.report.telemetry.matchedScope}`,
    `- noDarkDataStatus: ${input.report.noDarkDataStatus}`,
    `- userFacingProactiveMessagesSent: ${input.report.telemetry.userFacingProactiveMessagesSent}`,
    `- actionExecutionObserved: ${input.report.telemetry.actionExecutionObserved}`,
    "",
    "## Suggestion IDs",
    "",
    ...input.report.telemetry.suggestionIds.map((suggestionId) => `- ${suggestionId}`),
  ].join("\n")}\n`;
  if (Buffer.byteLength(markdown, "utf8") > 128 * 1024) {
    throw new Error("phase2 controlled proactivity suggestions markdown exceeds byte limit");
  }
  await fs.mkdir(input.artifactDir, { recursive: true });
  await fs.writeFile(markdownPath, markdown, "utf8");
  return {
    jsonPath: written.path,
    markdownPath,
    contentHash: written.contentHash,
    byteLength: written.byteLength,
  };
}
