import type { MemoryIdentityDescriptor } from "./semantic-identity.ts";
import { isDeterministicSameSlotSupersession } from "./semantic-identity.ts";
import type { ReviewMode, ModelMemoryObject } from "./semantic-schema.ts";
import type {
  ModelMemoryActivationBasis,
  ModelMemoryLifecycleState,
  ModelMemorySourceKind,
  ModelMemorySupportKind,
} from "./storage-database-contract.ts";

export type WriteDecisionCode =
  | "write_structural_accept"
  | "review_mode_overridden"
  | "duplicate_identity"
  | "slot_supersession"
  | "non_durable_ignored"
  | "support_attached"
  | "daily_recovery_provisional"
  | "collision_distinct"
  | "collision_conflict_hold"
  | "collision_supersession"
  | "existing_provisional_activated"
  | "same_source_rerun"
  | "derived_recovery_non_reinforcing";

export type ExistingStoredObject = {
  id: string;
  kind: ModelMemoryObject["kind"];
  identityKey: string;
  slotKey?: string;
  lifecycleState?: ModelMemoryLifecycleState;
};

export type CollisionMatch =
  | {
      relation: "attach_support";
      target: ExistingStoredObject;
    }
  | {
      relation: "supersedes";
      target: ExistingStoredObject;
    }
  | {
      relation: "distinct";
    }
  | {
      relation: "conflict_hold";
    };

export type WritePolicyInput = {
  object: ModelMemoryObject;
  identity: MemoryIdentityDescriptor;
  sourceKind?: ModelMemorySourceKind;
  existingByIdentity?: ExistingStoredObject;
  existingBySlot?: ExistingStoredObject;
  collisionMatch?: CollisionMatch;
  targetAlreadyHasSourceSupport?: boolean;
};

type SupportAttachment = {
  supportKind: ModelMemorySupportKind;
  countsForReinforcement: boolean;
};

type BaseWriteDecision = {
  executedReviewMode: "auto_accept" | "suppress";
  decisionCodes: WriteDecisionCode[];
};

export type WritePolicyDecision =
  | (BaseWriteDecision & {
      decision: "ignore";
    })
  | (BaseWriteDecision & {
      decision: "attach_support";
      memoryObjectId: string;
      support: SupportAttachment;
      activateTargetObjectId?: string;
      activationBasis?: ModelMemoryActivationBasis;
    })
  | (BaseWriteDecision & {
      decision: "write";
      lifecycleState: Exclude<ModelMemoryLifecycleState, "superseded">;
      activationBasis: ModelMemoryActivationBasis;
      support: SupportAttachment;
    })
  | (BaseWriteDecision & {
      decision: "supersede";
      supersededObjectId: string;
      lifecycleState: "active";
      activationBasis: "primary_capture";
      support: SupportAttachment;
    });

function addReviewOverrideCode(
  decisionCodes: WriteDecisionCode[],
  reviewMode: ReviewMode,
): WriteDecisionCode[] {
  if (reviewMode === "auto_accept") {
    return decisionCodes;
  }
  return [...decisionCodes, "review_mode_overridden"];
}

function sourceCanActivate(sourceKind: ModelMemorySourceKind | undefined): boolean {
  return sourceKind !== "daily_continuity";
}

function buildNewObjectSupport(sourceKind: ModelMemorySourceKind | undefined): SupportAttachment {
  if (sourceKind === "daily_continuity") {
    return {
      supportKind: "daily_recovery",
      countsForReinforcement: false,
    };
  }
  return {
    supportKind: "origin_capture",
    countsForReinforcement: true,
  };
}

function buildAttachedSupport(input: {
  sourceKind?: ModelMemorySourceKind;
  targetAlreadyHasSourceSupport: boolean;
}): SupportAttachment {
  if (input.sourceKind === "daily_continuity") {
    return {
      supportKind: "daily_recovery",
      countsForReinforcement: false,
    };
  }
  if (input.targetAlreadyHasSourceSupport) {
    return {
      supportKind: "same_source_rerun",
      countsForReinforcement: false,
    };
  }
  return {
    supportKind: "independent_reinforcement",
    countsForReinforcement: true,
  };
}

function maybeActivationForExistingTarget(input: {
  target: ExistingStoredObject;
  support: SupportAttachment;
  sourceKind?: ModelMemorySourceKind;
}): {
  activateTargetObjectId?: string;
  activationBasis?: ModelMemoryActivationBasis;
  codes: WriteDecisionCode[];
} {
  if (
    input.target.lifecycleState === "provisional" &&
    input.support.countsForReinforcement &&
    sourceCanActivate(input.sourceKind)
  ) {
    return {
      activateTargetObjectId: input.target.id,
      activationBasis: "support_attachment",
      codes: ["existing_provisional_activated"],
    };
  }
  return { codes: [] };
}

function shouldSupersedeFromSlot(input: WritePolicyInput, target: ExistingStoredObject): boolean {
  if (!sourceCanActivate(input.sourceKind)) {
    return false;
  }
  return isDeterministicSameSlotSupersession(
    {
      kind: target.kind,
      identityKey: target.identityKey,
      slotKey: target.slotKey,
    },
    {
      kind: input.object.kind,
      identityKey: input.identity.identityKey,
      slotKey: input.identity.slotKey,
    },
  );
}

export function decideWritePolicy(input: WritePolicyInput): WritePolicyDecision {
  if (input.object.durability !== "durable") {
    return {
      decision: "ignore",
      executedReviewMode: "suppress",
      decisionCodes: ["non_durable_ignored"],
    };
  }

  if (input.existingByIdentity) {
    const support = buildAttachedSupport({
      sourceKind: input.sourceKind,
      targetAlreadyHasSourceSupport: input.targetAlreadyHasSourceSupport ?? false,
    });
    const activation = maybeActivationForExistingTarget({
      target: input.existingByIdentity,
      support,
      sourceKind: input.sourceKind,
    });
    return {
      decision: "attach_support",
      executedReviewMode: "suppress",
      memoryObjectId: input.existingByIdentity.id,
      support,
      activateTargetObjectId: activation.activateTargetObjectId,
      activationBasis: activation.activationBasis,
      decisionCodes: [
        "duplicate_identity",
        "support_attached",
        ...(support.supportKind === "same_source_rerun"
          ? (["same_source_rerun"] satisfies WriteDecisionCode[])
          : []),
        ...(support.supportKind === "daily_recovery"
          ? (["derived_recovery_non_reinforcing"] satisfies WriteDecisionCode[])
          : []),
        ...activation.codes,
      ] satisfies WriteDecisionCode[],
    };
  }

  const supersessionTarget =
    input.existingBySlot && shouldSupersedeFromSlot(input, input.existingBySlot)
      ? input.existingBySlot
      : undefined;

  if (supersessionTarget) {
    return {
      decision: "supersede",
      executedReviewMode: "auto_accept",
      supersededObjectId: supersessionTarget.id,
      lifecycleState: "active",
      activationBasis: "primary_capture",
      support: buildNewObjectSupport(input.sourceKind),
      decisionCodes: addReviewOverrideCode(["slot_supersession"], input.object.reviewMode),
    };
  }

  switch (input.collisionMatch?.relation) {
    case "attach_support": {
      const support = buildAttachedSupport({
        sourceKind: input.sourceKind,
        targetAlreadyHasSourceSupport: input.targetAlreadyHasSourceSupport ?? false,
      });
      const activation = maybeActivationForExistingTarget({
        target: input.collisionMatch.target,
        support,
        sourceKind: input.sourceKind,
      });
      return {
        decision: "attach_support",
        executedReviewMode: "suppress",
        memoryObjectId: input.collisionMatch.target.id,
        support,
        activateTargetObjectId: activation.activateTargetObjectId,
        activationBasis: activation.activationBasis,
        decisionCodes: [
          "support_attached",
          ...(support.supportKind === "same_source_rerun"
            ? (["same_source_rerun"] satisfies WriteDecisionCode[])
            : []),
          ...(support.supportKind === "daily_recovery"
            ? (["derived_recovery_non_reinforcing"] satisfies WriteDecisionCode[])
            : []),
          ...activation.codes,
        ] satisfies WriteDecisionCode[],
      };
    }
    case "supersedes": {
      if (shouldSupersedeFromSlot(input, input.collisionMatch.target)) {
        return {
          decision: "supersede",
          executedReviewMode: "auto_accept",
          supersededObjectId: input.collisionMatch.target.id,
          lifecycleState: "active",
          activationBasis: "primary_capture",
          support: buildNewObjectSupport(input.sourceKind),
          decisionCodes: addReviewOverrideCode(
            ["collision_supersession", "slot_supersession"],
            input.object.reviewMode,
          ),
        };
      }
      return {
        decision: "write",
        executedReviewMode: "auto_accept",
        lifecycleState: "conflict_hold",
        activationBasis: "collision_conflict",
        support: buildNewObjectSupport(input.sourceKind),
        decisionCodes: addReviewOverrideCode(["collision_conflict_hold"], input.object.reviewMode),
      };
    }
    case "conflict_hold":
      return {
        decision: "write",
        executedReviewMode: "auto_accept",
        lifecycleState: "conflict_hold",
        activationBasis: "collision_conflict",
        support: buildNewObjectSupport(input.sourceKind),
        decisionCodes: addReviewOverrideCode(["collision_conflict_hold"], input.object.reviewMode),
      };
    case "distinct":
    default: {
      const lifecycleState = input.sourceKind === "daily_continuity" ? "provisional" : "active";
      const activationBasis =
        input.sourceKind === "daily_continuity" ? "daily_recovery_candidate" : "primary_capture";
      return {
        decision: "write",
        executedReviewMode: "auto_accept",
        lifecycleState,
        activationBasis,
        support: buildNewObjectSupport(input.sourceKind),
        decisionCodes: addReviewOverrideCode(
          lifecycleState === "provisional"
            ? ["daily_recovery_provisional"]
            : ["write_structural_accept", "collision_distinct"],
          input.object.reviewMode,
        ),
      };
    }
  }
}
