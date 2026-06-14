import type { JsonValue } from "../runtime-job-repository.ts";
import type { RuntimeEvidenceKind } from "./runtime-evidence-kind.ts";
import type { TeamGraphNode } from "./runtime-work-graph.ts";
import type { RuntimeValidationPhase } from "./validation-phase.ts";
import type { WorkflowRoleClass } from "./workflow-orchestration-policy.ts";

export type CommitmentEvidenceClaim = {
  commitmentId: string;
  evidenceRef: string;
  evidenceKind: RuntimeEvidenceKind;
  claimSummary: string;
  limitations: string[];
  validationPhase?: RuntimeValidationPhase;
  validationRefs?: string[];
  changedFileRefs?: string[];
  validationPhaseCompatibility?: "compatible" | "incompatible" | "not_closure_capable";
  validationPhaseReasonCodes?: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type RuntimeWorkGraphNodeExecutionResult = {
  status: "succeeded" | "needs_review" | "failed" | "blocked" | "waiting_for_human" | "canceled";
  outputArtifactRefs: string[];
  producedOutputRefs?: string[];
  artifactRefs?: string[];
  modelRunRefs?: string[];
  runtimeToolInvocationRefs?: string[];
  scriptJobRefs?: string[];
  dbOperationRefs?: string[];
  validationRefs?: string[];
  validationSummaryRefs?: string[];
  changedFileRefs?: string[];
  humanDecisionRefs?: string[];
  closeoutRefs?: string[];
  limitations?: string[];
  sufficiencyJudgmentRef?: string | null;
  ownerSummary?: string | null;
  eli5Summary?: string | null;
  reasonCodes: string[];
  evidenceClaims?: CommitmentEvidenceClaim[];
  metadata?: JsonValue;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored?: false;
  rawDbRowsStored?: false;
  authorityGranted?: false;
  controlsApplied?: false;
  workQueueLifecycleMutated: false;
  runtimeLifecycleMutated?: false;
};

export type RuntimeWorkGraphNodeExecutionInput = {
  graphId: string;
  node: TeamGraphNode;
  snapshotSummary: JsonValue;
  missionLedgerSummary?: JsonValue | null;
  rawPromptStored: false;
  rawResponseStored: false;
};

export type RuntimeWorkGraphNodeExecutor = {
  execute(input: RuntimeWorkGraphNodeExecutionInput): Promise<RuntimeWorkGraphNodeExecutionResult>;
};

export type RuntimeWorkGraphRoleCoverageClass =
  | "context"
  | "implementation"
  | "validation_or_test"
  | "review"
  | "planning"
  | "research"
  | "planning_capsule"
  | "human_decision"
  | "action_proposal_or_compile"
  | "closeout";

export type RuntimeWorkGraphRoleCoverageProfile = {
  profileId: string;
  requiredClasses: RuntimeWorkGraphRoleCoverageClass[];
};

export const CODING_TEAM_ROLE_COVERAGE_PROFILE: RuntimeWorkGraphRoleCoverageProfile = {
  profileId: "agent_team.coding.role_coverage.v1",
  requiredClasses: ["context", "implementation", "validation_or_test", "review"],
};

export const PRODUCT_SPEC_PLANNING_ROLE_COVERAGE_PROFILE: RuntimeWorkGraphRoleCoverageProfile = {
  profileId: "agent_team.product_spec_planning.role_coverage.v1",
  requiredClasses: ["planning", "planning_capsule", "action_proposal_or_compile", "closeout"],
};

export const ARCHITECTURE_RED_TEAM_ROLE_COVERAGE_PROFILE: RuntimeWorkGraphRoleCoverageProfile = {
  profileId: "agent_team.architecture_red_team.role_coverage.v1",
  requiredClasses: ["planning", "research", "review", "closeout"],
};

export function workflowRoleClassCoveredByProfile(input: {
  profile: RuntimeWorkGraphRoleCoverageProfile;
  roleClass: WorkflowRoleClass;
}): boolean {
  if (input.roleClass === "qa") {
    return input.profile.requiredClasses.includes("validation_or_test");
  }
  if (input.roleClass === "architecture") {
    return input.profile.requiredClasses.includes("planning");
  }
  if (input.roleClass === "research") {
    return input.profile.requiredClasses.includes("research");
  }
  return input.profile.requiredClasses.includes(
    input.roleClass as RuntimeWorkGraphRoleCoverageClass,
  );
}
