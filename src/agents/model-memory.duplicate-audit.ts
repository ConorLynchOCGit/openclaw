import { readFile } from "node:fs/promises";
import {
  buildCollisionCandidates,
  calculateSearchTextOverlap,
  type SearchTextOverlap,
  assessStructuralSameClaimDelta,
  deriveMemoryIdentity,
  describeDecisiveFieldAgreement,
  type PackagingDriftType,
  type SameClaimConfidence,
  type StructuralDeltaClass,
} from "../plugin-sdk/model-memory-legacy.js";
import {
  ModelMemoryObjectRecord,
  ModelMemorySourceRecord,
  ModelMemorySourceWindowRecord,
  ModelMemorySupportItemRecord,
  ModelMemoryWriteEventRecord,
} from "../plugin-sdk/model-memory.js";
import type { ModelMemoryObject } from "../plugin-sdk/model-memory.js";
import { buildModelMemoryCaseIdentity } from "./model-memory.case-identity.ts";
import type { ModelMemoryDatabaseRuntime } from "./model-memory.database.ts";
import { summarizeModelMemoryPayload } from "./model-memory.payload-summary.ts";
import type { DuplicateClusterCandidate } from "./model-memory.proof-phase.ts";

type ProofPhaseReportInput = {
  generatedAt: string;
  ingestionSummaries?: Array<{
    source: string;
    writeDecisionCounts: Record<string, number>;
  }>;
  saturationRuns?: Array<{
    sources: string[];
  }>;
  corpusTotals?: {
    duplicateClusterCandidates?: DuplicateClusterCandidate[];
  };
};

export type DuplicateAuditPathClassification =
  | "exact_identity"
  | "batched_adjudication"
  | "distinct_write";

export type DuplicateAuditMissClass =
  | "recall_miss"
  | "batch_attach_miss"
  | "historical_supersede_miss"
  | "legit_distinct";

export type DuplicateAuditOverlapMetrics = SearchTextOverlap & {
  normalizedSubjectExact: boolean;
  normalizedTitleExact: boolean;
};

export type DuplicateAuditCandidateRecord = {
  objectId: string;
  identityKey: string;
  createdAt: string;
  lifecycleState: string;
  supportCount: number;
  canonicalClass: string;
  kind: string;
  scopeKey?: string;
  payloadSummary: string;
  normalizedSearchText: string;
  decisiveFieldAgreement: boolean;
  decisiveFieldSummary: string;
  overlap: DuplicateAuditOverlapMetrics;
};

export type DuplicateAuditRerunEscapeCase = {
  caseId: string;
  caseIdentity: string;
  caseType: "saturation_rerun_escape";
  source: string;
  sourceWindowId: string;
  windowIndex: number;
  memoryObjectId: string;
  createdAt: string;
  lifecycleState: string;
  canonicalClass: string;
  kind: string;
  scopeKey?: string;
  payloadSummary: string;
  supportCount: number;
  historicalDecision: string;
  historicalDecisionCodes: string[];
  replayPathClassification: DuplicateAuditPathClassification;
  missClass: DuplicateAuditMissClass;
  deltaClass?: StructuralDeltaClass;
  sameClaimLeaning?: boolean;
  sameClaimConfidence: SameClaimConfidence;
  packagingDriftType?: PackagingDriftType;
  rawScopeMatchedPriorCount: number;
  retainedCandidateCount: number;
  nearestPriorCandidates: DuplicateAuditCandidateRecord[];
  retainedPriorCandidates: DuplicateAuditCandidateRecord[];
};

export type DuplicateAuditClusterCase = {
  caseId: string;
  caseIdentity: string;
  caseType: "duplicate_cluster_candidate";
  similarity: number;
  olderObjectId: string;
  newerObjectId: string;
  canonicalClass: string;
  kind: string;
  scopeKey?: string;
  olderPayloadSummary: string;
  newerPayloadSummary: string;
  overlap: DuplicateAuditOverlapMetrics;
  newerObjectSource?: string;
  newerHistoricalDecision?: string;
  newerHistoricalDecisionCodes: string[];
  newerReplayPathClassification?: DuplicateAuditPathClassification;
  olderSupportCount: number;
  newerSupportCount: number;
};

export type DuplicateAuditSampleCase =
  | {
      sampleId: string;
      from: "rerun_escape";
      caseId: string;
      source: string;
      payloadSummary: string;
      historicalDecision: string;
      replayPathClassification: DuplicateAuditPathClassification;
      topPriorCandidate?: DuplicateAuditCandidateRecord;
    }
  | {
      sampleId: string;
      from: "duplicate_cluster";
      caseId: string;
      source?: string;
      payloadSummary: string;
      historicalDecision?: string;
      replayPathClassification?: DuplicateAuditPathClassification;
      topPriorCandidate: DuplicateAuditCandidateRecord;
    };

export type DuplicateAuditReport = {
  generatedAt: string;
  currentCorpus: true;
  databaseMode?: string;
  databaseName: string;
  proofPhaseReportPath: string;
  proofPhaseReportGeneratedAt: string;
  initialIngestionWriteEventCount: number;
  saturationSourcePaths: string[];
  rerunEscapeCases: DuplicateAuditRerunEscapeCase[];
  duplicateClusterCases: DuplicateAuditClusterCase[];
  sampleCases: DuplicateAuditSampleCase[];
  summary: {
    rerunEscapeCaseCount: number;
    duplicateClusterCaseCount: number;
    rerunHistoricalDecisionCounts: Record<string, number>;
    rerunReplayPathCounts: Record<string, number>;
    rerunCaseCountByKind: Record<string, number>;
    rerunMissClassCounts: Record<string, number>;
    rerunPackagingDriftTypeCounts: Record<string, number>;
    rerunRetainedCandidateCount: {
      zero: number;
      one: number;
      multiple: number;
    };
  };
};

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function sumRecordValues(record: Record<string, number> | undefined): number {
  return Object.values(record ?? {}).reduce((sum, value) => sum + value, 0);
}

function summarizePayload(record: Pick<ModelMemoryObjectRecord, "kind" | "payload">): string {
  return summarizeModelMemoryPayload(record);
}

function buildOverlapMetrics(
  left: Pick<
    ModelMemoryObjectRecord,
    "normalizedSearchText" | "normalizedSubject" | "normalizedTitle"
  >,
  right: Pick<
    ModelMemoryObjectRecord,
    "normalizedSearchText" | "normalizedSubject" | "normalizedTitle"
  >,
): DuplicateAuditOverlapMetrics {
  const overlap = calculateSearchTextOverlap(left.normalizedSearchText, right.normalizedSearchText);
  return {
    ...overlap,
    normalizedSubjectExact:
      Boolean(left.normalizedSubject) &&
      Boolean(right.normalizedSubject) &&
      left.normalizedSubject === right.normalizedSubject,
    normalizedTitleExact:
      Boolean(left.normalizedTitle) &&
      Boolean(right.normalizedTitle) &&
      left.normalizedTitle === right.normalizedTitle,
  };
}

function buildCandidateRecord(input: {
  record: ModelMemoryObjectRecord;
  target: ModelMemoryObjectRecord;
  supportCount: number;
}): DuplicateAuditCandidateRecord {
  const decisiveFieldAgreement = describeDecisiveFieldAgreement(input.target, input.record);
  return {
    objectId: input.record.id,
    identityKey: input.record.identityKey,
    createdAt: input.record.createdAt.toISOString(),
    lifecycleState: input.record.lifecycleState ?? "active",
    supportCount: input.supportCount,
    canonicalClass: input.record.canonicalClass,
    kind: input.record.kind,
    scopeKey: input.record.scopeKey,
    payloadSummary: summarizePayload(input.record),
    normalizedSearchText: input.record.normalizedSearchText,
    decisiveFieldAgreement: decisiveFieldAgreement.allComparableFieldsMatch,
    decisiveFieldSummary: decisiveFieldAgreement.summary,
    overlap: buildOverlapMetrics(input.target, input.record),
  };
}

function compareRecordsByCreatedAt(
  left: ModelMemoryObjectRecord,
  right: ModelMemoryObjectRecord,
): number {
  const timeDelta = left.createdAt.getTime() - right.createdAt.getTime();
  if (timeDelta !== 0) {
    return timeDelta;
  }
  return left.id.localeCompare(right.id);
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

function buildSourceFamilyKey(source: ModelMemorySourceRecord): string {
  return `${source.sourceKind}:${source.externalSourceId ?? source.sourceFingerprint}`;
}

function buildReplayPathClassification(input: {
  record: ModelMemoryObjectRecord;
  priorObjects: ModelMemoryObjectRecord[];
  sourceWindowId?: string;
  sourceById: Map<string, ModelMemorySourceRecord>;
  windowById: Map<string, ModelMemorySourceWindowRecord>;
}): {
  replayPathClassification: DuplicateAuditPathClassification;
  rawScopeMatchedPriorCount: number;
  retainedPriorCandidates: ModelMemoryObjectRecord[];
} {
  const syntheticObject = toSyntheticObject(input.record);
  const identity = deriveMemoryIdentity(syntheticObject);
  const exactIdentityMatch = input.priorObjects.find(
    (candidate) =>
      !candidate.supersededAt &&
      candidate.lifecycleState !== "expired" &&
      candidate.identityKey === identity.identityKey,
  );
  if (exactIdentityMatch) {
    return {
      replayPathClassification: "exact_identity",
      rawScopeMatchedPriorCount: 1,
      retainedPriorCandidates: [exactIdentityMatch],
    };
  }

  const rawScopeMatchedPriorCount = input.priorObjects.filter(
    (candidate) =>
      !candidate.supersededAt &&
      candidate.lifecycleState !== "expired" &&
      candidate.canonicalClass === input.record.canonicalClass &&
      candidate.kind === input.record.kind &&
      candidate.scopeKey === input.record.scopeKey,
  ).length;
  const currentWindow = input.sourceWindowId
    ? input.windowById.get(input.sourceWindowId)
    : undefined;
  const currentSource = currentWindow ? input.sourceById.get(currentWindow.sourceId) : undefined;
  const currentSourceFamilyKey = currentSource ? buildSourceFamilyKey(currentSource) : undefined;
  const candidateSourceFamilyKeys = new Map(
    input.priorObjects
      .map((candidate) => {
        const candidateWindow = candidate.sourceWindowId
          ? input.windowById.get(candidate.sourceWindowId)
          : undefined;
        const candidateSource = candidateWindow
          ? input.sourceById.get(candidateWindow.sourceId)
          : undefined;
        return [
          candidate.id,
          candidateSource ? buildSourceFamilyKey(candidateSource) : undefined,
        ] as const;
      })
      .filter(
        (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0,
      ),
  );
  const collisionsWithSourceFamily = buildCollisionCandidates(
    syntheticObject,
    identity,
    input.priorObjects,
    {
      currentSourceFamilyKey,
      candidateSourceFamilyKeys,
    },
  );
  const replayCandidates = collisionsWithSourceFamily.retainedRecords;
  if (replayCandidates.length === 0) {
    return {
      replayPathClassification: "distinct_write",
      rawScopeMatchedPriorCount,
      retainedPriorCandidates: [],
    };
  }
  return {
    replayPathClassification: "batched_adjudication",
    rawScopeMatchedPriorCount,
    retainedPriorCandidates: replayCandidates,
  };
}

function buildNearestPriorCandidates(input: {
  record: ModelMemoryObjectRecord;
  priorObjects: ModelMemoryObjectRecord[];
  supportCountByObjectId: Map<string, number>;
}): DuplicateAuditCandidateRecord[] {
  return input.priorObjects
    .filter(
      (candidate) =>
        !candidate.supersededAt &&
        candidate.lifecycleState !== "expired" &&
        candidate.canonicalClass === input.record.canonicalClass &&
        candidate.kind === input.record.kind &&
        candidate.scopeKey === input.record.scopeKey,
    )
    .map((candidate) => ({
      record: candidate,
      overlap: buildOverlapMetrics(input.record, candidate),
    }))
    .filter(
      ({ overlap }) =>
        overlap.overlapCount > 0 || overlap.normalizedSubjectExact || overlap.normalizedTitleExact,
    )
    .toSorted((left, right) => {
      if (right.overlap.smallerCoverage !== left.overlap.smallerCoverage) {
        return right.overlap.smallerCoverage - left.overlap.smallerCoverage;
      }
      if (right.overlap.overlapCount !== left.overlap.overlapCount) {
        return right.overlap.overlapCount - left.overlap.overlapCount;
      }
      return compareRecordsByCreatedAt(left.record, right.record);
    })
    .slice(0, 5)
    .map(({ record }) =>
      buildCandidateRecord({
        record,
        target: input.record,
        supportCount: input.supportCountByObjectId.get(record.id) ?? 0,
      }),
    );
}

function caseSortKey(caseRecord: DuplicateAuditRerunEscapeCase): number {
  const best = caseRecord.nearestPriorCandidates[0]?.overlap;
  if (!best) {
    return 0;
  }
  return best.smallerCoverage * 1000 + best.overlapCount;
}

function classifyDuplicateAuditCase(input: {
  record: ModelMemoryObjectRecord;
  historicalDecision: string;
  replayPathClassification: DuplicateAuditPathClassification;
  rawScopeMatchedPriorCount: number;
  nearestPriorCandidate?: ModelMemoryObjectRecord;
}): {
  missClass: DuplicateAuditMissClass;
  deltaClass?: StructuralDeltaClass;
  sameClaimLeaning?: boolean;
  sameClaimConfidence: SameClaimConfidence;
  packagingDriftType?: PackagingDriftType;
} {
  if (!input.nearestPriorCandidate) {
    return {
      missClass: "legit_distinct",
      deltaClass: undefined,
      sameClaimLeaning: false,
      sameClaimConfidence: "low",
      packagingDriftType: undefined,
    };
  }

  const structuralDelta = assessStructuralSameClaimDelta(
    toSyntheticObject(input.record),
    input.nearestPriorCandidate,
  );
  const overlap = buildOverlapMetrics(input.record, input.nearestPriorCandidate);

  const packagingDriftType =
    structuralDelta.packagingDriftType ??
    (input.record.kind === "fact" && overlap.containsOther && overlap.smallerCoverage >= 0.8
      ? "value_wrapper_drift"
      : overlap.containsOther && overlap.smallerCoverage >= 0.8
        ? "broader_narrower"
        : overlap.overlapCount >= 6
          ? "subject_drift"
          : "extra_constraint");
  const sameClaimConfidence: SameClaimConfidence = structuralDelta.isNonAdditive
    ? structuralDelta.sameClaimConfidence
    : overlap.overlapCount >= 8 && overlap.smallerCoverage >= 0.75
      ? "medium"
      : "low";

  if (input.historicalDecision === "supersede" && structuralDelta.isNonAdditive) {
    return {
      missClass: "historical_supersede_miss",
      deltaClass: structuralDelta.deltaClass,
      sameClaimLeaning: structuralDelta.sameClaimLeaning,
      sameClaimConfidence,
      packagingDriftType,
    };
  }

  if (
    input.replayPathClassification === "distinct_write" &&
    input.rawScopeMatchedPriorCount > 0 &&
    sameClaimConfidence !== "low"
  ) {
    return {
      missClass: "recall_miss",
      deltaClass: structuralDelta.deltaClass,
      sameClaimLeaning: structuralDelta.sameClaimLeaning,
      sameClaimConfidence,
      packagingDriftType,
    };
  }

  if (input.replayPathClassification === "batched_adjudication" && sameClaimConfidence !== "low") {
    return {
      missClass: "batch_attach_miss",
      deltaClass: structuralDelta.deltaClass,
      sameClaimLeaning: structuralDelta.sameClaimLeaning,
      sameClaimConfidence,
      packagingDriftType,
    };
  }

  return {
    missClass: "legit_distinct",
    deltaClass: structuralDelta.deltaClass,
    sameClaimLeaning: structuralDelta.sameClaimLeaning,
    sameClaimConfidence,
    packagingDriftType,
  };
}

function clusterCaseSortKey(caseRecord: DuplicateAuditClusterCase): number {
  return caseRecord.similarity * 1000;
}

function buildSampleCases(input: {
  rerunEscapeCases: DuplicateAuditRerunEscapeCase[];
  duplicateClusterCases: DuplicateAuditClusterCase[];
}): DuplicateAuditSampleCase[] {
  const rerunCases = [...input.rerunEscapeCases]
    .toSorted((left, right) => caseSortKey(right) - caseSortKey(left))
    .slice(0, 8)
    .map((caseRecord, index) => ({
      sampleId: `sample-rerun-${String(index + 1).padStart(2, "0")}`,
      from: "rerun_escape" as const,
      caseId: caseRecord.caseId,
      source: caseRecord.source,
      payloadSummary: caseRecord.payloadSummary,
      historicalDecision: caseRecord.historicalDecision,
      replayPathClassification: caseRecord.replayPathClassification,
      topPriorCandidate: caseRecord.nearestPriorCandidates[0],
    }));
  const duplicateCases = [...input.duplicateClusterCases]
    .toSorted((left, right) => clusterCaseSortKey(right) - clusterCaseSortKey(left))
    .slice(0, 8)
    .map((caseRecord, index) => ({
      sampleId: `sample-cluster-${String(index + 1).padStart(2, "0")}`,
      from: "duplicate_cluster" as const,
      caseId: caseRecord.caseId,
      source: caseRecord.newerObjectSource,
      payloadSummary: caseRecord.newerPayloadSummary,
      historicalDecision: caseRecord.newerHistoricalDecision,
      replayPathClassification: caseRecord.newerReplayPathClassification,
      topPriorCandidate: {
        objectId: caseRecord.olderObjectId,
        identityKey: caseRecord.olderObjectId,
        createdAt: "",
        lifecycleState: "active",
        supportCount: caseRecord.olderSupportCount,
        canonicalClass: caseRecord.canonicalClass,
        kind: caseRecord.kind,
        scopeKey: caseRecord.scopeKey,
        payloadSummary: caseRecord.olderPayloadSummary,
        normalizedSearchText: "",
        decisiveFieldAgreement: false,
        decisiveFieldSummary: "not computed for cluster corroboration rows",
        overlap: caseRecord.overlap,
      },
    }));
  return [...rerunCases, ...duplicateCases];
}

function buildMinimalProofInput(report: ProofPhaseReportInput): {
  proofPhaseReportGeneratedAt: string;
  initialIngestionWriteEventCount: number;
  saturationSourcePaths: string[];
  duplicateClusterCandidates: DuplicateClusterCandidate[];
} {
  return {
    proofPhaseReportGeneratedAt: report.generatedAt,
    initialIngestionWriteEventCount: (report.ingestionSummaries ?? []).reduce(
      (sum, entry) => sum + sumRecordValues(entry.writeDecisionCounts),
      0,
    ),
    saturationSourcePaths: [
      ...new Set((report.saturationRuns ?? []).flatMap((entry) => entry.sources)),
    ].toSorted((left, right) => left.localeCompare(right)),
    duplicateClusterCandidates: report.corpusTotals?.duplicateClusterCandidates ?? [],
  };
}

function findSourceForWindow(
  sourceById: Map<string, ModelMemorySourceRecord>,
  window: ModelMemorySourceWindowRecord | undefined,
): ModelMemorySourceRecord | undefined {
  return window ? sourceById.get(window.sourceId) : undefined;
}

function buildOriginWindowIdByObjectId(input: {
  supportItems: ModelMemorySupportItemRecord[];
  writeEvents: ModelMemoryWriteEventRecord[];
}): Map<string, string> {
  const byObjectId = new Map<string, string>();
  for (const event of input.writeEvents) {
    if (
      (event.decision === "write" || event.decision === "supersede") &&
      event.memoryObjectId &&
      !byObjectId.has(event.memoryObjectId)
    ) {
      byObjectId.set(event.memoryObjectId, event.sourceWindowId);
    }
  }
  for (const item of input.supportItems) {
    if (item.supportKind === "origin_capture") {
      byObjectId.set(item.memoryObjectId, item.sourceWindowId);
      continue;
    }
    if (!byObjectId.has(item.memoryObjectId)) {
      byObjectId.set(item.memoryObjectId, item.sourceWindowId);
    }
  }
  return byObjectId;
}

function buildRerunEscapeCases(input: {
  snapshot: Awaited<ReturnType<ModelMemoryDatabaseRuntime["canonicalRepository"]["snapshot"]>>;
  initialIngestionWriteEventCount: number;
  saturationSourcePaths: string[];
}): DuplicateAuditRerunEscapeCase[] {
  const sourceById = new Map(input.snapshot.sources.map((record) => [record.id, record] as const));
  const windowById = new Map(
    input.snapshot.sourceWindows.map((record) => [record.id, record] as const),
  );
  const originWindowIdByObjectId = buildOriginWindowIdByObjectId({
    supportItems: input.snapshot.supportItems,
    writeEvents: input.snapshot.writeEvents,
  });
  const objectById = new Map(
    input.snapshot.memoryObjects.map((record) => [record.id, record] as const),
  );
  const supportCountByObjectId = new Map<string, number>();
  for (const item of input.snapshot.supportItems) {
    supportCountByObjectId.set(
      item.memoryObjectId,
      (supportCountByObjectId.get(item.memoryObjectId) ?? 0) + 1,
    );
  }

  const rerunWrites = input.snapshot.writeEvents
    .slice(input.initialIngestionWriteEventCount)
    .filter(
      (event) =>
        (event.decision === "write" || event.decision === "supersede") &&
        Boolean(event.memoryObjectId),
    );

  const cases: DuplicateAuditRerunEscapeCase[] = [];
  const seenObjectIds = new Set<string>();

  for (const event of rerunWrites) {
    const record = event.memoryObjectId ? objectById.get(event.memoryObjectId) : undefined;
    if (!record || seenObjectIds.has(record.id)) {
      continue;
    }
    if (record.supersededAt || (record.lifecycleState ?? "active") !== "active") {
      continue;
    }
    const sourceWindowId = event.sourceWindowId || originWindowIdByObjectId.get(record.id);
    if (!sourceWindowId) {
      continue;
    }
    const window = windowById.get(sourceWindowId);
    const source = findSourceForWindow(sourceById, window);
    const sourcePath = source?.externalSourceId ?? "";
    if (!sourcePath || !input.saturationSourcePaths.includes(sourcePath)) {
      continue;
    }
    seenObjectIds.add(record.id);

    const priorObjects = input.snapshot.memoryObjects
      .filter((candidate) => compareRecordsByCreatedAt(candidate, record) < 0)
      .toSorted(compareRecordsByCreatedAt);
    const hasEarlierSameWindowObject = priorObjects.some(
      (candidate) => originWindowIdByObjectId.get(candidate.id) === sourceWindowId,
    );
    if (!hasEarlierSameWindowObject) {
      continue;
    }
    const replay = buildReplayPathClassification({
      record,
      priorObjects,
      sourceWindowId,
      sourceById,
      windowById,
    });
    const nearestPriorCandidates = buildNearestPriorCandidates({
      record,
      priorObjects,
      supportCountByObjectId,
    });
    const classification = classifyDuplicateAuditCase({
      record,
      historicalDecision: event.decision,
      replayPathClassification: replay.replayPathClassification,
      rawScopeMatchedPriorCount: replay.rawScopeMatchedPriorCount,
      nearestPriorCandidate: nearestPriorCandidates[0]
        ? priorObjects.find((candidate) => candidate.id === nearestPriorCandidates[0]?.objectId)
        : undefined,
    });

    cases.push({
      caseId: `rerun-${record.id}`,
      caseIdentity: buildModelMemoryCaseIdentity({
        sourcePath,
        headingPath: window?.headingPath,
        identityKey: event.candidateIdentityKey ?? record.identityKey,
      }),
      caseType: "saturation_rerun_escape",
      source: sourcePath,
      sourceWindowId,
      windowIndex: window?.windowIndex ?? -1,
      memoryObjectId: record.id,
      createdAt: record.createdAt.toISOString(),
      lifecycleState: record.lifecycleState ?? "active",
      canonicalClass: record.canonicalClass,
      kind: record.kind,
      scopeKey: record.scopeKey,
      payloadSummary: summarizePayload(record),
      supportCount: supportCountByObjectId.get(record.id) ?? 0,
      historicalDecision: event.decision,
      historicalDecisionCodes: event.decisionCodes,
      replayPathClassification: replay.replayPathClassification,
      missClass: classification.missClass,
      deltaClass: classification.deltaClass,
      sameClaimLeaning: classification.sameClaimLeaning,
      sameClaimConfidence: classification.sameClaimConfidence,
      packagingDriftType: classification.packagingDriftType,
      rawScopeMatchedPriorCount: replay.rawScopeMatchedPriorCount,
      retainedCandidateCount: replay.retainedPriorCandidates.length,
      nearestPriorCandidates,
      retainedPriorCandidates: replay.retainedPriorCandidates.map((candidate) =>
        buildCandidateRecord({
          record: candidate,
          target: record,
          supportCount: supportCountByObjectId.get(candidate.id) ?? 0,
        }),
      ),
    });
  }

  return cases.toSorted((left, right) => caseSortKey(right) - caseSortKey(left));
}

function buildDuplicateClusterCases(input: {
  duplicateClusterCandidates: DuplicateClusterCandidate[];
  snapshot: Awaited<ReturnType<ModelMemoryDatabaseRuntime["canonicalRepository"]["snapshot"]>>;
  rerunEscapeCases: DuplicateAuditRerunEscapeCase[];
}): DuplicateAuditClusterCase[] {
  const objectById = new Map(
    input.snapshot.memoryObjects.map((record) => [record.id, record] as const),
  );
  const supportCountByObjectId = new Map<string, number>();
  for (const item of input.snapshot.supportItems) {
    supportCountByObjectId.set(
      item.memoryObjectId,
      (supportCountByObjectId.get(item.memoryObjectId) ?? 0) + 1,
    );
  }
  const originWindowIdByObjectId = buildOriginWindowIdByObjectId({
    supportItems: input.snapshot.supportItems,
    writeEvents: input.snapshot.writeEvents,
  });
  const sourceById = new Map(input.snapshot.sources.map((record) => [record.id, record] as const));
  const windowById = new Map(
    input.snapshot.sourceWindows.map((record) => [record.id, record] as const),
  );
  const rerunCaseByObjectId = new Map(
    input.rerunEscapeCases.map((caseRecord) => [caseRecord.memoryObjectId, caseRecord] as const),
  );

  return input.duplicateClusterCandidates
    .flatMap((cluster) => {
      const left = objectById.get(cluster.leftObjectId);
      const right = objectById.get(cluster.rightObjectId);
      if (!left || !right) {
        return [];
      }
      const older = compareRecordsByCreatedAt(left, right) <= 0 ? left : right;
      const newer = older.id === left.id ? right : left;
      const sourceWindowId = originWindowIdByObjectId.get(newer.id);
      if (!sourceWindowId) {
        return [];
      }
      const newerWindow = windowById.get(sourceWindowId);
      const newerSource = findSourceForWindow(sourceById, newerWindow);
      const newerWrite = input.snapshot.writeEvents.find(
        (event) => event.memoryObjectId === newer.id,
      );
      return [
        {
          caseId: `cluster-${older.id}-${newer.id}`,
          caseIdentity: buildModelMemoryCaseIdentity({
            sourcePath: newerSource?.externalSourceId ?? "",
            headingPath: newerWindow?.headingPath,
            identityKey: newer.identityKey,
          }),
          caseType: "duplicate_cluster_candidate" as const,
          similarity: cluster.similarity,
          olderObjectId: older.id,
          newerObjectId: newer.id,
          canonicalClass: cluster.canonicalClass,
          kind: cluster.kind,
          scopeKey: cluster.scopeKey,
          olderPayloadSummary: summarizePayload(older),
          newerPayloadSummary: summarizePayload(newer),
          overlap: buildOverlapMetrics(newer, older),
          newerObjectSource: newerSource?.externalSourceId,
          newerHistoricalDecision: newerWrite?.decision,
          newerHistoricalDecisionCodes: newerWrite?.decisionCodes ?? [],
          newerReplayPathClassification: rerunCaseByObjectId.get(newer.id)
            ?.replayPathClassification,
          olderSupportCount: supportCountByObjectId.get(older.id) ?? 0,
          newerSupportCount: supportCountByObjectId.get(newer.id) ?? 0,
        } satisfies DuplicateAuditClusterCase,
      ];
    })
    .toSorted((left, right) => clusterCaseSortKey(right) - clusterCaseSortKey(left));
}

export async function runModelMemoryDuplicateAudit(input: {
  runtime: ModelMemoryDatabaseRuntime;
  proofPhaseReportPath: string;
}): Promise<DuplicateAuditReport> {
  const proofReport = JSON.parse(
    await readFile(input.proofPhaseReportPath, "utf8"),
  ) as ProofPhaseReportInput;
  const parsed = buildMinimalProofInput(proofReport);
  const snapshot = await input.runtime.canonicalRepository.snapshot();
  const rerunEscapeCases = buildRerunEscapeCases({
    snapshot,
    initialIngestionWriteEventCount: parsed.initialIngestionWriteEventCount,
    saturationSourcePaths: parsed.saturationSourcePaths,
  });
  const duplicateClusterCases = buildDuplicateClusterCases({
    duplicateClusterCandidates: parsed.duplicateClusterCandidates,
    snapshot,
    rerunEscapeCases,
  });
  const sampleCases = buildSampleCases({
    rerunEscapeCases,
    duplicateClusterCases,
  });

  return {
    generatedAt: new Date().toISOString(),
    currentCorpus: true,
    databaseMode: input.runtime.resolution.databaseMode,
    databaseName: input.runtime.resolution.databaseName,
    proofPhaseReportPath: input.proofPhaseReportPath,
    proofPhaseReportGeneratedAt: parsed.proofPhaseReportGeneratedAt,
    initialIngestionWriteEventCount: parsed.initialIngestionWriteEventCount,
    saturationSourcePaths: parsed.saturationSourcePaths,
    rerunEscapeCases,
    duplicateClusterCases,
    sampleCases,
    summary: {
      rerunEscapeCaseCount: rerunEscapeCases.length,
      duplicateClusterCaseCount: duplicateClusterCases.length,
      rerunHistoricalDecisionCounts: countBy(
        rerunEscapeCases.map((caseRecord) => caseRecord.historicalDecision),
      ),
      rerunReplayPathCounts: countBy(
        rerunEscapeCases.map((caseRecord) => caseRecord.replayPathClassification),
      ),
      rerunCaseCountByKind: countBy(rerunEscapeCases.map((caseRecord) => caseRecord.kind)),
      rerunMissClassCounts: countBy(rerunEscapeCases.map((caseRecord) => caseRecord.missClass)),
      rerunPackagingDriftTypeCounts: countBy(
        rerunEscapeCases
          .map((caseRecord) => caseRecord.packagingDriftType)
          .filter((value): value is PackagingDriftType => value !== undefined),
      ),
      rerunRetainedCandidateCount: {
        zero: rerunEscapeCases.filter((caseRecord) => caseRecord.retainedCandidateCount === 0)
          .length,
        one: rerunEscapeCases.filter((caseRecord) => caseRecord.retainedCandidateCount === 1)
          .length,
        multiple: rerunEscapeCases.filter((caseRecord) => caseRecord.retainedCandidateCount > 1)
          .length,
      },
    },
  };
}

function renderCandidate(candidate: DuplicateAuditCandidateRecord): string {
  return [
    candidate.objectId,
    `payload=${candidate.payloadSummary}`,
    `decisiveFieldAgreement=${candidate.decisiveFieldAgreement}`,
    `decisiveFieldSummary=${candidate.decisiveFieldSummary}`,
    `overlap=${candidate.overlap.overlapCount}`,
    `smaller=${candidate.overlap.smallerCoverage.toFixed(2)}`,
    `larger=${candidate.overlap.largerCoverage.toFixed(2)}`,
    `subjectExact=${candidate.overlap.normalizedSubjectExact}`,
  ].join(" | ");
}

export function renderModelMemoryDuplicateAuditMarkdown(report: DuplicateAuditReport): string {
  const lines = [
    "# Model Memory Duplicate Escape Audit",
    "",
    `- Generated at: ${report.generatedAt}`,
    `- Current corpus: ${report.currentCorpus}`,
    `- DB mode: ${report.databaseMode ?? "unspecified"}`,
    `- Database: ${report.databaseName}`,
    `- Proof report: ${report.proofPhaseReportPath}`,
    `- Proof report generated at: ${report.proofPhaseReportGeneratedAt}`,
    `- Initial ingestion write-event count: ${report.initialIngestionWriteEventCount}`,
    `- Saturation sources: ${report.saturationSourcePaths.join(", ")}`,
    `- Rerun escape cases: ${report.summary.rerunEscapeCaseCount}`,
    `- Duplicate-cluster cases: ${report.summary.duplicateClusterCaseCount}`,
    `- Rerun historical decisions: ${JSON.stringify(report.summary.rerunHistoricalDecisionCounts)}`,
    `- Rerun replay paths: ${JSON.stringify(report.summary.rerunReplayPathCounts)}`,
    `- Rerun cases by kind: ${JSON.stringify(report.summary.rerunCaseCountByKind)}`,
    `- Rerun miss classes: ${JSON.stringify(report.summary.rerunMissClassCounts)}`,
    `- Rerun packaging drift: ${JSON.stringify(report.summary.rerunPackagingDriftTypeCounts)}`,
    `- Retained candidate counts: ${JSON.stringify(report.summary.rerunRetainedCandidateCount)}`,
    "",
    "## Sample Cases",
    "",
  ];

  for (const sample of report.sampleCases) {
    lines.push(`### ${sample.sampleId}`);
    lines.push(`- Source: ${sample.source ?? "n/a"}`);
    lines.push(`- Case id: ${sample.caseId}`);
    lines.push(`- Case type: ${sample.from}`);
    lines.push(`- Payload: ${sample.payloadSummary}`);
    lines.push(`- Historical decision: ${sample.historicalDecision ?? "n/a"}`);
    lines.push(`- Replay path: ${sample.replayPathClassification ?? "n/a"}`);
    if (sample.topPriorCandidate) {
      lines.push(`- Top prior candidate: ${renderCandidate(sample.topPriorCandidate)}`);
    }
    lines.push("");
  }

  lines.push("## Rerun Escape Cases");
  lines.push("");
  for (const caseRecord of report.rerunEscapeCases) {
    lines.push(`### ${caseRecord.caseId}`);
    lines.push(`- Source: ${caseRecord.source}`);
    lines.push(`- Window: ${caseRecord.sourceWindowId} (index ${caseRecord.windowIndex})`);
    lines.push(`- Object: ${caseRecord.memoryObjectId}`);
    lines.push(`- Created at: ${caseRecord.createdAt}`);
    lines.push(`- Payload: ${caseRecord.payloadSummary}`);
    lines.push(
      `- Historical decision: ${caseRecord.historicalDecision} ${JSON.stringify(caseRecord.historicalDecisionCodes)}`,
    );
    lines.push(`- Replay path: ${caseRecord.replayPathClassification}`);
    lines.push(`- Miss class: ${caseRecord.missClass}`);
    lines.push(`- Delta class: ${caseRecord.deltaClass ?? "n/a"}`);
    lines.push(`- Same-claim leaning: ${caseRecord.sameClaimLeaning ?? false}`);
    lines.push(`- Same-claim confidence: ${caseRecord.sameClaimConfidence}`);
    lines.push(`- Packaging drift: ${caseRecord.packagingDriftType ?? "n/a"}`);
    lines.push(`- Raw scope-matched prior count: ${caseRecord.rawScopeMatchedPriorCount}`);
    lines.push(`- Retained candidate count: ${caseRecord.retainedCandidateCount}`);
    lines.push(`- Support count: ${caseRecord.supportCount}`);
    for (const candidate of caseRecord.nearestPriorCandidates) {
      lines.push(`- Prior candidate: ${renderCandidate(candidate)}`);
    }
    lines.push("");
  }

  lines.push("## Duplicate Cluster Cases");
  lines.push("");
  for (const caseRecord of report.duplicateClusterCases) {
    lines.push(`### ${caseRecord.caseId}`);
    lines.push(`- Similarity: ${caseRecord.similarity}`);
    lines.push(`- Older object: ${caseRecord.olderObjectId} | ${caseRecord.olderPayloadSummary}`);
    lines.push(`- Newer object: ${caseRecord.newerObjectId} | ${caseRecord.newerPayloadSummary}`);
    lines.push(`- Newer source: ${caseRecord.newerObjectSource ?? "n/a"}`);
    lines.push(
      `- Newer historical decision: ${caseRecord.newerHistoricalDecision ?? "n/a"} ${JSON.stringify(caseRecord.newerHistoricalDecisionCodes)}`,
    );
    lines.push(`- Newer replay path: ${caseRecord.newerReplayPathClassification ?? "n/a"}`);
    lines.push(
      `- Overlap: overlap=${caseRecord.overlap.overlapCount} smaller=${caseRecord.overlap.smallerCoverage.toFixed(2)} larger=${caseRecord.overlap.largerCoverage.toFixed(2)} subjectExact=${caseRecord.overlap.normalizedSubjectExact}`,
    );
    lines.push("");
  }

  return lines.join("\n");
}
