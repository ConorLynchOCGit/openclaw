export type CodexParityReadinessAuditInput = {
  oneShotExecProductionDisabled: boolean;
  persistentCodexAppServerLoopAvailable: boolean;
  directMainRepoEditPathAvailable: boolean;
  validationRepairLoopAvailable: boolean;
  dynamicOpenClawRoleGraphAvailable: boolean;
  workQueueReadbackShowsRoleGraph: boolean;
  closeoutAfterEvidenceAccepted: boolean;
  longFormUxProofPassed: boolean;
};

export type CodexParityReadinessAudit = {
  artifactKind: "codex_parity_readiness_audit";
  status: "codex_parity_ready" | "not_codex_parity";
  dimensions: Record<keyof CodexParityReadinessAuditInput, "passed" | "failed">;
  reasonCodes: string[];
  oneShotExecProductionAllowed: false;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawCommandLogsStored: false;
  workQueueLifecycleMutated: false;
};

const REASON_BY_DIMENSION: Record<keyof CodexParityReadinessAuditInput, string> = {
  oneShotExecProductionDisabled: "one_shot_exec_production_path_still_available",
  persistentCodexAppServerLoopAvailable: "persistent_codex_app_server_loop_missing",
  directMainRepoEditPathAvailable: "direct_main_repo_edit_path_missing",
  validationRepairLoopAvailable: "validation_repair_loop_missing",
  dynamicOpenClawRoleGraphAvailable: "dynamic_openclaw_role_graph_missing",
  workQueueReadbackShowsRoleGraph: "work_queue_role_graph_readback_missing",
  closeoutAfterEvidenceAccepted: "closeout_ordering_not_after_runtime_evidence",
  longFormUxProofPassed: "long_form_ux_proof_missing",
};

export function createCodexParityReadinessAudit(
  input: CodexParityReadinessAuditInput,
): CodexParityReadinessAudit {
  const dimensions = Object.fromEntries(
    (Object.keys(input) as Array<keyof CodexParityReadinessAuditInput>).map((key) => [
      key,
      input[key] ? "passed" : "failed",
    ]),
  ) as CodexParityReadinessAudit["dimensions"];
  const reasonCodes = (Object.keys(input) as Array<keyof CodexParityReadinessAuditInput>)
    .filter((key) => !input[key])
    .map((key) => REASON_BY_DIMENSION[key]);
  return {
    artifactKind: "codex_parity_readiness_audit",
    status: reasonCodes.length === 0 ? "codex_parity_ready" : "not_codex_parity",
    dimensions,
    reasonCodes,
    oneShotExecProductionAllowed: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawCommandLogsStored: false,
    workQueueLifecycleMutated: false,
  };
}
