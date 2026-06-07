import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { decideModelDegradation } from "../model-routing/model-degradation-handling.ts";
import {
  createModelEvalCadenceRecord,
  demoteModelEvalCadenceRecord,
} from "../model-routing/model-eval-cadence.ts";
import { enforceModelRoster } from "../model-routing/model-roster-enforcement.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import {
  decideWorkQueueExecutionAction,
  recordWorkQueueExecutionAction,
} from "../work-queue/execution-actions.ts";
import { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import {
  completeParallelLane,
  createBoundedParallelAgentTeamPlan,
  createOperatorApprovalRecord,
  createProductionSupervisorConfig,
  decideAuthorityEscalation,
  decideCrossTransportRecovery,
  decideExecutorTransportPolicy,
  resolveAcpRuntimeEndpoint,
  resolveAndPreflightAcpRuntimeEndpoint,
  runAcpBridgeRealEndpointPilot,
  createAcpBridgeTransportRequest,
  validateAgentTeamParallelPlan,
  validateOperatorApprovalRecord,
  ProductionSupervisor,
} from "./index.ts";
import { CODEX_BRIDGE_JOB_TYPE } from "./types.ts";

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
      now: () => new Date("2026-05-03T22:00:00.000Z"),
      maxArtifactMetadataBytes: 256 * 1024,
    });
    const workQueue = new WorkQueueRepository(database.sql, runtimeJobs, {
      now: () => new Date("2026-05-03T22:00:00.000Z"),
    });
    return await work({ runtimeJobs, workQueue });
  } finally {
    await database.close();
  }
}

describe("ACP production executor and agent-team maturation", () => {
  it("resolves ACP endpoint from env/artifact and requires a passing probe", async () => {
    const envResolution = resolveAcpRuntimeEndpoint({
      env: { OPENCLAW_ACP_ENDPOINT_URL: "ws://127.0.0.1:28789" } as NodeJS.ProcessEnv,
    });
    expect(envResolution).toMatchObject({
      endpointSource: "env",
      endpointUrl: "ws://127.0.0.1:28789",
      staleOrUnprobedEndpointAccepted: false,
    });

    const ready = await resolveAndPreflightAcpRuntimeEndpoint({
      env: {} as NodeJS.ProcessEnv,
      defaultToLocalGateway: true,
      gatewayPort: 28789,
      probe: async () => true,
    });
    expect(ready.readyForSupervisorTransport).toBe(true);
    expect(ready.preflight.mode).toBe("real_endpoint_available");

    const missing = resolveAcpRuntimeEndpoint({ env: {} as NodeJS.ProcessEnv });
    expect(missing.exactMissingValues).toContain("OPENCLAW_ACP_ENDPOINT_URL");
  });

  it("runs real-endpoint ACP runtime evidence only after ready preflight", async () => {
    await withRuntime(async ({ runtimeJobs }) => {
      await runtimeJobs.enqueueJob({
        jobId: "acp-real-job",
        jobType: CODEX_BRIDGE_JOB_TYPE,
        queueName: "acp-real",
      });
      const readiness = await resolveAndPreflightAcpRuntimeEndpoint({
        env: {} as NodeJS.ProcessEnv,
        defaultToLocalGateway: true,
        gatewayPort: 28789,
        probe: async () => true,
        runtimeJobs,
        runtimeJobId: "acp-real-job",
      });
      const result = await runAcpBridgeRealEndpointPilot({
        runtimeJobs,
        preflight: readiness.preflight,
        endpointHealthSummary: { ok: true, source: "test_probe" },
        request: createAcpBridgeTransportRequest({
          requestId: "acp-real-request",
          runtimeJobId: "acp-real-job",
          sessionId: "acp-real-session",
          mode: "real_endpoint",
          objective: "minimal ACP runtime job",
          authorityProfileId: "trusted-local-yolo-v1",
        }),
      });
      expect(result.mode).toBe("real_endpoint");
      expect(result.workQueueReadModelCompatible).toBe(true);
      const events = await runtimeJobs.listEvents("acp-real-job");
      expect(events.map((event) => event.eventType)).toEqual(
        expect.arrayContaining([
          "acp_bridge.real_endpoint_health_observed",
          "acp_bridge.normalized_stream_event",
        ]),
      );
    });
  });

  it("selects ACP only with readiness and preserves V4 Pro role boundaries", async () => {
    const acpReady = await resolveAndPreflightAcpRuntimeEndpoint({
      defaultToLocalGateway: true,
      gatewayPort: 28789,
      probe: async () => true,
    });
    expect(
      decideExecutorTransportPolicy({
        transportKind: "acp_endpoint",
        jobType: "executor.agent_team",
        acpReadiness: acpReady,
      }),
    ).toMatchObject({ allowed: true, state: "preferred" });
    expect(
      decideExecutorTransportPolicy({
        transportKind: "acp_endpoint",
        jobType: "executor.agent_team",
        acpReadiness: null,
      }),
    ).toMatchObject({
      allowed: false,
      reasonCodes: ["acp_endpoint_readiness_required"],
    });
    const v4ProContext = enforceModelRoster({
      roleId: "context_scout",
      requestedModelId: "deepseek/deepseek-v4-pro",
      requestedAuthority: "observe",
      candidates: [
        {
          candidateId: "deepseek-v4-pro-coding-candidate",
          operatorRequestedLabel: "DeepSeek V4 Pro",
          provider: "openrouter",
          upstreamProvider: "deepseek",
          modelLabel: "DeepSeek V4 Pro",
          openRouterModelId: "deepseek/deepseek-v4-pro",
          intendedUse: "agent_team_role",
          currentAvailabilityVerified: true,
          benchmarkClaimAcceptedAsFact: false,
          providerCallMade: false,
          requiredEvidence: ["artifact:v4-pro"],
          status: "ready_for_shadow_eval",
        },
      ],
      roleQualificationStatus: "needs_review",
      evidenceRefs: ["artifact:v4-pro"],
    });
    expect(
      decideExecutorTransportPolicy({
        transportKind: "openrouter_model_lane",
        jobType: "executor.agent_team",
        roleId: "context_scout",
        requestedModelId: "deepseek/deepseek-v4-pro",
        modelRosterDecision: v4ProContext,
      }),
    ).toMatchObject({
      allowed: false,
      reasonCodes: expect.arrayContaining(["v4_pro_only_allowed_for_test_engineer"]),
    });
  });

  it("records cross-transport recovery and supervisor ACP readiness without lifecycle mutation", async () => {
    await withRuntime(async ({ runtimeJobs }) => {
      await runtimeJobs.enqueueJob({
        jobId: "supervisor-acp-job",
        jobType: CODEX_BRIDGE_JOB_TYPE,
        queueName: "supervisor-acp",
      });
      const supervisor = new ProductionSupervisor(
        runtimeJobs,
        createProductionSupervisorConfig({
          enabled: true,
          operatorKillSwitch: false,
          queueName: "supervisor-acp",
          allowedJobTypes: [CODEX_BRIDGE_JOB_TYPE],
        }),
      );
      const run = await supervisor.runBounded();
      expect(run.completedJobIds).toEqual(["supervisor-acp-job"]);
      expect(run.workQueueLifecycleMutated).toBe(false);

      const fallback = decideExecutorTransportPolicy({
        transportKind: "local_codex",
        jobType: "executor.codex_bridge",
      });
      expect(
        decideCrossTransportRecovery({
          runtimeJobId: "supervisor-acp-job",
          failedTransport: "acp_endpoint",
          failureKind: "endpoint_unavailable",
          attempt: 2,
          maxAttempts: 2,
          fallbackPolicy: fallback,
        }),
      ).toMatchObject({
        action: "fallback_transport",
        runtimeTruthPreserved: true,
        workQueueLifecycleMutated: false,
      });
    });
  });

  it("validates parallel lanes, authority gates, operator approvals, and Work Queue actions", async () => {
    await withRuntime(async ({ runtimeJobs }) => {
      await runtimeJobs.enqueueJob({
        jobId: "team-maturation-job",
        jobType: "executor.agent_team",
        queueName: "team",
      });
      const plan = createBoundedParallelAgentTeamPlan({
        teamRunId: "team-maturation",
        createdAt: "2026-05-03T22:00:00.000Z",
      });
      expect(validateAgentTeamParallelPlan(plan)).toMatchObject({
        valid: true,
        writeLaneCount: 1,
      });
      const completed = completeParallelLane({
        plan,
        laneId: "team-maturation-context-scout",
        completedAt: "2026-05-03T22:00:01.000Z",
        evidenceRef: "artifact:context-scout",
      });
      expect(completed.lanes.find((lane) => lane.roleId === "context_scout")?.status).toBe(
        "completed",
      );

      expect(decideAuthorityEscalation({ requestedAuthority: "local_yolo" })).toMatchObject({
        decision: "allowed",
      });
      expect(decideAuthorityEscalation({ requestedAuthority: "install_dependency" })).toMatchObject(
        {
          decision: "requires_approval",
          reasonCodes: expect.arrayContaining(["operator_approval_required"]),
        },
      );

      const approval = createOperatorApprovalRecord({
        approvalId: "approval-1",
        approvalKind: "v4_pro_test_engineer_use",
        requestedBy: "operator",
        approvedBy: "operator",
        approvedAt: "2026-05-03T22:00:00.000Z",
        expiresAt: "2026-05-04T22:00:00.000Z",
        scope: ["role:test_engineer"],
        runtimeJobId: "team-maturation-job",
        workItemId: null,
        constraints: ["V4 Pro test_engineer only"],
        rollbackRequirement: null,
        evidenceRefs: ["artifact:v4-pro-decision"],
      });
      expect(
        validateOperatorApprovalRecord(approval, new Date("2026-05-03T22:00:00.000Z")),
      ).toMatchObject({ valid: true });

      const action = decideWorkQueueExecutionAction({
        actionId: "retry-1",
        actionKind: "retry",
        workItemId: "work-item",
        runtimeJobId: "team-maturation-job",
        actorId: "operator",
        authenticated: true,
      });
      expect(action).toMatchObject({ accepted: true, workQueueLifecycleMutated: false });
      await recordWorkQueueExecutionAction({
        runtimeJobs,
        runtimeJobId: "team-maturation-job",
        decision: action,
      });
      expect(
        (await runtimeJobs.listArtifacts("team-maturation-job")).map((item) => item.artifactType),
      ).toContain("work_queue.execution_action");
    });
  });

  it("models eval cadence and provider degradation without global promotion", () => {
    const cadence = createModelEvalCadenceRecord({
      candidateId: "new-candidate",
      modelId: "provider/new-model",
      roleId: "context_scout",
    });
    expect(cadence).toMatchObject({ status: "unqualified", noGlobalWinner: true });
    expect(demoteModelEvalCadenceRecord(cadence, "scope_drift")).toMatchObject({
      status: "demoted",
      productionPromotionPerformed: false,
    });
    expect(
      decideModelDegradation({
        model: {
          modelId: "deepseek/deepseek-v4-pro",
          provider: "openrouter",
          callCount: 3,
          successCount: 2,
          needsReviewCount: 1,
          rateLimitCount: 1,
          noContentCount: 1,
          retryCount: 4,
          averageLatencyMs: 10_000,
          maxLatencyMs: 20_000,
          usageComplete: true,
          costSource: "provider_reported",
          readiness: "qualified",
          latestReasonCodes: ["openrouter_http_429"],
        },
        fallbackModelId: "deepseek/deepseek-v4-flash",
        fallbackPolicyAllowed: true,
      }),
    ).toMatchObject({
      laneHealth: "degraded",
      fallbackAllowed: true,
      roleAuthorityBoundaryPreserved: true,
    });
  });
});
