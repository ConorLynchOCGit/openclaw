import type { InterpreterSourceWindow, SemanticInterpreter } from "./semantic-interpreter.ts";
import type { ModelMemoryObject } from "./semantic-schema.ts";
import type { ValidationFailure } from "./semantic-validator.ts";
import type {
  DocumentSourceEnvelope,
  DocumentSourceInput,
} from "./source-adapters/document-source-adapter.ts";
import type { ModelMemorySourceKind } from "./storage-database-contract.ts";

export type CapturedMemoryObject = {
  sourceWindowId: string;
  sourceKind: ModelMemorySourceKind;
  object: ModelMemoryObject;
  contractName: "semantic_extraction";
  contractVersion: string;
  modelId: string;
};

export type DocumentWindowIngestionResult =
  | {
      sourceWindowId: string;
      action: "ignore";
    }
  | {
      sourceWindowId: string;
      action: "capture";
      objects: CapturedMemoryObject[];
    }
  | {
      sourceWindowId: string;
      action: "reject";
      errors: ValidationFailure[];
      rawObjects: unknown[];
    };

export type DocumentIngestionResult = {
  source: DocumentSourceEnvelope["source"];
  windows: DocumentSourceEnvelope["windows"];
  windowResults: DocumentWindowIngestionResult[];
  capturedObjects: CapturedMemoryObject[];
};

export type IngestionBlockDescriptor = {
  id: string;
  headingPath: string[];
  lineStart: number;
  lineEnd: number;
  text: string;
};

export type IngestionSourceWindow = InterpreterSourceWindow & {
  blockDescriptors: IngestionBlockDescriptor[];
  createdAt?: Date;
};

export type SharedIngestionResult<
  TSource extends { id: string; sourceKind: ModelMemorySourceKind },
  TWindow extends IngestionSourceWindow,
> = {
  source: TSource;
  windows: TWindow[];
  windowResults: DocumentWindowIngestionResult[];
  capturedObjects: CapturedMemoryObject[];
};

export type DocumentIngestionInput = {
  document: DocumentSourceInput;
  modelId: string;
  candidateModelId?: string;
  interpreter: SemanticInterpreter;
  contractVersion?: string;
  candidateContractVersion?: string;
};
