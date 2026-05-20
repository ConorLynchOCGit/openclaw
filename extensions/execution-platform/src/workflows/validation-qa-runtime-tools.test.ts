import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { RuntimeToolKernel } from "../runtime-tool-call/runtime-tool-kernel.ts";
import { RuntimeToolRegistry } from "../runtime-tool-call/runtime-tool-registry.ts";
import { RuntimeToolTraceRepository } from "../runtime-tool-call/runtime-tool-trace-repository.ts";
import { RuntimeWorkGraphRepository } from "./runtime-work-graph-repository.ts";
import {
  assertValidationQaEvidencePacketCanClose,
  buildValidationQaEvidencePacket,
  buildValidationTaskPacket,
  invokeValidationQaRuntimeTool,
  registerValidationQaRuntimeTools,
  validateValidationTaskPacket,
  validationCommandRefFor,
} from "./validation-qa-runtime-tools.ts";

async function withValidationQaKernel<T>(
  work: (input: { kernel: RuntimeToolKernel; registry: RuntimeToolRegistry }) => Promise<T>,
): Promise<T> {
  const database = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const registry = new RuntimeToolRegistry();
    registerValidationQaRuntimeTools({ registry });
    const traces = new RuntimeToolTraceRepository(database.sql);
    const runtimeJobs = new RuntimeJobRepository(database.sql, { claimStrategy: "basic" });
    await runtimeJobs.enqueueJob({
      jobId: "job-validation",
      jobType: "executor.agent_team",
      payload: { workflowId: "agent_team.coding" },
    });
    const graphs = new RuntimeWorkGraphRepository(database.sql);
    await graphs.createGraph({
      graphId: "graph-validation",
      parentWorkItemId: null,
      rootRuntimeJobId: "job-validation",
      workflowId: "agent_team.coding",
      orchestratorModelRef: "model://test",
      graphStatus: "running",
    });
    await graphs.addNode({
      nodeId: "node-validation",
      graphId: "graph-validation",
      nodeKind: "validation",
      assignedRole: "test_engineer",
      runtimeJobId: "job-validation",
      nodeStatus: "running",
    });
    const kernel = new RuntimeToolKernel({ registry, traces });
    return await work({ kernel, registry });
  } finally {
    await database.close();
  }
}

describe("validation/QA runtime tools", () => {
  it("registers validation and QA tools as first-class runtime tools", async () => {
    await withValidationQaKernel(async ({ registry }) => {
      expect(registry.require("validation.plan").definition.toolFamily).toBe("validation.plan");
      expect(registry.require("validation.select_commands").definition.toolFamily).toBe(
        "validation.plan",
      );
      expect(registry.require("validation.run_command").definition.toolFamily).toBe(
        "validation.run",
      );
      expect(registry.require("qa.review_evidence_sufficiency").definition.toolFamily).toBe(
        "qa.review",
      );
    });
  });

  it("rejects validation command execution without an approved command ref", async () => {
    await withValidationQaKernel(async ({ kernel }) => {
      const result = await invokeValidationQaRuntimeTool({
        kernel,
        toolId: "validation.run_command",
        runtimeJobId: "job-validation",
        graphId: "graph-validation",
        nodeId: "node-validation",
        idempotencyKey: "missing-approved-ref",
        inputSummary: "Run validation without approved command ref.",
        metadata: {
          commandRef: "pnpm test:file path/to/test.ts",
          rawCommandLogsStored: false,
        },
      });

      expect(result.status).toBe("needs_review");
      expect(result.reasonCodes).toContain("validation_run_command_approved_command_ref_missing");
      expect(result.rawCommandLogStored).toBe(false);
    });
  });

  it("rejects validation command execution without the runtime-owned command definition", async () => {
    await withValidationQaKernel(async ({ kernel }) => {
      const result = await invokeValidationQaRuntimeTool({
        kernel,
        toolId: "validation.run_command",
        runtimeJobId: "job-validation",
        graphId: "graph-validation",
        nodeId: "node-validation",
        idempotencyKey: "missing-approved-definition",
        inputSummary: "Run validation without approved command definition.",
        metadata: {
          approvedCommandRef: validationCommandRefFor(
            "pnpm test:file extensions/execution-platform/src/workflows/example.test.ts",
          ),
          rawCommandLogsStored: false,
        },
      });

      expect(result.status).toBe("needs_review");
      expect(result.reasonCodes).toContain("validation_run_command_definition_missing");
      expect(result.rawCommandLogStored).toBe(false);
    });
  });

  it("accepts bounded validation evidence packets only with commitment and tool refs", () => {
    const packet = buildValidationQaEvidencePacket({
      packetRef: "runtime-job://job/validation-qa/node",
      runtimeJobId: "job",
      graphId: "graph",
      nodeId: "node",
      commitmentIds: ["commitment-1"],
      validationEvidenceRefs: ["runtime-job://job/validation/result"],
      validationToolInvocationRefs: ["runtime-tool://validation/run"],
      qaReviewRefs: ["runtime-tool://qa/review"],
      status: "accepted",
    });

    expect(() => assertValidationQaEvidencePacketCanClose(packet)).not.toThrow();
    expect(packet.rawCommandLogsStored).toBe(false);

    expect(() =>
      assertValidationQaEvidencePacketCanClose({
        ...packet,
        validationToolInvocationRefs: [],
      }),
    ).toThrow("validation_qa_packet_tool_refs_missing");
  });

  it("builds validation task packets from runtime-owned approved command refs", () => {
    const packet = buildValidationTaskPacket({
      runtimeJobId: "job-validation",
      graphId: "graph-validation",
      nodeId: "node-validation",
      targetCommitmentIds: ["commitment-1"],
      exactValidationObjective: "Run focused validation for the changed workflow files.",
      validationCommandRefs: [
        "pnpm test:file extensions/execution-platform/src/workflows/example.test.ts",
      ],
      targetFileRefs: ["repo://extensions/execution-platform/src/workflows/example.ts"],
    });

    expect(packet.approvedValidationCommandRefs).toEqual([
      validationCommandRefFor(
        "pnpm test:file extensions/execution-platform/src/workflows/example.test.ts",
      ),
    ]);
    expect(packet.approvedValidationCommands[0]).toMatchObject({
      commandKind: "pnpm_test_file",
      executable: "pnpm",
      args: ["test:file", "extensions/execution-platform/src/workflows/example.test.ts"],
      rawCommandLogStored: false,
      rawStdoutStored: false,
      rawStderrStored: false,
    });
    expect(packet.commandSummaries[0]).toContain("Run focused test files");
    expect(packet.rawCommandLogStored).toBe(false);
    expect(validateValidationTaskPacket(packet)).toMatchObject({
      valid: true,
      status: "ready",
      reasonCodes: [],
    });
  });

  it("does not turn arbitrary shell strings into approved validation commands", () => {
    const packet = buildValidationTaskPacket({
      runtimeJobId: "job-validation",
      graphId: "graph-validation",
      nodeId: "node-validation",
      targetCommitmentIds: ["commitment-1"],
      exactValidationObjective: "Run focused validation.",
      validationCommandRefs: ["pnpm test:file example.test.ts && rm -rf /"],
    });

    expect(packet.approvedValidationCommandRefs).toEqual([]);
    expect(packet.approvedValidationCommands).toEqual([]);
    expect(validateValidationTaskPacket(packet)).toMatchObject({
      valid: false,
      reasonCodes: expect.arrayContaining([
        "validation_task_packet_command_refs_missing",
        "validation_task_packet_command_definitions_missing",
      ]),
    });
  });

  it("rejects validation task packets without approved commands or commitments", () => {
    const packet = buildValidationTaskPacket({
      runtimeJobId: "job-validation",
      graphId: "graph-validation",
      nodeId: "node-validation",
      targetCommitmentIds: [],
      exactValidationObjective: "",
      validationCommandRefs: [],
    });

    expect(validateValidationTaskPacket(packet)).toMatchObject({
      valid: false,
      status: "needs_review",
      reasonCodes: expect.arrayContaining([
        "validation_task_packet_objective_missing",
        "validation_task_packet_commitment_ids_missing",
        "validation_task_packet_command_refs_missing",
      ]),
    });
  });

  it("records repair handoff refs on failed validation evidence packets", () => {
    const packet = buildValidationQaEvidencePacket({
      packetRef: "runtime-job://job/validation-qa/node",
      runtimeJobId: "job",
      graphId: "graph",
      nodeId: "node",
      commitmentIds: ["commitment-1"],
      validationTaskPacketRef: "runtime-work-graph://validation-task-packet/packet",
      validationEvidenceRefs: ["runtime-job://job/validation/failure"],
      validationToolInvocationRefs: ["runtime-tool://validation/run"],
      failureClassificationRefs: ["runtime-tool://validation/classify"],
      failureCommitmentMapRefs: ["runtime-tool://validation/map"],
      repairPlanRefs: ["runtime-tool://validation/repair-plan"],
      repairNodeRefs: ["runtime-work-graph://graph/node/repair"],
      repairHandoffRefs: ["runtime-job://job/runtime-work-graph/validation-repair-handoff/repair"],
      status: "needs_review",
    });

    expect(packet.validationTaskPacketRef).toBe(
      "runtime-work-graph://validation-task-packet/packet",
    );
    expect(packet.repairNodeRefs).toEqual(["runtime-work-graph://graph/node/repair"]);
    expect(() => assertValidationQaEvidencePacketCanClose(packet)).toThrow(
      "validation_qa_packet_not_accepted",
    );
  });
});
