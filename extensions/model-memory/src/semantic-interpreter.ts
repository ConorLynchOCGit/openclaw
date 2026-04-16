import type { ModelContractMetadata } from "./prompt-contracts.ts";
import type { ModelMemorySourceKind } from "./storage-database-contract.ts";

export type InterpreterSourceWindow = {
  id: string;
  sourceId: string;
  windowIndex: number;
  normalizedText: string;
  normalizedFingerprint: string;
  tokenEstimate: number;
  headingPath: string[];
  lineStart?: number;
  lineEnd?: number;
  blockDescriptors: Array<{
    id: string;
    headingPath: string[];
    lineStart: number;
    lineEnd: number;
    text: string;
  }>;
};

export type SemanticExtractionPrompt = {
  contract: ModelContractMetadata;
  systemPrompt: string;
  userPrompt: string;
  responseFormat: "json";
};

export type SemanticInterpreterInput = {
  sourceKind: ModelMemorySourceKind;
  sourceId: string;
  sourceWindow: InterpreterSourceWindow;
  prompt: SemanticExtractionPrompt;
};

export type SemanticInterpreterResult =
  | { action: "ignore" }
  | { action: "capture"; objects: unknown[] };

export interface SemanticInterpreter {
  interpret(input: SemanticInterpreterInput): Promise<SemanticInterpreterResult>;
}
