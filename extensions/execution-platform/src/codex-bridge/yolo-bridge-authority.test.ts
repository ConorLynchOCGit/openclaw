import { describe, expect, it } from "vitest";
import {
  createOperatorEquivalentYoloTargetAuthorityProfile,
  createStagedYoloBridgeAuthorityProfile,
  getYoloBridgeAuthoritySource,
  validateYoloBridgeAuthorityProfile,
} from "./index.ts";

describe("YOLO bridge authority profiles", () => {
  it("models the final operator-equivalent YOLO target authority", () => {
    const profile = createOperatorEquivalentYoloTargetAuthorityProfile();

    expect(profile.profileKind).toBe("operator_equivalent_yolo_target");
    expect(profile.currentStage).toBe("operator_equivalent_yolo_target");
    expect(profile.targetFinalAuthority.shellCommand).toBe("operator_equivalent");
    expect(profile.targetFinalAuthority.localRepoFileWrite).toBe(true);
    expect(profile.targetFinalAuthority.validationCommands).toBe(true);
    expect(profile.targetFinalAuthority.repairRetryLoop).toBe(true);
    expect(profile.targetFinalAuthority.durableControls).toBe(true);
    expect(profile.targetFinalAuthority.workQueueLifecycleMutation).toBe(false);
    expect(profile.targetFinalAuthority.modelPromotion).toBe(false);
    expect(profile.requiresRuntimeOversight).toBe(true);
    expect(profile.requiresSupabaseRuntimePersistence).toBe(true);
  });

  it("models staged authority without granting final YOLO authority", () => {
    const profile = createStagedYoloBridgeAuthorityProfile({
      currentStage: "approved_repo_files_and_validation_commands",
    });
    const validation = validateYoloBridgeAuthorityProfile(profile);

    expect(profile.profileKind).toBe("staged_bounded");
    expect(profile.currentlyGrantedAuthority.shellCommand).toBe(
      "approved_validation_commands_only",
    );
    expect(profile.currentlyGrantedAuthority.localRepoFileWrite).toBe(true);
    expect(profile.currentlyGrantedAuthority.validationCommands).toBe(true);
    expect(profile.currentlyGrantedAuthority.rebuild).toBe(false);
    expect(profile.currentlyGrantedAuthority.deploy).toBe(false);
    expect(profile.explicitlyNotGrantedYet).toEqual(
      expect.arrayContaining(["shellCommand", "dependencyInstall", "rebuild"]),
    );
    expect(validation.allowedForPlanning).toBe(true);
    expect(validation.finalYoloAuthorityCurrentlyGranted).toBe(false);
  });

  it("rejects staged profiles that claim final YOLO authority is currently granted", () => {
    const profile = createStagedYoloBridgeAuthorityProfile({
      currentStage: "approved_validation_commands_only",
    });
    profile.currentlyGrantedAuthority.shellCommand = "operator_equivalent";
    const validation = validateYoloBridgeAuthorityProfile(profile);

    expect(validation.allowedForPlanning).toBe(false);
    expect(validation.blockingReasons).toEqual(
      expect.arrayContaining(["staged_profile_claims_final_yolo_authority"]),
    );
  });

  it("rejects hidden Work Queue lifecycle or deploy authority", () => {
    const profile = createStagedYoloBridgeAuthorityProfile({
      currentStage: "approved_repo_scope_with_validation_and_repair",
    });
    profile.currentlyGrantedAuthority.workQueueLifecycleMutation = true;
    profile.currentlyGrantedAuthority.deploy = true;

    const validation = validateYoloBridgeAuthorityProfile(profile);

    expect(validation.allowedForPlanning).toBe(false);
    expect(validation.blockingReasons).toEqual(
      expect.arrayContaining([
        "work_queue_lifecycle_mutation_not_allowed",
        "deploy_or_outbound_requires_separate_approval",
      ]),
    );
  });
  it("models staged bridge authority separately from the operator-equivalent YOLO target", () => {
    const staged = getYoloBridgeAuthoritySource(false);
    const target = getYoloBridgeAuthoritySource(true);

    expect(staged).toMatchObject({
      kind: "staged-bridge-authority",
      operatorEquivalentYolo: false,
    });
    expect(target).toMatchObject({
      kind: "operator-equivalent-yolo-target-authority",
      operatorEquivalentYolo: true,
    });
    expect(staged).not.toEqual(target);
  });
});
