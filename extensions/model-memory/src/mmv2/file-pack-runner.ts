import { z } from "zod";
import type { JsonModelExecutor } from "../model-execution.ts";
import { JsonModelOutputError, parseJsonModelOutput } from "../model-execution.ts";
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
import { simulateWritePolicy, type MmV2WriteSimulationResult } from "./write-simulation.ts";

export type MmV2FilePackDocument = {
  id: string;
  title: string;
  text: string;
  path: string;
  projectId?: string;
};

export type MmV2FilePackTrace = MmV2ModelCallTrace;

export type MmV2FilePackPerDocumentResult = {
  documentId: string;
  title: string;
  path: string;
  status: "pass" | "execution_failed";
  error?: {
    name: string;
    message: string;
    contractName?: string;
    contractVersion?: string;
    outputTextExcerpt?: string;
  };
  modelMetadata: {
    requestedModelId: string;
    resolvedModelIds: string[];
  };
  modelCallCount: number;
  modelCallTraces: MmV2FilePackTrace[];
  canonicalCount: number;
  retainedCount: number;
  realisticWriteCount: number;
  admissionCounts: Record<string, number>;
  reconciliationCounts: Record<string, number>;
  writeSimulation: MmV2WriteSimulationResult;
  compositePolicy: {
    retainedParents: number;
    rejectedParents: number;
    embeddedChildCount: number;
    promotedChildCount: number;
    blockedChildCount: number;
  };
  run?: DocumentV2ShadowIngestionResult;
};

export type MmV2FilePackAggregateSummary = {
  totalDocuments: number;
  executionFailedDocuments: number;
  canonicalCount: number;
  retainedCount: number;
  realisticWriteCount: number;
  totalModelCalls: number;
  retainedParents: number;
  rejectedParents: number;
  embeddedChildCount: number;
  promotedChildCount: number;
  blockedChildCount: number;
};

export type MmV2FilePackRunResult = {
  generatedAt: string;
  modelMetadata: {
    requestedModelId: string;
    resolvedModelIds: string[];
  };
  summary: MmV2FilePackAggregateSummary;
  documents: MmV2FilePackPerDocumentResult[];
};

class TracingJsonModelExecutor implements JsonModelExecutor {
  readonly traces: MmV2FilePackTrace[] = [];

  constructor(private readonly delegate: JsonModelExecutor) {}

  async execute(request: Parameters<JsonModelExecutor["execute"]>[0]) {
    const response = await this.delegate.execute(request);
    this.traces.push(buildModelCallTrace({ request, response }));
    return response;
  }
}

class MmV2ExecutorBackedInterpreter implements SemanticInterpreter {
  constructor(private readonly executor: JsonModelExecutor) {}

  async interpret(input: SemanticInterpreterInput): Promise<SemanticInterpreterResult> {
    const response = await this.executor.execute({
      contract: input.prompt.contract,
      systemPrompt: input.prompt.systemPrompt,
      userPrompt: input.prompt.userPrompt,
      responseFormat: input.prompt.responseFormat,
      responseOptions: input.prompt.responseOptions,
    });
    const parsed = parseJsonModelOutput(response, input.prompt.contract, z.unknown());
    if (Array.isArray(parsed)) {
      return { action: "capture", objects: parsed };
    }
    return { action: "capture", objects: [parsed] };
  }
}

function countBy<TValue extends string>(values: TValue[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function buildPerDocumentResult(input: {
  document: MmV2FilePackDocument;
  modelId: string;
  traces: MmV2FilePackTrace[];
  run: DocumentV2ShadowIngestionResult;
}): MmV2FilePackPerDocumentResult {
  const writeSimulation = simulateWritePolicy({
    canonicalBatch: input.run.canonicalization,
    admissionBatch: input.run.admission,
    reconciliationDecisions: input.run.reconciliation,
    shadowRecording: input.run.shadowRecording,
  });

  const retainedParents = input.run.compositePolicy.parentRetention.filter(
    (decision) => decision.retainParent,
  ).length;
  const rejectedParents = input.run.compositePolicy.parentRetention.length - retainedParents;
  const embeddedChildCount = input.run.compositePolicy.childPromotions.filter(
    (decision) => decision.promotion === "embedded_only",
  ).length;
  const promotedChildCount = input.run.compositePolicy.childPromotions.filter(
    (decision) => decision.enterStandaloneLane,
  ).length;
  const blockedChildCount = input.run.compositePolicy.childPromotions.filter(
    (decision) => decision.promotion === "blocked",
  ).length;

  return {
    documentId: input.document.id,
    title: input.document.title,
    path: input.document.path,
    status: "pass",
    modelMetadata: {
      requestedModelId: input.modelId,
      resolvedModelIds: Array.from(
        new Set(
          input.traces
            .map((trace) => trace.resolvedModelId)
            .filter((value): value is string => Boolean(value)),
        ),
      ),
    },
    modelCallCount: input.traces.length,
    modelCallTraces: input.traces,
    canonicalCount: input.run.canonicalization.canonical_candidates.length,
    retainedCount: input.run.admission.decisions.filter((decision) => decision.decision === "admit")
      .length,
    realisticWriteCount: writeSimulation.summary.realisticDurableMemoryCount,
    admissionCounts: countBy(input.run.admission.decisions.map((decision) => decision.decision)),
    reconciliationCounts: countBy(input.run.reconciliation.map((decision) => decision.decision)),
    writeSimulation,
    compositePolicy: {
      retainedParents,
      rejectedParents,
      embeddedChildCount,
      promotedChildCount,
      blockedChildCount,
    },
    run: input.run,
  };
}

export async function runMmV2DocumentFilePack(input: {
  documents: MmV2FilePackDocument[];
  modelId: string;
  executor: JsonModelExecutor;
}): Promise<MmV2FilePackRunResult> {
  const generatedAt = new Date().toISOString();
  const documents: MmV2FilePackPerDocumentResult[] = [];

  for (const document of input.documents) {
    const tracingExecutor = new TracingJsonModelExecutor(input.executor);
    const interpreter = new MmV2ExecutorBackedInterpreter(tracingExecutor);
    try {
      const run = await ingestDocumentV2Shadow({
        document: {
          externalSourceId: document.id,
          text: document.text,
          projectId: document.projectId,
          sourceMetadata: { path: document.path },
        },
        modelId: input.modelId,
        interpreter,
      });
      documents.push(
        buildPerDocumentResult({
          document,
          modelId: input.modelId,
          traces: tracingExecutor.traces,
          run,
        }),
      );
    } catch (error) {
      const lastTrace = tracingExecutor.traces.at(-1);
      documents.push({
        documentId: document.id,
        title: document.title,
        path: document.path,
        status: "execution_failed",
        error: {
          name: error instanceof Error ? error.name : "Error",
          message: error instanceof Error ? error.message : String(error),
          contractName:
            error instanceof JsonModelOutputError
              ? error.contract.contractName
              : lastTrace?.contractName,
          contractVersion:
            error instanceof JsonModelOutputError
              ? error.contract.contractVersion
              : lastTrace?.contractVersion,
          outputTextExcerpt:
            error instanceof JsonModelOutputError ? error.outputText.slice(0, 1200) : undefined,
        },
        modelMetadata: {
          requestedModelId: input.modelId,
          resolvedModelIds: Array.from(
            new Set(
              tracingExecutor.traces
                .map((trace) => trace.resolvedModelId)
                .filter((value): value is string => Boolean(value)),
            ),
          ),
        },
        modelCallCount: tracingExecutor.traces.length,
        modelCallTraces: tracingExecutor.traces,
        canonicalCount: 0,
        retainedCount: 0,
        realisticWriteCount: 0,
        admissionCounts: {},
        reconciliationCounts: {},
        writeSimulation: {
          candidates: [],
          summary: {
            candidateCount: 0,
            shadowDurableMemoryCount: 0,
            realisticDurableMemoryCount: 0,
            overstatementCount: 0,
            dispositionCounts: {
              create_new_memory: 0,
              logical_merge_existing: 0,
              keep_existing_noop: 0,
              create_superseding_memory: 0,
              create_conflict_record: 0,
              quarantine: 0,
              reject: 0,
              embed_only: 0,
            },
          },
        },
        compositePolicy: {
          retainedParents: 0,
          rejectedParents: 0,
          embeddedChildCount: 0,
          promotedChildCount: 0,
          blockedChildCount: 0,
        },
      });
    }
  }

  const resolvedModelIds = Array.from(
    new Set(documents.flatMap((document) => document.modelMetadata.resolvedModelIds)),
  );

  return {
    generatedAt,
    modelMetadata: {
      requestedModelId: input.modelId,
      resolvedModelIds,
    },
    summary: {
      totalDocuments: documents.length,
      executionFailedDocuments: documents.filter(
        (document) => document.status === "execution_failed",
      ).length,
      canonicalCount: documents.reduce((sum, document) => sum + document.canonicalCount, 0),
      retainedCount: documents.reduce((sum, document) => sum + document.retainedCount, 0),
      realisticWriteCount: documents.reduce(
        (sum, document) => sum + document.realisticWriteCount,
        0,
      ),
      totalModelCalls: documents.reduce((sum, document) => sum + document.modelCallCount, 0),
      retainedParents: documents.reduce(
        (sum, document) => sum + document.compositePolicy.retainedParents,
        0,
      ),
      rejectedParents: documents.reduce(
        (sum, document) => sum + document.compositePolicy.rejectedParents,
        0,
      ),
      embeddedChildCount: documents.reduce(
        (sum, document) => sum + document.compositePolicy.embeddedChildCount,
        0,
      ),
      promotedChildCount: documents.reduce(
        (sum, document) => sum + document.compositePolicy.promotedChildCount,
        0,
      ),
      blockedChildCount: documents.reduce(
        (sum, document) => sum + document.compositePolicy.blockedChildCount,
        0,
      ),
    },
    documents,
  };
}
