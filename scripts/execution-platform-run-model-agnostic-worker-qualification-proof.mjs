#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactRoot = path.join(root, ".artifacts/execution-platform");
const runId = `model-agnostic-worker-qualification-${Date.now()}`;
const workItemId = "openclaw-convergence.model-agnostic-worker-qualification";

function sha256(value) {
  return createHash("sha256")
    .update(String(value ?? ""), "utf8")
    .digest("hex");
}

async function writeJson(name, value) {
  await mkdir(artifactRoot, { recursive: true });
  const body = `${JSON.stringify({ ...value, generatedAt: new Date().toISOString() }, null, 2)}\n`;
  await writeFile(path.join(artifactRoot, name), body, "utf8");
  return { path: `.artifacts/execution-platform/${name}`, sha256: sha256(body) };
}

async function readJsonIfExists(relativePath) {
  try {
    return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
  } catch {
    return null;
  }
}

function loadDotenvFiles() {
  for (const filePath of [
    path.join(root, ".env"),
    path.join(root, ".env.local"),
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

function parseJsonObject(text) {
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/u);
    if (!match) {
      return null;
    }
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

async function callQualificationTask(client, input) {
  const started = Date.now();
  const response = await client.callRole({
    roleId: input.roleId,
    modelId: input.modelRef,
    modelCandidateId: input.candidateId,
    prompt: input.prompt,
    responseFormat: "json_object",
    requestProfileOverride: {
      responseFormatMode: "native",
      reasoningMode: input.reasoningMode ?? "omit",
      maxTokens: input.maxTokens ?? 1_800,
    },
    maxTokens: input.maxTokens ?? 1_800,
    timeoutMs: input.timeoutMs ?? 180_000,
    maxAttempts: input.maxAttempts ?? 1,
  });
  const responseHash = response.responseHash ?? sha256(response.errorReasonCode ?? "no_response");
  const parsed = parseJsonObject(response.responseText);
  return {
    candidateId: input.candidateId,
    modelRef: input.modelRef,
    taskFamily: input.taskFamily,
    modelRunRef: `openrouter://${input.modelRef}/${responseHash.slice(0, 16)}`,
    responseHash,
    latencyMs: Date.now() - started,
    status: response.status,
    errorReasonCode: response.errorReasonCode ?? null,
    parsed,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

function candidateStatusFromModelOutput(parsed, fallback = "needs_review") {
  const status =
    typeof parsed?.qualificationRecommendation === "string"
      ? parsed.qualificationRecommendation
      : fallback;
  return ["production_qualified", "candidate", "blocked", "needs_review"].includes(status)
    ? status
    : fallback;
}

async function main() {
  loadDotenvFiles();
  const ep = await tsImport(
    path.join(root, "extensions/execution-platform/src/index.ts"),
    import.meta.url,
  );
  const apiKey = process.env.OPENROUTER_API_KEY?.trim() ?? "";
  const kimiProofRef =
    ".artifacts/execution-platform/non-codex-tool-using-worker-live-proof-summary.json";
  const kimiProof = await readJsonIfExists(kimiProofRef);
  await writeJson("model-agnostic-worker-qualification-preflight.json", {
    artifactKind: "model_agnostic_worker_qualification_preflight",
    runId,
    openRouterConfigured: Boolean(apiKey),
    kimiProofRef,
    kimiProofStatus: kimiProof?.status ?? "missing",
    candidateProfiles: ep.MODEL_AGNOSTIC_WORKER_CANDIDATE_PROFILES.map((profile) => ({
      candidateId: profile.candidateId,
      modelRef: profile.modelRef,
      providerPath: profile.providerPath,
      idealTaskFamilies: profile.idealTaskFamilies,
      rawPromptStored: false,
      rawResponseStored: false,
    })),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  });

  const taskRuns = [];
  let reviewerOutput = null;
  if (apiKey) {
    const client = new ep.OpenRouterAgentTeamModelClient({
      apiKey,
      retryPolicy: { maxAttempts: 1, timeoutMs: 180_000 },
      requestProfilesByModelId: {
        "deepseek/deepseek-v4-flash": {
          responseFormatMode: "native",
          reasoningMode: "omit",
          maxTokens: 1_800,
        },
        "deepseek/deepseek-v4-pro": {
          responseFormatMode: "native",
          reasoningMode: "low",
          maxTokens: 2_200,
        },
      },
    });
    const prompts = [
      {
        candidateId: "openrouter.deepseek.deepseek-v4-flash",
        modelRef: "deepseek/deepseek-v4-flash",
        roleId: "context_scout",
        taskFamily: "repo_context_scout",
        prompt: [
          "You are qualifying as a bounded repo context scout for OpenClaw.",
          "Return JSON only. Do not claim to edit files.",
          "Task: from these bounded refs, identify what a downstream implementation worker needs.",
          "Refs: extensions/execution-platform/src/codex-bridge/model-agnostic-tool-worker-loop.ts; extensions/execution-platform/src/codex-bridge/file-edit-worker-adapter.ts; extensions/execution-platform/src/workflows/runtime-node-capability-registry.ts.",
          "Return shape: {qualificationRecommendation:'production_qualified'|'candidate'|'needs_review'|'blocked', usefulContextRefs:string[], downstreamHandoffSummary:string, limitations:string[], rawPromptStored:false, rawResponseStored:false, rawProviderLogStored:false}.",
        ].join("\n"),
      },
      {
        candidateId: "openrouter.deepseek.deepseek-v4-flash",
        modelRef: "deepseek/deepseek-v4-flash",
        roleId: "test_engineer",
        taskFamily: "validation_failure_explanation",
        prompt: [
          "You are qualifying as a bounded validation failure explainer for OpenClaw.",
          "Return JSON only. Do not claim to edit files or run commands.",
          "Failure summary: TypeScript rejects a model-agnostic worker selection because a production non-Codex worker lacks qualificationEvidenceRefs.",
          "Explain the likely repair path for an implementation worker.",
          "Return shape: {qualificationRecommendation:'production_qualified'|'candidate'|'needs_review'|'blocked', failureClassification:string, repairGuidance:string[], limitations:string[], rawPromptStored:false, rawResponseStored:false, rawProviderLogStored:false}.",
        ].join("\n"),
      },
      {
        candidateId: "openrouter.deepseek.deepseek-v4-pro",
        modelRef: "deepseek/deepseek-v4-pro",
        roleId: "test_engineer",
        taskFamily: "test_writing_edit",
        reasoningMode: "low",
        maxTokens: 2_200,
        timeoutMs: 240_000,
        prompt: [
          "You are a candidate non-Codex test-writing worker for OpenClaw.",
          "Return JSON only. Do not claim to have edited files.",
          "Task: propose a focused test plan for a model-agnostic worker qualification matrix that prevents unqualified models from production source-edit selection.",
          "Return shape: {qualificationRecommendation:'production_qualified'|'candidate'|'needs_review'|'blocked', proposedTestRefs:string[], testAssertions:string[], limitations:string[], rawPromptStored:false, rawResponseStored:false, rawProviderLogStored:false}.",
        ].join("\n"),
      },
    ];
    for (const prompt of prompts) {
      try {
        taskRuns.push(await callQualificationTask(client, prompt));
      } catch (error) {
        taskRuns.push({
          candidateId: prompt.candidateId,
          modelRef: prompt.modelRef,
          taskFamily: prompt.taskFamily,
          modelRunRef: null,
          responseHash: sha256(error instanceof Error ? error.message : String(error)),
          latencyMs: 0,
          status: "failed",
          errorReasonCode: error instanceof Error ? error.message.slice(0, 200) : String(error),
          parsed: null,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        });
      }
    }
    try {
      const reviewPrompt = [
        "You are the model-authored qualification reviewer for OpenClaw non-Codex worker lanes.",
        "Judge only whether the bounded output is useful enough for the named task family.",
        "Do not require source-edit evidence for read-only context scouting or validation explanation lanes.",
        "Do require source-edit evidence for implementation lanes.",
        "Return JSON only with reviews array.",
        "Each review: {candidateId, taskFamily, reviewerRecommendation:'production_qualified'|'candidate'|'needs_review'|'blocked', assessment, limitations:string[]}.",
        `Task run summaries: ${JSON.stringify(
          taskRuns.map((run) => ({
            candidateId: run.candidateId,
            taskFamily: run.taskFamily,
            modelRef: run.modelRef,
            status: run.status,
            parsed: run.parsed,
          })),
        ).slice(0, 12_000)}`,
      ].join("\n");
      const review = await client.callRole({
        roleId: "reviewer",
        modelId: "deepseek/deepseek-v4-flash",
        modelCandidateId: "model-agnostic-worker-qualification-reviewer",
        prompt: reviewPrompt,
        responseFormat: "json_object",
        requestProfileOverride: {
          responseFormatMode: "native",
          reasoningMode: "omit",
          maxTokens: 2_400,
        },
        maxTokens: 2_400,
        timeoutMs: 180_000,
        maxAttempts: 1,
      });
      reviewerOutput = {
        modelRef: "deepseek/deepseek-v4-flash",
        modelRunRef: `openrouter://deepseek/deepseek-v4-flash/reviewer/${(review.responseHash ?? sha256(review.errorReasonCode ?? "no_response")).slice(0, 16)}`,
        status: review.status,
        parsed: parseJsonObject(review.responseText),
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      };
    } catch (error) {
      reviewerOutput = {
        status: "failed",
        errorReasonCode: error instanceof Error ? error.message.slice(0, 200) : String(error),
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      };
    }
  }

  const records = [];
  if (kimiProof?.status === "passed") {
    records.push(
      ep.createModelAgnosticWorkerQualificationRecord({
        candidateId: "openrouter.moonshotai.kimi-k2.6",
        modelRef: "moonshotai/kimi-k2.6",
        providerPath: "openrouter",
        taskFamilies: [
          ep.buildQualificationTaskFamilyResult({
            taskFamily: "small_source_edit",
            status: "production_qualified",
            evidenceRefs: [kimiProofRef],
            modelRunRefs: [kimiProof.modelRunRef].filter(Boolean),
            changedFileRefs: kimiProof.changedFileRefs ?? [],
            validationRefs: kimiProof.validationRefs ?? [],
            limitations: kimiProof.limitations ?? [],
            reasonCodes: ["prior_live_source_edit_proof_accepted"],
            liveModelCallMade: true,
            liveSourceEditMade: true,
          }),
          ep.buildQualificationTaskFamilyResult({
            taskFamily: "test_writing_edit",
            status: "candidate",
            evidenceRefs: [kimiProofRef],
            modelRunRefs: [kimiProof.modelRunRef].filter(Boolean),
            changedFileRefs: kimiProof.changedFileRefs ?? [],
            validationRefs: kimiProof.validationRefs ?? [],
            limitations: [
              "Kimi test-writing is inferred from source-edit proof and still needs a dedicated test-authoring proof.",
            ],
            reasonCodes: ["candidate_from_source_edit_test_update_evidence"],
            liveModelCallMade: true,
            liveSourceEditMade: true,
          }),
        ],
      }),
    );
  }

  for (const candidateId of [
    "openrouter.deepseek.deepseek-v4-flash",
    "openrouter.deepseek.deepseek-v4-pro",
  ]) {
    const runs = taskRuns.filter((run) => run.candidateId === candidateId);
    if (runs.length === 0) {
      continue;
    }
    const reviews = Array.isArray(reviewerOutput?.parsed?.reviews)
      ? reviewerOutput.parsed.reviews
      : [];
    records.push(
      ep.createModelAgnosticWorkerQualificationRecord({
        candidateId,
        modelRef: runs[0].modelRef,
        providerPath: "openrouter",
        taskFamilies: runs.map((run) =>
          ep.buildQualificationTaskFamilyResult({
            taskFamily: run.taskFamily,
            status:
              run.status === "completed" || run.status === "succeeded"
                ? candidateStatusFromModelOutput(
                    reviews.find(
                      (review) =>
                        review?.candidateId === run.candidateId &&
                        review?.taskFamily === run.taskFamily,
                    )
                      ? {
                          qualificationRecommendation: reviews.find(
                            (review) =>
                              review?.candidateId === run.candidateId &&
                              review?.taskFamily === run.taskFamily,
                          )?.reviewerRecommendation,
                        }
                      : run.parsed,
                    "candidate",
                  )
                : "blocked",
            evidenceRefs: [
              `.artifacts/execution-platform/model-agnostic-worker-qualification-run-index.json`,
            ],
            modelRunRefs: [run.modelRunRef].filter(Boolean),
            changedFileRefs: [],
            validationRefs: [],
            limitations: Array.isArray(run.parsed?.limitations)
              ? run.parsed.limitations.map(String)
              : run.errorReasonCode
                ? [run.errorReasonCode]
                : [],
            reasonCodes: [
              run.status === "completed" || run.status === "succeeded"
                ? "live_model_qualification_call_completed"
                : "live_model_qualification_call_failed",
              reviewerOutput?.status === "succeeded"
                ? "model_authored_reviewer_assessed_lane"
                : "self_assessment_used_no_reviewer",
              "no_source_edit_authority_for_support_lane",
            ],
            liveModelCallMade: Boolean(run.modelRunRef),
            liveSourceEditMade: false,
          }),
        ),
      }),
    );
  }

  const runIndexRef = await writeJson("model-agnostic-worker-qualification-run-index.json", {
    artifactKind: "model_agnostic_worker_qualification_run_index",
    runId,
    taskRuns,
    reviewerOutput,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawLogsStored: false,
  });
  const matrix = ep.buildModelAgnosticWorkerQualificationMatrix({ records });
  const matrixRef = await writeJson("model-agnostic-worker-qualification-matrix.json", matrix);
  const supportQualified = matrix.schedulerRecommendations.filter(
    (recommendation) =>
      ["repo_context_scout", "validation_failure_explanation"].includes(
        recommendation.taskFamily,
      ) && recommendation.status === "ready",
  );
  const implementationReady = matrix.schedulerRecommendations.some(
    (recommendation) =>
      recommendation.taskFamily === "small_source_edit" &&
      recommendation.preferredCandidateId === "openrouter.moonshotai.kimi-k2.6",
  );
  let workQueueCloseoutStatus = "not_attempted";
  if (implementationReady && supportQualified.length >= 1) {
    const runtime = await ep.createExecutionPlatformDatabaseRuntime({ applyMigrations: true });
    try {
      const runtimeJobs = new ep.RuntimeJobRepository(runtime.sqlClient, {
        claimStrategy: "basic",
      });
      const events = new ep.WorkQueueEventStore(runtime.sqlClient);
      const workQueue = new ep.WorkQueueRepository(runtime.sqlClient, runtimeJobs, {
        eventStore: events,
      });
      if (!(await workQueue.readWorkItemTruth(workItemId))) {
        await workQueue.createWorkItem({
          workItemId,
          itemType: "implementation_slice",
          title: "Model-Agnostic Worker Multi-Model Qualification Matrix",
          description:
            "Qualify non-Codex worker models by task family and wire scheduler selection to bounded evidence.",
          metadata: {
            seededBy: "model_agnostic_worker_qualification_proof",
            rawPromptStored: false,
            rawResponseStored: false,
          },
        });
      }
      const job = await runtimeJobs.enqueueJob({
        jobId: `${runId}-job`,
        jobType: "executor.agent_team",
        queueName: "agent-team",
        workItemId,
        payload: {
          workflowId: "agent_team.coding",
          proofKind: "model_agnostic_worker_qualification",
          matrixRef: matrixRef.path,
          rawPromptStored: false,
          rawResponseStored: false,
        },
        idempotencyScope: "model-agnostic-worker-qualification-proof",
        idempotencyKey: runId,
        maxAttempts: 1,
      });
      const claimed = await runtimeJobs.claimNextJob({
        queueName: "agent-team",
        runtimeJobId: job.jobId,
        workerId: "worker.model-agnostic-worker-qualification-proof",
      });
      if (claimed) {
        await runtimeJobs.completeJob({
          leaseToken: claimed.leaseToken,
          result: {
            artifactKind: "model_agnostic_worker_qualification_runtime_result",
            matrixRef: matrixRef.path,
            runIndexRef: runIndexRef.path,
            rawPromptStored: false,
            rawResponseStored: false,
          },
        });
      }
      const closeout = await workQueue.completeWorkQueueItemFromCloseout({
        workItemId,
        runtimeJobId: job.jobId,
        closeoutRef: `closeout://${runId}/model-agnostic-worker-qualification`,
        closeoutHash: `sha256:${sha256(runId)}`,
        accepted: true,
        validationRequired: true,
        validationRef: matrixRef.path,
        sourceEditRequired: false,
        changedFileRefs: [
          "extensions/execution-platform/src/codex-bridge/model-agnostic-worker-qualification.ts",
          "extensions/execution-platform/src/workflows/cost-aware-capability-policy.ts",
        ],
        ownerReadbackRef: matrixRef.path,
        artifactRefs: [runIndexRef.path, matrixRef.path],
        reasonCodes: ["model_agnostic_worker_qualification_passed"],
        rawPromptStored: false,
        rawResponseStored: false,
      });
      workQueueCloseoutStatus = closeout.status;
    } finally {
      await runtime?.close?.();
    }
  }
  const summary = {
    artifactKind: "model_agnostic_worker_qualification_summary",
    runId,
    status:
      implementationReady && (apiKey ? supportQualified.length >= 1 : false)
        ? "passed"
        : "needs_review",
    implementationReady,
    supportQualifiedTaskFamilies: supportQualified.map((item) => item.taskFamily),
    records: records.map((record) => ({
      candidateId: record.candidateId,
      status: record.status,
      taskFamilies: record.taskFamilies.map((task) => ({
        taskFamily: task.taskFamily,
        status: task.status,
        liveModelCallMade: task.liveModelCallMade,
        liveSourceEditMade: task.liveSourceEditMade,
      })),
    })),
    runIndexRef: runIndexRef.path,
    matrixRef: matrixRef.path,
    workItemId,
    workQueueCloseoutStatus,
    reasonCodes: [
      implementationReady
        ? "kimi_source_edit_lane_production_qualified"
        : "kimi_source_edit_lane_not_qualified",
      supportQualified.length > 0
        ? "support_model_lane_live_qualified"
        : "support_model_lane_needs_review",
    ],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawLogsStored: false,
  };
  await writeJson("model-agnostic-worker-qualification-summary.json", summary);
  console.log(JSON.stringify(summary, null, 2));
  if (summary.status !== "passed") {
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  await writeJson("model-agnostic-worker-qualification-summary.json", {
    artifactKind: "model_agnostic_worker_qualification_summary",
    runId,
    status: "failed",
    errorSummary: message.slice(0, 500),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawLogsStored: false,
  });
  console.error(message);
  process.exitCode = 1;
});
