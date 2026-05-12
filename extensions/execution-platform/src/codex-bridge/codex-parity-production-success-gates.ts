export type CodexParityProductionSuccessGateInput = {
  runtimeJobState: string;
  runtimeGraphPresent: boolean;
  dynamicGraphUsed: boolean;
  processCompleted: boolean;
  sourceEditsRequired: boolean;
  changedFileRefs: string[];
  validationRecords: Array<{ commandRef: string; status: string }>;
  testIntegrityAccepted: boolean;
  roleEvidenceCount: number;
  repeatedRoleInvocationPresent: boolean;
  validationRepairLoopPassed: boolean;
  closeoutPresent: boolean;
  closeoutModelAuthored: boolean;
  closeoutTaskSatisfied: boolean;
};

export type CodexParityProductionSuccessGateDecision = {
  artifactKind: "codex_parity_production_success_gate_decision";
  status: "accepted" | "blocked";
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawCommandLogsStored: false;
  workQueueLifecycleMutated: false;
};

export function decideCodexParityProductionSuccess(
  input: CodexParityProductionSuccessGateInput,
): CodexParityProductionSuccessGateDecision {
  const validationStatesKnown =
    input.validationRecords.length > 0 &&
    input.validationRecords.every((record) =>
      ["passed", "failed", "skipped", "not_run"].includes(record.status),
    );
  const validationPassed =
    input.validationRecords.length > 0 &&
    input.validationRecords.every((record) => record.status === "passed");
  const reasonCodes = [
    ...(input.runtimeJobState === "succeeded" || input.runtimeJobState === "running"
      ? []
      : [`runtime_job_state_not_success_capable:${input.runtimeJobState}`]),
    ...(input.runtimeGraphPresent ? [] : ["runtime_graph_missing"]),
    ...(input.dynamicGraphUsed ? [] : ["dynamic_runtime_graph_not_used"]),
    ...(input.processCompleted ? [] : ["worker_process_not_completed"]),
    ...(input.sourceEditsRequired && input.changedFileRefs.length === 0
      ? ["required_source_edit_missing"]
      : []),
    ...(validationStatesKnown ? [] : ["validation_states_not_known"]),
    ...(validationPassed ? [] : ["validation_not_all_passed"]),
    ...(input.testIntegrityAccepted ? [] : ["test_integrity_not_accepted"]),
    ...(input.roleEvidenceCount >= 4 ? [] : ["insufficient_role_evidence"]),
    ...(input.repeatedRoleInvocationPresent ? [] : ["repeated_role_invocation_missing"]),
    ...(input.validationRepairLoopPassed ? [] : ["validation_repair_loop_not_passed"]),
    ...(input.closeoutPresent ? [] : ["closeout_missing"]),
    ...(input.closeoutModelAuthored ? [] : ["model_authored_closeout_missing"]),
    ...(input.closeoutTaskSatisfied ? [] : ["closeout_does_not_satisfy_task"]),
  ];
  return {
    artifactKind: "codex_parity_production_success_gate_decision",
    status: reasonCodes.length === 0 ? "accepted" : "blocked",
    reasonCodes:
      reasonCodes.length === 0 ? ["codex_parity_production_success_gate_accepted"] : reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawCommandLogsStored: false,
    workQueueLifecycleMutated: false,
  };
}
