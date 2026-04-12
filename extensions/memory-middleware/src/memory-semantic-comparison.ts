import type { MemoryMiddlewareConfig } from "./config.js";
import type { DocumentMemoryIngestionCategory } from "./document-memory-ingestion-types.js";
import { buildCanonicalMemoryIngestionCandidateFromResolvedIngestion } from "./memory-canonical-compat-builders.js";
import {
  type ResolvedCanonicalizableIngestion,
  resolveProjectFactIngestion,
  resolveRecurringProcedureIngestion,
  resolveResponseStyleIngestion,
  resolveWorkflowImprovementIngestion,
} from "./memory-ingestion-resolver.js";
import type {
  MemorySemanticInterpretationLane,
  MemorySemanticInterpreterPort,
} from "./memory-semantic-interpretation.js";
import {
  planNormalizedMemoryBlock,
  type PlannedNormalizedMemoryDecision,
} from "./memory-semantic-planner.js";
import {
  type MemoryBlockType,
  typeNormalizedMemoryBlock,
  type NormalizedMemoryBlock,
} from "./memory-source-normalization.js";

export type MemorySemanticPlanSummary = {
  planner: "heuristic" | "model";
  blockType: MemoryBlockType;
  category: DocumentMemoryIngestionCategory;
  subject: string;
  statement: string;
  confidence: string;
  detectionSource: string;
  reviewMode: string;
};

function readComparisonMode(
  lane: MemorySemanticInterpretationLane,
): "candidate_learning" | "ordinary_turn" {
  return lane === "ordinary_turn_capture" ? "ordinary_turn" : "candidate_learning";
}

function readComparisonCaptureSeam(
  lane: MemorySemanticInterpretationLane,
): "document_memory_ingestion" | "ordinary_turn_auto_capture" {
  return lane === "ordinary_turn_capture"
    ? "ordinary_turn_auto_capture"
    : "document_memory_ingestion";
}

function resolveComparisonCategory(
  ingestion: ResolvedCanonicalizableIngestion,
): DocumentMemoryIngestionCategory {
  return "captureCategory" in ingestion ? ingestion.captureCategory : ingestion.familyId;
}

function buildSummary(params: {
  planner: "heuristic" | "model";
  blockType: MemoryBlockType;
  lane: MemorySemanticInterpretationLane;
  ingestion: ResolvedCanonicalizableIngestion;
  projectId?: string;
}): MemorySemanticPlanSummary {
  const canonicalCandidate = buildCanonicalMemoryIngestionCandidateFromResolvedIngestion({
    ingestion: params.ingestion,
    mode: readComparisonMode(params.lane),
    captureSeam: readComparisonCaptureSeam(params.lane),
    captureProfile:
      params.planner === "model" ? "model_semantic_comparison" : "heuristic_semantic_comparison",
    ...(params.projectId ? { projectId: params.projectId } : {}),
  });
  return {
    planner: params.planner,
    blockType: params.blockType,
    category: resolveComparisonCategory(params.ingestion),
    subject: canonicalCandidate.record.subject,
    statement: canonicalCandidate.record.statement,
    confidence: params.ingestion.confidence,
    detectionSource: params.ingestion.detectionSource,
    reviewMode: params.ingestion.reviewMode,
  };
}

function buildHeuristicRawCandidates(block: NormalizedMemoryBlock): string[] | undefined {
  return block.structuredChildren.length >= 2 ? [...block.structuredChildren] : undefined;
}

export async function summarizeHeuristicMemoryBlock(params: {
  config: MemoryMiddlewareConfig;
  lane: MemorySemanticInterpretationLane;
  block: NormalizedMemoryBlock;
  projectId?: string;
}): Promise<MemorySemanticPlanSummary | null> {
  const blockType = typeNormalizedMemoryBlock(params.block);
  if (blockType === "ignore") {
    return null;
  }
  const rawCandidates = buildHeuristicRawCandidates(params.block);
  const mode = readComparisonMode(params.lane);

  if (blockType === "response_style_candidate") {
    const resolved = await resolveResponseStyleIngestion({
      config: params.config,
      content: params.block.blockText,
      primarySource: "content",
      ...(rawCandidates ? { rawCandidates } : {}),
      mode,
      allowPhrasePatternMatch: false,
    });
    if (!resolved || resolved.action !== "capture") {
      return null;
    }
    return buildSummary({
      planner: "heuristic",
      blockType,
      lane: params.lane,
      ingestion: resolved,
      ...(params.projectId ? { projectId: params.projectId } : {}),
    });
  }

  if (blockType === "project_fact_candidate") {
    const resolved = await resolveProjectFactIngestion({
      content: params.block.blockText,
      primarySource: "content",
      ...(rawCandidates ? { rawCandidates } : {}),
      mode,
    });
    if (!resolved) {
      return null;
    }
    return buildSummary({
      planner: "heuristic",
      blockType,
      lane: params.lane,
      ingestion: resolved,
      ...(params.projectId ? { projectId: params.projectId } : {}),
    });
  }

  if (blockType === "procedure_candidate") {
    const recurringProcedure = await resolveRecurringProcedureIngestion({
      content: params.block.blockText,
      primarySource: "content",
      ...(rawCandidates ? { rawCandidates } : {}),
    });
    if (recurringProcedure) {
      return buildSummary({
        planner: "heuristic",
        blockType,
        lane: params.lane,
        ingestion: recurringProcedure,
        ...(params.projectId ? { projectId: params.projectId } : {}),
      });
    }
  }

  const workflow = await resolveWorkflowImprovementIngestion({
    config: params.config,
    content: params.block.blockText,
    primarySource: "content",
    ...(rawCandidates ? { rawCandidates } : {}),
    ...(params.projectId ? { projectId: params.projectId } : {}),
    allowPhrasePatternMatch: false,
  });
  if (!workflow) {
    return null;
  }
  return buildSummary({
    planner: "heuristic",
    blockType,
    lane: params.lane,
    ingestion: workflow,
    ...(params.projectId ? { projectId: params.projectId } : {}),
  });
}

export async function summarizeModelDrivenMemoryBlock(params: {
  config: MemoryMiddlewareConfig;
  lane: MemorySemanticInterpretationLane;
  block: NormalizedMemoryBlock;
  interpreter: MemorySemanticInterpreterPort;
  projectId?: string;
}): Promise<MemorySemanticPlanSummary | null> {
  const planned = await planNormalizedMemoryBlock({
    config: params.config,
    lane: params.lane,
    block: params.block,
    interpreter: params.interpreter,
    ...(params.projectId ? { projectId: params.projectId } : {}),
  });
  if (!planned || planned.validation.action !== "capture") {
    return null;
  }
  return summarizePlannedModelDecision({
    planned,
    lane: params.lane,
    ...(params.projectId ? { projectId: params.projectId } : {}),
  });
}

export function summarizePlannedModelDecision(params: {
  planned: PlannedNormalizedMemoryDecision;
  lane: MemorySemanticInterpretationLane;
  projectId?: string;
}): MemorySemanticPlanSummary | null {
  if (params.planned.validation.action !== "capture") {
    return null;
  }
  return buildSummary({
    planner: "model",
    blockType: params.planned.blockType,
    lane: params.lane,
    ingestion: params.planned.validation.resolved,
    ...(params.projectId ? { projectId: params.projectId } : {}),
  });
}
