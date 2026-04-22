import { z } from "zod";
import type {
  CapturedMemoryObject,
  DocumentIngestionInput,
  DocumentIngestionResult,
} from "../document-ingestion.ts";
import { ingestDocument } from "../document-ingestion.ts";
import { parseJsonModelOutput, type JsonModelExecutor } from "../model-execution.ts";
import { ExecutorBackedSemanticInterpreter } from "../real-semantic-interpreter.ts";
import type {
  SemanticInterpreter,
  SemanticInterpreterInput,
  SemanticInterpreterResult,
} from "../semantic-interpreter.ts";
import type { ModelMemoryObject } from "../semantic-schema.ts";
import type { DocumentSourceInput } from "../source-adapters/document-source-adapter.ts";
import type { ExistingMemorySummary } from "./contracts.ts";
import {
  ingestDocumentV2Shadow,
  type DocumentV2ShadowIngestionResult,
} from "./document-shadow-ingestion.ts";
import { buildModelCallTrace, type MmV2ModelCallTrace } from "./model-call-trace.ts";
import { normalizeComparisonText, semanticallyMatchesText } from "./proof-compare-shared.ts";
import { MMV2_DOCUMENT_PROOF_CASES, type MmV2DocumentProofCase } from "./proof-corpus.ts";
import {
  simulateWritePolicy,
  type MmV2SimulatedWriteOutcome,
  type MmV2WriteSimulationResult,
} from "./write-simulation.ts";

export type ModelMemorySplitDocument = {
  id: string;
  title: string;
  text: string;
  origin:
    | {
        type: "proof-corpus";
        caseId: string;
      }
    | {
        type: "file";
        path: string;
      };
  projectId?: string;
  seededNeighbors?: ExistingMemorySummary[];
  seededNeighborsByCandidateId?: Record<string, ExistingMemorySummary[]>;
};

export type ModelMemorySplitTrace = MmV2ModelCallTrace;

export type NormalizedV1MemoryObject = {
  objectId: string | null;
  kind: ModelMemoryObject["kind"];
  category: "claim" | "directive" | "source_ref" | "procedure";
  semanticText: string;
  evidenceSummary: string[];
  headingPath: string[];
  provenanceLines: Array<{ lineStart?: number; lineEnd?: number }>;
  lineStart: number | null;
  lineEnd: number | null;
  locator: string | null;
  actionText: string | null;
  sourceOrder: number;
};

export type NormalizedMmV2MemoryObject = {
  candidateId: string;
  category: "claim" | "directive" | "source_ref" | "procedure";
  unitType: string;
  kind: string | null;
  artifactType: string | null;
  canonicalText: string;
  evidenceQuote: string;
  locator: string | null;
  actionText: string | null;
  disposition: MmV2SimulatedWriteOutcome["disposition"] | null;
  createsNewDurableMemory: boolean;
  title: string | null;
  componentTexts: string[];
};

export type ModelMemorySplitMatch = {
  v1Kind: ModelMemoryObject["kind"];
  mmv2Kind: string | null;
  mmv2ArtifactType: string | null;
  v1SemanticText: string;
  mmv2CanonicalText: string;
};

export type ModelMemoryFairComparisonV1Unit = {
  unitId: string;
  category: "claim" | "directive" | "source_ref" | "procedure";
  clusterKind: "single" | "flattened_cluster";
  itemCount: number;
  headingPath: string[];
  lineStart: number | null;
  lineEnd: number | null;
  semanticText: string;
  locator: string | null;
  actionTexts: string[];
  sourceOrders: number[];
  items: NormalizedV1MemoryObject[];
};

export type ModelMemoryFairDirectMatch = {
  unitId: string;
  v1Category: ModelMemoryFairComparisonV1Unit["category"];
  mmv2Kind: string | null;
  mmv2ArtifactType: string | null;
  v1SemanticText: string;
  mmv2CanonicalText: string;
};

export type ModelMemoryFairCoveredByParentComposite = {
  unitId: string;
  headingPath: string[];
  v1FlattenedItemCount: number;
  v1SemanticTexts: string[];
  mmv2CandidateId: string;
  mmv2ArtifactType: string | null;
  mmv2CanonicalText: string;
  mmv2Title: string | null;
  matchedComponentCount: number;
  semanticCoverageScore: number;
};

export type ModelMemorySplitFairComparison = {
  totalV1Units: number;
  totalMmV2RetainedUnits: number;
  directSharedUnitCount: number;
  coveredByParentCompositeCount: number;
  trueV1OnlyCount: number;
  trueMmV2OnlyCount: number;
  semanticCoverageRatio: number;
  rawCaptureAggressivenessDelta: number;
  structureFidelityObservations: string[];
  directShared: ModelMemoryFairDirectMatch[];
  coveredByParentComposite: ModelMemoryFairCoveredByParentComposite[];
  trueV1Only: ModelMemoryFairComparisonV1Unit[];
  trueMmV2Only: NormalizedMmV2MemoryObject[];
};

export type ModelMemorySplitPerDocumentResult = {
  documentId: string;
  title: string;
  origin: ModelMemorySplitDocument["origin"];
  status: "pass" | "execution_failed";
  error?: {
    name: string;
    message: string;
  };
  seededNeighborCount: number;
  modelMetadata: {
    requestedModelId: string;
    resolvedModelIds: string[];
  };
  modelCallCount?: number;
  modelCallTraces?: ModelMemorySplitTrace[];
  v1: {
    capturedCount: number;
    writeLikeCount: number;
    items: NormalizedV1MemoryObject[];
  };
  mmv2: {
    canonicalCount: number;
    retainedCount: number;
    realisticWriteCount: number;
    items: NormalizedMmV2MemoryObject[];
    writeSimulation: MmV2WriteSimulationResult;
  };
  comparison: {
    sharedCount: number;
    v1OnlyCount: number;
    mmv2OnlyCount: number;
    shared: ModelMemorySplitMatch[];
    v1Only: NormalizedV1MemoryObject[];
    mmv2Only: NormalizedMmV2MemoryObject[];
    overlapRatio: number;
    evidenceGrounding: {
      v1WithProvenance: number;
      mmv2WithExactEvidence: number;
    };
    strongerSignals: string[];
  };
  fairComparison: ModelMemorySplitFairComparison;
};

export type ModelMemorySplitAggregateSummary = {
  totalDocuments: number;
  executionFailedDocuments: number;
  totalV1Captured: number;
  totalV1WriteLike: number;
  totalMmV2Canonical: number;
  totalMmV2Retained: number;
  totalMmV2RealisticWrites: number;
  totalShared: number;
  totalV1Only: number;
  totalMmV2Only: number;
  averageOverlapRatio: number;
};

export type ModelMemorySplitFairAggregateSummary = {
  totalV1Units: number;
  totalMmV2RetainedUnits: number;
  totalDirectSharedUnits: number;
  totalCoveredByParentCompositeUnits: number;
  totalTrueV1OnlyUnits: number;
  totalTrueMmV2OnlyUnits: number;
  semanticCoverageRatio: number;
  averageSemanticCoverageRatio: number;
  totalStructureFidelityWins: number;
  rawCaptureAggressivenessDelta: number;
};

export type ModelMemorySplitRunResult = {
  generatedAt: string;
  modelMetadata: {
    requestedModelId: string;
    resolvedModelIds: string[];
  };
  artifactReuse?: {
    usedMmV2: boolean;
    mmv2ArtifactPath?: string;
    usedV1: boolean;
    v1ArtifactPath?: string;
  };
  summary: ModelMemorySplitAggregateSummary;
  fairComparisonSummary: ModelMemorySplitFairAggregateSummary;
  documents: ModelMemorySplitPerDocumentResult[];
};

export type ExistingMmV2SplitArtifactDocument = {
  documentId: string;
  title: string;
  origin: ModelMemorySplitDocument["origin"];
  modelMetadata?: {
    requestedModelId: string;
    resolvedModelIds: string[];
  };
  run?: DocumentV2ShadowIngestionResult;
  status?: "pass" | "execution_failed";
};

export type ExistingV1SplitArtifactDocument = {
  documentId: string;
  title: string;
  origin: ModelMemorySplitDocument["origin"];
  modelMetadata?: {
    requestedModelId: string;
    resolvedModelIds: string[];
  };
  status?: "pass" | "execution_failed";
  v1: {
    capturedCount: number;
    writeLikeCount: number;
    items: NormalizedV1MemoryObject[];
  };
};

class TracingJsonModelExecutor implements JsonModelExecutor {
  readonly traces: ModelMemorySplitTrace[] = [];

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

function buildDocumentInput(document: ModelMemorySplitDocument): DocumentSourceInput {
  return {
    externalSourceId: document.id,
    text: document.text,
    projectId: document.projectId,
    sourceMetadata:
      document.origin.type === "file"
        ? { path: document.origin.path }
        : { proofCaseId: document.origin.caseId },
  };
}

function normalizeV1Text(object: ModelMemoryObject): string {
  switch (object.kind) {
    case "preference":
      return `${object.payload.subject} ${object.payload.instruction} ${object.payload.operation}`;
    case "fact":
      return `${object.payload.subject} ${object.payload.value}`;
    case "rule":
      return [
        object.payload.subject,
        object.payload.recommendedAction,
        object.payload.avoidAction,
        object.payload.neededCapability,
      ]
        .filter((value): value is string => Boolean(value))
        .join(" ");
    case "procedure":
      return [object.payload.title, ...object.payload.steps].join(" ");
    case "reference":
      return [
        object.payload.task,
        object.payload.primaryResource,
        ...(object.payload.companionResources ?? []),
      ].join(" ");
  }
  return "";
}

function normalizeV1Category(
  kind: ModelMemoryObject["kind"],
): NormalizedV1MemoryObject["category"] {
  switch (kind) {
    case "preference":
    case "fact":
      return "claim";
    case "rule":
      return "directive";
    case "reference":
      return "source_ref";
    case "procedure":
      return "procedure";
  }
  return "claim";
}

function normalizeV1Object(item: CapturedMemoryObject): NormalizedV1MemoryObject {
  const object = item.object;
  const headingPath =
    object.provenance
      .slice()
      .toSorted((left, right) => right.headingPath.length - left.headingPath.length)[0]
      ?.headingPath ?? [];
  const lineStarts = object.provenance
    .map((span) => span.lineStart)
    .filter((value): value is number => typeof value === "number");
  const lineEnds = object.provenance
    .map((span) => span.lineEnd)
    .filter((value): value is number => typeof value === "number");
  return {
    objectId: object.id ?? null,
    kind: object.kind,
    category: normalizeV1Category(object.kind),
    semanticText: normalizeV1Text(object),
    evidenceSummary: object.provenance.map((span) =>
      span.headingPath.length > 0
        ? `${span.headingPath.join(" > ")}:${span.lineStart ?? "?"}-${span.lineEnd ?? "?"}`
        : `${span.lineStart ?? "?"}-${span.lineEnd ?? "?"}`,
    ),
    headingPath,
    provenanceLines: object.provenance.map((span) => ({
      lineStart: span.lineStart,
      lineEnd: span.lineEnd,
    })),
    lineStart: lineStarts.length > 0 ? Math.min(...lineStarts) : null,
    lineEnd: lineEnds.length > 0 ? Math.max(...lineEnds) : null,
    locator: object.kind === "reference" ? object.payload.primaryResource : null,
    actionText:
      object.kind === "rule"
        ? [object.payload.recommendedAction, object.payload.avoidAction]
            .filter((value): value is string => Boolean(value))
            .join(" ")
        : null,
    sourceOrder: 0,
  };
}

function normalizeMmV2Category(input: {
  kind: string | null;
  artifactType: string | null;
}): NormalizedMmV2MemoryObject["category"] {
  if (input.artifactType === "procedure" || input.artifactType === "checklist") {
    return "procedure";
  }
  if (input.kind === "directive") {
    return "directive";
  }
  if (input.kind === "source_ref") {
    return "source_ref";
  }
  return "claim";
}

function normalizeMmV2Item(input: {
  candidate: DocumentV2ShadowIngestionResult["canonicalization"]["canonical_candidates"][number];
  writeOutcome?: MmV2SimulatedWriteOutcome;
}): NormalizedMmV2MemoryObject {
  const { candidate, writeOutcome } = input;
  const payload = candidate.payload;
  const locator =
    candidate.kind === "source_ref" && typeof payload.locator === "string" ? payload.locator : null;
  const actionText =
    candidate.kind === "directive" && typeof payload.action === "string" ? payload.action : null;
  const title = typeof payload.title === "string" ? payload.title : null;
  const componentTexts = Array.isArray(payload.components)
    ? payload.components.flatMap((component) => {
        if (!component || typeof component !== "object") {
          return [];
        }
        const source = component as Record<string, unknown>;
        if (typeof source.content === "string" && source.content.trim().length > 0) {
          return [source.content];
        }
        if (typeof source.evidence_quote === "string" && source.evidence_quote.trim().length > 0) {
          return [source.evidence_quote];
        }
        return [];
      })
    : [];
  return {
    candidateId: candidate.candidate_id,
    category: normalizeMmV2Category({
      kind: candidate.kind,
      artifactType: candidate.artifact_type,
    }),
    unitType: candidate.unit_type,
    kind: candidate.kind,
    artifactType: candidate.artifact_type,
    canonicalText: candidate.canonical_text,
    evidenceQuote: candidate.source.evidence_quote,
    locator,
    actionText,
    disposition: writeOutcome?.disposition ?? null,
    createsNewDurableMemory: writeOutcome?.createsNewDurableMemory ?? false,
    title,
    componentTexts,
  };
}

function headingPathKey(headingPath: string[]): string {
  return headingPath.map((segment) => normalizeComparisonText(segment)).join(" > ");
}

function canClusterDirectiveItems(
  left: NormalizedV1MemoryObject,
  right: NormalizedV1MemoryObject,
): boolean {
  if (left.category !== "directive" || right.category !== "directive") {
    return false;
  }
  const leftHeading = headingPathKey(left.headingPath);
  const rightHeading = headingPathKey(right.headingPath);
  if (!leftHeading || leftHeading !== rightHeading) {
    return false;
  }
  if (left.lineEnd === null || right.lineStart === null) {
    return false;
  }
  const lineGap = right.lineStart - left.lineEnd;
  return lineGap >= -1 && lineGap <= 12;
}

function buildV1ComparisonUnit(
  items: NormalizedV1MemoryObject[],
  unitId: string,
): ModelMemoryFairComparisonV1Unit {
  const lineStarts = items
    .map((item) => item.lineStart)
    .filter((value): value is number => typeof value === "number");
  const lineEnds = items
    .map((item) => item.lineEnd)
    .filter((value): value is number => typeof value === "number");
  const semanticParts = items.map((item) => item.actionText || item.semanticText).filter(Boolean);
  return {
    unitId,
    category: items[0]?.category ?? "claim",
    clusterKind: items.length > 1 ? "flattened_cluster" : "single",
    itemCount: items.length,
    headingPath: items[0]?.headingPath ?? [],
    lineStart: lineStarts.length > 0 ? Math.min(...lineStarts) : null,
    lineEnd: lineEnds.length > 0 ? Math.max(...lineEnds) : null,
    semanticText: semanticParts.join(" | "),
    locator: items.length === 1 ? (items[0]?.locator ?? null) : null,
    actionTexts: items
      .map((item) => item.actionText)
      .filter((value): value is string => Boolean(value)),
    sourceOrders: items.map((item) => item.sourceOrder),
    items,
  };
}

function clusterV1Items(items: NormalizedV1MemoryObject[]): ModelMemoryFairComparisonV1Unit[] {
  const sorted = [...items].toSorted((left, right) => left.sourceOrder - right.sourceOrder);
  const units: ModelMemoryFairComparisonV1Unit[] = [];
  let directiveBuffer: NormalizedV1MemoryObject[] = [];
  let nextUnitId = 1;

  const flushDirectiveBuffer = () => {
    if (directiveBuffer.length === 0) {
      return;
    }
    units.push(buildV1ComparisonUnit(directiveBuffer, `v1-unit-${nextUnitId}`));
    nextUnitId += 1;
    directiveBuffer = [];
  };

  for (const item of sorted) {
    if (item.category !== "directive") {
      flushDirectiveBuffer();
      units.push(buildV1ComparisonUnit([item], `v1-unit-${nextUnitId}`));
      nextUnitId += 1;
      continue;
    }
    const previous = directiveBuffer.at(-1);
    if (!previous) {
      directiveBuffer.push(item);
      continue;
    }
    if (canClusterDirectiveItems(previous, item)) {
      directiveBuffer.push(item);
      continue;
    }
    flushDirectiveBuffer();
    directiveBuffer.push(item);
  }

  flushDirectiveBuffer();
  return units;
}

function categoriesCompatible(
  v1: NormalizedV1MemoryObject,
  mmv2: NormalizedMmV2MemoryObject,
): boolean {
  return v1.category === mmv2.category;
}

function matchesSourceRef(v1: NormalizedV1MemoryObject, mmv2: NormalizedMmV2MemoryObject): boolean {
  if (v1.locator && mmv2.locator) {
    const left = normalizeComparisonText(v1.locator);
    const right = normalizeComparisonText(mmv2.locator);
    if (left === right || left.includes(right) || right.includes(left)) {
      return true;
    }
  }
  return semanticallyMatchesText(v1.semanticText, mmv2.canonicalText);
}

function matchesDirective(v1: NormalizedV1MemoryObject, mmv2: NormalizedMmV2MemoryObject): boolean {
  if (v1.actionText && mmv2.actionText && semanticallyMatchesText(v1.actionText, mmv2.actionText)) {
    return true;
  }
  return semanticallyMatchesText(v1.semanticText, mmv2.canonicalText);
}

function isSemanticMatch(v1: NormalizedV1MemoryObject, mmv2: NormalizedMmV2MemoryObject): boolean {
  if (!categoriesCompatible(v1, mmv2)) {
    return false;
  }
  if (v1.category === "source_ref") {
    return matchesSourceRef(v1, mmv2);
  }
  if (v1.category === "directive") {
    return matchesDirective(v1, mmv2);
  }
  return semanticallyMatchesText(v1.semanticText, mmv2.canonicalText);
}

function isDirectFairMatch(
  unit: ModelMemoryFairComparisonV1Unit,
  mmv2: NormalizedMmV2MemoryObject,
): boolean {
  if (unit.itemCount !== 1) {
    return false;
  }
  const single = unit.items[0];
  return single ? isSemanticMatch(single, mmv2) : false;
}

function scoreParentCompositeCoverage(
  unit: ModelMemoryFairComparisonV1Unit,
  mmv2: NormalizedMmV2MemoryObject,
): { matchedComponentCount: number; semanticCoverageScore: number } | null {
  if (mmv2.unitType !== "composite" || mmv2.category !== "procedure") {
    return null;
  }
  const clusterTexts = unit.items
    .map((item) => item.actionText || item.semanticText)
    .filter((value) => value.length > 0);
  if (clusterTexts.length === 0 || mmv2.componentTexts.length === 0) {
    return null;
  }
  const matchedCount = clusterTexts.filter((text) =>
    mmv2.componentTexts.some((componentText) => semanticallyMatchesText(text, componentText)),
  ).length;
  if (matchedCount === 0) {
    return null;
  }
  const headingLabel = unit.headingPath.at(-1) ?? "";
  const headingMatchesTitle =
    headingLabel.length > 0 &&
    ((mmv2.title !== null && semanticallyMatchesText(headingLabel, mmv2.title)) ||
      semanticallyMatchesText(headingLabel, mmv2.canonicalText));
  const evidenceMatchesHeading =
    headingLabel.length > 0 && semanticallyMatchesText(headingLabel, mmv2.evidenceQuote);
  const canonicalMatchesUnit = semanticallyMatchesText(unit.semanticText, mmv2.canonicalText);
  const coverageRatio = matchedCount / Math.max(clusterTexts.length, 1);
  const semanticCoverageScore =
    coverageRatio +
    (headingMatchesTitle ? 0.35 : 0) +
    (evidenceMatchesHeading ? 0.15 : 0) +
    (canonicalMatchesUnit ? 0.15 : 0);

  const qualifies =
    unit.clusterKind === "flattened_cluster"
      ? semanticCoverageScore >= 0.6
      : matchedCount >= 1 &&
        (semanticCoverageScore >= 0.9 || canonicalMatchesUnit || headingMatchesTitle);

  return qualifies
    ? {
        matchedComponentCount: matchedCount,
        semanticCoverageScore,
      }
    : null;
}

function compareNormalizedItems(input: {
  v1Items: NormalizedV1MemoryObject[];
  mmv2Items: NormalizedMmV2MemoryObject[];
}): Pick<
  ModelMemorySplitPerDocumentResult["comparison"],
  | "sharedCount"
  | "v1OnlyCount"
  | "mmv2OnlyCount"
  | "shared"
  | "v1Only"
  | "mmv2Only"
  | "overlapRatio"
> {
  const usedMmV2Indexes = new Set<number>();
  const shared: ModelMemorySplitMatch[] = [];
  const v1Only: NormalizedV1MemoryObject[] = [];

  for (const v1Item of input.v1Items) {
    const matchIndex = input.mmv2Items.findIndex(
      (mmv2Item, index) => !usedMmV2Indexes.has(index) && isSemanticMatch(v1Item, mmv2Item),
    );
    if (matchIndex === -1) {
      v1Only.push(v1Item);
      continue;
    }
    usedMmV2Indexes.add(matchIndex);
    const matched = input.mmv2Items[matchIndex];
    shared.push({
      v1Kind: v1Item.kind,
      mmv2Kind: matched.kind,
      mmv2ArtifactType: matched.artifactType,
      v1SemanticText: v1Item.semanticText,
      mmv2CanonicalText: matched.canonicalText,
    });
  }

  const mmv2Only = input.mmv2Items.filter((_, index) => !usedMmV2Indexes.has(index));
  const denominator = Math.max(input.v1Items.length, input.mmv2Items.length, 1);

  return {
    sharedCount: shared.length,
    v1OnlyCount: v1Only.length,
    mmv2OnlyCount: mmv2Only.length,
    shared,
    v1Only,
    mmv2Only,
    overlapRatio: shared.length / denominator,
  };
}

function compareFairNormalizedItems(input: {
  v1Items: NormalizedV1MemoryObject[];
  mmv2Items: NormalizedMmV2MemoryObject[];
}): ModelMemorySplitFairComparison {
  const v1Units = clusterV1Items(input.v1Items);
  const usedMmV2Indexes = new Set<number>();
  const directShared: ModelMemoryFairDirectMatch[] = [];
  const coveredByParentComposite: ModelMemoryFairCoveredByParentComposite[] = [];
  const trueV1Only: ModelMemoryFairComparisonV1Unit[] = [];

  for (const unit of v1Units) {
    const directMatchIndex = input.mmv2Items.findIndex(
      (mmv2Item, index) => !usedMmV2Indexes.has(index) && isDirectFairMatch(unit, mmv2Item),
    );
    if (directMatchIndex !== -1) {
      usedMmV2Indexes.add(directMatchIndex);
      const matched = input.mmv2Items[directMatchIndex];
      directShared.push({
        unitId: unit.unitId,
        v1Category: unit.category,
        mmv2Kind: matched.kind,
        mmv2ArtifactType: matched.artifactType,
        v1SemanticText: unit.semanticText,
        mmv2CanonicalText: matched.canonicalText,
      });
      continue;
    }

    let bestParentCoverage:
      | {
          index: number;
          matchedComponentCount: number;
          semanticCoverageScore: number;
        }
      | undefined;
    for (const [index, mmv2Item] of input.mmv2Items.entries()) {
      if (usedMmV2Indexes.has(index)) {
        continue;
      }
      const coverage = scoreParentCompositeCoverage(unit, mmv2Item);
      if (!coverage) {
        continue;
      }
      if (
        bestParentCoverage === undefined ||
        coverage.semanticCoverageScore > bestParentCoverage.semanticCoverageScore
      ) {
        bestParentCoverage = {
          index,
          matchedComponentCount: coverage.matchedComponentCount,
          semanticCoverageScore: coverage.semanticCoverageScore,
        };
      }
    }
    const parentCoverageIndex = bestParentCoverage?.index ?? -1;
    if (parentCoverageIndex !== -1) {
      usedMmV2Indexes.add(parentCoverageIndex);
      const matched = input.mmv2Items[parentCoverageIndex];
      coveredByParentComposite.push({
        unitId: unit.unitId,
        headingPath: unit.headingPath,
        v1FlattenedItemCount: unit.itemCount,
        v1SemanticTexts: unit.items.map((item) => item.actionText || item.semanticText),
        mmv2CandidateId: matched.candidateId,
        mmv2ArtifactType: matched.artifactType,
        mmv2CanonicalText: matched.canonicalText,
        mmv2Title: matched.title,
        matchedComponentCount: bestParentCoverage?.matchedComponentCount ?? 0,
        semanticCoverageScore: bestParentCoverage?.semanticCoverageScore ?? 0,
      });
      continue;
    }

    trueV1Only.push(unit);
  }

  const trueMmV2Only = input.mmv2Items.filter((_, index) => !usedMmV2Indexes.has(index));
  const denominator = Math.max(v1Units.length, input.mmv2Items.length, 1);
  const structureFidelityObservations: string[] = [];
  if (coveredByParentComposite.length > 0) {
    structureFidelityObservations.push(
      `MMV2 parent composites covered ${coveredByParentComposite.length} local v1 unit(s), including flattened directive spray where applicable.`,
    );
  }
  const uncoveredParentComposites = trueMmV2Only.filter(
    (item) => item.unitType === "composite" && item.category === "procedure",
  );
  if (uncoveredParentComposites.length > 0) {
    structureFidelityObservations.push(
      `MMV2 retained ${uncoveredParentComposites.length} additional composite artifact(s) with no flattened v1 peer coverage.`,
    );
  }
  const flattenedDirectiveClusters = v1Units.filter(
    (unit) => unit.clusterKind === "flattened_cluster",
  );
  if (flattenedDirectiveClusters.length > 0) {
    structureFidelityObservations.push(
      `v1 emitted ${flattenedDirectiveClusters.length} local flattened directive cluster(s) that were compared as units instead of raw directive spray.`,
    );
  }
  return {
    totalV1Units: v1Units.length,
    totalMmV2RetainedUnits: input.mmv2Items.length,
    directSharedUnitCount: directShared.length,
    coveredByParentCompositeCount: coveredByParentComposite.length,
    trueV1OnlyCount: trueV1Only.length,
    trueMmV2OnlyCount: trueMmV2Only.length,
    semanticCoverageRatio: (directShared.length + coveredByParentComposite.length) / denominator,
    rawCaptureAggressivenessDelta: input.v1Items.length - input.mmv2Items.length,
    structureFidelityObservations,
    directShared,
    coveredByParentComposite,
    trueV1Only,
    trueMmV2Only,
  };
}

function buildStrongerSignals(input: {
  v1Items: NormalizedV1MemoryObject[];
  mmv2CanonicalItems: NormalizedMmV2MemoryObject[];
  mmv2RetainedItems: NormalizedMmV2MemoryObject[];
  writeSimulation: MmV2WriteSimulationResult;
  fairComparison: ModelMemorySplitFairComparison;
}): string[] {
  const signals: string[] = [];
  if (input.mmv2CanonicalItems.some((item) => item.category === "procedure")) {
    signals.push("MMV2 captured at least one composite procedure/checklist artifact.");
  }
  if (input.writeSimulation.summary.overstatementCount > 0) {
    signals.push(
      `MMV2 exposed ${input.writeSimulation.summary.overstatementCount} shadow-vs-realistic write overstatement case(s).`,
    );
  }
  if (input.mmv2RetainedItems.length < input.mmv2CanonicalItems.length) {
    signals.push(
      "MMV2 applied stricter post-reconciliation filtering than raw capture count suggests.",
    );
  }
  if (input.v1Items.length > input.mmv2RetainedItems.length) {
    signals.push("v1 captured more write-like items than MMV2 retained after policy.");
  }
  if (input.fairComparison.coveredByParentCompositeCount > 0) {
    signals.push(
      `Fair comparison credited ${input.fairComparison.coveredByParentCompositeCount} local v1 unit(s) as covered by MMV2 parent composites.`,
    );
  }
  return signals;
}

async function runSingleDocument(input: {
  document: ModelMemorySplitDocument;
  modelId: string;
  executor: JsonModelExecutor;
  existingMmV2?: ExistingMmV2SplitArtifactDocument;
  existingV1?: ExistingV1SplitArtifactDocument;
}): Promise<ModelMemorySplitPerDocumentResult> {
  const tracingExecutor = new TracingJsonModelExecutor(input.executor);
  const v1Interpreter = new ExecutorBackedSemanticInterpreter(tracingExecutor);
  const documentInput = buildDocumentInput(input.document);
  const v1Run = input.existingV1
    ? undefined
    : await ingestDocument({
        document: documentInput,
        modelId: input.modelId,
        candidateModelId: input.modelId,
        interpreter: v1Interpreter,
      } satisfies DocumentIngestionInput);
  const mmv2Run =
    input.existingMmV2?.run ??
    (await ingestDocumentV2Shadow({
      document: documentInput,
      modelId: input.modelId,
      interpreter: new MmV2ExecutorBackedInterpreter(tracingExecutor),
      reconciliationNeighbors: input.document.seededNeighbors,
      reconciliationNeighborsByCandidateId: input.document.seededNeighborsByCandidateId,
    }));

  return buildPerDocumentResult({
    document: input.document,
    modelId: input.modelId,
    traces: tracingExecutor.traces,
    v1Run,
    existingV1: input.existingV1,
    mmv2Run,
    existingMmV2ModelMetadata: input.existingMmV2?.modelMetadata,
    existingV1ModelMetadata: input.existingV1?.modelMetadata,
  });
}

function buildPerDocumentResult(input: {
  document: ModelMemorySplitDocument;
  modelId: string;
  traces: ModelMemorySplitTrace[];
  v1Run?: DocumentIngestionResult;
  existingV1?: ExistingV1SplitArtifactDocument;
  mmv2Run: DocumentV2ShadowIngestionResult;
  existingMmV2ModelMetadata?: {
    requestedModelId: string;
    resolvedModelIds: string[];
  };
  existingV1ModelMetadata?: {
    requestedModelId: string;
    resolvedModelIds: string[];
  };
}): ModelMemorySplitPerDocumentResult {
  const writeSimulation = simulateWritePolicy({
    canonicalBatch: input.mmv2Run.canonicalization,
    admissionBatch: input.mmv2Run.admission,
    reconciliationDecisions: input.mmv2Run.reconciliation,
    shadowRecording: input.mmv2Run.shadowRecording,
  });
  const writeOutcomesById = new Map(
    writeSimulation.candidates.map((candidate) => [candidate.candidateId, candidate]),
  );
  const v1Items = input.existingV1
    ? input.existingV1.v1.items
    : (input.v1Run?.capturedObjects.map((item, index) => ({
        ...normalizeV1Object(item),
        sourceOrder: index,
      })) ?? []);
  const mmv2CanonicalItems = input.mmv2Run.canonicalization.canonical_candidates.map((candidate) =>
    normalizeMmV2Item({
      candidate,
      writeOutcome: writeOutcomesById.get(candidate.candidate_id),
    }),
  );
  const retainedCandidateIds = new Set(
    writeSimulation.candidates
      .filter(
        (candidate) =>
          candidate.disposition !== "reject" &&
          candidate.disposition !== "embed_only" &&
          candidate.disposition !== "quarantine",
      )
      .map((candidate) => candidate.candidateId),
  );
  const mmv2RetainedItems = mmv2CanonicalItems.filter((item) =>
    retainedCandidateIds.has(item.candidateId),
  );
  const comparison = compareNormalizedItems({
    v1Items,
    mmv2Items: mmv2RetainedItems,
  });
  const fairComparison = compareFairNormalizedItems({
    v1Items,
    mmv2Items: mmv2RetainedItems,
  });

  return {
    documentId: input.document.id,
    title: input.document.title,
    origin: input.document.origin,
    status: "pass",
    seededNeighborCount:
      (input.document.seededNeighbors?.length ?? 0) +
      Object.values(input.document.seededNeighborsByCandidateId ?? {}).reduce(
        (count, neighbors) => count + neighbors.length,
        0,
      ),
    modelMetadata: {
      requestedModelId: input.modelId,
      resolvedModelIds: Array.from(
        new Set([
          ...input.traces
            .map((trace) => trace.resolvedModelId)
            .filter((value): value is string => Boolean(value)),
          ...(input.existingV1ModelMetadata?.resolvedModelIds ?? []),
          ...(input.existingMmV2ModelMetadata?.resolvedModelIds ?? []),
        ]),
      ),
    },
    modelCallCount: input.traces.length,
    modelCallTraces: input.traces,
    v1: {
      capturedCount: input.existingV1?.v1.capturedCount ?? input.v1Run?.capturedObjects.length ?? 0,
      writeLikeCount:
        input.existingV1?.v1.writeLikeCount ?? input.v1Run?.capturedObjects.length ?? 0,
      items: v1Items,
    },
    mmv2: {
      canonicalCount: mmv2CanonicalItems.length,
      retainedCount: mmv2RetainedItems.length,
      realisticWriteCount: writeSimulation.summary.realisticDurableMemoryCount,
      items: mmv2CanonicalItems,
      writeSimulation,
    },
    comparison: {
      ...comparison,
      evidenceGrounding: {
        v1WithProvenance: v1Items.filter((item) => item.provenanceLines.length > 0).length,
        mmv2WithExactEvidence: mmv2CanonicalItems.filter((item) => item.evidenceQuote.length > 0)
          .length,
      },
      strongerSignals: buildStrongerSignals({
        v1Items,
        mmv2CanonicalItems,
        mmv2RetainedItems,
        writeSimulation,
        fairComparison,
      }),
    },
    fairComparison,
  };
}

function summarizeDocuments(documents: ModelMemorySplitPerDocumentResult[]): {
  raw: ModelMemorySplitAggregateSummary;
  fair: ModelMemorySplitFairAggregateSummary;
} {
  const totalDocuments = documents.length;
  const successfulDocuments = documents.filter((document) => document.status === "pass");
  const executionFailedDocuments = totalDocuments - successfulDocuments.length;
  const totalV1Captured = successfulDocuments.reduce(
    (sum, document) => sum + document.v1.capturedCount,
    0,
  );
  const totalV1WriteLike = successfulDocuments.reduce(
    (sum, document) => sum + document.v1.writeLikeCount,
    0,
  );
  const totalMmV2Canonical = successfulDocuments.reduce(
    (sum, document) => sum + document.mmv2.canonicalCount,
    0,
  );
  const totalMmV2Retained = successfulDocuments.reduce(
    (sum, document) => sum + document.mmv2.retainedCount,
    0,
  );
  const totalMmV2RealisticWrites = successfulDocuments.reduce(
    (sum, document) => sum + document.mmv2.realisticWriteCount,
    0,
  );
  const totalShared = successfulDocuments.reduce(
    (sum, document) => sum + document.comparison.sharedCount,
    0,
  );
  const totalV1Only = successfulDocuments.reduce(
    (sum, document) => sum + document.comparison.v1OnlyCount,
    0,
  );
  const totalMmV2Only = successfulDocuments.reduce(
    (sum, document) => sum + document.comparison.mmv2OnlyCount,
    0,
  );
  const averageOverlapRatio =
    successfulDocuments.length === 0
      ? 0
      : successfulDocuments.reduce((sum, document) => sum + document.comparison.overlapRatio, 0) /
        successfulDocuments.length;
  const totalV1Units = successfulDocuments.reduce(
    (sum, document) => sum + document.fairComparison.totalV1Units,
    0,
  );
  const totalDirectSharedUnits = successfulDocuments.reduce(
    (sum, document) => sum + document.fairComparison.directSharedUnitCount,
    0,
  );
  const totalCoveredByParentCompositeUnits = successfulDocuments.reduce(
    (sum, document) => sum + document.fairComparison.coveredByParentCompositeCount,
    0,
  );
  const totalTrueV1OnlyUnits = successfulDocuments.reduce(
    (sum, document) => sum + document.fairComparison.trueV1OnlyCount,
    0,
  );
  const totalTrueMmV2OnlyUnits = successfulDocuments.reduce(
    (sum, document) => sum + document.fairComparison.trueMmV2OnlyCount,
    0,
  );
  const averageSemanticCoverageRatio =
    successfulDocuments.length === 0
      ? 0
      : successfulDocuments.reduce(
          (sum, document) => sum + document.fairComparison.semanticCoverageRatio,
          0,
        ) / successfulDocuments.length;
  const semanticCoverageRatio =
    (totalDirectSharedUnits + totalCoveredByParentCompositeUnits) /
    Math.max(totalV1Units, totalMmV2Retained, 1);

  return {
    raw: {
      totalDocuments,
      executionFailedDocuments,
      totalV1Captured,
      totalV1WriteLike,
      totalMmV2Canonical,
      totalMmV2Retained,
      totalMmV2RealisticWrites,
      totalShared,
      totalV1Only,
      totalMmV2Only,
      averageOverlapRatio,
    },
    fair: {
      totalV1Units,
      totalMmV2RetainedUnits: totalMmV2Retained,
      totalDirectSharedUnits,
      totalCoveredByParentCompositeUnits,
      totalTrueV1OnlyUnits,
      totalTrueMmV2OnlyUnits,
      semanticCoverageRatio,
      averageSemanticCoverageRatio,
      totalStructureFidelityWins: totalCoveredByParentCompositeUnits,
      rawCaptureAggressivenessDelta: totalV1Captured - totalMmV2Retained,
    },
  };
}

export function proofCasesToSplitDocuments(
  proofCases: MmV2DocumentProofCase[] = MMV2_DOCUMENT_PROOF_CASES,
): ModelMemorySplitDocument[] {
  return proofCases.map((proofCase) => ({
    id: proofCase.id,
    title: proofCase.metadata?.title ?? proofCase.id,
    text: proofCase.text,
    origin: {
      type: "proof-corpus",
      caseId: proofCase.id,
    },
    seededNeighbors: proofCase.seededNeighbors,
    seededNeighborsByCandidateId: proofCase.seededNeighborsByCandidateId,
  }));
}

export async function runV1VsMmV2DocumentSplit(input: {
  documents: ModelMemorySplitDocument[];
  modelId: string;
  executor: JsonModelExecutor;
  existingMmV2ByDocumentId?: Record<string, ExistingMmV2SplitArtifactDocument>;
  existingV1ByDocumentId?: Record<string, ExistingV1SplitArtifactDocument>;
  mmv2ArtifactReusePath?: string;
  v1ArtifactReusePath?: string;
}): Promise<ModelMemorySplitRunResult> {
  const documents: ModelMemorySplitPerDocumentResult[] = [];
  for (const document of input.documents) {
    try {
      documents.push(
        await runSingleDocument({
          document,
          modelId: input.modelId,
          executor: input.executor,
          existingMmV2: input.existingMmV2ByDocumentId?.[document.id],
          existingV1: input.existingV1ByDocumentId?.[document.id],
        }),
      );
    } catch (error) {
      documents.push({
        documentId: document.id,
        title: document.title,
        origin: document.origin,
        status: "execution_failed",
        error: {
          name: error instanceof Error ? error.name : "Error",
          message: error instanceof Error ? error.message : String(error),
        },
        seededNeighborCount:
          (document.seededNeighbors?.length ?? 0) +
          Object.values(document.seededNeighborsByCandidateId ?? {}).reduce(
            (count, neighbors) => count + neighbors.length,
            0,
          ),
        modelMetadata: {
          requestedModelId: input.modelId,
          resolvedModelIds: [],
        },
        modelCallCount: 0,
        modelCallTraces: [],
        v1: {
          capturedCount: 0,
          writeLikeCount: 0,
          items: [],
        },
        mmv2: {
          canonicalCount: 0,
          retainedCount: 0,
          realisticWriteCount: 0,
          items: [],
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
        },
        comparison: {
          sharedCount: 0,
          v1OnlyCount: 0,
          mmv2OnlyCount: 0,
          shared: [],
          v1Only: [],
          mmv2Only: [],
          overlapRatio: 0,
          evidenceGrounding: {
            v1WithProvenance: 0,
            mmv2WithExactEvidence: 0,
          },
          strongerSignals: [],
        },
        fairComparison: {
          totalV1Units: 0,
          totalMmV2RetainedUnits: 0,
          directSharedUnitCount: 0,
          coveredByParentCompositeCount: 0,
          trueV1OnlyCount: 0,
          trueMmV2OnlyCount: 0,
          semanticCoverageRatio: 0,
          rawCaptureAggressivenessDelta: 0,
          structureFidelityObservations: [],
          directShared: [],
          coveredByParentComposite: [],
          trueV1Only: [],
          trueMmV2Only: [],
        },
      });
    }
  }

  const resolvedModelIds = Array.from(
    new Set(documents.flatMap((document) => document.modelMetadata.resolvedModelIds)),
  );
  const summaries = summarizeDocuments(documents);

  return {
    generatedAt: new Date().toISOString(),
    modelMetadata: {
      requestedModelId: input.modelId,
      resolvedModelIds,
    },
    artifactReuse: {
      usedMmV2: Boolean(input.existingMmV2ByDocumentId),
      mmv2ArtifactPath: input.mmv2ArtifactReusePath,
      usedV1: Boolean(input.existingV1ByDocumentId),
      v1ArtifactPath: input.v1ArtifactReusePath,
    },
    summary: summaries.raw,
    fairComparisonSummary: summaries.fair,
    documents,
  };
}
