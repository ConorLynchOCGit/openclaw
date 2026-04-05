import type { ConsolidationExecutionPort } from "./consolidation-execution.js";
import type { ConsolidationPlanningPort } from "./consolidation-planning.js";
import type {
  ConsolidationExecuteInput,
  ConsolidationExecuteSelection,
  ConsolidationPlanInput,
  MemoryBackgroundJobRunNextAcceptedResult,
  MemoryBackgroundJobClass,
  MemoryBackgroundJobGetInput,
  MemoryBackgroundJobGetResult,
  MemoryBackgroundJobEnqueueInput,
  MemoryBackgroundJobEnqueueResult,
  MemoryBackgroundJobListInput,
  MemoryBackgroundJobListResult,
  MemoryBackgroundJobRunNextInput,
  MemoryBackgroundJobRunNextResult,
  MemoryMiddlewareDb,
  MemoryProactiveExecuteInput,
  MemoryProactivePlanInput,
} from "./db/runtime.js";
import type { ProactiveExecutionPort } from "./proactive-execution.js";
import type { ProactivePlanningPort } from "./proactive-planning.js";

export type BackgroundJobSchedulerPort = {
  enqueue(input: MemoryBackgroundJobEnqueueInput): Promise<MemoryBackgroundJobEnqueueResult>;
  list(input: MemoryBackgroundJobListInput): Promise<MemoryBackgroundJobListResult>;
  get(input: MemoryBackgroundJobGetInput): Promise<MemoryBackgroundJobGetResult>;
  runNext(input: MemoryBackgroundJobRunNextInput): Promise<MemoryBackgroundJobRunNextResult>;
};

type BackgroundJobSchedulingMode = "disabled" | "candidate-only";
type BackgroundJobInspectionMode = "disabled" | "enabled";
type BackgroundJobAdvisoryClass = "proactive_plan" | "consolidation_plan";
type BackgroundJobExecuteClass = "proactive_execute_run_drift_check" | "consolidation_execute";

function buildProactivePlanInput(input: {
  projectId?: string;
  maxActions?: number;
}): MemoryProactivePlanInput {
  return {
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.maxActions !== undefined ? { maxActions: input.maxActions } : {}),
  };
}

function buildConsolidationPlanInput(input: {
  projectId?: string;
  includeValidatedProcedures?: boolean;
  limit?: number;
  maxFindings?: number;
}): ConsolidationPlanInput {
  return {
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.includeValidatedProcedures !== undefined
      ? { includeValidatedProcedures: input.includeValidatedProcedures }
      : {}),
    ...(input.limit !== undefined ? { limit: input.limit } : {}),
    ...(input.maxFindings !== undefined ? { maxFindings: input.maxFindings } : {}),
  };
}

function normalizeConsolidationExecuteSelections(
  selections: ConsolidationExecuteSelection[] | undefined,
): ConsolidationExecuteSelection[] | undefined {
  if (!selections || selections.length === 0) {
    return undefined;
  }

  return selections
    .map((selection) => ({
      actionType: selection.actionType,
      affectedObjectIds: [
        ...new Set(selection.affectedObjectIds.map((id) => id.trim()).filter(Boolean)),
      ].sort((left, right) => left.localeCompare(right)),
    }))
    .filter((selection) => selection.affectedObjectIds.length > 0)
    .sort((left, right) => {
      const actionTypeDelta = left.actionType.localeCompare(right.actionType);
      if (actionTypeDelta !== 0) {
        return actionTypeDelta;
      }
      return left.affectedObjectIds.join(",").localeCompare(right.affectedObjectIds.join(","));
    });
}

function hasOnlySafeConsolidationExecutionSelections(
  selections: ConsolidationExecuteSelection[] | undefined,
): selections is ConsolidationExecuteSelection[] {
  return Boolean(
    selections &&
    selections.length > 0 &&
    selections.every(
      (selection) =>
        (selection.actionType === "duplicate_merge_review" ||
          selection.actionType === "stale_superseded_review") &&
        selection.affectedObjectIds.length > 0,
    ),
  );
}

function buildConsolidationExecuteInput(input: {
  projectId?: string;
  limit?: number;
  maxFindings?: number;
  approvedFindings: ConsolidationExecuteSelection[];
  reviewerAgentId?: string;
  includeValidatedProcedures?: boolean;
}): ConsolidationExecuteInput {
  return {
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.includeValidatedProcedures !== undefined
      ? { includeValidatedProcedures: input.includeValidatedProcedures }
      : {}),
    ...(input.limit !== undefined ? { limit: input.limit } : {}),
    ...(input.maxFindings !== undefined ? { maxFindings: input.maxFindings } : {}),
    approvedFindings: input.approvedFindings,
    ...(input.reviewerAgentId ? { reviewerAgentId: input.reviewerAgentId } : {}),
  };
}

function buildProactiveExecuteInput(input: {
  projectId?: string;
  maxActions?: number;
  affectedIds?: string[];
  reviewerAgentId?: string;
  includeValidatedProcedures?: boolean;
}): MemoryProactiveExecuteInput {
  return {
    actionType: "run_drift_check",
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.maxActions !== undefined ? { maxActions: input.maxActions } : {}),
    ...(input.affectedIds ? { affectedIds: input.affectedIds } : {}),
    ...(input.reviewerAgentId ? { reviewerAgentId: input.reviewerAgentId } : {}),
    ...(input.includeValidatedProcedures !== undefined
      ? { includeValidatedProcedures: input.includeValidatedProcedures }
      : {}),
  };
}

function blockedUnsupportedJobResult(
  jobId: string,
  jobClass: string,
): MemoryBackgroundJobRunNextAcceptedResult {
  return {
    accepted: true,
    status: "blocked",
    jobId,
    jobStatus: "failed",
    rationale: [
      `background job class ${jobClass} is out of scope in this slice`,
      "only proactive_plan, proactive_execute_run_drift_check, consolidation_plan, and consolidation_execute may run through the bounded scheduler",
    ],
  };
}

function isAdvisoryJobClass(
  jobClass: MemoryBackgroundJobClass,
): jobClass is BackgroundJobAdvisoryClass {
  return jobClass === "proactive_plan" || jobClass === "consolidation_plan";
}

function isExecuteJobClass(
  jobClass: MemoryBackgroundJobClass,
): jobClass is BackgroundJobExecuteClass {
  return jobClass === "proactive_execute_run_drift_check" || jobClass === "consolidation_execute";
}

function enabledRunnableJobClasses(params: {
  advisorySchedulingMode: BackgroundJobSchedulingMode;
  advisoryJobClasses: BackgroundJobAdvisoryClass[];
  executeSchedulingMode: BackgroundJobSchedulingMode;
  executeJobClasses: BackgroundJobExecuteClass[];
}): MemoryBackgroundJobClass[] {
  const classes: MemoryBackgroundJobClass[] = [];
  if (params.advisorySchedulingMode === "candidate-only") {
    classes.push(...params.advisoryJobClasses);
  }
  if (params.executeSchedulingMode === "candidate-only") {
    classes.push(...params.executeJobClasses);
  }
  return classes;
}

function hasAnySchedulingEnabled(params: {
  advisorySchedulingMode: BackgroundJobSchedulingMode;
  executeSchedulingMode: BackgroundJobSchedulingMode;
}): boolean {
  return (
    params.advisorySchedulingMode === "candidate-only" ||
    params.executeSchedulingMode === "candidate-only"
  );
}

export function createBackgroundJobSchedulerPort(params: {
  db: MemoryMiddlewareDb;
  consolidationExecution: ConsolidationExecutionPort;
  consolidationPlanning: ConsolidationPlanningPort;
  proactivePlanning: ProactivePlanningPort;
  proactiveExecution: ProactiveExecutionPort;
  inspectionMode: BackgroundJobInspectionMode;
  advisorySchedulingMode: BackgroundJobSchedulingMode;
  advisoryJobClasses: BackgroundJobAdvisoryClass[];
  executeSchedulingMode: BackgroundJobSchedulingMode;
  executeJobClasses: BackgroundJobExecuteClass[];
  runnerOwnerId?: string;
}): BackgroundJobSchedulerPort {
  if (params.inspectionMode !== "enabled" && !hasAnySchedulingEnabled(params)) {
    return {
      async enqueue(input) {
        return {
          accepted: false,
          status: "disabled",
          jobClass: input.jobClass,
          reason: "background job scheduling mode is not enabled",
        };
      },
      async list() {
        return {
          accepted: false,
          status: "disabled",
          reason: "background job inspection is not enabled",
        };
      },
      async get() {
        return {
          accepted: false,
          status: "disabled",
          reason: "background job inspection is not enabled",
        };
      },
      async runNext() {
        return {
          accepted: false,
          status: "disabled",
          reason: "background job scheduling mode is not enabled",
        };
      },
    };
  }

  return {
    enqueue(input) {
      if (
        input.jobClass !== "proactive_plan" &&
        input.jobClass !== "proactive_execute_run_drift_check" &&
        input.jobClass !== "consolidation_plan" &&
        input.jobClass !== "consolidation_execute"
      ) {
        return Promise.resolve({
          accepted: false,
          status: "blocked",
          jobClass: input.jobClass satisfies MemoryBackgroundJobClass,
          reason:
            "background job scheduling in this slice supports only proactive_plan, proactive_execute_run_drift_check, consolidation_plan, and consolidation_execute",
        });
      }

      if (
        isAdvisoryJobClass(input.jobClass) &&
        params.advisorySchedulingMode !== "candidate-only"
      ) {
        return Promise.resolve({
          accepted: false,
          status: "disabled",
          jobClass: input.jobClass,
          reason: "background job advisory scheduling is not enabled",
        });
      }

      if (
        isAdvisoryJobClass(input.jobClass) &&
        !params.advisoryJobClasses.includes(input.jobClass)
      ) {
        return Promise.resolve({
          accepted: false,
          status: "disabled",
          jobClass: input.jobClass,
          reason: `background job advisory class ${input.jobClass} is not enabled`,
        });
      }

      if (isExecuteJobClass(input.jobClass) && params.executeSchedulingMode !== "candidate-only") {
        return Promise.resolve({
          accepted: false,
          status: "disabled",
          jobClass: input.jobClass,
          reason: "background job execute-class scheduling is not enabled",
        });
      }

      if (isExecuteJobClass(input.jobClass) && !params.executeJobClasses.includes(input.jobClass)) {
        return Promise.resolve({
          accepted: false,
          status: "disabled",
          jobClass: input.jobClass,
          reason: `background job execute-class ${input.jobClass} is not enabled`,
        });
      }

      if (
        input.jobClass === "consolidation_execute" &&
        !hasOnlySafeConsolidationExecutionSelections(
          normalizeConsolidationExecuteSelections(input.approvedFindings),
        )
      ) {
        return Promise.resolve({
          accepted: false,
          status: "blocked",
          jobClass: input.jobClass,
          reason:
            "consolidation_execute requires explicit approvedFindings limited to duplicate_merge_review or stale_superseded_review",
        });
      }

      return params.db.queries.enqueueBackgroundJob(input);
    },
    async list(input) {
      if (params.inspectionMode !== "enabled") {
        return {
          accepted: false,
          status: "disabled",
          reason: "background job inspection is not enabled",
        };
      }
      return params.db.queries.listBackgroundJobs(input);
    },
    async get(input) {
      if (params.inspectionMode !== "enabled") {
        return {
          accepted: false,
          status: "disabled",
          reason: "background job inspection is not enabled",
        };
      }
      return params.db.queries.getBackgroundJob(input);
    },
    async runNext(input) {
      if (!hasAnySchedulingEnabled(params)) {
        return {
          accepted: false,
          status: "disabled",
          reason: "background job scheduling mode is not enabled",
        };
      }

      if (params.runnerOwnerId) {
        if (!input.runnerId || input.runnerId !== params.runnerOwnerId) {
          return {
            accepted: false,
            status: "disabled",
            reason: "background job runner ownership is not authorized",
          };
        }
      }

      let claimedJob;
      try {
        claimedJob = await params.db.queries.claimNextBackgroundJob({
          ...input,
          allowedJobClasses: enabledRunnableJobClasses(params),
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : "background job claim failed";
        return {
          accepted: false,
          status: reason.includes("not configured") ? "not_configured" : "failed",
          reason,
        };
      }

      if (!claimedJob) {
        return {
          accepted: true,
          status: "no_job",
          rationale: ["no queued bounded background job is currently ready to run"],
        };
      }

      if (
        claimedJob.jobClass !== "proactive_plan" &&
        claimedJob.jobClass !== "proactive_execute_run_drift_check" &&
        claimedJob.jobClass !== "consolidation_plan" &&
        claimedJob.jobClass !== "consolidation_execute"
      ) {
        const result = blockedUnsupportedJobResult(claimedJob.jobId, claimedJob.jobClass);
        await params.db.queries.finalizeBackgroundJob({
          jobId: claimedJob.jobId,
          status: "failed",
          lastError: result.rationale.join(" "),
          executionMetadata: {
            source: "memory_background_job_run_next",
            jobClass: claimedJob.jobClass,
            status: result.status,
          },
        });
        return result;
      }

      try {
        if (claimedJob.jobClass === "proactive_plan") {
          const proactivePlanResult = await params.proactivePlanning.plan(
            buildProactivePlanInput(claimedJob),
          );
          const jobStatus = proactivePlanResult.accepted ? "succeeded" : "failed";

          await params.db.queries.finalizeBackgroundJob({
            jobId: claimedJob.jobId,
            status: jobStatus,
            ...(proactivePlanResult.accepted ? {} : { lastError: proactivePlanResult.reason }),
            executionMetadata: {
              source: "memory_background_job_run_next",
              jobClass: claimedJob.jobClass,
              ...(input.runnerId ? { runnerId: input.runnerId } : {}),
              plannerStatus: proactivePlanResult.status,
              ...(proactivePlanResult.accepted
                ? {
                    plannerOutcome: proactivePlanResult.outcome,
                    actionTypes: proactivePlanResult.actions.map((action) => action.actionType),
                  }
                : {}),
            },
          });

          return {
            accepted: true,
            status: "executed",
            jobId: claimedJob.jobId,
            jobClass: claimedJob.jobClass,
            jobStatus,
            rationale: proactivePlanResult.accepted
              ? ["bounded background job executed advisory proactive planning only"]
              : [
                  "bounded background job execution failed while running advisory proactive planning",
                ],
            proactivePlanResult,
          };
        }

        if (claimedJob.jobClass === "consolidation_plan") {
          const consolidationPlanResult = await params.consolidationPlanning.plan(
            buildConsolidationPlanInput(claimedJob),
          );
          const jobStatus = consolidationPlanResult.accepted ? "succeeded" : "failed";

          await params.db.queries.finalizeBackgroundJob({
            jobId: claimedJob.jobId,
            status: jobStatus,
            ...(consolidationPlanResult.accepted
              ? {}
              : { lastError: consolidationPlanResult.reason }),
            executionMetadata: {
              source: "memory_background_job_run_next",
              jobClass: claimedJob.jobClass,
              ...(input.runnerId ? { runnerId: input.runnerId } : {}),
              plannerStatus: consolidationPlanResult.status,
              ...(consolidationPlanResult.accepted
                ? {
                    plannerOutcome: consolidationPlanResult.outcome,
                    findingTypes: consolidationPlanResult.findings.map(
                      (finding) => finding.actionType,
                    ),
                    includeValidatedProcedures: consolidationPlanResult.includeValidatedProcedures,
                  }
                : {}),
            },
          });

          return {
            accepted: true,
            status: "executed",
            jobId: claimedJob.jobId,
            jobClass: claimedJob.jobClass,
            jobStatus,
            rationale: consolidationPlanResult.accepted
              ? ["bounded background job executed advisory consolidation planning only"]
              : [
                  "bounded background job execution failed while running advisory consolidation planning",
                ],
            consolidationPlanResult,
          };
        }

        const safeSelections = normalizeConsolidationExecuteSelections(claimedJob.approvedFindings);
        if (
          claimedJob.jobClass === "consolidation_execute" &&
          !hasOnlySafeConsolidationExecutionSelections(safeSelections)
        ) {
          const rationale = [
            "scheduled consolidation execution requires an explicit safe approved subset",
            "only duplicate_merge_review and stale_superseded_review may execute through this bounded scheduler slice",
          ];
          await params.db.queries.finalizeBackgroundJob({
            jobId: claimedJob.jobId,
            status: "failed",
            lastError: rationale.join(" "),
            executionMetadata: {
              source: "memory_background_job_run_next",
              jobClass: claimedJob.jobClass,
              ...(input.runnerId ? { runnerId: input.runnerId } : {}),
              status: "blocked",
            },
          });
          return {
            accepted: true,
            status: "blocked",
            jobId: claimedJob.jobId,
            jobClass: claimedJob.jobClass,
            jobStatus: "failed",
            rationale,
          };
        }

        if (claimedJob.jobClass === "consolidation_execute") {
          const approvedFindings = safeSelections!;
          const consolidationExecuteResult = await params.consolidationExecution.execute(
            buildConsolidationExecuteInput({
              ...claimedJob,
              approvedFindings,
            }),
          );
          const jobStatus = consolidationExecuteResult.accepted ? "succeeded" : "failed";

          await params.db.queries.finalizeBackgroundJob({
            jobId: claimedJob.jobId,
            status: jobStatus,
            ...(consolidationExecuteResult.accepted
              ? {}
              : { lastError: consolidationExecuteResult.reason }),
            executionMetadata: {
              source: "memory_background_job_run_next",
              jobClass: claimedJob.jobClass,
              ...(input.runnerId ? { runnerId: input.runnerId } : {}),
              executeStatus: consolidationExecuteResult.status,
              ...(consolidationExecuteResult.accepted
                ? {
                    executionMode: consolidationExecuteResult.executionMode,
                    actionTypes: consolidationExecuteResult.actions.map(
                      (action) => action.actionType,
                    ),
                  }
                : {}),
            },
          });

          return {
            accepted: true,
            status: "executed",
            jobId: claimedJob.jobId,
            jobClass: claimedJob.jobClass,
            jobStatus,
            rationale: consolidationExecuteResult.accepted
              ? [
                  "bounded background job routed only safe consolidation execution selections through the existing bounded seam",
                ]
              : [
                  "bounded background job execution failed while running bounded consolidation execution",
                ],
            consolidationExecuteResult,
          };
        }

        const proactiveExecuteResult = await params.proactiveExecution.execute(
          buildProactiveExecuteInput(claimedJob),
        );
        const jobStatus = proactiveExecuteResult.accepted ? "succeeded" : "failed";

        await params.db.queries.finalizeBackgroundJob({
          jobId: claimedJob.jobId,
          status: jobStatus,
          ...(proactiveExecuteResult.accepted ? {} : { lastError: proactiveExecuteResult.reason }),
          executionMetadata: {
            source: "memory_background_job_run_next",
            jobClass: claimedJob.jobClass,
            ...(input.runnerId ? { runnerId: input.runnerId } : {}),
            executeStatus: proactiveExecuteResult.status,
            ...(proactiveExecuteResult.accepted
              ? { affectedIds: proactiveExecuteResult.affectedIds }
              : { actionType: proactiveExecuteResult.actionType }),
          },
        });

        return {
          accepted: true,
          status: "executed",
          jobId: claimedJob.jobId,
          jobClass: claimedJob.jobClass,
          jobStatus,
          rationale: proactiveExecuteResult.accepted
            ? [
                "bounded background job routed proactive drift-check execution through the existing bounded seam",
              ]
            : [
                "bounded background job execution failed while running proactive drift-check execution",
              ],
          proactiveExecuteResult,
        };
      } catch (error) {
        const reason =
          error instanceof Error ? error.message : "background job execution failed unexpectedly";
        await params.db.queries.finalizeBackgroundJob({
          jobId: claimedJob.jobId,
          status: "failed",
          lastError: reason,
          executionMetadata: {
            source: "memory_background_job_run_next",
            jobClass: claimedJob.jobClass,
            ...(input.runnerId ? { runnerId: input.runnerId } : {}),
            status: "failed",
          },
        });

        return {
          accepted: false,
          status: "failed",
          reason,
        };
      }
    },
  };
}
