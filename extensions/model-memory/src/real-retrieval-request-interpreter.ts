import { z } from "zod";
import { parseJsonModelOutput, type JsonModelExecutor } from "./model-execution.ts";
import { createModelContractMetadata } from "./prompt-contracts.ts";
import type {
  RetrievalRequestInterpreter,
  RetrievalRequestInterpreterInput,
  RetrievalRequestInterpreterResult,
} from "./retrieval-request-interpreter.ts";

const RetrievalRequestInterpreterResultSchema = z.union([
  z.object({
    action: z.literal("skip"),
  }),
  z.object({
    action: z.literal("retrieve"),
    request: z
      .object({
        goal: z.string().trim().min(1),
        canonicalClasses: z.array(z.enum(["user", "feedback", "project", "reference"])).default([]),
        kinds: z.array(z.enum(["preference", "fact", "rule", "procedure", "reference"])).optional(),
        scopeConstraints: z.record(z.string(), z.string().trim().min(1)).optional(),
        subjectHints: z.array(z.string().trim().min(1)).optional(),
        contentHints: z.array(z.string().trim().min(1)).optional(),
        desiredResultCount: z.number().int().min(1).max(20),
        requestConfidence: z.enum(["weak", "medium", "strong"]),
      })
      .strict(),
  }),
]);

export class ExecutorBackedRetrievalRequestInterpreter implements RetrievalRequestInterpreter {
  constructor(private readonly executor: JsonModelExecutor) {}

  async interpret(
    input: RetrievalRequestInterpreterInput,
  ): Promise<RetrievalRequestInterpreterResult> {
    const contract = createModelContractMetadata({
      contractName: input.prompt.contractName,
      contractVersion: input.prompt.contractVersion,
      modelId: input.prompt.modelId,
    });
    const response = await this.executor.execute({
      contract,
      systemPrompt: input.prompt.systemPrompt,
      userPrompt: input.prompt.userPrompt,
      responseFormat: input.prompt.responseFormat,
    });
    return parseJsonModelOutput(response, contract, RetrievalRequestInterpreterResultSchema);
  }
}
