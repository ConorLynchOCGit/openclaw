import type { JsonValue } from "../runtime-job-repository.ts";

export type YoloBridgeAuthorityProfileKind = "staged_bounded" | "operator_equivalent_yolo_target";

export type YoloBridgeAuthorityStage =
  | "approved_validation_commands_only"
  | "approved_repo_files_and_validation_commands"
  | "approved_repo_scope_with_validation_and_repair"
  | "operator_equivalent_yolo_target";

export type YoloBridgeAuthorityGrant = {
  localRepoFileRead: boolean;
  localRepoFileWrite: boolean;
  shellCommand: "none" | "approved_validation_commands_only" | "repo_scope" | "operator_equivalent";
  validationCommands: boolean;
  dependencyInstall: boolean;
  rebuild: boolean;
  repairRetryLoop: boolean;
  artifactCloseout: boolean;
  durableControls: boolean;
  streamHeartbeatProcessEvidence: boolean;
  workQueueLifecycleMutation: boolean;
  modelPromotion: boolean;
  deploy: boolean;
  outboundSending: boolean;
};

export type YoloBridgeAuthorityProfile = {
  artifactKind: "codex_bridge_yolo_authority_profile";
  authorityProfileId: string;
  profileKind: YoloBridgeAuthorityProfileKind;
  currentStage: YoloBridgeAuthorityStage;
  targetFinalAuthority: YoloBridgeAuthorityGrant;
  currentlyGrantedAuthority: YoloBridgeAuthorityGrant;
  explicitlyNotGrantedYet: Array<keyof YoloBridgeAuthorityGrant>;
  requiresFutureOperatorApproval: boolean;
  requiresRuntimeOversight: true;
  requiresCloseout: true;
  requiresDurableControls: true;
  requiresStreamEvidence: true;
  requiresValidationLoop: true;
  requiresRollbackPlan: true;
  requiresSupabaseRuntimePersistence: true;
  riskControls: string[];
  metadata?: JsonValue;
};

export type YoloBridgeAuthorityValidationReport = {
  artifactKind: "codex_bridge_yolo_authority_validation_report";
  authorityProfileId: string;
  allowedForPlanning: boolean;
  finalYoloAuthorityCurrentlyGranted: boolean;
  blockingReasons: string[];
  warnings: string[];
};

const TARGET_AUTHORITY: YoloBridgeAuthorityGrant = {
  localRepoFileRead: true,
  localRepoFileWrite: true,
  shellCommand: "operator_equivalent",
  validationCommands: true,
  dependencyInstall: true,
  rebuild: true,
  repairRetryLoop: true,
  artifactCloseout: true,
  durableControls: true,
  streamHeartbeatProcessEvidence: true,
  workQueueLifecycleMutation: false,
  modelPromotion: false,
  deploy: false,
  outboundSending: false,
};

const NO_AUTHORITY: YoloBridgeAuthorityGrant = {
  localRepoFileRead: false,
  localRepoFileWrite: false,
  shellCommand: "none",
  validationCommands: false,
  dependencyInstall: false,
  rebuild: false,
  repairRetryLoop: false,
  artifactCloseout: false,
  durableControls: false,
  streamHeartbeatProcessEvidence: false,
  workQueueLifecycleMutation: false,
  modelPromotion: false,
  deploy: false,
  outboundSending: false,
};

function grantForStage(stage: YoloBridgeAuthorityStage): YoloBridgeAuthorityGrant {
  if (stage === "operator_equivalent_yolo_target") {
    return { ...TARGET_AUTHORITY };
  }
  if (stage === "approved_repo_scope_with_validation_and_repair") {
    return {
      ...NO_AUTHORITY,
      localRepoFileRead: true,
      localRepoFileWrite: true,
      shellCommand: "repo_scope",
      validationCommands: true,
      repairRetryLoop: true,
      artifactCloseout: true,
      durableControls: true,
      streamHeartbeatProcessEvidence: true,
    };
  }
  if (stage === "approved_repo_files_and_validation_commands") {
    return {
      ...NO_AUTHORITY,
      localRepoFileRead: true,
      localRepoFileWrite: true,
      shellCommand: "approved_validation_commands_only",
      validationCommands: true,
      repairRetryLoop: true,
      artifactCloseout: true,
      durableControls: true,
      streamHeartbeatProcessEvidence: true,
    };
  }
  return {
    ...NO_AUTHORITY,
    shellCommand: "approved_validation_commands_only",
    validationCommands: true,
    artifactCloseout: true,
    durableControls: true,
    streamHeartbeatProcessEvidence: true,
  };
}

function missingAuthority(grant: YoloBridgeAuthorityGrant): Array<keyof YoloBridgeAuthorityGrant> {
  return (Object.keys(TARGET_AUTHORITY) as Array<keyof YoloBridgeAuthorityGrant>).filter((key) => {
    if (key === "shellCommand") {
      return grant.shellCommand !== TARGET_AUTHORITY.shellCommand;
    }
    return grant[key] !== TARGET_AUTHORITY[key];
  });
}

export function createOperatorEquivalentYoloTargetAuthorityProfile(
  input: {
    authorityProfileId?: string;
    metadata?: JsonValue;
  } = {},
): YoloBridgeAuthorityProfile {
  return {
    artifactKind: "codex_bridge_yolo_authority_profile",
    authorityProfileId: input.authorityProfileId ?? "operator-equivalent-yolo-target",
    profileKind: "operator_equivalent_yolo_target",
    currentStage: "operator_equivalent_yolo_target",
    targetFinalAuthority: { ...TARGET_AUTHORITY },
    currentlyGrantedAuthority: { ...TARGET_AUTHORITY },
    explicitlyNotGrantedYet: [],
    requiresFutureOperatorApproval: true,
    requiresRuntimeOversight: true,
    requiresCloseout: true,
    requiresDurableControls: true,
    requiresStreamEvidence: true,
    requiresValidationLoop: true,
    requiresRollbackPlan: true,
    requiresSupabaseRuntimePersistence: true,
    riskControls: [
      "runtime oversight stream required",
      "durable pause redirect cancel controls required",
      "work episode closeout required",
      "model promotion deploy and outbound sending require separate approval",
      "Work Queue lifecycle mutation must never be hidden",
    ],
    metadata: input.metadata,
  };
}

export function createStagedYoloBridgeAuthorityProfile(input: {
  authorityProfileId?: string;
  currentStage: Exclude<YoloBridgeAuthorityStage, "operator_equivalent_yolo_target">;
  metadata?: JsonValue;
}): YoloBridgeAuthorityProfile {
  const currentlyGrantedAuthority = grantForStage(input.currentStage);
  return {
    artifactKind: "codex_bridge_yolo_authority_profile",
    authorityProfileId: input.authorityProfileId ?? `staged-${input.currentStage}`,
    profileKind: "staged_bounded",
    currentStage: input.currentStage,
    targetFinalAuthority: { ...TARGET_AUTHORITY },
    currentlyGrantedAuthority,
    explicitlyNotGrantedYet: missingAuthority(currentlyGrantedAuthority),
    requiresFutureOperatorApproval: true,
    requiresRuntimeOversight: true,
    requiresCloseout: true,
    requiresDurableControls: true,
    requiresStreamEvidence: true,
    requiresValidationLoop: true,
    requiresRollbackPlan: true,
    requiresSupabaseRuntimePersistence: true,
    riskControls: [
      "staged authority is not the final YOLO authority",
      "future execution requires explicit operator approval",
      "runtime payload command strings are never accepted as authority",
      "Supabase-backed runtime persistence is required before broader live pilots",
      "Work Queue lifecycle mutation remains false",
    ],
    metadata: input.metadata,
  };
}

export function validateYoloBridgeAuthorityProfile(
  profile: YoloBridgeAuthorityProfile,
): YoloBridgeAuthorityValidationReport {
  const blockingReasons: string[] = [];
  const warnings: string[] = [];
  const finalYoloAuthorityCurrentlyGranted =
    profile.profileKind === "operator_equivalent_yolo_target" ||
    profile.currentStage === "operator_equivalent_yolo_target" ||
    profile.currentlyGrantedAuthority.shellCommand === "operator_equivalent";

  if (profile.profileKind === "staged_bounded" && finalYoloAuthorityCurrentlyGranted) {
    blockingReasons.push("staged_profile_claims_final_yolo_authority");
  }
  if (!profile.requiresFutureOperatorApproval) {
    blockingReasons.push("future_operator_approval_required");
  }
  if (!profile.requiresRuntimeOversight) {
    blockingReasons.push("runtime_oversight_required");
  }
  if (!profile.requiresCloseout) {
    blockingReasons.push("closeout_required");
  }
  if (!profile.requiresDurableControls) {
    blockingReasons.push("durable_controls_required");
  }
  if (!profile.requiresValidationLoop) {
    blockingReasons.push("validation_loop_required");
  }
  if (!profile.requiresSupabaseRuntimePersistence) {
    blockingReasons.push("supabase_runtime_persistence_required");
  }
  if (profile.currentlyGrantedAuthority.workQueueLifecycleMutation) {
    blockingReasons.push("work_queue_lifecycle_mutation_not_allowed");
  }
  if (profile.currentlyGrantedAuthority.modelPromotion) {
    blockingReasons.push("model_promotion_requires_separate_approval");
  }
  if (
    profile.currentlyGrantedAuthority.deploy ||
    profile.currentlyGrantedAuthority.outboundSending
  ) {
    blockingReasons.push("deploy_or_outbound_requires_separate_approval");
  }
  if (
    profile.currentlyGrantedAuthority.shellCommand === "repo_scope" &&
    profile.currentStage !== "approved_repo_scope_with_validation_and_repair"
  ) {
    warnings.push("repo_scope_shell_authority_should_be_later_stage_only");
  }
  return {
    artifactKind: "codex_bridge_yolo_authority_validation_report",
    authorityProfileId: profile.authorityProfileId,
    allowedForPlanning: blockingReasons.length === 0,
    finalYoloAuthorityCurrentlyGranted,
    blockingReasons,
    warnings,
  };
}
export type YoloBridgeAuthoritySourceKind =
  | "staged-bridge-authority"
  | "operator-equivalent-yolo-target-authority";

export type YoloBridgeAuthoritySource = Readonly<{
  kind: YoloBridgeAuthoritySourceKind;
  operatorEquivalentYolo: boolean;
}>;

export const STAGED_BRIDGE_AUTHORITY_SOURCE: YoloBridgeAuthoritySource = Object.freeze({
  kind: "staged-bridge-authority",
  operatorEquivalentYolo: false,
});

export const OPERATOR_EQUIVALENT_YOLO_TARGET_AUTHORITY_SOURCE: YoloBridgeAuthoritySource =
  Object.freeze({
    kind: "operator-equivalent-yolo-target-authority",
    operatorEquivalentYolo: true,
  });

export function getYoloBridgeAuthoritySource(
  operatorEquivalentYolo: boolean,
): YoloBridgeAuthoritySource {
  return operatorEquivalentYolo
    ? OPERATOR_EQUIVALENT_YOLO_TARGET_AUTHORITY_SOURCE
    : STAGED_BRIDGE_AUTHORITY_SOURCE;
}
