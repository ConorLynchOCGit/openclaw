import { z } from "zod";
import { parseJsonModelOutput, type JsonModelExecutor } from "./model-execution.ts";
import type {
  SemanticInterpreter,
  SemanticInterpreterInput,
  SemanticInterpreterResult,
} from "./semantic-interpreter.ts";

const SemanticInterpreterResultSchema = z.union([
  z.object({
    action: z.literal("ignore"),
  }),
  z.object({
    action: z.literal("capture"),
    objects: z.array(z.unknown()),
  }),
]);

export class ExecutorBackedSemanticInterpreter implements SemanticInterpreter {
  constructor(private readonly executor: JsonModelExecutor) {}

  async interpret(input: SemanticInterpreterInput): Promise<SemanticInterpreterResult> {
    const response = await this.executor.execute({
      contract: input.prompt.contract,
      systemPrompt: input.prompt.systemPrompt,
      userPrompt: input.prompt.userPrompt,
      responseFormat: input.prompt.responseFormat,
      responseOptions: input.prompt.responseOptions,
    });
    return parseJsonModelOutput(response, input.prompt.contract, SemanticInterpreterResultSchema);
  }
}
