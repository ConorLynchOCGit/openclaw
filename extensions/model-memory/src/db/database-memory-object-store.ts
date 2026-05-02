import { buildDeterministicUuid } from "../deterministic-uuid.ts";
import type { StoreWriteResult, StoredCaptureInput } from "../memory-object-store.ts";
import { summarizeModelMemoryPayload } from "../payload-summary.ts";
import type {
  BoundedCandidateAdjudicationBatchDecision,
  BoundedCandidateAdjudicationCandidate,
  BoundedCandidateAdjudicationRequest,
  BoundedCandidateAdjudicationSource,
  CollisionCandidate,
  SemanticCollisionAdjudicator,
} from "../semantic-collision-adjudication.ts";
import {
  assessStructuralSameClaimDelta,
  describeFamilyRecallMatch,
  describeRuleActionBundleMatchProfile,
  deriveMemoryIdentity,
  hasStrongRuleActionBundleRecallMatch,
  normalizeIdentityText,
  describeDecisiveFieldAgreement,
  type MemoryIdentityDescriptor,
} from "../semantic-identity.ts";
import type { ModelMemoryObject } from "../semantic-schema.ts";
import type {
  ModelMemoryObjectRecord,
  ModelMemorySourceRecord,
  ModelMemorySourceWindowRecord,
  ModelMemorySupportItemRecord,
  ModelMemorySupersessionLinkRecord,
  ModelMemoryWriteEventRecord,
} from "../storage-database-contract.ts";
import {
  decideWritePolicy,
  type ExistingStoredObject,
  type WritePolicyDecision,
} from "../write-policy.ts";
import { ModelMemoryCanonicalRepository } from "./canonical-repository.ts";

const DEFAULT_COLLISION_CANDIDATE_LIMIT = 5;
const PROVISIONAL_EXPIRY_MS = 1000 * 60 * 60 * 24 * 7;
const COLLISION_ANCHOR_TOKEN_MIN_LENGTH = 4;
const COLLISION_ANCHOR_TOKEN_MIN_OVERLAP = 3;
const COLLISION_PLAUSIBLE_MIN_SMALLER_COVERAGE = 0.45;
const COLLISION_PLAUSIBLE_MIN_OVERLAP = 3;
const COLLISION_DECISIVE_FIELD_SCORE_BONUS = 60;
const COLLISION_DECISIVE_FIELD_RECALL_SCORE_BONUS = 40;
const COLLISION_FAMILY_RECALL_SCORE_BONUS = 30;
const COLLISION_RULE_ACTION_BUNDLE_RECALL_SCORE_BONUS = 35;
const COLLISION_RULE_WRAPPER_RECALL_SCORE_BONUS = 18;
const COLLISION_SAME_SOURCE_FAMILY_SCORE_BONUS = 15;
const ZERO_CANDIDATE_RECOVERY_MAX_RESULTS = 5;
const ZERO_CANDIDATE_RECOVERY_MAX_CANDIDATES = 3;
const ZERO_CANDIDATE_RECOVERY_MIN_SCORE = 0.35;
const ZERO_CANDIDATE_RECOVERY_TOP1_GAP = 0.12;

export type CollisionGateDisposition = "zero_candidate_skip" | "admitted_to_batch";

export type CollisionGateObservation = {
  sourceWindowId: string;
  candidateId: string;
  caseIdentity: string;
  objectSummary: string;
  canonicalClass: ModelMemoryObject["canonicalClass"];
  kind: ModelMemoryObject["kind"];
  rawCandidateCount: number;
  retainedCandidateCount: number;
  prunedCandidateCount: number;
  disposition: CollisionGateDisposition;
};

export type DatabaseMemoryObjectStoreObserver = {
  onCollisionGate?(event: CollisionGateObservation): void;
  onBoundedCandidateAdjudication?(event: BoundedCandidateAdjudicationObservation): void;
};

export type BoundedCandidateAdjudicationFinalRoute =
  | "no_candidates"
  | "direct_distinct"
  | "direct_attach_support"
  | "local_supersede"
  | "local_distinct_additive"
  | "local_conflict_hold_ambiguous"
  | "local_conflict_hold_structural_drift";

export type ZeroCandidateRecoverySearchResult = {
  record: ModelMemoryObjectRecord;
  similarityScore: number;
  searchRank: number;
  sourcePath?: string;
  sameCanonicalClass: boolean;
  sameKind: boolean;
  sameScope: boolean;
  eligibleForMergeConsideration: boolean;
};

export type ZeroCandidateRecoverySelection = {
  queryText: string;
  rawSearchResults: ZeroCandidateRecoverySearchResult[];
  selectedResults: ZeroCandidateRecoverySearchResult[];
};

export type BoundedCandidateAdjudicationObservation = {
  sourceWindowId: string;
  candidateId: string;
  caseIdentity: string;
  objectSummary: string;
  canonicalClass: ModelMemoryObject["canonicalClass"];
  kind: ModelMemoryObject["kind"];
  candidateSource: BoundedCandidateAdjudicationSource;
  queryText: string;
  rawSearchResults: Array<{
    memoryObjectId: string;
    similarityScore: number;
    searchRank: number;
    canonicalClass: string;
    kind: string;
    scopeKey?: string;
    sourcePath?: string;
    sameCanonicalClass: boolean;
    sameKind: boolean;
    sameScope: boolean;
    eligibleForMergeConsideration: boolean;
    selectedForAdjudication: boolean;
  }>;
  adjudicationCandidateCount: number;
  adjudicationBatchAdmitted: boolean;
  modelOutput?: BoundedCandidateAdjudicationBatchDecision;
  finalLocalRouting: BoundedCandidateAdjudicationFinalRoute;
};

export function buildCollisionCaseIdentity(input: {
  sourceWindowId: string;
  identityKey: string;
}): string {
  return `${input.sourceWindowId}:${input.identityKey}`;
}

function extractStoredObjectShape(record: ModelMemoryObjectRecord): ExistingStoredObject {
  return {
    id: record.id,
    kind: record.kind as ModelMemoryObject["kind"],
    identityKey: record.identityKey,
    slotKey: record.slotKey,
    lifecycleState: record.lifecycleState,
  };
}

function buildObjectRecord(
  input: StoredCaptureInput,
  identity: MemoryIdentityDescriptor,
  policy: Extract<WritePolicyDecision, { decision: "write" | "supersede" }>,
  createdAt: Date,
): ModelMemoryObjectRecord {
  const activatedAt = policy.lifecycleState === "active" ? createdAt : undefined;
  return {
    id: buildDeterministicUuid("memory", identity.identityKey),
    sourceWindowId: input.sourceWindowId,
    canonicalClass: input.object.canonicalClass,
    kind: input.object.kind,
    payload: input.object.payload,
    normalizedSubject: identity.normalizedSubject,
    normalizedTitle: identity.normalizedTitle,
    normalizedSearchText: identity.normalizedSearchText,
    scope: input.object.scope ?? {},
    scopeKey: identity.scopeKey,
    provenance: input.object.provenance,
    lifecycleState: policy.lifecycleState,
    activationBasis: policy.activationBasis,
    confidence: input.object.confidence,
    durability: input.object.durability,
    suggestedReviewMode: input.object.reviewMode,
    executedReviewMode: policy.executedReviewMode,
    rationaleCodes: input.object.rationaleCodes ?? [],
    identityKey: identity.identityKey,
    slotKey: identity.slotKey,
    contractName: input.contractName,
    contractVersion: input.contractVersion,
    modelId: input.modelId,
    createdAt,
    activatedAt,
  };
}

function buildSupportFingerprint(input: StoredCaptureInput): string {
  return `${input.sourceKind ?? "document"}:${input.sourceWindowId}`;
}

function buildSupportItemRecord(
  memoryObjectId: string,
  input: StoredCaptureInput,
  policy: Extract<WritePolicyDecision, { decision: "attach_support" | "write" | "supersede" }>,
  createdAt: Date,
): ModelMemorySupportItemRecord {
  const supportFingerprint = buildSupportFingerprint(input);
  return {
    id: buildDeterministicUuid("support", `${memoryObjectId}:${supportFingerprint}`),
    memoryObjectId,
    sourceWindowId: input.sourceWindowId,
    provenance: input.object.provenance,
    supportFingerprint,
    supportKind: policy.support.supportKind,
    countsForReinforcement: policy.support.countsForReinforcement,
    derivedFromSourceKind: input.sourceKind ?? "document",
    createdAt,
  };
}

function buildWriteEventRecord(
  index: number,
  input: StoredCaptureInput,
  identity: MemoryIdentityDescriptor,
  policy: WritePolicyDecision,
  createdAt: Date,
  memoryObjectId?: string,
  supportItemId?: string,
): ModelMemoryWriteEventRecord {
  return {
    id: buildDeterministicUuid(
      "write",
      `${index}:${input.sourceWindowId}:${identity.identityKey}:${policy.decision}`,
    ),
    sourceWindowId: input.sourceWindowId,
    candidateIdentityKey: identity.identityKey,
    decision: policy.decision,
    memoryObjectId,
    supersededObjectId: policy.decision === "supersede" ? policy.supersededObjectId : undefined,
    supportItemId,
    decisionCodes: policy.decisionCodes,
    contractName: input.contractName,
    contractVersion: input.contractVersion,
    modelId: input.modelId,
    createdAt,
  };
}

function summarizeObject(object: ModelMemoryObject): string {
  return summarizeModelMemoryPayload(object);
}

function tokenize(value: string): string[] {
  return value
    .split(/[^a-z0-9]+/i)
    .map((token) => normalizeIdentityText(token))
    .filter((token) => token.length > 0);
}

export type SearchTextOverlap = {
  overlapCount: number;
  smallerCoverage: number;
  largerCoverage: number;
  containsOther: boolean;
};

type CollisionSourceFamilyContext = {
  currentSourceFamilyKey?: string;
  candidateSourceFamilyKeys: Map<string, string>;
};

function buildSearchTextTokenSet(value: string): Set<string> {
  return new Set(
    tokenize(value).filter((token) => token.length >= COLLISION_ANCHOR_TOKEN_MIN_LENGTH),
  );
}

export function calculateSearchTextOverlap(
  leftSearchText: string,
  rightSearchText: string,
): SearchTextOverlap {
  const leftTokens = buildSearchTextTokenSet(leftSearchText);
  const rightTokens = buildSearchTextTokenSet(rightSearchText);
  const smallerSize = Math.min(leftTokens.size, rightTokens.size);
  const largerSize = Math.max(leftTokens.size, rightTokens.size);

  if (smallerSize === 0 || largerSize === 0) {
    return {
      overlapCount: 0,
      smallerCoverage: 0,
      largerCoverage: 0,
      containsOther: false,
    };
  }

  let overlapCount = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlapCount += 1;
    }
  }

  return {
    overlapCount,
    smallerCoverage: overlapCount / smallerSize,
    largerCoverage: overlapCount / largerSize,
    containsOther:
      leftSearchText.includes(rightSearchText) || rightSearchText.includes(leftSearchText),
  };
}

export function calculateRawTextRecoverySimilarity(
  leftSearchText: string,
  rightSearchText: string,
): number {
  const leftTokens = new Set(tokenize(leftSearchText));
  const rightTokens = new Set(tokenize(rightSearchText));
  if (leftTokens.size === 0 && rightTokens.size === 0) {
    return 1;
  }
  const union = new Set([...leftTokens, ...rightTokens]);
  if (union.size === 0) {
    return 0;
  }
  let overlapCount = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlapCount += 1;
    }
  }
  return overlapCount / union.size;
}

function describeZeroCandidateRecoveryAdvisory(input: {
  object: ModelMemoryObject;
  identity: MemoryIdentityDescriptor;
  candidate: ModelMemoryObjectRecord;
}): {
  sameCanonicalClass: boolean;
  sameKind: boolean;
  sameScope: boolean;
  eligibleForMergeConsideration: boolean;
} {
  const sameCanonicalClass = input.candidate.canonicalClass === input.object.canonicalClass;
  const sameKind = input.candidate.kind === input.object.kind;
  const sameScope = input.candidate.scopeKey === input.identity.scopeKey;
  return {
    sameCanonicalClass,
    sameKind,
    sameScope,
    eligibleForMergeConsideration: sameCanonicalClass && sameKind && sameScope,
  };
}

export function buildZeroCandidateRecoverySelection(input: {
  object: ModelMemoryObject;
  identity: MemoryIdentityDescriptor;
  memoryObjects: ModelMemoryObjectRecord[];
  resolveSourcePath?: (record: ModelMemoryObjectRecord) => string | undefined;
  maxResults?: number;
}): ZeroCandidateRecoverySelection {
  const rankedResults = input.memoryObjects
    .filter(
      (record) =>
        !record.supersededAt &&
        record.lifecycleState !== "expired" &&
        record.identityKey !== input.identity.identityKey,
    )
    .map((record) => ({
      ...describeZeroCandidateRecoveryAdvisory({
        object: input.object,
        identity: input.identity,
        candidate: record,
      }),
      record,
      similarityScore: Number(
        calculateRawTextRecoverySimilarity(
          input.identity.normalizedSearchText,
          record.normalizedSearchText,
        ).toFixed(4),
      ),
      sourcePath: input.resolveSourcePath?.(record),
    }))
    .filter((entry) => entry.similarityScore > 0)
    .toSorted((left, right) => {
      if (right.similarityScore !== left.similarityScore) {
        return right.similarityScore - left.similarityScore;
      }
      return left.record.id.localeCompare(right.record.id);
    })
    .map((entry, index) => ({
      ...entry,
      searchRank: index + 1,
    }));

  const maxResults = input.maxResults ?? ZERO_CANDIDATE_RECOVERY_MAX_RESULTS;
  const rawSearchResults = rankedResults.slice(0, maxResults);
  const strongCandidates = rankedResults.filter(
    (entry) => entry.similarityScore >= ZERO_CANDIDATE_RECOVERY_MIN_SCORE,
  );

  let selectedResults: ZeroCandidateRecoverySearchResult[] = [];
  const [top1, top2] = strongCandidates;
  if (top1) {
    const top1Gap = top2 ? top1.similarityScore - top2.similarityScore : top1.similarityScore;
    if (
      strongCandidates.length === 1 ||
      top2?.similarityScore === undefined ||
      top2.similarityScore < ZERO_CANDIDATE_RECOVERY_MIN_SCORE ||
      top1Gap >= ZERO_CANDIDATE_RECOVERY_TOP1_GAP
    ) {
      selectedResults = [top1];
    } else {
      selectedResults = strongCandidates.slice(0, ZERO_CANDIDATE_RECOVERY_MAX_CANDIDATES);
    }
  }

  return {
    queryText: input.identity.normalizedSearchText,
    rawSearchResults,
    selectedResults,
  };
}

function buildSourceFamilyKey(source: ModelMemorySourceRecord): string {
  return `${source.sourceKind}:${source.externalSourceId ?? source.sourceFingerprint}`;
}

function buildCollisionSourceFamilyContext(input: {
  sourceWindowId: string;
  memoryObjects: ModelMemoryObjectRecord[];
  sourceWindows: ModelMemorySourceWindowRecord[];
  sources: ModelMemorySourceRecord[];
}): CollisionSourceFamilyContext {
  const sourceById = new Map(input.sources.map((source) => [source.id, source] as const));
  const sourceFamilyKeyByWindowId = new Map(
    input.sourceWindows.map((window) => {
      const source = sourceById.get(window.sourceId);
      return [window.id, source ? buildSourceFamilyKey(source) : undefined] as const;
    }),
  );

  return {
    currentSourceFamilyKey: sourceFamilyKeyByWindowId.get(input.sourceWindowId),
    candidateSourceFamilyKeys: new Map(
      input.memoryObjects
        .map(
          (record) =>
            [
              record.id,
              record.sourceWindowId
                ? sourceFamilyKeyByWindowId.get(record.sourceWindowId)
                : undefined,
            ] as const,
        )
        .filter(
          (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0,
        ),
    ),
  };
}

function isCollisionCandidatePlausible(
  object: ModelMemoryObject,
  identity: MemoryIdentityDescriptor,
  candidate: ModelMemoryObjectRecord,
  sourceFamilyContext?: CollisionSourceFamilyContext,
): boolean {
  const decisiveFieldAgreement = describeDecisiveFieldAgreement(object, candidate);
  if (
    decisiveFieldAgreement.hasComparableFields &&
    decisiveFieldAgreement.allComparableFieldsMatch
  ) {
    return true;
  }

  const familyRecallMatch = describeFamilyRecallMatch(object, candidate);
  const currentSourceFamilyKey = sourceFamilyContext?.currentSourceFamilyKey;
  const sameSourceFamily =
    Boolean(currentSourceFamilyKey) &&
    sourceFamilyContext?.candidateSourceFamilyKeys.get(candidate.id) === currentSourceFamilyKey;
  const overlap = calculateSearchTextOverlap(
    identity.normalizedSearchText,
    candidate.normalizedSearchText,
  );
  if (
    familyRecallMatch.decision === "yes_now" &&
    (familyRecallMatch.strong || (sameSourceFamily && familyRecallMatch.moderate))
  ) {
    return true;
  }

  if (
    object.kind === "rule" &&
    candidate.kind === "rule" &&
    hasStrongRuleActionBundleRecallMatch(object, candidate)
  ) {
    return true;
  }

  if (object.kind === "rule" && candidate.kind === "rule" && sameSourceFamily) {
    const actionBundleMatch = describeRuleActionBundleMatchProfile(object, candidate);
    if (
      actionBundleMatch.moderate &&
      overlap.overlapCount >= 4 &&
      overlap.smallerCoverage >= 0.35 &&
      (overlap.largerCoverage >= 0.2 || overlap.containsOther)
    ) {
      return true;
    }
  }

  if (candidate.normalizedSubject && identity.normalizedSubject) {
    if (candidate.normalizedSubject === identity.normalizedSubject) {
      return true;
    }
    if (
      candidate.normalizedSubject.includes(identity.normalizedSubject) ||
      identity.normalizedSubject.includes(candidate.normalizedSubject)
    ) {
      return true;
    }
  }

  if (
    candidate.normalizedTitle &&
    identity.normalizedTitle &&
    candidate.normalizedTitle === identity.normalizedTitle
  ) {
    return true;
  }

  if (overlap.containsOther && overlap.overlapCount >= COLLISION_ANCHOR_TOKEN_MIN_OVERLAP) {
    return true;
  }

  return (
    overlap.overlapCount >= COLLISION_PLAUSIBLE_MIN_OVERLAP &&
    overlap.smallerCoverage >= COLLISION_PLAUSIBLE_MIN_SMALLER_COVERAGE
  );
}

function scoreCollisionCandidate(
  object: ModelMemoryObject,
  identity: MemoryIdentityDescriptor,
  candidate: ModelMemoryObjectRecord,
  sourceFamilyContext?: CollisionSourceFamilyContext,
): number {
  if (candidate.canonicalClass !== object.canonicalClass || candidate.kind !== object.kind) {
    return -1;
  }
  if (candidate.scopeKey !== identity.scopeKey) {
    return -1;
  }
  if (!isCollisionCandidatePlausible(object, identity, candidate, sourceFamilyContext)) {
    return -1;
  }

  const decisiveFieldAgreement = describeDecisiveFieldAgreement(object, candidate);
  const familyRecallMatch = describeFamilyRecallMatch(object, candidate);
  const structuralDelta = assessStructuralSameClaimDelta(object, candidate);
  const currentSourceFamilyKey = sourceFamilyContext?.currentSourceFamilyKey;
  const sameSourceFamily =
    Boolean(currentSourceFamilyKey) &&
    sourceFamilyContext?.candidateSourceFamilyKeys.get(candidate.id) === currentSourceFamilyKey;
  const ruleActionBundleMatch =
    object.kind === "rule" && candidate.kind === "rule"
      ? describeRuleActionBundleMatchProfile(object, candidate)
      : undefined;
  let score = 0;
  if (candidate.normalizedSubject && identity.normalizedSubject) {
    if (candidate.normalizedSubject === identity.normalizedSubject) {
      score += 10;
    } else if (
      candidate.normalizedSubject.includes(identity.normalizedSubject) ||
      identity.normalizedSubject.includes(candidate.normalizedSubject)
    ) {
      score += 5;
    }
  }
  if (candidate.normalizedTitle && identity.normalizedTitle) {
    if (candidate.normalizedTitle === identity.normalizedTitle) {
      score += 10;
    }
  }

  if (decisiveFieldAgreement.hasComparableFields) {
    score +=
      decisiveFieldAgreement.matchingComparableFieldCount *
      COLLISION_DECISIVE_FIELD_RECALL_SCORE_BONUS;
    if (decisiveFieldAgreement.allComparableFieldsMatch) {
      score += COLLISION_DECISIVE_FIELD_SCORE_BONUS;
    }
  }
  if (familyRecallMatch.decision === "yes_now") {
    score += familyRecallMatch.bundleOverlapCount * 4;
    score += Math.round(familyRecallMatch.smallerCoverage * 20);
    score += Math.round(familyRecallMatch.largerCoverage * 10);
    if (familyRecallMatch.strong) {
      score += COLLISION_FAMILY_RECALL_SCORE_BONUS;
    }
  }
  if (
    object.kind === "rule" &&
    candidate.kind === "rule" &&
    hasStrongRuleActionBundleRecallMatch(object, candidate)
  ) {
    score += COLLISION_RULE_ACTION_BUNDLE_RECALL_SCORE_BONUS;
  } else if (sameSourceFamily && ruleActionBundleMatch?.moderate) {
    score += COLLISION_RULE_WRAPPER_RECALL_SCORE_BONUS;
  }
  if (sameSourceFamily) {
    score += COLLISION_SAME_SOURCE_FAMILY_SCORE_BONUS;
  }
  if (structuralDelta.isNonAdditive) {
    score += 15;
  }

  const overlap = calculateSearchTextOverlap(
    identity.normalizedSearchText,
    candidate.normalizedSearchText,
  );
  score += overlap.overlapCount * 5;
  score += Math.round(overlap.smallerCoverage * 30);
  score += Math.round(overlap.largerCoverage * 15);
  if (overlap.containsOther) {
    score += 10;
  }

  return score;
}

function hasSameSlotSupersessionReason(input: {
  identity: MemoryIdentityDescriptor;
  object: ModelMemoryObject;
  candidate: ModelMemoryObjectRecord;
}): boolean {
  return Boolean(
    input.identity.slotKey &&
    input.candidate.slotKey &&
    input.identity.slotKey === input.candidate.slotKey &&
    input.identity.identityKey !== input.candidate.identityKey,
  );
}

export type CollisionCandidateBuildResult = {
  rawCandidateCount: number;
  retainedRecords: ModelMemoryObjectRecord[];
  candidates: CollisionCandidate[];
};

export function buildCollisionCandidates(
  object: ModelMemoryObject,
  identity: MemoryIdentityDescriptor,
  memoryObjects: ModelMemoryObjectRecord[],
  sourceFamilyContext?: CollisionSourceFamilyContext,
): CollisionCandidateBuildResult {
  const eligibleRecords = memoryObjects.filter(
    (record) =>
      !record.supersededAt &&
      record.lifecycleState !== "expired" &&
      record.identityKey !== identity.identityKey &&
      record.canonicalClass === object.canonicalClass &&
      record.kind === object.kind &&
      record.scopeKey === identity.scopeKey,
  );

  const candidates = eligibleRecords
    .map((record) => ({
      record,
      score: scoreCollisionCandidate(object, identity, record, sourceFamilyContext),
    }))
    .filter((entry) => entry.score >= 0)
    .toSorted((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.record.id.localeCompare(right.record.id);
    });

  const retainedRecords = candidates
    .slice(0, DEFAULT_COLLISION_CANDIDATE_LIMIT)
    .map(({ record }) => record);

  return {
    rawCandidateCount: eligibleRecords.length,
    retainedRecords,
    candidates: retainedRecords.map((record) => ({
      id: record.id,
      identityKey: record.identityKey,
      canonicalClass: record.canonicalClass,
      kind: record.kind,
      payload: record.payload,
      scope: record.scope,
      normalizedSearchText: record.normalizedSearchText,
      lifecycleState: record.lifecycleState,
      slotKey: record.slotKey,
    })),
  };
}

export function toBoundedCandidateAdjudicationCandidatesFromSearch(
  selection: ZeroCandidateRecoverySelection,
): BoundedCandidateAdjudicationCandidate[] {
  return selection.selectedResults.map((entry, index) => ({
    adjudicationCandidateId: `candidate_${index + 1}`,
    id: entry.record.id,
    identityKey: entry.record.identityKey,
    canonicalClass: entry.record.canonicalClass,
    kind: entry.record.kind,
    payload: entry.record.payload,
    scope: entry.record.scope,
    normalizedSearchText: entry.record.normalizedSearchText,
    lifecycleState: entry.record.lifecycleState,
    slotKey: entry.record.slotKey,
    candidateSource: "raw_text_fallback",
    similarityScore: entry.similarityScore,
    scopeKey: entry.record.scopeKey,
    sameCanonicalClass: entry.sameCanonicalClass,
    sameKind: entry.sameKind,
    sameScope: entry.sameScope,
    sourcePath: entry.sourcePath,
  }));
}

export function toZeroCandidateRecoveryCandidates(
  selection: ZeroCandidateRecoverySelection,
): BoundedCandidateAdjudicationCandidate[] {
  return toBoundedCandidateAdjudicationCandidatesFromSearch(selection);
}

export function toBoundedCandidateAdjudicationCandidatesFromRetained(input: {
  records: ModelMemoryObjectRecord[];
  resolveSourcePath?: (record: ModelMemoryObjectRecord) => string | undefined;
}): BoundedCandidateAdjudicationCandidate[] {
  return input.records.map((record, index) => ({
    adjudicationCandidateId: `candidate_${index + 1}`,
    id: record.id,
    identityKey: record.identityKey,
    canonicalClass: record.canonicalClass,
    kind: record.kind,
    payload: record.payload,
    scope: record.scope,
    normalizedSearchText: record.normalizedSearchText,
    lifecycleState: record.lifecycleState,
    slotKey: record.slotKey,
    candidateSource: "retained_structural",
    similarityScore: 1,
    scopeKey: record.scopeKey,
    sameCanonicalClass: true,
    sameKind: true,
    sameScope: true,
    sourcePath: input.resolveSourcePath?.(record),
  }));
}

export class DatabaseMemoryObjectStore {
  private lastCreatedAtMs = 0;
  private readonly createdAtFactory: () => Date;

  constructor(
    private readonly repository: ModelMemoryCanonicalRepository,
    private readonly collisionAdjudicator?: SemanticCollisionAdjudicator,
    createdAtFactory?: () => Date,
    private readonly observer?: DatabaseMemoryObjectStoreObserver,
  ) {
    this.createdAtFactory = createdAtFactory ?? (() => this.createMonotonicNow());
  }

  private createMonotonicNow(): Date {
    const nowMs = Date.now();
    const nextMs = Math.max(nowMs, this.lastCreatedAtMs + 1);
    this.lastCreatedAtMs = nextMs;
    return new Date(nextMs);
  }

  async writeCapturedObject(input: StoredCaptureInput): Promise<StoreWriteResult> {
    const [result] = await this.writeCapturedObjects([input]);
    if (!result) {
      throw new Error("writeCapturedObject produced no result");
    }
    return result;
  }

  async writeCapturedObjects(inputs: StoredCaptureInput[]): Promise<StoreWriteResult[]> {
    if (inputs.length === 0) {
      return [];
    }

    return this.repository.withTransaction(async (repository) => {
      const expiryReference = this.createdAtFactory();
      await repository.expireProvisionalMemoryObjects(
        expiryReference,
        new Date(expiryReference.getTime() - PROVISIONAL_EXPIRY_MS),
      );

      const results: StoreWriteResult[] = [];
      let memoryObjects = await repository.listMemoryObjects();
      let supportItems = await repository.listSupportItems();
      let writeEventCount = (await repository.listWriteEvents()).length;
      const sources = await repository.listSources();
      const sourceWindows = await repository.listSourceWindows();
      const sourceById = new Map(sources.map((source) => [source.id, source] as const));
      const sourceWindowById = new Map(sourceWindows.map((window) => [window.id, window] as const));

      const resolveSourcePath = (
        record: Pick<ModelMemoryObjectRecord, "sourceWindowId">,
      ): string | undefined => {
        if (!record.sourceWindowId) {
          return undefined;
        }
        const window = sourceWindowById.get(record.sourceWindowId);
        const source = window ? sourceById.get(window.sourceId) : undefined;
        const relativePath =
          source?.sourceMetadata && typeof source.sourceMetadata.relativePath === "string"
            ? source.sourceMetadata.relativePath
            : undefined;
        return relativePath ?? source?.externalSourceId ?? source?.sourceFingerprint;
      };

      const boundedCandidateAdjudicator =
        this.collisionAdjudicator?.adjudicateBoundedCandidateBatch?.bind(
          this.collisionAdjudicator,
        ) ??
        this.collisionAdjudicator?.adjudicateZeroCandidateRecoveryBatch?.bind(
          this.collisionAdjudicator,
        );

      type PendingBoundedAdjudication = {
        candidateId: string;
        caseIdentity: string;
        objectSummary: string;
        request: BoundedCandidateAdjudicationRequest;
        input: StoredCaptureInput;
        identity: MemoryIdentityDescriptor;
        existingByIdentity?: ModelMemoryObjectRecord;
        existingBySlot?: ModelMemoryObjectRecord;
        createdAt: Date;
        candidateSource: BoundedCandidateAdjudicationSource;
        rawSearchResults: BoundedCandidateAdjudicationObservation["rawSearchResults"];
      };

      const pendingBoundedAdjudications: PendingBoundedAdjudication[] = [];

      for (const [index, input] of inputs.entries()) {
        const createdAt = this.createdAtFactory();
        const identity = deriveMemoryIdentity(input.object);
        const caseIdentity = buildCollisionCaseIdentity({
          sourceWindowId: input.sourceWindowId,
          identityKey: identity.identityKey,
        });
        const existingByIdentity = memoryObjects.find(
          (record) =>
            !record.supersededAt &&
            record.lifecycleState !== "expired" &&
            record.identityKey === identity.identityKey,
        );
        const existingBySlot = identity.slotKey
          ? memoryObjects.find(
              (record) =>
                !record.supersededAt &&
                record.lifecycleState !== "expired" &&
                record.slotKey === identity.slotKey,
            )
          : undefined;

        if (input.object.durability !== "durable" || existingByIdentity || existingBySlot) {
          const result = await this.persistWriteDecision({
            repository,
            input,
            identity,
            createdAt,
            policy: decideWritePolicy({
              object: input.object,
              identity,
              sourceKind: input.sourceKind ?? "document",
              existingByIdentity: existingByIdentity
                ? extractStoredObjectShape(existingByIdentity)
                : undefined,
              existingBySlot: existingBySlot ? extractStoredObjectShape(existingBySlot) : undefined,
              targetAlreadyHasSourceSupport: existingByIdentity
                ? supportItems.some(
                    (item) =>
                      item.memoryObjectId === existingByIdentity.id &&
                      item.supportFingerprint === buildSupportFingerprint(input),
                  )
                : false,
            }),
            writeEventIndex: writeEventCount,
          });
          results.push(result);
          writeEventCount += 1;
          memoryObjects = await repository.listMemoryObjects();
          supportItems = await repository.listSupportItems();
          continue;
        }

        const collisionBuild = buildCollisionCandidates(
          input.object,
          identity,
          memoryObjects,
          buildCollisionSourceFamilyContext({
            sourceWindowId: input.sourceWindowId,
            memoryObjects,
            sourceWindows,
            sources,
          }),
        );
        this.observer?.onCollisionGate?.({
          sourceWindowId: input.sourceWindowId,
          candidateId: `candidate-${index}`,
          caseIdentity,
          objectSummary: summarizeObject(input.object),
          canonicalClass: input.object.canonicalClass,
          kind: input.object.kind,
          rawCandidateCount: collisionBuild.rawCandidateCount,
          retainedCandidateCount: collisionBuild.candidates.length,
          prunedCandidateCount: collisionBuild.rawCandidateCount - collisionBuild.candidates.length,
          disposition:
            collisionBuild.candidates.length === 0 ? "zero_candidate_skip" : "admitted_to_batch",
        });

        if (collisionBuild.candidates.length === 0) {
          const recoverySelection = buildZeroCandidateRecoverySelection({
            object: input.object,
            identity,
            memoryObjects,
            resolveSourcePath,
          });
          const recoveryCandidates =
            toBoundedCandidateAdjudicationCandidatesFromSearch(recoverySelection);
          const recoveryBatchAdmitted =
            recoveryCandidates.length > 0 && typeof boundedCandidateAdjudicator === "function";
          const rawSearchResults = recoverySelection.rawSearchResults.map((entry) => ({
            memoryObjectId: entry.record.id,
            similarityScore: entry.similarityScore,
            searchRank: entry.searchRank,
            canonicalClass: entry.record.canonicalClass,
            kind: entry.record.kind,
            scopeKey: entry.record.scopeKey,
            sourcePath: entry.sourcePath,
            sameCanonicalClass: entry.sameCanonicalClass,
            sameKind: entry.sameKind,
            sameScope: entry.sameScope,
            eligibleForMergeConsideration: entry.eligibleForMergeConsideration,
            selectedForAdjudication: recoveryCandidates.some(
              (candidate) => candidate.id === entry.record.id,
            ),
          }));

          if (recoveryBatchAdmitted) {
            pendingBoundedAdjudications.push({
              candidateId: `candidate-${index}`,
              caseIdentity,
              objectSummary: summarizeObject(input.object),
              request: {
                candidateId: `candidate-${index}`,
                sourceKind: input.sourceKind ?? "document",
                sourceWindowId: input.sourceWindowId,
                sourcePath: resolveSourcePath({ sourceWindowId: input.sourceWindowId }),
                object: input.object,
                candidates: recoveryCandidates,
              },
              input,
              identity,
              existingByIdentity,
              existingBySlot,
              createdAt,
              candidateSource: "raw_text_fallback",
              rawSearchResults,
            });
            continue;
          }

          this.observer?.onBoundedCandidateAdjudication?.({
            sourceWindowId: input.sourceWindowId,
            candidateId: `candidate-${index}`,
            caseIdentity,
            objectSummary: summarizeObject(input.object),
            canonicalClass: input.object.canonicalClass,
            kind: input.object.kind,
            candidateSource: "raw_text_fallback",
            queryText: recoverySelection.queryText,
            rawSearchResults,
            adjudicationCandidateCount: recoveryCandidates.length,
            adjudicationBatchAdmitted: false,
            finalLocalRouting: "no_candidates",
          });

          const result = await this.persistWriteDecision({
            repository,
            input,
            identity,
            createdAt,
            policy: decideWritePolicy({
              object: input.object,
              identity,
              sourceKind: input.sourceKind ?? "document",
              collisionMatch: { relation: "distinct" },
            }),
            writeEventIndex: writeEventCount,
          });
          results.push(result);
          writeEventCount += 1;
          memoryObjects = await repository.listMemoryObjects();
          supportItems = await repository.listSupportItems();
          continue;
        }

        if (!boundedCandidateAdjudicator) {
          const result = await this.persistWriteDecision({
            repository,
            input,
            identity,
            createdAt,
            policy: decideWritePolicy({
              object: input.object,
              identity,
              sourceKind: input.sourceKind ?? "document",
              collisionMatch: { relation: "conflict_hold" },
            }),
            writeEventIndex: writeEventCount,
          });
          results.push(result);
          writeEventCount += 1;
          memoryObjects = await repository.listMemoryObjects();
          supportItems = await repository.listSupportItems();
          continue;
        }

        const retainedAdjudicationCandidates = toBoundedCandidateAdjudicationCandidatesFromRetained(
          {
            records: collisionBuild.retainedRecords,
            resolveSourcePath,
          },
        );
        pendingBoundedAdjudications.push({
          candidateId: `candidate-${index}`,
          caseIdentity,
          objectSummary: summarizeObject(input.object),
          request: {
            candidateId: `candidate-${index}`,
            sourceKind: input.sourceKind ?? "document",
            sourceWindowId: input.sourceWindowId,
            sourcePath: resolveSourcePath({ sourceWindowId: input.sourceWindowId }),
            object: input.object,
            candidates: retainedAdjudicationCandidates,
          },
          input,
          identity,
          existingByIdentity,
          existingBySlot,
          createdAt,
          candidateSource: "retained_structural",
          rawSearchResults: retainedAdjudicationCandidates.map((candidate, candidateIndex) => ({
            memoryObjectId: candidate.id,
            similarityScore: candidate.similarityScore,
            searchRank: candidateIndex + 1,
            canonicalClass: candidate.canonicalClass,
            kind: candidate.kind,
            scopeKey: candidate.scopeKey,
            sourcePath: candidate.sourcePath,
            sameCanonicalClass: candidate.sameCanonicalClass,
            sameKind: candidate.sameKind,
            sameScope: candidate.sameScope,
            eligibleForMergeConsideration: true,
            selectedForAdjudication: true,
          })),
        });
      }

      const boundedAdjudicationDecisions = new Map<
        string,
        BoundedCandidateAdjudicationBatchDecision
      >();
      if (pendingBoundedAdjudications.length > 0 && boundedCandidateAdjudicator) {
        for (const decision of await boundedCandidateAdjudicator({
          requests: pendingBoundedAdjudications.map((entry) => entry.request),
          modelId: pendingBoundedAdjudications[0].input.modelId,
        })) {
          boundedAdjudicationDecisions.set(decision.candidateId, decision);
        }
      }

      for (const pending of pendingBoundedAdjudications) {
        const adjudicationDecision = boundedAdjudicationDecisions.get(
          pending.request.candidateId,
        ) ?? {
          candidateId: pending.request.candidateId,
          sameCoreMemory: "ambiguous" as const,
          matchedCandidateId: "none" as const,
          deltaType: "unclear" as const,
        };
        const matchedCandidate =
          adjudicationDecision.matchedCandidateId === "none"
            ? undefined
            : pending.request.candidates.find(
                (candidate) =>
                  candidate.adjudicationCandidateId === adjudicationDecision.matchedCandidateId,
              );
        const matchedCandidateRecord = matchedCandidate
          ? memoryObjects.find((record) => record.id === matchedCandidate.id)
          : undefined;

        if (
          adjudicationDecision.sameCoreMemory === "yes" &&
          matchedCandidate &&
          adjudicationDecision.deltaType === "non_additive"
        ) {
          const targetForSupport = matchedCandidateRecord;
          if (targetForSupport) {
            this.observer?.onBoundedCandidateAdjudication?.({
              sourceWindowId: pending.input.sourceWindowId,
              candidateId: pending.candidateId,
              caseIdentity: pending.caseIdentity,
              objectSummary: pending.objectSummary,
              canonicalClass: pending.input.object.canonicalClass,
              kind: pending.input.object.kind,
              candidateSource: pending.candidateSource,
              queryText: pending.identity.normalizedSearchText,
              rawSearchResults: pending.rawSearchResults,
              adjudicationCandidateCount: pending.request.candidates.length,
              adjudicationBatchAdmitted: true,
              modelOutput: adjudicationDecision,
              finalLocalRouting: "direct_attach_support",
            });

            const result = await this.persistWriteDecision({
              repository,
              input: pending.input,
              identity: pending.identity,
              createdAt: pending.createdAt,
              policy: decideWritePolicy({
                object: pending.input.object,
                identity: pending.identity,
                sourceKind: pending.input.sourceKind ?? "document",
                existingByIdentity: pending.existingByIdentity
                  ? extractStoredObjectShape(pending.existingByIdentity)
                  : undefined,
                existingBySlot: pending.existingBySlot
                  ? extractStoredObjectShape(pending.existingBySlot)
                  : undefined,
                collisionMatch: {
                  relation: "attach_support",
                  target: extractStoredObjectShape(targetForSupport),
                },
                targetAlreadyHasSourceSupport: supportItems.some(
                  (item) =>
                    item.memoryObjectId === targetForSupport.id &&
                    item.supportFingerprint === buildSupportFingerprint(pending.input),
                ),
              }),
              writeEventIndex: writeEventCount,
            });
            results.push(result);
            writeEventCount += 1;
            memoryObjects = await repository.listMemoryObjects();
            supportItems = await repository.listSupportItems();
            continue;
          }
        }

        if (
          adjudicationDecision.sameCoreMemory === "yes" &&
          matchedCandidate &&
          adjudicationDecision.deltaType === "additive"
        ) {
          const additiveTarget = memoryObjects.find((record) => record.id === matchedCandidate.id);
          const collisionMatch =
            additiveTarget &&
            hasSameSlotSupersessionReason({
              identity: pending.identity,
              object: pending.input.object,
              candidate: additiveTarget,
            })
              ? {
                  relation: "supersedes" as const,
                  target: extractStoredObjectShape(additiveTarget),
                }
              : { relation: "distinct" as const };

          this.observer?.onBoundedCandidateAdjudication?.({
            sourceWindowId: pending.input.sourceWindowId,
            candidateId: pending.candidateId,
            caseIdentity: pending.caseIdentity,
            objectSummary: pending.objectSummary,
            canonicalClass: pending.input.object.canonicalClass,
            kind: pending.input.object.kind,
            candidateSource: pending.candidateSource,
            queryText: pending.identity.normalizedSearchText,
            rawSearchResults: pending.rawSearchResults,
            adjudicationCandidateCount: pending.request.candidates.length,
            adjudicationBatchAdmitted: true,
            modelOutput: adjudicationDecision,
            finalLocalRouting:
              collisionMatch.relation === "supersedes"
                ? "local_supersede"
                : "local_distinct_additive",
          });

          const result = await this.persistWriteDecision({
            repository,
            input: pending.input,
            identity: pending.identity,
            createdAt: pending.createdAt,
            policy: decideWritePolicy({
              object: pending.input.object,
              identity: pending.identity,
              sourceKind: pending.input.sourceKind ?? "document",
              existingByIdentity: pending.existingByIdentity
                ? extractStoredObjectShape(pending.existingByIdentity)
                : undefined,
              existingBySlot: pending.existingBySlot
                ? extractStoredObjectShape(pending.existingBySlot)
                : undefined,
              collisionMatch,
            }),
            writeEventIndex: writeEventCount,
          });
          results.push(result);
          writeEventCount += 1;
          memoryObjects = await repository.listMemoryObjects();
          supportItems = await repository.listSupportItems();
          continue;
        }

        if (adjudicationDecision.sameCoreMemory === "ambiguous") {
          this.observer?.onBoundedCandidateAdjudication?.({
            sourceWindowId: pending.input.sourceWindowId,
            candidateId: pending.candidateId,
            caseIdentity: pending.caseIdentity,
            objectSummary: pending.objectSummary,
            canonicalClass: pending.input.object.canonicalClass,
            kind: pending.input.object.kind,
            candidateSource: pending.candidateSource,
            queryText: pending.identity.normalizedSearchText,
            rawSearchResults: pending.rawSearchResults,
            adjudicationCandidateCount: pending.request.candidates.length,
            adjudicationBatchAdmitted: true,
            modelOutput: adjudicationDecision,
            finalLocalRouting: "local_conflict_hold_ambiguous",
          });

          const result = await this.persistWriteDecision({
            repository,
            input: pending.input,
            identity: pending.identity,
            createdAt: pending.createdAt,
            policy: decideWritePolicy({
              object: pending.input.object,
              identity: pending.identity,
              sourceKind: pending.input.sourceKind ?? "document",
              existingByIdentity: pending.existingByIdentity
                ? extractStoredObjectShape(pending.existingByIdentity)
                : undefined,
              existingBySlot: pending.existingBySlot
                ? extractStoredObjectShape(pending.existingBySlot)
                : undefined,
              collisionMatch: { relation: "conflict_hold" },
            }),
            writeEventIndex: writeEventCount,
          });
          results.push(result);
          writeEventCount += 1;
          memoryObjects = await repository.listMemoryObjects();
          supportItems = await repository.listSupportItems();
          continue;
        }

        this.observer?.onBoundedCandidateAdjudication?.({
          sourceWindowId: pending.input.sourceWindowId,
          candidateId: pending.candidateId,
          caseIdentity: pending.caseIdentity,
          objectSummary: pending.objectSummary,
          canonicalClass: pending.input.object.canonicalClass,
          kind: pending.input.object.kind,
          candidateSource: pending.candidateSource,
          queryText: pending.identity.normalizedSearchText,
          rawSearchResults: pending.rawSearchResults,
          adjudicationCandidateCount: pending.request.candidates.length,
          adjudicationBatchAdmitted: true,
          modelOutput: adjudicationDecision,
          finalLocalRouting: "direct_distinct",
        });
        const result = await this.persistWriteDecision({
          repository,
          input: pending.input,
          identity: pending.identity,
          createdAt: pending.createdAt,
          policy: decideWritePolicy({
            object: pending.input.object,
            identity: pending.identity,
            sourceKind: pending.input.sourceKind ?? "document",
            existingByIdentity: pending.existingByIdentity
              ? extractStoredObjectShape(pending.existingByIdentity)
              : undefined,
            existingBySlot: pending.existingBySlot
              ? extractStoredObjectShape(pending.existingBySlot)
              : undefined,
            collisionMatch: { relation: "distinct" },
          }),
          writeEventIndex: writeEventCount,
        });
        results.push(result);
        writeEventCount += 1;
        memoryObjects = await repository.listMemoryObjects();
        supportItems = await repository.listSupportItems();
      }

      return results;
    });
  }

  snapshot() {
    return this.repository.snapshot();
  }

  private async persistWriteDecision(input: {
    repository: ModelMemoryCanonicalRepository;
    input: StoredCaptureInput;
    identity: MemoryIdentityDescriptor;
    createdAt: Date;
    policy: WritePolicyDecision;
    writeEventIndex: number;
  }): Promise<StoreWriteResult> {
    if (input.policy.decision === "ignore") {
      const writeEvent = await input.repository.insertWriteEvent(
        buildWriteEventRecord(
          input.writeEventIndex,
          input.input,
          input.identity,
          input.policy,
          input.createdAt,
        ),
      );
      return {
        decision: input.policy.decision,
        writeEvent,
      };
    }

    if (input.policy.decision === "attach_support") {
      const supportItem = await input.repository.insertSupportItem(
        buildSupportItemRecord(
          input.policy.memoryObjectId,
          input.input,
          input.policy,
          input.createdAt,
        ),
      );
      if (input.policy.activateTargetObjectId) {
        await input.repository.activateMemoryObject(
          input.policy.activateTargetObjectId,
          input.createdAt,
          input.policy.activationBasis ?? "support_attachment",
        );
      }
      const writeEvent = await input.repository.insertWriteEvent(
        buildWriteEventRecord(
          input.writeEventIndex,
          input.input,
          input.identity,
          input.policy,
          input.createdAt,
          input.policy.memoryObjectId,
          supportItem.id,
        ),
      );
      return {
        decision: input.policy.decision,
        supportItem,
        writeEvent,
      };
    }

    const memoryObject = await input.repository.insertMemoryObject(
      buildObjectRecord(input.input, input.identity, input.policy, input.createdAt),
    );
    const supportItem = await input.repository.insertSupportItem(
      buildSupportItemRecord(memoryObject.id, input.input, input.policy, input.createdAt),
    );

    let supersessionLink: ModelMemorySupersessionLinkRecord | undefined;
    if (input.policy.decision === "supersede") {
      await input.repository.markMemoryObjectSuperseded(
        input.policy.supersededObjectId,
        input.createdAt,
      );
      supersessionLink = await input.repository.insertSupersessionLink({
        id: buildDeterministicUuid(
          "supersession",
          `${input.policy.supersededObjectId}:${memoryObject.id}`,
        ),
        priorObjectId: input.policy.supersededObjectId,
        replacementObjectId: memoryObject.id,
        reasonCode: "slot_supersession",
        createdAt: input.createdAt,
      });
    }

    const writeEvent = await input.repository.insertWriteEvent(
      buildWriteEventRecord(
        input.writeEventIndex,
        input.input,
        input.identity,
        input.policy,
        input.createdAt,
        memoryObject.id,
        supportItem.id,
      ),
    );

    return {
      decision: input.policy.decision,
      memoryObject,
      supportItem,
      writeEvent,
      supersessionLink,
    };
  }
}
