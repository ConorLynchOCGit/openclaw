import type { RuntimeValidationPhase } from "./validation-phase.ts";

export const SCHEDULER_MISSION_TAIL_KINDS = ["validation", "review", "closeout"] as const;

export type SchedulerMissionTailKind = (typeof SCHEDULER_MISSION_TAIL_KINDS)[number];

export type SchedulerClosureRunMode = "proof" | "standard";

export type SchedulerClosurePolicy = {
  tailKinds: SchedulerMissionTailKind[];
  tailCapabilityIds: Record<SchedulerMissionTailKind, string>;
  proofValidationPhase: RuntimeValidationPhase;
  standardValidationPhase: RuntimeValidationPhase;
};

export const DEFAULT_CODING_SCHEDULER_CLOSURE_POLICY: SchedulerClosurePolicy = {
  tailKinds: ["validation", "review", "closeout"],
  tailCapabilityIds: {
    validation: "validation_run",
    review: "reviewer",
    closeout: "coding_closeout",
  },
  proofValidationPhase: "final_proof_validation",
  standardValidationPhase: "integration_validation",
};

export function schedulerClosurePolicyOrDefault(
  policy: SchedulerClosurePolicy | null | undefined,
): SchedulerClosurePolicy {
  return policy ?? DEFAULT_CODING_SCHEDULER_CLOSURE_POLICY;
}

export function schedulerValidationPhaseForClosureRunMode(input: {
  policy: SchedulerClosurePolicy;
  closureRunMode: SchedulerClosureRunMode;
}): RuntimeValidationPhase {
  return input.closureRunMode === "proof"
    ? input.policy.proofValidationPhase
    : input.policy.standardValidationPhase;
}
