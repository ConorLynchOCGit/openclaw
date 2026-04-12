import path from "node:path";
import {
  type DocumentMemoryIngestionCategory,
  type DocumentMemoryIngestionProfileId,
  type DocumentMemorySourceClass,
} from "./document-memory-ingestion-types.js";

export type DocumentMemoryIngestionProfile = {
  id: DocumentMemoryIngestionProfileId;
  sourceClass: DocumentMemorySourceClass;
  categories: readonly DocumentMemoryIngestionCategory[];
  maxSegmentChars: number;
};

const DOCUMENT_MEMORY_INGESTION_PROFILE_MAP: Record<
  DocumentMemoryIngestionProfileId,
  DocumentMemoryIngestionProfile
> = {
  identity: {
    id: "identity",
    sourceClass: "identity",
    categories: ["response_style", "workflow_improvement"],
    maxSegmentChars: 700,
  },
  project_operating: {
    id: "project_operating",
    sourceClass: "project",
    categories: [
      "project_fact",
      "recurring_procedure",
      "reference_routing",
      "workflow_improvement",
      "project_rule",
      "unmet_need",
    ],
    maxSegmentChars: 900,
  },
  workflow_runbook: {
    id: "workflow_runbook",
    sourceClass: "workflow",
    categories: [
      "recurring_procedure",
      "reference_routing",
      "workflow_improvement",
      "project_rule",
      "unmet_need",
    ],
    maxSegmentChars: 900,
  },
  strategic_memory: {
    id: "strategic_memory",
    sourceClass: "strategy",
    categories: [
      "project_fact",
      "recurring_procedure",
      "reference_routing",
      "workflow_improvement",
      "project_rule",
      "unmet_need",
    ],
    maxSegmentChars: 900,
  },
  reference_review: {
    id: "reference_review",
    sourceClass: "reference",
    categories: ["project_fact", "reference_routing", "workflow_improvement", "unmet_need"],
    maxSegmentChars: 800,
  },
};

const IDENTITY_BASENAMES = new Set(["agents.md", "user.md", "soul.md", "tools.md", "identity.md"]);
const PROJECT_BASENAMES = new Set(["memory.md", "status.md", "decisions.md", "open_loops.md"]);

export function getDocumentMemoryIngestionProfile(
  profileId: DocumentMemoryIngestionProfileId,
): DocumentMemoryIngestionProfile {
  return DOCUMENT_MEMORY_INGESTION_PROFILE_MAP[profileId];
}

export function suggestDocumentMemoryIngestionProfile(
  pathname: string,
): DocumentMemoryIngestionProfile {
  const normalizedPath = pathname.replace(/\\/g, "/").toLowerCase();
  const basename = path.basename(normalizedPath);

  if (IDENTITY_BASENAMES.has(basename)) {
    return DOCUMENT_MEMORY_INGESTION_PROFILE_MAP.identity;
  }
  if (normalizedPath.includes("/runbooks/")) {
    return DOCUMENT_MEMORY_INGESTION_PROFILE_MAP.workflow_runbook;
  }
  if (normalizedPath.includes("/projects/") || PROJECT_BASENAMES.has(basename)) {
    return DOCUMENT_MEMORY_INGESTION_PROFILE_MAP.project_operating;
  }
  if (
    normalizedPath.includes("/docs/memory-system/") ||
    normalizedPath.includes("/projects/maintenance/")
  ) {
    return DOCUMENT_MEMORY_INGESTION_PROFILE_MAP.strategic_memory;
  }
  return DOCUMENT_MEMORY_INGESTION_PROFILE_MAP.reference_review;
}
