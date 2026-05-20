import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { RuntimeToolKernel } from "../runtime-tool-call/runtime-tool-kernel.ts";
import { RuntimeToolRegistry } from "../runtime-tool-call/runtime-tool-registry.ts";
import { RuntimeToolTraceRepository } from "../runtime-tool-call/runtime-tool-trace-repository.ts";
import {
  buildCloseoutEvidencePacket,
  closeoutFinalizationMissingReasonCodes,
  registerCloseoutFinalizationRuntimeTools,
} from "./closeout-finalization-runtime-tools.ts";

async function withKernel<T>(
  work: (
    kernel: RuntimeToolKernel,
    traces: RuntimeToolTraceRepository,
    runtimeJobs: RuntimeJobRepository,
  ) => Promise<T>,
): Promise<T> {
  const database = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const registry = new RuntimeToolRegistry();
    registerCloseoutFinalizationRuntimeTools({ registry });
    const runtimeJobs = new RuntimeJobRepository(database.sql, { claimStrategy: "basic" });
    const traces = new RuntimeToolTraceRepository(database.sql);
    const kernel = new RuntimeToolKernel({ registry, traces });
    return await work(kernel, traces, runtimeJobs);
  } finally {
    await database.close();
  }
}

describe("closeout finalization runtime tools", () => {
  it("accepts only a complete bounded evidence packet", async () => {
    await withKernel(async (kernel, traces, runtimeJobs) => {
      await runtimeJobs.enqueueJob({
        jobId: "runtime-job-closeout-finalization-accepted",
        jobType: "executor.agent_team",
        queueName: "agent-team",
        payload: {},
        idempotencyScope: "closeout-finalization-test",
        idempotencyKey: "accepted-runtime-job",
      });
      const packet = buildCloseoutEvidencePacket({
        packetRef: "runtime-job://runtime-job-closeout-finalization-accepted/finalization/packet",
        runtimeJobId: "runtime-job-closeout-finalization-accepted",
        workflowId: "agent_team.coding",
        graphId: "graph-closeout-finalization-accepted",
        nodeIds: ["node-implementation", "node-validation", "node-review", "node-closeout"],
        missionLedgerRefs: ["runtime-job://runtime-job-closeout-finalization-accepted/ledger"],
        acceptedCommitmentIds: ["commitment-1"],
        openCommitmentIds: [],
        workflowEvidenceProfileRef:
          "runtime-job://runtime-job-closeout-finalization-accepted/profile",
        workflowEvidenceProfileAccepted: true,
        validationRequired: true,
        validationQaEvidencePacketRefs: [
          "runtime-job://runtime-job-closeout-finalization-accepted/validation/packet",
        ],
        runtimeExecutionSpanRefs: [
          "runtime-job://runtime-job-closeout-finalization-accepted/execution-span/model-call",
        ],
        runtimeToolInvocationRefs: ["runtime-tool://scheduler/decision"],
        workerToolTraceRefs: ["runtime-tool://worker/implementation"],
        sourceChangeRefs: ["repo://extensions/execution-platform/src/example.ts"],
        reviewRefs: ["runtime-job://runtime-job-closeout-finalization-accepted/review"],
        workQueueReadbackRefs: ["work-queue://closeout-finalization-test/readback"],
        closeoutCapsuleRef:
          "runtime-job://runtime-job-closeout-finalization-accepted/closeout-capsule/model",
        closeoutSource: "model",
        closeoutTaskSuccess: "satisfied",
        completionReviewRef:
          "runtime-job://runtime-job-closeout-finalization-accepted/completion-review",
        completionReviewAccepted: true,
      });

      const result = await kernel.invoke({
        toolId: "closeout.accept_finalization",
        runtimeJobId: "runtime-job-closeout-finalization-accepted",
        idempotencyScope: "closeout-finalization-test",
        idempotencyKey: "accepted",
        inputSummary: "Accept complete closeout finalization evidence.",
        metadata: { evidencePacket: packet },
        rawPromptStored: false,
        rawResponseStored: false,
        rawTranscriptStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawCommandLogStored: false,
        rawDbRowsStored: false,
        secretsStored: false,
        workQueueLifecycleMutated: false,
      });

      expect(result.invocation.status).toBe("succeeded");
      expect(result.reasonCodes).toContain("closeout_finalization_accepted");
      expect(closeoutFinalizationMissingReasonCodes(packet)).toEqual([]);
      const summary = await traces.summarize({
        runtimeJobId: "runtime-job-closeout-finalization-accepted",
        limit: 10,
      });
      expect(summary.latestToolId).toBe("closeout.accept_finalization");
      expect(summary.invocationRefs).toContain(result.invocationRef);
    });
  });

  it("rejects degraded closeout and missing evidence as needs_review", async () => {
    await withKernel(async (kernel, _traces, runtimeJobs) => {
      await runtimeJobs.enqueueJob({
        jobId: "runtime-job-closeout-finalization-rejected",
        jobType: "executor.agent_team",
        queueName: "agent-team",
        payload: {},
        idempotencyScope: "closeout-finalization-test",
        idempotencyKey: "rejected-runtime-job",
      });
      const packet = buildCloseoutEvidencePacket({
        packetRef: "runtime-job://runtime-job-closeout-finalization-rejected/finalization/packet",
        runtimeJobId: "runtime-job-closeout-finalization-rejected",
        workflowId: "agent_team.coding",
        graphId: "graph-closeout-finalization-rejected",
        closeoutSource: "degraded_system_fallback",
        closeoutTaskSuccess: "unknown",
        completionReviewAccepted: false,
      });

      const result = await kernel.invoke({
        toolId: "closeout.accept_finalization",
        runtimeJobId: "runtime-job-closeout-finalization-rejected",
        idempotencyScope: "closeout-finalization-test",
        idempotencyKey: "rejected",
        inputSummary: "Reject incomplete closeout finalization evidence.",
        metadata: { evidencePacket: packet },
        rawPromptStored: false,
        rawResponseStored: false,
        rawTranscriptStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawCommandLogStored: false,
        rawDbRowsStored: false,
        secretsStored: false,
        workQueueLifecycleMutated: false,
      });

      expect(result.invocation.status).toBe("needs_review");
      expect(result.reasonCodes).toEqual(
        expect.arrayContaining([
          "closeout_finalization_not_accepted",
          "closeout_finalization_mission_ledger_missing",
          "closeout_finalization_runtime_execution_span_refs_missing",
          "closeout_finalization_model_authored_closeout_missing",
          "closeout_finalization_completion_review_missing_or_rejected",
        ]),
      );
    });
  });

  it("rejects raw-storage flags", () => {
    const packet = {
      ...buildCloseoutEvidencePacket({
        packetRef: "runtime-job://runtime-job-closeout-finalization-raw/finalization/packet",
        runtimeJobId: "runtime-job-closeout-finalization-raw",
        workflowId: "agent_team.coding",
        graphId: "graph-closeout-finalization-raw",
        missionLedgerRefs: ["runtime-job://raw/ledger"],
        workflowEvidenceProfileRef: "runtime-job://raw/profile",
        workflowEvidenceProfileAccepted: true,
        runtimeExecutionSpanRefs: ["runtime-job://raw/execution-span/model-call"],
        runtimeToolInvocationRefs: ["runtime-tool://scheduler/decision"],
        workQueueReadbackRefs: ["work-queue://raw/readback"],
        closeoutCapsuleRef: "runtime-job://raw/closeout",
        closeoutSource: "model",
        closeoutTaskSuccess: "satisfied",
        completionReviewRef: "runtime-job://raw/review",
        completionReviewAccepted: true,
      }),
      rawPromptStored: true,
    };

    expect(closeoutFinalizationMissingReasonCodes(packet as never)).toContain(
      "closeout_finalization_raw_storage_rejected",
    );
  });
});
