import { describe, expect, it, vi } from "vitest";
import {
  applyExecutionPlatformMigrations,
  createExecutionPlatformPgMemTestDatabase,
  RuntimeJobRepository,
} from "../../extensions/execution-platform/runtime-api.js";
import {
  NATIVE_EXECUTION_SESSION_JOB_TYPE,
  NATIVE_EXECUTION_SESSION_QUEUE,
} from "../../extensions/execution-platform/src/workflows/native-agentic-orchestration.js";
import type { OpenClawAgentRuntime } from "../agents/openclaw-agent-runtime.js";
import { runNativeExecutionSessionRuntimeJob } from "./native-execution-session-runtime-job.js";

const RUNTIME_GENERATION_ID = "runtime-generation:test";

async function withRuntimeJobs<T>(work: (runtimeJobs: RuntimeJobRepository) => Promise<T>) {
  const db = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(db.sql);
    const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
    return await work(runtimeJobs);
  } finally {
    await db.close();
  }
}

function acceptedPayload() {
  return {
    artifactKind: "openclaw.accepted_agent_run",
    schemaVersion: "openclaw.accepted-agent-run.payload.v1",
    runtimeGenerationId: RUNTIME_GENERATION_ID,
    agentId: "execution-orchestrator",
    envelope: "runtime_job",
    policyRef: null,
    objective: "Reduce a completed native turn without finish.",
    refs: [{ ref: "work-queue://item/native-turn-reducer" }],
    constraints: [],
    validationSignal: null,
    session: {
      sessionId: "native-turn-reducer-session",
      agentProfile: "execution-orchestrator",
      parentSessionId: null,
      childRelation: null,
    },
    runRequest: {
      agentId: "execution-orchestrator",
      input: {
        prompt: "Reduce a completed native turn without finish.",
        trigger: "manual",
      },
      promptProfile: "execution-orchestrator",
      toolPolicy: {
        visibleToolNames: ["node_finish"],
        requiredToolNames: ["node_finish"],
      },
      modelProfile: {
        provider: "codex",
        model: "gpt-5.5",
        thinkingLevel: "xhigh",
        reasoningLevel: null,
      },
      workspace: {
        canonicalSourceRoot: "/repo",
        runtimeWorkspaceDir: "/runtime/workspace",
        transcriptRoot: "/runtime/transcripts",
        artifactRoot: "/runtime/artifacts",
      },
      transcript: {
        sessionId: "native-turn-reducer-session",
        sessionKey: "native-turn-reducer-session",
        sessionFile: "/runtime/transcripts/native-turn-reducer-session.jsonl",
      },
    },
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    secretsStored: false,
  };
}

function fakeAgentRuntime(input: {
  runAcceptedNativeExecution: OpenClawAgentRuntime["runAcceptedNativeExecution"];
}): OpenClawAgentRuntime {
  return {
    profile: vi.fn(() => ({
      allowedChildAgentIds: [],
      parentToolNames: ["node_finish"],
      providerCapability: {
        capabilityId: "codex_app_server",
        transportKind: "codex_app_server",
        fallbackAllowed: false,
      },
      model: {
        requestedRef: "codex/gpt-5.5",
        canonicalRef: "codex/gpt-5.5",
        resolutionSource: "admitted_catalog",
      },
      roots: {
        canonicalSourceRoot: "/repo",
        runtimeWorkspaceDir: "/runtime/workspace",
        transcriptRoot: "/runtime/transcripts",
        artifactRoot: "/runtime/artifacts",
      },
      thinkingLevel: "xhigh",
      reasoningLevel: null,
    })),
    runAcceptedNativeExecution: input.runAcceptedNativeExecution,
  } as unknown as OpenClawAgentRuntime;
}

describe("runNativeExecutionSessionRuntimeJob", () => {
  it("reduces a completed native turn without node_finish to needs_review instead of leaving the job running", async () => {
    await withRuntimeJobs(async (runtimeJobs) => {
      const job = await runtimeJobs.enqueueJob({
        jobId: "native-turn-reducer-job",
        jobType: NATIVE_EXECUTION_SESSION_JOB_TYPE,
        queueName: NATIVE_EXECUTION_SESSION_QUEUE,
        payload: acceptedPayload(),
        maxAttempts: 1,
      });
      const runAcceptedNativeExecution = vi.fn(async ({ onAgentEvent }) => {
        onAgentEvent?.({
          stream: "node-agent",
          data: {
            eventType: "embedded_run_start_timing",
            stage: "agent_turn_completed",
            provider: "codex",
            model: "gpt-5.5",
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            rawToolLogStored: false,
          },
        });
        return {
          payloads: [{ text: "I should do this next." }],
          meta: {
            durationMs: 25,
            stopReason: "end_turn",
            agentMeta: {
              sessionId: "native-turn-reducer-session",
              provider: "codex",
              model: "gpt-5.5",
            },
          },
        } as never;
      });

      const result = await runNativeExecutionSessionRuntimeJob({
        runtimeJobs,
        workQueue: {} as never,
        agentRuntime: fakeAgentRuntime({ runAcceptedNativeExecution }),
        runtimeJobId: job.jobId,
        workerId: "native-turn-reducer-worker",
      });

      expect(result).toMatchObject({
        claimed: true,
        completed: false,
        status: "needs_review",
        runtimeJobId: job.jobId,
        sessionId: "native-turn-reducer-session",
      });
      await expect(runtimeJobs.getJob(job.jobId)).resolves.toMatchObject({
        state: "failed",
        result: expect.objectContaining({
          status: "needs_review",
          decision: "needs_review_no_required_closeout",
          finishObserved: false,
        }),
      });
      const events = await runtimeJobs.listEvents(job.jobId, 200);
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            eventType: "execution.turn.reduced",
            data: expect.objectContaining({
              eventKind: "turn_reduced",
              decision: "needs_review_no_required_closeout",
              status: "needs_review",
              finishObserved: false,
              reasonCodes: expect.arrayContaining([
                "native_execution_turn_reduced_by_runtime_job_envelope",
                "native_execution_session_finish_not_called",
              ]),
            }),
          }),
          expect.objectContaining({
            eventType: "job.needs_review",
          }),
        ]),
      );
    });
  });
});
