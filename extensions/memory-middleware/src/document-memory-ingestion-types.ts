import type { CanonicalMemoryIngestionCandidate } from "openclaw/plugin-sdk/memory-canonical-ingestion";
import type { CandidateSubmissionKind, JsonValue } from "./db/runtime.js";
import type { CompatibilityWorkflowCaptureCategory } from "./memory-ingestion-resolver.js";
import type {
  MemoryCanonicalClass,
  MemorySemanticObject,
} from "./memory-semantic-interpretation.js";
import type { MemoryProjectionCategory } from "./memory-semantic-object-identity.js";

export {
  resolveMemoryProjectionCategory as resolveSemanticProjectionCategoryForObject,
  resolveMemoryProjectionCategory as resolveDocumentMemoryIngestionCategoryForSemanticObject,
} from "./memory-semantic-object-identity.js";

export const DOCUMENT_MEMORY_INGESTION_PROFILE_IDS = [
  "identity",
  "project_operating",
  "workflow_runbook",
  "strategic_memory",
  "reference_review",
] as const;

export type DocumentMemoryIngestionProfileId =
  (typeof DOCUMENT_MEMORY_INGESTION_PROFILE_IDS)[number];

export const DOCUMENT_MEMORY_SOURCE_CLASSES = [
  "identity",
  "project",
  "workflow",
  "strategy",
  "reference",
] as const;

export type DocumentMemorySourceClass = (typeof DOCUMENT_MEMORY_SOURCE_CLASSES)[number];

export type DocumentMemoryProjectionCategory = Extract<
  MemoryProjectionCategory,
  | "response_style"
  | "project_fact"
  | "recurring_procedure"
  | "reference_routing"
  | CompatibilityWorkflowCaptureCategory
>;

/**
 * Deprecated document-lane alias. Use `DocumentMemoryProjectionCategory` for
 * reporting-only projection labels.
 */
export type DocumentMemoryIngestionCategory = DocumentMemoryProjectionCategory;

export type CanonicalMemoryClassCountMap = Partial<Record<MemoryCanonicalClass, number>>;

export type DocumentMemoryIngestionSource = {
  path: string;
  content?: string;
  profileId?: DocumentMemoryIngestionProfileId;
  sourceClass?: DocumentMemorySourceClass;
  projectId?: string;
  agentId?: string;
  description?: string;
};

export type DocumentMemoryLoadedSource = DocumentMemoryIngestionSource & {
  profileId: DocumentMemoryIngestionProfileId;
  sourceClass: DocumentMemorySourceClass;
  content: string;
  fileName: string;
  lineCount: number;
  charCount: number;
};

export type DocumentMemoryIngestionSegment = {
  id: string;
  segmentIndex: number;
  strategy: "paragraph" | "checklist" | "chunk";
  headingPath: string[];
  lineStart: number;
  lineEnd: number;
  text: string;
  charCount: number;
};

export type DocumentMemoryIngestionSuppressedDuplicate = {
  segmentId: string;
  lineStart: number;
  lineEnd: number;
  why: string[];
};

export type DocumentMemoryIngestionSubmissionPlan = {
  kind: CandidateSubmissionKind;
  content: string;
  metadata: Record<string, JsonValue>;
  projectId?: string;
  agentId?: string;
};

export type DocumentMemoryIngestionCandidatePlan = {
  id: string;
  category: DocumentMemoryIngestionCategory;
  profileId: DocumentMemoryIngestionProfileId;
  sourceClass: DocumentMemorySourceClass;
  sourcePath: string;
  headingPath: string[];
  lineStart: number;
  lineEnd: number;
  segmentId: string;
  canonicalCandidate: CanonicalMemoryIngestionCandidate;
  semanticObject: MemorySemanticObject;
  why: string[];
  submission: DocumentMemoryIngestionSubmissionPlan;
  duplicateCount: number;
  suppressedDuplicates: DocumentMemoryIngestionSuppressedDuplicate[];
};

export type DocumentMemoryIngestionPlan = {
  source: DocumentMemoryLoadedSource;
  segments: DocumentMemoryIngestionSegment[];
  candidates: DocumentMemoryIngestionCandidatePlan[];
  counts: {
    segmentCount: number;
    candidateCount: number;
    byCategory: Record<DocumentMemoryIngestionCategory, number>;
  };
};

export type DocumentMemoryBulkIngestionPlan = {
  documents: DocumentMemoryIngestionPlan[];
  totals: {
    documentCount: number;
    segmentCount: number;
    candidateCount: number;
    byCategory: Partial<Record<DocumentMemoryIngestionCategory, number>>;
  };
};
