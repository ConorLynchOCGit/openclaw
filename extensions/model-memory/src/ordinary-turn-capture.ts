import type {
  CapturedMemoryObject,
  DocumentWindowIngestionResult,
  SharedIngestionResult,
} from "./document-ingestion.ts";
import { ingestSourceEnvelope } from "./document-ingestion.ts";
import type { SemanticInterpreter } from "./semantic-interpreter.ts";
import {
  adaptOrdinaryTurnSource,
  type OrdinaryTurnSourceInput,
} from "./source-adapters/ordinary-turn-source-adapter.ts";

export type CapturedTurnMemoryObject = CapturedMemoryObject;

export type OrdinaryTurnWindowCaptureResult = DocumentWindowIngestionResult;

export type OrdinaryTurnCaptureResult = SharedIngestionResult<
  ReturnType<typeof adaptOrdinaryTurnSource>["source"],
  ReturnType<typeof adaptOrdinaryTurnSource>["windows"][number]
>;

export type OrdinaryTurnCaptureInput = {
  turn: OrdinaryTurnSourceInput;
  modelId: string;
  candidateModelId?: string;
  interpreter: SemanticInterpreter;
  contractVersion?: string;
  candidateContractVersion?: string;
};

export async function captureOrdinaryTurn(
  input: OrdinaryTurnCaptureInput,
): Promise<OrdinaryTurnCaptureResult> {
  const envelope = adaptOrdinaryTurnSource(input.turn);
  return ingestSourceEnvelope({
    envelope,
    modelId: input.modelId,
    candidateModelId: input.candidateModelId,
    interpreter: input.interpreter,
    contractVersion: input.contractVersion,
    candidateContractVersion: input.candidateContractVersion,
  });
}
