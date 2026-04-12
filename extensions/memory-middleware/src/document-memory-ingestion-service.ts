import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { CanonicalMemoryIngestionCandidate } from "openclaw/plugin-sdk/memory-canonical-ingestion";
import type { MemoryMiddlewareConfig } from "./config.js";
import { type JsonValue } from "./db/runtime.js";
import {
  getDocumentMemoryIngestionProfile,
  suggestDocumentMemoryIngestionProfile,
  type DocumentMemoryIngestionProfile,
} from "./document-memory-ingestion-profiles.js";
import {
  type DocumentMemoryBulkIngestionPlan,
  type DocumentMemoryIngestionCandidatePlan,
  type DocumentMemoryIngestionCategory,
  type DocumentMemoryIngestionPlan,
  type DocumentMemoryIngestionSegment,
  type DocumentMemoryIngestionSource,
  type DocumentMemoryLoadedSource,
  type DocumentMemoryIngestionSubmissionPlan,
} from "./document-memory-ingestion-types.js";
import { buildCanonicalMemoryIngestionCandidateFromResolvedIngestion } from "./memory-canonical-compat-builders.js";
import type { ResolvedCanonicalizableIngestion } from "./memory-ingestion-resolver.js";
import type { MemorySemanticInterpreterPort } from "./memory-semantic-interpretation.js";
import {
  planNormalizedMemoryBlock,
  type PlannedNormalizedMemoryDecision,
} from "./memory-semantic-planner.js";
import {
  normalizeDocumentMemorySource,
  normalizeMemoryText,
  type MemoryBlockListKind,
  type NormalizedMemoryBlock,
  type NormalizedMemorySource,
} from "./memory-source-normalization.js";

type DocumentMemoryIngestionServiceDeps = {
  readFile: typeof fs.readFile;
};

type DocumentMemoryExtractedCandidate = {
  category: DocumentMemoryIngestionCategory;
  resolved: ResolvedCanonicalizableIngestion;
  canonicalCandidate: CanonicalMemoryIngestionCandidate;
  segment: DocumentMemoryIngestionSegment;
  submission: DocumentMemoryIngestionSubmissionPlan;
  why: string[];
  rank: number;
};

export type DocumentMemoryIngestionService = {
  planDocument(source: DocumentMemoryIngestionSource): Promise<DocumentMemoryIngestionPlan>;
  planDocuments(sources: DocumentMemoryIngestionSource[]): Promise<DocumentMemoryBulkIngestionPlan>;
};

function countLines(text: string): number {
  return text ? text.split("\n").length : 0;
}

function humanizeScope(value: string): string {
  return value.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

function stripHeadingSuffixes(value: string): string {
  return value
    .replace(
      /\b(?:operating notes|runbook|playbook|decision log|decisions|status|workflow|guide|notes)\b/gi,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function inferFirstHeading(content: string): string | null {
  const match = normalizeMemoryText(content).match(/^#{1,6}\s+(.+?)\s*$/m);
  return match?.[1]?.trim() ? match[1].trim() : null;
}

function inferDocumentProjectScopeLabel(source: DocumentMemoryLoadedSource): string | null {
  if (source.projectId) {
    return humanizeScope(source.projectId);
  }
  const firstHeading = inferFirstHeading(source.content);
  if (!firstHeading) {
    return null;
  }
  const stripped = stripHeadingSuffixes(firstHeading);
  return stripped ? humanizeScope(stripped) : null;
}

function buildNormalizedSource(source: DocumentMemoryLoadedSource): NormalizedMemorySource {
  return {
    kind: "document",
    sourceId: `document:${source.path}`,
    path: source.path,
    ...(source.projectId ? { projectId: source.projectId } : {}),
    ...(source.agentId ? { agentId: source.agentId } : {}),
    sourceClass: source.sourceClass,
  };
}

function inferSegmentStrategy(block: NormalizedMemoryBlock): "paragraph" | "checklist" | "chunk" {
  if (
    block.listKind === "ordered" ||
    block.listKind === "unordered" ||
    block.listKind === "checklist"
  ) {
    return "checklist";
  }
  if (
    typeof block.provenance.charStart === "number" ||
    typeof block.provenance.charEnd === "number"
  ) {
    return "chunk";
  }
  return "paragraph";
}

function toDocumentSegment(block: NormalizedMemoryBlock): DocumentMemoryIngestionSegment {
  return {
    id: block.id,
    segmentIndex: block.provenance.segmentIndex ?? 0,
    strategy: inferSegmentStrategy(block),
    headingPath: [...block.headingPath],
    lineStart: block.provenance.lineStart ?? 0,
    lineEnd: block.provenance.lineEnd ?? block.provenance.lineStart ?? 0,
    text: block.blockText,
    charCount: block.blockText.length,
  };
}

function resolveCategory(
  ingestion: ResolvedCanonicalizableIngestion,
): DocumentMemoryIngestionCategory {
  return "captureCategory" in ingestion ? ingestion.captureCategory : ingestion.familyId;
}

function confidenceRank(value: string): number {
  if (value === "high") {
    return 3;
  }
  if (value === "medium") {
    return 2;
  }
  return 1;
}

function toJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function readSubmissionKind(candidate: CanonicalMemoryIngestionCandidate) {
  const kind = candidate.compatibility?.candidateKind;
  if (!kind) {
    throw new Error("document ingestion expected canonical candidate compatibility metadata");
  }
  return kind;
}

function resolveCandidateDedupeKey(candidate: CanonicalMemoryIngestionCandidate): string {
  const explicitKey = candidate.identity?.dedupeKey;
  if (explicitKey) {
    return explicitKey;
  }
  return createHash("sha256")
    .update([candidate.record.kind, candidate.record.subject, candidate.record.statement].join("|"))
    .digest("hex");
}

function buildCandidateMetadata(params: {
  source: DocumentMemoryLoadedSource;
  segment: DocumentMemoryIngestionSegment;
  category: DocumentMemoryIngestionCategory;
  resolved: ResolvedCanonicalizableIngestion;
  canonicalCandidate: CanonicalMemoryIngestionCandidate;
  profile: DocumentMemoryIngestionProfile;
}): Record<string, JsonValue> {
  const { source, segment, category, resolved, canonicalCandidate, profile } = params;
  return {
    canonicalIngestionCandidate: toJsonValue(canonicalCandidate),
    documentIngestion: {
      sourcePath: source.path,
      fileName: source.fileName,
      profileId: profile.id,
      sourceClass: source.sourceClass,
      segmentId: segment.id,
      segmentStrategy: segment.strategy,
      lineStart: segment.lineStart,
      lineEnd: segment.lineEnd,
      headingPath: segment.headingPath,
      charCount: segment.charCount,
      observedText: resolved.observedText,
      evidence: resolved.evidence,
      category,
    } satisfies Record<string, JsonValue>,
  };
}

function buildSubmissionPlan(params: {
  source: DocumentMemoryLoadedSource;
  segment: DocumentMemoryIngestionSegment;
  category: DocumentMemoryIngestionCategory;
  resolved: ResolvedCanonicalizableIngestion;
  canonicalCandidate: CanonicalMemoryIngestionCandidate;
  profile: DocumentMemoryIngestionProfile;
}): DocumentMemoryIngestionSubmissionPlan {
  const kind = readSubmissionKind(params.canonicalCandidate);
  return {
    kind,
    content: params.resolved.observedText,
    metadata: buildCandidateMetadata(params),
    ...(params.source.projectId ? { projectId: params.source.projectId } : {}),
    ...(params.source.agentId ? { agentId: params.source.agentId } : {}),
  };
}

async function loadSource(
  source: DocumentMemoryIngestionSource,
  deps: DocumentMemoryIngestionServiceDeps,
): Promise<DocumentMemoryLoadedSource> {
  const profile = source.profileId
    ? getDocumentMemoryIngestionProfile(source.profileId)
    : suggestDocumentMemoryIngestionProfile(source.path);
  const content = normalizeMemoryText(source.content ?? (await deps.readFile(source.path, "utf8")));
  return {
    ...source,
    profileId: profile.id,
    sourceClass: source.sourceClass ?? profile.sourceClass,
    content,
    fileName: path.basename(source.path),
    lineCount: countLines(content),
    charCount: content.length,
  };
}

function createCandidatePlan(params: {
  source: DocumentMemoryLoadedSource;
  profile: DocumentMemoryIngestionProfile;
  segment: DocumentMemoryIngestionSegment;
  extracted: DocumentMemoryExtractedCandidate;
}): DocumentMemoryIngestionCandidatePlan {
  const { source, profile, segment, extracted } = params;
  const dedupeKey = resolveCandidateDedupeKey(extracted.canonicalCandidate);
  return {
    id: createHash("sha256")
      .update([source.path, segment.id, dedupeKey].join("|"))
      .digest("hex")
      .slice(0, 20),
    category: extracted.category,
    profileId: profile.id,
    sourceClass: source.sourceClass,
    sourcePath: source.path,
    headingPath: [...segment.headingPath],
    lineStart: segment.lineStart,
    lineEnd: segment.lineEnd,
    segmentId: segment.id,
    canonicalCandidate: extracted.canonicalCandidate,
    resolved: extracted.resolved,
    why: extracted.why,
    submission: extracted.submission,
    duplicateCount: 0,
    suppressedDuplicates: [],
  };
}

function maybePushExtractedCandidate(
  collection: DocumentMemoryExtractedCandidate[],
  profile: DocumentMemoryIngestionProfile,
  params: {
    source: DocumentMemoryLoadedSource;
    segment: DocumentMemoryIngestionSegment;
    planned: PlannedNormalizedMemoryDecision | null;
  },
) {
  if (!params.planned || params.planned.validation.action !== "capture") {
    return;
  }
  const resolved = params.planned.validation.resolved;
  const category =
    params.planned.validation.categoryOverride === "reference_routing"
      ? "reference_routing"
      : resolveCategory(resolved);
  if (!profile.categories.includes(category)) {
    return;
  }
  const canonicalCandidate = buildCanonicalMemoryIngestionCandidateFromResolvedIngestion({
    ingestion: resolved,
    mode: "candidate_learning",
    captureSeam: "document_memory_ingestion",
    captureProfile: profile.id,
    ...(params.source.projectId ? { projectId: params.source.projectId } : {}),
  });
  const submission = buildSubmissionPlan({
    source: params.source,
    segment: params.segment,
    category,
    resolved,
    canonicalCandidate,
    profile,
  });
  collection.push({
    category,
    resolved,
    canonicalCandidate,
    segment: params.segment,
    submission,
    why: [
      ...resolved.evidence,
      `model:${params.planned.modelId}`,
      `prompt:${params.planned.promptVersion}`,
    ],
    rank:
      confidenceRank(resolved.confidence) * 100 +
      params.segment.text.length +
      resolved.evidence.length,
  });
}

function dedupeCandidates(
  source: DocumentMemoryLoadedSource,
  profile: DocumentMemoryIngestionProfile,
  candidates: DocumentMemoryExtractedCandidate[],
): DocumentMemoryIngestionCandidatePlan[] {
  const grouped = new Map<string, DocumentMemoryExtractedCandidate[]>();
  for (const candidate of candidates) {
    const dedupeKey = resolveCandidateDedupeKey(candidate.canonicalCandidate);
    const group = grouped.get(dedupeKey);
    if (group) {
      group.push(candidate);
    } else {
      grouped.set(dedupeKey, [candidate]);
    }
  }

  const plans: DocumentMemoryIngestionCandidatePlan[] = [];
  for (const group of grouped.values()) {
    group.sort((left, right) => {
      if (right.rank !== left.rank) {
        return right.rank - left.rank;
      }
      if (left.segment.lineStart !== right.segment.lineStart) {
        return left.segment.lineStart - right.segment.lineStart;
      }
      return left.segment.id.localeCompare(right.segment.id);
    });
    const winner = group[0];
    const plan = createCandidatePlan({
      source,
      profile,
      segment: winner.segment,
      extracted: winner,
    });
    for (const duplicate of group.slice(1)) {
      plan.duplicateCount += 1;
      plan.suppressedDuplicates.push({
        segmentId: duplicate.segment.id,
        lineStart: duplicate.segment.lineStart,
        lineEnd: duplicate.segment.lineEnd,
        why: duplicate.why,
      });
    }
    plans.push(plan);
  }

  return plans.sort((left, right) => {
    if (left.lineStart !== right.lineStart) {
      return left.lineStart - right.lineStart;
    }
    return left.id.localeCompare(right.id);
  });
}

async function normalizeSourceIntoSegments(params: {
  source: DocumentMemoryLoadedSource;
  profile: DocumentMemoryIngestionProfile;
}): Promise<{
  blocks: NormalizedMemoryBlock[];
  segments: DocumentMemoryIngestionSegment[];
}> {
  const blocks = normalizeDocumentMemorySource({
    source: buildNormalizedSource(params.source),
    content: params.source.content,
    maxBlockChars: params.profile.maxSegmentChars,
    ...(inferDocumentProjectScopeLabel(params.source)
      ? { projectScope: inferDocumentProjectScopeLabel(params.source) ?? undefined }
      : {}),
  });
  return {
    blocks,
    segments: blocks.map(toDocumentSegment),
  };
}

async function extractCandidatesFromSource(params: {
  source: DocumentMemoryLoadedSource;
  profile: DocumentMemoryIngestionProfile;
  config: MemoryMiddlewareConfig;
  semanticInterpreter: MemorySemanticInterpreterPort;
}): Promise<{
  segments: DocumentMemoryIngestionSegment[];
  candidates: DocumentMemoryIngestionCandidatePlan[];
}> {
  const { blocks, segments } = await normalizeSourceIntoSegments({
    source: params.source,
    profile: params.profile,
  });
  const extracted: DocumentMemoryExtractedCandidate[] = [];

  for (const [index, block] of blocks.entries()) {
    const planned = await planNormalizedMemoryBlock({
      config: params.config,
      lane: "document_ingestion",
      block,
      interpreter: params.semanticInterpreter,
      ...(params.source.projectId ? { projectId: params.source.projectId } : {}),
    });
    const segment = segments[index];
    if (!segment) {
      continue;
    }
    maybePushExtractedCandidate(extracted, params.profile, {
      source: params.source,
      segment,
      planned,
    });
  }

  return {
    segments,
    candidates: dedupeCandidates(params.source, params.profile, extracted),
  };
}

export function createDocumentMemoryIngestionService(params: {
  config: MemoryMiddlewareConfig;
  semanticInterpreter: MemorySemanticInterpreterPort;
  deps?: Partial<DocumentMemoryIngestionServiceDeps>;
}): DocumentMemoryIngestionService {
  const deps: DocumentMemoryIngestionServiceDeps = {
    readFile: params.deps?.readFile ?? fs.readFile,
  };

  return {
    async planDocument(source) {
      const loadedSource = await loadSource(source, deps);
      const profile = getDocumentMemoryIngestionProfile(loadedSource.profileId);
      const { segments, candidates } = await extractCandidatesFromSource({
        source: loadedSource,
        profile,
        config: params.config,
        semanticInterpreter: params.semanticInterpreter,
      });

      const byCategory = {} as Record<DocumentMemoryIngestionCategory, number>;
      for (const candidate of candidates) {
        byCategory[candidate.category] = (byCategory[candidate.category] ?? 0) + 1;
      }

      return {
        source: loadedSource,
        segments,
        candidates,
        counts: {
          segmentCount: segments.length,
          candidateCount: candidates.length,
          byCategory,
        },
      };
    },

    async planDocuments(sources) {
      const documents = [];
      for (const source of sources) {
        documents.push(await this.planDocument(source));
      }

      const byCategory: Partial<Record<DocumentMemoryIngestionCategory, number>> = {};
      for (const document of documents) {
        for (const [category, count] of Object.entries(document.counts.byCategory)) {
          const typedCategory = category as DocumentMemoryIngestionCategory;
          byCategory[typedCategory] = (byCategory[typedCategory] ?? 0) + count;
        }
      }

      return {
        documents,
        totals: {
          documentCount: documents.length,
          segmentCount: documents.reduce((sum, document) => sum + document.counts.segmentCount, 0),
          candidateCount: documents.reduce(
            (sum, document) => sum + document.counts.candidateCount,
            0,
          ),
          byCategory,
        },
      };
    },
  };
}
