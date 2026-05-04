import type { JsonValue } from "../runtime-job-repository.ts";
import {
  createDeployAuthorityProfile,
  validateDeployAuthorityProfile,
  type DeployAuthorityProfile,
} from "./deploy-authority-profile.ts";
import {
  createInstallDependencyAuthorityProfile,
  validateInstallDependencyAuthorityProfile,
  type InstallDependencyAuthorityProfile,
} from "./install-dependency-authority-profile.ts";
import {
  createModelPromotionAuthorityProfile,
  validateModelPromotionAuthorityProfile,
  type ModelPromotionAuthorityProfile,
} from "./model-promotion-authority-profile.ts";
import {
  createOutboundNetworkAuthorityProfile,
  validateOutboundNetworkAuthorityProfile,
  type OutboundNetworkAuthorityProfile,
} from "./outbound-network-authority-profile.ts";
import {
  createRebuildAuthorityProfile,
  validateRebuildAuthorityProfile,
  type RebuildAuthorityProfile,
} from "./rebuild-authority-profile.ts";
import {
  createTrustedLocalYoloProfile,
  validateTrustedLocalYoloProfile,
  type TrustedLocalYoloAuthorityProfile,
} from "./trusted-local-yolo-profile.ts";

export type ExecutionAuthorityProfile =
  | TrustedLocalYoloAuthorityProfile
  | RebuildAuthorityProfile
  | InstallDependencyAuthorityProfile
  | OutboundNetworkAuthorityProfile
  | DeployAuthorityProfile
  | ModelPromotionAuthorityProfile;

export type ExecutionAuthorityRegistryEntry = {
  profileId: string;
  profileKind: string;
  status: "live_proven" | "live_ready" | "dry_run_only" | "mock_only";
  highBlastRadius: boolean;
  realExternalSideEffectAllowed: boolean;
  valid: boolean;
  blockingReasons: string[];
};

export type ExecutionAuthorityProfileRegistry = {
  artifactKind: "codex_bridge_authority_profile_registry";
  entries: ExecutionAuthorityRegistryEntry[];
  deployOutboundOrModelPromotionPerformed: false;
  workQueueLifecycleMutated: false;
};

function kind(profile: ExecutionAuthorityProfile): string {
  return profile.artifactKind.replace(/^codex_bridge_/u, "").replace(/_authority_profile$/u, "");
}

function validation(profile: ExecutionAuthorityProfile): {
  valid: boolean;
  blockingReasons: string[];
} {
  switch (profile.artifactKind) {
    case "codex_bridge_trusted_local_yolo_profile":
      return validateTrustedLocalYoloProfile(profile);
    case "codex_bridge_rebuild_authority_profile":
      return validateRebuildAuthorityProfile(profile);
    case "codex_bridge_install_dependency_authority_profile":
      return validateInstallDependencyAuthorityProfile(profile);
    case "codex_bridge_outbound_network_authority_profile":
      return validateOutboundNetworkAuthorityProfile(profile);
    case "codex_bridge_deploy_authority_profile":
      return validateDeployAuthorityProfile(profile);
    case "codex_bridge_model_promotion_authority_profile":
      return validateModelPromotionAuthorityProfile(profile);
    default:
      return { valid: false, blockingReasons: ["unknown_authority_profile"] };
  }
}

export function buildDefaultExecutionAuthorityProfileRegistry(): ExecutionAuthorityProfileRegistry {
  return buildExecutionAuthorityProfileRegistry({
    profiles: [
      createTrustedLocalYoloProfile({ profileId: "trusted-local-yolo-v1" }),
      createRebuildAuthorityProfile({ profileId: "rebuild-authority-v2" }),
      createInstallDependencyAuthorityProfile(),
      createOutboundNetworkAuthorityProfile(),
      createDeployAuthorityProfile(),
      createModelPromotionAuthorityProfile(),
    ],
  });
}

export function buildExecutionAuthorityProfileRegistry(input: {
  profiles: ExecutionAuthorityProfile[];
}): ExecutionAuthorityProfileRegistry {
  return {
    artifactKind: "codex_bridge_authority_profile_registry",
    entries: input.profiles.map((profile) => {
      const result = validation(profile);
      const profileKind = kind(profile);
      const highBlastRadius = profileKind !== "trusted_local_yolo_profile";
      return {
        profileId: "profileId" in profile ? profile.profileId : profileKind,
        profileKind,
        status:
          profileKind === "trusted_local_yolo_profile"
            ? "live_proven"
            : profileKind === "rebuild"
              ? "live_ready"
              : profileKind === "outbound_network" ||
                  profileKind === "deploy" ||
                  profileKind === "model_promotion"
                ? "dry_run_only"
                : "mock_only",
        highBlastRadius,
        realExternalSideEffectAllowed: false,
        valid: result.valid,
        blockingReasons: result.blockingReasons,
      };
    }),
    deployOutboundOrModelPromotionPerformed: false,
    workQueueLifecycleMutated: false,
  };
}

export function summarizeExecutionAuthorityProfileRegistry(
  registry: ExecutionAuthorityProfileRegistry,
): JsonValue {
  return {
    entries: registry.entries.map((entry) => ({
      profileId: entry.profileId,
      profileKind: entry.profileKind,
      status: entry.status,
      valid: entry.valid,
      highBlastRadius: entry.highBlastRadius,
      realExternalSideEffectAllowed: entry.realExternalSideEffectAllowed,
    })),
    deployOutboundOrModelPromotionPerformed: false,
    workQueueLifecycleMutated: false,
  };
}
