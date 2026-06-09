export type NativeTaskWaitStatus = "ok" | "timeout" | "error" | "pending";

export type NativeTaskChildStartFailureKind =
  | "disallowed_child_agent"
  | "missing_child_profile"
  | "wrong_child_identity_selected"
  | "child_session_receipt_incomplete"
  | "child_docs_missing"
  | "child_skill_missing"
  | "child_tool_catalog_invalid"
  | "child_workspace_unavailable"
  | "child_launch_blocked"
  | "child_session_lock_failed"
  | "child_provider_model_failure"
  | "child_provider_response_timeout"
  | "child_result_unshaped"
  | "child_run_timeout"
  | "child_run_error"
  | "child_session_start_forbidden"
  | "child_session_start_failed";

export type NativeTaskResultDeliveryStatus = "full" | "projected" | "rejected";

export type NativeTaskChildBootstrapAdmission = {
  providerReportObserved: boolean;
  childAgentId: string;
  canonicalDocsAdmitted: boolean;
  requiredSkillAdmitted: boolean;
  childToolCatalogAdmitted: boolean;
  providerToolNames: string[];
  requiredToolNames: string[];
  missingRequiredToolNames: string[];
  forbiddenToolNames: string[];
  requiredSkillSourceRef?: string | null;
  requiredSkillSourceHash?: string | null;
  requiredSkillLocation?: string | null;
  missingRequiredSources: string[];
  truncatedRequiredSources: string[];
  reportRef?: string;
  reasonCodes: string[];
};

export type NativeTaskForegroundResult = {
  status: "completed" | "pending" | "timeout" | "error";
  foreground: true;
  childSessionKey: string;
  runId: string;
  waitStatus: NativeTaskWaitStatus;
  startedAt?: number;
  endedAt?: number;
  error?: string;
  resultText?: string;
  resultTextHash?: string;
  resultTextByteCount?: number;
  resultMaxParentVisibleChars?: number;
  resultDeliveredToParentContext: boolean;
  resultDeliveryStatus?: NativeTaskResultDeliveryStatus;
  resultTruncated?: boolean;
  managedOutputRef?: string | null;
  managedOutputBytes?: number;
  managedOutputHash?: string;
  childBootstrapAdmission?: NativeTaskChildBootstrapAdmission;
  childStartFailureKind?: NativeTaskChildStartFailureKind;
  continuationId?: string;
};

export type NativeTaskRunChildTaskParams = {
  parentSessionKey?: string;
  parentToolCallId: string;
  childAgentId: string;
  task: string;
  label?: string;
  runTimeoutSeconds?: number;
  parentVisibleResultMaxChars: number;
};

export type NativeTaskRunChildTask = (
  params: NativeTaskRunChildTaskParams,
) => Promise<NativeTaskForegroundResult>;
