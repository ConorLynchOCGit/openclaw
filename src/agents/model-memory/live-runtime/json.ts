import { parseStructuredJsonCandidate } from "../../../../extensions/model-memory/src/structured-json.ts";
import type { OpenClawConfig } from "../../../config/config.js";
import type {
  JsonModelExecutionRequest,
  JsonModelExecutionResponse,
  JsonModelExecutor,
  SemanticInterpreter,
  SemanticInterpreterInput,
} from "../../../plugin-sdk/model-memory.js";
import { OpenAICompatibleLiveJsonExecutor } from "../../model-memory.live-json-executor.js";

export function parseMmV2RawJsonOutput(outputText: string): unknown {
  return parseStructuredJsonCandidate(outputText);
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
