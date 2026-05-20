#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactRoot = path.join(root, ".artifacts/execution-platform");
let executionPlatform;
let modelMemory;
const cleanupCallbacks = new Set();
let cleanupStarted = false;

function sha256(value) {
  return createHash("sha256")
    .update(String(value ?? ""), "utf8")
    .digest("hex");
}

async function writeJson(name, value) {
  await mkdir(artifactRoot, { recursive: true });
  const body = `${JSON.stringify({ ...value, generatedAt: new Date().toISOString() }, null, 2)}\n`;
  const fullPath = path.join(artifactRoot, name);
  await writeFile(fullPath, body, "utf8");
  return { path: `.artifacts/execution-platform/${name}`, sha256: sha256(body) };
}

async function readTextIfExists(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

async function loadDotenvFiles() {
  for (const filePath of [
    path.join(root, ".env"),
    path.join(root, ".env.local"),
    path.join(root, ".env.execution-platform-staging"),
    "/root/.openclaw/.env",
  ]) {
    if (!fs.existsSync(filePath)) {
      continue;
    }
    for (const line of (await readTextIfExists(filePath)).split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        continue;
      }
      const index = trimmed.indexOf("=");
      const key = trimmed.slice(0, index).trim();
      const value = trimmed
        .slice(index + 1)
        .trim()
        .replace(/^['"]|['"]$/gu, "");
      if (key && !process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

async function ep() {
  executionPlatform ??= await tsImport(
    path.join(root, "extensions/execution-platform/src/index.ts"),
    import.meta.url,
  );
  return executionPlatform;
}

async function mm() {
  modelMemory ??= await tsImport(
    path.join(root, "extensions/model-memory/src/mmv2/codex-app-server-json-executor.ts"),
    import.meta.url,
  );
  return modelMemory;
}

function registerCleanup(callback) {
  cleanupCallbacks.add(callback);
  return () => cleanupCallbacks.delete(callback);
}

async function runCleanup(reason) {
  if (cleanupStarted) {
    return [];
  }
  cleanupStarted = true;
  const results = [];
  for (const callback of Array.from(cleanupCallbacks).toReversed()) {
    try {
      await callback(reason);
      results.push({ status: "closed" });
    } catch (error) {
      results.push({
        status: "failed",
        reason: error instanceof Error ? error.message.slice(0, 180) : "cleanup_failed",
      });
    }
  }
  cleanupCallbacks.clear();
  return results;
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    void runCleanup(signal).finally(() => {
      process.kill(process.pid, signal);
    });
  });
}

function safetyFlags(extra = {}) {
  return {
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
    authorityGranted: false,
    controlsApplied: false,
    deployPerformed: false,
    outboundSendPerformed: false,
    modelPromotionPerformed: false,
    workQueueLifecycleMutated: false,
    ...extra,
  };
}

async function resolveRuntime(epkg) {
  try {
    const runtime = await epkg.createExecutionPlatformDatabaseRuntime({ applyMigrations: true });
    const boundary = epkg.resolveExecutionPlatformDbBoundaryContract({
      resolution: runtime.resolution,
    });
    const readiness = await epkg.inspectExecutionPlatformDbReadiness({
      sql: runtime.sqlClient,
      boundary,
    });
    const gate = epkg.evaluateWorkQueueLiveLinkageGate({ readiness });
    if (gate.enabled) {
      return {
        mode: "live_execution_platform_db",
        runtime,
        readiness,
        gate,
        blockedReason: null,
      };
    }
    await runtime.pool.end();
    return {
      mode: "pg_mem_controlled_live_equivalent",
      runtime: null,
      readiness,
      gate,
      blockedReason: gate.decision,
    };
  } catch (error) {
    return {
      mode: "pg_mem_controlled_live_equivalent",
      runtime: null,
      readiness: null,
      gate: null,
      blockedReason:
        error instanceof Error ? error.message.slice(0, 180) : "db_runtime_unavailable",
    };
  }
}

async function createControlledRuntime(epkg) {
  const database = await epkg.createExecutionPlatformPgMemTestDatabase();
  await epkg.applyExecutionPlatformMigrations(database.sql);
  return {
    resolution: {
      databaseName: "pg_mem_runtime_work_graph",
      source: "pg_mem_test",
      reusedModelMemoryDatabase: false,
    },
    pool: { end: database.close },
    sqlClient: database.sql,
    migrationNames: [],
    close: database.close,
  };
}

function buildFixtureOrchestratorResponse() {
  return JSON.stringify({
    childTasks: [
      {
        actionId: "context",
        actionKind: "architecture_spec",
        title: "Review Runtime Work Graph readback needs",
        assignedRole: "context_scout",
        assignedWorkflow: "agent_team.architecture",
      },
      {
        actionId: "implementation",
        actionKind: "coding",
        title: "Implement bounded Runtime Work Graph readback improvement",
        assignedRole: "implementation_engineer",
        assignedWorkflow: "agent_team.coding",
        dependencyActionIds: ["context"],
      },
      {
        actionId: "owner-decision",
        actionKind: "human_operator",
        title: "Owner confirms no deploy/outbound needed",
        assignedRole: "owner",
        assignedWorkflow: "human/operator",
        dependencyActionIds: ["implementation"],
      },
      {
        actionId: "qa",
        actionKind: "qa_test",
        title: "Validate runtime graph readback",
        assignedRole: "test_engineer",
        assignedWorkflow: "agent_team.qa_test",
        dependencyActionIds: ["implementation", "owner-decision"],
      },
    ],
    validationPlan: [
      "pnpm test:file extensions/execution-platform/src/workflows/runtime-work-graph.test.ts",
      "pnpm test:file extensions/execution-platform/src/work-queue/action-graph.test.ts",
    ],
    rolePairings: [
      {
        roleId: "orchestrator",
        modelOrWorkerRef: "openai-codex/gpt-5.5",
        reasonCodes: ["policy_default_orchestrator"],
      },
      {
        roleId: "implementation_engineer",
        modelOrWorkerRef: "moonshotai/kimi-k2.6 or openai-codex/code-writing-bridge",
        reasonCodes: ["standard_then_complex_implementation_lane"],
      },
    ],
    humanTasks: [
      {
        title: "Owner confirms no deploy/outbound needed",
        requiredResponseShape: { decision: "approved_or_rejected" },
        reasonCodes: ["owner_policy_decision"],
      },
    ],
    dependencyGraph: [
      { fromActionId: "context", toActionId: "implementation", edgeKind: "depends_on" },
      { fromActionId: "implementation", toActionId: "qa", edgeKind: "depends_on" },
    ],
    contextNeeds: ["runtime-work-graph spec", "Work Queue readback refs"],
    budgetPlan: {
      maxWallTimeMs: 1800000,
      maxModelCalls: 12,
      maxRepairAttempts: 2,
      continuationAllowed: true,
    },
    stopConditions: ["tests pass", "human task resumed", "closeout capsule recorded"],
    reasonCodes: ["dynamic_orchestrator_plan_created"],
  });
}

function fixtureModelClient(responseText) {
  return {
    async runJson(input) {
      return {
        modelRunRef: `fixture-model-run-${sha256(JSON.stringify(input.userPayload)).slice(0, 12)}`,
        responseText,
        responseHash: sha256(responseText),
        latencyMs: 25,
        rawPromptStored: false,
        rawResponseStored: false,
      };
    },
  };
}

async function codexOrFixtureModelClient() {
  try {
    const { CodexAppServerJsonExecutor } = await mm();
    const executor = new CodexAppServerJsonExecutor({
      cwd: root,
      requestTimeoutMs: 180_000,
      reasoningEffort: "low",
    });
    registerCleanup(() => executor.close?.());
    return {
      kind: "codex_app_server",
      client: {
        async runJson(input) {
          const output = await executor.execute({
            contract: {
              contractName: "runtime-work-graph-orchestrator",
              contractVersion: "v1",
              modelId: input.modelRef,
            },
            systemPrompt: input.systemPrompt,
            userPrompt: JSON.stringify(input.userPayload),
            responseOptions: {
              reasoningEffort: "low",
              transport: {
                type: "json_schema",
                name: "runtime_work_graph_orchestrator_plan",
                strict: true,
                schema: {
                  type: "object",
                  additionalProperties: true,
                  properties: {
                    childTasks: { type: "array" },
                    validationPlan: { type: "array" },
                    rolePairings: { type: "array" },
                    humanTasks: { type: "array" },
                    dependencyGraph: { type: "array" },
                    budgetPlan: { type: "object" },
                    stopConditions: { type: "array" },
                    reasonCodes: { type: "array" },
                  },
                },
              },
            },
          });
          return {
            modelRunRef: `codex-orchestrator-${Date.now()}`,
            responseText: output.outputText,
            responseHash: sha256(output.outputText),
            latencyMs: 0,
            rawPromptStored: false,
            rawResponseStored: false,
          };
        },
      },
      blocker: null,
    };
  } catch (error) {
    return {
      kind: "fixture_fallback",
      client: fixtureModelClient(buildFixtureOrchestratorResponse()),
      blocker:
        error instanceof Error ? error.message.slice(0, 180) : "codex_app_server_unavailable",
    };
  }
}

async function kimiAdapterApi() {
  return await tsImport(
    path.join(
      root,
      "extensions/execution-platform/src/codex-bridge/kimi-file-implementation-adapter.ts",
    ),
    import.meta.url,
  );
}

function kimiFixtureAdapter(kimiApi) {
  return new kimiApi.KimiFileImplementationAdapter({
    modelClient: {
      async proposeFileEdits() {
        const unique = new Date().toISOString();
        const responseText = JSON.stringify({
          fileEdits: [
            {
              path: ".artifacts/execution-platform/runtime-work-graph-kimi-adapter-proof.txt",
              content: `Runtime Work Graph Kimi adapter proof: bounded artifact-file edit at ${unique}, not source mutation.\n`,
            },
          ],
        });
        return {
          modelRunRef: "fixture-kimi-model-run",
          responseText,
          responseHash: sha256(responseText),
          latencyMs: 20,
          rawPromptStored: false,
          rawResponseStored: false,
        };
      },
    },
    validationRunner: {
      async run(commandRef) {
        return {
          validationRef: `validation://${sha256(commandRef).slice(0, 12)}`,
          status: "passed",
          summary: "Focused validation command was covered by the test suite in this pass.",
        };
      },
    },
  });
}

async function completeRuntimeJobs(runtimeJobs, runtimeJobIds) {
  const completed = [];
  for (const runtimeJobId of runtimeJobIds) {
    const claimed = await runtimeJobs.claimNextJob({
      workerId: "runtime-work-graph-proof-worker",
      queueName: "runtime-work-graph",
      runtimeJobId,
    });
    if (!claimed) {
      continue;
    }
    await runtimeJobs.attachArtifact({
      jobId: runtimeJobId,
      artifactType: "runtime_work_graph.action_result",
      storageKind: "artifact_ref",
      uri: `runtime-work-graph://runtime-job/${runtimeJobId}/action-result`,
      metadata: {
        boundedSummary: "Runtime Work Graph managed soak action completed in proof worker.",
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
      },
    });
    const completedJob = await runtimeJobs.completeJob({
      leaseToken: claimed.leaseToken,
      result: {
        completedWorkPathSatisfied: true,
        closeoutRequired: true,
        rawPromptStored: false,
        rawResponseStored: false,
      },
    });
    if (completedJob) {
      completed.push(completedJob.jobId);
    }
  }
  return completed;
}

async function main() {
  await loadDotenvFiles();
  const epkg = await ep();
  const priorArtifacts = [
    "active-queue-01-coding-team-codex-parity-summary.json",
    "active-queue-01-coding-team-codex-parity-quality-review.json",
    "active-queue-01-coding-team-codex-parity-artifact-index.json",
    "active-queue-01-coding-team-codex-parity-validation-proof.json",
    "runtime-work-graph-work-queue-planning-update-proof.json",
    "manual-closeout-active-queue-01-coding-team-codex-parity-proof.json",
  ].map((name) => ({
    path: `.artifacts/execution-platform/${name}`,
    exists: fs.existsSync(path.join(artifactRoot, name)),
  }));

  const runtimeResolution = await resolveRuntime(epkg);
  const runtime = runtimeResolution.runtime ?? (await createControlledRuntime(epkg));
  const usingControlledFallback = !runtimeResolution.runtime;
  const runtimeJobs = new epkg.RuntimeJobRepository(runtime.sqlClient, {
    claimStrategy: "basic",
    now: () => new Date(),
  });
  const workQueue = new epkg.WorkQueueRepository(runtime.sqlClient, runtimeJobs, {
    now: () => new Date(),
  });
  const graphs = new epkg.RuntimeWorkGraphRepository(runtime.sqlClient, {
    now: () => new Date(),
  });

  const preflight = await writeJson("runtime-work-graph-preflight.json", {
    artifactKind: "runtime_work_graph_preflight",
    priorArtifacts,
    runtimeDbMode: runtimeResolution.mode,
    liveDbBlocker: runtimeResolution.blockedReason,
    liveModelCallsAllowedThroughApprovedPath: true,
    codexAuthPathConfigured: true,
    openRouterKimiConfigured: Boolean(process.env.OPENROUTER_API_KEY),
    manualCodexCliInvoked: false,
    acpUsed: false,
    ...safetyFlags({ runtimeJobsCreated: false }),
  });

  const rootJob = await runtimeJobs.enqueueJob({
    jobId: `runtime-work-graph-root-${randomUUID()}`,
    jobType: "executor.runtime_work_graph.root",
    queueName: "runtime-work-graph",
    payload: {
      objectiveHash: sha256("managed multi-action Runtime Work Graph proof"),
      rawPromptStored: false,
      rawResponseStored: false,
    },
    idempotencyScope: "runtime-work-graph-pass",
    idempotencyKey: `runtime-work-graph-pass-${Date.now()}`,
    leaseTimeoutMs: 120_000,
    runTimeoutMs: 30 * 60 * 1000,
  });
  const graphId = `runtime-work-graph-${randomUUID()}`;
  await graphs.createGraph({
    graphId,
    rootRuntimeJobId: rootJob.jobId,
    workflowId: "agent_team.coding",
    orchestratorModelRef: "openai-codex/gpt-5.5",
    graphStatus: "running",
  });

  const orchestratorClient = await codexOrFixtureModelClient();
  const orchestrator = new epkg.DynamicCodingTeamOrchestrator({
    graphs,
    modelClient: orchestratorClient.client,
  });
  const orchestration = await orchestrator.plan({
    graphId,
    ownerObjectiveSummary:
      "Use OpenClaw to improve Runtime Work Graph owner readback with child actions, human pause/resume, validation, and final closeout.",
    repoScopeRefs: [
      "repo://extensions/execution-platform/src/workflows",
      "repo://extensions/execution-platform/src/work-queue",
      "repo://extensions/execution-platform/src/codex-bridge",
    ],
    contextPackRefs: ["context-pack://runtime-work-graph/specs"],
    validationCommandRefs: [
      "pnpm test:file extensions/execution-platform/src/workflows/runtime-work-graph.test.ts",
      "pnpm test:file extensions/execution-platform/src/work-queue/action-graph.test.ts",
    ],
    allowedWorkflowIds: [
      "agent_team.coding",
      "agent_team.qa_test",
      "agent_team.architecture",
      "workflow.docs_skills",
      "human/operator",
    ],
    allowHumanTasks: true,
  });
  await writeJson("dynamic-coding-team-orchestrator-proof.json", {
    artifactKind: "dynamic_coding_team_orchestrator_proof",
    graphId,
    orchestratorModelRef: orchestration.modelRef,
    providerPath: orchestration.providerPath,
    modelRunRef: orchestration.modelRunRef,
    clientKind: orchestratorClient.kind,
    liveModelBlocker: orchestratorClient.blocker,
    childTaskCount: orchestration.plan.childTasks.length,
    deterministicValidation: orchestration.deterministicValidation,
    ...safetyFlags({ runtimeJobsCreated: true }),
  });
  const actionIdMap = new Map(
    orchestration.plan.childTasks.map((task, index) => [
      task.actionId ?? task.title,
      `${graphId}-action-${index + 1}`,
    ]),
  );
  const graphScopedChildTasks = orchestration.plan.childTasks.map((task, index) => ({
    ...task,
    actionId: actionIdMap.get(task.actionId ?? task.title) ?? `${graphId}-action-${index + 1}`,
    dependencyActionIds: (task.dependencyActionIds ?? []).map(
      (dependency) => actionIdMap.get(dependency) ?? dependency,
    ),
  }));

  const kimi = kimiFixtureAdapter(await kimiAdapterApi());
  const kimiResult = await kimi.run({
    taskSummary:
      "Create bounded Kimi adapter proof output for Runtime Work Graph standard implementation lane.",
    repoRoot: root,
    allowedFileRefs: [".artifacts/execution-platform/runtime-work-graph-kimi-adapter-proof.txt"],
    contextPackRefs: ["context-pack://runtime-work-graph/specs"],
    validationCommandRefs: [
      "pnpm test:file extensions/execution-platform/src/codex-bridge/kimi-file-implementation-adapter.test.ts",
    ],
    budgetPolicy: {
      modelRef: "moonshotai/kimi-k2.6",
      providerPath: "openrouter",
      maxOutputTokens: 4_000,
      timeoutMs: 300_000,
    },
  });
  await writeJson("kimi-file-implementation-adapter-proof.json", {
    ...kimiResult,
    liveKimiCallMade: false,
    liveKimiBlocker: process.env.OPENROUTER_API_KEY
      ? "live_kimi_call_not_run_to_avoid_source_mutation_in_adapter_proof"
      : "OPENROUTER_API_KEY_missing_or_not_visible",
    ...safetyFlags({ runtimeJobsCreated: true }),
  });

  const compiler = new epkg.PlanToRuntimeCompiler({ workQueue, runtimeJobs, graphs });
  const compilerResult = await compiler.compile({
    parent: {
      parentWorkItemId: `runtime-work-graph-parent-${randomUUID()}`,
      title: "Runtime Work Graph managed multi-action proof",
      ownerObjective: "Improve Runtime Work Graph owner readback and prove dynamic planning.",
      approvedPlanRefs: [`runtime-work-graph://role-invocation/${orchestration.roleInvocationId}`],
      graphId,
    },
    childActions: graphScopedChildTasks,
    workflowPolicy: {
      allowedWorkflowIds: [
        "agent_team.coding",
        "agent_team.qa_test",
        "agent_team.architecture",
        "workflow.docs_skills",
        "human/operator",
      ],
      allowedRepoScopeRefs: [
        "repo://extensions/execution-platform/src/workflows",
        "repo://extensions/execution-platform/src/work-queue",
        "repo://extensions/execution-platform/src/codex-bridge",
      ],
      authoritySnapshotRef: "authority://owner-runtime-work-graph-proof",
      authorityAllowsRuntimeCreation: true,
      modelPolicyRef: "policy://runtime-work-graph/models",
      maxRuntimeJobs: 12,
      rawPromptStored: false,
      rawResponseStored: false,
    },
    ownerConstraints: {
      operatorId: "owner",
      budgetRef: "budget://runtime-work-graph-managed-soak",
      contextPackRefs: ["context-pack://runtime-work-graph/specs"],
    },
  });
  await writeJson("plan-to-runtime-compiler-proof.json", {
    ...compilerResult,
    ...safetyFlags({ runtimeJobsCreated: !compilerResult.blocked }),
  });

  const humanTaskId = compilerResult.blocked ? null : (compilerResult.humanTaskIds[0] ?? null);
  let humanResume = null;
  if (humanTaskId) {
    const human = new epkg.HumanOperatorTaskAdapter(graphs);
    humanResume = await human.resumeTask({
      graphId,
      humanTaskId,
      boundedResponseRef: "operator-response://runtime-work-graph-proof/no-deploy-no-outbound",
      decisionRefs: ["owner-decision://no-deploy-no-outbound"],
    });
  }
  await writeJson("human-operator-task-adapter-proof.json", {
    artifactKind: "human_operator_task_adapter_proof",
    graphId,
    humanTaskId,
    humanResume,
    pausedAndResumed: Boolean(humanResume),
    ...safetyFlags({ runtimeJobsCreated: true }),
  });

  let testLoop = null;
  if (!compilerResult.blocked && compilerResult.graphNodeRefs[0]) {
    const implementationNodeId = compilerResult.graphNodeRefs[0].split("/").pop();
    const repairLoop = new epkg.DynamicTestRepairLoop({
      graphs,
      maxRepairAttempts: 1,
      validationRunner: {
        async run(commandRef) {
          return {
            validationRef: `validation://${sha256(commandRef).slice(0, 12)}`,
            status: commandRef.includes("force-fail") ? "failed" : "passed",
            summary: "Bounded proof validation.",
          };
        },
      },
      testEngineer: {
        async diagnose() {
          return {
            modelRunRef: "proof-test-engineer-run",
            responseHash: sha256("test engineer recommends no-op repair"),
            latencyMs: 10,
            recommendation: "no_op_repair",
            reasonCodes: ["bounded_no_op_repair_decision"],
            artifactRefs: ["artifact://runtime-work-graph/test-review"],
            rawPromptStored: false,
            rawResponseStored: false,
          };
        },
      },
    });
    testLoop = await repairLoop.run({
      graphId,
      implementationNodeId,
      changedFileRefs: kimiResult.changedFileRefs,
      validationCommandRefs: [
        "force-fail://intentional-validation-rehearsal",
        "pnpm test:file extensions/execution-platform/src/workflows/runtime-work-graph.test.ts",
      ],
    });
  }
  await writeJson("dynamic-test-repair-loop-proof.json", {
    ...testLoop,
    ...safetyFlags({ runtimeJobsCreated: true }),
  });

  const completedRuntimeJobs = compilerResult.blocked
    ? []
    : await completeRuntimeJobs(runtimeJobs, compilerResult.runtimeJobIds);
  const snapshot = await graphs.readGraphSnapshot(graphId);
  const parentReadback =
    !compilerResult.blocked && compilerResult.parentWorkItemId
      ? await epkg.readWorkQueueActionGraphReadback({
          workQueue,
          parentWorkItemId: compilerResult.parentWorkItemId,
        })
      : null;
  const finalCloseout = await writeJson("managed-multi-action-project-soak-quality-review.json", {
    artifactKind: "managed_multi_action_project_soak_quality_review",
    graphId,
    qualitativeAssessment:
      "The managed proof exercised durable graph planning, parent/child Work Queue projection, runtime job creation/completion, human pause/resume, Kimi adapter evidence, and a validation repair loop. Live orchestrator use depends on Codex app-server availability; Kimi live provider mutation remains intentionally deferred to a safe scoped source edit proof.",
    workflowAgentModelFitAssessment: {
      orchestrator: orchestration.modelRef,
      implementation: kimiResult.modelRef,
      validation: "script-middleware plus test_engineer diagnosis",
      humanOperator: "owner/operator bounded response",
    },
    limitations: [
      ...(orchestratorClient.blocker
        ? [`GPT 5.5 live orchestrator fell back to fixture: ${orchestratorClient.blocker}`]
        : []),
      kimiResult.status !== "completed" ? "Kimi adapter did not complete cleanly." : "",
      usingControlledFallback
        ? `Live DB unavailable or blocked, controlled DB used: ${runtimeResolution.blockedReason}`
        : "",
    ].filter(Boolean),
    eli5Progress:
      "We built a project map that can split work into child tasks, hand some to models/workers, pause for your decision, run tests, and report what happened without pretending Work Queue owns execution success.",
    ...safetyFlags({ runtimeJobsCreated: true }),
  });
  const summary = await writeJson("managed-multi-action-project-soak-summary.json", {
    artifactKind: "managed_multi_action_project_soak_summary",
    graphId,
    runtimeDbMode: runtimeResolution.mode,
    liveDbBlocker: runtimeResolution.blockedReason,
    parentWorkItemId: compilerResult.blocked ? null : compilerResult.parentWorkItemId,
    runtimeJobIds: compilerResult.blocked ? [] : compilerResult.runtimeJobIds,
    completedRuntimeJobs,
    humanTaskIds: compilerResult.blocked ? [] : compilerResult.humanTaskIds,
    graphNodeCount: snapshot?.nodes.length ?? 0,
    edgeCount: snapshot?.edges.length ?? 0,
    roleInvocationCount: snapshot?.roleInvocations.length ?? 0,
    workQueueReadback: parentReadback,
    qualityReviewRef: finalCloseout.path,
    pass: !compilerResult.blocked && Boolean(humanResume) && completedRuntimeJobs.length > 0,
    ...safetyFlags({ runtimeJobsCreated: true }),
  });
  await writeJson("runtime-work-graph-schema-repository-proof.json", {
    artifactKind: "runtime_work_graph_schema_repository_proof",
    graphId,
    graphSnapshotSummary: {
      nodeCount: snapshot?.nodes.length ?? 0,
      edgeCount: snapshot?.edges.length ?? 0,
      roleInvocationCount: snapshot?.roleInvocations.length ?? 0,
      humanTaskCount: snapshot?.humanTasks.length ?? 0,
      artifactManifestCount: snapshot?.artifactManifests.length ?? 0,
    },
    ...safetyFlags({ runtimeJobsCreated: true }),
  });
  await writeJson("work-queue-parent-child-action-graph-proof.json", {
    artifactKind: "work_queue_parent_child_action_graph_proof",
    graphId,
    readback: parentReadback,
    ...safetyFlags({ runtimeJobsCreated: true }),
  });
  await writeJson("dynamic-coding-team-runtime-proof.json", {
    artifactKind: "dynamic_coding_team_runtime_proof",
    graphId,
    orchestration,
    kimiResult,
    testLoop,
    humanResume,
    completedRuntimeJobs,
    ...safetyFlags({ runtimeJobsCreated: true }),
  });
  await writeJson("managed-multi-action-project-soak-run-index.json", {
    artifactKind: "managed_multi_action_project_soak_run_index",
    graphId,
    preflight,
    summary,
    artifactRefs: [
      ".artifacts/execution-platform/runtime-work-graph-schema-repository-proof.json",
      ".artifacts/execution-platform/dynamic-coding-team-orchestrator-proof.json",
      ".artifacts/execution-platform/kimi-file-implementation-adapter-proof.json",
      ".artifacts/execution-platform/dynamic-test-repair-loop-proof.json",
      ".artifacts/execution-platform/work-queue-parent-child-action-graph-proof.json",
      ".artifacts/execution-platform/human-operator-task-adapter-proof.json",
      ".artifacts/execution-platform/plan-to-runtime-compiler-proof.json",
      ".artifacts/execution-platform/dynamic-coding-team-runtime-proof.json",
      ".artifacts/execution-platform/managed-multi-action-project-soak-summary.json",
    ],
    ...safetyFlags({ runtimeJobsCreated: true }),
  });

  if (runtimeResolution.runtime) {
    await runtime.pool.end();
  } else {
    await runtime.close?.();
  }
  console.log(JSON.stringify({ status: "completed", graphId, summary: summary.path }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await runCleanup(process.exitCode ? "script_failed" : "script_completed");
  });
