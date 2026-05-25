import { createHash } from "node:crypto";
import { z } from "zod";
import type { JsonValue, RuntimeJobRepository } from "../runtime-job-repository.ts";
import { MissionContractLedgerSchema } from "../workflows/mission-contract-ledger.ts";

export const CLOSEOUT_CAPSULE_SCHEMA_VERSION = "execution-platform.closeout-capsule.v1";
export const CLOSEOUT_CAPSULE_ARTIFACT_TYPE = "execution_platform.closeout_capsule";

const boundedString = (max: number) => z.string().trim().min(1).max(max);
const optionalBoundedString = (max: number) => z.string().trim().max(max).nullable();
const stringList = (maxItems: number, maxChars = 240) =>
  z.array(boundedString(maxChars)).max(maxItems);

export const CloseoutCapsuleOpportunitySeedSchema = z
  .object({
    seedId: boundedString(120),
    kind: z.enum([
      "new_skill_candidate",
      "existing_skill_edit",
      "proactive_plan",
      "process_improvement",
      "follow_up_work_item",
      "no_op",
    ]),
    title: boundedString(120),
    rationale: boundedString(600),
    recommendedNextStep: boundedString(500),
    evidenceRefs: stringList(8, 260),
    confidence: z.enum(["low", "medium", "high"]),
  })
  .strict();

export type CloseoutCapsuleOpportunitySeed = z.infer<typeof CloseoutCapsuleOpportunitySeedSchema>;

export const CloseoutCapsuleRoleCloseoutSchema = z
  .object({
    roleId: boundedString(120),
    agentId: optionalBoundedString(120),
    modelRef: optionalBoundedString(180),
    modelRunRef: optionalBoundedString(220).optional(),
    source: z.enum(["model", "degraded_system_fallback"]),
    askedToDo: boundedString(800),
    actuallyDid: boundedString(1_200),
    whatIWasAskedToDo: boundedString(800).optional(),
    whatIActuallyDid: boundedString(1_200).optional(),
    eli5Progress: boundedString(1_000).optional(),
    evidenceRefs: stringList(12, 260).optional(),
    filesOrArtifactsTouched: stringList(20, 260).optional(),
    validationIPerformed: boundedString(800).optional(),
    worked: stringList(8, 500),
    failedOrWeak: stringList(8, 500),
    wouldImproveNext: stringList(8, 500),
    recommendedNextStep: boundedString(800).optional(),
    skillOrProcessOpportunitySeeds: z.array(CloseoutCapsuleOpportunitySeedSchema).max(5).optional(),
    opportunitySeeds: z.array(CloseoutCapsuleOpportunitySeedSchema).max(5),
    confidence: z.enum(["low", "medium", "high"]),
    limitations: stringList(8, 500),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawTranscriptStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
  })
  .strict();

export type CloseoutCapsuleRoleCloseout = z.infer<typeof CloseoutCapsuleRoleCloseoutSchema>;

export const CloseoutCapsuleHumanReportSchema = z
  .object({
    source: z.enum(["model", "degraded_system_fallback"]),
    reportMarkdown: boundedString(6_000),
    eli5Progress: boundedString(1_000),
    limitations: stringList(10, 700),
  })
  .strict();

export type CloseoutCapsuleHumanReport = z.infer<typeof CloseoutCapsuleHumanReportSchema>;

export const CloseoutCapsuleStructuredSummarySchema = z
  .object({
    taskSuccess: z.enum(["satisfied", "unsatisfied", "needs_review", "blocked", "unknown"]),
    qualityAssessment: boundedString(1_000),
    workflowFitAssessment: boundedString(1_000),
    agentModelFitAssessment: boundedString(1_000),
    missingWork: stringList(10, 500),
    validationSummary: boundedString(1_000),
    riskSummary: boundedString(1_000),
    opportunitySeedIds: stringList(20, 120),
  })
  .strict();

export type CloseoutCapsuleStructuredSummary = z.infer<
  typeof CloseoutCapsuleStructuredSummarySchema
>;

export const CloseoutCapsuleProductSpecPlanningContractSchema = z
  .object({
    artifactKind: z.literal("product_spec_planning_worker_contract"),
    contractVersion: z.literal("v1"),
    planningMode: z.enum([
      "plan_only",
      "child_action_graph_proposal",
      "child_action_graph_proposals",
      "compile_ready",
    ]),
    planningOutputKind: z.enum([
      "plan_only_output",
      "child_action_graph_proposal_output",
      "compile_ready_output",
    ]),
    workflowRefs: stringList(12, 260),
    childActionProposalRefs: stringList(20, 260),
    humanDecisionRefs: stringList(12, 260),
    validationRefs: stringList(20, 260),
    limitations: stringList(10, 500),
    eli5Progress: boundedString(1_000),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawLogsStored: z.literal(false),
    workQueueLifecycleMutationAllowed: z.literal(false),
  })
  .strict();

export type CloseoutCapsuleProductSpecPlanningContract = z.infer<
  typeof CloseoutCapsuleProductSpecPlanningContractSchema
>;

export const CloseoutCapsuleFactualRefsSchema = z
  .object({
    runtimeJobId: boundedString(180),
    teamRunId: optionalBoundedString(180),
    workflowId: optionalBoundedString(180),
    status: boundedString(80),
    roles: z
      .array(
        z
          .object({
            roleId: boundedString(120),
            agentId: optionalBoundedString(120),
            modelRef: optionalBoundedString(180),
            status: boundedString(80),
          })
          .strict(),
      )
      .max(20),
    fileRefs: stringList(40, 260),
    artifactRefs: stringList(40, 260),
    validationRefs: stringList(30, 260),
    runtimeEventRefs: stringList(30, 260),
  })
  .strict();

export type CloseoutCapsuleFactualRefs = z.infer<typeof CloseoutCapsuleFactualRefsSchema>;

export const CloseoutCapsuleSafetyFlagsSchema = z
  .object({
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawTranscriptStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
    rawCommandLogStored: z.literal(false),
    workQueueLifecycleMutatedDirectly: z.literal(false),
    authorityGrantedByCloseout: z.literal(false),
    runtimeJobCreatedByCloseout: z.literal(false),
  })
  .strict();

export type CloseoutCapsuleSafetyFlags = z.infer<typeof CloseoutCapsuleSafetyFlagsSchema>;

export const CloseoutCapsuleSchema = z
  .object({
    artifactKind: z.literal("execution_platform_closeout_capsule"),
    schemaVersion: z.literal(CLOSEOUT_CAPSULE_SCHEMA_VERSION),
    capsuleId: boundedString(160),
    createdAt: boundedString(80),
    modelRef: optionalBoundedString(180),
    humanReport: CloseoutCapsuleHumanReportSchema,
    structuredSummary: CloseoutCapsuleStructuredSummarySchema,
    roleCloseouts: z.array(CloseoutCapsuleRoleCloseoutSchema).max(20),
    opportunitySeeds: z.array(CloseoutCapsuleOpportunitySeedSchema).max(20),
    factualRefs: CloseoutCapsuleFactualRefsSchema,
    productSpecPlanningContract: CloseoutCapsuleProductSpecPlanningContractSchema.optional(),
    missionContractLedger: MissionContractLedgerSchema.optional(),
    safetyFlags: CloseoutCapsuleSafetyFlagsSchema,
  })
  .strict();

export type CloseoutCapsule = z.infer<typeof CloseoutCapsuleSchema>;

export type CloseoutCapsuleRoleReadback = {
  roleId: string;
  roleRef: string;
  agentId: string | null;
  modelRef: string | null;
  modelRunRef: string | null;
  status: string | null;
  source: "model" | "degraded_system_fallback";
  modelAuthoredCloseout: string;
  askedToDo: string;
  whatRoleDid: string;
  filesOrArtifactsTouched: string[];
  evidenceRefs: string[];
  validationEvidence: string[];
  limitations: string[];
  eli5Progress: string;
};

export function parseCloseoutCapsule(value: unknown): CloseoutCapsule {
  return CloseoutCapsuleSchema.parse(value);
}

export function validateCloseoutCapsule(value: unknown): {
  valid: boolean;
  blockingReasons: string[];
  capsule: CloseoutCapsule | null;
} {
  const parsed = CloseoutCapsuleSchema.safeParse(value);
  if (!parsed.success) {
    return {
      valid: false,
      blockingReasons: ["closeout_capsule_schema_invalid"],
      capsule: null,
    };
  }
  const blockingReasons: string[] = [];
  const capsule = parsed.data;
  if (capsule.humanReport.source !== "model") {
    blockingReasons.push("closeout_capsule_human_report_not_model_authored");
  }
  if (capsule.roleCloseouts.some((role) => role.source !== "model")) {
    blockingReasons.push("closeout_capsule_role_closeout_not_model_authored");
  }
  if (
    capsule.opportunitySeeds.some((seed) => seed.kind !== "no_op" && seed.evidenceRefs.length === 0)
  ) {
    blockingReasons.push("closeout_capsule_opportunity_seed_missing_evidence");
  }
  return {
    valid: blockingReasons.length === 0,
    blockingReasons,
    capsule,
  };
}

export function closeoutCapsuleHash(capsule: CloseoutCapsule): string {
  return createHash("sha256").update(JSON.stringify(capsule)).digest("hex");
}

export function buildCloseoutCapsuleId(input: {
  runtimeJobId: string;
  teamRunId?: string | null;
  createdAt: string;
}): string {
  const seed = `${input.runtimeJobId}:${input.teamRunId ?? "no-team"}:${input.createdAt}`;
  return `closeout-capsule-${createHash("sha256").update(seed).digest("hex").slice(0, 24)}`;
}

export function closeoutCapsuleToLegacyHumanSummary(capsule: CloseoutCapsule): {
  artifactKind: "agent_team_human_closeout_summary";
  summaryVersion: "agent-team-human-closeout-summary.v1";
  whatChanged: string;
  whyItChanged: string;
  filesTouched: string[];
  testsRun: string[];
  result: string;
  limitations: string[];
  nextStep: string;
  eli5Progress: string;
  roleReadbacks: CloseoutCapsuleRoleReadback[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawTranscriptStored: false;
  rawLogsStored: false;
} {
  const seed = capsule.opportunitySeeds.find((item) => item.kind !== "no_op");
  return {
    artifactKind: "agent_team_human_closeout_summary",
    summaryVersion: "agent-team-human-closeout-summary.v1",
    whatChanged: capsule.structuredSummary.qualityAssessment.slice(0, 600),
    whyItChanged: capsule.structuredSummary.workflowFitAssessment.slice(0, 600),
    filesTouched: capsule.factualRefs.fileRefs.slice(0, 30),
    testsRun: capsule.factualRefs.validationRefs.slice(0, 30),
    result: capsule.structuredSummary.taskSuccess,
    limitations: capsule.humanReport.limitations.slice(0, 20),
    nextStep: seed?.recommendedNextStep ?? "Review the Closeout Capsule for next steps.",
    eli5Progress: capsule.humanReport.eli5Progress,
    roleReadbacks: buildCloseoutCapsuleRoleReadbacks(capsule),
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawLogsStored: false,
  };
}

function buildCloseoutCapsuleRoleReadbacks(
  capsule: CloseoutCapsule,
): CloseoutCapsuleRoleReadback[] {
  const factualRoleById = new Map(capsule.factualRefs.roles.map((role) => [role.roleId, role]));
  return capsule.roleCloseouts.slice(0, 20).map((role) => {
    const factualRole = factualRoleById.get(role.roleId);
    const whatRoleDid = role.whatIActuallyDid ?? role.actuallyDid;
    const evidenceRefs = uniqueBoundedStrings(
      [
        ...(role.evidenceRefs ?? []),
        ...(role.filesOrArtifactsTouched ?? []),
        ...capsule.factualRefs.artifactRefs,
      ],
      12,
      260,
    );
    const validationEvidence = uniqueBoundedStrings(
      [
        role.validationIPerformed,
        ...(role.evidenceRefs ?? []),
        ...capsule.factualRefs.validationRefs,
      ],
      12,
      260,
    );
    return {
      roleId: role.roleId,
      roleRef: `role://${role.roleId}`,
      agentId: role.agentId ?? factualRole?.agentId ?? null,
      modelRef: role.modelRef ?? factualRole?.modelRef ?? null,
      modelRunRef: role.modelRunRef ?? null,
      status: factualRole?.status ?? null,
      source: role.source,
      modelAuthoredCloseout:
        role.source === "model"
          ? compactRoleReadbackText(role.whatIActuallyDid ?? role.actuallyDid, 1_200)
          : "Model-authored role closeout was unavailable.",
      askedToDo: compactRoleReadbackText(role.whatIWasAskedToDo ?? role.askedToDo, 800),
      whatRoleDid: compactRoleReadbackText(whatRoleDid, 1_200),
      filesOrArtifactsTouched: uniqueBoundedStrings(role.filesOrArtifactsTouched ?? [], 20, 260),
      evidenceRefs,
      validationEvidence,
      limitations: uniqueBoundedStrings(role.limitations, 8, 500),
      eli5Progress: compactRoleReadbackText(
        role.eli5Progress ?? whatRoleDid ?? capsule.humanReport.eli5Progress,
        1_000,
      ),
    };
  });
}

function compactRoleReadbackText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, Math.max(0, maxLength - 13)).trimEnd()} [truncated]`;
}

function uniqueBoundedStrings(
  values: Array<string | null | undefined>,
  maxItems: number,
  maxLength: number,
): string[] {
  const normalized = values
    .map((value) => value?.replace(/\s+/gu, " ").trim())
    .filter((value): value is string => Boolean(value))
    .map((value) =>
      value.length <= maxLength
        ? value
        : `${value.slice(0, Math.max(0, maxLength - 13)).trimEnd()} [truncated]`,
    );
  return [...new Set(normalized)].slice(0, maxItems);
}

export async function recordCloseoutCapsuleArtifact(input: {
  runtimeJobs: RuntimeJobRepository;
  capsule: CloseoutCapsule;
}): Promise<void> {
  const capsule = parseCloseoutCapsule(input.capsule);
  const metadata = capsule as unknown as JsonValue;
  const capsuleHash = closeoutCapsuleHash(capsule);
  await input.runtimeJobs.attachArtifact({
    jobId: capsule.factualRefs.runtimeJobId,
    artifactType: CLOSEOUT_CAPSULE_ARTIFACT_TYPE,
    storageKind: "metadata",
    uri: `runtime-job://${capsule.factualRefs.runtimeJobId}/closeout-capsule/${capsule.capsuleId}`,
    contentType: "application/json",
    sizeBytes: Buffer.byteLength(JSON.stringify(metadata), "utf8"),
    sha256: capsuleHash,
    metadata,
  });
  await input.runtimeJobs.recordEvent({
    jobId: capsule.factualRefs.runtimeJobId,
    eventType: "execution_platform.closeout_capsule_recorded",
    data: {
      capsuleId: capsule.capsuleId,
      capsuleHash,
      humanReportSource: capsule.humanReport.source,
      roleCloseoutCount: capsule.roleCloseouts.length,
      opportunitySeedCount: capsule.opportunitySeeds.length,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    },
  });
}
