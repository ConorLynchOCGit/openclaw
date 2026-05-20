import type { JsonValue } from "../runtime-job-repository.ts";

export type CommitmentEvidenceClaim = {
  commitmentId: string;
  evidenceRef: string;
  evidenceKind:
    | "source_change"
    | "test_validation"
    | "review"
    | "docs"
    | "readback"
    | "artifact"
    | "human_decision"
    | "closeout"
    | "research_brief"
    | "planning_capsule"
    | "action_graph_proposal"
    | "compile_readiness"
    | "other";
  claimSummary: string;
  limitations: string[];
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
