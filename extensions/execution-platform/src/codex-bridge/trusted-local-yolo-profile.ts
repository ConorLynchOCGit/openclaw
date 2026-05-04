import type { JsonValue } from "../runtime-job-repository.ts";

export type TrustedLocalYoloShellAuthority =
  | "none"
  | "diagnostics_and_validation"
  | "operator_equivalent_local";

export type TrustedLocalYoloAuthorityProfile = {
  artifactKind: "codex_bridge_trusted_local_yolo_profile";
  profileId: string;
  profileKind: "trusted_local_yolo";
  repoReadAuthority: true;
  repoWriteAuthority: true;
  diagnosticShellAuthority: TrustedLocalYoloShellAuthority;
  validationShellAuthority: TrustedLocalYoloShellAuthority;
  repairLoopAuthority: true;
  streamEvidenceRequired: true;
  heartbeatRequired: true;
  processResultRequired: true;
  closeoutRequired: true;
  workQueueReadModelLinkageRequired: true;
  durableControlsRequired: true;
  supabaseRuntimePersistenceRequired: true;
  rollbackExpectations: string[];
  maxRuntimeMs: number;
  maxStdoutBytes: number;
  maxStderrBytes: number;
  changedFilePolicy: "approved_repo_scope" | "operator_equivalent_local_repo_with_evidence";
  deployAllowed: false;
  outboundSendingAllowed: false;
  modelPromotionAllowed: false;
  acpAllowed: boolean;
  subagentsAllowed: boolean;
  hiddenWorkQueueLifecycleMutationAllowed: false;
  hiddenRebuildsAllowed: false;
  installsAllowed: boolean;
  dependencyChangesAllowed: boolean;
  metadata?: JsonValue;
};

export type TrustedLocalYoloProfileValidationReport = {
  artifactKind: "codex_bridge_trusted_local_yolo_profile_validation";
  profileId: string;
  valid: boolean;
  blockingReasons: string[];
  warnings: string[];
};

export type TrustedLocalYoloLiveRequestAuthorityBlock = {
  authorityProfileId: string;
  profileKind: "trusted_local_yolo";
  repoReadAuthority: true;
  repoWriteAuthority: true;
  shellAuthority: TrustedLocalYoloShellAuthority;
  repairLoopAuthority: true;
  closeoutRequired: true;
  controlsRequired: true;
  streamEvidenceRequired: true;
  supabaseRuntimePersistenceRequired: true;
  hardBans: string[];
};

export function createTrustedLocalYoloProfile(
  input: Partial<
    Pick<
      TrustedLocalYoloAuthorityProfile,
      | "profileId"
      | "diagnosticShellAuthority"
      | "validationShellAuthority"
      | "acpAllowed"
      | "subagentsAllowed"
      | "installsAllowed"
      | "dependencyChangesAllowed"
      | "changedFilePolicy"
      | "maxRuntimeMs"
      | "maxStdoutBytes"
      | "maxStderrBytes"
      | "metadata"
    >
  > = {},
): TrustedLocalYoloAuthorityProfile {
  return {
    artifactKind: "codex_bridge_trusted_local_yolo_profile",
    profileId: input.profileId ?? "trusted-local-yolo-v1",
    profileKind: "trusted_local_yolo",
    repoReadAuthority: true,
    repoWriteAuthority: true,
    diagnosticShellAuthority: input.diagnosticShellAuthority ?? "operator_equivalent_local",
    validationShellAuthority: input.validationShellAuthority ?? "operator_equivalent_local",
    repairLoopAuthority: true,
    streamEvidenceRequired: true,
    heartbeatRequired: true,
    processResultRequired: true,
    closeoutRequired: true,
    workQueueReadModelLinkageRequired: true,
    durableControlsRequired: true,
    supabaseRuntimePersistenceRequired: true,
    rollbackExpectations: [
      "bridge must keep changes inspectable with git diff evidence",
      "bridge must stop cleanly or report needs_review if validation cannot pass",
      "operator may pause redirect or cancel through durable runtime controls",
    ],
    maxRuntimeMs: input.maxRuntimeMs ?? 600_000,
    maxStdoutBytes: input.maxStdoutBytes ?? 2 * 1024 * 1024,
    maxStderrBytes: input.maxStderrBytes ?? 512 * 1024,
    changedFilePolicy: input.changedFilePolicy ?? "operator_equivalent_local_repo_with_evidence",
    deployAllowed: false,
    outboundSendingAllowed: false,
    modelPromotionAllowed: false,
    acpAllowed: input.acpAllowed ?? false,
    subagentsAllowed: input.subagentsAllowed ?? false,
    hiddenWorkQueueLifecycleMutationAllowed: false,
    hiddenRebuildsAllowed: false,
    installsAllowed: input.installsAllowed ?? false,
    dependencyChangesAllowed: input.dependencyChangesAllowed ?? false,
    metadata: input.metadata,
  };
}

export function validateTrustedLocalYoloProfile(
  profile: TrustedLocalYoloAuthorityProfile,
): TrustedLocalYoloProfileValidationReport {
  const blockingReasons: string[] = [];
  const warnings: string[] = [];

  if (profile.profileKind !== "trusted_local_yolo") {
    blockingReasons.push("invalid_profile_kind");
  }
  if (!profile.repoReadAuthority || !profile.repoWriteAuthority) {
    blockingReasons.push("repo_read_write_authority_required");
  }
  if (profile.diagnosticShellAuthority === "none" || profile.validationShellAuthority === "none") {
    blockingReasons.push("diagnostic_and_validation_shell_authority_required");
  }
  if (!profile.repairLoopAuthority) {
    blockingReasons.push("repair_loop_authority_required");
  }
  if (
    !profile.streamEvidenceRequired ||
    !profile.heartbeatRequired ||
    !profile.processResultRequired
  ) {
    blockingReasons.push("stream_heartbeat_process_evidence_required");
  }
  if (!profile.closeoutRequired) {
    blockingReasons.push("closeout_required");
  }
  if (!profile.durableControlsRequired) {
    blockingReasons.push("durable_controls_required");
  }
  if (!profile.supabaseRuntimePersistenceRequired) {
    blockingReasons.push("supabase_runtime_persistence_required");
  }
  if (profile.deployAllowed) {
    blockingReasons.push("deploy_not_allowed");
  }
  if (profile.outboundSendingAllowed) {
    blockingReasons.push("outbound_sending_not_allowed");
  }
  if (profile.modelPromotionAllowed) {
    blockingReasons.push("model_promotion_not_allowed");
  }
  if (profile.hiddenWorkQueueLifecycleMutationAllowed) {
    blockingReasons.push("hidden_work_queue_lifecycle_mutation_not_allowed");
  }
  if (profile.hiddenRebuildsAllowed) {
    blockingReasons.push("hidden_rebuilds_not_allowed");
  }
  if (profile.installsAllowed) {
    warnings.push("installs_require_separate_operator_approval");
  }
  if (profile.dependencyChangesAllowed) {
    warnings.push("dependency_changes_require_separate_operator_approval");
  }
  if (!Number.isInteger(profile.maxRuntimeMs) || profile.maxRuntimeMs <= 0) {
    blockingReasons.push("invalid_max_runtime_ms");
  }
  if (!Number.isInteger(profile.maxStdoutBytes) || profile.maxStdoutBytes <= 0) {
    blockingReasons.push("invalid_max_stdout_bytes");
  }
  if (!Number.isInteger(profile.maxStderrBytes) || profile.maxStderrBytes <= 0) {
    blockingReasons.push("invalid_max_stderr_bytes");
  }

  return {
    artifactKind: "codex_bridge_trusted_local_yolo_profile_validation",
    profileId: profile.profileId,
    valid: blockingReasons.length === 0,
    blockingReasons,
    warnings,
  };
}

export function trustedLocalYoloProfileToLiveRequestAuthorityBlock(
  profile: TrustedLocalYoloAuthorityProfile,
): TrustedLocalYoloLiveRequestAuthorityBlock {
  return {
    authorityProfileId: profile.profileId,
    profileKind: "trusted_local_yolo",
    repoReadAuthority: true,
    repoWriteAuthority: true,
    shellAuthority:
      profile.validationShellAuthority === "operator_equivalent_local" ||
      profile.diagnosticShellAuthority === "operator_equivalent_local"
        ? "operator_equivalent_local"
        : "diagnostics_and_validation",
    repairLoopAuthority: true,
    closeoutRequired: true,
    controlsRequired: true,
    streamEvidenceRequired: true,
    supabaseRuntimePersistenceRequired: true,
    hardBans: [
      "deploy",
      "outbound_sending",
      "model_promotion",
      "hidden_work_queue_lifecycle_mutation",
      "hidden_rebuilds",
      "raw_transcripts_prompts_hidden_reasoning_secrets_or_unbounded_logs",
    ],
  };
}
export type TrustedLocalYoloHardBanSummaryItem = Readonly<{
  key:
    | "deploy"
    | "outbound_sending"
    | "model_promotion"
    | "hidden_work_queue_lifecycle_mutation"
    | "hidden_rebuild"
    | "raw_transcript_prompt_log_storage";
  label: string;
  banned: true;
}>;

const TRUSTED_LOCAL_YOLO_HARD_BAN_SUMMARY: readonly TrustedLocalYoloHardBanSummaryItem[] = [
  { key: "deploy", label: "Deploy", banned: true },
  { key: "outbound_sending", label: "Outbound sending", banned: true },
  { key: "model_promotion", label: "Model promotion", banned: true },
  {
    key: "hidden_work_queue_lifecycle_mutation",
    label: "Hidden Work Queue lifecycle mutation",
    banned: true,
  },
  { key: "hidden_rebuild", label: "Hidden rebuilds", banned: true },
  {
    key: "raw_transcript_prompt_log_storage",
    label: "Raw transcript, prompt, or log storage",
    banned: true,
  },
];

export function getTrustedLocalYoloHardBanSummary(): readonly TrustedLocalYoloHardBanSummaryItem[] {
  return TRUSTED_LOCAL_YOLO_HARD_BAN_SUMMARY;
}
