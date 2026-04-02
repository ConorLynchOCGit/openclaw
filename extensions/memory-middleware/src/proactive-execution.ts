import type {
  DriftCheckExecuteInput,
  DriftCheckExecuteResult,
  MemoryProactiveExecuteInput,
  MemoryProactiveExecuteResult,
  MemoryProactivePlanAction,
  MemoryProactivePlanResult,
} from "./db/runtime.js";
import type { DriftCheckExecutionPort } from "./drift-check-execution.js";
import type { ProactivePlanningPort } from "./proactive-planning.js";

export type ProactiveExecutionPort = {
  execute(input: MemoryProactiveExecuteInput): Promise<MemoryProactiveExecuteResult>;
};

function normalizeAffectedIds(ids: string[] | undefined): string[] | undefined {
  if (!ids) {
    return undefined;
  }

  const normalized = [...new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0))];
  return normalized.length > 0
    ? normalized.sort((left, right) => left.localeCompare(right))
    : undefined;
}

function buildDriftCheckExecuteInput(
  input: MemoryProactiveExecuteInput,
  affectedIds: string[],
): DriftCheckExecuteInput {
  return {
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.includeValidatedProcedures !== undefined
      ? { includeValidatedProcedures: input.includeValidatedProcedures }
      : {}),
    ...(input.reviewerAgentId ? { reviewerAgentId: input.reviewerAgentId } : {}),
    approvedFindings: affectedIds.map((affectedId) => ({
      actionType: "drift_check_review",
      affectedObjectIds: [affectedId],
    })),
  };
}

function findDerivedDriftCheckAction(
  plan: Extract<MemoryProactivePlanResult, { accepted: true }>,
): MemoryProactivePlanAction | undefined {
  return plan.actions.find((action) => action.actionType === "run_drift_check");
}

export function createProactiveExecutionPort(params: {
  proactivePlanning: ProactivePlanningPort;
  driftCheckExecution: DriftCheckExecutionPort;
  mode: "disabled" | "candidate-only";
}): ProactiveExecutionPort {
  if (params.mode !== "candidate-only") {
    return {
      async execute(input) {
        return {
          accepted: false,
          status: "disabled",
          actionType: input.actionType,
          reason: "proactive execution mode is not enabled",
        };
      },
    };
  }

  return {
    async execute(input) {
      if (input.actionType !== "run_drift_check") {
        return {
          accepted: true,
          status: "blocked",
          actionType: input.actionType,
          executionSource: normalizeAffectedIds(input.affectedIds)
            ? "explicit_selection"
            : "derived_plan",
          affectedIds: normalizeAffectedIds(input.affectedIds) ?? [],
          rationale: [
            `proactive execution for ${input.actionType} is out of scope in this slice`,
            "only the bounded run_drift_check action class may execute proactively",
          ],
        };
      }

      const explicitAffectedIds = normalizeAffectedIds(input.affectedIds);
      if (explicitAffectedIds) {
        const driftCheckExecution = await params.driftCheckExecution.execute(
          buildDriftCheckExecuteInput(input, explicitAffectedIds),
        );

        if (!driftCheckExecution.accepted) {
          return {
            accepted: false,
            status: driftCheckExecution.status,
            actionType: "run_drift_check",
            reason: driftCheckExecution.reason,
          };
        }

        return {
          accepted: true,
          status: driftCheckExecution.status,
          actionType: "run_drift_check",
          executionSource: "explicit_selection",
          affectedIds: explicitAffectedIds,
          rationale: [
            "bounded proactive execution routed the explicit run_drift_check selection through the existing drift-check seam",
          ],
          driftCheckExecution,
        };
      }

      const plan = await params.proactivePlanning.plan({
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(input.maxActions !== undefined ? { maxActions: input.maxActions } : {}),
      });

      if (!plan.accepted) {
        return {
          accepted: false,
          status: plan.status,
          actionType: "run_drift_check",
          reason: plan.reason,
        };
      }

      const derivedAction = findDerivedDriftCheckAction(plan);
      if (!derivedAction || derivedAction.affectedIds.length === 0) {
        return {
          accepted: true,
          status: "no_op",
          actionType: "run_drift_check",
          executionSource: "derived_plan",
          affectedIds: [],
          rationale: [
            "no advisory run_drift_check proactive action is currently available",
            "no bounded proactive drift-check execution was performed",
          ],
        };
      }

      const driftCheckExecution = await params.driftCheckExecution.execute(
        buildDriftCheckExecuteInput(input, derivedAction.affectedIds),
      );

      if (!driftCheckExecution.accepted) {
        return {
          accepted: false,
          status: driftCheckExecution.status,
          actionType: "run_drift_check",
          reason: driftCheckExecution.reason,
        };
      }

      return {
        accepted: true,
        status: driftCheckExecution.status,
        actionType: "run_drift_check",
        executionSource: "derived_plan",
        affectedIds: derivedAction.affectedIds,
        rationale: [
          "bounded proactive execution derived the run_drift_check action from the current advisory planner result",
        ],
        driftCheckExecution,
      };
    },
  };
}
