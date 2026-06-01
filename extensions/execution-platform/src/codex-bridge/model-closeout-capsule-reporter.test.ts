import { describe, expect, it } from "vitest";
import type {
  JsonModelExecutionRequest,
  JsonModelExecutionResponse,
  JsonModelExecutor,
} from "../../../model-memory/src/model-execution.ts";
import {
  createDegradedSystemCloseoutCapsule,
  ModelCloseoutCapsuleReporter,
} from "./model-closeout-capsule-reporter.ts";

class FakeExecutor implements JsonModelExecutor {
  requests: JsonModelExecutionRequest[] = [];

  async execute(request: JsonModelExecutionRequest): Promise<JsonModelExecutionResponse> {
    this.requests.push(request);
    const transport = request.responseOptions?.transport;
    if (
      transport?.type === "json_schema" &&
      transport.name === "execution_platform_closeout_opportunity_seed_repair"
    ) {
      return {
        resolvedModelId: request.contract.modelId,
        outputText: JSON.stringify({
          opportunitySeeds: [
            {
              kind: "proactive_plan",
              title: "Repair malformed closeout seeds",
              rationale: "The model report was useful but the seed candidate needed extraction.",
              recommendedNextStep: "Project the repaired seed into the Work Queue review lane.",
              evidenceRefs: ["runtime-job://job-1/closeout"],
              confidence: "medium",
            },
          ],
        }),
      };
    }
    return {
      resolvedModelId: request.contract.modelId,
      outputText: JSON.stringify({
        humanReportMarkdown:
          "Implemented the bounded task, validated the result, and left clear limitations for the owner.",
        eli5Progress:
          "The workflow now explains its work in human language instead of only listing ids.",
        successAssessment: "satisfied",
        qualityAssessment: "The reported work satisfies the bounded objective.",
        workflowAgentModelFitAssessment:
          "The selected workflow and visible model refs are appropriate for this proof.",
        limitations: ["live soak remains the next proof"],
        opportunitySeeds: [
          {
            kind: "proactive_plan",
            title: "Closeout Capsule Live Soak",
            rationale: "The new closeout product needs owner-visible proof.",
            recommendedNextStep: "Run the three-prompt soak.",
            evidenceRefs: ["runtime-job://job-1/closeout"],
            confidence: "high",
          },
        ],
      }),
    };
  }
}

describe("ModelCloseoutCapsuleReporter", () => {
  it("uses strict JSON schema and returns a model-authored capsule", async () => {
    const executor = new FakeExecutor();
    const reporter = new ModelCloseoutCapsuleReporter({ executor });
    const result = await reporter.createCapsule({
      factualRefs: {
        runtimeJobId: "job-1",
        teamRunId: "team-1",
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
        fileRefs: ["extensions/execution-platform/src/codex-bridge/closeout-capsule.ts"],
        artifactRefs: ["runtime-job://job-1/closeout"],
        validationRefs: ["focused tests"],
        runtimeEventRefs: ["runtime-job://job-1/events"],
      },
      objectiveSummary: "Implement model-authored closeout.",
      boundedRoleEvidence: [
        {
          roleId: "implementation_engineer",
          agentId: "implementation_engineer",
          modelRef: "openai-codex/gpt-5.4",
          modelRunRef: "model-run://job-1/implementation_engineer/run-1",
          askedToDo: "Implement model-authored closeout.",
          evidenceSummary: "Implemented schema and reporter.",
          artifactRefs: ["runtime-job://job-1/closeout"],
          validationRefs: ["focused tests"],
          limitations: ["live soak remains"],
        },
      ],
      boundedResultEvidence: {
        completed: true,
        needsReview: false,
        failed: false,
        findings: [],
        requiredFixes: [],
        limitations: ["live soak remains"],
      },
    });

    expect(result.source).toBe("model");
    expect(result.capsule.humanReport.eli5Progress).toContain("human language");
    expect(result.capsule.factualRefs.runtimeJobId).toBe("job-1");
    expect(result.capsule.roleCloseouts).toEqual([
      expect.objectContaining({
        roleId: "implementation_engineer",
        modelRef: "openai-codex/gpt-5.4",
        modelRunRef: "model-run://job-1/implementation_engineer/run-1",
        source: "model",
        evidenceRefs: ["runtime-job://job-1/closeout", "focused tests"],
        rawPromptStored: false,
        rawResponseStored: false,
      }),
    ]);
    expect(result.capsule.safetyFlags.rawPromptStored).toBe(false);
    expect(executor.requests[0]?.responseOptions?.transport?.type).toBe("json_schema");
    const transport = executor.requests[0]?.responseOptions?.transport;
    expect(transport?.type).toBe("json_schema");
    expect(transport?.type === "json_schema" ? transport.name : null).toBe(
      "execution_platform_model_authored_closeout",
    );
    expect(executor.requests[0]?.userPrompt).not.toContain("raw-provider-log-marker");
    expect(result.closeoutTiming).toMatchObject({
      modelRef: "openai-codex/gpt-5.4",
      reasoningEffort: "medium",
      maxOutputTokens: 12000,
      capsuleId: result.capsule.capsuleId,
      failureReason: null,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });
  });

  it("keeps a bounded model report when opportunity seeds need repair", async () => {
    class MalformedSeedExecutor extends FakeExecutor {
      override async execute(
        request: JsonModelExecutionRequest,
      ): Promise<JsonModelExecutionResponse> {
        const transport = request.responseOptions?.transport;
        if (
          transport?.type === "json_schema" &&
          transport.name === "execution_platform_closeout_opportunity_seed_repair"
        ) {
          return super.execute(request);
        }
        this.requests.push(request);
        return {
          resolvedModelId: request.contract.modelId,
          outputText: JSON.stringify({
            humanReportMarkdown: "The work completed, but the seed candidate is malformed.",
            eli5Progress: "The human report still exists, so closeout should not fail.",
            successAssessment: "satisfied",
            qualityAssessment: "The useful report exists.",
            workflowAgentModelFitAssessment: "The workflow fit evidence is bounded.",
            limitations: ["seed candidate needed repair"],
            opportunitySeeds: [{ idea: "make a better follow-up" }],
          }),
        };
      }
    }
    const executor = new MalformedSeedExecutor();
    const reporter = new ModelCloseoutCapsuleReporter({ executor });
    const result = await reporter.createCapsule({
      factualRefs: {
        runtimeJobId: "job-1",
        teamRunId: null,
        workflowId: "workflow.docs_skills",
        status: "completed",
        roles: [],
        fileRefs: [],
        artifactRefs: ["runtime-job://job-1/closeout"],
        validationRefs: ["focused tests"],
        runtimeEventRefs: ["runtime-job://job-1/events"],
      },
      objectiveSummary: "Repair malformed seed handling.",
      boundedRoleEvidence: [],
      boundedResultEvidence: {
        completed: true,
        needsReview: false,
        failed: false,
        findings: [],
        requiredFixes: [],
        limitations: [],
      },
    });

    expect(result.source).toBe("model");
    expect(result.capsule.humanReport.reportMarkdown).toContain("seed candidate");
    expect(result.capsule.opportunitySeeds[0]?.title).toBe("Repair malformed closeout seeds");
    expect(
      executor.requests.map((request) => {
        const transport = request.responseOptions?.transport;
        return transport?.type === "json_schema" ? transport.name : null;
      }),
    ).toContain("execution_platform_closeout_opportunity_seed_repair");
  });

  it("bounds long factual refs before parsing model-authored closeout capsules", async () => {
    const executor = new FakeExecutor();
    const reporter = new ModelCloseoutCapsuleReporter({ executor });
    const longArtifactRef = `runtime-job://job-1/${"context-scout-repoctx-".repeat(30)}`;
    const result = await reporter.createCapsule({
      factualRefs: {
        runtimeJobId: "job-1",
        teamRunId: "team-1",
        workflowId: "agent_team.coding",
        status: "needs_review",
        roles: [],
        fileRefs: [],
        artifactRefs: Array.from({ length: 45 }, (_, index) => `${longArtifactRef}-${index}`),
        validationRefs: [],
        runtimeEventRefs: [`runtime-job://job-1/${"events-".repeat(80)}`],
      },
      objectiveSummary: "Create bounded closeout.",
      boundedRoleEvidence: [],
      boundedResultEvidence: {
        completed: false,
        needsReview: true,
        failed: false,
        findings: [],
        requiredFixes: [],
        limitations: ["context supply remains open"],
      },
    });

    expect(result.capsule.factualRefs.artifactRefs).toHaveLength(40);
    expect(
      result.capsule.factualRefs.artifactRefs.every((ref) => ref.length <= 260),
    ).toBe(true);
    expect(
      result.capsule.factualRefs.runtimeEventRefs.every((ref) => ref.length <= 260),
    ).toBe(true);
  });

  it("bounds long factual refs before parsing degraded closeout capsules", () => {
    const longArtifactRef = `runtime-job://job-1/${"context-scout-repoctx-".repeat(30)}`;
    const result = createDegradedSystemCloseoutCapsule({
      factualRefs: {
        runtimeJobId: "job-1",
        teamRunId: "team-1",
        workflowId: "agent_team.coding",
        status: "needs_review",
        roles: [],
        fileRefs: [],
        artifactRefs: Array.from({ length: 45 }, (_, index) => `${longArtifactRef}-${index}`),
        validationRefs: [],
        runtimeEventRefs: [`runtime-job://job-1/${"events-".repeat(80)}`],
      },
      objectiveSummary: "Create degraded bounded closeout.",
      boundedRoleEvidence: [],
      boundedResultEvidence: {
        completed: false,
        needsReview: true,
        failed: false,
        findings: [],
        requiredFixes: [],
        limitations: ["context supply remains open"],
      },
      reasonCodes: ["scheduler_terminal_without_model_closeout"],
    });

    expect(result.capsule.factualRefs.artifactRefs).toHaveLength(40);
    expect(
      result.capsule.factualRefs.artifactRefs.every((ref) => ref.length <= 260),
    ).toBe(true);
    expect(
      result.capsule.factualRefs.runtimeEventRefs.every((ref) => ref.length <= 260),
    ).toBe(true);
  });

  it("bounds closeout model timeout without storing raw model content", async () => {
    class SlowExecutor implements JsonModelExecutor {
      async execute(): Promise<JsonModelExecutionResponse> {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return {
          outputText: JSON.stringify({ never: "used" }),
        };
      }
    }
    const reporter = new ModelCloseoutCapsuleReporter({
      executor: new SlowExecutor(),
      closeoutTimeoutMs: 5,
    });

    await expect(
      reporter.createCapsule({
        factualRefs: {
          runtimeJobId: "job-timeout",
          teamRunId: null,
          workflowId: "agent_team.coding",
          status: "completed",
          roles: [],
          fileRefs: [],
          artifactRefs: ["runtime-job://job-timeout/closeout"],
          validationRefs: ["focused tests"],
          runtimeEventRefs: ["runtime-job://job-timeout/events"],
        },
        objectiveSummary: "Timeout closeout.",
        boundedRoleEvidence: [],
        boundedResultEvidence: {
          completed: true,
          needsReview: false,
          failed: false,
          findings: [],
          requiredFixes: [],
          limitations: [],
        },
      }),
    ).rejects.toThrow("closeout_model_timeout");
  });
});
