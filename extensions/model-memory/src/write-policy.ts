import type { MemoryIdentityDescriptor } from "./semantic-identity.ts";
import { isDeterministicSameSlotSupersession } from "./semantic-identity.ts";
import type { ReviewMode, ModelMemoryObject } from "./semantic-schema.ts";

export type WriteDecisionCode =
  | "write_structural_accept"
  | "review_mode_overridden"
  | "duplicate_identity"
  | "slot_supersession"
  | "non_durable_ignored";

export type ExistingStoredObject = {
  id: string;
  kind: ModelMemoryObject["kind"];
  identityKey: string;
  slotKey?: string;
};

export type WritePolicyInput = {
  object: ModelMemoryObject;
  identity: MemoryIdentityDescriptor;
  existingByIdentity?: ExistingStoredObject;
  existingBySlot?: ExistingStoredObject;
};

export type WritePolicyDecision =
  | {
      decision: "ignore";
      executedReviewMode: "suppress";
      decisionCodes: WriteDecisionCode[];
    }
  | {
      decision: "dedupe";
      executedReviewMode: "suppress";
      duplicateObjectId: string;
      decisionCodes: WriteDecisionCode[];
    }
  | {
      decision: "write";
      executedReviewMode: "auto_accept";
      decisionCodes: WriteDecisionCode[];
    }
  | {
      decision: "supersede";
      executedReviewMode: "auto_accept";
      supersededObjectId: string;
      decisionCodes: WriteDecisionCode[];
    };

function addReviewOverrideCode(
  decisionCodes: WriteDecisionCode[],
  reviewMode: ReviewMode,
): WriteDecisionCode[] {
  if (reviewMode === "auto_accept") {
    return decisionCodes;
  }
  return [...decisionCodes, "review_mode_overridden"];
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
    return {
      decision: "dedupe",
      executedReviewMode: "suppress",
      duplicateObjectId: input.existingByIdentity.id,
      decisionCodes: ["duplicate_identity"],
    };
  }

  const supersessionTarget =
    input.existingBySlot &&
    isDeterministicSameSlotSupersession(
      {
        kind: input.existingBySlot.kind,
        identityKey: input.existingBySlot.identityKey,
        slotKey: input.existingBySlot.slotKey,
      },
      {
        kind: input.object.kind,
        identityKey: input.identity.identityKey,
        slotKey: input.identity.slotKey,
      },
    )
      ? input.existingBySlot
      : undefined;

  if (supersessionTarget) {
    return {
      decision: "supersede",
      executedReviewMode: "auto_accept",
      supersededObjectId: supersessionTarget.id,
      decisionCodes: addReviewOverrideCode(["slot_supersession"], input.object.reviewMode),
    };
  }

  return {
    decision: "write",
    executedReviewMode: "auto_accept",
    decisionCodes: addReviewOverrideCode(["write_structural_accept"], input.object.reviewMode),
  };
}
