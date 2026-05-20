import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { RuntimeToolKernel } from "../runtime-tool-call/runtime-tool-kernel.ts";
import { RuntimeToolRegistry } from "../runtime-tool-call/runtime-tool-registry.ts";
import { RuntimeToolTraceRepository } from "../runtime-tool-call/runtime-tool-trace-repository.ts";
import { parseCloseoutCapsule } from "./closeout-capsule.ts";
import {
  closeoutGenerateMetadataFromResult,
  registerCloseoutGenerateRuntimeTool,
} from "./closeout-generate-runtime-tool.ts";
import {
  createDegradedSystemCloseoutCapsule,
  ModelCloseoutCapsuleReporter,
  type CloseoutCapsuleReporterInput,
} from "./model-closeout-capsule-reporter.ts";

function closeoutInput(): CloseoutCapsuleReporterInput {
  return {
    factualRefs: {
      runtimeJobId: "runtime-job-closeout-tool-test",
      teamRunId: "team-run-closeout-tool-test",
      workflowId: "agent_team.coding",
      status: "completed",
      roles: [
        {
          roleId: "implementation_engineer",
          agentId: "implementation_engineer",
          modelRef: "openai-codex/gpt-5.4",
          status: "completed",
        },
      ],
      fileRefs: ["repo://extensions/execution-platform/src/example.ts"],
      artifactRefs: ["artifact://execution-platform/example"],
      validationRefs: ["validation://execution-platform/example"],
      runtimeEventRefs: ["runtime-job://runtime-job-closeout-tool-test/events"],
    },
    objectiveSummary: "Prove closeout.generate records model-authored Closeout Capsule evidence.",
    boundedRoleEvidence: [
      {
        roleId: "implementation_engineer",
        agentId: "implementation_engineer",
        modelRef: "openai-codex/gpt-5.4",
        askedToDo: "Implement closeout.generate runtime tool.",
        evidenceSummary: "Implemented a closeout runtime tool and tests.",
        artifactRefs: ["artifact://execution-platform/example"],
        validationRefs: ["validation://execution-platform/example"],
        limitations: ["fixture model output in unit test"],
      },
    ],
    boundedResultEvidence: {
      completed: true,
      needsReview: false,
      failed: false,
      findings: [],
      requiredFixes: [],
      limitations: ["unit test uses a fixture JSON executor"],
    },
  };
}

async function withKernel<T>(
  register: (registry: RuntimeToolRegistry) => void,
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
    register(registry);
    const runtimeJobs = new RuntimeJobRepository(database.sql, { claimStrategy: "basic" });
    const traces = new RuntimeToolTraceRepository(database.sql);
    const kernel = new RuntimeToolKernel({ registry, traces });
    return await work(kernel, traces, runtimeJobs);
  } finally {
    await database.close();
  }
}

describe("closeout.generate runtime tool", () => {
  it("records model-authored Closeout Capsule evidence through RuntimeToolKernel", async () => {
    const reporter = new ModelCloseoutCapsuleReporter({
      now: () => new Date("2026-05-16T00:00:00.000Z"),
      executor: {
        async execute() {
          return {
            outputText: JSON.stringify({
              humanReportMarkdown:
                "The closeout runtime tool produced a useful model-authored report.",
              eli5Progress:
                "OpenClaw used a tool trace to prove the final report was produced by a model.",
              successAssessment: "satisfied",
              qualityAssessment: "The work is narrow, validated, and ready for the next gate.",
              workflowAgentModelFitAssessment:
                "The model-authored closeout path fits the workflow evidence.",
              limitations: ["This is a focused unit fixture, not a live provider call."],
              opportunitySeeds: [],
            }),
            resolvedModelId: "openai-codex/gpt-5.4",
          };
        },
      },
    });

    await withKernel(
      (registry) => registerCloseoutGenerateRuntimeTool({ registry, reporter }),
      async (kernel, traces, runtimeJobs) => {
        await runtimeJobs.enqueueJob({
          jobId: "runtime-job-closeout-tool-test",
          jobType: "executor.agent_team",
          queueName: "agent-team",
          payload: {},
          idempotencyScope: "closeout-generate-test",
          idempotencyKey: "model-authored-runtime-job",
        });
        const result = await kernel.invoke({
          toolId: "closeout.generate",
          runtimeJobId: "runtime-job-closeout-tool-test",
          roleRef: "closeout",
          modelRef: "openai-codex/gpt-5.4",
          providerRef: "codex_app_server_json_executor",
          idempotencyScope: "closeout-generate-test",
          idempotencyKey: "model-authored",
          inputSummary: "Generate a model-authored Closeout Capsule from bounded evidence.",
          volatileInput: { closeoutInput: closeoutInput() },
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
        expect(result.invocation.toolId).toBe("closeout.generate");
        expect(result.reasonCodes).toContain("closeout_generate_model_authored");
        const metadata = closeoutGenerateMetadataFromResult(result.result);
        expect(metadata).toMatchObject({
          artifactKind: "closeout_generate_runtime_tool_metadata",
          closeoutSource: "model",
          taskSuccess: "satisfied",
          rawPromptStored: false,
          rawResponseStored: false,
        });
        expect(parseCloseoutCapsule(metadata?.capsule).humanReport.source).toBe("model");
        expect(metadata?.capsuleRef).toBe(
          `runtime-job://runtime-job-closeout-tool-test/closeout-capsule/${metadata?.capsuleId}`,
        );
        const readback = await traces.summarize({
          runtimeJobId: "runtime-job-closeout-tool-test",
          limit: 10,
        });
        expect(readback.latestToolId).toBe("closeout.generate");
        expect(readback.invocationRefs).toContain(result.invocationRef);
      },
    );
  });

  it("treats degraded system closeout as diagnostic needs-review evidence", async () => {
    const reporter = {
      async createCapsule(input: CloseoutCapsuleReporterInput) {
        return createDegradedSystemCloseoutCapsule({
          ...input,
          reasonCodes: ["closeout_capsule_model_reporter_not_configured"],
        });
      },
    };

    await withKernel(
      (registry) => registerCloseoutGenerateRuntimeTool({ registry, reporter }),
      async (kernel, _traces, runtimeJobs) => {
        await runtimeJobs.enqueueJob({
          jobId: "runtime-job-degraded-closeout-tool-test",
          jobType: "executor.agent_team",
          queueName: "agent-team",
          payload: {},
          idempotencyScope: "closeout-generate-test",
          idempotencyKey: "degraded-runtime-job",
        });
        const result = await kernel.invoke({
          toolId: "closeout.generate",
          runtimeJobId: "runtime-job-degraded-closeout-tool-test",
          idempotencyScope: "closeout-generate-test",
          idempotencyKey: "degraded",
          inputSummary: "Reject degraded closeout as clean success.",
          volatileInput: { closeoutInput: closeoutInput() },
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
            "degraded_closeout_diagnostic_only",
            "closeout_capsule_human_report_not_model_authored",
            "closeout_capsule_role_closeout_not_model_authored",
          ]),
        );
      },
    );
  });
});
