import { z } from "zod";
import type { JsonModelExecutor } from "../model-execution.ts";
import { parseJsonModelOutput } from "../model-execution.ts";
import type {
  SemanticInterpreter,
  SemanticInterpreterInput,
  SemanticInterpreterResult,
} from "../semantic-interpreter.ts";
import {
  ingestDocumentV2Shadow,
  type DocumentV2ShadowIngestionResult,
} from "./document-shadow-ingestion.ts";
import { buildModelCallTrace, type MmV2ModelCallTrace } from "./model-call-trace.ts";
import { MMV2_DOCUMENT_PROOF_CASES, type MmV2DocumentProofCase } from "./proof-corpus.ts";
import { prepareProofPrompt } from "./proof-prompt-normalization.ts";
import {
  buildMmV2ExecutionFailure,
  compareMmV2ProofRun,
  summarizeMmV2ProofResults,
  type MmV2ModelMetadata,
  type MmV2ProofCaseRunResult,
  type MmV2ProofCorpusResult,
} from "./proof-runner-core.ts";

export type MmV2ProofRealTrace = MmV2ModelCallTrace;

const SANITIZED_PROMPT_DELIVERY_CONTRACTS = new Set<string>(["mmv2-atomic-extraction-v1"]);

class TracingJsonModelExecutor implements JsonModelExecutor {
  readonly traces: MmV2ProofRealTrace[] = [];
  private nextNormalization: MmV2ProofRealTrace["normalization"] = null;

  constructor(private readonly delegate: JsonModelExecutor) {}

  setNextNormalization(normalization: MmV2ProofRealTrace["normalization"]) {
    this.nextNormalization = normalization ?? null;
  }

  async execute(request: Parameters<JsonModelExecutor["execute"]>[0]) {
    const response = await this.delegate.execute(request);
    this.traces.push(
      buildModelCallTrace({
        request,
        response,
        normalization: this.nextNormalization,
      }),
    );
    this.nextNormalization = null;
    return response;
  }
}

class MmV2ExecutorBackedInterpreter implements SemanticInterpreter {
  constructor(private readonly executor: JsonModelExecutor) {}

  async interpret(input: SemanticInterpreterInput): Promise<SemanticInterpreterResult> {
    const prepared = prepareProofPrompt(input.prompt, {
      deliverSanitizedContracts: SANITIZED_PROMPT_DELIVERY_CONTRACTS,
    });
    if (
      "setNextNormalization" in this.executor &&
      typeof this.executor.setNextNormalization === "function"
    ) {
      this.executor.setNextNormalization(prepared.normalization);
    }
    const prompt = prepared.prompt;
    const response = await this.executor.execute({
      contract: prompt.contract,
      systemPrompt: prompt.systemPrompt,
      userPrompt: prompt.userPrompt,
      responseFormat: prompt.responseFormat,
      responseOptions: prompt.responseOptions,
    });
    const parsed = parseJsonModelOutput(response, prompt.contract, z.unknown());
    const restored = prepared.restoreParsedOutput(parsed);
    if (Array.isArray(restored)) {
      return { action: "capture", objects: restored };
    }
    return { action: "capture", objects: [restored] };
  }
}

function providerFromModelId(modelId: string): string | null {
  const segments = modelId.split("/");
  return segments.length >= 2 ? (segments[0] ?? null) : null;
}

function buildCaseModelMetadata(
  requestedModelId: string,
  traces: MmV2ProofRealTrace[],
): MmV2ModelMetadata {
  return {
    requestedModelId,
    resolvedModelIds: Array.from(
      new Set(
        traces
          .map((trace) => trace.resolvedModelId)
          .filter((value): value is string => Boolean(value)),
      ),
    ),
    provider: providerFromModelId(requestedModelId),
    executorKind: "executor-backed",
  };
}

async function executeRealProofCase(input: {
  proofCase: MmV2DocumentProofCase;
  modelId: string;
  executor: JsonModelExecutor;
}): Promise<MmV2ProofCaseRunResult> {
  const tracingExecutor = new TracingJsonModelExecutor(input.executor);
  const interpreter = new MmV2ExecutorBackedInterpreter(tracingExecutor);
  try {
    const run: DocumentV2ShadowIngestionResult = await ingestDocumentV2Shadow({
      document: {
        externalSourceId: input.proofCase.id,
        text: input.proofCase.text,
      },
      modelId: input.modelId,
      interpreter,
      reconciliationNeighbors: input.proofCase.seededNeighbors,
      reconciliationNeighborsByCandidateId: input.proofCase.seededNeighborsByCandidateId,
    });
    return compareMmV2ProofRun({
      proofCase: input.proofCase,
      runMode: "real-model",
      modelMetadata: buildCaseModelMetadata(input.modelId, tracingExecutor.traces),
      run,
      modelCallCount: tracingExecutor.traces.length,
      modelCallTraces: tracingExecutor.traces,
    });
  } catch (error) {
    return buildMmV2ExecutionFailure({
      proofCase: input.proofCase,
      runMode: "real-model",
      modelMetadata: buildCaseModelMetadata(input.modelId, tracingExecutor.traces),
      error,
      modelCallCount: tracingExecutor.traces.length,
      modelCallTraces: tracingExecutor.traces,
    });
  }
}

export async function runMmV2ProofCaseReal(input: {
  proofCase: MmV2DocumentProofCase;
  modelId: string;
  executor: JsonModelExecutor;
}): Promise<MmV2ProofCaseRunResult> {
  return executeRealProofCase(input);
}

export async function runMmV2ProofCorpusReal(input: {
  proofCases?: MmV2DocumentProofCase[];
  modelId: string;
  executor: JsonModelExecutor;
}): Promise<MmV2ProofCorpusResult & { resultsWithRuns: MmV2ProofCaseRunResult[] }> {
  const proofCases = input.proofCases ?? MMV2_DOCUMENT_PROOF_CASES;
  const resultsWithRuns: MmV2ProofCaseRunResult[] = [];
  for (const proofCase of proofCases) {
    resultsWithRuns.push(
      await runMmV2ProofCaseReal({
        proofCase,
        modelId: input.modelId,
        executor: input.executor,
      }),
    );
  }

  const resolvedModelIds = Array.from(
    new Set(resultsWithRuns.flatMap((result) => result.modelMetadata.resolvedModelIds)),
  );
  const summary = summarizeMmV2ProofResults({
    runMode: "real-model",
    modelMetadata: {
      requestedModelId: input.modelId,
      resolvedModelIds,
      provider: providerFromModelId(input.modelId),
      executorKind: "executor-backed",
    },
    resultsWithRuns,
  });
  return {
    ...summary,
    resultsWithRuns,
  };
}
