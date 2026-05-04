import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { decideModelFallback } from "../model-routing/model-fallback-policy.ts";
import { RuntimeJobRepository, type JsonValue } from "../runtime-job-repository.ts";
import {
  buildWorkQueueExecutionReadModel,
  summarizeWorkQueueExecutionForUi,
} from "../work-queue/execution-read-model.ts";
import { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import {
  createAlwaysOnSupervisorBoundaryConfig,
  createOperatorApprovalRecord,
  enforceRuntimeApproval,
  proveAlwaysOnSupervisorBoundary,
  runDeployNonProductionRealTargetDryRun,
  runInstallDependencyRealAuthorityPilot,
  runLiveParallelAgentTeamE2E,
  runModelPromotionRealEvalAuthorityPilot,
  runOutboundStagedReadonlyAuthorityPilot,
  runProductionIncidentRunbookRehearsal,
  runRepeatedMixedTransportSupervisorSoak,
  validateOperatorApprovalRecord,
} from "./index.ts";

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
      now: () => new Date("2026-05-03T23:00:00.000Z"),
      maxArtifactMetadataBytes: 256 * 1024,
    });
    const workQueue = new WorkQueueRepository(database.sql, runtimeJobs, {
      now: () => new Date("2026-05-03T23:00:00.000Z"),
    });
    return await work({ runtimeJobs, workQueue });
  } finally {
    await database.close();
  }
}

function approvalFor(input: {
  approvalId: string;
  approvalKind: "high_blast_radius_authority" | "deploy_dry_run" | "model_promotion_dry_run";
  scope: string;
  runtimeJobId: string;
}) {
  return createOperatorApprovalRecord({
    approvalId: input.approvalId,
    approvalKind: input.approvalKind,
    requestedBy: "operator",
    approvedBy: "operator",
    approvedAt: "2026-05-03T23:00:00.000Z",
    expiresAt: "2026-05-04T23:00:00.000Z",
    scope: [input.scope],
    runtimeJobId: input.runtimeJobId,
    workItemId: null,
    constraints: [`scoped to ${input.scope}`],
    rollbackRequirement: "rollback plan required for high-risk authority",
    evidenceRefs: ["artifact:operator-approval-proof"],
  });
}

describe("execution autonomy next sequence", () => {
  it("rehearses production incidents and records Work Queue-safe operator recovery evidence", async () => {
    await withRuntime(async ({ runtimeJobs }) => {
      await runtimeJobs.enqueueJob({
        jobId: "incident-rehearsal-job",
        jobType: "executor.agent_team",
        queueName: "autonomy",
      });
      const proof = await runProductionIncidentRunbookRehearsal({
        runtimeJobs,
        runtimeJobId: "incident-rehearsal-job",
      });
      expect(proof.incidents.map((incident) => incident.incidentKind)).toEqual([
        "stuck_job",
        "stale_lease",
        "failed_role_output",
        "cancel",
        "redirect",
        "acp_unavailable",
        "provider_no_content",
      ]);
      expect(proof.missingOperatorActions).toEqual([]);
      expect(proof.workQueueLifecycleMutated).toBe(false);
      const events = await runtimeJobs.listEvents("incident-rehearsal-job");
      expect(events.filter((event) => event.eventType.includes("incident_rehearsed"))).toHaveLength(
        7,
      );
    });
  });

  it("runs repeated mixed-transport soak evidence with closeout/readback for every job", async () => {
    await withRuntime(async ({ runtimeJobs }) => {
      const ids = ["soak-local", "soak-openrouter", "soak-acp", "soak-failure"];
      for (const jobId of ids) {
        await runtimeJobs.enqueueJob({ jobId, jobType: "executor.agent_team", queueName: "soak" });
      }
      const proof = await runRepeatedMixedTransportSupervisorSoak({
        runtimeJobs,
        queueName: "soak",
        runtimeJobIds: ids,
        acpReady: true,
      });
      expect(proof.restartSimulated).toBe(true);
      expect(proof.allJobsClosedOutOrNeedsReview).toBe(true);
      expect(proof.jobs.find((job) => job.jobKind === "acp_transport")).toMatchObject({
        acpReadinessChecked: true,
        selectedTransport: "acp_endpoint",
      });
      expect(proof.artifactSummariesBounded).toBe(true);
    });
  });

  it("keeps model degradation fallback role-scoped and blocks false success", () => {
    expect(
      decideModelFallback({
        roleId: "test_engineer",
        failedModelId: "deepseek/deepseek-v4-pro",
        failureKind: "openrouter_http_429",
      }),
    ).toMatchObject({
      action: "fallback",
      fallbackModelId: "deepseek/deepseek-v4-flash",
      v4ProAuthorityExpanded: false,
    });
    expect(
      decideModelFallback({
        roleId: "context_scout",
        failedModelId: "deepseek/deepseek-v4-pro",
        failureKind: "empty_response",
      }),
    ).toMatchObject({
      reasonCodes: expect.arrayContaining(["v4_pro_blocked_outside_test_engineer"]),
      v4ProAuthorityExpanded: false,
      falseSuccessClaimed: false,
    });
    expect(
      decideModelFallback({
        roleId: "test_engineer",
        failedModelId: "deepseek/deepseek-v4-pro",
        failureKind: "failing_scorecard",
      }),
    ).toMatchObject({ action: "blocked" });
  });

  it("records live parallel team E2E state and surfaces it from runtime truth", async () => {
    await withRuntime(async ({ runtimeJobs, workQueue }) => {
      await runtimeJobs.enqueueJob({
        jobId: "parallel-team-job",
        jobType: "executor.agent_team",
        queueName: "parallel",
      });
      const item = await workQueue.createWorkItem({
        workItemId: "parallel-work-item",
        itemType: "execution_platform",
        title: "Parallel team E2E",
      });
      await workQueue.createWorkRun({
        workItemId: item.workItemId,
        executorKind: "runtime_job",
        runtimeJobId: "parallel-team-job",
      });
      const proof = await runLiveParallelAgentTeamE2E({
        runtimeJobs,
        runtimeJobId: "parallel-team-job",
        teamRunId: "parallel-team-run",
      });
      expect(proof).toMatchObject({
        liveQueuedSupervisorJobRan: true,
        singleWriterEnforced: true,
        securityReviewerRan: true,
        resultReviewerRan: true,
        workQueueLifecycleMutated: false,
      });
      const model = await buildWorkQueueExecutionReadModel({
        workQueue,
        runtimeJobs,
        workItemId: item.workItemId,
      });
      const summary = summarizeWorkQueueExecutionForUi(model);
      expect(summary).toMatchObject({
        uiMutationAllowed: false,
        agentTeam: expect.objectContaining({
          agentTeamRunId: "parallel-team-run",
          validationState: "passed",
          closeoutState: "present",
        }),
      });
    });
  });

  it("enforces runtime approval records before high-blast-radius authority", async () => {
    await withRuntime(async ({ runtimeJobs, workQueue }) => {
      await runtimeJobs.enqueueJob({
        jobId: "approval-job",
        jobType: "executor.agent_team",
        queueName: "approval",
      });
      const item = await workQueue.createWorkItem({
        workItemId: "approval-work-item",
        itemType: "execution_platform",
        title: "Runtime approval",
      });
      await workQueue.createWorkRun({
        workItemId: item.workItemId,
        executorKind: "runtime_job",
        runtimeJobId: "approval-job",
      });
      const validApproval = approvalFor({
        approvalId: "install-approval",
        approvalKind: "high_blast_radius_authority",
        scope: "authority:install_dependency",
        runtimeJobId: "approval-job",
      });
      expect(validateOperatorApprovalRecord(validApproval)).toMatchObject({ valid: true });
      const expired = createOperatorApprovalRecord({
        ...validApproval,
        approvalId: "expired-approval",
        expiresAt: "2026-05-02T23:00:00.000Z",
      });
      expect(
        enforceRuntimeApproval({
          authorityOrAction: "high_blast_radius_authority",
          requestedScope: "authority:install_dependency",
          approvals: [expired],
          now: new Date("2026-05-03T23:00:00.000Z"),
        }),
      ).toMatchObject({ allowed: false, reasonCodes: ["approval_expired"] });
      await runtimeJobs.attachArtifact({
        jobId: "approval-job",
        artifactType: "operator.approval_record",
        storageKind: "metadata",
        uri: "runtime-job://approval-job/operator-approval/install-approval",
        contentType: "application/json",
        metadata: validApproval as unknown as JsonValue,
      });
      const model = await buildWorkQueueExecutionReadModel({
        workQueue,
        runtimeJobs,
        workItemId: item.workItemId,
      });
      expect(model.runtimeJobs[0]?.authorityStatuses).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ artifactType: "operator.approval_record" }),
        ]),
      );
    });
  });

  it("runs high-blast-radius pilots with approvals, dry-run limits, and exact limitations", async () => {
    await withRuntime(async ({ runtimeJobs }) => {
      await runtimeJobs.enqueueJob({
        jobId: "authority-pilot-job",
        jobType: "executor.agent_team",
        queueName: "authority",
      });
      const approvals = [
        approvalFor({
          approvalId: "install-authority-approval",
          approvalKind: "high_blast_radius_authority",
          scope: "authority:install_dependency",
          runtimeJobId: "authority-pilot-job",
        }),
        approvalFor({
          approvalId: "outbound-authority-approval",
          approvalKind: "high_blast_radius_authority",
          scope: "authority:outbound_network:staged_readonly",
          runtimeJobId: "authority-pilot-job",
        }),
        approvalFor({
          approvalId: "deploy-dry-run-approval",
          approvalKind: "deploy_dry_run",
          scope: "authority:deploy_dry_run:non_production",
          runtimeJobId: "authority-pilot-job",
        }),
        approvalFor({
          approvalId: "model-promotion-dry-run-approval",
          approvalKind: "model_promotion_dry_run",
          scope: "authority:model_promotion_dry_run",
          runtimeJobId: "authority-pilot-job",
        }),
      ];
      const install = await runInstallDependencyRealAuthorityPilot({
        runtimeJobs,
        runtimeJobId: "authority-pilot-job",
        approvals,
        approveProductionDependencyMutation: true,
      });
      expect(install.productionDependencyMutationPerformed).toBe(false);
      expect(install.validationStatus).toBe("needs_review");

      const outbound = await runOutboundStagedReadonlyAuthorityPilot({
        runtimeJobs,
        runtimeJobId: "authority-pilot-job",
        approvals,
        endpointUrl: "https://staged.example.invalid/readiness",
        fetcher: async () => ({ ok: true, status: 200, text: async () => "readiness ok" }),
      });
      expect(outbound).toMatchObject({
        targetStatus: "completed",
        realExternalWriteOrSendPerformed: false,
        redactionApplied: true,
      });

      const deploy = await runDeployNonProductionRealTargetDryRun({
        runtimeJobs,
        runtimeJobId: "authority-pilot-job",
        approvals,
        targetEnvironment: "local_mock",
      });
      expect(deploy).toMatchObject({
        targetStatus: "completed",
        productionDeployPerformed: false,
      });

      const promotion = await runModelPromotionRealEvalAuthorityPilot({
        runtimeJobs,
        runtimeJobId: "authority-pilot-job",
        approvals,
        cwd: "/root/services/openclaw-roles/live",
        evalEvidenceRefs: ["package.json"],
      });
      expect(promotion).toMatchObject({
        dryRunStatus: "completed",
        productionModelPromotionPerformed: false,
        workQueueDistinguishesDryRun: true,
      });
    });
  });

  it("keeps always-on supervisor disabled by default and proves service boundary", async () => {
    const disabled = await proveAlwaysOnSupervisorBoundary({
      config: createAlwaysOnSupervisorBoundaryConfig({
        serviceModeRequested: true,
        explicitEnableFlag: false,
        enabled: true,
        operatorKillSwitch: false,
      }),
    });
    expect(disabled).toMatchObject({
      startAllowed: false,
      daemonStarted: false,
      schedulerStarted: false,
      reasonCodes: ["explicit_enable_flag_required"],
    });
    const enabled = await proveAlwaysOnSupervisorBoundary({
      config: createAlwaysOnSupervisorBoundaryConfig({
        serviceModeRequested: true,
        explicitEnableFlag: true,
        enabled: true,
        operatorKillSwitch: false,
      }),
    });
    expect(enabled).toMatchObject({
      startAllowed: true,
      killSwitchProven: true,
      duplicateClaimPrevented: true,
      retentionBoundsEnforced: true,
      daemonStarted: false,
    });
  });
});
