import { ingestDocument } from "../document-ingestion.ts";
import { InMemoryMemoryObjectStore } from "../memory-object-store.ts";
import { captureOrdinaryTurn } from "../ordinary-turn-capture.ts";
import type {
  SemanticInterpreter,
  SemanticInterpreterInput,
  SemanticInterpreterResult,
} from "../semantic-interpreter.ts";
import type { ModelMemoryObject } from "../semantic-schema.ts";
import { compareCanonicalObjects } from "./object-comparison.ts";
import type { AuditedProofCase } from "./proof-corpus.ts";

export type ProofCaseResult = {
  caseId: string;
  pass: boolean;
  action: "capture" | "ignore";
  reasons: string[];
  matchedObjectCount: number;
  expectedObjectCount: number;
  actualObjectCount: number;
  writeDecision?: "ignore" | "attach_support" | "write" | "supersede";
  supersededObjectId?: string;
  duplicateObjectId?: string;
};

export type ProofCorpusResult = {
  results: ProofCaseResult[];
};

function createProofInterpreter(
  expectedAction: AuditedProofCase["expectedAction"],
  expectedObjects: ModelMemoryObject[],
): SemanticInterpreter {
  return {
    async interpret(input: SemanticInterpreterInput): Promise<SemanticInterpreterResult> {
      if (expectedAction === "ignore") {
        return { action: "ignore" };
      }
      const provenance = input.sourceWindow.blockDescriptors[0]
        ? [
            {
              sourceId: input.sourceWindow.id,
              blockId: input.sourceWindow.blockDescriptors[0].id,
              lineStart: input.sourceWindow.blockDescriptors[0].lineStart,
              lineEnd: input.sourceWindow.blockDescriptors[0].lineEnd,
              headingPath: input.sourceWindow.blockDescriptors[0].headingPath,
            },
          ]
        : [{ sourceId: input.sourceWindow.id, segmentIndex: 0, headingPath: [] }];

      if (input.prompt.contract.contractVersion === "v2-candidate") {
        return {
          action: "capture",
          objects: expectedObjects.map((object) => ({
            candidateType: object.kind,
            claim:
              object.kind === "fact"
                ? `${object.payload.subject}: ${object.payload.value}`.trim()
                : object.kind === "preference"
                  ? object.payload.instruction
                  : object.kind === "rule"
                    ? (object.payload.recommendedAction ??
                      object.payload.avoidAction ??
                      object.payload.neededCapability ??
                      object.payload.subject)
                    : object.kind === "procedure"
                      ? object.payload.title
                      : object.payload.task,
            supportingSpans: provenance.map((span) => ({
              blockId: "blockId" in span ? span.blockId : undefined,
              lineStart: "lineStart" in span ? span.lineStart : undefined,
              lineEnd: "lineEnd" in span ? span.lineEnd : undefined,
              headingPath: span.headingPath,
            })),
            confidence: object.confidence,
            shouldStore: true,
          })),
        };
      }

      return {
        action: "capture",
        objects: expectedObjects.map((object) => ({
          ...object,
          provenance,
        })),
      };
    },
  };
}

export async function runAuditedProofCase(
  proofCase: AuditedProofCase,
  store: InMemoryMemoryObjectStore | undefined,
  priorWriteMap: Map<string, { memoryObjectId?: string }>,
): Promise<ProofCaseResult> {
  const interpreter = createProofInterpreter(proofCase.expectedAction, proofCase.expectedObjects);

  if (proofCase.sourceKind === "document") {
    const result = await ingestDocument({
      document: {
        externalSourceId: proofCase.id,
        text: proofCase.text,
      },
      modelId: "proof-model-001",
      interpreter,
    });
    const actualObjects = result.capturedObjects.map((entry) => entry.object);
    const comparison = compareCanonicalObjects(actualObjects, proofCase.expectedObjects);
    const writeOutcome = handleProofWrites(
      proofCase,
      result.capturedObjects.map((entry) => ({
        sourceWindowId: entry.sourceWindowId,
        object: entry.object,
        contractName: entry.contractName,
        contractVersion: entry.contractVersion,
        modelId: entry.modelId,
      })),
      store,
      priorWriteMap,
    );
    return {
      caseId: proofCase.id,
      pass: buildProofPass(proofCase, result.capturedObjects.length, comparison, writeOutcome),
      action: proofCase.expectedAction,
      reasons:
        proofCase.expectedAction === "ignore"
          ? result.capturedObjects.length === 0
            ? []
            : ["expected_ignore_but_captured"]
          : [...comparison.reasons, ...writeOutcome.reasons],
      matchedObjectCount: comparison.matchedObjectCount,
      expectedObjectCount: comparison.expectedObjectCount,
      actualObjectCount: comparison.actualObjectCount,
      writeDecision: writeOutcome.writeDecision,
      supersededObjectId: writeOutcome.supersededObjectId,
      duplicateObjectId: writeOutcome.duplicateObjectId,
    };
  }

  const result = await captureOrdinaryTurn({
    turn: { currentTurnText: proofCase.text },
    modelId: "proof-model-001",
    interpreter,
  });
  const actualObjects = result.capturedObjects.map((entry) => entry.object);
  const comparison = compareCanonicalObjects(actualObjects, proofCase.expectedObjects);
  const writeOutcome = handleProofWrites(
    proofCase,
    result.capturedObjects.map((entry) => ({
      sourceWindowId: entry.sourceWindowId,
      object: entry.object,
      contractName: entry.contractName,
      contractVersion: entry.contractVersion,
      modelId: entry.modelId,
    })),
    store,
    priorWriteMap,
  );
  return {
    caseId: proofCase.id,
    pass: buildProofPass(proofCase, result.capturedObjects.length, comparison, writeOutcome),
    action: proofCase.expectedAction,
    reasons:
      proofCase.expectedAction === "ignore"
        ? result.capturedObjects.length === 0
          ? []
          : ["expected_ignore_but_captured"]
        : [...comparison.reasons, ...writeOutcome.reasons],
    matchedObjectCount: comparison.matchedObjectCount,
    expectedObjectCount: comparison.expectedObjectCount,
    actualObjectCount: comparison.actualObjectCount,
    writeDecision: writeOutcome.writeDecision,
    supersededObjectId: writeOutcome.supersededObjectId,
    duplicateObjectId: writeOutcome.duplicateObjectId,
  };
}

export async function runAuditedProofCorpus(
  proofCases: AuditedProofCase[],
): Promise<ProofCorpusResult> {
  const results: ProofCaseResult[] = [];
  const store = new InMemoryMemoryObjectStore();
  const priorWriteMap = new Map<string, { memoryObjectId?: string }>();
  for (const proofCase of proofCases) {
    results.push(await runAuditedProofCase(proofCase, store, priorWriteMap));
  }
  return { results };
}

type ProofWriteOutcome = {
  reasons: string[];
  writeDecision?: "ignore" | "attach_support" | "write" | "supersede";
  supersededObjectId?: string;
  duplicateObjectId?: string;
};

function buildProofPass(
  proofCase: AuditedProofCase,
  capturedObjectCount: number,
  comparison: ReturnType<typeof compareCanonicalObjects>,
  writeOutcome: ProofWriteOutcome,
): boolean {
  if (proofCase.expectedAction === "ignore") {
    return capturedObjectCount === 0;
  }
  return comparison.pass && writeOutcome.reasons.length === 0;
}

function handleProofWrites(
  proofCase: AuditedProofCase,
  capturedObjects: Array<{
    sourceWindowId: string;
    object: ModelMemoryObject;
    contractName: string;
    contractVersion: string;
    modelId: string;
  }>,
  store: InMemoryMemoryObjectStore | undefined,
  priorWriteMap: Map<string, { memoryObjectId?: string }>,
): ProofWriteOutcome {
  if (proofCase.expectedAction === "ignore" || !proofCase.expectedWriteDecision) {
    return { reasons: [] };
  }
  if (!store) {
    return { reasons: ["missing_store_for_write_expectation"] };
  }
  if (capturedObjects.length !== 1) {
    return { reasons: ["write_proof_requires_single_object_capture"] };
  }

  const writeResult = store.writeCapturedObject(capturedObjects[0]);
  const reasons: string[] = [];
  if (writeResult.decision !== proofCase.expectedWriteDecision) {
    reasons.push(
      `write_decision_mismatch:${writeResult.decision}:${proofCase.expectedWriteDecision}`,
    );
  }

  if (proofCase.expectedDuplicateOfCaseId) {
    const prior = priorWriteMap.get(proofCase.expectedDuplicateOfCaseId);
    if (!prior?.memoryObjectId) {
      reasons.push(`missing_duplicate_prerequisite:${proofCase.expectedDuplicateOfCaseId}`);
    } else if (writeResult.writeEvent.memoryObjectId !== prior.memoryObjectId) {
      reasons.push(
        `duplicate_target_mismatch:${writeResult.writeEvent.memoryObjectId ?? "none"}:${prior.memoryObjectId}`,
      );
    }
  }

  if (proofCase.expectedSupersededCaseId) {
    const prior = priorWriteMap.get(proofCase.expectedSupersededCaseId);
    if (!prior?.memoryObjectId) {
      reasons.push(`missing_supersession_prerequisite:${proofCase.expectedSupersededCaseId}`);
    } else if (writeResult.supersessionLink?.priorObjectId !== prior.memoryObjectId) {
      reasons.push(
        `supersession_target_mismatch:${writeResult.supersessionLink?.priorObjectId ?? "none"}:${prior.memoryObjectId}`,
      );
    }
  }

  priorWriteMap.set(proofCase.id, { memoryObjectId: writeResult.memoryObject?.id });
  return {
    reasons,
    writeDecision: writeResult.decision,
    supersededObjectId: writeResult.supersessionLink?.priorObjectId,
    duplicateObjectId: writeResult.writeEvent.memoryObjectId,
  };
}
