import { createHash } from "node:crypto";
import { runCodingTeamLivePilot } from "../codex-bridge/coding-team-live-pilot.ts";
import { runNormalUxPromptToWorkflowDogfood } from "../intent-routing/normal-ux-dogfood.ts";
import type { RuntimeJobRepository } from "../runtime-job-repository.ts";
import type { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import { runArchitectureSpecReviewLivePilot } from "./architecture-spec-review-live-pilot.ts";
import { runDocsSkillsLivePilot } from "./docs-skills-live-pilot.ts";
import { runQaTestReviewLivePilot } from "./qa-test-review-live-pilot.ts";
import { runResearchToCodingHandoffPilot } from "./research-to-coding-handoff-pilot.ts";
import { runWebResearchLivePilot } from "./web-research-live-pilot.ts";
import type { WebResearchSourceEvidence } from "./web-research-runtime-evidence.ts";

export const OWNER_WORK_BATCH_VERSION = "execution-platform.owner-work-batch.v1";

export type OwnerWorkBatchResult = {
  artifactKind: "owner_work_batch_result";
  batchVersion: typeof OWNER_WORK_BATCH_VERSION;
  status: "completed" | "needs_review" | "blocked";
  taskCount: number;
  completedCount: number;
  needsReviewCount: number;
  blockedCount: number;
  runtimeJobIds: string[];
  workQueueItemIds: string[];
  taskResults: Array<{
    taskId: string;
    workflowId: string;
    status: string;
    runtimeJobIds: string[];
    workQueueItemIds: string[];
    reasonCodes: string[];
  }>;
  runtimeJobsCreated: boolean;
  liveWorkQueueItemsCreated: boolean;
  authorityGranted: false;
  controlsApplied: boolean;
  deployPerformed: false;
  outboundSendPerformed: false;
  modelPromotionPerformed: false;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawPageStored: false;
  workQueueLifecycleMutated: false;
};

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function boundedSource(): WebResearchSourceEvidence {
  return {
    sourceRef: "official-openai-docs://structured-outputs",
    sourceKind: "official_docs",
    urlHash: sha256("https://platform.openai.com/docs/guides/structured-outputs"),
    contentHash: "owner-work-batch-fixture-content-hash",
    titleSummary: "OpenAI structured outputs guide",
    citationSummary: "Bounded official docs source ref; no page body stored.",
    retrievedAt: new Date().toISOString(),
    rawPageStored: false,
  };
}

export async function runOwnerWorkBatch(input: {
  runtimeJobs: RuntimeJobRepository;
  workQueue: WorkQueueRepository;
  createWorkQueueLinkage?: boolean;
}): Promise<OwnerWorkBatchResult> {
  const suffix = Date.now();
  const createWorkQueueLinkage = input.createWorkQueueLinkage ?? true;
  const coding = await runCodingTeamLivePilot({
    runtimeJobs: input.runtimeJobs,
    workQueue: input.workQueue,
    createWorkQueueLinkage,
    runtimeJobId: `owner-work-batch-coding-${suffix}`,
    teamRunId: `owner-work-batch-team-${suffix}`,
    objectiveSummary:
      "Tiny product-safe improvement rehearsal for Work Queue provider-degradation readback.",
  });
  const research = await runWebResearchLivePilot({
    runtimeJobs: input.runtimeJobs,
    workQueue: input.workQueue,
    createWorkQueueLinkage,
    runtimeJobId: `owner-work-batch-research-${suffix}`,
    researchRunId: `owner-work-batch-research-run-${suffix}`,
    boundedQuerySummary: "Research current structured-output guidance with bounded citations.",
    boundedAnswerSummary:
      "Official docs should be stored as bounded refs, timestamps, hashes, and summaries only.",
    sources: [boundedSource()],
  });
  const handoff = await runResearchToCodingHandoffPilot({
    runtimeJobs: input.runtimeJobs,
    workQueue: input.workQueue,
    createWorkQueueLinkage,
    parentRuntimeJobId: `owner-work-batch-handoff-parent-${suffix}`,
    childRuntimeJobId: `owner-work-batch-handoff-child-${suffix}`,
    teamRunId: `owner-work-batch-handoff-team-${suffix}`,
    researchRunId: `owner-work-batch-handoff-research-${suffix}`,
    objectiveSummary: "Use bounded research refs before a tiny coding-team improvement.",
    boundedResearchSummary: "Research-to-coding handoff stores bounded source refs only.",
    sources: [boundedSource()],
  });
  const docsSkills = await runDocsSkillsLivePilot({
    runtimeJobs: input.runtimeJobs,
    workQueue: input.workQueue,
    createWorkQueueLinkage,
    runtimeJobId: `owner-work-batch-docs-skills-${suffix}`,
    reviewRunId: `owner-work-batch-docs-skills-review-${suffix}`,
    objectiveSummary: "Update bounded docs/runbook notes for live starter workflow readback.",
  });
  const architecture = await runArchitectureSpecReviewLivePilot({
    runtimeJobs: input.runtimeJobs,
    workQueue: input.workQueue,
    createWorkQueueLinkage,
    runtimeJobId: `owner-work-batch-architecture-${suffix}`,
    reviewRunId: `owner-work-batch-architecture-review-${suffix}`,
    objectiveSummary:
      "Review the architecture/spec boundaries for starter workflows and Work Queue projection.",
  });
  const qaTest = await runQaTestReviewLivePilot({
    runtimeJobs: input.runtimeJobs,
    workQueue: input.workQueue,
    createWorkQueueLinkage,
    runtimeJobId: `owner-work-batch-qa-test-${suffix}`,
    reviewRunId: `owner-work-batch-qa-test-review-${suffix}`,
    objectiveSummary:
      "Review focused validation coverage for starter workflow pilots and no false success.",
  });
  const dogfood = await runNormalUxPromptToWorkflowDogfood({
    runtimeJobs: input.runtimeJobs,
    workQueue: input.workQueue,
    mode: createWorkQueueLinkage ? "live_linked_fixture_router" : "fixture",
  });
  const taskResults = [
    {
      taskId: "owner-work-batch.coding",
      workflowId: "agent_team.coding",
      status: coding.status,
      runtimeJobIds: [coding.runtimeJobId],
      workQueueItemIds: coding.workQueueReadback ? [coding.workQueueReadback.workItemId] : [],
      reasonCodes: coding.runnerResult.failure ? [coding.runnerResult.failure.stage] : [],
    },
    {
      taskId: "owner-work-batch.web_research",
      workflowId: "single_agent.web_research",
      status: research.status,
      runtimeJobIds: [research.runtimeJobId],
      workQueueItemIds: research.workQueueReadback ? [research.workQueueReadback.workItemId] : [],
      reasonCodes: research.evidence.reasonCodes,
    },
    {
      taskId: "owner-work-batch.research_to_coding",
      workflowId: "agent_team.coding+single_agent.web_research",
      status: handoff.status,
      runtimeJobIds: [handoff.parentRuntimeJobId, handoff.childRuntimeJobId],
      workQueueItemIds: handoff.workQueueReadback ? [handoff.workQueueReadback.workItemId] : [],
      reasonCodes: handoff.handoffReasonCodes,
    },
    {
      taskId: "owner-work-batch.docs_skills",
      workflowId: "workflow.docs_skills",
      status: docsSkills.status,
      runtimeJobIds: [docsSkills.runtimeJobId],
      workQueueItemIds: docsSkills.workQueueReadback
        ? [docsSkills.workQueueReadback.workItemId]
        : [],
      reasonCodes: [`${docsSkills.workflowKind}_completed`],
    },
    {
      taskId: "owner-work-batch.architecture_spec",
      workflowId: "agent_team.architecture",
      status: architecture.status,
      runtimeJobIds: [architecture.runtimeJobId],
      workQueueItemIds: architecture.workQueueReadback
        ? [architecture.workQueueReadback.workItemId]
        : [],
      reasonCodes: [`${architecture.workflowKind}_completed`],
    },
    {
      taskId: "owner-work-batch.qa_test",
      workflowId: "agent_team.qa_test",
      status: qaTest.status,
      runtimeJobIds: [qaTest.runtimeJobId],
      workQueueItemIds: qaTest.workQueueReadback ? [qaTest.workQueueReadback.workItemId] : [],
      reasonCodes: [`${qaTest.workflowKind}_completed`],
    },
    {
      taskId: "owner-work-batch.normal_ux_dogfood",
      workflowId: "normal_ux_prompt_to_workflow",
      status: dogfood.status,
      runtimeJobIds: dogfood.runtimeJobIds,
      workQueueItemIds: dogfood.workItemIds,
      reasonCodes: dogfood.results.flatMap((result) => result.reasonCodes).slice(0, 20),
    },
  ];
  const runtimeJobIds = taskResults.flatMap((result) => result.runtimeJobIds);
  const workQueueItemIds = taskResults.flatMap((result) => result.workQueueItemIds);
  const completedCount = taskResults.filter((result) => result.status === "completed").length;
  const needsReviewCount = taskResults.filter((result) => result.status === "needs_review").length;
  const blockedCount = taskResults.filter((result) => result.status === "blocked").length;
  return {
    artifactKind: "owner_work_batch_result",
    batchVersion: OWNER_WORK_BATCH_VERSION,
    status: blockedCount > 0 ? "blocked" : needsReviewCount > 0 ? "needs_review" : "completed",
    taskCount: taskResults.length,
    completedCount,
    needsReviewCount,
    blockedCount,
    runtimeJobIds,
    workQueueItemIds,
    taskResults,
    runtimeJobsCreated: runtimeJobIds.length > 0,
    liveWorkQueueItemsCreated: workQueueItemIds.length > 0,
    authorityGranted: false,
    controlsApplied: dogfood.controlsApplied,
    deployPerformed: false,
    outboundSendPerformed: false,
    modelPromotionPerformed: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawPageStored: false,
    workQueueLifecycleMutated: false,
  };
}
