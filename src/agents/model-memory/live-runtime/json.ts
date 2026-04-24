import type {
  JsonModelExecutionRequest,
  JsonModelExecutionResponse,
  JsonModelExecutor,
  SemanticInterpreter,
  SemanticInterpreterInput,
} from "../../../plugin-sdk/model-memory.js";
import { OpenAICompatibleLiveJsonExecutor } from "../../model-memory.live-json-executor.js";
import type { OpenClawConfig } from "../../../config/config.js";

function stripOuterJsonCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match?.[1]?.trim() ?? trimmed;
}

function extractStructuredJsonCandidate(text: string): string {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const objectStart = text.indexOf("{");
  const objectEnd = text.lastIndexOf("}");
  if (objectStart !== -1 && objectEnd > objectStart) {
    return text.slice(objectStart, objectEnd + 1).trim();
  }

  const arrayStart = text.indexOf("[");
  const arrayEnd = text.lastIndexOf("]");
  if (arrayStart !== -1 && arrayEnd > arrayStart) {
    return text.slice(arrayStart, arrayEnd + 1).trim();
  }

  return text.trim();
}

export function parseMmV2RawJsonOutput(outputText: string): unknown {
  return JSON.parse(extractStructuredJsonCandidate(stripOuterJsonCodeFence(outputText)));
}

export class ExecutorBackedMmV2SemanticInterpreter implements SemanticInterpreter {
  constructor(private readonly executor: JsonModelExecutor) {}

  async interpret(input: SemanticInterpreterInput) {
    const response = await this.executor.execute({
      contract: input.prompt.contract,
      systemPrompt: input.prompt.systemPrompt,
      userPrompt: input.prompt.userPrompt,
      responseFormat: input.prompt.responseFormat,
      responseOptions: input.prompt.responseOptions,
    });
    return {
      action: "capture" as const,
      objects: [parseMmV2RawJsonOutput(response.outputText)],
    };
  }
}

export class CompositeModelMemoryJsonExecutor implements JsonModelExecutor {
  private readonly httpExecutor: OpenAICompatibleLiveJsonExecutor;

  constructor(private readonly config?: OpenClawConfig) {
    this.httpExecutor = new OpenAICompatibleLiveJsonExecutor({ config });
  }

  async execute(request: JsonModelExecutionRequest): Promise<JsonModelExecutionResponse> {
    return await this.httpExecutor.execute(request);
  }
}
