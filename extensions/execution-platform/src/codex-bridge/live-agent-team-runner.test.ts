import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import {
  createAgentTeamFailureRecoveryArtifact,
  recordAgentTeamFailureRecoveryArtifact,
} from "./agent-team-failure-recovery.ts";
import { AGENT_TEAM_JOB_TYPE } from "./agent-team-runtime-evidence.ts";
import { OpenRouterAgentTeamModelClient } from "./live-agent-team-runner.ts";

async function withRuntime<T>(
  work: (input: {
    runtimeJobs: RuntimeJobRepository;
    workQueue: WorkQueueRepository;
  }) => Promise<T>,
): Promise<T> {
  const database = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const runtimeJobs = new RuntimeJobRepository(database.sql, {
      claimStrategy: "basic",
      now: () => new Date("2026-05-03T17:00:00.000Z"),
    });
    const workQueue = new WorkQueueRepository(database.sql, runtimeJobs, {
      now: () => new Date("2026-05-03T17:00:00.000Z"),
    });
    return await work({ runtimeJobs, workQueue });
  } finally {
    await database.close();
  }
}

describe("OpenRouter agent-team model client", () => {
  it("supports a Kimi native JSON request profile without reasoning and honors call token budget", async () => {
    const bodies: unknown[] = [];
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      const bodyText = typeof init?.body === "string" ? init.body : "{}";
      bodies.push(JSON.parse(bodyText));
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    whatIWasAskedToDo: "implement",
                    whatIActuallyDid: "implemented bounded change",
                    evidenceRefs: ["artifact://kimi"],
                    filesOrArtifactsTouched: ["file.ts"],
                    validationIPerformed: "test passed",
                    whatWorked: ["json profile worked"],
                    whatWasWeakOrFailed: ["none"],
                    recommendedNextStep: "continue",
                    confidence: "high",
                    limitations: ["bounded test"],
                  }),
                },
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
          };
        },
      } as Response;
    }) as typeof fetch;

    const client = new OpenRouterAgentTeamModelClient({
      apiKey: "test-key",
      fetchImpl,
      requestProfilesByModelId: {
        "moonshotai/kimi-k2.6": {
          responseFormatMode: "native",
          reasoningMode: "omit",
          maxTokens: 2_400,
        },
      },
    });

    const result = await client.callRole({
      roleId: "implementation_engineer",
      modelId: "moonshotai/kimi-k2.6",
      modelCandidateId: "kimi-2-6-coding-candidate",
      prompt: "Return compact JSON.",
      responseFormat: "json_object",
      maxTokens: 3_000,
    });

    expect(result.status).toBe("succeeded");
    expect(bodies[0]).toMatchObject({
      model: "moonshotai/kimi-k2.6",
      max_tokens: 3_000,
      response_format: { type: "json_object" },
    });
    expect(bodies[0]).not.toHaveProperty("reasoning");
  });

  it("honors per-call request profile overrides for Kimi patch calls", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      const body = typeof init?.body === "string" ? init.body : "";
      bodies.push(JSON.parse(body));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  schemaVersion: "openclaw.kimi.patch-proposal.v1",
                  status: "needs_review",
                  fileEdits: [],
                  validationCommandRefs: [],
                  limitations: ["bounded"],
                  rawPromptStored: false,
                  rawResponseStored: false,
                  rawProviderLogStored: false,
                }),
              },
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }),
      } as Response;
    }) as typeof fetch;

    const client = new OpenRouterAgentTeamModelClient({
      apiKey: "test-key",
      fetchImpl,
      requestProfilesByModelId: {
        "moonshotai/kimi-k2.6": {
          responseFormatMode: "native",
          reasoningMode: "exclude",
          maxTokens: 2_400,
        },
      },
    });

    const result = await client.callRole({
      roleId: "implementation_engineer",
      modelId: "moonshotai/kimi-k2.6",
      modelCandidateId: "kimi-2-6-coding-candidate",
      prompt: "Return compact JSON.",
      responseFormat: "json_object",
      requestProfileOverride: {
        responseFormatMode: "prompt_only",
        reasoningMode: "omit",
        maxTokens: 3_000,
      },
    });

    expect(result.status).toBe("succeeded");
    expect(bodies[0]).toMatchObject({
      model: "moonshotai/kimi-k2.6",
      max_tokens: 3_000,
    });
    expect(bodies[0]).not.toHaveProperty("response_format");
    expect(bodies[0]).not.toHaveProperty("reasoning");
  });

  it("sends Qwen packet-author prompt-only calls with reasoning none and bounded request diagnostics", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      const body = typeof init?.body === "string" ? init.body : "";
      bodies.push(JSON.parse(body));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              finish_reason: "stop",
              native_finish_reason: "stop",
              message: {
                content: JSON.stringify({
                  commitmentWorkPackets: [
                    {
                      commitmentId: "commitment-1",
                      workerObjective: "write the packet",
                      rawPromptStored: false,
                      rawResponseStored: false,
                      rawProviderLogStored: false,
                    },
                  ],
                }),
              },
            },
          ],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 200,
            total_tokens: 300,
            completion_tokens_details: { reasoning_tokens: 0 },
            cost: 0.01,
          },
        }),
      } as Response;
    }) as typeof fetch;

    const client = new OpenRouterAgentTeamModelClient({
      apiKey: "test-key",
      fetchImpl,
      requestProfilesByModelId: {
        "qwen/qwen3-coder-next": {
          responseFormatMode: "native",
          reasoningMode: "omit",
          maxTokens: 2_400,
        },
      },
    });

    const result = await client.callRole({
      roleId: "context_scout",
      modelId: "qwen/qwen3-coder-next",
      modelCandidateId: "qwen3-coder-next-commitment-packet-author",
      prompt: "Return packet JSON.",
      responseFormat: "json_object",
      requestProfileOverride: {
        responseFormatMode: "prompt_only",
        reasoningMode: "none",
        maxTokens: 8_000,
      },
      maxTokens: 8_000,
      timeoutMs: 90_000,
      maxAttempts: 1,
      taskClass: "local_semantic_extraction",
      modelTaskCallSite: "test.packet_author.semantic_content",
    });

    expect(result.status).toBe("succeeded");
    expect(bodies[0]).toMatchObject({
      model: "qwen/qwen3-coder-next",
      max_tokens: 8_000,
      reasoning: { effort: "none", exclude: true },
    });
    expect(bodies[0]).not.toHaveProperty("response_format");
    expect(result.providerResponseDiagnostics).toMatchObject({
      modelCallSpanId: expect.stringContaining("qwen3-coder-next-commitment-packet-author"),
      choiceCount: 1,
      structuredAdapterProfile: {
        taskClass: "local_semantic_extraction",
        reasoningMode: "none",
        responseFormatMode: "prompt_only_json",
      },
      structuredAdapterDiagnostics: {
        contentLength: expect.any(Number),
        finishReason: "stop",
        rawResponseStored: false,
      },
      structuredAdapterOutcome: {
        status: "succeeded",
      },
      providerBodyKeys: expect.arrayContaining(["choices", "usage"]),
      requestProfileDiagnostics: {
        responseFormatMode: "prompt_only",
        reasoningMode: "none",
        maxTokens: 8_000,
        timeoutMs: 90_000,
        maxAttempts: 1,
        hasResponseFormat: false,
        hasReasoning: true,
        reasoningEffort: "none",
        reasoningExclude: true,
        rawPromptStored: false,
      },
    });
  });

  it("keeps the same bounded request shape across fast-model no-content retries", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      const body = typeof init?.body === "string" ? init.body : "";
      bodies.push(JSON.parse(body));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              finish_reason: "length",
              native_finish_reason: "length",
              message: { content: "" },
            },
          ],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 0,
            total_tokens: 100,
          },
        }),
      } as Response;
    }) as typeof fetch;

    const client = new OpenRouterAgentTeamModelClient({
      apiKey: "test-key",
      fetchImpl,
      retryPolicy: {
        baseDelayMs: 0,
        maxDelayMs: 0,
      },
      requestProfilesByModelId: {
        "qwen/qwen3-coder-next": {
          responseFormatMode: "native",
          reasoningMode: "omit",
          maxTokens: 2_400,
        },
      },
    });

    const result = await client.callRole({
      roleId: "context_scout",
      modelId: "qwen/qwen3-coder-next",
      modelCandidateId: "qwen3-coder-next-retry",
      prompt: "Return packet JSON.",
      responseFormat: "json_object",
      requestProfileOverride: {
        responseFormatMode: "prompt_only",
        reasoningMode: "none",
        maxTokens: 1_200,
      },
      taskClass: "local_semantic_extraction",
      modelTaskCallSite: "test.packet_author.retry",
      maxTokens: 1_200,
      timeoutMs: 90_000,
      maxAttempts: 2,
    });

    expect(result.status).toBe("needs_review");
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toEqual(bodies[1]);
    expect(bodies[0]).toMatchObject({
      model: "qwen/qwen3-coder-next",
      max_tokens: 1_200,
      reasoning: { effort: "none", exclude: true },
    });
    expect(bodies[0]).not.toHaveProperty("response_format");
    expect(result.providerResponseDiagnostics).toMatchObject({
      structuredAdapterOutcome: {
        status: "escalate_with_structured_reason",
        escalationModelRefs: ["openai-codex/gpt-5.5"],
      },
    });
  });

  it("blocks oversized structured adapter role calls before OpenRouter fetch", async () => {
    let fetchCalls = 0;
    const fetchImpl = (async () => {
      fetchCalls += 1;
      throw new Error("fetch should not be called");
    }) as typeof fetch;
    const client = new OpenRouterAgentTeamModelClient({
      apiKey: "test-key",
      fetchImpl,
    });

    const result = await client.callRole({
      roleId: "context_scout",
      modelId: "qwen/qwen3-coder-next",
      modelCandidateId: "qwen3-coder-next-preflight",
      prompt: "x".repeat(80_000),
      taskClass: "local_semantic_extraction",
      modelTaskCallSite: "test.packet_author.preflight",
      maxTokens: 1_200,
      timeoutMs: 90_000,
      maxAttempts: 1,
    });

    expect(fetchCalls).toBe(0);
    expect(result).toMatchObject({
      status: "needs_review",
      retryEvidence: null,
      errorReasonCode: "structured_adapter_preflight_blocked",
      providerResponseDiagnostics: {
        structuredAdapterPreflight: {
          accepted: false,
          reasonCodes: expect.arrayContaining(["structured_adapter_input_exceeds_policy_bound"]),
          rawPromptStored: false,
        },
      },
    });
  });

  it("records irreparable failure recovery as needs_review without false success", async () => {
    await withRuntime(async ({ runtimeJobs }) => {
      const runtimeJob = await runtimeJobs.enqueueJob({
        jobId: "failure-recovery-runtime-job",
        jobType: AGENT_TEAM_JOB_TYPE,
        queueName: "agent-team-live",
      });
      const recovery = createAgentTeamFailureRecoveryArtifact({
        recoveryId: "recovery-needs-review",
        runtimeJobId: runtimeJob.jobId,
        teamRunId: "team-run",
        failedRole: "implementation_engineer",
        recoveryRole: "reviewer",
        failureKind: "scope_drift",
        detectedAt: "2026-05-03T17:00:00.000Z",
        failureSummary: "Role attempted to change a file outside the approved module.",
        outcome: "needs_review",
        needsReviewReason: "scope drift requires operator decision",
      });
      await recordAgentTeamFailureRecoveryArtifact({ runtimeJobs, artifact: recovery });

      expect(recovery).toMatchObject({
        outcome: "needs_review",
        falseSuccessClaimed: false,
        scopeDriftDetected: true,
        workQueueLifecycleMutated: false,
      });
    });
  });
});
