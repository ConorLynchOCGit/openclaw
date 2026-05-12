import { describe, expect, it } from "vitest";
import {
  buildDefaultWorkflowWorkerAdapterRegistry,
  evaluateWorkflowWorkerExecutionReadiness,
  validateWorkflowWorkerAdapterRegistry,
  workflowWorkerAdapterRegistrySchema,
} from "./workflow-worker-adapter-registry.ts";

describe("workflow worker adapter registry", () => {
  it("builds blocked-no-worker contracts by default", () => {
    const registry = buildDefaultWorkflowWorkerAdapterRegistry({
      generatedAt: "2026-05-08T00:00:00.000Z",
    });

    expect(validateWorkflowWorkerAdapterRegistry(registry)).toEqual({
      valid: true,
      reasonCodes: [],
    });
    expect(registry.contracts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workflowId: "agent_team.coding",
          contractState: "blocked_no_worker",
          supportedJobTypes: [],
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
        }),
      ]),
    );
  });

  it("accepts live and shadow contracts for supported job types", () => {
    const registry = buildDefaultWorkflowWorkerAdapterRegistry({
      generatedAt: "2026-05-08T00:00:00.000Z",
      contractStateByWorkflowId: {
        "agent_team.coding": "live",
        "single_agent.web_research": "shadow",
      },
      adapterIdByWorkflowId: {
        "agent_team.coding": "worker.acp-codex.coding",
        "single_agent.web_research": "worker.web-research.provider",
      },
    });

    expect(
      evaluateWorkflowWorkerExecutionReadiness({
        registry,
        workflowId: "agent_team.coding",
        jobType: "executor.agent_team",
      }),
    ).toMatchObject({
      accepted: true,
      contractState: "live",
      workerAdapterId: "worker.acp-codex.coding",
    });
    expect(
      evaluateWorkflowWorkerExecutionReadiness({
        registry,
        workflowId: "single_agent.web_research",
        jobType: "executor.single_agent",
      }),
    ).toMatchObject({
      accepted: true,
      contractState: "shadow",
      workerAdapterId: "worker.web-research.provider",
    });
  });

  it("blocks plan-only, disabled, blocked-no-worker, missing, and unsupported job types", () => {
    const registry = buildDefaultWorkflowWorkerAdapterRegistry({
      generatedAt: "2026-05-08T00:00:00.000Z",
      contractStateByWorkflowId: {
        "agent_team.coding": "plan_only",
        "single_agent.web_research": "disabled",
      },
    });

    expect(
      evaluateWorkflowWorkerExecutionReadiness({
        registry,
        workflowId: "agent_team.coding",
        jobType: "executor.agent_team",
      }),
    ).toMatchObject({
      accepted: false,
      contractState: "plan_only",
    });
    expect(
      evaluateWorkflowWorkerExecutionReadiness({
        registry,
        workflowId: "single_agent.web_research",
        jobType: "executor.web_research",
      }),
    ).toMatchObject({
      accepted: false,
      contractState: "disabled",
    });
    expect(
      evaluateWorkflowWorkerExecutionReadiness({
        registry,
        workflowId: "workflow.unknown",
        jobType: "executor.unknown",
      }),
    ).toMatchObject({
      accepted: false,
      contractState: "missing",
    });

    const liveRegistry = buildDefaultWorkflowWorkerAdapterRegistry({
      generatedAt: "2026-05-08T00:00:00.000Z",
      contractStateByWorkflowId: { "agent_team.coding": "live" },
      adapterIdByWorkflowId: { "agent_team.coding": "worker.acp-codex.coding" },
    });
    expect(
      evaluateWorkflowWorkerExecutionReadiness({
        registry: liveRegistry,
        workflowId: "agent_team.coding",
        jobType: "executor.other",
      }),
    ).toMatchObject({
      accepted: false,
      reasonCodes: expect.arrayContaining(["worker_adapter_job_type_not_supported"]),
    });
  });

  it("rejects raw storage and unknown fields", () => {
    const registry = buildDefaultWorkflowWorkerAdapterRegistry({
      generatedAt: "2026-05-08T00:00:00.000Z",
    });
    const invalid = {
      ...registry,
      rawPromptStored: true,
      contracts: [
        {
          ...registry.contracts[0],
          arbitraryShellCommand: "echo nope",
        },
      ],
    };

    expect(workflowWorkerAdapterRegistrySchema.safeParse(invalid).success).toBe(false);
  });
});
