import type { MemoryMiddlewareConfig } from "./config.js";
import type { DocumentMemoryIngestionSource } from "./document-memory-ingestion-types.js";
import { resolveDocumentMemoryIngestionCategoryForSemanticObject } from "./document-memory-ingestion-types.js";
import { collectPlannedMemorySemanticCaptures } from "./memory-semantic-capture-service.js";
import type {
  MemoryCanonicalClass,
  MemorySemanticInterpretationLane,
  MemorySemanticInterpreterPort,
  MemorySemanticObject,
} from "./memory-semantic-interpretation.js";
import { resolveCanonicalMemoryClassForSemanticObject } from "./memory-semantic-interpretation.js";
import {
  normalizeDocumentMemorySource,
  normalizeTranscriptMemorySource,
  type NormalizedTranscriptContextEntry,
} from "./memory-source-normalization.js";
import { buildMemorySourceWindows } from "./memory-source-windowing.js";

export type MemorySemanticCrossLaneReplayOutcome = {
  canonicalClass: MemoryCanonicalClass;
  kind: MemorySemanticObject["kind"];
  compatibilityCategory: ReturnType<typeof resolveDocumentMemoryIngestionCategoryForSemanticObject>;
  subject: string;
  statement: string;
  subjectKey: string;
  clusterKey: string;
  dedupeKey: string;
  reviewMode: "direct" | "pending_confirmation" | "hold_for_more_evidence";
};

export type MemorySemanticCrossLaneReplayReport = {
  document: MemorySemanticCrossLaneReplayOutcome[];
  ordinaryTurn: MemorySemanticCrossLaneReplayOutcome[];
  missingFromDocument: string[];
  missingFromOrdinaryTurn: string[];
  pass: boolean;
};

function dedupeReplayOutcomes(
  outcomes: MemorySemanticCrossLaneReplayOutcome[],
): MemorySemanticCrossLaneReplayOutcome[] {
  const deduped = new Map<string, MemorySemanticCrossLaneReplayOutcome>();
  for (const outcome of outcomes) {
    deduped.set(outcome.dedupeKey, outcome);
  }
  return [...deduped.values()].sort((left, right) => left.dedupeKey.localeCompare(right.dedupeKey));
}

async function collectReplayOutcomes(params: {
  config: MemoryMiddlewareConfig;
  lane: MemorySemanticInterpretationLane;
  interpreter: MemorySemanticInterpreterPort;
  windows: ReturnType<typeof buildMemorySourceWindows>;
  projectId?: string;
}): Promise<MemorySemanticCrossLaneReplayOutcome[]> {
  const planned = await collectPlannedMemorySemanticCaptures({
    config: params.config,
    lane: params.lane,
    windows: params.windows,
    interpreter: params.interpreter,
    ...(params.projectId ? { projectId: params.projectId } : {}),
  });

  return dedupeReplayOutcomes(
    planned.captures
      .filter((capture) => capture.materialized.action === "capture")
      .map((capture) => ({
        canonicalClass: resolveCanonicalMemoryClassForSemanticObject(capture.materialized.object),
        kind: capture.materialized.object.kind,
        compatibilityCategory: resolveDocumentMemoryIngestionCategoryForSemanticObject(
          capture.materialized.object,
        ),
        subject: capture.identity.subject,
        statement: capture.identity.statement,
        subjectKey: capture.identity.subjectKey,
        clusterKey: capture.identity.clusterKey,
        dedupeKey: capture.identity.dedupeKey,
        reviewMode: capture.validated.reviewMode,
      })),
  );
}

export async function runMemorySemanticCrossLaneReplay(params: {
  config: MemoryMiddlewareConfig;
  interpreter: MemorySemanticInterpreterPort;
  document: {
    source: DocumentMemoryIngestionSource;
    content: string;
    projectScope?: string;
  };
  ordinaryTurn: {
    sourceId: string;
    sessionKey: string;
    text: string;
    parentContext?: NormalizedTranscriptContextEntry[];
    projectId?: string;
    projectScope?: string;
    workflowScope?: string;
  };
}): Promise<MemorySemanticCrossLaneReplayReport> {
  const documentBlocks = normalizeDocumentMemorySource({
    source: {
      kind: "document",
      sourceId: params.document.source.path,
      path: params.document.source.path,
      ...(params.document.source.projectId ? { projectId: params.document.source.projectId } : {}),
      ...(params.document.source.agentId ? { agentId: params.document.source.agentId } : {}),
      sourceClass: params.document.source.sourceClass ?? "project",
    },
    content: params.document.content,
    maxBlockChars: 2_000,
    ...(params.document.projectScope ? { projectScope: params.document.projectScope } : {}),
  });
  const ordinaryTurnBlocks = normalizeTranscriptMemorySource({
    source: {
      kind: "transcript",
      sourceId: params.ordinaryTurn.sourceId,
      sessionKey: params.ordinaryTurn.sessionKey,
      ...(params.ordinaryTurn.projectId ? { projectId: params.ordinaryTurn.projectId } : {}),
      sourceClass: "ordinary_turn_replay",
    },
    text: params.ordinaryTurn.text,
    parentContext: params.ordinaryTurn.parentContext ?? [],
    maxSegments: 8,
    ...(params.ordinaryTurn.projectScope ? { projectScope: params.ordinaryTurn.projectScope } : {}),
    ...(params.ordinaryTurn.workflowScope
      ? { workflowScope: params.ordinaryTurn.workflowScope }
      : {}),
  });

  const document = await collectReplayOutcomes({
    config: params.config,
    lane: "document_ingestion",
    interpreter: params.interpreter,
    windows: buildMemorySourceWindows({
      blocks: documentBlocks,
      maxWindowChars: 4_000,
      maxBlocksPerWindow: 6,
    }),
    ...(params.document.source.projectId ? { projectId: params.document.source.projectId } : {}),
  });
  const ordinaryTurn = await collectReplayOutcomes({
    config: params.config,
    lane: "ordinary_turn_capture",
    interpreter: params.interpreter,
    windows: buildMemorySourceWindows({
      blocks: ordinaryTurnBlocks,
      maxWindowChars: 2_400,
      maxBlocksPerWindow: 6,
    }),
    ...(params.ordinaryTurn.projectId ? { projectId: params.ordinaryTurn.projectId } : {}),
  });

  const documentKeys = new Set(document.map((outcome) => outcome.dedupeKey));
  const ordinaryTurnKeys = new Set(ordinaryTurn.map((outcome) => outcome.dedupeKey));

  return {
    document,
    ordinaryTurn,
    missingFromDocument: ordinaryTurn
      .filter((outcome) => !documentKeys.has(outcome.dedupeKey))
      .map((outcome) => outcome.dedupeKey),
    missingFromOrdinaryTurn: document
      .filter((outcome) => !ordinaryTurnKeys.has(outcome.dedupeKey))
      .map((outcome) => outcome.dedupeKey),
    pass:
      document.length === ordinaryTurn.length &&
      document.every((outcome) => ordinaryTurnKeys.has(outcome.dedupeKey)),
  };
}
