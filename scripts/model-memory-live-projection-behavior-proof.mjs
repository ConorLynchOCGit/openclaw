#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function readArgValue(argv, flag) {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

function providerFromModelId(modelId) {
  const slash = modelId.indexOf("/");
  return slash === -1 ? "openrouter" : modelId.slice(0, slash);
}

function shouldUseCodexAppServer(modelId) {
  const provider = providerFromModelId(modelId);
  return provider === "openai-codex" || provider === "codex";
}

function readSpeedArgs(argv) {
  return {
    apiReasoningEffort:
      readArgValue(argv, "--api-reasoning-effort") ??
      process.env.MODEL_MEMORY_PROJECTION_API_REASONING_EFFORT ??
      "none",
    codexReasoningEffort:
      readArgValue(argv, "--codex-reasoning-effort") ??
      process.env.MODEL_MEMORY_PROJECTION_CODEX_REASONING_EFFORT ??
      "low",
    verbosity:
      readArgValue(argv, "--verbosity") ?? process.env.MODEL_MEMORY_PROJECTION_VERBOSITY ?? "low",
    serviceTier:
      readArgValue(argv, "--service-tier") ??
      process.env.MODEL_MEMORY_PROJECTION_SERVICE_TIER ??
      process.env.OPENCLAW_CODEX_APP_SERVER_SERVICE_TIER,
  };
}

function speedOptionsForModel(modelId, speedArgs) {
  return {
    reasoningEffort: shouldUseCodexAppServer(modelId)
      ? speedArgs.codexReasoningEffort
      : speedArgs.apiReasoningEffort,
    ...(speedArgs.verbosity ? { verbosity: speedArgs.verbosity } : {}),
    ...(speedArgs.serviceTier ? { serviceTier: speedArgs.serviceTier } : {}),
  };
}

function parseJsonOutput(text) {
  return JSON.parse(
    text
      .trim()
      .replace(/^```(?:json)?\s*/iu, "")
      .replace(/\s*```$/iu, ""),
  );
}

function timeoutError(message) {
  const error = new Error(message);
  error.failureClass = "provider_connection";
  return error;
}

async function withTimeout(promise, timeoutMs, label) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(timeoutError(`${label} timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
        timeout.unref?.();
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

const useCases = {
  user_profile_page: "What stable task-relevant preferences should affect the answer?",
  project_page: "What is the concise active project state, blocker, and recent decision?",
  procedure_page: "Which repeated workflow checklist should be used?",
  source_page: "Which canonical source evidence should be cited?",
  decision_log: "What prior decision or stale/conflict marker matters?",
  timeline_page: "What changed recently?",
  entity_page: "What do we know about the relevant entity?",
  dashboard: "What memory health, stale, or conflict state matters?",
  agent_digest: "What compact agent context should be injected?",
  projection_digest: "Which projection index entry explains retrieval selection?",
};

const responseSchema = {
  type: "object",
  properties: {
    projection_type_used: { type: "string" },
    uses_projection_context: { type: "boolean" },
    answer: { type: "string" },
    cited_projection_id: { type: "string" },
    cited_source_memory_ids: { type: "array", items: { type: "string" } },
  },
  required: [
    "projection_type_used",
    "uses_projection_context",
    "answer",
    "cited_projection_id",
    "cited_source_memory_ids",
  ],
  additionalProperties: false,
};

async function main() {
  const root = repoRoot();
  const argv = process.argv.slice(2);
  const outputDir = path.resolve(
    root,
    readArgValue(argv, "--output-dir") ??
      ".artifacts/model-memory/projection-live-behavior/2026-04-23",
  );
  const modelId =
    readArgValue(argv, "--model") ??
    process.env.MODEL_MEMORY_PROJECTION_PROOF_MODEL_ID ??
    "openai-codex/gpt-5.4-mini";
  const speedArgs = readSpeedArgs(argv);
  const { createModelMemoryDatabaseRuntime } = await tsImport(
    path.join(root, "src/agents/model-memory.database.ts"),
    import.meta.url,
  );
  const runtimeReadModels = await tsImport(
    path.join(root, "extensions/model-memory/src/runtime-read-models.ts"),
    import.meta.url,
  );
  const compiler = await tsImport(
    path.join(root, "extensions/model-memory/src/projection-compiler.ts"),
    import.meta.url,
  );
  const materializer = await tsImport(
    path.join(root, "extensions/model-memory/src/runtime/projections/materializer.ts"),
    import.meta.url,
  );
  const retrievalPacks = await tsImport(
    path.join(root, "extensions/model-memory/src/runtime/context/retrieval-packs.ts"),
    import.meta.url,
  );
  const { OpenAICompatibleLiveJsonExecutor } = await tsImport(
    path.join(root, "src/agents/model-memory.live-json-executor.ts"),
    import.meta.url,
  );
  const { CodexAppServerJsonExecutor } = await tsImport(
    path.join(root, "extensions/model-memory/src/mmv2/codex-app-server-json-executor.ts"),
    import.meta.url,
  );

  await mkdir(outputDir, { recursive: true });
  const runtime = await createModelMemoryDatabaseRuntime({ applyMigrations: false });
  try {
    const memoryObjects = await runtimeReadModels.listRuntimeMemoryRecords(
      runtime.canonicalRepository,
    );
    const pages = compiler.compileProjectionCatalogPages({
      memoryObjects,
      builtAt: new Date(),
    });
    const activeIds = materializer.buildActiveProjectionSourceIdSet(memoryObjects);
    const materialized = await materializer.materializeProjectionArtifacts({
      workspaceRoot: root,
      entries: pages.map((page) => ({
        targetId: page.targetId,
        renderedText: page.renderedText,
        version: page.version,
        digest: page.digest,
      })),
      activeMemoryIds: activeIds,
      generatedAt: new Date(),
    });
    const executor = shouldUseCodexAppServer(modelId)
      ? new CodexAppServerJsonExecutor({
          cwd: root,
          requestTimeoutMs: 120000,
          reasoningEffort: speedArgs.codexReasoningEffort,
          ...(speedArgs.serviceTier ? { serviceTier: speedArgs.serviceTier } : {}),
        })
      : new OpenAICompatibleLiveJsonExecutor({ requestTimeoutMs: 120000 });
    const proofs = [];
    let modelRouteBlocked = false;
    for (const page of pages) {
      const projectionType = page.digest.projectionType;
      const artifact = retrievalPacks.buildRetrievalPackArtifact({
        retrievalRequest: {
          id: `retrieval-request-${projectionType}`,
          sessionId: `projection-proof-${projectionType}`,
          queryText: `sha256:${page.digest.contentHash}`,
          requestPurpose: useCases[projectionType] ?? "projection proof",
          scope: { projectId: "model-memory", retrievalRuntimeQueryHash: page.digest.contentHash },
          desiredResultCount: 3,
          contractName: "projection_live_behavior_proof",
          contractVersion: "v1",
          modelId,
          createdAt: new Date(),
        },
        retrievalResultSet: {
          id: `retrieval-set-${projectionType}`,
          retrievalRequestId: `retrieval-request-${projectionType}`,
          contentHash: page.digest.contentHash,
          resultCount: 0,
          createdAt: new Date(),
        },
        retrievalResultItems: [],
        memoryObjects,
        projectionVersions: [page.version],
        buildPolicyVersion: "projection-live-behavior-proof-v1",
      });
      const payload = artifact.structuredPayload;
      const requestContext = JSON.stringify(
        {
          projection_type: projectionType,
          projection_id: page.digest.projectionId,
          source_memory_ids: page.digest.sourceMemoryIds.slice(0, 16),
          retrieval_pack: artifact.renderedText,
        },
        null,
        2,
      );
      try {
        if (modelRouteBlocked) {
          throw timeoutError(`${modelId} route blocked after prior timeout/failure`);
        }
        const response = await withTimeout(
          executor.execute({
            contract: {
              contractName: "projection_live_behavior_proof",
              contractVersion: "v1",
              modelId,
            },
            systemPrompt:
              "Answer using only the provided projection-backed retrieval pack. Return strict JSON and cite the projection id plus source memory ids.",
            userPrompt: requestContext,
            responseFormat: "json",
            responseOptions: {
              transport: {
                type: "json_schema",
                name: "projection_live_behavior_proof",
                strict: true,
                schema: responseSchema,
              },
              provider: { requireParameters: true },
              promptCache: {
                key: `projection-proof:${projectionType}:${page.digest.contentHash.slice(0, 16)}`,
              },
              maxOutputTokens: 600,
              ...speedOptionsForModel(modelId, speedArgs),
            },
          }),
          shouldUseCodexAppServer(modelId) ? 45_000 : 90_000,
          `${modelId}/${projectionType}`,
        );
        proofs.push({
          projectionType,
          projectionId: page.digest.projectionId,
          sourceMemoryIds: page.digest.sourceMemoryIds,
          artifactPath: page.version.canonicalArtifactPath,
          retrievalTelemetry: {
            selectedProjectionIds: payload?.retrievalRun?.selectedProjectionIds,
            selectedSourceMemoryIds: payload?.retrievalRun?.metrics?.selectedSourceMemoryIds,
            packTypes: payload?.memoryPacks?.map((pack) => pack.packType),
          },
          modelResponse: parseJsonOutput(response.outputText),
          usage: response.usage,
          status: "passed",
        });
      } catch (error) {
        if (shouldUseCodexAppServer(modelId) && error?.failureClass === "provider_connection") {
          modelRouteBlocked = true;
        }
        proofs.push({
          projectionType,
          projectionId: page.digest.projectionId,
          sourceMemoryIds: page.digest.sourceMemoryIds,
          artifactPath: page.version.canonicalArtifactPath,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
          trace: error?.trace
            ? {
                failureClass: error.trace.failureClass,
                failureStage: error.trace.failureStage,
                httpStatus: error.trace.httpStatus,
              }
            : error?.failureClass
              ? { failureClass: error.failureClass }
              : undefined,
        });
      }
    }
    const report = {
      schema_version: "model_memory_projection_live_behavior_proof.v1",
      generated_at: new Date().toISOString(),
      modelId,
      materialized,
      proof_count: proofs.length,
      passed_count: proofs.filter((proof) => proof.status === "passed").length,
      root_write_back_status: "disabled",
      speed_controls: {
        api_reasoning_effort: speedArgs.apiReasoningEffort,
        codex_reasoning_effort: speedArgs.codexReasoningEffort,
        verbosity: speedArgs.verbosity,
        service_tier: speedArgs.serviceTier ?? null,
      },
      proofs,
    };
    await writeFile(
      path.join(outputDir, "projection-live-behavior-proof.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    console.log(
      JSON.stringify(
        { report: path.join(outputDir, "projection-live-behavior-proof.json") },
        null,
        2,
      ),
    );
    if (shouldUseCodexAppServer(modelId)) {
      const { clearSharedCodexAppServerClient } = await tsImport(
        path.join(root, "extensions/codex/src/app-server/shared-client.ts"),
        import.meta.url,
      );
      clearSharedCodexAppServerClient();
    }
  } finally {
    await runtime.pool.end?.();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
