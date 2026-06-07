import { createHash } from "node:crypto";
import type { RuntimeWorkGraphRepository } from "../workflows/runtime-work-graph-repository.ts";
import { graphRef } from "../workflows/runtime-work-graph.ts";

export type DynamicValidationRunner = {
  run(commandRef: string): Promise<{
    validationRef: string;
    status: "passed" | "failed" | "not_run";
    summary: string;
  }>;
};

export type DynamicTestEngineer = {
  diagnose(input: {
    graphId: string;
    failedValidationRefs: string[];
    failedValidationSummaries: string[];
    changedFileRefs: string[];
    maxOutputTokens: number;
  }): Promise<{
    modelRunRef: string;
    responseHash: string;
    latencyMs: number;
    recommendation:
      | "repair"
      | "context_scout"
      | "escalate"
      | "human_task"
      | "needs_review"
      | "no_op_repair";
    reasonCodes: string[];
    artifactRefs: string[];
    rawPromptStored: false;
    rawResponseStored: false;
  }>;
};

export type DynamicRepairWorker = {
  repair(input: {
    graphId: string;
    repairNodeId: string;
    failedValidationRefs: string[];
    failedValidationSummaries: string[];
    changedFileRefs: string[];
    reasonCodes: string[];
  }): Promise<{
    status: "completed" | "needs_review" | "failed";
    changedFileRefs: string[];
    artifactRefs: string[];
    modelRunRef: string;
    responseHash: string;
    latencyMs: number;
    reasonCodes: string[];
    rawPromptStored: false;
    rawResponseStored: false;
  }>;
};

export type DynamicTestRepairLoopResult = {
  artifactKind: "dynamic_test_repair_loop_result";
  graphId: string;
  validationNodeIds: string[];
  testReviewNodeIds: string[];
  repairNodeIds: string[];
  validationRefs: string[];
  repairAttemptCount: number;
  finalState: "passed" | "needs_review";
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  workQueueLifecycleMutated: false;
};

class DynamicTestRepairTimeoutError extends Error {
  constructor(readonly reasonCode: string) {
    super(reasonCode);
    this.name = "DynamicTestRepairTimeoutError";
  }
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isDynamicTestRepairTimeout(error: unknown): error is DynamicTestRepairTimeoutError {
  return error instanceof DynamicTestRepairTimeoutError;
}

function withOperationTimeout<T>(input: {
  promise: Promise<T>;
  timeoutMs: number;
  reasonCode: string;
}): Promise<T> {
  let timeout: NodeJS.Timeout | null = null;
  return Promise.race([
    input.promise,
    new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(
        () => reject(new DynamicTestRepairTimeoutError(input.reasonCode)),
        input.timeoutMs,
      );
    }),
  ]).finally(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
  });
}

export class DynamicTestRepairLoop {
  constructor(
    private readonly options: {
      graphs: RuntimeWorkGraphRepository;
      validationRunner: DynamicValidationRunner;
      testEngineer: DynamicTestEngineer;
      repairWorker?: DynamicRepairWorker;
      maxRepairAttempts?: number;
      operationTimeoutMs?: number;
      validationOperationTimeoutMs?: number;
      testEngineerOperationTimeoutMs?: number;
      repairOperationTimeoutMs?: number;
      reviewPassedValidations?: boolean;
    },
  ) {}

  async run(input: {
    graphId: string;
    implementationNodeId: string;
    changedFileRefs: string[];
    validationCommandRefs: string[];
  }): Promise<DynamicTestRepairLoopResult> {
    const maxRepairAttempts = this.options.maxRepairAttempts ?? 2;
    const operationTimeoutMs = this.options.operationTimeoutMs ?? 180_000;
    const validationOperationTimeoutMs =
      this.options.validationOperationTimeoutMs ?? operationTimeoutMs;
    const testEngineerOperationTimeoutMs =
      this.options.testEngineerOperationTimeoutMs ?? operationTimeoutMs;
    const repairOperationTimeoutMs = this.options.repairOperationTimeoutMs ?? operationTimeoutMs;
    const validationNodeIds: string[] = [];
    const testReviewNodeIds: string[] = [];
    const repairNodeIds: string[] = [];
    const validationRefs: string[] = [];
    let repairAttemptCount = 0;
    let currentReasonCodes: string[] = [];
    let currentChangedFileRefs = input.changedFileRefs;
    const failedValidationSummariesByRef = new Map<string, string>();
    const unresolvedValidationFailures: string[] = [];

    let commandIndex = 0;
    while (commandIndex < input.validationCommandRefs.slice(0, 6).length) {
      const commandRef = input.validationCommandRefs.slice(0, 6)[commandIndex]!;
      const validationNode = await this.options.graphs.addNode({
        graphId: input.graphId,
        nodeKind: "validation",
        assignedRole: "test_engineer",
        modelOrWorkerRef: "script-middleware/validation",
        nodeStatus: "running",
        inputHandoffRefs: [graphRef("node", input.implementationNodeId)],
        metadata: {
          commandRefHash: hash(commandRef),
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
      validationNodeIds.push(validationNode.nodeId);
      await this.options.graphs.recordCheckpoint({
        graphId: input.graphId,
        checkpointKind: "validation_started",
        stateSummary: "Validation command started through dynamic test/repair loop.",
        artifactRefs: [graphRef("node", validationNode.nodeId)],
      });
      let validation: Awaited<ReturnType<DynamicValidationRunner["run"]>>;
      try {
        validation = await withOperationTimeout({
          promise: this.options.validationRunner.run(commandRef),
          timeoutMs: validationOperationTimeoutMs,
          reasonCode: "validation_operation_timeout",
        });
      } catch (error) {
        const reasonCode = isDynamicTestRepairTimeout(error)
          ? error.reasonCode
          : "validation_operation_failed";
        validation = {
          validationRef: `validation://${hash(commandRef).slice(0, 16)}/${reasonCode}`,
          status: "failed",
          summary: reasonCode,
        };
        currentReasonCodes.push(reasonCode);
      }
      validationRefs.push(validation.validationRef);
      if (validation.status !== "passed") {
        failedValidationSummariesByRef.set(validation.validationRef, validation.summary);
      }
      await this.options.graphs.updateNodeStatus({
        nodeId: validationNode.nodeId,
        nodeStatus: validation.status === "passed" ? "succeeded" : "failed",
        outputArtifactRefs: [validation.validationRef],
      });
      await this.options.graphs.recordCheckpoint({
        graphId: input.graphId,
        checkpointKind: "validation_completed",
        stateSummary: `Validation command completed with status ${validation.status}.`,
        artifactRefs: [validation.validationRef],
      });
      if (validation.status === "passed") {
        if (this.options.reviewPassedValidations) {
          const testReview = await this.options.graphs.addNode({
            graphId: input.graphId,
            nodeKind: "test_review",
            assignedRole: "test_engineer",
            modelOrWorkerRef: "policy://runtime-work-graph/test-engineer",
            nodeStatus: "running",
            inputHandoffRefs: [validation.validationRef],
            metadata: {
              reviewKind: "passed_validation_review",
              rawPromptStored: false,
              rawResponseStored: false,
            },
          });
          testReviewNodeIds.push(testReview.nodeId);
          await this.options.graphs.recordCheckpoint({
            graphId: input.graphId,
            checkpointKind: "test_engineer_passed_validation_review_started",
            stateSummary: "Test engineer review started from bounded passing validation evidence.",
            artifactRefs: [validation.validationRef, graphRef("node", testReview.nodeId)],
          });
          try {
            const diagnosis = await withOperationTimeout({
              promise: this.options.testEngineer.diagnose({
                graphId: input.graphId,
                failedValidationRefs: [],
                failedValidationSummaries: [
                  `Validation passed; review for coverage gaps and recommend no_op_repair unless a real issue remains: ${validation.summary}`,
                ],
                changedFileRefs: currentChangedFileRefs,
                maxOutputTokens: 2_000,
              }),
              timeoutMs: testEngineerOperationTimeoutMs,
              reasonCode: "test_engineer_passed_validation_review_timeout",
            });
            await this.options.graphs.recordRoleInvocation({
              graphId: input.graphId,
              nodeId: testReview.nodeId,
              roleId: "test_engineer",
              modelRef: "policy://runtime-work-graph/test-engineer",
              providerPath: "model-task-middleware",
              transportKind: "model_task",
              modelRunRef: diagnosis.modelRunRef,
              outputHash: diagnosis.responseHash,
              latencyMs: diagnosis.latencyMs,
              artifactRefs:
                diagnosis.artifactRefs.length > 0
                  ? diagnosis.artifactRefs
                  : [validation.validationRef],
            });
            await this.options.graphs.updateNodeStatus({
              nodeId: testReview.nodeId,
              nodeStatus:
                diagnosis.recommendation === "repair" ||
                diagnosis.recommendation === "context_scout" ||
                diagnosis.recommendation === "escalate" ||
                diagnosis.recommendation === "human_task" ||
                diagnosis.recommendation === "needs_review"
                  ? "needs_review"
                  : "succeeded",
              outputArtifactRefs:
                diagnosis.artifactRefs.length > 0
                  ? diagnosis.artifactRefs
                  : [validation.validationRef],
            });
            await this.options.graphs.recordCheckpoint({
              graphId: input.graphId,
              checkpointKind: "test_engineer_passed_validation_review_completed",
              stateSummary: `Test engineer reviewed passing validation and recommended ${diagnosis.recommendation}.`,
              artifactRefs:
                diagnosis.artifactRefs.length > 0
                  ? diagnosis.artifactRefs
                  : [validation.validationRef],
            });
            if (
              diagnosis.recommendation === "repair" ||
              diagnosis.recommendation === "context_scout" ||
              diagnosis.recommendation === "escalate" ||
              diagnosis.recommendation === "human_task" ||
              diagnosis.recommendation === "needs_review"
            ) {
              currentReasonCodes.push(
                `passed_validation_review_requires_attention:${diagnosis.recommendation}`,
              );
              unresolvedValidationFailures.push(
                `passed_validation_review_not_clean:${hash(validation.validationRef).slice(0, 16)}`,
              );
              break;
            }
          } catch (error) {
            const reasonCode = isDynamicTestRepairTimeout(error)
              ? error.reasonCode
              : "test_engineer_passed_validation_review_failed";
            await this.options.graphs.updateNodeStatus({
              nodeId: testReview.nodeId,
              nodeStatus: "needs_review",
              outputArtifactRefs: [validation.validationRef],
            });
            currentReasonCodes.push(`${reasonCode}_non_blocking_after_passed_validation`);
            await this.options.graphs.recordCheckpoint({
              graphId: input.graphId,
              checkpointKind: "test_engineer_passed_validation_review_unavailable",
              stateSummary:
                "Test engineer review of already-passed validation was unavailable; deterministic validation evidence remains accepted.",
              artifactRefs: [validation.validationRef, graphRef("node", testReview.nodeId)],
            });
          }
        }
        commandIndex += 1;
        continue;
      }

      await this.options.graphs.addEdge({
        graphId: input.graphId,
        fromNodeId: input.implementationNodeId,
        toNodeId: validationNode.nodeId,
        edgeKind: "validation_failed",
        reasonCodes: ["validation_failed"],
        artifactRefs: [validation.validationRef],
      });
      const testReview = await this.options.graphs.addNode({
        graphId: input.graphId,
        nodeKind: "test_review",
        assignedRole: "test_engineer",
        modelOrWorkerRef: "policy://runtime-work-graph/test-engineer",
        nodeStatus: "running",
        inputHandoffRefs: [validation.validationRef],
      });
      testReviewNodeIds.push(testReview.nodeId);
      await this.options.graphs.recordCheckpoint({
        graphId: input.graphId,
        checkpointKind: "test_engineer_diagnosis_started",
        stateSummary: "Test engineer diagnosis started from bounded validation evidence.",
        artifactRefs: [validation.validationRef, graphRef("node", testReview.nodeId)],
      });
      let diagnosis: Awaited<ReturnType<DynamicTestEngineer["diagnose"]>>;
      try {
        diagnosis = await withOperationTimeout({
          promise: this.options.testEngineer.diagnose({
            graphId: input.graphId,
            failedValidationRefs: [validation.validationRef],
            failedValidationSummaries: [validation.summary],
            changedFileRefs: currentChangedFileRefs,
            maxOutputTokens: 2_000,
          }),
          timeoutMs: testEngineerOperationTimeoutMs,
          reasonCode: "test_engineer_diagnosis_timeout",
        });
      } catch (error) {
        const reasonCode = isDynamicTestRepairTimeout(error)
          ? error.reasonCode
          : "test_engineer_diagnosis_failed";
        await this.options.graphs.updateNodeStatus({
          nodeId: testReview.nodeId,
          nodeStatus: "needs_review",
          outputArtifactRefs: [validation.validationRef],
        });
        currentReasonCodes.push(reasonCode);
        unresolvedValidationFailures.push(
          `validation_failed_unrepaired:${hash(validation.validationRef).slice(0, 16)}`,
        );
        break;
      }
      await this.options.graphs.recordRoleInvocation({
        graphId: input.graphId,
        nodeId: testReview.nodeId,
        roleId: "test_engineer",
        modelRef: "policy://runtime-work-graph/test-engineer",
        providerPath: "model-task-middleware",
        transportKind: "model_task",
        modelRunRef: diagnosis.modelRunRef,
        outputHash: diagnosis.responseHash,
        latencyMs: diagnosis.latencyMs,
        artifactRefs: diagnosis.artifactRefs,
      });
      await this.options.graphs.updateNodeStatus({
        nodeId: testReview.nodeId,
        nodeStatus: "succeeded",
        outputArtifactRefs: diagnosis.artifactRefs,
      });
      await this.options.graphs.recordCheckpoint({
        graphId: input.graphId,
        checkpointKind: "test_engineer_diagnosis_completed",
        stateSummary: `Test engineer recommended ${diagnosis.recommendation}.`,
        artifactRefs: diagnosis.artifactRefs,
      });
      currentReasonCodes = diagnosis.reasonCodes;
      if (diagnosis.recommendation === "repair") {
        if (repairAttemptCount >= maxRepairAttempts) {
          currentReasonCodes.push("repair_budget_exhausted");
          unresolvedValidationFailures.push(
            `validation_failed_unrepaired:${hash(validation.validationRef).slice(0, 16)}`,
          );
          break;
        }
        repairAttemptCount += 1;
        const repairNode = await this.options.graphs.addNode({
          graphId: input.graphId,
          nodeKind: "repair",
          assignedRole: "implementation_engineer",
          modelOrWorkerRef: "policy://runtime-work-graph/implementation",
          nodeStatus: "planned",
          inputHandoffRefs: [validation.validationRef, graphRef("node", testReview.nodeId)],
          metadata: { repairAttemptCount, recommendation: diagnosis.recommendation },
        });
        repairNodeIds.push(repairNode.nodeId);
        await this.options.graphs.addEdge({
          graphId: input.graphId,
          fromNodeId: testReview.nodeId,
          toNodeId: repairNode.nodeId,
          edgeKind: "repair_requested",
          reasonCodes: diagnosis.reasonCodes,
          artifactRefs: diagnosis.artifactRefs,
        });
        if (!this.options.repairWorker) {
          await this.options.graphs.updateNodeStatus({
            nodeId: repairNode.nodeId,
            nodeStatus: "needs_review",
            outputArtifactRefs: diagnosis.artifactRefs,
          });
          currentReasonCodes.push("repair_worker_not_configured");
          unresolvedValidationFailures.push(
            `validation_failed_unrepaired:${hash(validation.validationRef).slice(0, 16)}`,
          );
          break;
        }
        await this.options.graphs.updateNodeStatus({
          nodeId: repairNode.nodeId,
          nodeStatus: "running",
        });
        await this.options.graphs.recordCheckpoint({
          graphId: input.graphId,
          checkpointKind: "implementation_repair_started",
          stateSummary: "Implementation repair started from test engineer diagnosis.",
          artifactRefs: [validation.validationRef, graphRef("node", repairNode.nodeId)],
        });
        let repair: Awaited<ReturnType<DynamicRepairWorker["repair"]>>;
        try {
          repair = await withOperationTimeout({
            promise: this.options.repairWorker.repair({
              graphId: input.graphId,
              repairNodeId: repairNode.nodeId,
              failedValidationRefs: [validation.validationRef],
              failedValidationSummaries: [
                failedValidationSummariesByRef.get(validation.validationRef) ?? validation.summary,
              ],
              changedFileRefs: currentChangedFileRefs,
              reasonCodes: diagnosis.reasonCodes,
            }),
            timeoutMs: repairOperationTimeoutMs,
            reasonCode: "implementation_repair_timeout",
          });
        } catch (error) {
          const reasonCode = isDynamicTestRepairTimeout(error)
            ? error.reasonCode
            : "implementation_repair_failed";
          await this.options.graphs.updateNodeStatus({
            nodeId: repairNode.nodeId,
            nodeStatus: "needs_review",
            outputArtifactRefs: [validation.validationRef],
          });
          currentReasonCodes.push(reasonCode);
          unresolvedValidationFailures.push(
            `validation_failed_unrepaired:${hash(validation.validationRef).slice(0, 16)}`,
          );
          break;
        }
        currentChangedFileRefs =
          repair.changedFileRefs.length > 0 ? repair.changedFileRefs : currentChangedFileRefs;
        await this.options.graphs.recordRoleInvocation({
          graphId: input.graphId,
          nodeId: repairNode.nodeId,
          roleId: "implementation_engineer",
          modelRef: "policy://runtime-work-graph/implementation-repair",
          providerPath: "runtime-worker",
          transportKind: "repair_worker",
          modelRunRef: repair.modelRunRef,
          outputHash: repair.responseHash,
          latencyMs: repair.latencyMs,
          artifactRefs: repair.artifactRefs,
        });
        await this.options.graphs.updateNodeStatus({
          nodeId: repairNode.nodeId,
          nodeStatus:
            repair.status === "completed"
              ? "succeeded"
              : repair.status === "needs_review"
                ? "needs_review"
                : "failed",
          outputArtifactRefs: repair.artifactRefs,
        });
        await this.options.graphs.recordCheckpoint({
          graphId: input.graphId,
          checkpointKind: "implementation_repair_completed",
          stateSummary: `Implementation repair completed with status ${repair.status}.`,
          artifactRefs: repair.artifactRefs,
        });
        currentReasonCodes = [...currentReasonCodes, ...repair.reasonCodes];
        if (repair.status !== "completed") {
          unresolvedValidationFailures.push(
            `validation_failed_unrepaired:${hash(validation.validationRef).slice(0, 16)}`,
          );
          break;
        }
        // Re-run the failed command after repair before advancing to later validations.
        continue;
      }
      currentReasonCodes.push(
        `validation_failed_unrepaired:${hash(validation.validationRef).slice(0, 16)}`,
        `test_engineer_recommendation:${diagnosis.recommendation}`,
      );
      unresolvedValidationFailures.push(
        `validation_failed_unrepaired:${hash(validation.validationRef).slice(0, 16)}`,
      );
      break;
    }

    const failed =
      unresolvedValidationFailures.length > 0 ||
      currentReasonCodes.includes("repair_budget_exhausted") ||
      currentReasonCodes.includes("repair_worker_not_configured");
    return {
      artifactKind: "dynamic_test_repair_loop_result",
      graphId: input.graphId,
      validationNodeIds,
      testReviewNodeIds,
      repairNodeIds,
      validationRefs,
      repairAttemptCount,
      finalState: failed ? "needs_review" : "passed",
      reasonCodes: failed
        ? [...new Set([...currentReasonCodes, ...unresolvedValidationFailures])]
        : ["dynamic_validation_loop_completed"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutated: false,
    };
  }
}
