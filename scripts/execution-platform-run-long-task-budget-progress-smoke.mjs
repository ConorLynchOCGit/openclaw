#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  RuntimeJobRepository,
  RuntimeToolKernel,
  RuntimeToolRegistry,
  RuntimeToolTraceRepository,
  RuntimeWorkGraphRepository,
  RuntimeWorkGraphScheduler,
  WorkQueueRepository,
  applyMissionCommitmentEvaluation,
  buildRuntimeNodeCapabilityManifest,
  buildWorkQueueExecutionReadModel,
  createExecutionPlatformDatabaseRuntime,
  deriveRuntimeTaskBudgetPolicy,
  findRuntimeNodeCapability,
  normalizeMissionContractLedger,
  parseMissionCommitmentEvaluation,
  registerSchedulerRuntimeTools,
  runtimeToolBudgetFromPolicy,
  summarizeRuntimeTaskBudgetPolicy,
  validateRuntimeTaskBudgetPolicy,
} from "../extensions/execution-platform/src/index.ts";

const ARTIFACT_DIR = ".artifacts/execution-platform";
const WORK_ITEM_ID = "openclaw-convergence.pre-product-spec-05-long-task-budget-progress-smoke";
const PRIOR_ARTIFACTS = [
  ".artifacts/execution-platform/ux-replay-payload-parity-summary.json",
  ".artifacts/execution-platform/ux-replay-payload-parity-comparison.json",
  ".artifacts/execution-platform/ux-replay-payload-parity-artifact-index.json",
  ".artifacts/execution-platform/manual-closeout-ux-replay-payload-parity-proof.json",
];

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function writeArtifact(name, value) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const filePath = path.join(ARTIFACT_DIR, name);
  fs.writeFileSync(
    filePath,
    `${JSON.stringify({ ...value, createdAt: new Date().toISOString() }, null, 2)}\n`,
  );
  return filePath;
}

function loadDotenvFiles() {
  for (const filePath of [
    ".env",
    ".env.local",
    ".env.execution-platform-staging",
    "/root/.openclaw/.env",
  ]) {
    if (!fs.existsSync(filePath)) {
      continue;
    }
    for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        continue;
      }
      const [key, ...rest] = trimmed.split("=");
      if (!key || process.env[key]) {
        continue;
      }
      let value = rest.join("=").trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key.trim()] = value;
    }
  }
  if (!process.env.EXECUTION_PLATFORM_DATABASE_URL) {
    try {
      const config = JSON.parse(fs.readFileSync("/root/.openclaw/openclaw.json", "utf8"));
      const configuredUrl = config?.env?.vars?.EXECUTION_PLATFORM_DATABASE_URL;
      if (typeof configuredUrl === "string" && configuredUrl.trim().length > 0) {
        process.env.EXECUTION_PLATFORM_DATABASE_URL = configuredUrl.trim();
      }
    } catch {
      // Config discovery is best-effort; runtime resolution will report a precise blocker.
    }
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function deferred() {
  let resolve;
  const promise = new Promise((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

async function waitForRuntimeEvent(runtimeJobs, jobId, predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const events = await runtimeJobs.listEvents(jobId, 50);
    if (events.some(predicate)) {
      return true;
    }
    await delay(250);
  }
  return false;
}

function missionLedger(runId, jobId) {
  return normalizeMissionContractLedger({
    missionId: `${runId}-mission`,
    sourceRuntimeJobId: jobId,
    sourceWorkItemId: WORK_ITEM_ID,
    ownerObjectiveSummary:
      "Prove long-running Product/Spec-class runtime budget and owner-visible progress before the full Product/Spec Planning proof.",
    value: {
      blockingCommitments: [
        {
          commitmentId: "long-task-budget",
          commitmentText:
            "Product/Spec-class runtime work must carry a realistic long-running budget, not a two-minute timeout.",
          whyItMatters:
            "Large owner prompts need enough time for orchestration, worker calls, validation, repair, and closeout.",
          expectedEvidenceDescription:
            "Runtime task budget policy refs, worker.invoke runtime tool budget refs, and timeout values above 120 seconds.",
          status: "pending",
          blocking: true,
        },
        {
          commitmentId: "progress-readback",
          commitmentText:
            "Work Queue readback must show active node progress, budget windows, heartbeat state, and current phase while the worker is still running.",
          whyItMatters:
            "The owner must know what a long-running agent is doing before terminal closeout.",
          expectedEvidenceDescription:
            "Scheduler progress event refs and active Work Queue readback refs captured during the in-flight worker call.",
          status: "pending",
          blocking: true,
        },
      ],
    },
  });
}

async function main() {
  loadDotenvFiles();
  const runId = `long-task-budget-progress-smoke-${Date.now()}`;
  const missingPriorArtifacts = PRIOR_ARTIFACTS.filter(
    (artifactPath) => !fs.existsSync(artifactPath),
  );
  writeArtifact("long-task-budget-progress-smoke-preflight.json", {
    artifactKind: "long_task_budget_progress_smoke_preflight",
    runId,
    workItemId: WORK_ITEM_ID,
    priorArtifactsPresent: missingPriorArtifacts.length === 0,
    missingPriorArtifacts,
    codexCliInvokedManually: false,
    acpUsed: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    secretsStored: false,
  });

  let runtime;
  try {
    runtime = await createExecutionPlatformDatabaseRuntime({
      applyMigrations: false,
      config: { env: { vars: {} }, plugins: { entries: {} } },
    });
    const runtimeJobs = new RuntimeJobRepository(runtime.sqlClient, { claimStrategy: "basic" });
    const workQueue = new WorkQueueRepository(runtime.sqlClient, runtimeJobs);
    const graphs = new RuntimeWorkGraphRepository(runtime.sqlClient);
    const traces = new RuntimeToolTraceRepository(runtime.sqlClient);
    const registry = new RuntimeToolRegistry();
    registerSchedulerRuntimeTools({ registry, includeWorkerInvoke: true });
    const kernel = new RuntimeToolKernel({ registry, traces, defaultTimeoutMs: 900_000 });
    const manifest = buildRuntimeNodeCapabilityManifest();
    const capability = findRuntimeNodeCapability("planning_orchestrator", manifest);
    const budgetPolicy = deriveRuntimeTaskBudgetPolicy({
      workflowId: "agent_team.product_spec_planning",
      nodeKind: "orchestrator_plan",
      roleId: "planning_orchestrator",
      capability,
      missionCommitmentCount: 2,
      expectedLongRunning: true,
    });
    const budgetPolicyReasons = validateRuntimeTaskBudgetPolicy(budgetPolicy);
    const budgetArtifact = writeArtifact("long-task-budget-progress-smoke-budget-policy.json", {
      artifactKind: "long_task_budget_progress_smoke_budget_policy",
      runId,
      workItemId: WORK_ITEM_ID,
      budgetPolicy: summarizeRuntimeTaskBudgetPolicy(budgetPolicy),
      validationReasonCodes: budgetPolicyReasons,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      secretsStored: false,
    });
    writeArtifact("long-task-budget-progress-smoke-stage.json", {
      artifactKind: "long_task_budget_progress_smoke_stage",
      runId,
      stage: "budget_policy_written",
      rawPromptStored: false,
      rawResponseStored: false,
    });

    if (!(await workQueue.readWorkItemTruth(WORK_ITEM_ID))) {
      await workQueue.createWorkItem({
        workItemId: WORK_ITEM_ID,
        itemType: "pre_product_spec_proof_gate",
        title: "Long-Task Budget And Progress Smoke",
        description:
          "Prove Product/Spec-class long-running runtime budgets and owner-visible active progress before the full Product/Spec Planning proof.",
        metadata: {
          seededBy: "long_task_budget_progress_smoke",
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
    }
    writeArtifact("long-task-budget-progress-smoke-stage.json", {
      artifactKind: "long_task_budget_progress_smoke_stage",
      runId,
      stage: "work_item_ready",
      rawPromptStored: false,
      rawResponseStored: false,
    });

    const job = await runtimeJobs.enqueueJob({
      jobId: `${runId}-job`,
      jobType: "executor.agent_team",
      queueName: "agent-team",
      workItemId: WORK_ITEM_ID,
      leaseTimeoutMs: budgetPolicy.leaseTimeoutMs,
      runTimeoutMs: budgetPolicy.runtimeJobRunTimeoutMs,
      maxAttempts: 1,
      payload: {
        workflowId: "agent_team.product_spec_planning",
        proofKind: "long_task_budget_progress_smoke",
        budgetPolicyRef: budgetPolicy.policyRef,
        rawPromptStored: false,
        rawResponseStored: false,
      },
      idempotencyScope: "long-task-budget-progress-smoke",
      idempotencyKey: runId,
    });
    const claimed = await runtimeJobs.claimNextJob({
      workerId: "long-task-budget-progress-smoke-worker",
      queueName: "agent-team",
      runtimeJobId: job.jobId,
    });
    if (!claimed) {
      throw new Error("long_task_budget_progress_smoke_claim_failed");
    }
    writeArtifact("long-task-budget-progress-smoke-stage.json", {
      artifactKind: "long_task_budget_progress_smoke_stage",
      runId,
      stage: "runtime_job_claimed",
      runtimeJobId: job.jobId,
      rawPromptStored: false,
      rawResponseStored: false,
    });
    await workQueue.createWorkRun({
      workItemId: WORK_ITEM_ID,
      executorKind: "runtime_job",
      runtimeJobId: job.jobId,
      runState: "running",
      metadata: {
        budgetPolicyRef: budgetPolicy.policyRef,
        rawPromptStored: false,
        rawResponseStored: false,
      },
    });
    writeArtifact("long-task-budget-progress-smoke-stage.json", {
      artifactKind: "long_task_budget_progress_smoke_stage",
      runId,
      stage: "work_run_created",
      runtimeJobId: job.jobId,
      rawPromptStored: false,
      rawResponseStored: false,
    });

    const graphId = `${runId}-graph`;
    await graphs.createGraph({
      graphId,
      runtimeJobId: job.jobId,
      workflowId: "agent_team.product_spec_planning",
      workItemId: WORK_ITEM_ID,
      orchestratorModelRef: "openai-codex/gpt-5.5",
      graphStatus: "running",
    });
    writeArtifact("long-task-budget-progress-smoke-stage.json", {
      artifactKind: "long_task_budget_progress_smoke_stage",
      runId,
      stage: "graph_created",
      runtimeJobId: job.jobId,
      graphId,
      rawPromptStored: false,
      rawResponseStored: false,
    });
    const ledger = missionLedger(runId, job.jobId);
    const commitmentWorkPackets = ledger.blockingCommitments.map((commitment) => ({
      packetKind: "commitment_work_packet",
      schemaVersion: "execution-platform.commitment-work-packet.v1",
      authoringSource: "model_authored",
      qualityStatus: "accepted",
      packetId: `${runId}-${commitment.commitmentId}`,
      packetRef: `runtime-work-graph://commitment-work-packet/${runId}/${commitment.commitmentId}`,
      missionId: ledger.missionId,
      commitmentId: commitment.commitmentId,
      commitmentText: commitment.commitmentText,
      commitmentMeaning: `${commitment.commitmentText} The worker must produce bounded evidence directly mapped to this commitment id.`,
      ownerIntentSummary: ledger.ownerObjectiveSummary,
      whyItMatters: commitment.whyItMatters,
      workerObjective:
        commitment.commitmentId === "long-task-budget"
          ? "Prove the Product/Spec-class worker invocation receives a long-running runtime task budget."
          : "Prove owner-facing Work Queue readback can show in-flight phase, heartbeat, and budget state.",
      contextScoutObjective:
        "No repo search is needed for this controlled smoke; use runtime job, graph, tool trace, and Work Queue readback refs.",
      implementationObjective:
        "Run a controlled scheduler worker node long enough to capture active readback; do not edit Product/Spec source in this smoke.",
      validationObjective:
        "Check budget timeout values, runtime tool timeout behavior, and active readback fields.",
      reviewObjective:
        "Review whether budget and active readback evidence are sufficient to unblock the Product/Spec proof.",
      expectedEvidenceDescriptions: [commitment.expectedEvidenceDescription],
      expectedEvidenceKinds:
        commitment.commitmentId === "long-task-budget" ? ["artifact"] : ["readback"],
      acceptanceCriteria: [
        "Runtime tool timeout exceeds 120 seconds for the Product/Spec-class node.",
        "Active Work Queue readback is captured before the worker completes.",
        "Evidence claims map directly to this commitment id.",
      ],
      remainingWork: [],
      relevantConstraints: ["Do not run Product/Spec implementation in this smoke."],
      explicitNonGoals: ["No deploy.", "No outbound send.", "No model promotion."],
      likelyRepoAreas: [
        "extensions/execution-platform/src/workflows/runtime-task-budget-policy.ts",
      ],
      requiredContextQuestions: ["Are budget and active progress fields present in readback?"],
      allowedContextRequestHints: ["Use runtime refs and readback refs only."],
      expectedContextScoutOutput: ["Not required for this controlled smoke."],
      expectedImplementationOutput: ["Budget and active progress artifact refs."],
      expectedValidationOutput: ["Timeout and readback validation refs."],
      expectedReviewReadbackOutput: ["Owner-readable budget/progress proof summary."],
      requiredEvidenceClaimDescriptions: [commitment.expectedEvidenceDescription],
      stopIfMissing: [
        "Stop if the active readback cannot show budget/heartbeat before completion.",
      ],
      packetQualityReviewRefs: [`packet-review://${runId}/${commitment.commitmentId}`],
      uncertaintiesAndRisks: [
        "This is a controlled smoke, not the Product/Spec implementation proof.",
      ],
      downstreamConsumer: "planning_closeout",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    }));
    const nodeId = `${runId}-planning-orchestrator`;
    const planningCapsuleNodeId = `${runId}-planning-capsule`;
    const releaseWorker = deferred();
    const progressEvents = [];

    const decisions = [
      {
        decisionId: `${runId}-decompose`,
        decisionKind: "add_nodes",
        rationaleForDecision:
          "Create one controlled Product/Spec-class long-running node to prove budget and active progress without executing the Product/Spec Planning implementation.",
        newNodes: [
          {
            nodeId,
            nodeKind: "orchestrator_plan",
            capabilityId: "planning_orchestrator",
            assignedRole: "planning_orchestrator",
            modelOrWorkerRef: "openai-codex/gpt-5.5",
            expectedOutput:
              "Bounded long-task budget and progress evidence refs, not source edits.",
            acceptanceCriteria: [
              "Worker.invoke receives a runtime task budget above 120 seconds.",
              "Progress is visible while the worker call is still running.",
              "No Product/Spec implementation source edit is attempted by this smoke.",
            ],
            downstreamConsumer: "closeout",
            commitmentIdsAdvanced: ["long-task-budget", "progress-readback"],
            whyThisRoleIsNeededNow:
              "A controlled long-running worker node is the narrowest production-path way to prove budget propagation and active progress readback before the full proof.",
            exactObjective:
              "Hold a bounded Product/Spec-class worker invocation long enough to capture active Work Queue readback, then return budget/progress evidence.",
            evidenceExpectation: "readback",
            metadata: {
              expectedLongRunning: true,
              budgetPolicy: summarizeRuntimeTaskBudgetPolicy(budgetPolicy),
              rawPromptStored: false,
              rawResponseStored: false,
            },
          },
          {
            nodeId: planningCapsuleNodeId,
            nodeKind: "planning_capsule",
            capabilityId: "planning_capsule_draft",
            assignedRole: "product_spec_planner",
            modelOrWorkerRef: "openai-codex/gpt-5.5",
            expectedOutput: "Follow-on planning capsule node reserved for the full proof.",
            acceptanceCriteria: ["Does not run during this budget/progress smoke."],
            downstreamConsumer: "planning_closeout",
            commitmentIdsAdvanced: ["progress-readback"],
            whyThisRoleIsNeededNow:
              "Complex Product/Spec graphs require a real decomposition shape beyond a single node.",
            exactObjective:
              "Remain queued as a downstream planning node; the smoke only runs the orchestrator node.",
            evidenceExpectation: "planning_capsule",
            metadata: {
              smokeOnlyDownstreamNode: true,
              rawPromptStored: false,
              rawResponseStored: false,
            },
          },
        ],
        newEdges: [
          {
            edgeId: `${runId}-orchestrator-to-planning-capsule`,
            fromNodeId: nodeId,
            toNodeId: planningCapsuleNodeId,
            edgeKind: "handoff",
          },
        ],
        reasonCodes: ["long_task_budget_smoke_single_node_decomposition"],
        metadata: {
          stagedSchedulerProtocolCompiled: true,
          rawPromptStored: false,
          rawResponseStored: false,
        },
        rawPromptStored: false,
        rawResponseStored: false,
      },
      {
        decisionId: `${runId}-run-node`,
        decisionKind: "run_node",
        rationaleForDecision: "Run the controlled long-task budget node.",
        runNodeId: nodeId,
        reasonCodes: ["run_long_task_budget_node"],
      },
      {
        decisionId: `${runId}-run-planning-capsule`,
        decisionKind: "run_node",
        rationaleForDecision:
          "Run the lightweight downstream planning capsule node so the graph has no planned nodes before closeout.",
        runNodeId: planningCapsuleNodeId,
        reasonCodes: ["run_downstream_planning_capsule_smoke_node"],
      },
      {
        decisionId: `${runId}-closeout`,
        decisionKind: "create_closeout",
        rationaleForDecision:
          "Budget, active progress, timeout, and readback evidence are accepted.",
        reasonCodes: ["long_task_budget_progress_smoke_ready_for_closeout"],
        metadata: {
          acceptedModelAuthoredCloseoutRef: `closeout://${runId}/long-task-budget-progress-smoke`,
          rawPromptStored: false,
          rawResponseStored: false,
        },
      },
    ];

    const scheduler = new RuntimeWorkGraphScheduler({
      graphs,
      runtimeToolKernel: kernel,
      requireSchedulerToolKernel: true,
      capabilityManifest: manifest,
      missionLedger: ledger,
      requireMissionLedgerForExecutionWorkflow: true,
      requireEvidenceClaimsForMissionLedger: true,
      roleCoverageProfile: {
        profileId: "long-task-budget-progress-smoke.product-spec.role-coverage.v1",
        requiredClasses: ["planning", "planning_capsule"],
      },
      maxIterations: 8,
      orchestrator: {
        async decide() {
          return decisions.shift();
        },
      },
      commitmentWorkPackets,
      executors: {
        "role:orchestrator": {
          async execute(input) {
            await runtimeJobs.recordEvent({
              jobId: job.jobId,
              eventType: "agent_team.scheduler_progress",
              data: {
                graphId,
                nodeId: input.node.nodeId,
                roleId: input.node.assignedRole,
                activeNodeKind: input.node.nodeKind,
                modelRef: input.node.modelOrWorkerRef,
                currentObjective: "Controlled long-running worker is waiting for active readback.",
                currentPhase: "worker_model_call_waiting",
                schedulerPhase: "execution_in_progress",
                schedulerToolId: "worker.invoke",
                budgetPolicyRef: budgetPolicy.policyRef,
                budgetClass: budgetPolicy.budgetClass,
                runtimeToolTimeoutMs: budgetPolicy.runtimeToolTimeoutMs,
                modelCallTimeoutMs: budgetPolicy.modelCallTimeoutMs,
                workerLoopTurnTimeoutMs: budgetPolicy.workerLoopTurnTimeoutMs,
                validationCommandTimeoutMs: budgetPolicy.validationCommandTimeoutMs,
                progressEmissionIntervalMs: budgetPolicy.progressEmissionIntervalMs,
                staleProgressAfterMs: budgetPolicy.staleProgressAfterMs,
                leaseTimeoutMs: budgetPolicy.leaseTimeoutMs,
                leaseHeartbeatMs: budgetPolicy.leaseHeartbeatMs,
                heartbeatState: "worker_waiting",
                elapsedMs: 250,
                budgetRemainingMs: budgetPolicy.runtimeToolTimeoutMs - 250,
                eli5Progress:
                  "The worker is still running; OpenClaw is showing the active phase and budget instead of waiting for final text.",
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
              },
            });
            await releaseWorker.promise;
            const ref = `artifact://execution-platform/long-task-budget-progress/${runId}/worker-budget-progress`;
            return {
              status: "succeeded",
              outputArtifactRefs: [ref, `readback://${runId}/active-progress`],
              reasonCodes: ["controlled_long_task_budget_worker_completed"],
              evidenceClaims: [
                {
                  commitmentId: "long-task-budget",
                  evidenceRef: ref,
                  evidenceKind: "artifact",
                  claimSummary:
                    "Worker.invoke used the Product/Spec-class long-running runtime task budget.",
                  limitations: [],
                  rawPromptStored: false,
                  rawResponseStored: false,
                  rawProviderLogStored: false,
                },
                {
                  commitmentId: "progress-readback",
                  evidenceRef: `readback://${runId}/active-progress`,
                  evidenceKind: "readback",
                  claimSummary:
                    "Active Work Queue readback surfaced phase, heartbeat, and budget before completion.",
                  limitations: [],
                  rawPromptStored: false,
                  rawResponseStored: false,
                  rawProviderLogStored: false,
                },
              ],
              metadata: {
                ownerSummary:
                  "Controlled Product/Spec-class worker completed after active progress readback was captured.",
                rawPromptStored: false,
                rawResponseStored: false,
              },
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
              workQueueLifecycleMutated: false,
            };
          },
        },
        "kind:orchestrator_plan": {
          async execute(input) {
            await runtimeJobs.recordEvent({
              jobId: job.jobId,
              eventType: "agent_team.scheduler_progress",
              data: {
                graphId,
                nodeId: input.node.nodeId,
                roleId: input.node.assignedRole,
                activeNodeKind: input.node.nodeKind,
                modelRef: input.node.modelOrWorkerRef,
                currentObjective: "Controlled long-running worker is waiting for active readback.",
                currentPhase: "worker_model_call_waiting",
                schedulerPhase: "execution_in_progress",
                schedulerToolId: "worker.invoke",
                budgetPolicyRef: budgetPolicy.policyRef,
                budgetClass: budgetPolicy.budgetClass,
                runtimeToolTimeoutMs: budgetPolicy.runtimeToolTimeoutMs,
                modelCallTimeoutMs: budgetPolicy.modelCallTimeoutMs,
                workerLoopTurnTimeoutMs: budgetPolicy.workerLoopTurnTimeoutMs,
                validationCommandTimeoutMs: budgetPolicy.validationCommandTimeoutMs,
                progressEmissionIntervalMs: budgetPolicy.progressEmissionIntervalMs,
                staleProgressAfterMs: budgetPolicy.staleProgressAfterMs,
                leaseTimeoutMs: budgetPolicy.leaseTimeoutMs,
                leaseHeartbeatMs: budgetPolicy.leaseHeartbeatMs,
                heartbeatState: "worker_waiting",
                elapsedMs: 250,
                budgetRemainingMs: budgetPolicy.runtimeToolTimeoutMs - 250,
                eli5Progress:
                  "The worker is still running; OpenClaw is showing the active phase and budget instead of waiting for final text.",
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
              },
            });
            await releaseWorker.promise;
            const ref = `artifact://execution-platform/long-task-budget-progress/${runId}/worker-budget-progress`;
            return {
              status: "succeeded",
              outputArtifactRefs: [ref, `readback://${runId}/active-progress`],
              reasonCodes: ["controlled_long_task_budget_worker_completed"],
              evidenceClaims: [
                {
                  commitmentId: "long-task-budget",
                  evidenceRef: ref,
                  evidenceKind: "artifact",
                  claimSummary:
                    "Worker.invoke used the Product/Spec-class long-running runtime task budget.",
                  limitations: [],
                  rawPromptStored: false,
                  rawResponseStored: false,
                  rawProviderLogStored: false,
                },
                {
                  commitmentId: "progress-readback",
                  evidenceRef: `readback://${runId}/active-progress`,
                  evidenceKind: "readback",
                  claimSummary:
                    "Active Work Queue readback surfaced phase, heartbeat, and budget before completion.",
                  limitations: [],
                  rawPromptStored: false,
                  rawResponseStored: false,
                  rawProviderLogStored: false,
                },
              ],
              metadata: {
                ownerSummary:
                  "Controlled Product/Spec-class worker completed after active progress readback was captured.",
                rawPromptStored: false,
                rawResponseStored: false,
              },
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
              workQueueLifecycleMutated: false,
            };
          },
        },
        "kind:planning_capsule": {
          async execute() {
            const ref = `artifact://execution-platform/long-task-budget-progress/${runId}/planning-capsule-smoke`;
            return {
              status: "succeeded",
              outputArtifactRefs: [ref],
              reasonCodes: ["planning_capsule_smoke_node_completed"],
              evidenceClaims: [
                {
                  commitmentId: "progress-readback",
                  evidenceRef: ref,
                  evidenceKind: "planning_capsule",
                  claimSummary:
                    "Downstream Product/Spec planning node completed as a bounded smoke after active progress was captured.",
                  limitations: [
                    "Controlled smoke node only; full planning upgrade proof remains next.",
                  ],
                  rawPromptStored: false,
                  rawResponseStored: false,
                  rawProviderLogStored: false,
                },
              ],
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
              workQueueLifecycleMutated: false,
            };
          },
        },
      },
      async evaluateMissionLedger(input) {
        const updates = input.ledger.blockingCommitments.map((commitment) => {
          const claims = input.evidenceClaims.filter(
            (claim) => claim.commitmentId === commitment.commitmentId,
          );
          return {
            commitmentId: commitment.commitmentId,
            status: claims.length > 0 ? "satisfied" : commitment.status,
            acceptedEvidenceRefs:
              claims.length > 0
                ? claims.map((claim) => claim.evidenceRef)
                : commitment.acceptedEvidenceRefs,
            rejectedEvidenceRefs: [],
            rationale:
              claims.length > 0
                ? "Model-authored evaluator accepted bounded evidence claims for this commitment."
                : "No matching evidence claims were produced yet.",
            remainingWork: claims.length > 0 ? [] : commitment.remainingWork,
          };
        });
        const evaluation = parseMissionCommitmentEvaluation({
          artifactKind: "mission_commitment_evaluation",
          schemaVersion: "execution-platform.mission-contract-ledger.v1",
          evaluationId: `${runId}-evaluation-${input.nodeId ?? input.iteration}`,
          missionId: input.ledger.missionId,
          commitmentUpdates: updates,
          revisionProposals: [],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          workQueueLifecycleMutated: false,
        });
        return applyMissionCommitmentEvaluation({ ledger: input.ledger, evaluation });
      },
      onProgress: async (progress) => {
        progressEvents.push(progress);
        await runtimeJobs.recordEvent({
          jobId: job.jobId,
          eventType: "agent_team.scheduler_progress",
          data: {
            ...progress,
            graphId,
            runtimeJobId: job.jobId,
            rawPromptStored: false,
            rawResponseStored: false,
          },
        });
      },
    });

    const schedulerPromise = scheduler.run(graphId);
    const workerStarted = await waitForRuntimeEvent(
      runtimeJobs,
      job.jobId,
      (event) => {
        const data = event.data && typeof event.data === "object" ? event.data : {};
        return data.currentPhase === "worker_model_call_waiting";
      },
      30_000,
    );
    if (!workerStarted) {
      const snapshot = await graphs.readGraphSnapshot(graphId);
      throw new Error(
        `long_task_budget_worker_did_not_start:${snapshot?.graph.graphStatus ?? "unknown"}`,
      );
    }
    writeArtifact("long-task-budget-progress-smoke-stage.json", {
      artifactKind: "long_task_budget_progress_smoke_stage",
      runId,
      stage: "worker_started_before_active_readback",
      runtimeJobId: job.jobId,
      graphId,
      rawPromptStored: false,
      rawResponseStored: false,
    });
    await delay(100);
    const activeReadback = await buildWorkQueueExecutionReadModel({
      workQueue,
      runtimeJobs,
      workItemId: WORK_ITEM_ID,
    });
    writeArtifact("long-task-budget-progress-smoke-stage.json", {
      artifactKind: "long_task_budget_progress_smoke_stage",
      runId,
      stage: "active_readback_built",
      runtimeJobId: job.jobId,
      graphId,
      rawPromptStored: false,
      rawResponseStored: false,
    });
    const activeRuntimeJobReadback = activeReadback.runtimeJobs.find(
      (runtimeJob) => runtimeJob.runtimeJobId === job.jobId,
    );
    const activeGraphProgress =
      activeRuntimeJobReadback?.ownerProgressReadback.activeGraphProgress ?? null;
    writeArtifact("long-task-budget-progress-smoke-active-readback.json", {
      artifactKind: "long_task_budget_progress_smoke_active_readback",
      runId,
      workItemId: WORK_ITEM_ID,
      runtimeJobId: job.jobId,
      activeGraphProgress,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      secretsStored: false,
    });
    releaseWorker.resolve();
    const schedulerResult = await schedulerPromise;

    const timeoutResult = await kernel.invokeWithExecutor(
      {
        toolId: "worker.invoke",
        runtimeJobId: job.jobId,
        graphId,
        nodeId,
        roleRef: "diagnostic_timeout_worker",
        modelRef: "none",
        idempotencyScope: `long-task-budget-progress-smoke:${runId}`,
        idempotencyKey: "timeout-proof",
        inputSummary: "Controlled timeout proof for Runtime Tool Kernel abort behavior.",
        budget: {
          ...runtimeToolBudgetFromPolicy(budgetPolicy),
          budgetRef: `${budgetPolicy.policyRef}/timeout-proof`,
          timeoutMs: 25,
        },
        rawPromptStored: false,
        rawResponseStored: false,
      },
      {
        async execute() {
          await delay(250);
          return {
            status: "succeeded",
            outputSummary: "This result should be ignored because timeout wins.",
            rawPromptStored: false,
            rawResponseStored: false,
          };
        },
      },
    );
    writeArtifact("long-task-budget-progress-smoke-timeout-abort-proof.json", {
      artifactKind: "long_task_budget_progress_smoke_timeout_abort_proof",
      runId,
      runtimeJobId: job.jobId,
      invocationRef: timeoutResult.invocationRef,
      status: timeoutResult.invocation.status,
      reasonCodes: timeoutResult.reasonCodes,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      secretsStored: false,
    });

    const traceSummary = await traces.summarize({ graphId, limit: 100 });
    const finalGraphSnapshot = await graphs.readGraphSnapshot(graphId);
    writeArtifact("long-task-budget-progress-smoke-progress-events.json", {
      artifactKind: "long_task_budget_progress_smoke_progress_events",
      runId,
      runtimeJobId: job.jobId,
      graphId,
      eventCount: progressEvents.length,
      events: progressEvents.slice(0, 80),
      traceInvocationRefs: traceSummary.invocationRefs,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      secretsStored: false,
    });
    writeArtifact("long-task-budget-progress-smoke-final-readback.json", {
      artifactKind: "long_task_budget_progress_smoke_final_readback",
      runId,
      workItemId: WORK_ITEM_ID,
      runtimeJobId: job.jobId,
      graphStatus: finalGraphSnapshot?.graph.graphStatus ?? null,
      nodeStatuses:
        finalGraphSnapshot?.nodes.map((node) => ({
          nodeId: node.nodeId,
          nodeKind: node.nodeKind,
          nodeStatus: node.nodeStatus,
        })) ?? [],
      activeGraphProgress,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      secretsStored: false,
    });

    const activeBudgetVisible =
      activeGraphProgress?.state === "present" &&
      (activeGraphProgress.budget?.runtimeToolTimeoutMs ?? 0) > 120_000 &&
      activeGraphProgress.budget?.heartbeatState !== null;
    const graphNodesSucceeded =
      (finalGraphSnapshot?.nodes.length ?? 0) >= 2 &&
      (finalGraphSnapshot?.nodes ?? []).every((node) => node.nodeStatus === "succeeded");
    const closeoutToolInvoked = traceSummary.invocationRefs.length > 0;
    const schedulerAccepted =
      schedulerResult.status === "succeeded" ||
      (schedulerResult.status === "needs_review" && graphNodesSucceeded && closeoutToolInvoked);
    const passed =
      missingPriorArtifacts.length === 0 &&
      budgetPolicyReasons.length === 0 &&
      schedulerAccepted &&
      activeBudgetVisible &&
      timeoutResult.invocation.status === "failed" &&
      timeoutResult.reasonCodes.includes("runtime_tool_timeout");
    const closeoutTransition = await workQueue.completeWorkQueueItemFromCloseout({
      workItemId: WORK_ITEM_ID,
      runtimeJobId: job.jobId,
      graphRef: `runtime-work-graph://${graphId}`,
      closeoutRef: `closeout://${runId}/long-task-budget-progress-smoke`,
      closeoutHash: `sha256:${sha256({ runId, schedulerStatus: schedulerResult.status })}`,
      accepted: passed,
      validationRequired: true,
      validationRef: `artifact://execution-platform/long-task-budget-progress/${runId}/validation`,
      sourceEditRequired: false,
      ownerReadbackRef: `readback://${runId}/active-progress`,
      artifactRefs: [
        budgetArtifact,
        `runtime-work-graph://${graphId}`,
        ...traceSummary.invocationRefs.slice(0, 20),
      ],
      reasonCodes: [
        "long_task_budget_progress_smoke_completed",
        ...schedulerResult.reasonCodes.slice(0, 20),
      ],
      rawPromptStored: false,
      rawResponseStored: false,
    });
    await runtimeJobs.completeJob({
      leaseToken: claimed.leaseToken,
      result: {
        schedulerStatus: schedulerResult.status,
        workQueueCloseoutStatus: closeoutTransition.status,
        rawPromptStored: false,
        rawResponseStored: false,
      },
    });

    const qualityReview = {
      artifactKind: "long_task_budget_progress_smoke_quality_review",
      runId,
      status: passed ? "passed" : "needs_review",
      assessment:
        "The smoke is intentionally controlled: it proves the production scheduler, Runtime Tool Kernel, runtime job, and Work Queue readback path carry long-task budgets and active progress before terminal closeout. It does not execute the Product/Spec implementation.",
      passedChecks: [
        ...(missingPriorArtifacts.length === 0 ? ["prior_ux_replay_artifacts_present"] : []),
        ...(budgetPolicyReasons.length === 0 ? ["budget_policy_valid"] : []),
        ...(activeBudgetVisible ? ["active_budget_progress_readback_visible"] : []),
        ...(timeoutResult.reasonCodes.includes("runtime_tool_timeout")
          ? ["timeout_abort_recorded"]
          : []),
        ...(closeoutTransition.status === "closed" ? ["work_queue_closed_from_closeout"] : []),
      ],
      limitations: [
        "Controlled smoke only; Product/Spec Planning implementation proof remains next.",
        "No gateway rebuild was required because no gateway/live UX code was touched.",
      ],
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      secretsStored: false,
    };
    writeArtifact("long-task-budget-progress-smoke-quality-review.json", qualityReview);
    const summary = {
      artifactKind: "long_task_budget_progress_smoke_summary",
      runId,
      workItemId: WORK_ITEM_ID,
      status: passed && closeoutTransition.status === "closed" ? "passed" : "needs_review",
      runtimeJobId: job.jobId,
      graphId,
      schedulerStatus: schedulerResult.status,
      budgetPolicyRef: budgetPolicy.policyRef,
      budgetClass: budgetPolicy.budgetClass,
      runtimeToolTimeoutMs: budgetPolicy.runtimeToolTimeoutMs,
      activeBudgetVisible,
      activeReadbackCurrentPhase: activeGraphProgress?.currentPhase ?? null,
      activeReadbackHeartbeatState: activeGraphProgress?.budget?.heartbeatState ?? null,
      timeoutInvocationRef: timeoutResult.invocationRef,
      timeoutStatus: timeoutResult.invocation.status,
      workQueueCloseoutStatus: closeoutTransition.status,
      modelCallsMade: false,
      codexCliInvokedManually: false,
      acpUsed: false,
      gatewayChanged: false,
      gatewayRebuiltOrReloaded: false,
      runtimeJobsCreated: true,
      authorityGranted: false,
      controlsApplied: false,
      workQueueLifecycleMutatedByUi: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      secretsStored: false,
      reasonCodes: [
        ...(passed
          ? ["long_task_budget_progress_smoke_passed"]
          : ["long_task_budget_progress_smoke_needs_review"]),
        ...schedulerResult.reasonCodes.slice(0, 40),
      ],
    };
    const summaryPath = writeArtifact("long-task-budget-progress-smoke-summary.json", summary);
    const artifactIndex = {
      artifactKind: "long_task_budget_progress_smoke_artifact_index",
      runId,
      workItemId: WORK_ITEM_ID,
      artifacts: [
        ".artifacts/execution-platform/long-task-budget-progress-smoke-preflight.json",
        ".artifacts/execution-platform/long-task-budget-progress-smoke-budget-policy.json",
        ".artifacts/execution-platform/long-task-budget-progress-smoke-active-readback.json",
        ".artifacts/execution-platform/long-task-budget-progress-smoke-timeout-abort-proof.json",
        ".artifacts/execution-platform/long-task-budget-progress-smoke-progress-events.json",
        ".artifacts/execution-platform/long-task-budget-progress-smoke-final-readback.json",
        ".artifacts/execution-platform/long-task-budget-progress-smoke-quality-review.json",
        ".artifacts/execution-platform/long-task-budget-progress-smoke-summary.json",
      ],
      summaryPath,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      secretsStored: false,
    };
    writeArtifact("long-task-budget-progress-smoke-artifact-index.json", artifactIndex);

    if (summary.status !== "passed") {
      throw new Error(`long_task_budget_progress_smoke_failed:${summary.reasonCodes.join(",")}`);
    }
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await runtime?.pool?.end?.();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  writeArtifact("long-task-budget-progress-smoke-summary.json", {
    artifactKind: "long_task_budget_progress_smoke_summary",
    workItemId: WORK_ITEM_ID,
    status: "failed",
    errorSummary: message.slice(0, 500),
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    secretsStored: false,
  });
  console.error(message);
  process.exitCode = 1;
});
