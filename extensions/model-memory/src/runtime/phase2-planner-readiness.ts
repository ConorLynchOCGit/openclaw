import fs from "node:fs/promises";
import path from "node:path";
import {
  buildDerivedArtifactId,
  hashDerivedArtifactValue,
  uniqueSortedStrings,
  writeBoundedDerivedJsonArtifact,
  type JsonLike,
} from "../derived-artifact.ts";
import type { SoftSourceRef, SourceAuthorityTier, SourceProfileId } from "../source-authority.ts";
import {
  buildPhase2IngestionDefaultPromotion,
  type Phase2IngestionDefaultPromotionReport,
} from "./phase2-ingestion-default-promotion.ts";
import {
  buildPhase2ProductionObservabilityReport,
  type Phase2ProductionObservabilityReport,
} from "./retrieval/phase2-production-observability.ts";

export const PHASE2_PLANNER_READINESS_SCHEMA_VERSION = "phase2_planner_readiness.v1" as const;
export const PHASE2_PLANNER_READINESS_REPORT_SCHEMA_VERSION =
  "phase2_planner_readiness_report.v1" as const;

export type Phase2PlannerReadableArtifactKind =
  | "durable_memory"
  | "project_doc"
  | "curated_doc"
  | "tool_grounded_artifact"
  | "researcher_report_artifact"
  | "daily_continuity_artifact"
  | "runtime_graph_summary"
  | "project_state_capsule"
  | "retrieval_pack"
  | "hierarchical_plan"
  | "maintenance_report"
  | "production_observability_report"
  | "rollout_proof_report";

export type Phase2PlannerReadinessDecision =
  | "evidence_only"
  | "report_only"
  | "planner_candidate_allowed"
  | "blocked_no_dark_data"
  | "blocked_missing_provenance"
  | "blocked_low_authority"
  | "blocked_inspection_only"
  | "blocked_conflict"
  | "blocked_stale"
  | "blocked_budget";

export type Phase2PlannerReadinessCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode: string;
};

export type Phase2PlannerEvidenceSource = {
  sourceId: string;
  sourceRefIds: string[];
  sourceProfileId: SourceProfileId;
  authorityTier: SourceAuthorityTier;
  contentHash: string;
  proofHash?: string;
};

export type Phase2PlannerReadableArtifact = {
  artifactId: string;
  kind: Phase2PlannerReadableArtifactKind;
  title: string;
  sourceRefs: SoftSourceRef[];
  sourceProfileId: SourceProfileId;
  authorityTier: SourceAuthorityTier;
  contentHash: string;
  proofHash?: string;
  freshnessStatus: "fresh" | "stale";
  conflictMarkers: string[];
  inspectionOnly: boolean;
  noDarkDataStatus: "pass" | "fail";
  estimatedTokens: number;
  maxTokens: number;
  semanticTruth: false;
  externalImperativeTextHandling: "evidence_not_instruction";
  derivedFrom?: string[];
};

export type Phase2PlannerReadinessPolicy = {
  schemaVersion: typeof PHASE2_PLANNER_READINESS_SCHEMA_VERSION;
  policyId: string;
  maxArtifactTokens: number;
  allowPlannerCandidatesFromKinds: Phase2PlannerReadableArtifactKind[];
  evidenceOnlyKinds: Phase2PlannerReadableArtifactKind[];
  proactiveSurfacingEnabled: false;
  plannerActionsEnabled: false;
};

export type Phase2PlannerCandidate = {
  candidateId: string;
  artifactId: string;
  kind: Phase2PlannerReadableArtifactKind;
  decision: Exclude<Phase2PlannerReadinessDecision, "planner_candidate_allowed"> | "report_only";
  reportOnly: true;
  actionExecution: "none";
  reasonCodes: string[];
  evidenceSources: Phase2PlannerEvidenceSource[];
};

export type Phase2PlannerReadinessTelemetry = {
  schemaVersion: typeof PHASE2_PLANNER_READINESS_SCHEMA_VERSION;
  reportId: string;
  readableArtifactKinds: Phase2PlannerReadableArtifactKind[];
  candidateArtifactIds: string[];
  blockedArtifactIds: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  sourceRefIds: string[];
  contentHashes: string[];
  proofHashes: string[];
  reasonCodes: string[];
  noDarkDataStatus: "pass" | "fail";
  proactiveSurfacingEnabled: false;
  plannerActionsExecuted: false;
};

export type Phase2PlannerNoDarkDataFinding = {
  findingId: string;
  status: "pass" | "fail";
  reasonCode: string;
  artifactIds: string[];
};

export type Phase2PlannerReadinessReport = {
  schemaVersion: typeof PHASE2_PLANNER_READINESS_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  status: "ready_report_only" | "partial" | "blocked";
  policy: Phase2PlannerReadinessPolicy;
  readableArtifacts: Phase2PlannerReadableArtifact[];
  candidates: Phase2PlannerCandidate[];
  checks: Phase2PlannerReadinessCheck[];
  noDarkDataFindings: Phase2PlannerNoDarkDataFinding[];
  noDarkDataStatus: "pass" | "fail";
  telemetry: Phase2PlannerReadinessTelemetry;
  uiEvidence?: {
    sessionKey: string;
    proofMarker: string;
    plannerReadinessRunId?: string | null;
    terminalEvidence: boolean;
    assistantTextSha256?: string;
  };
};

export type Phase2PlannerReadinessInput = {
  projectId?: string;
  proofMarker?: string;
  now?: Date;
  artifacts?: Phase2PlannerReadableArtifact[];
  ingestionDefaultPromotionReport?: Phase2IngestionDefaultPromotionReport;
  productionObservabilityReport?: Phase2ProductionObservabilityReport;
  policy?: Partial<
    Pick<
      Phase2PlannerReadinessPolicy,
      "maxArtifactTokens" | "allowPlannerCandidatesFromKinds" | "evidenceOnlyKinds"
    >
  >;
  uiEvidence?: Phase2PlannerReadinessReport["uiEvidence"];
};

export type Phase2PlannerReadinessArtifact = {
  jsonPath: string;
  markdownPath: string;
  contentHash: string;
  byteLength: number;
};

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

const EVIDENCE_ONLY_KINDS: Phase2PlannerReadableArtifactKind[] = [
  "runtime_graph_summary",
  "project_state_capsule",
  "retrieval_pack",
  "hierarchical_plan",
  "maintenance_report",
  "production_observability_report",
  "rollout_proof_report",
];

const CANDIDATE_ALLOWED_KINDS: Phase2PlannerReadableArtifactKind[] = [
  "durable_memory",
  "project_doc",
  "curated_doc",
  "tool_grounded_artifact",
  "researcher_report_artifact",
  "daily_continuity_artifact",
];

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
        `phase2 planner readiness contains prohibited field: ${[...pathParts, key].join(".")}`,
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
      throw new Error("phase2 planner readiness contains prohibited marker content");
    }
  }
}

function addCheck(
  checks: Phase2PlannerReadinessCheck[],
  checkId: string,
  condition: boolean,
  reasonCode: string,
): void {
  checks.push({ checkId, status: condition ? "pass" : "fail", reasonCode });
}

function sourceRef(sourceId: string): SoftSourceRef {
  return {
    sourceId,
    segmentId: `${sourceId}-segment`,
    artifactPath: `.artifacts/model-memory/${sourceId}.json`,
    contentHash: hashDerivedArtifactValue({ sourceId }),
  };
}

function artifact(input: {
  kind: Phase2PlannerReadableArtifactKind;
  title: string;
  sourceProfileId: SourceProfileId;
  authorityTier: SourceAuthorityTier;
  estimatedTokens?: number;
  freshnessStatus?: "fresh" | "stale";
  conflictMarkers?: string[];
  inspectionOnly?: boolean;
  noDarkDataStatus?: "pass" | "fail";
  proofHash?: string;
  derivedFrom?: string[];
}): Phase2PlannerReadableArtifact {
  const artifactId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: `planner_${input.kind}`,
    targetId: input.kind,
    seed: input.title,
  });
  const refs = [sourceRef(`phase2-planner-${input.kind}`)];
  return {
    artifactId,
    kind: input.kind,
    title: input.title,
    sourceRefs: refs,
    sourceProfileId: input.sourceProfileId,
    authorityTier: input.authorityTier,
    contentHash: hashDerivedArtifactValue({
      artifactId,
      kind: input.kind,
      title: input.title,
      sourceProfileId: input.sourceProfileId,
      authorityTier: input.authorityTier,
    }),
    proofHash: input.proofHash,
    freshnessStatus: input.freshnessStatus ?? "fresh",
    conflictMarkers: input.conflictMarkers ?? [],
    inspectionOnly: input.inspectionOnly ?? input.authorityTier === "inspection_only",
    noDarkDataStatus: input.noDarkDataStatus ?? "pass",
    estimatedTokens: input.estimatedTokens ?? 320,
    maxTokens: 2_000,
    semanticTruth: false,
    externalImperativeTextHandling: "evidence_not_instruction",
    derivedFrom: input.derivedFrom,
  };
}

function defaultReadableArtifacts(input: {
  ingestionReport: Phase2IngestionDefaultPromotionReport;
  observabilityReport: Phase2ProductionObservabilityReport;
}): Phase2PlannerReadableArtifact[] {
  return [
    artifact({
      kind: "durable_memory",
      title: "Approved durable MMV2 memory evidence",
      sourceProfileId: "explicit_user_turn",
      authorityTier: "user_authoritative",
    }),
    artifact({
      kind: "project_doc",
      title: "Approved project documentation evidence",
      sourceProfileId: "curated_repo_doc",
      authorityTier: "curated_authoritative",
    }),
    artifact({
      kind: "curated_doc",
      title: "Approved curated manual note evidence",
      sourceProfileId: "manual_note",
      authorityTier: "curated_authoritative",
    }),
    artifact({
      kind: "tool_grounded_artifact",
      title: "Tool-grounded capture evidence",
      sourceProfileId: "tool_result_capture",
      authorityTier: "tool_grounded",
      proofHash: input.ingestionReport.defaultPromotionConfig.configHash,
    }),
    artifact({
      kind: "researcher_report_artifact",
      title: "Researcher cited-soft artifact evidence",
      sourceProfileId: "researcher_report_artifact",
      authorityTier: "cited_soft",
      proofHash: input.ingestionReport.defaultPromotionConfig.configHash,
    }),
    artifact({
      kind: "daily_continuity_artifact",
      title: "Daily continuity artifact evidence",
      sourceProfileId: "daily_continuity",
      authorityTier: "cited_soft",
      proofHash: input.ingestionReport.defaultPromotionConfig.configHash,
    }),
    artifact({
      kind: "runtime_graph_summary",
      title: "Read-only runtime graph summary evidence",
      sourceProfileId: "curated_repo_doc",
      authorityTier: "curated_authoritative",
      proofHash: input.observabilityReport.telemetry.proofHashes[0],
    }),
    artifact({
      kind: "project_state_capsule",
      title: "Project state capsule evidence",
      sourceProfileId: "curated_repo_doc",
      authorityTier: "curated_authoritative",
      proofHash: input.observabilityReport.telemetry.proofHashes[0],
    }),
    artifact({
      kind: "retrieval_pack",
      title: "Controlled retrieval pack evidence",
      sourceProfileId: "curated_repo_doc",
      authorityTier: "curated_authoritative",
      proofHash: input.observabilityReport.telemetry.proofHashes[0],
    }),
    artifact({
      kind: "hierarchical_plan",
      title: "Hierarchical plan and merge report evidence",
      sourceProfileId: "curated_repo_doc",
      authorityTier: "curated_authoritative",
      proofHash: input.observabilityReport.hierarchicalDefaultPromotionReportId,
    }),
    artifact({
      kind: "maintenance_report",
      title: "Maintenance candidate report evidence",
      sourceProfileId: "manual_note",
      authorityTier: "curated_authoritative",
    }),
    artifact({
      kind: "production_observability_report",
      title: "Production observability report evidence",
      sourceProfileId: "manual_note",
      authorityTier: "curated_authoritative",
      proofHash: input.observabilityReport.telemetry.reportId,
    }),
    artifact({
      kind: "rollout_proof_report",
      title: "Rollout proof report evidence",
      sourceProfileId: "manual_note",
      authorityTier: "curated_authoritative",
      proofHash: input.ingestionReport.telemetry.reportId,
    }),
  ];
}

function evaluateArtifact(input: {
  artifact: Phase2PlannerReadableArtifact;
  policy: Phase2PlannerReadinessPolicy;
}): { decision: Phase2PlannerReadinessDecision; reasonCodes: string[] } {
  const { artifact: readable, policy } = input;
  if (readable.noDarkDataStatus !== "pass") {
    return { decision: "blocked_no_dark_data", reasonCodes: ["no_dark_data_failed"] };
  }
  if (readable.sourceRefs.length === 0 || readable.sourceRefs.some((ref) => !ref.contentHash)) {
    return { decision: "blocked_missing_provenance", reasonCodes: ["missing_source_refs"] };
  }
  if (readable.inspectionOnly || readable.authorityTier === "inspection_only") {
    return { decision: "blocked_inspection_only", reasonCodes: ["inspection_only_excluded"] };
  }
  if (readable.conflictMarkers.length > 0) {
    return { decision: "blocked_conflict", reasonCodes: ["conflict_markers_present"] };
  }
  if (readable.freshnessStatus === "stale") {
    return { decision: "blocked_stale", reasonCodes: ["stale_artifact"] };
  }
  if (readable.estimatedTokens > Math.min(policy.maxArtifactTokens, readable.maxTokens)) {
    return { decision: "blocked_budget", reasonCodes: ["planner_budget_exceeded"] };
  }
  if (policy.evidenceOnlyKinds.includes(readable.kind)) {
    return { decision: "evidence_only", reasonCodes: ["derived_artifact_evidence_only"] };
  }
  if (readable.authorityTier === "cited_soft") {
    return { decision: "report_only", reasonCodes: ["lower_authority_report_only"] };
  }
  if (policy.allowPlannerCandidatesFromKinds.includes(readable.kind)) {
    return { decision: "planner_candidate_allowed", reasonCodes: ["provenance_preserved"] };
  }
  return { decision: "blocked_low_authority", reasonCodes: ["kind_not_allowed_for_candidate"] };
}

function evidenceSources(readable: Phase2PlannerReadableArtifact): Phase2PlannerEvidenceSource[] {
  return [
    {
      sourceId: readable.artifactId,
      sourceRefIds: readable.sourceRefs.map((ref) => ref.sourceId),
      sourceProfileId: readable.sourceProfileId,
      authorityTier: readable.authorityTier,
      contentHash: readable.contentHash,
      proofHash: readable.proofHash,
    },
  ];
}

export async function buildPhase2PlannerReadinessReport(
  input: Phase2PlannerReadinessInput = {},
): Promise<Phase2PlannerReadinessReport> {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const ingestionReport =
    input.ingestionDefaultPromotionReport ??
    (await buildPhase2IngestionDefaultPromotion({
      projectId: input.projectId,
      proofMarker: input.proofMarker,
      now: input.now,
    }));
  const observabilityReport =
    input.productionObservabilityReport ??
    (await buildPhase2ProductionObservabilityReport({
      projectId: input.projectId,
      proofMarker: input.proofMarker,
      now: input.now,
    }));
  const policy: Phase2PlannerReadinessPolicy = {
    schemaVersion: PHASE2_PLANNER_READINESS_SCHEMA_VERSION,
    policyId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_planner_readiness_policy",
      targetId: input.projectId ?? "default",
      seed: {
        maxArtifactTokens: input.policy?.maxArtifactTokens ?? 2_000,
        candidates: input.policy?.allowPlannerCandidatesFromKinds ?? CANDIDATE_ALLOWED_KINDS,
        evidenceOnly: input.policy?.evidenceOnlyKinds ?? EVIDENCE_ONLY_KINDS,
      },
    }),
    maxArtifactTokens: input.policy?.maxArtifactTokens ?? 2_000,
    allowPlannerCandidatesFromKinds: input.policy?.allowPlannerCandidatesFromKinds ?? [
      ...CANDIDATE_ALLOWED_KINDS,
    ],
    evidenceOnlyKinds: input.policy?.evidenceOnlyKinds ?? [...EVIDENCE_ONLY_KINDS],
    proactiveSurfacingEnabled: false,
    plannerActionsEnabled: false,
  };
  const readableArtifacts =
    input.artifacts ?? defaultReadableArtifacts({ ingestionReport, observabilityReport });
  const checks: Phase2PlannerReadinessCheck[] = [];
  const candidates: Phase2PlannerCandidate[] = [];
  const noDarkDataFindings: Phase2PlannerNoDarkDataFinding[] = [];

  for (const readable of readableArtifacts) {
    const evaluation = evaluateArtifact({ artifact: readable, policy });
    const blocked = evaluation.decision.startsWith("blocked_");
    addCheck(checks, `artifact:${readable.artifactId}`, !blocked, evaluation.decision);
    noDarkDataFindings.push({
      findingId: buildDerivedArtifactId({
        family: "context_artifact",
        artifactType: "phase2_planner_no_dark_data_finding",
        targetId: readable.artifactId,
        seed: readable.noDarkDataStatus,
      }),
      status: readable.noDarkDataStatus,
      reasonCode:
        readable.noDarkDataStatus === "pass" ? "no_dark_data_pass" : "no_dark_data_failed",
      artifactIds: [readable.artifactId],
    });
    if (!blocked) {
      candidates.push({
        candidateId: buildDerivedArtifactId({
          family: "context_artifact",
          artifactType: "phase2_planner_candidate",
          targetId: readable.artifactId,
          seed: evaluation.decision,
        }),
        artifactId: readable.artifactId,
        kind: readable.kind,
        decision:
          evaluation.decision === "planner_candidate_allowed" ? "report_only" : evaluation.decision,
        reportOnly: true,
        actionExecution: "none",
        reasonCodes: evaluation.reasonCodes,
        evidenceSources: evidenceSources(readable),
      });
    }
  }

  addCheck(
    checks,
    "planner:proactive_surfacing_disabled",
    !policy.proactiveSurfacingEnabled,
    "proactive_surfacing_disabled",
  );
  addCheck(
    checks,
    "planner:actions_disabled",
    !policy.plannerActionsEnabled,
    "planner_actions_disabled",
  );
  addCheck(
    checks,
    "planner:project_docs_are_evidence",
    readableArtifacts
      .filter((entry) => entry.kind === "project_doc" || entry.kind === "curated_doc")
      .every((entry) => entry.externalImperativeTextHandling === "evidence_not_instruction"),
    "external_imperative_text_is_evidence",
  );

  const noDarkDataStatus = noDarkDataFindings.every((finding) => finding.status === "pass")
    ? "pass"
    : "fail";
  const blockedArtifactIds = readableArtifacts
    .filter((readable) =>
      evaluateArtifact({ artifact: readable, policy }).decision.startsWith("blocked_"),
    )
    .map((readable) => readable.artifactId);
  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_planner_readiness_report",
    targetId: input.projectId ?? "default",
    seed: {
      generatedAt,
      artifacts: readableArtifacts.map((entry) => entry.artifactId),
      marker: input.proofMarker ?? null,
    },
  });
  const telemetry: Phase2PlannerReadinessTelemetry = {
    schemaVersion: PHASE2_PLANNER_READINESS_SCHEMA_VERSION,
    reportId,
    readableArtifactKinds: uniqueSortedStrings(
      readableArtifacts.map((entry) => entry.kind),
    ) as Phase2PlannerReadableArtifactKind[],
    candidateArtifactIds: uniqueSortedStrings(candidates.map((entry) => entry.artifactId)),
    blockedArtifactIds: uniqueSortedStrings(blockedArtifactIds),
    sourceProfileIds: uniqueSortedStrings(
      readableArtifacts.map((entry) => entry.sourceProfileId),
    ) as SourceProfileId[],
    authorityTiers: uniqueSortedStrings(
      readableArtifacts.map((entry) => entry.authorityTier),
    ) as SourceAuthorityTier[],
    sourceRefIds: uniqueSortedStrings(
      readableArtifacts.flatMap((entry) => entry.sourceRefs.map((ref) => ref.sourceId)),
    ),
    contentHashes: uniqueSortedStrings(readableArtifacts.map((entry) => entry.contentHash)),
    proofHashes: uniqueSortedStrings(readableArtifacts.map((entry) => entry.proofHash)),
    reasonCodes: uniqueSortedStrings(
      candidates
        .flatMap((entry) => entry.reasonCodes)
        .concat(checks.map((entry) => entry.reasonCode)),
    ),
    noDarkDataStatus,
    proactiveSurfacingEnabled: false,
    plannerActionsExecuted: false,
  };
  const failedChecks = checks.filter((check) => check.status === "fail");
  const report: Phase2PlannerReadinessReport = {
    schemaVersion: PHASE2_PLANNER_READINESS_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    status:
      noDarkDataStatus === "fail"
        ? "blocked"
        : failedChecks.length > 0
          ? "partial"
          : "ready_report_only",
    policy,
    readableArtifacts,
    candidates,
    checks,
    noDarkDataFindings,
    noDarkDataStatus,
    telemetry,
    uiEvidence: input.uiEvidence,
  };
  assertNoDarkData(report);
  return clone(report as unknown as JsonLike) as unknown as Phase2PlannerReadinessReport;
}

export function assertPhase2PlannerReadinessReportOnly(report: Phase2PlannerReadinessReport): void {
  assertNoDarkData(report);
  if (report.status !== "ready_report_only") {
    throw new Error(`phase2 planner readiness was not report-only ready: ${report.status}`);
  }
  if (report.noDarkDataStatus !== "pass") {
    throw new Error("phase2 planner readiness no-dark-data failed");
  }
  if (report.telemetry.proactiveSurfacingEnabled || report.telemetry.plannerActionsExecuted) {
    throw new Error("phase2 planner readiness attempted proactive planner behavior");
  }
  if (
    report.candidates.some(
      (candidate) => !candidate.reportOnly || candidate.actionExecution !== "none",
    )
  ) {
    throw new Error("phase2 planner readiness emitted actionable planner candidates");
  }
}

export async function writePhase2PlannerReadinessArtifact(input: {
  report: Phase2PlannerReadinessReport;
  artifactDir: string;
}): Promise<Phase2PlannerReadinessArtifact> {
  assertNoDarkData(input.report);
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-planner-readiness",
    value: input.report,
  });
  const markdownPath = path.join(input.artifactDir, "report.md");
  const lines = [
    "# Phase 2 Planner Readiness Proof",
    "",
    `- reportId: ${input.report.reportId}`,
    `- status: ${input.report.status}`,
    `- readableArtifactKinds: ${input.report.telemetry.readableArtifactKinds.join(", ")}`,
    `- candidates: ${input.report.candidates.length}`,
    `- blockedArtifacts: ${input.report.telemetry.blockedArtifactIds.length}`,
    `- noDarkDataStatus: ${input.report.noDarkDataStatus}`,
    `- proactiveSurfacingEnabled: ${input.report.telemetry.proactiveSurfacingEnabled}`,
    `- plannerActionsExecuted: ${input.report.telemetry.plannerActionsExecuted}`,
    "",
    "## Candidate Artifact IDs",
    "",
    ...input.report.telemetry.candidateArtifactIds.map((artifactId) => `- ${artifactId}`),
  ];
  const markdown = `${lines.join("\n")}\n`;
  if (Buffer.byteLength(markdown, "utf8") > 128 * 1024) {
    throw new Error("phase2 planner readiness markdown exceeds byte limit");
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
