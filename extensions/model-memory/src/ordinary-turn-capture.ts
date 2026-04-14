import { buildSemanticExtractionPrompt } from "./semantic-extraction-prompt.ts";
import type { SemanticInterpreter, SemanticInterpreterResult } from "./semantic-interpreter.ts";
import type { ModelMemoryObject } from "./semantic-schema.ts";
import type { SourceWindowValidationContext, ValidationFailure } from "./semantic-validator.ts";
import { validateMemoryObject } from "./semantic-validator.ts";
import {
  adaptOrdinaryTurnSource,
  type OrdinaryTurnSourceEnvelope,
  type OrdinaryTurnSourceInput,
} from "./source-adapters/ordinary-turn-source-adapter.ts";

export type CapturedTurnMemoryObject = {
  sourceWindowId: string;
  object: ModelMemoryObject;
  contractName: "semantic_extraction";
  contractVersion: string;
  modelId: string;
};

export type OrdinaryTurnWindowCaptureResult =
  | {
      sourceWindowId: string;
      action: "ignore";
    }
  | {
      sourceWindowId: string;
      action: "capture";
      objects: CapturedTurnMemoryObject[];
    }
  | {
      sourceWindowId: string;
      action: "reject";
      errors: ValidationFailure[];
      rawObjects: unknown[];
    };

export type OrdinaryTurnCaptureResult = {
  source: OrdinaryTurnSourceEnvelope["source"];
  windows: OrdinaryTurnSourceEnvelope["windows"];
  windowResults: OrdinaryTurnWindowCaptureResult[];
  capturedObjects: CapturedTurnMemoryObject[];
};

export type OrdinaryTurnCaptureInput = {
  turn: OrdinaryTurnSourceInput;
  modelId: string;
  interpreter: SemanticInterpreter;
  contractVersion?: string;
};

function createValidationContext(
  sourceWindow: OrdinaryTurnSourceEnvelope["windows"][number],
): SourceWindowValidationContext {
  return {
    availableBlockIds: sourceWindow.blockDescriptors.map((block) => block.id),
    lineStart: sourceWindow.lineStart,
    lineEnd: sourceWindow.lineEnd,
    headingPaths: [[]],
  };
}

function createCaptureObjects(
  sourceWindowId: string,
  objects: ModelMemoryObject[],
  modelId: string,
  contractVersion: string,
): CapturedTurnMemoryObject[] {
  return objects.map((object) => ({
    sourceWindowId,
    object,
    contractName: "semantic_extraction",
    contractVersion,
    modelId,
  }));
}

function extractValidationErrors(
  result: SemanticInterpreterResult,
  sourceWindow: OrdinaryTurnSourceEnvelope["windows"][number],
): { objects: ModelMemoryObject[]; errors: ValidationFailure[] } {
  if (result.action === "ignore") {
    return { objects: [], errors: [] };
  }

  const context = createValidationContext(sourceWindow);
  const acceptedObjects: ModelMemoryObject[] = [];
  const errors: ValidationFailure[] = [];

  for (const rawObject of result.objects) {
    const validation = validateMemoryObject(rawObject, context);
    if (validation.status === "accept") {
      acceptedObjects.push(validation.object);
      continue;
    }
    errors.push(...validation.errors);
  }

  return { objects: acceptedObjects, errors };
}

export async function captureOrdinaryTurn(
  input: OrdinaryTurnCaptureInput,
): Promise<OrdinaryTurnCaptureResult> {
  const envelope = adaptOrdinaryTurnSource(input.turn);
  const windowResults: OrdinaryTurnWindowCaptureResult[] = [];
  const capturedObjects: CapturedTurnMemoryObject[] = [];
  const contractVersion = input.contractVersion ?? "v1";

  for (const sourceWindow of envelope.windows) {
    const prompt = buildSemanticExtractionPrompt({
      sourceKind: "ordinary_turn",
      sourceWindow,
      modelId: input.modelId,
      contractVersion,
    });
    const interpretation = await input.interpreter.interpret({
      sourceKind: "ordinary_turn",
      sourceId: envelope.source.id,
      sourceWindow,
      prompt,
    });

    if (interpretation.action === "ignore") {
      windowResults.push({
        sourceWindowId: sourceWindow.id,
        action: "ignore",
      });
      continue;
    }

    const { objects, errors } = extractValidationErrors(interpretation, sourceWindow);
    if (errors.length > 0) {
      windowResults.push({
        sourceWindowId: sourceWindow.id,
        action: "reject",
        errors,
        rawObjects: interpretation.objects,
      });
      continue;
    }

    const accepted = createCaptureObjects(
      sourceWindow.id,
      objects,
      prompt.contract.modelId,
      prompt.contract.contractVersion,
    );
    capturedObjects.push(...accepted);
    windowResults.push({
      sourceWindowId: sourceWindow.id,
      action: "capture",
      objects: accepted,
    });
  }

  return {
    source: envelope.source,
    windows: envelope.windows,
    windowResults,
    capturedObjects,
  };
}
