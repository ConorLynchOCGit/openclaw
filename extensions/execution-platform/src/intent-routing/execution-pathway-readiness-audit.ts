export type ExecutionPathwayReadinessInput = {
  nativeExecutionRpcsLiveOnGateway: boolean;
  liveUxExecutionSubmitProven: boolean;
  workflowContractsRegistered: string[];
  childWorkflowHandoffProven: boolean;
  researchRoutingPolicyProven: boolean;
  supervisorDispatchProven: boolean;
  workQueueProjectionProven: boolean;
  nativeControlsProven: boolean;
  multiWorkflowUxE2eProven: boolean;
  liveNativeRpcSoakProven: boolean;
  docsAndCloseoutComplete: boolean;
  rawContentStored: boolean;
  workQueueLifecycleMutated: boolean;
  productionDeployOccurred: boolean;
  externalOutboundWriteOrSendOccurred: boolean;
  productionModelPromotionOccurred: boolean;
};

export type ExecutionPathwayReadinessAudit = {
  artifactKind: "execution_pathway_readiness_audit";
  scorePercent: number;
  coreExecutionCanShiftIntoOpenClaw: boolean;
  milestone4CanResume: boolean;
  hardBlockers: string[];
  evidenceSummary: {
    workflowContractCount: number;
    workflowContractsRegistered: string[];
    nativeExecutionRpcsLiveOnGateway: boolean;
    liveUxExecutionSubmitProven: boolean;
    multiWorkflowUxE2eProven: boolean;
  };
  rawPromptStored: false;
  rawResponseStored: false;
  workQueueLifecycleMutated: false;
};

export function buildExecutionPathwayReadinessAudit(
  input: ExecutionPathwayReadinessInput,
): ExecutionPathwayReadinessAudit {
  const blockers: string[] = [];
  const checks: Array<[boolean, number, string]> = [
    [input.nativeExecutionRpcsLiveOnGateway, 15, "native_execution_rpcs_not_live_on_gateway"],
    [input.liveUxExecutionSubmitProven, 12, "live_ux_execution_submit_not_proven"],
    [
      input.workflowContractsRegistered.includes("agent_team.coding") &&
        input.workflowContractsRegistered.includes("single_agent.web_research") &&
        input.workflowContractsRegistered.includes("agent_team.architecture") &&
        input.workflowContractsRegistered.includes("workflow.docs_skills"),
      10,
      "required_workflow_contracts_missing",
    ],
    [input.childWorkflowHandoffProven, 8, "child_workflow_handoff_not_proven"],
    [input.researchRoutingPolicyProven, 8, "research_routing_policy_not_proven"],
    [input.supervisorDispatchProven, 8, "supervisor_dispatch_not_proven"],
    [input.workQueueProjectionProven, 8, "work_queue_projection_not_proven"],
    [input.nativeControlsProven, 8, "native_controls_not_proven"],
    [input.multiWorkflowUxE2eProven, 10, "multi_workflow_ux_e2e_not_proven"],
    [input.liveNativeRpcSoakProven, 8, "live_native_rpc_soak_not_proven"],
    [input.docsAndCloseoutComplete, 5, "docs_or_closeout_incomplete"],
  ];
  let score = 0;
  for (const [passed, weight, blocker] of checks) {
    if (passed) {
      score += weight;
    } else {
      blockers.push(blocker);
    }
  }
  if (input.rawContentStored) {
    blockers.push("raw_content_storage_detected");
    score = Math.min(score, 60);
  }
  if (input.workQueueLifecycleMutated) {
    blockers.push("work_queue_lifecycle_mutation_detected");
    score = Math.min(score, 60);
  }
  if (
    input.productionDeployOccurred ||
    input.externalOutboundWriteOrSendOccurred ||
    input.productionModelPromotionOccurred
  ) {
    blockers.push("prohibited_production_side_effect_detected");
    score = Math.min(score, 50);
  }
  return {
    artifactKind: "execution_pathway_readiness_audit",
    scorePercent: score,
    coreExecutionCanShiftIntoOpenClaw: score >= 95 && blockers.length === 0,
    milestone4CanResume: score >= 95 && blockers.length === 0,
    hardBlockers: blockers,
    evidenceSummary: {
      workflowContractCount: input.workflowContractsRegistered.length,
      workflowContractsRegistered: input.workflowContractsRegistered.slice(0, 20),
      nativeExecutionRpcsLiveOnGateway: input.nativeExecutionRpcsLiveOnGateway,
      liveUxExecutionSubmitProven: input.liveUxExecutionSubmitProven,
      multiWorkflowUxE2eProven: input.multiWorkflowUxE2eProven,
    },
    rawPromptStored: false,
    rawResponseStored: false,
    workQueueLifecycleMutated: false,
  };
}
