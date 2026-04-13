import { completeSimple, type TextContent } from "@mariozechner/pi-ai";
import {
  buildModelSemanticInterpretationPrompt,
  MEMORY_SEMANTIC_INTERPRETATION_PROMPT_VERSION,
  resolveMemoryMiddlewareConfig,
  runMemorySemanticGoldCorpusBenchmark,
  evaluateMemorySemanticCalibration,
  MEMORY_SEMANTIC_GOLD_CORPUS,
  parseMemorySemanticInterpretationDecision,
  type MemorySemanticInterpretationInput,
  type MemorySemanticInterpretationResult,
  type MemorySemanticInterpreterPort,
} from "../extensions/memory-middleware/runtime-api.js";
import { requireApiKey } from "../src/agents/model-auth.js";
import { prepareSimpleCompletionModel } from "../src/agents/simple-completion-runtime.js";
import { prepareModelForSimpleCompletion } from "../src/agents/simple-completion-transport.js";
import { readBestEffortConfig, readConfigFileSnapshot } from "../src/config/config.js";

function readCaseFilters(argv: string[]): string[] {
  const filters: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--case" || arg === "--cases") {
      const next = argv[index + 1];
      if (next) {
        filters.push(
          ...next
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
        );
        index += 1;
      }
      continue;
    }
    if (arg.startsWith("--case=") || arg.startsWith("--cases=")) {
      filters.push(
        ...arg
          .slice(arg.indexOf("=") + 1)
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      );
    }
  }
  return [...new Set(filters)];
}

function readModelOverride(argv: string[]): string | null {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--model") {
      const next = argv[index + 1];
      return typeof next === "string" && next.trim().length > 0 ? next.trim() : null;
    }
    if (arg.startsWith("--model=")) {
      const value = arg.slice(arg.indexOf("=") + 1).trim();
      return value.length > 0 ? value : null;
    }
  }
  return null;
}

async function main() {
  const configSnapshot = await readConfigFileSnapshot();
  const config = await readBestEffortConfig();
  const argv = process.argv.slice(2);
  const requestedCaseIds = readCaseFilters(argv);
  const modelOverride =
    readModelOverride(argv) ?? process.env.OPENCLAW_MEMORY_LIVE_BENCHMARK_MODEL ?? null;
  const cases =
    requestedCaseIds.length > 0
      ? MEMORY_SEMANTIC_GOLD_CORPUS.filter((benchmarkCase) =>
          requestedCaseIds.includes(benchmarkCase.id),
        )
      : undefined;
  const configuredDefaultModel =
    typeof config?.agents?.defaults?.model === "string"
      ? config.agents.defaults.model.trim()
      : (config?.agents?.defaults?.model?.primary?.trim() ?? "");
  const defaultModelRef = (modelOverride ?? configuredDefaultModel).trim();
  const [provider, ...modelParts] = defaultModelRef.split("/");
  const modelId = modelParts.join("/");
  if (!provider || !modelId) {
    throw new Error(
      "memory live benchmark requires agents.defaults.model or --model to be configured",
    );
  }
  const interpreter = createDirectLiveBenchmarkInterpreter({
    config,
    provider,
    modelId,
  });
  const benchmark = await runMemorySemanticGoldCorpusBenchmark({
    config: resolveMemoryMiddlewareConfig({}),
    interpreter,
    ...(cases ? { cases } : {}),
  });
  const calibration = evaluateMemorySemanticCalibration({
    report: benchmark,
  });

  process.stdout.write(
    JSON.stringify(
      {
        configSnapshot: {
          path: configSnapshot.path,
          valid: configSnapshot.valid,
          ...(configSnapshot.valid ? {} : { validationErrors: configSnapshot.errors }),
        },
        command: process.argv.slice(1).join(" "),
        requestedCaseIds,
        ...(modelOverride ? { modelOverride } : {}),
        readiness: benchmark.readiness,
        execution: benchmark.execution,
        calibration,
        caseResults: benchmark.caseResults.map((result) => ({
          id: result.benchmarkCase.id,
          pass: result.pass,
          matchedObjectIds: result.matchedObjectIds,
          issues: result.issues,
          actual: result.actual,
        })),
      },
      null,
      2,
    ),
  );
}

function isTextContentBlock(block: { type: string }): block is TextContent {
  return block.type === "text";
}

function collectSimpleCompletionText(result: {
  content: Array<{ type: string; text?: string }>;
}): string {
  return result.content
    .filter(isTextContentBlock)
    .map((entry) => entry.text ?? "")
    .join("")
    .trim();
}

function stripCodeFences(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match?.[1] ? match[1].trim() : trimmed;
}

function createDirectLiveBenchmarkInterpreter(params: {
  config: Awaited<ReturnType<typeof readBestEffortConfig>>;
  provider: string;
  modelId: string;
}): MemorySemanticInterpreterPort {
  return {
    async interpretSourceWindow(
      input: MemorySemanticInterpretationInput,
    ): Promise<MemorySemanticInterpretationResult> {
      const prepared = await prepareSimpleCompletionModel({
        cfg: params.config,
        provider: params.provider,
        modelId: params.modelId,
      });
      if ("error" in prepared) {
        throw new Error(prepared.error);
      }
      const model = prepareModelForSimpleCompletion({
        model: prepared.model,
        cfg: params.config,
      });
      const auth = requireApiKey(prepared.auth, params.provider);
      const result = await completeSimple(
        model,
        {
          messages: [
            {
              role: "user",
              content: buildModelSemanticInterpretationPrompt(input),
              timestamp: Date.now(),
            },
          ],
        },
        {
          apiKey: auth,
          maxTokens: 4_000,
          temperature: 0,
        },
      );
      const rawText = stripCodeFences(collectSimpleCompletionText(result));
      if (!rawText) {
        throw new Error(
          `memory live benchmark returned empty output content=${JSON.stringify(result.content).slice(0, 1_000)}`,
        );
      }
      return {
        decision: parseMemorySemanticInterpretationDecision(JSON.parse(rawText) as unknown),
        modelId: `${params.provider}/${params.modelId}`,
        promptVersion: MEMORY_SEMANTIC_INTERPRETATION_PROMPT_VERSION,
      };
    },
  };
}

await main();
