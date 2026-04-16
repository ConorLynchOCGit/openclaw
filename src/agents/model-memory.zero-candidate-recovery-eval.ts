import { readFile } from "node:fs/promises";
import {
  buildZeroCandidateRecoverySelection,
  toBoundedCandidateAdjudicationCandidatesFromRetained,
  toBoundedCandidateAdjudicationCandidatesFromSearch,
  deriveMemoryIdentity,
  type BoundedCandidateAdjudicationBatchDecision,
  type BoundedCandidateAdjudicationRequest,
  type BoundedCandidateAdjudicationSource,
  type MemoryIdentityDescriptor,
  type SemanticCollisionAdjudicator,
} from "../plugin-sdk/model-memory.js";
import type { ModelMemoryObject } from "../plugin-sdk/model-memory.js";
import type {
  ModelMemoryObjectRecord,
  ModelMemorySourceRecord,
  ModelMemorySourceWindowRecord,
  ModelMemorySupportItemRecord,
} from "../plugin-sdk/model-memory.js";
import type { ModelMemoryDatabaseRuntime } from "./model-memory.database.ts";
import type {
  DuplicateAuditReport,
  DuplicateAuditRerunEscapeCase,
} from "./model-memory.duplicate-audit.ts";
import type {
  DuplicateReviewCase,
  ModelMemoryDuplicateReviewReport,
} from "./model-memory.duplicate-review.ts";

export type ZeroCandidateRecoveryEvalLabel =
  | "known_legitimate_match"
  | "legit_distinct_control"
  | "ambiguity_control";

export type ZeroCandidateRecoveryEvalCandidateSource = BoundedCandidateAdjudicationSource | "none";

export type ZeroCandidateRecoveryEvalRoute =
  | "no_candidates"
  | "direct_attach_support"
  | "direct_distinct"
  | "local_supersede"
  | "local_distinct_additive"
  | "local_conflict_hold_ambiguous";

export type ZeroCandidateRecoveryEvalCase = {
  caseId: string;
  caseIdentity: string;
  source: string;
  kind: string;
  label: ZeroCandidateRecoveryEvalLabel;
  candidateSource: ZeroCandidateRecoveryEvalCandidateSource;
  historicalDecision: string;
  selectedCandidateCount: number;
  candidateSelectionMode: "none" | "top1_only" | "top2_or_3";
  selectedCandidateObjectIds: string[];
  selectedCandidateScores: number[];
  acceptableMatchObjectIds?: string[];
  modelDecision?: BoundedCandidateAdjudicationBatchDecision;
  finalRoute: ZeroCandidateRecoveryEvalRoute;
  converted: boolean;
  falseMergeRisk: boolean;
  stayedContained: boolean;
};

export type ModelMemoryZeroCandidateRecoveryEvalReport = {
  generatedAt: string;
  duplicateAuditPath: string;
  duplicateAuditGeneratedAt: string;
  duplicateReviewPath: string;
  duplicateReviewGeneratedAt: string;
  databaseMode: "full_corpus_proof_db";
  databaseName: string;
  modelId: string;
  sampleSize: number;
  basketComposition: Record<ZeroCandidateRecoveryEvalLabel, number>;
  candidateSourceComposition: Record<ZeroCandidateRecoveryEvalCandidateSource, number>;
  cases: ZeroCandidateRecoveryEvalCase[];
  summary: {
    overallConversionRate: number;
    recoveryRate: number;
    falseMergeRate: number;
    ambiguousRate: number;
    retainedCandidateOnlySuccessRate: number;
    zeroCandidateFallbackSuccessRate: number;
    candidateCountDistribution: Record<string, number>;
    selectionModeDistribution: Record<string, number>;
  };
};

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function toSyntheticObject(record: ModelMemoryObjectRecord): ModelMemoryObject {
  return {
    canonicalClass: record.canonicalClass as ModelMemoryObject["canonicalClass"],
    kind: record.kind as ModelMemoryObject["kind"],
    payload: record.payload as ModelMemoryObject["payload"],
    scope: record.scope,
    provenance: (record.provenance ?? []) as ModelMemoryObject["provenance"],
    confidence: record.confidence as ModelMemoryObject["confidence"],
    durability: record.durability as ModelMemoryObject["durability"],
    reviewMode: "auto_accept",
    rationaleCodes: record.rationaleCodes as ModelMemoryObject["rationaleCodes"],
  } as ModelMemoryObject;
}

function buildSourceMaps(input: {
  sources: ModelMemorySourceRecord[];
  sourceWindows: ModelMemorySourceWindowRecord[];
  supportItems: ModelMemorySupportItemRecord[];
}) {
  const sourceById = new Map(input.sources.map((source) => [source.id, source] as const));
  const windowById = new Map(input.sourceWindows.map((window) => [window.id, window] as const));
  const supportItemsByObjectId = new Map<string, ModelMemorySupportItemRecord[]>();
  for (const supportItem of input.supportItems) {
    const existing = supportItemsByObjectId.get(supportItem.memoryObjectId) ?? [];
    existing.push(supportItem);
    supportItemsByObjectId.set(supportItem.memoryObjectId, existing);
  }

  const resolveSourcePath = (record: ModelMemoryObjectRecord): string => {
    const candidateWindowIds = [
      record.sourceWindowId,
      ...(supportItemsByObjectId.get(record.id) ?? []).map((item) => item.sourceWindowId),
    ].filter((value): value is string => Boolean(value));

    for (const windowId of candidateWindowIds) {
      const window = windowById.get(windowId);
      const source = window ? sourceById.get(window.sourceId) : undefined;
      const sourcePath =
        typeof source?.sourceMetadata.relativePath === "string"
          ? source.sourceMetadata.relativePath
          : source?.externalSourceId;
      if (sourcePath) {
        return sourcePath;
      }
    }
    return "unknown";
  };

  return {
    resolveSourcePath,
  };
}

function buildEvalCases(input: {
  duplicateAudit: DuplicateAuditReport;
  duplicateReview: ModelMemoryDuplicateReviewReport;
}): Array<{
  label: ZeroCandidateRecoveryEvalLabel;
  auditCase: DuplicateAuditRerunEscapeCase;
  acceptableMatchObjectIds?: string[];
}> {
  const auditByCaseId = new Map(
    input.duplicateAudit.rerunEscapeCases.map(
      (caseRecord) => [caseRecord.caseId, caseRecord] as const,
    ),
  );
  const cases: Array<{
    label: ZeroCandidateRecoveryEvalLabel;
    auditCase: DuplicateAuditRerunEscapeCase;
    acceptableMatchObjectIds?: string[];
  }> = [];
  const seen = new Set<string>();

  const addReviewedCases = (
    label: ZeroCandidateRecoveryEvalLabel,
    reviewLabel: DuplicateReviewCase["reviewerLabel"],
  ) => {
    for (const reviewCase of input.duplicateReview.cases) {
      if (reviewCase.reviewerLabel !== reviewLabel) {
        continue;
      }
      const auditCase = auditByCaseId.get(reviewCase.caseId);
      if (!auditCase || seen.has(auditCase.caseId)) {
        continue;
      }
      const acceptableMatchObjectIds =
        label === "known_legitimate_match"
          ? [
              ...new Set(
                (auditCase.retainedPriorCandidates.length > 0
                  ? auditCase.retainedPriorCandidates
                  : auditCase.nearestPriorCandidates
                ).map((candidate) => candidate.objectId),
              ),
            ]
          : undefined;
      cases.push({ label, auditCase, acceptableMatchObjectIds });
      seen.add(auditCase.caseId);
    }
  };

  addReviewedCases("known_legitimate_match", "clear_duplicate_should_attach");
  addReviewedCases("legit_distinct_control", "clear_distinct_should_stay_distinct");
  addReviewedCases("ambiguity_control", "true_ambiguity");

  return cases;
}

function buildSelectionMode(selectedCandidateCount: number) {
  if (selectedCandidateCount === 0) {
    return "none" as const;
  }
  return selectedCandidateCount === 1 ? "top1_only" : "top2_or_3";
}

function buildFinalRoute(input: {
  modelDecision?: BoundedCandidateAdjudicationBatchDecision;
}): ZeroCandidateRecoveryEvalRoute {
  if (!input.modelDecision) {
    return "no_candidates";
  }
  if (
    input.modelDecision.sameCoreMemory === "yes" &&
    input.modelDecision.deltaType === "non_additive" &&
    input.modelDecision.matchedCandidateId !== "none"
  ) {
    return "direct_attach_support";
  }
  if (
    input.modelDecision.sameCoreMemory === "yes" &&
    input.modelDecision.deltaType === "additive"
  ) {
    return "local_distinct_additive";
  }
  if (input.modelDecision.sameCoreMemory === "ambiguous") {
    return "local_conflict_hold_ambiguous";
  }
  return "direct_distinct";
}

export async function runModelMemoryZeroCandidateRecoveryEval(input: {
  runtime: ModelMemoryDatabaseRuntime;
  adjudicator: SemanticCollisionAdjudicator;
  duplicateAuditPath: string;
  duplicateReviewPath: string;
  modelId: string;
}): Promise<ModelMemoryZeroCandidateRecoveryEvalReport> {
  const boundedCandidateAdjudicator =
    input.adjudicator.adjudicateBoundedCandidateBatch?.bind(input.adjudicator) ??
    input.adjudicator.adjudicateZeroCandidateRecoveryBatch?.bind(input.adjudicator);
  if (!boundedCandidateAdjudicator) {
    throw new Error("Bounded candidate evaluation requires a bounded-candidate adjudicator");
  }

  const [duplicateAudit, duplicateReview, memoryObjects, sourceWindows, sources, supportItems] =
    await Promise.all([
      readJson<DuplicateAuditReport>(input.duplicateAuditPath),
      readJson<ModelMemoryDuplicateReviewReport>(input.duplicateReviewPath),
      input.runtime.canonicalRepository.listMemoryObjects(),
      input.runtime.canonicalRepository.listSourceWindows(),
      input.runtime.canonicalRepository.listSources(),
      input.runtime.canonicalRepository.listSupportItems(),
    ]);

  const objectById = new Map(memoryObjects.map((record) => [record.id, record] as const));
  const { resolveSourcePath } = buildSourceMaps({
    sources,
    sourceWindows,
    supportItems,
  });
  const evalInputs = buildEvalCases({
    duplicateAudit,
    duplicateReview,
  });

  const pendingRequests: BoundedCandidateAdjudicationRequest[] = [];
  const selectionByCaseId = new Map<
    string,
    {
      label: ZeroCandidateRecoveryEvalLabel;
      auditCase: DuplicateAuditRerunEscapeCase;
      acceptableMatchObjectIds?: string[];
      candidateSource: ZeroCandidateRecoveryEvalCandidateSource;
      selectedObjectIds: string[];
      selectedCandidateScores: number[];
      identity: MemoryIdentityDescriptor;
      candidateSelectionMode: "none" | "top1_only" | "top2_or_3";
    }
  >();

  for (const evalInput of evalInputs) {
    const currentRecord = objectById.get(evalInput.auditCase.memoryObjectId);
    if (!currentRecord) {
      throw new Error(
        `Evaluation could not find memory object ${evalInput.auditCase.memoryObjectId}`,
      );
    }
    const syntheticObject = toSyntheticObject(currentRecord);
    const identity = deriveMemoryIdentity(syntheticObject);
    const retainedRecords = evalInput.auditCase.retainedPriorCandidates
      .map((candidate) => objectById.get(candidate.objectId))
      .filter((record): record is ModelMemoryObjectRecord => Boolean(record));

    let candidateSource: ZeroCandidateRecoveryEvalCandidateSource = "none";
    let selectedObjectIds: string[] = [];
    let selectedCandidateScores: number[] = [];
    let selectedCandidateCount = 0;

    if (retainedRecords.length > 0) {
      const candidates = toBoundedCandidateAdjudicationCandidatesFromRetained({
        records: retainedRecords,
        resolveSourcePath,
      });
      pendingRequests.push({
        candidateId: evalInput.auditCase.caseId,
        sourceKind: "document",
        sourceWindowId: evalInput.auditCase.sourceWindowId,
        sourcePath: evalInput.auditCase.source,
        object: syntheticObject,
        candidates,
      });
      candidateSource = "retained_structural";
      selectedObjectIds = candidates.map((candidate) => candidate.id);
      selectedCandidateScores = candidates.map((candidate) => candidate.similarityScore);
      selectedCandidateCount = candidates.length;
    } else {
      const priorObjects = memoryObjects.filter(
        (record) => record.createdAt.getTime() < currentRecord.createdAt.getTime(),
      );
      const selection = buildZeroCandidateRecoverySelection({
        object: syntheticObject,
        identity,
        memoryObjects: priorObjects,
        resolveSourcePath,
      });
      const candidates = toBoundedCandidateAdjudicationCandidatesFromSearch(selection);
      if (candidates.length > 0) {
        pendingRequests.push({
          candidateId: evalInput.auditCase.caseId,
          sourceKind: "document",
          sourceWindowId: evalInput.auditCase.sourceWindowId,
          sourcePath: evalInput.auditCase.source,
          object: syntheticObject,
          candidates,
        });
        candidateSource = "raw_text_fallback";
        selectedObjectIds = candidates.map((candidate) => candidate.id);
        selectedCandidateScores = candidates.map((candidate) => candidate.similarityScore);
        selectedCandidateCount = candidates.length;
      }
    }

    selectionByCaseId.set(evalInput.auditCase.caseId, {
      ...evalInput,
      candidateSource,
      selectedObjectIds,
      selectedCandidateScores,
      identity,
      candidateSelectionMode: buildSelectionMode(selectedCandidateCount),
    });
  }

  const modelDecisions = new Map<string, BoundedCandidateAdjudicationBatchDecision>();
  if (pendingRequests.length > 0) {
    for (const decision of await boundedCandidateAdjudicator({
      requests: pendingRequests,
      modelId: input.modelId,
    })) {
      modelDecisions.set(decision.candidateId, decision);
    }
  }

  const cases: ZeroCandidateRecoveryEvalCase[] = evalInputs.map((evalInput) => {
    const selection = selectionByCaseId.get(evalInput.auditCase.caseId)!;
    const modelDecision = modelDecisions.get(evalInput.auditCase.caseId);
    const request = pendingRequests.find(
      (pendingRequest) => pendingRequest.candidateId === evalInput.auditCase.caseId,
    );
    const finalRoute = buildFinalRoute({
      modelDecision,
    });
    const matchedObjectId =
      modelDecision?.matchedCandidateId && modelDecision.matchedCandidateId !== "none"
        ? request?.candidates.find(
            (candidate) => candidate.adjudicationCandidateId === modelDecision.matchedCandidateId,
          )?.id
        : undefined;
    const converted =
      evalInput.label === "known_legitimate_match" &&
      finalRoute === "direct_attach_support" &&
      Boolean(matchedObjectId && evalInput.acceptableMatchObjectIds?.includes(matchedObjectId));
    const falseMergeRisk =
      evalInput.label !== "known_legitimate_match" && finalRoute === "direct_attach_support";
    const stayedContained = finalRoute === "local_conflict_hold_ambiguous";

    return {
      caseId: evalInput.auditCase.caseId,
      caseIdentity: evalInput.auditCase.caseIdentity,
      source: evalInput.auditCase.source,
      kind: evalInput.auditCase.kind,
      label: evalInput.label,
      candidateSource: selection.candidateSource,
      historicalDecision: evalInput.auditCase.historicalDecision,
      selectedCandidateCount: selection.selectedObjectIds.length,
      candidateSelectionMode: selection.candidateSelectionMode,
      selectedCandidateObjectIds: selection.selectedObjectIds,
      selectedCandidateScores: selection.selectedCandidateScores,
      acceptableMatchObjectIds: evalInput.acceptableMatchObjectIds,
      modelDecision,
      finalRoute,
      converted,
      falseMergeRisk,
      stayedContained,
    };
  });

  const positiveCases = cases.filter((caseRecord) => caseRecord.label === "known_legitimate_match");
  const distinctControls = cases.filter(
    (caseRecord) => caseRecord.label === "legit_distinct_control",
  );
  const retainedPositiveCases = positiveCases.filter(
    (caseRecord) => caseRecord.candidateSource === "retained_structural",
  );
  const fallbackPositiveCases = positiveCases.filter(
    (caseRecord) => caseRecord.candidateSource === "raw_text_fallback",
  );

  const overallConversionRate = Number(
    (
      positiveCases.filter((caseRecord) => caseRecord.converted).length /
      Math.max(positiveCases.length, 1)
    ).toFixed(4),
  );

  return {
    generatedAt: new Date().toISOString(),
    duplicateAuditPath: input.duplicateAuditPath,
    duplicateAuditGeneratedAt: duplicateAudit.generatedAt,
    duplicateReviewPath: input.duplicateReviewPath,
    duplicateReviewGeneratedAt: duplicateReview.generatedAt,
    databaseMode: "full_corpus_proof_db",
    databaseName: input.runtime.resolution.databaseName,
    modelId: input.modelId,
    sampleSize: cases.length,
    basketComposition: countBy(cases.map((caseRecord) => caseRecord.label)) as Record<
      ZeroCandidateRecoveryEvalLabel,
      number
    >,
    candidateSourceComposition: countBy(
      cases.map((caseRecord) => caseRecord.candidateSource),
    ) as Record<ZeroCandidateRecoveryEvalCandidateSource, number>,
    cases,
    summary: {
      overallConversionRate,
      recoveryRate: overallConversionRate,
      falseMergeRate: Number(
        (
          distinctControls.filter((caseRecord) => caseRecord.falseMergeRisk).length /
          Math.max(distinctControls.length, 1)
        ).toFixed(4),
      ),
      ambiguousRate: Number(
        (
          cases.filter((caseRecord) => caseRecord.stayedContained).length /
          Math.max(cases.length, 1)
        ).toFixed(4),
      ),
      retainedCandidateOnlySuccessRate: Number(
        (
          retainedPositiveCases.filter((caseRecord) => caseRecord.converted).length /
          Math.max(retainedPositiveCases.length, 1)
        ).toFixed(4),
      ),
      zeroCandidateFallbackSuccessRate: Number(
        (
          fallbackPositiveCases.filter((caseRecord) => caseRecord.converted).length /
          Math.max(fallbackPositiveCases.length, 1)
        ).toFixed(4),
      ),
      candidateCountDistribution: countBy(
        cases.map((caseRecord) => String(caseRecord.selectedCandidateCount)),
      ),
      selectionModeDistribution: countBy(
        cases.map((caseRecord) => caseRecord.candidateSelectionMode),
      ),
    },
  };
}

export function renderModelMemoryZeroCandidateRecoveryEvalMarkdown(
  report: ModelMemoryZeroCandidateRecoveryEvalReport,
): string {
  const lines: string[] = [
    "# Bounded Candidate Adjudication Evaluation",
    "",
    `- Generated at: ${report.generatedAt}`,
    `- Duplicate audit: ${report.duplicateAuditPath}`,
    `- Duplicate review: ${report.duplicateReviewPath}`,
    `- DB mode: ${report.databaseMode}`,
    `- Database: ${report.databaseName}`,
    `- Model: ${report.modelId}`,
    `- Sample size: ${report.sampleSize}`,
    `- Basket composition: ${JSON.stringify(report.basketComposition)}`,
    `- Candidate source composition: ${JSON.stringify(report.candidateSourceComposition)}`,
    "",
    "## Summary",
    "",
    `- Overall conversion rate: ${(report.summary.overallConversionRate * 100).toFixed(1)}%`,
    `- False-merge rate: ${(report.summary.falseMergeRate * 100).toFixed(1)}%`,
    `- Ambiguous rate: ${(report.summary.ambiguousRate * 100).toFixed(1)}%`,
    `- Retained-candidate success rate: ${(report.summary.retainedCandidateOnlySuccessRate * 100).toFixed(1)}%`,
    `- Zero-candidate fallback success rate: ${(report.summary.zeroCandidateFallbackSuccessRate * 100).toFixed(1)}%`,
    `- Candidate count distribution: ${JSON.stringify(report.summary.candidateCountDistribution)}`,
    `- Selection mode distribution: ${JSON.stringify(report.summary.selectionModeDistribution)}`,
    "",
    "## Cases",
    "",
  ];

  for (const caseRecord of report.cases) {
    lines.push(`### ${caseRecord.caseId}`);
    lines.push(`- Case identity: ${caseRecord.caseIdentity}`);
    lines.push(`- Source: ${caseRecord.source}`);
    lines.push(`- Kind: ${caseRecord.kind}`);
    lines.push(`- Label: ${caseRecord.label}`);
    lines.push(`- Candidate source: ${caseRecord.candidateSource}`);
    lines.push(`- Historical decision: ${caseRecord.historicalDecision}`);
    lines.push(`- Candidate selection mode: ${caseRecord.candidateSelectionMode}`);
    lines.push(
      `- Selected candidates: ${caseRecord.selectedCandidateObjectIds.join(", ") || "none"}`,
    );
    lines.push(`- Selected scores: ${caseRecord.selectedCandidateScores.join(", ") || "none"}`);
    lines.push(
      `- Model decision: ${caseRecord.modelDecision ? JSON.stringify(caseRecord.modelDecision) : "none"}`,
    );
    lines.push(`- Final route: ${caseRecord.finalRoute}`);
    lines.push(`- Converted: ${caseRecord.converted}`);
    lines.push(`- False merge risk: ${caseRecord.falseMergeRisk}`);
    lines.push(`- Stayed contained: ${caseRecord.stayedContained}`);
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}
