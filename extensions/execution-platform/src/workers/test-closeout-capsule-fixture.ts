import {
  buildCloseoutCapsuleId,
  CLOSEOUT_CAPSULE_SCHEMA_VERSION,
  parseCloseoutCapsule,
  type CloseoutCapsule,
} from "../codex-bridge/closeout-capsule.ts";

export function createModelAuthoredCloseoutCapsuleFixture(input: {
  runtimeJobId: string;
  teamRunId?: string | null;
  workflowId?: string | null;
  roleId?: string;
  agentId?: string | null;
  modelRef?: string;
  modelRunRef?: string;
  reportMarkdown?: string;
  eli5Progress?: string;
  fileRefs?: string[];
  artifactRefs?: string[];
  validationRefs?: string[];
  taskSuccess?: CloseoutCapsule["structuredSummary"]["taskSuccess"];
  humanReportSource?: CloseoutCapsule["humanReport"]["source"];
}): CloseoutCapsule {
  const createdAt = "2026-05-08T22:00:00.000Z";
  const capsuleId = buildCloseoutCapsuleId({
    runtimeJobId: input.runtimeJobId,
    teamRunId: input.teamRunId ?? null,
    createdAt,
  });
  const workflowId = input.workflowId ?? "agent_team.coding";
  const roleId = input.roleId ?? "implementation_engineer";
  const agentId = input.agentId ?? roleId;
  const modelRef = input.modelRef ?? "model://fixture-implementation";
  const artifactRefs = (
    input.artifactRefs ?? [`runtime-job://${input.runtimeJobId}/runtime-worker/adapter-result`]
  ).slice(0, 40);
  const validationRefs = (
    input.validationRefs ?? [`runtime-job://${input.runtimeJobId}/validation/focused-tests`]
  ).slice(0, 30);
  const fileRefs = (
    input.fileRefs ?? [
      "extensions/execution-platform/src/workers/acp-codex-coding-worker-adapter.ts",
    ]
  ).slice(0, 40);
  return parseCloseoutCapsule({
    artifactKind: "execution_platform_closeout_capsule",
    schemaVersion: CLOSEOUT_CAPSULE_SCHEMA_VERSION,
    capsuleId,
    createdAt,
    modelRef: "model://fixture-closeout",
    humanReport: {
      source: input.humanReportSource ?? "model",
      reportMarkdown:
        input.reportMarkdown ??
        "The worker completed the bounded workflow task, validation, review, and closeout evidence path.",
      eli5Progress:
        input.eli5Progress ??
        "OpenClaw picked up the job, checked the work, and wrote a useful human report.",
      limitations: ["fixture closeout for static worker-boundary proof"],
    },
    structuredSummary: {
      taskSuccess: input.taskSuccess ?? "satisfied",
      qualityAssessment: "The work product is supported by bounded runtime evidence.",
      workflowFitAssessment: `The ${workflowId} workflow was appropriate for the task.`,
      agentModelFitAssessment: "The fixture roles and model refs matched the coding workflow.",
      missingWork:
        input.taskSuccess === "satisfied" || input.taskSuccess === undefined ? [] : ["repair task"],
      validationSummary: "Focused fixture validation refs are present.",
      riskSummary: "No production side effects were performed.",
      opportunitySeedIds: [`${input.runtimeJobId}-seed-1`],
    },
    roleCloseouts: [
      {
        roleId,
        agentId,
        modelRef,
        modelRunRef: input.modelRunRef ?? `model-run://${input.runtimeJobId}/${roleId}`,
        source: input.humanReportSource ?? "model",
        askedToDo: "Implement a bounded coding change.",
        actuallyDid: "Recorded bounded implementation evidence.",
        whatIWasAskedToDo: "Implement a bounded coding change.",
        whatIActuallyDid: "Recorded bounded implementation evidence.",
        evidenceRefs: artifactRefs.slice(0, 12),
        filesOrArtifactsTouched: fileRefs,
        validationIPerformed: "Focused fixture validation refs are present.",
        worked: ["runtime evidence was recorded"],
        failedOrWeak: ["live multi-agent execution was not run in this fixture"],
        wouldImproveNext: ["run through the approved live ACP/Codex adapter"],
        recommendedNextStep: "Run through the approved live ACP/Codex adapter.",
        skillOrProcessOpportunitySeeds: [],
        opportunitySeeds: [],
        confidence: "medium",
        limitations: ["fixture closeout"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawTranscriptStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      },
    ],
    opportunitySeeds: [
      {
        seedId: `${input.runtimeJobId}-seed-1`,
        kind: "follow_up_work_item",
        title: "Run live ACP/Codex coding worker proof",
        rationale: "Static proof should be followed by one bounded live worker proof.",
        recommendedNextStep: "Run Slice 8 live proof when approved bridge config is available.",
        evidenceRefs: artifactRefs.slice(0, 8),
        confidence: "medium",
      },
    ],
    factualRefs: {
      runtimeJobId: input.runtimeJobId,
      teamRunId: input.teamRunId ?? null,
      workflowId,
      status: "completed",
      roles: [
        {
          roleId,
          agentId,
          modelRef,
          status: "completed",
        },
      ],
      fileRefs,
      artifactRefs,
      validationRefs,
      runtimeEventRefs: [`runtime-job://${input.runtimeJobId}/events`],
    },
    safetyFlags: {
      rawPromptStored: false,
      rawResponseStored: false,
      rawTranscriptStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      workQueueLifecycleMutatedDirectly: false,
      authorityGrantedByCloseout: false,
      runtimeJobCreatedByCloseout: false,
    },
  });
}
