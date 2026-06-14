import { describe, expect, it, vi } from "vitest";
import {
  applyExecutionPlatformMigrations,
  createExecutionPlatformPgMemTestDatabase,
  RuntimeJobRepository,
} from "../../extensions/execution-platform/runtime-api.js";
import type { OpenClawAcceptedAgentRun } from "../agents/openclaw-agent-runtime-contracts.js";
import type { OpenClawAgentRuntime } from "../agents/openclaw-agent-runtime.js";
import {
  commitAcceptedNativeExecutionJob,
  NativeExecutionStartService,
} from "./native-execution-start-service.js";

function makeAcceptedRun(
  input: {
    runtimeGenerationId?: string;
    sessionId?: string;
    idempotencyKey?: string;
  } = {},
): OpenClawAcceptedAgentRun {
  const runtimeGenerationId = input.runtimeGenerationId ?? "runtime-generation:test";
  const sessionId = input.sessionId ?? "accepted-native-job-session";
  const taskText = [
    "Objective: Commit accepted native job.",
    "",
    "Refs:",
    "- work-queue://item/accepted-native-job",
  ].join("\n");
  return {
    artifactKind: "openclaw.accepted_agent_run",
    schemaVersion: "openclaw.accepted-agent-run.v1",
    runtimeGenerationId,
    agentId: "execution-orchestrator",
    envelope: "runtime_job",
    policyRef: null,
    sessionId,
    parentSessionId: null,
    childRelation: null,
    request: {
      objective: "Commit accepted native job.",
      refs: [{ ref: "work-queue://item/accepted-native-job" }],
      constraints: [],
      validationSignal: null,
    },
    taskMessage: {
      sessionId,
      agentProfile: "execution-orchestrator",
      text: taskText,
    },
    runRequest: {
      agentId: "execution-orchestrator",
      input: {
        prompt: taskText,
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
        sessionId,
        sessionKey: sessionId,
        sessionFile: `/runtime/transcripts/${sessionId}.jsonl`,
      },
      metadata: {
        artifactKind: "openclaw.accepted_agent_run",
        runtimeGenerationId,
        envelope: "runtime_job",
        policyRef: null,
        configSnapshotId: "config:test",
        catalogSnapshotId: "catalog:test",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      },
    },
    idempotencyScope: "accepted-native-job-test",
    idempotencyKey: input.idempotencyKey ?? `accepted:${runtimeGenerationId}`,
    metadata: {
      configSnapshotId: "config:test",
      catalogSnapshotId: "catalog:test",
      promptProfileHash: "prompt-hash",
      toolPolicyHash: "tool-hash",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    },
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    secretsStored: false,
  };
}

function makeAgentRuntime(accepted: OpenClawAcceptedAgentRun): OpenClawAgentRuntime {
  return {
    status: () => ({
      artifactKind: "openclaw.runtime_generation.status",
      schemaVersion: "openclaw.runtime-generation.status.v1",
      accepted: true,
      status: "ready",
      runtimeGenerationId: accepted.runtimeGenerationId,
      configPath: "/home/node/.openclaw/config.json",
      configSnapshotId: "config:test",
      catalogSnapshotId: "catalog:test",
      runtimeRoots: {
        canonicalSourceRoot: "/repo",
        runtimeWorkspaceDir: "/runtime/workspace",
        transcriptRoot: "/runtime/transcripts",
        artifactRoot: "/runtime/artifacts",
      },
      agentChecks: [
        {
          agentId: "execution-orchestrator",
          ok: true,
          provider: "codex",
          modelId: "gpt-5.5",
        },
      ],
      reasonCodes: ["runtime_generation_ready"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      secretsStored: false,
    }),
    acceptNativeExecutionSession: vi.fn(() => accepted),
  } as unknown as OpenClawAgentRuntime;
}

describe("native execution start service", () => {
  it("commits accepted RuntimeJobs without executable admission snapshots", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      const accepted = makeAcceptedRun();

      const first = await commitAcceptedNativeExecutionJob({
        runtimeJobs,
        accepted,
      });
      const retry = await commitAcceptedNativeExecutionJob({
        runtimeJobs,
        accepted,
      });

      expect(first.status).toBe("started");
      expect(retry.status).toBe("already_started");
      expect(retry.runtimeJobId).toBe(first.runtimeJobId);
      expect(first.runtimeJob.payload).toMatchObject({
        artifactKind: "openclaw.accepted_agent_run",
        schemaVersion: "openclaw.accepted-agent-run.payload.v1",
        runtimeGenerationId: "runtime-generation:test",
        agentId: "execution-orchestrator",
        envelope: "runtime_job",
        runRequest: {
          agentId: "execution-orchestrator",
          input: {
            prompt: expect.stringContaining("Objective: Commit accepted native job."),
            trigger: "manual",
          },
          workspace: {
            canonicalSourceRoot: "/repo",
            runtimeWorkspaceDir: "/runtime/workspace",
            transcriptRoot: "/runtime/transcripts",
            artifactRoot: "/runtime/artifacts",
          },
          transcript: {
            sessionId: "accepted-native-job-session",
            sessionKey: "accepted-native-job-session",
            sessionFile: "/runtime/transcripts/accepted-native-job-session.jsonl",
          },
        },
      });
      expect(JSON.stringify(first.runtimeJob.payload)).not.toContain("admitted_runtime_snapshot");
      expect(JSON.stringify(first.runtimeJob.payload)).not.toContain("providerLease");
      const events = await runtimeJobs.listEvents(first.runtimeJobId, 100);
      expect(
        events.filter((event) => event.eventType === "execution.session.started"),
      ).toHaveLength(1);
      const startEvent = events.find((event) => event.eventType === "execution.session.started");
      expect(startEvent?.data).toMatchObject({
        runtimeGenerationId: "runtime-generation:test",
        agentId: "execution-orchestrator",
        rawPromptStored: false,
        rawResponseStored: false,
      });
      expect(JSON.stringify(events)).not.toContain("execution.admission.committed");
    } finally {
      await db.close();
    }
  });

  it("rejects idempotency collisions that point at a different runtime generation", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      await commitAcceptedNativeExecutionJob({
        runtimeJobs,
        accepted: makeAcceptedRun({
          runtimeGenerationId: "runtime-generation:old",
          idempotencyKey: "same-request",
        }),
      });

      await expect(
        commitAcceptedNativeExecutionJob({
          runtimeJobs,
          accepted: makeAcceptedRun({
            runtimeGenerationId: "runtime-generation:new",
            idempotencyKey: "same-request",
          }),
        }),
      ).rejects.toThrow(/different runtime generation/);
    } finally {
      await db.close();
    }
  });

  it("projects resident RuntimeGeneration readiness and starts through runtime.accept", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      const accepted = makeAcceptedRun();
      const agentRuntime = makeAgentRuntime(accepted);
      const service = new NativeExecutionStartService({ agentRuntime });

      await expect(service.readiness()).resolves.toMatchObject({
        accepted: true,
        status: "ready",
        configSnapshotId: "config:test",
        catalogSnapshotId: "catalog:test",
        reasonCodes: ["runtime_generation_status_projected", "runtime_generation_ready"],
        runtimeJobCreated: false,
      });
      await expect(
        service.preflight({
          runtimeJobs,
          request: {
            objective: "Commit accepted native job.",
            refs: ["work-queue://item/accepted-native-job"],
          },
        }),
      ).resolves.toMatchObject({
        artifactKind: "openclaw.runtime_generation.acceptance",
        accepted: true,
        runtimeGenerationId: "runtime-generation:test",
      });

      const started = await service.start({
        runtimeJobs,
        request: {
          objective: "Commit accepted native job.",
          refs: ["work-queue://item/accepted-native-job"],
        },
      });
      expect(started.status).toBe("started");
      expect(agentRuntime.acceptNativeExecutionSession).toHaveBeenCalledTimes(2);
      expect(started.runtimeJob.payload).toMatchObject({
        artifactKind: "openclaw.accepted_agent_run",
        runtimeGenerationId: "runtime-generation:test",
      });
    } finally {
      await db.close();
    }
  });
});
