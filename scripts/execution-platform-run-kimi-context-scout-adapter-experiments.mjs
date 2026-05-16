#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { KimiFileImplementationAdapter } from "../extensions/execution-platform/src/codex-bridge/kimi-file-implementation-adapter.ts";
import { KimiMicrotaskImplementationExecutor } from "../extensions/execution-platform/src/codex-bridge/kimi-microtask-implementation-executor.ts";
import { OpenRouterAgentTeamModelClient } from "../extensions/execution-platform/src/codex-bridge/live-agent-team-runner.ts";
import { createExecutionPlatformDatabaseRuntime } from "../extensions/execution-platform/src/db/runtime.ts";
import { RuntimeJobRepository } from "../extensions/execution-platform/src/runtime-job-repository.ts";

const artifactRoot = ".artifacts/execution-platform";
const sourceRuntimeJobId =
  process.env.OPENCLAW_KIMI_CONTEXT_SCOUT_SOURCE_RUNTIME_JOB_ID?.trim() ||
  "native-exec-c6a78f42a3dcc136";

function sha256(value) {
  return createHash("sha256")
    .update(String(value ?? ""), "utf8")
    .digest("hex");
}

function readDotenvValue(key) {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) {
    return "";
  }
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/u)) {
    const match = line.match(new RegExp(`^${key}=([\\s\\S]*)$`, "u"));
    if (match) {
      return match[1]?.trim().replace(/^["']|["']$/gu, "") ?? "";
    }
  }
  return "";
}

function writeArtifact(name, value) {
  fs.mkdirSync(artifactRoot, { recursive: true });
  const body = `${JSON.stringify({ ...value, generatedAt: new Date().toISOString() }, null, 2)}\n`;
  const filePath = path.join(artifactRoot, name);
  fs.writeFileSync(filePath, body, "utf8");
  return { path: `${artifactRoot}/${name}`, sha256: sha256(body) };
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function compact(value, max = 800) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/gu, " ")
    .slice(0, max);
}

async function loadScoutEvidence() {
  const runtime = await createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
  try {
    const repo = new RuntimeJobRepository(runtime.sqlClient, { claimStrategy: "basic" });
    const artifacts = await repo.listArtifacts(sourceRuntimeJobId);
    const scouts = artifacts
      .filter((artifact) => artifact.artifactType === "agent_team.dynamic_role_invocation")
      .map((artifact) => asRecord(artifact.metadata))
      .filter((metadata) => metadata.roleId === "context_scout");
    const outputs = scouts
      .map((metadata) => asRecord(metadata.contextScoutOutput))
      .filter((output) => output.roleId === "context_scout");
    return {
      sourceRuntimeJobId,
      scoutCount: outputs.length,
      outputs,
      artifactRefs: scouts
        .map((metadata) =>
          typeof metadata.nodeId === "string"
            ? `runtime-job://${sourceRuntimeJobId}/runtime-work-graph/role/context_scout/${metadata.nodeId}`
            : null,
        )
        .filter(Boolean)
        .slice(0, 8),
    };
  } finally {
    await runtime.pool.end();
  }
}

function buildTaskSummary(input) {
  return [
    "You are receiving a child work order from the OpenClaw orchestrator.",
    "This is a bounded Kimi standard implementation microtask.",
    "Use the model-authored context scout handoff below as the main implementation guide.",
    "Do not solve the whole parent project. Make the smallest concrete edit requested by this microtask.",
    `Child work order id: ${input.workOrderId}`,
    `Objective: ${input.objective}`,
    `Why this role was called: ${input.rationale}`,
    `Downstream consumer: ${input.downstreamConsumer}`,
    `Expected output: ${input.expectedOutput}`,
    `Acceptance criteria: ${input.acceptanceCriteria.join("; ")}`,
    `Context scout handoff: ${input.contextScoutHandoff}`,
    `Context scout recommended edit points: ${input.recommendedEditPoints
      .map((point) => `${point.path}#${point.symbolOrRegion}: ${point.reason}`)
      .join(" | ")}`,
    `Validation refs: ${input.validationCommandRefs.join(" | ")}`,
    input.extraInstruction ? `Extra instruction: ${input.extraInstruction}` : "",
    "Return a structured patch proposal. Prefer a small unified diff patch when replacing a whole file is unnecessary.",
    "Return needs_review only for a concrete blocker, not generic uncertainty.",
  ]
    .filter(Boolean)
    .join("\n");
}

async function runExperiment(input) {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim() || readDotenvValue("OPENROUTER_API_KEY");
  if (!apiKey) {
    return {
      experimentId: input.experimentId,
      status: "blocked",
      reasonCodes: ["openrouter_api_key_missing"],
    };
  }
  const modelClient = new OpenRouterAgentTeamModelClient({
    apiKey,
    retryPolicy: {
      maxAttempts: 1,
      timeoutMs: input.timeoutMs,
    },
    requestProfilesByModelId: {
      "moonshotai/kimi-k2.6": {
        responseFormatMode: input.responseFormatMode,
        reasoningMode: "omit",
        maxTokens: input.maxOutputTokens,
      },
    },
  });
  const adapter = new KimiFileImplementationAdapter({
    modelClient: {
      proposeFileEdits: async (request) => {
        const started = Date.now();
        const result = await modelClient.callRole({
          roleId: "implementation_engineer",
          modelId: request.modelRef,
          modelCandidateId: `kimi-context-scout-experiment-${input.experimentId}`,
          prompt: [
            "Kimi file-edit adapter experiment.",
            "Use this as if it came from the OpenClaw orchestrator after context scout.",
            request.taskSummary,
            request.previousFailureSummary
              ? `Previous bounded failure summary: ${request.previousFailureSummary}`
              : "",
          ]
            .filter(Boolean)
            .join("\n\n"),
          responseFormat: input.responseFormatMode === "native" ? "json_object" : undefined,
          requestProfileOverride: {
            responseFormatMode: input.responseFormatMode,
            reasoningMode: "omit",
            maxTokens: request.maxOutputTokens,
          },
          maxTokens: request.maxOutputTokens,
          timeoutMs: request.timeoutMs,
          maxAttempts: 1,
        });
        return {
          modelRunRef: `openrouter://${request.modelRef}/${result.responseHash?.slice(0, 16) ?? result.errorReasonCode ?? "no-response"}`,
          responseText: result.responseText,
          responseHash: result.responseHash ?? sha256(result.errorReasonCode ?? "no-response"),
          latencyMs: Date.now() - started,
          rawPromptStored: false,
          rawResponseStored: false,
        };
      },
    },
    validationRunner: {
      run: async (commandRef) => ({
        validationRef: `experiment-validation://${sha256(commandRef).slice(0, 16)}`,
        status: "passed",
        summary: "Diagnostic experiment validation shim; no repo mutation performed.",
      }),
    },
    applyFile: async (_repoRoot, edit) => ({
      changed: true,
      beforeHash: `diagnostic-before:${sha256(edit.path).slice(0, 16)}`,
      afterHash: `diagnostic-after:${sha256(`${edit.path}:${edit.content ?? edit.unifiedDiff ?? ""}`).slice(0, 16)}`,
    }),
  });
  const executor = new KimiMicrotaskImplementationExecutor({ adapter });
  const startedAt = new Date().toISOString();
  const taskSummary = buildTaskSummary(input);
  const result = await executor.run({
    microtaskId: input.workOrderId,
    microtaskTitle: input.title,
    exactEditObjective: input.objective,
    rationaleForCallingThisRole: input.rationale,
    downstreamConsumer: input.downstreamConsumer,
    expectedOutput: input.expectedOutput,
    contextScoutHandoff: input.contextScoutHandoff,
    recommendedEditPoints: input.recommendedEditPoints,
    repoRoot: process.cwd(),
    allowedFileRefs: input.allowedFileRefs,
    targetFileRefs: input.targetFileRefs,
    contextPackRefs: input.contextPackRefs,
    validationCommandRefs: input.validationCommandRefs,
    acceptanceCriteria: input.acceptanceCriteria,
    budgetPolicy: {
      modelRef: "moonshotai/kimi-k2.6",
      providerPath: "openrouter",
      maxOutputTokens: input.maxOutputTokens,
      timeoutMs: input.timeoutMs,
      maxAttempts: input.adapterAttempts,
    },
  });
  return {
    experimentId: input.experimentId,
    title: input.title,
    status: result.status,
    startedAt,
    completedAt: new Date().toISOString(),
    responseFormatMode: input.responseFormatMode,
    maxOutputTokens: input.maxOutputTokens,
    timeoutMs: input.timeoutMs,
    adapterAttempts: input.adapterAttempts,
    targetFileRefs: input.targetFileRefs,
    taskSummaryHash: sha256(taskSummary),
    modelRef: result.modelRef,
    providerPath: result.providerPath,
    modelRunRef: result.modelRunRef,
    changedFileRefs: result.changedFileRefs,
    diffHash: result.diffHash,
    validationRefs: result.validationRefs,
    reasonCodes: result.reasonCodes,
    limitations: result.limitations,
    attemptDiagnostics: result.attemptDiagnostics,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    repoMutated: false,
  };
}

async function main() {
  const scout = await loadScoutEvidence();
  const first = asRecord(scout.outputs[0]);
  const recommendedEditPoints = Array.isArray(first.recommendedEditPoints)
    ? first.recommendedEditPoints.map(asRecord)
    : [];
  const handoff = compact(first.handoffSummaryForImplementation, 1_200);
  const validationCommandRefs = Array.isArray(first.validationSuggestions)
    ? first.validationSuggestions.filter((value) => typeof value === "string").slice(0, 2)
    : ["pnpm test:file extensions/execution-platform/src/work-queue/execution-read-model.test.ts"];
  const baseContextRefs = [
    `runtime-job://${sourceRuntimeJobId}/context-scout/handoff`,
    ...scout.artifactRefs,
  ].slice(0, 8);
  const experiments = [
    {
      experimentId: "ui-single-file-native-json",
      title: "UI single-file planning intake readback patch",
      workOrderId: "kimi-context-scout-ui-single-file",
      objective:
        "Add the smallest safe Work Queue UI readback improvement for Planning Capsule intake visibility in ui/src/ui/views/work-queue.ts. Use an existing render helper or badge area. Do not change lifecycle/control behavior.",
      rationale:
        "Context scout identified this UI file as the owner-facing surface where Planning Capsule intake should become visible.",
      downstreamConsumer: "reviewer and owner-facing Work Queue readback",
      expectedOutput:
        "A bounded patch proposal for ui/src/ui/views/work-queue.ts with changed-file evidence and validation refs.",
      acceptanceCriteria: [
        "One approved UI file is edited.",
        "The edit only improves readback visibility.",
        "No Work Queue lifecycle mutation, deploy, outbound send, model promotion, or authority grant.",
      ],
      contextScoutHandoff: handoff,
      recommendedEditPoints,
      allowedFileRefs: ["ui/src/ui/views/work-queue.ts"],
      targetFileRefs: ["ui/src/ui/views/work-queue.ts"],
      contextPackRefs: baseContextRefs,
      validationCommandRefs: ["pnpm test:file ui/src/ui/views/work-queue.test.ts"],
      responseFormatMode: "native",
      maxOutputTokens: 8_000,
      timeoutMs: 360_000,
      adapterAttempts: 1,
    },
    {
      experimentId: "projection-single-file-native-json",
      title: "Projection single-file Planning Capsule intake patch",
      workOrderId: "kimi-context-scout-projection-single-file",
      objective:
        "Patch extensions/execution-platform/src/model-memory-runtime/proactivity-work-queue.ts so accepted non-stale/non-duplicate/non-generic Closeout Capsule opportunity seeds create review-gated Planning Capsule intake, while stale/generic/duplicate seeds are skipped.",
      rationale:
        "The live proof accepted opportunity Work Queue items but lacked Planning Capsule refs; this isolates the projection rule.",
      downstreamConsumer: "planning lifecycle intake and Work Queue readback",
      expectedOutput:
        "A bounded patch proposal for proactivity-work-queue.ts with changed-file evidence and validation refs.",
      acceptanceCriteria: [
        "One approved projection file is edited.",
        "The edit creates review-gated Planning Capsule intake for accepted seeds.",
        "The edit preserves DB-operation evidence and raw-storage false flags.",
      ],
      contextScoutHandoff: handoff,
      recommendedEditPoints,
      allowedFileRefs: [
        "extensions/execution-platform/src/model-memory-runtime/proactivity-work-queue.ts",
      ],
      targetFileRefs: [
        "extensions/execution-platform/src/model-memory-runtime/proactivity-work-queue.ts",
      ],
      contextPackRefs: baseContextRefs,
      validationCommandRefs: [
        "pnpm test:file extensions/execution-platform/src/model-memory-runtime/proactivity-work-queue.test.ts",
      ],
      responseFormatMode: "native",
      maxOutputTokens: 8_000,
      timeoutMs: 360_000,
      adapterAttempts: 1,
    },
    {
      experimentId: "broad-directory-control-native-json",
      title: "Broad directory control mirroring failed live prompt",
      workOrderId: "kimi-context-scout-broad-control",
      objective:
        "Implement the smallest production-safe source/test/readback change for owner-facing Work Queue planning/readback for Planning Capsule intake from Closeout Capsule opportunity seeds.",
      rationale:
        "Control case mirrors the broad live instruction that caused Kimi to choose needs_review.",
      downstreamConsumer: "orchestrator escalation decision",
      expectedOutput: "Patch proposal or bounded escalation diagnostics.",
      acceptanceCriteria: [
        "Changes at least one approved target file unless a concrete blocker is recorded.",
        "Records changed-file refs and validation refs.",
      ],
      contextScoutHandoff: handoff,
      recommendedEditPoints,
      allowedFileRefs: [
        "scripts/",
        "docs/projects/execution-platform/",
        "extensions/execution-platform/src/codex-bridge/",
        "extensions/execution-platform/src/work-queue/",
        "extensions/execution-platform/src/model-memory-runtime/",
        "ui/src/ui/views/",
      ],
      targetFileRefs: [
        "scripts/",
        "docs/projects/execution-platform/",
        "extensions/execution-platform/src/codex-bridge/",
        "extensions/execution-platform/src/work-queue/",
        "extensions/execution-platform/src/model-memory-runtime/",
        "ui/src/ui/views/",
      ],
      contextPackRefs: baseContextRefs,
      validationCommandRefs,
      responseFormatMode: "native",
      maxOutputTokens: 8_000,
      timeoutMs: 360_000,
      adapterAttempts: 1,
    },
    {
      experimentId: "ui-single-file-prompt-only",
      title: "UI single-file planning intake readback patch prompt-only",
      workOrderId: "kimi-context-scout-ui-single-file-prompt-only",
      objective:
        "Add the smallest safe Work Queue UI readback improvement for Planning Capsule intake visibility in ui/src/ui/views/work-queue.ts. Use an existing render helper or badge area. Do not change lifecycle/control behavior.",
      rationale:
        "Context scout identified this UI file as the owner-facing surface where Planning Capsule intake should become visible.",
      downstreamConsumer: "reviewer and owner-facing Work Queue readback",
      expectedOutput:
        "A bounded patch proposal for ui/src/ui/views/work-queue.ts with changed-file evidence and validation refs.",
      acceptanceCriteria: [
        "One approved UI file is edited.",
        "The edit only improves readback visibility.",
        "No Work Queue lifecycle mutation, deploy, outbound send, model promotion, or authority grant.",
      ],
      contextScoutHandoff: handoff,
      recommendedEditPoints,
      extraInstruction:
        "For this diagnostic, do not choose needs_review unless the supplied file snapshot is missing. If the file snapshot is present, produce a minimal patch_proposed JSON object.",
      allowedFileRefs: ["ui/src/ui/views/work-queue.ts"],
      targetFileRefs: ["ui/src/ui/views/work-queue.ts"],
      contextPackRefs: baseContextRefs,
      validationCommandRefs: ["pnpm test:file ui/src/ui/views/work-queue.test.ts"],
      responseFormatMode: "prompt_only",
      maxOutputTokens: 8_000,
      timeoutMs: 360_000,
      adapterAttempts: 2,
    },
    {
      experimentId: "projection-single-file-prompt-only",
      title: "Projection single-file Planning Capsule intake patch prompt-only",
      workOrderId: "kimi-context-scout-projection-single-file-prompt-only",
      objective:
        "Patch extensions/execution-platform/src/model-memory-runtime/proactivity-work-queue.ts so accepted non-stale/non-duplicate/non-generic Closeout Capsule opportunity seeds create review-gated Planning Capsule intake, while stale/generic/duplicate seeds are skipped.",
      rationale:
        "The live proof accepted opportunity Work Queue items but lacked Planning Capsule refs; this isolates the projection rule.",
      downstreamConsumer: "planning lifecycle intake and Work Queue readback",
      expectedOutput:
        "A bounded patch proposal for proactivity-work-queue.ts with changed-file evidence and validation refs.",
      acceptanceCriteria: [
        "One approved projection file is edited.",
        "The edit creates review-gated Planning Capsule intake for accepted seeds.",
        "The edit preserves DB-operation evidence and raw-storage false flags.",
      ],
      contextScoutHandoff: handoff,
      recommendedEditPoints,
      extraInstruction:
        "For this diagnostic, do not choose needs_review unless the supplied file snapshot is missing. If the file snapshot is present, produce a minimal patch_proposed JSON object.",
      allowedFileRefs: [
        "extensions/execution-platform/src/model-memory-runtime/proactivity-work-queue.ts",
      ],
      targetFileRefs: [
        "extensions/execution-platform/src/model-memory-runtime/proactivity-work-queue.ts",
      ],
      contextPackRefs: baseContextRefs,
      validationCommandRefs: [
        "pnpm test:file extensions/execution-platform/src/model-memory-runtime/proactivity-work-queue.test.ts",
      ],
      responseFormatMode: "prompt_only",
      maxOutputTokens: 8_000,
      timeoutMs: 360_000,
      adapterAttempts: 1,
    },
  ];
  const experimentFilter = new Set(
    (process.env.OPENCLAW_KIMI_CONTEXT_SCOUT_EXPERIMENT_IDS ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
  const selectedExperiments =
    experimentFilter.size > 0
      ? experiments.filter((experiment) => experimentFilter.has(experiment.experimentId))
      : experiments;
  writeArtifact("kimi-context-scout-adapter-experiments-preflight.json", {
    artifactKind: "kimi_context_scout_adapter_experiments_preflight",
    status: scout.scoutCount > 0 ? "ready" : "blocked",
    sourceRuntimeJobId,
    scoutCount: scout.scoutCount,
    contextScoutArtifactRefs: scout.artifactRefs,
    experimentCount: selectedExperiments.length,
    experimentFilter: [...experimentFilter],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  });
  const results = [];
  for (const experiment of selectedExperiments) {
    const result = await runExperiment(experiment);
    results.push(result);
    writeArtifact(`kimi-context-scout-adapter-experiment-${experiment.experimentId}.json`, {
      artifactKind: "kimi_context_scout_adapter_experiment_result",
      ...result,
    });
  }
  const completed = results.filter((result) => result.status === "completed");
  const noContent = results.filter((result) =>
    result.attemptDiagnostics?.some((attempt) =>
      attempt.schemaFailureCategories?.includes("no_response"),
    ),
  );
  const needsReviewNoEdits = results.filter((result) =>
    result.attemptDiagnostics?.some((attempt) =>
      attempt.schemaFailureCategories?.includes("needs_review_status"),
    ),
  );
  writeArtifact("kimi-context-scout-adapter-experiments-summary.json", {
    artifactKind: "kimi_context_scout_adapter_experiments_summary",
    status: completed.length > 0 ? "passed_with_findings" : "needs_review",
    sourceRuntimeJobId,
    completedExperimentIds: completed.map((result) => result.experimentId),
    noContentExperimentIds: noContent.map((result) => result.experimentId),
    needsReviewNoEditExperimentIds: needsReviewNoEdits.map((result) => result.experimentId),
    results: results.map((result) => ({
      experimentId: result.experimentId,
      status: result.status,
      targetFileRefs: result.targetFileRefs,
      changedFileRefs: result.changedFileRefs,
      reasonCodes: result.reasonCodes,
      attemptDiagnostics: result.attemptDiagnostics?.map((attempt) => ({
        attempt: attempt.attempt,
        responsePresent: attempt.responsePresent,
        responseLength: attempt.responseLength,
        latencyMs: attempt.latencyMs,
        hadJsonObject: attempt.hadJsonObject,
        schemaParseState: attempt.schemaParseState,
        schemaFailureCategories: attempt.schemaFailureCategories,
        parsedStatus: attempt.parsedStatus,
        parsedNeedsReview: attempt.parsedNeedsReview,
        parsedFileEditCount: attempt.parsedFileEditCount,
        boundedBlockerSummary: attempt.boundedBlockerSummary,
        normalizedEditCount: attempt.normalizedEditCount,
        rejectionStage: attempt.rejectionStage,
      })),
    })),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    repoMutated: false,
  });
  console.log(
    JSON.stringify(
      {
        status: completed.length > 0 ? "passed_with_findings" : "needs_review",
        completedExperimentIds: completed.map((result) => result.experimentId),
        noContentExperimentIds: noContent.map((result) => result.experimentId),
        needsReviewNoEditExperimentIds: needsReviewNoEdits.map((result) => result.experimentId),
        artifact:
          ".artifacts/execution-platform/kimi-context-scout-adapter-experiments-summary.json",
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  writeArtifact("kimi-context-scout-adapter-experiments-summary.json", {
    artifactKind: "kimi_context_scout_adapter_experiments_summary",
    status: "blocked",
    reasonCodes: ["kimi_context_scout_adapter_experiment_script_failed"],
    errorHash: sha256(error instanceof Error ? error.message : String(error)),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  });
  process.exitCode = 1;
});
