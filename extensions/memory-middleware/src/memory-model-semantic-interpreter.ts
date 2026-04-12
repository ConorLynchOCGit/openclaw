import fs from "node:fs/promises";
import path from "node:path";
import type { OpenClawPluginApi } from "../api.js";
import {
  buildModelSemanticInterpretationPrompt,
  MEMORY_SEMANTIC_INTERPRETATION_PROMPT_VERSION,
  parseMemorySemanticInterpretationDecision,
  type MemorySemanticInterpretationInput,
  type MemorySemanticInterpretationResult,
  type MemorySemanticInterpreterPort,
} from "./memory-semantic-interpretation.js";
export type { MemorySemanticInterpreterPort } from "./memory-semantic-interpretation.js";

type ModelSelection = {
  provider: string;
  model: string;
};

type MinimalMemorySemanticConfig = {
  agents?:
    | {
        defaults?:
          | {
              model?: string | { primary?: string | null | undefined } | null | undefined;
              workspace?: string | null | undefined;
            }
          | null
          | undefined;
      }
    | null
    | undefined;
};

type EmbeddedPiPayloadEntry = {
  text?: string;
  isError?: boolean;
};

type EmbeddedPiResult = {
  payloads?: EmbeddedPiPayloadEntry[];
};

type RunEmbeddedPiAgentPort = (params: {
  sessionId: string;
  sessionFile: string;
  workspaceDir: string;
  config: MinimalMemorySemanticConfig;
  prompt: string;
  timeoutMs: number;
  runId: string;
  provider: string;
  model: string;
  authProfileIdSource: "auto";
  disableTools: boolean;
}) => Promise<EmbeddedPiResult>;

type MemoryModelSemanticInterpreterDeps = {
  runEmbeddedPiAgent: RunEmbeddedPiAgentPort;
  mkdtemp: typeof fs.mkdtemp;
  rm: typeof fs.rm;
};

function collectText(payloads: Array<{ text?: string; isError?: boolean }> | undefined): string {
  return (payloads ?? [])
    .filter((entry) => !entry.isError && typeof entry.text === "string")
    .map((entry) => entry.text ?? "")
    .join("\n")
    .trim();
}

function stripCodeFences(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match?.[1] ? match[1].trim() : trimmed;
}

function resolveDefaultModel(config: MinimalMemorySemanticConfig): ModelSelection {
  const defaultsModel = config?.agents?.defaults?.model;
  const primary =
    typeof defaultsModel === "string"
      ? defaultsModel.trim()
      : (defaultsModel?.primary?.trim() ?? "");
  const [provider, ...modelParts] = primary.split("/");
  const model = modelParts.join("/");
  if (!provider || !model) {
    throw new Error("memory semantic interpreter requires agents.defaults.model to be configured");
  }
  return { provider, model };
}

export function createModelDrivenMemorySemanticInterpreterFromRunner(params: {
  config: MinimalMemorySemanticConfig;
  workspaceDir?: string;
  runEmbeddedPiAgent: RunEmbeddedPiAgentPort;
  timeoutMs?: number;
  deps?: Partial<Omit<MemoryModelSemanticInterpreterDeps, "runEmbeddedPiAgent">>;
}): MemorySemanticInterpreterPort {
  const deps: MemoryModelSemanticInterpreterDeps = {
    runEmbeddedPiAgent: params.runEmbeddedPiAgent,
    mkdtemp: params.deps?.mkdtemp ?? fs.mkdtemp,
    rm: params.deps?.rm ?? fs.rm,
  };
  const defaultModel = resolveDefaultModel(params.config);
  const timeoutMs = params.timeoutMs ?? 30_000;
  const workspaceDir =
    params.workspaceDir ?? params.config?.agents?.defaults?.workspace ?? process.cwd();

  return {
    async interpretBlock(
      input: MemorySemanticInterpretationInput,
    ): Promise<MemorySemanticInterpretationResult> {
      const prompt = buildModelSemanticInterpretationPrompt(input);
      const tmpDir = await deps.mkdtemp(path.join("/tmp", "openclaw-memory-semantic-"));
      try {
        const runId = `memory-semantic-${Date.now()}`;
        const result = await deps.runEmbeddedPiAgent({
          sessionId: runId,
          sessionFile: path.join(tmpDir, "session.json"),
          workspaceDir,
          config: params.config,
          prompt,
          timeoutMs,
          runId,
          provider: defaultModel.provider,
          model: defaultModel.model,
          authProfileIdSource: "auto",
          disableTools: true,
        });
        const rawText = stripCodeFences(collectText(result.payloads));
        if (!rawText) {
          throw new Error("memory semantic interpreter returned empty output");
        }
        const parsed = JSON.parse(rawText) as unknown;
        return {
          decision: parseMemorySemanticInterpretationDecision(parsed),
          modelId: `${defaultModel.provider}/${defaultModel.model}`,
          promptVersion: MEMORY_SEMANTIC_INTERPRETATION_PROMPT_VERSION,
        };
      } finally {
        await deps.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
      }
    },
  };
}

export function createModelDrivenMemorySemanticInterpreter(params: {
  api: OpenClawPluginApi;
  timeoutMs?: number;
  deps?: Partial<MemoryModelSemanticInterpreterDeps>;
}): MemorySemanticInterpreterPort {
  const runEmbeddedPiAgent: RunEmbeddedPiAgentPort = async (input) =>
    (params.deps?.runEmbeddedPiAgent ?? params.api.runtime.agent.runEmbeddedPiAgent)({
      ...input,
      config: input.config as OpenClawPluginApi["config"],
    });
  return createModelDrivenMemorySemanticInterpreterFromRunner({
    config: params.api.config,
    workspaceDir: params.api.config?.agents?.defaults?.workspace ?? process.cwd(),
    runEmbeddedPiAgent,
    timeoutMs: params.timeoutMs,
    deps: {
      mkdtemp: params.deps?.mkdtemp,
      rm: params.deps?.rm,
    },
  });
}
