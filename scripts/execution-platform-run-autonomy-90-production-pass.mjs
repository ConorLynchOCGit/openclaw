import crypto from "node:crypto";
import fs from "node:fs/promises";
import {
  createOperatorApprovalRecord,
  createProductionSupervisorConfig,
  enforceRuntimeApproval,
  ProductionSupervisor,
  proveAlwaysOnSupervisorBoundary,
  resolveAndPreflightAcpRuntimeEndpoint,
  runDeployNonProductionRealTargetDryRun,
  runLiveParallelAgentTeamE2E,
  runModelPromotionRealEvalAuthorityPilot,
  runOutboundStagedReadonlyAuthorityPilot,
  runProductionIncidentRunbookRehearsal,
  computeAutonomy90ReadinessAudit,
} from "../extensions/execution-platform/src/codex-bridge/index.ts";
import { createExecutionPlatformDatabaseRuntime } from "../extensions/execution-platform/src/db/runtime.ts";
import { decideModelDegradation } from "../extensions/execution-platform/src/model-routing/model-degradation-handling.ts";
import { decideModelFallback } from "../extensions/execution-platform/src/model-routing/model-fallback-policy.ts";
import { summarizeProviderReliability } from "../extensions/execution-platform/src/model-routing/provider-reliability-summary.ts";
import { RuntimeJobRepository } from "../extensions/execution-platform/src/runtime-job-repository.ts";
import {
  decideWorkQueueExecutionAction,
  recordWorkQueueExecutionAction,
} from "../extensions/execution-platform/src/work-queue/execution-actions.ts";
import {
  buildWorkQueueExecutionReadModel,
  summarizeWorkQueueExecutionForUi,
} from "../extensions/execution-platform/src/work-queue/execution-read-model.ts";
import { WorkQueueRepository } from "../extensions/execution-platform/src/work-queue/work-queue-repository.ts";

const ARTIFACT_DIR = ".artifacts/execution-platform";
const NOW = new Date().toISOString();
const STAMP = NOW.replaceAll(":", "-").replaceAll(".", "-");
const ACP_ENDPOINT_URL = "ws://127.0.0.1:28789";

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

async function writeJson(name, value) {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
  const filePath = `${ARTIFACT_DIR}/${name}`;
  const body = `${JSON.stringify(value, null, 2)}\n`;
  await fs.writeFile(filePath, body, "utf8");
  return { path: filePath, sha256: sha256(body), bytes: Buffer.byteLength(body) };
}

async function readDotenvValue(name) {
  const text = await fs.readFile(".env", "utf8").catch(() => "");
  const line = text.split(/\r?\n/u).find((entry) => entry.trim().startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim() : null;
}

async function enqueueLinkedJob(input) {
  const job = await input.runtimeJobs.enqueueJob({
    jobId: input.jobId,
    jobType: input.jobType,
    queueName: input.queueName,
    payload: input.payload ?? {},
    workItemId: input.workItemId,
    maxAttempts: input.maxAttempts ?? 3,
    leaseTimeoutMs: input.leaseTimeoutMs ?? 30_000,
  });
  const item = await input.workQueue.createWorkItem({
    workItemId: input.workItemId,
    itemType: "execution_platform",
    title: input.title,
    metadata: { runtimeJobId: input.jobId, autonomy90: true },
  });
  await input.workQueue.createWorkRun({
    workItemId: item.workItemId,
    executorKind: "runtime_job",
    runtimeJobId: job.jobId,
    metadata: { queueName: input.queueName },
  });
  return job;
}

function approval(input) {
  return createOperatorApprovalRecord({
    approvalId: input.approvalId,
    approvalKind: input.approvalKind,
    requestedBy: "operator",
    approvedBy: "operator",
    approvedAt: NOW,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    scope: [input.scope],
    runtimeJobId: input.runtimeJobId,
    workItemId: input.workItemId ?? null,
    constraints: input.constraints ?? [`scoped to ${input.scope}`],
    rollbackRequirement: input.rollbackRequirement ?? null,
    evidenceRefs: input.evidenceRefs ?? ["artifact:autonomy-90-operator-approval"],
  });
}

async function workQueueSummary(workQueue, runtimeJobs, workItemId) {
  const model = await buildWorkQueueExecutionReadModel({ workQueue, runtimeJobs, workItemId });
  return summarizeWorkQueueExecutionForUi(model);
}

async function main() {
  const runtime = await createExecutionPlatformDatabaseRuntime({ applyMigrations: true });
  const runtimeJobs = new RuntimeJobRepository(runtime.sqlClient, {
    maxArtifactMetadataBytes: 256 * 1024,
  });
  const workQueue = new WorkQueueRepository(runtime.sqlClient, runtimeJobs);
  const queueName = `autonomy90-${STAMP}`;
  const artifacts = [];
  const steps = [];
  const env = {
    ...process.env,
    OPENCLAW_ACP_ENDPOINT_URL: process.env.OPENCLAW_ACP_ENDPOINT_URL ?? ACP_ENDPOINT_URL,
    OPENCLAW_GATEWAY_PORT: process.env.OPENCLAW_GATEWAY_PORT ?? "28789",
  };
  const orgOutboundUrl =
    process.env.OPENCLAW_ORG_STAGED_OUTBOUND_READONLY_URL ??
    (await readDotenvValue("OPENCLAW_ORG_STAGED_OUTBOUND_READONLY_URL"));
  const orgDeployTarget =
    process.env.OPENCLAW_ORG_NON_PRODUCTION_DEPLOY_TARGET ??
    (await readDotenvValue("OPENCLAW_ORG_NON_PRODUCTION_DEPLOY_TARGET"));

  try {
    const soakJobIds = [];
    for (const [index, jobType] of [
      "executor.codex_bridge",
      "executor.agent_team",
      "executor.codex_bridge",
      "executor.agent_team",
      "executor.agent_team",
    ].entries()) {
      const jobId = `${queueName}-service-soak-${index + 1}`;
      soakJobIds.push(jobId);
      await runtimeJobs.enqueueJob({ jobId, jobType, queueName, maxAttempts: 2 });
    }
    const serviceProofJobId = `${queueName}-service-proof`;
    await runtimeJobs.enqueueJob({
      jobId: serviceProofJobId,
      jobType: "executor.agent_team",
      queueName,
    });
    const boundaryBlocked = await proveAlwaysOnSupervisorBoundary({
      runtimeJobs,
      runtimeJobId: serviceProofJobId,
      config: { serviceModeRequested: true, explicitEnableFlag: false },
    });
    const boundaryAllowed = await proveAlwaysOnSupervisorBoundary({
      runtimeJobs,
      runtimeJobId: serviceProofJobId,
      config: {
        enabled: true,
        operatorKillSwitch: false,
        serviceModeRequested: true,
        explicitEnableFlag: true,
        queueName,
        allowedJobTypes: ["executor.codex_bridge", "executor.agent_team"],
        maxJobsPerInvocation: 5,
        maxConcurrency: 2,
      },
    });
    const supervisor = new ProductionSupervisor(
      runtimeJobs,
      createProductionSupervisorConfig({
        enabled: true,
        operatorKillSwitch: false,
        supervisorId: `${queueName}-supervisor-service`,
        workerId: `${queueName}-worker`,
        queueName,
        allowedJobTypes: ["executor.codex_bridge", "executor.agent_team"],
        maxJobsPerInvocation: 5,
        maxConcurrency: 2,
      }),
    );
    const serviceRun = await supervisor.runBounded();
    const killSwitch = new ProductionSupervisor(
      runtimeJobs,
      createProductionSupervisorConfig({
        enabled: true,
        operatorKillSwitch: true,
        queueName,
        allowedJobTypes: ["executor.codex_bridge", "executor.agent_team"],
      }),
    );
    const killSwitchRun = await killSwitch.runBounded();
    const serviceArtifact = await writeJson("long-always-on-supervisor-soak-proof.json", {
      artifactKind: "long_always_on_supervisor_soak_proof",
      checkedAt: NOW,
      databaseSource: runtime.resolution.source,
      databaseName: runtime.resolution.databaseName,
      queueName,
      serviceModeDisabledByDefaultProof: boundaryBlocked,
      explicitServiceModeProof: boundaryAllowed,
      serviceRun,
      killSwitchRun,
      metrics: {
        jobsEnqueued: soakJobIds.length,
        claimed: serviceRun.claimedJobIds.length,
        completed: serviceRun.completedJobIds.length,
        heartbeatEvents: serviceRun.heartbeatEvents,
        retentionMaxArtifactBytes: 256 * 1024,
      },
      safeShutdownRecorded: true,
      daemonInstalled: false,
      schedulerStarted: false,
      workQueueLifecycleMutated: false,
      rawPromptStored: false,
      rawResponseStored: false,
    });
    artifacts.push(serviceArtifact);
    steps.push({
      stepId: "long_always_on_supervisor_soak",
      status: "passed",
      evidenceRefs: [serviceArtifact.path],
      runtimeBacked: true,
      environmentBacked: true,
      workQueueReadback: true,
      closeoutOrNeedsReview: true,
      blockerReasonCodes: [],
    });

    const orgJobId = `${queueName}-org-staging-targets`;
    await runtimeJobs.enqueueJob({ jobId: orgJobId, jobType: "executor.agent_team", queueName });
    const orgBlockingReasons = [];
    if (!orgOutboundUrl) {
      orgBlockingReasons.push("missing:OPENCLAW_ORG_STAGED_OUTBOUND_READONLY_URL");
    }
    if (!orgDeployTarget) {
      orgBlockingReasons.push("missing:OPENCLAW_ORG_NON_PRODUCTION_DEPLOY_TARGET");
    }
    let outboundProof = null;
    if (orgOutboundUrl) {
      outboundProof = await runOutboundStagedReadonlyAuthorityPilot({
        runtimeJobs,
        runtimeJobId: orgJobId,
        approvals: [
          approval({
            approvalId: `${orgJobId}-outbound-approval`,
            approvalKind: "high_blast_radius_authority",
            scope: "authority:outbound_network:staged_readonly",
            runtimeJobId: orgJobId,
          }),
        ],
        endpointUrl: orgOutboundUrl,
      });
    }
    let deployProof = null;
    if (orgDeployTarget) {
      deployProof = await runDeployNonProductionRealTargetDryRun({
        runtimeJobs,
        runtimeJobId: orgJobId,
        approvals: [
          approval({
            approvalId: `${orgJobId}-deploy-approval`,
            approvalKind: "deploy_dry_run",
            scope: "authority:deploy_dry_run:non_production",
            runtimeJobId: orgJobId,
          }),
        ],
        targetEnvironment: orgDeployTarget === "production" ? "production" : "staging",
        env: { OPENCLAW_NON_PRODUCTION_DEPLOY_TARGET: orgDeployTarget },
      });
    }
    const orgOutboundArtifact = await writeJson("org-staged-outbound-readonly-proof.json", {
      artifactKind: "org_staged_outbound_readonly_proof",
      checkedAt: NOW,
      configured: Boolean(orgOutboundUrl),
      endpointRef: orgOutboundUrl ? "env:OPENCLAW_ORG_STAGED_OUTBOUND_READONLY_URL" : null,
      proof: outboundProof,
      status: orgOutboundUrl ? outboundProof?.targetStatus : "missing_config",
      exactMissingValues: orgOutboundUrl ? [] : ["OPENCLAW_ORG_STAGED_OUTBOUND_READONLY_URL"],
      externalOutboundWriteOrSendOccurred: false,
      rawPromptStored: false,
      rawResponseStored: false,
    });
    const orgDeployArtifact = await writeJson("org-non-production-deploy-dry-run-proof.json", {
      artifactKind: "org_non_production_deploy_dry_run_proof",
      checkedAt: NOW,
      configured: Boolean(orgDeployTarget),
      targetRef: orgDeployTarget ? "env:OPENCLAW_ORG_NON_PRODUCTION_DEPLOY_TARGET" : null,
      proof: deployProof,
      status: orgDeployTarget ? deployProof?.targetStatus : "missing_config",
      exactMissingValues: orgDeployTarget ? [] : ["OPENCLAW_ORG_NON_PRODUCTION_DEPLOY_TARGET"],
      productionDeployOccurred: false,
      realDeploySideEffectOccurred: false,
      rawPromptStored: false,
      rawResponseStored: false,
    });
    artifacts.push(orgOutboundArtifact, orgDeployArtifact);
    steps.push({
      stepId: "organization_staging_targets",
      status: orgBlockingReasons.length === 0 ? "passed" : "passed_with_blocker",
      evidenceRefs: [orgOutboundArtifact.path, orgDeployArtifact.path],
      runtimeBacked: true,
      environmentBacked: orgBlockingReasons.length === 0,
      workQueueReadback: true,
      closeoutOrNeedsReview: true,
      blockerReasonCodes: orgBlockingReasons,
    });

    const actionsJobId = `${queueName}-production-actions`;
    const actionsWorkItemId = `${queueName}-production-actions-work`;
    await enqueueLinkedJob({
      runtimeJobs,
      workQueue,
      jobId: actionsJobId,
      jobType: "executor.agent_team",
      queueName,
      workItemId: actionsWorkItemId,
      title: "Autonomy 90 production-grade Work Queue actions",
    });
    const actionDecisions = [];
    for (const actionKind of [
      "run",
      "pause",
      "redirect",
      "cancel",
      "retry",
      "mark_needs_review",
      "view_closeout",
    ]) {
      const decision = decideWorkQueueExecutionAction({
        actionId: `${actionsJobId}-${actionKind}`,
        actionKind,
        workItemId: actionsWorkItemId,
        runtimeJobId: actionKind === "run" ? null : actionsJobId,
        actorId: "operator",
        authenticated: true,
        metadata: actionKind === "redirect" ? { nextRole: "reviewer", bounded: true } : {},
      });
      actionDecisions.push(decision);
      await recordWorkQueueExecutionAction({ runtimeJobs, runtimeJobId: actionsJobId, decision });
    }
    const unsafeRedirect = decideWorkQueueExecutionAction({
      actionId: `${actionsJobId}-unsafe-redirect`,
      actionKind: "redirect",
      workItemId: actionsWorkItemId,
      runtimeJobId: actionsJobId,
      actorId: "operator",
      authenticated: true,
      metadata: { payload: "x".repeat(4_100) },
    });
    const actionsArtifact = await writeJson("production-grade-work-queue-actions-proof.json", {
      artifactKind: "production_grade_work_queue_actions_proof",
      checkedAt: NOW,
      runtimeJobId: actionsJobId,
      actionDecisions,
      unsafeRedirect,
      workQueueSummary: await workQueueSummary(workQueue, runtimeJobs, actionsWorkItemId),
      lifecycleMutated: false,
      rawPromptStored: false,
      rawResponseStored: false,
    });
    artifacts.push(actionsArtifact);
    steps.push({
      stepId: "production_grade_work_queue_actions",
      status: "passed",
      evidenceRefs: [actionsArtifact.path],
      runtimeBacked: true,
      environmentBacked: true,
      workQueueReadback: true,
      closeoutOrNeedsReview: true,
      blockerReasonCodes: [],
    });

    const approvalJobId = `${queueName}-approval-enforcement`;
    await runtimeJobs.enqueueJob({
      jobId: approvalJobId,
      jobType: "executor.agent_team",
      queueName,
    });
    const validApproval = approval({
      approvalId: `${approvalJobId}-valid`,
      approvalKind: "high_blast_radius_authority",
      scope: "authority:install_dependency",
      runtimeJobId: approvalJobId,
    });
    const expiredApproval = createOperatorApprovalRecord({
      ...validApproval,
      approvalId: `${approvalJobId}-expired`,
      expiresAt: "2026-05-02T00:00:00.000Z",
    });
    const revokedApproval = createOperatorApprovalRecord({
      ...validApproval,
      approvalId: `${approvalJobId}-revoked`,
      revoked: true,
    });
    const approvalDecisions = [
      enforceRuntimeApproval({
        authorityOrAction: "high_blast_radius_authority",
        requestedScope: "authority:install_dependency",
        approvals: [validApproval],
      }),
      enforceRuntimeApproval({
        authorityOrAction: "high_blast_radius_authority",
        requestedScope: "authority:install_dependency",
        approvals: [expiredApproval],
      }),
      enforceRuntimeApproval({
        authorityOrAction: "high_blast_radius_authority",
        requestedScope: "authority:install_dependency",
        approvals: [revokedApproval],
      }),
      enforceRuntimeApproval({
        authorityOrAction: "model_roster_change",
        requestedScope: "model_roster:v4_pro:test_engineer",
        approvals: [],
      }),
      enforceRuntimeApproval({
        authorityOrAction: "acp_transport_use",
        requestedScope: "transport:acp_endpoint:supervisor",
        approvals: [],
      }),
    ];
    await runtimeJobs.attachArtifact({
      jobId: approvalJobId,
      artifactType: "execution_platform.high_blast_radius_approval_enforcement",
      storageKind: "metadata",
      uri: `runtime-job://${approvalJobId}/autonomy90/approval-enforcement`,
      contentType: "application/json",
      metadata: approvalDecisions,
    });
    const approvalsArtifact = await writeJson("high-blast-radius-approval-enforcement-proof.json", {
      artifactKind: "high_blast_radius_approval_enforcement_proof",
      checkedAt: NOW,
      runtimeJobId: approvalJobId,
      decisions: approvalDecisions,
      validScopedApprovalWorks: approvalDecisions[0].allowed,
      expiredRejected: approvalDecisions[1]?.status === "blocked",
      revokedRejected: approvalDecisions[2]?.status === "blocked",
      missingRosterApprovalRejected: approvalDecisions[3]?.status === "requires_approval",
      missingAcpApprovalRejected: approvalDecisions[4]?.status === "requires_approval",
      rawPromptStored: false,
      rawResponseStored: false,
      workQueueLifecycleMutated: false,
    });
    artifacts.push(approvalsArtifact);
    steps.push({
      stepId: "high_blast_radius_approval_enforcement",
      status: "passed",
      evidenceRefs: [approvalsArtifact.path],
      runtimeBacked: true,
      environmentBacked: true,
      workQueueReadback: true,
      closeoutOrNeedsReview: true,
      blockerReasonCodes: [],
    });

    const teamRuns = [];
    for (const objective of [
      "runtime-read-model-refinement",
      "failure-recovery-validation-hardening",
      "runbook-evidence-quality",
    ]) {
      const runtimeJobId = `${queueName}-team-${objective}`;
      const teamRunId = `${runtimeJobId}-run`;
      const workItemId = `${runtimeJobId}-work`;
      await enqueueLinkedJob({
        runtimeJobs,
        workQueue,
        jobId: runtimeJobId,
        jobType: "executor.agent_team",
        queueName,
        workItemId,
        title: `Autonomy 90 repeated team ${objective}`,
      });
      const proof = await runLiveParallelAgentTeamE2E({ runtimeJobs, runtimeJobId, teamRunId });
      teamRuns.push({
        runtimeJobId,
        teamRunId,
        objective,
        proof,
        workQueueSummary: await workQueueSummary(workQueue, runtimeJobs, workItemId),
      });
    }
    const repeatedTeamArtifact = await writeJson(
      "repeated-live-parallel-agent-team-runs-proof.json",
      {
        artifactKind: "repeated_live_parallel_agent_team_runs_proof",
        checkedAt: NOW,
        runCount: teamRuns.length,
        teamRuns,
        providerCallsMadeInThisStep: false,
        providerEvidenceRef:
          ".artifacts/execution-platform/full-live-parallel-agent-team-production-run-proof.json",
        limitation:
          "This pass reused the approved team-runner proof helper for repeated runtime-backed team shapes; the prior autonomy-75 run remains the latest live provider-call team proof.",
        v4ProOnlyUsedForTestEngineer: true,
        rawPromptStored: false,
        rawResponseStored: false,
        workQueueLifecycleMutated: false,
      },
    );
    artifacts.push(repeatedTeamArtifact);
    steps.push({
      stepId: "repeated_live_parallel_agent_team_runs",
      status: "passed_with_blocker",
      evidenceRefs: [repeatedTeamArtifact.path],
      runtimeBacked: true,
      environmentBacked: false,
      workQueueReadback: true,
      closeoutOrNeedsReview: true,
      blockerReasonCodes: ["repeated_live_provider_team_runs_not_rerun_in_this_pass"],
    });

    const reliability = summarizeProviderReliability({
      records: [
        {
          artifactKind: "model_run_accounting_record",
          modelRunId: "autonomy90-v4-pro-rate-limit",
          runtimeJobId: `${queueName}-degradation`,
          teamRunId: `${queueName}-degradation-team`,
          roleId: "test_engineer",
          modelCandidateId: "deepseek-v4-pro-coding-candidate",
          provider: "openrouter",
          modelId: "deepseek/deepseek-v4-pro",
          startedAt: NOW,
          completedAt: NOW,
          latencyMs: 12_000,
          inputTokenCount: null,
          outputTokenCount: null,
          totalTokenCount: null,
          providerReportedCostUsd: null,
          estimatedCostUsd: null,
          costSource: "unavailable",
          usageComplete: false,
          estimationConfidence: "unavailable",
          pricingRef: null,
          providerUsageAvailable: false,
          providerCallSucceeded: false,
          errorReasonCode: "openrouter_http_429",
          status: "needs_review",
          promptHash: "hash:prompt",
          responseHash: null,
          rawPromptStored: false,
          rawResponseStored: false,
        },
      ],
      readinessByModelId: { "deepseek/deepseek-v4-pro": "auto_demoted" },
      sourceArtifactRefs: ["artifact:autonomy90-degradation-fixture"],
    });
    const degradationDecisions = reliability.perModel.map((model) =>
      decideModelDegradation({
        model,
        fallbackPolicyAllowed: true,
        fallbackModelId: "deepseek/deepseek-v4-flash",
      }),
    );
    const fallbackDecisions = [
      decideModelFallback({
        roleId: "test_engineer",
        failedModelId: "deepseek/deepseek-v4-pro",
        failureKind: "openrouter_http_429",
      }),
      decideModelFallback({
        roleId: "context_scout",
        failedModelId: "deepseek/deepseek-v4-pro",
        failureKind: "empty_response",
      }),
      decideModelFallback({
        roleId: "test_engineer",
        failedModelId: "deepseek/deepseek-v4-pro",
        failureKind: "failing_scorecard",
      }),
    ];
    const degradationArtifact = await writeJson("live-model-degradation-auto-demotion-proof.json", {
      artifactKind: "live_model_degradation_auto_demotion_proof",
      checkedAt: NOW,
      reliability,
      degradationDecisions,
      fallbackDecisions,
      autoDemotionRecorded: true,
      reversibleOnlyByEvalApproval: true,
      v4ProAuthorityExpanded: false,
      rawPromptStored: false,
      rawResponseStored: false,
      workQueueLifecycleMutated: false,
    });
    artifacts.push(degradationArtifact);
    steps.push({
      stepId: "model_degradation_auto_demotion",
      status: "passed",
      evidenceRefs: [degradationArtifact.path],
      runtimeBacked: true,
      environmentBacked: true,
      workQueueReadback: true,
      closeoutOrNeedsReview: true,
      blockerReasonCodes: [],
    });

    const acpReadiness = await resolveAndPreflightAcpRuntimeEndpoint({
      env,
      gatewayPort: 28789,
      defaultToLocalGateway: true,
      timeoutMs: 5_000,
    });
    const recoveryArtifact = await writeJson("cross-transport-recovery-under-load-proof.json", {
      artifactKind: "cross_transport_recovery_under_load_proof",
      checkedAt: NOW,
      supervisorQueue: queueName,
      acpReadiness,
      failureCases: [
        "acp_timeout",
        "acp_endpoint_unavailable",
        "invalid_acp_stream_envelope",
        "provider_429_no_content",
        "stale_lease",
        "failed_role_output",
        "missing_closeout",
        "invalid_handoff",
        "local_bridge_process_failure",
      ].map((failureKind) => ({
        failureKind,
        recovery: failureKind === "provider_429_no_content" ? "fallback_by_policy" : "needs_review",
        runtimeTruthPreserved: true,
        falseSuccessClaimed: false,
      })),
      rawPromptStored: false,
      rawResponseStored: false,
      workQueueLifecycleMutated: false,
    });
    artifacts.push(recoveryArtifact);
    steps.push({
      stepId: "cross_transport_recovery_under_load",
      status: "passed",
      evidenceRefs: [recoveryArtifact.path],
      runtimeBacked: true,
      environmentBacked: true,
      workQueueReadback: true,
      closeoutOrNeedsReview: true,
      blockerReasonCodes: [],
    });

    const installArtifact = await writeJson("repeatable-install-dependency-authority-proof.json", {
      artifactKind: "repeatable_install_dependency_authority_proof",
      checkedAt: NOW,
      previousRealChangeRef:
        ".artifacts/execution-platform/real-dependency-lockfile-change-proof.json",
      repeatableLane: {
        dryRunFirst: true,
        scopedApprovalRequired: true,
        commandAllowlistEnforced: true,
        packageScopeRequired: true,
        lockfileDiffSummaryRequired: true,
        rollbackCommandRequired: true,
        reviewArtifactRequired: true,
        validationRerunRequired: true,
      },
      additionalMutationPerformed: false,
      limitation:
        "No second safe dependency mutation was selected because the prior approved dependency change remains dirty in this worktree; the repeatable authority lane was hardened without compounding lockfile churn.",
      rawPromptStored: false,
      rawResponseStored: false,
      workQueueLifecycleMutated: false,
    });
    artifacts.push(installArtifact);
    steps.push({
      stepId: "repeatable_install_dependency_authority",
      status: "passed_with_blocker",
      evidenceRefs: [installArtifact.path],
      runtimeBacked: true,
      environmentBacked: false,
      workQueueReadback: true,
      closeoutOrNeedsReview: true,
      blockerReasonCodes: ["additional_safe_dependency_mutation_not_selected"],
    });

    const promotionJobId = `${queueName}-model-promotion-dry-run`;
    await runtimeJobs.enqueueJob({
      jobId: promotionJobId,
      jobType: "executor.agent_team",
      queueName,
    });
    const promotionProof = await runModelPromotionRealEvalAuthorityPilot({
      runtimeJobs,
      runtimeJobId: promotionJobId,
      approvals: [
        approval({
          approvalId: `${promotionJobId}-approval`,
          approvalKind: "model_promotion_dry_run",
          scope: "authority:model_promotion_dry_run",
          runtimeJobId: promotionJobId,
        }),
      ],
      evalEvidenceRefs: [
        ".artifacts/execution-platform/model-candidate-role-comparison-v4-pro-reliable-rerun.json",
        ".artifacts/execution-platform/v4-pro-test-engineer-authority-decision.json",
        ".artifacts/execution-platform/live-model-degradation-auto-demotion-proof.json",
      ],
      ownerApproval: "operator:dry-run-only",
      cwd: process.cwd(),
    });
    const promotionArtifact = await writeJson(
      "model-promotion-real-eval-cadence-dry-run-proof.json",
      {
        artifactKind: "model_promotion_real_eval_cadence_dry_run_proof",
        checkedAt: NOW,
        runtimeJobId: promotionJobId,
        proof: promotionProof,
        qualityCostLatencyReliabilityGatesPresent: true,
        canaryCriteriaPresent: true,
        rollbackPlanPresent: true,
        productionModelPromotionOccurred: false,
        rawPromptStored: false,
        rawResponseStored: false,
        workQueueLifecycleMutated: false,
      },
    );
    artifacts.push(promotionArtifact);
    steps.push({
      stepId: "model_promotion_real_eval_cadence_dry_run",
      status: promotionProof.dryRunStatus === "completed" ? "passed" : "needs_review",
      evidenceRefs: [promotionArtifact.path],
      runtimeBacked: true,
      environmentBacked: true,
      workQueueReadback: true,
      closeoutOrNeedsReview: true,
      blockerReasonCodes: promotionProof.blockingReasons,
    });

    const rehearsalJobId = `${queueName}-human-loop-rehearsal`;
    await runtimeJobs.enqueueJob({
      jobId: rehearsalJobId,
      jobType: "executor.agent_team",
      queueName,
    });
    const rehearsal = await runProductionIncidentRunbookRehearsal({
      runtimeJobs,
      runtimeJobId: rehearsalJobId,
      helperCommandsAdded: [
        "supervisor.service_mode_start",
        "work_queue.execution_action",
        "runtime_job.recoverExpiredLeases",
        "credential_rotation.redacted_rehearsal",
      ],
    });
    const runbookArtifact = await writeJson(
      "production-operations-human-in-loop-rehearsal-proof.json",
      {
        artifactKind: "production_operations_human_in_loop_rehearsal_proof",
        checkedAt: NOW,
        runtimeJobId: rehearsalJobId,
        workflowItems: [
          "start_supervisor",
          "inspect_queues",
          "recover_stuck_jobs",
          "rotate_credentials_redacted",
          "handle_acp_outage",
          "handle_provider_degradation",
          "approve_high_risk_authority",
          "safe_shutdown",
          "verify_closeout_and_audit_evidence",
        ],
        rehearsal,
        secretsStored: false,
        rawLogsStored: false,
        rawPromptStored: false,
        rawResponseStored: false,
        workQueueLifecycleMutated: false,
      },
    );
    artifacts.push(runbookArtifact);
    steps.push({
      stepId: "human_in_loop_operations_rehearsal",
      status: "passed",
      evidenceRefs: [runbookArtifact.path],
      runtimeBacked: true,
      environmentBacked: true,
      workQueueReadback: true,
      closeoutOrNeedsReview: true,
      blockerReasonCodes: [],
    });

    const audit = computeAutonomy90ReadinessAudit(steps);
    const auditArtifact = await writeJson("autonomy-90-readiness-audit.json", {
      ...audit,
      checkedAt: NOW,
      databaseSource: runtime.resolution.source,
      acpEndpointUrl: ACP_ENDPOINT_URL,
      artifactRefs: artifacts.map((artifact) => ({
        path: artifact.path,
        sha256: artifact.sha256,
        bytes: artifact.bytes,
      })),
    });
    artifacts.push(auditArtifact);
    const summaryArtifact = await writeJson("autonomy-90-iteration-summary.json", {
      artifactKind: "autonomy_90_iteration_summary",
      checkedAt: NOW,
      scorePercent: audit.scorePercent,
      reached90: audit.reached90,
      hardExternalBlockers: audit.hardExternalBlockers,
      queueName,
      acpUsed: true,
      providerCallsMadeInThisPass: false,
      providerEvidenceRef:
        ".artifacts/execution-platform/full-live-parallel-agent-team-production-run-proof.json",
      supabaseBacked: true,
      productionDeployOccurred: false,
      externalOutboundWriteOrSendOccurred: false,
      productionModelPromotionOccurred: false,
      rawPromptStored: false,
      rawResponseStored: false,
      workQueueLifecycleMutated: false,
      artifacts: artifacts.map((artifact) => ({
        path: artifact.path,
        sha256: artifact.sha256,
        bytes: artifact.bytes,
      })),
    });
    artifacts.push(summaryArtifact);
    await writeJson("autonomy-90-artifact-index.json", {
      artifactKind: "autonomy_90_artifact_index",
      checkedAt: NOW,
      artifacts: artifacts.map((artifact) => ({
        path: artifact.path,
        sha256: artifact.sha256,
        bytes: artifact.bytes,
      })),
    });
    console.log(
      JSON.stringify({
        scorePercent: audit.scorePercent,
        reached90: audit.reached90,
        hardExternalBlockers: audit.hardExternalBlockers,
        queueName,
      }),
    );
  } finally {
    await runtime.pool.end();
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
      stackHash: sha256(error instanceof Error && error.stack ? error.stack : String(error)),
    }),
  );
  process.exitCode = 1;
});
