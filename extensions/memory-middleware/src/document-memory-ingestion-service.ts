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
import type { MemorySemanticObject } from "./memory-semantic-interpretation.js";
import type { MemorySemanticInterpreterPort } from "./memory-semantic-interpretation.js";
import {
  planNormalizedMemorySourceWindow,
  type PlannedMemorySemanticCapture,
} from "./memory-semantic-planner.js";
import {
  normalizeDocumentMemorySource,
  normalizeMemoryText,
  type MemoryBlockListKind,
  type NormalizedMemorySource,
} from "./memory-source-normalization.js";
import {
  buildMemorySourceWindows,
  type NormalizedMemorySourceWindow,
} from "./memory-source-windowing.js";

type DocumentMemoryIngestionServiceDeps = {
  readFile: typeof fs.readFile;
};

type DocumentMemoryExtractedCandidate = {
  category: DocumentMemoryIngestionCategory;
  semanticObject: MemorySemanticObject;
  canonicalCandidate: CanonicalMemoryIngestionCandidate;
  observedText: string;
  evidence: string[];
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

function inferSegmentStrategy(
  window: NormalizedMemorySourceWindow,
): "paragraph" | "checklist" | "chunk" {
  if (
    window.listKinds.includes("ordered") ||
    window.listKinds.includes("unordered") ||
    window.listKinds.includes("checklist")
  ) {
    return "checklist";
  }
  if (
    typeof window.provenance.charStart === "number" ||
    typeof window.provenance.charEnd === "number"
  ) {
    return "chunk";
  }
  return "paragraph";
}

function toDocumentSegment(window: NormalizedMemorySourceWindow): DocumentMemoryIngestionSegment {
  return {
    id: window.id,
    segmentIndex: window.provenance.segmentIndex ?? 0,
    strategy: inferSegmentStrategy(window),
    headingPath: [...window.headingPath],
    lineStart: window.provenance.lineStart ?? 0,
    lineEnd: window.provenance.lineEnd ?? window.provenance.lineStart ?? 0,
    text: window.windowText,
    charCount: window.windowText.length,
  };
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
  observedText: string;
  evidence: string[];
  canonicalCandidate: CanonicalMemoryIngestionCandidate;
  profile: DocumentMemoryIngestionProfile;
}): Record<string, JsonValue> {
  const { source, segment, category, observedText, evidence, canonicalCandidate, profile } = params;
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
      observedText,
      evidence,
      category,
    } satisfies Record<string, JsonValue>,
  };
}

function buildSubmissionPlan(params: {
  source: DocumentMemoryLoadedSource;
  segment: DocumentMemoryIngestionSegment;
  category: DocumentMemoryIngestionCategory;
  observedText: string;
  evidence: string[];
  canonicalCandidate: CanonicalMemoryIngestionCandidate;
  profile: DocumentMemoryIngestionProfile;
}): DocumentMemoryIngestionSubmissionPlan {
  const kind = readSubmissionKind(params.canonicalCandidate);
  return {
    kind,
    content: params.observedText,
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
    semanticObject: extracted.semanticObject,
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
    capture: PlannedMemorySemanticCapture;
  },
) {
  if (params.capture.materialized.action !== "capture") {
    return;
  }
  const category = params.capture.materialized.projection.category;
  if (!profile.categories.includes(category)) {
    return;
  }
  const canonicalCandidate = params.capture.materialized.projection.canonicalCandidate;
  const submission = buildSubmissionPlan({
    source: params.source,
    segment: params.segment,
    category,
    observedText: params.capture.validated.observedText,
    evidence: params.capture.validated.evidence,
    canonicalCandidate,
    profile,
  });
  collection.push({
    category,
    semanticObject: params.capture.materialized.object,
    canonicalCandidate,
    observedText: params.capture.validated.observedText,
    evidence: params.capture.validated.evidence,
    segment: params.segment,
    submission,
    why: [
      ...params.capture.validated.evidence,
      `model:${params.capture.modelId}`,
      `prompt:${params.capture.promptVersion}`,
    ],
    rank:
      confidenceRank(params.capture.validated.confidence) * 100 +
      params.segment.text.length +
      params.capture.validated.evidence.length,
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
  windows: NormalizedMemorySourceWindow[];
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
  const windows = buildMemorySourceWindows({
    blocks,
    maxWindowChars: Math.max(params.profile.maxSegmentChars * 2, 2_400),
  });
  return {
    windows,
    segments: windows.map(toDocumentSegment),
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
  const { windows, segments } = await normalizeSourceIntoSegments({
    source: params.source,
    profile: params.profile,
  });
  const extracted: DocumentMemoryExtractedCandidate[] = [];

  for (const [index, window] of windows.entries()) {
    const planned = await planNormalizedMemorySourceWindow({
      config: params.config,
      lane: "document_ingestion",
      window,
      interpreter: params.semanticInterpreter,
      ...(params.source.projectId ? { projectId: params.source.projectId } : {}),
    });
    const segment = segments[index];
    if (!segment) {
      continue;
    }
    for (const capture of planned?.captures ?? []) {
      if (capture.materialized.action !== "capture") {
        continue;
      }
      maybePushExtractedCandidate(extracted, params.profile, {
        source: params.source,
        segment,
        capture,
      });
    }
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
