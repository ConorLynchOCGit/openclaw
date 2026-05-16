import { createHash } from "node:crypto";
import type { CloseoutCapsuleOpportunitySeed } from "../codex-bridge/closeout-capsule.ts";
import type { JsonValue } from "../runtime-job-repository.ts";
import type { WorkItemArtifact, WorkItemVersion } from "./types.ts";
import type { WorkQueueRepository } from "./work-queue-repository.ts";

export const PLANNING_CAPSULE_ARTIFACT_KIND = "execution_platform.planning_capsule";
export const PLANNING_CAPSULE_SCHEMA_VERSION = "execution-platform.planning-capsule.v1";

export type PlanningCapsuleLifecycleState =
  | "intake"
  | "planning_draft"
  | "needs_owner_decision"
  | "revised"
  | "approved_action_graph"
  | "compile_ready"
  | "compiled"
  | "running"
  | "closed"
  | "needs_review";

export type PlanningCapsule = {
  artifactKind: typeof PLANNING_CAPSULE_ARTIFACT_KIND;
  schemaVersion: typeof PLANNING_CAPSULE_SCHEMA_VERSION;
  capsuleId: string;
  workItemId: string;
  lifecycleState: PlanningCapsuleLifecycleState;
  objective: string;
  currentState: string;
  assumptions: string[];
  nonGoals: string[];
  childActions: Array<{
    actionId: string;
    title: string;
    assignedWorkflow: string;
    dependencyActionIds: string[];
    status: "proposed" | "approved" | "compiled" | "running" | "closed" | "needs_review";
    evidenceRefs: string[];
  }>;
  workflowRecommendations: string[];
  contextMemoryNeeds: string[];
  humanDecisionRefs: string[];
  validationPlan: string[];
  risks: string[];
  openQuestions: string[];
  rollbackRecoveryNotes: string[];
  eli5Progress: string;
  modelAuthored: true;
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  workQueueLifecycleMutationAllowed: false;
};

export type PlanningCapsuleValidationResult = {
  accepted: boolean;
  reasonCodes: string[];
};

export type PlanningCapsulePersistenceResult = {
  artifactKind: "planning_capsule_persistence_result";
  capsuleId: string;
  capsuleHash: string;
  workItemId: string;
  version: WorkItemVersion;
  artifact: WorkItemArtifact;
  refs: {
    versionRef: string;
    artifactRef: string;
  };
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  workQueueLifecycleMutated: false;
};

export type OpportunitySeedPlanningCapsuleInput = {
  workQueue: WorkQueueRepository;
  workItemId: string;
  capsuleId: string;
  seed: CloseoutCapsuleOpportunitySeed;
  sourceCloseoutRef: string;
  sourceCapsuleRef?: string | null;
  qualityReviewRef?: string | null;
  actorId?: string | null;
};

function compactLine(value: string, maxLength: number): string {
  const compacted = value.replace(/\s+/gu, " ").trim();
  if (compacted.length <= maxLength) {
    return compacted;
  }
  return `${compacted.slice(0, Math.max(0, maxLength - 3))}...`;
}

export function planningCapsuleHash(capsule: PlanningCapsule): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(capsule)).digest("hex")}`;
}

export function validatePlanningCapsule(capsule: PlanningCapsule): PlanningCapsuleValidationResult {
  const reasonCodes: string[] = [];
  if (capsule.artifactKind !== PLANNING_CAPSULE_ARTIFACT_KIND) {
    reasonCodes.push("invalid_planning_capsule_artifact_kind");
  }
  if (capsule.schemaVersion !== PLANNING_CAPSULE_SCHEMA_VERSION) {
    reasonCodes.push("invalid_planning_capsule_schema_version");
  }
  if (!capsule.modelAuthored) {
    reasonCodes.push("planning_capsule_must_be_model_authored");
  }
  if (capsule.rawPromptStored || capsule.rawResponseStored || capsule.rawLogsStored) {
    reasonCodes.push("planning_capsule_raw_storage_not_allowed");
  }
  if (capsule.workQueueLifecycleMutationAllowed) {
    reasonCodes.push("planning_capsule_cannot_mutate_work_queue_lifecycle");
  }
  if (capsule.objective.length > 2_000 || capsule.currentState.length > 2_000) {
    reasonCodes.push("planning_capsule_summary_exceeds_bounds");
  }
  if (capsule.childActions.length > 40) {
    reasonCodes.push("planning_capsule_child_action_count_exceeds_bounds");
  }
  return {
    accepted: reasonCodes.length === 0,
    reasonCodes,
  };
}

export async function createPlanningCapsuleWorkQueueVersion(input: {
  workQueue: WorkQueueRepository;
  workItemId: string;
  capsule: PlanningCapsule;
  actorId?: string | null;
}): Promise<PlanningCapsulePersistenceResult> {
  const validation = validatePlanningCapsule(input.capsule);
  if (!validation.accepted) {
    throw new Error(`invalid planning capsule: ${validation.reasonCodes.join(",")}`);
  }
  const capsuleHash = planningCapsuleHash(input.capsule);
  const body = JSON.stringify(
    {
      objective: compactLine(input.capsule.objective, 1_000),
      lifecycleState: input.capsule.lifecycleState,
      childActions: input.capsule.childActions.map((action) => ({
        actionId: action.actionId,
        title: compactLine(action.title, 180),
        assignedWorkflow: compactLine(action.assignedWorkflow, 120),
        dependencyActionIds: action.dependencyActionIds.slice(0, 20),
        status: action.status,
        evidenceRefs: action.evidenceRefs.slice(0, 10),
      })),
      validationPlan: input.capsule.validationPlan.slice(0, 20),
      openQuestions: input.capsule.openQuestions.slice(0, 20),
      eli5Progress: compactLine(input.capsule.eli5Progress, 1_000),
    },
    null,
    2,
  );
  const version = await input.workQueue.createWorkItemVersion({
    workItemId: input.workItemId,
    title: compactLine(`Planning Capsule: ${input.capsule.objective}`, 180),
    body,
    artifactMetadata: {
      artifactKind: PLANNING_CAPSULE_ARTIFACT_KIND,
      schemaVersion: PLANNING_CAPSULE_SCHEMA_VERSION,
      capsuleId: input.capsule.capsuleId,
      capsuleHash,
      lifecycleState: input.capsule.lifecycleState,
      modelAuthored: true,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutationAllowed: false,
    } satisfies JsonValue,
  });
  const artifactRef = `work-queue://${input.workItemId}/planning-capsule/${input.capsule.capsuleId}`;
  const artifact = await input.workQueue.attachArtifactReference({
    workItemId: input.workItemId,
    versionId: version.versionId,
    artifactType: PLANNING_CAPSULE_ARTIFACT_KIND,
    storageKind: "metadata",
    uri: artifactRef,
    contentType: "application/json",
    sha256: capsuleHash,
    metadata: {
      capsuleId: input.capsule.capsuleId,
      capsuleHash,
      lifecycleState: input.capsule.lifecycleState,
      childActionCount: input.capsule.childActions.length,
      humanDecisionRefs: input.capsule.humanDecisionRefs.slice(0, 20),
      validationPlanRefs: input.capsule.validationPlan.slice(0, 20),
      actorId: input.actorId ?? null,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutationAllowed: false,
    } satisfies JsonValue,
  });
  return {
    artifactKind: "planning_capsule_persistence_result",
    capsuleId: input.capsule.capsuleId,
    capsuleHash,
    workItemId: input.workItemId,
    version,
    artifact,
    refs: {
      versionRef: `work-queue://${input.workItemId}/version/${version.versionId}`,
      artifactRef,
    },
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutated: false,
  };
}

export function buildPlanningCapsuleFromOpportunitySeed(
  input: Omit<OpportunitySeedPlanningCapsuleInput, "workQueue" | "actorId">,
): PlanningCapsule {
  const seed = input.seed;
  const workflowRecommendation =
    seed.kind === "new_skill_candidate" || seed.kind === "existing_skill_edit"
      ? "workflow.docs_skills"
      : seed.kind === "proactive_plan"
        ? "agent_team.product_spec_planning"
        : "agent_team.coding";
  return {
    artifactKind: PLANNING_CAPSULE_ARTIFACT_KIND,
    schemaVersion: PLANNING_CAPSULE_SCHEMA_VERSION,
    capsuleId: input.capsuleId,
    workItemId: input.workItemId,
    lifecycleState: "planning_draft",
    objective: compactLine(seed.title, 1_000),
    currentState: compactLine(seed.rationale, 1_000),
    assumptions: [
      "This Planning Capsule was drafted from a model-authored Closeout Capsule opportunity seed.",
      `Seed confidence: ${seed.confidence}.`,
    ],
    nonGoals: [
      "Do not create runtime jobs until the approved action graph passes compiler validation.",
      "Do not treat the opportunity seed as execution authority.",
    ],
    childActions: [
      {
        actionId: `${seed.seedId}-planning-review`,
        title: "Review and refine the opportunity seed into an approved action graph",
        assignedWorkflow: "agent_team.product_spec_planning",
        dependencyActionIds: [],
        status: "proposed",
        evidenceRefs: [input.sourceCloseoutRef, ...(input.seed.evidenceRefs ?? [])].slice(0, 10),
      },
      {
        actionId: `${seed.seedId}-implementation-or-followup`,
        title: compactLine(seed.recommendedNextStep, 180),
        assignedWorkflow: workflowRecommendation,
        dependencyActionIds: [`${seed.seedId}-planning-review`],
        status: "proposed",
        evidenceRefs: [input.sourceCloseoutRef, input.qualityReviewRef ?? ""].filter(Boolean),
      },
    ],
    workflowRecommendations: ["agent_team.product_spec_planning", workflowRecommendation],
    contextMemoryNeeds: [
      "Retrieve bounded source closeout refs and related project-state context before revision.",
    ],
    humanDecisionRefs: ["owner-decision://planning-capsule/review-or-approve-action-graph"],
    validationPlan: [
      "Validate the Planning Capsule schema and bounded refs.",
      "Validate action graph dependencies and compile readiness before runtime job creation.",
    ],
    risks: [
      "The opportunity seed may be too broad until owner/AI planning revision narrows scope.",
      "Runtime execution remains blocked until compiler and authority gates pass.",
    ],
    openQuestions: [
      "Should this remain plan-only or compile into child action graph proposals?",
      "What priority should the owner assign relative to the current active queue?",
    ],
    rollbackRecoveryNotes: [
      "Archive or supersede this Planning Capsule version if owner review rejects the seed.",
    ],
    eli5Progress:
      "We turned a useful follow-up idea from a closeout into a planning draft the Work Queue can review before any execution happens.",
    modelAuthored: true,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutationAllowed: false,
  };
}

export async function createPlanningCapsuleFromOpportunitySeed(
  input: OpportunitySeedPlanningCapsuleInput,
): Promise<PlanningCapsulePersistenceResult> {
  return createPlanningCapsuleWorkQueueVersion({
    workQueue: input.workQueue,
    workItemId: input.workItemId,
    capsule: buildPlanningCapsuleFromOpportunitySeed(input),
    actorId: input.actorId,
  });
}
