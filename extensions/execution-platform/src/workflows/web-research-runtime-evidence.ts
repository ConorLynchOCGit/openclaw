import { createHash } from "node:crypto";
import type {
  JsonValue,
  RuntimeJobArtifact,
  RuntimeJobRepository,
} from "../runtime-job-repository.ts";
import { WEB_RESEARCH_WORKFLOW_ID } from "./web-research-workflow.ts";

export const WEB_RESEARCH_RUNTIME_EVIDENCE_VERSION =
  "execution-platform.web-research-runtime-evidence.v1";
export const WEB_RESEARCH_RUNTIME_EVIDENCE_ARTIFACT_TYPE = "web_research.runtime_evidence";
const MAX_SOURCE_COUNT = 10;
const MAX_REASON_CODES = 20;

export type WebResearchSourceEvidence = {
  sourceRef: string;
  sourceKind: "official_docs" | "documentation" | "news" | "repository" | "other";
  urlHash: string;
  contentHash: string;
  titleSummary: string;
  citationSummary: string;
  retrievedAt: string;
  rawPageStored: false;
};

export type WebResearchRuntimeEvidence = {
  artifactKind: "web_research_runtime_evidence";
  evidenceVersion: typeof WEB_RESEARCH_RUNTIME_EVIDENCE_VERSION;
  workflowId: typeof WEB_RESEARCH_WORKFLOW_ID;
  runtimeJobId: string;
  researchRunId: string;
  queryHash: string;
  boundedQuerySummary: string;
  boundedAnswerSummary: string;
  sources: WebResearchSourceEvidence[];
  citationRefs: string[];
  limitations: string[];
  validationState: "passed" | "failed" | "needs_review";
  reviewState: "not_required" | "needs_review" | "reviewed";
  closeoutState: "present" | "missing";
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawTranscriptStored: false;
  rawPageStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  externalWritePerformed: false;
  workQueueLifecycleMutated: false;
};

export type WebResearchHumanCloseoutSummary = {
  artifactKind: "web_research_human_closeout_summary";
  summaryVersion: "execution-platform.web-research-human-closeout-summary.v1";
  status: "completed" | "needs_review" | "blocked";
  headline: string;
  eli5Summary: string;
  sourceCount: number;
  citationCount: number;
  runtimeJobId: string;
  researchRunId: string;
  evidenceRef: string;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawPageStored: false;
  workQueueLifecycleMutated: false;
};

export function createWebResearchRuntimeEvidence(input: {
  runtimeJobId: string;
  researchRunId: string;
  boundedQuerySummary: string;
  boundedAnswerSummary: string;
  sources: Array<Omit<WebResearchSourceEvidence, "rawPageStored"> & { rawPageStored?: false }>;
  citationRefs?: string[];
  limitations?: string[];
  validationState?: WebResearchRuntimeEvidence["validationState"];
  reviewState?: WebResearchRuntimeEvidence["reviewState"];
  closeoutState?: WebResearchRuntimeEvidence["closeoutState"];
  reasonCodes?: string[];
}): WebResearchRuntimeEvidence {
  const boundedQuerySummary = boundText(input.boundedQuerySummary, 600);
  const boundedAnswerSummary = boundText(input.boundedAnswerSummary, 1_200);
  const evidence: WebResearchRuntimeEvidence = {
    artifactKind: "web_research_runtime_evidence",
    evidenceVersion: WEB_RESEARCH_RUNTIME_EVIDENCE_VERSION,
    workflowId: WEB_RESEARCH_WORKFLOW_ID,
    runtimeJobId: input.runtimeJobId,
    researchRunId: boundText(input.researchRunId, 160),
    queryHash: sha256(boundedQuerySummary),
    boundedQuerySummary,
    boundedAnswerSummary,
    sources: input.sources.map((source) => ({
      sourceRef: boundText(source.sourceRef, 240),
      sourceKind: source.sourceKind,
      urlHash: source.urlHash,
      contentHash: source.contentHash,
      titleSummary: boundText(source.titleSummary, 240),
      citationSummary: boundText(source.citationSummary, 600),
      retrievedAt: source.retrievedAt,
      rawPageStored: false,
    })),
    citationRefs: (input.citationRefs ?? input.sources.map((source) => source.sourceRef))
      .map((ref) => boundText(ref, 240))
      .slice(0, MAX_SOURCE_COUNT),
    limitations: (input.limitations ?? []).map((item) => boundText(item, 400)).slice(0, 10),
    validationState: input.validationState ?? "passed",
    reviewState: input.reviewState ?? "reviewed",
    closeoutState: input.closeoutState ?? "present",
    reasonCodes: (input.reasonCodes ?? ["web_research_runtime_evidence_recorded"])
      .map((reason) => boundText(reason, 120))
      .slice(0, MAX_REASON_CODES),
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawPageStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    externalWritePerformed: false,
    workQueueLifecycleMutated: false,
  };
  const validation = validateWebResearchRuntimeEvidence(evidence);
  if (!validation.valid) {
    throw new Error(`invalid web research runtime evidence: ${validation.reasonCodes.join(",")}`);
  }
  return evidence;
}

export function validateWebResearchRuntimeEvidence(evidence: WebResearchRuntimeEvidence): {
  valid: boolean;
  reasonCodes: string[];
} {
  const reasonCodes: string[] = [];
  if (evidence.workflowId !== WEB_RESEARCH_WORKFLOW_ID) {
    reasonCodes.push("web_research_workflow_id_invalid");
  }
  if (evidence.sources.length === 0) {
    reasonCodes.push("web_research_source_refs_missing");
  }
  if (evidence.sources.length > MAX_SOURCE_COUNT) {
    reasonCodes.push("web_research_source_refs_unbounded");
  }
  if (evidence.citationRefs.length === 0) {
    reasonCodes.push("web_research_citation_refs_missing");
  }
  if (
    evidence.rawPromptStored ||
    evidence.rawResponseStored ||
    evidence.rawTranscriptStored ||
    evidence.rawPageStored ||
    evidence.rawProviderLogStored ||
    evidence.rawToolLogStored
  ) {
    reasonCodes.push("web_research_raw_storage_requested");
  }
  if (evidence.externalWritePerformed) {
    reasonCodes.push("web_research_external_write_performed");
  }
  if (evidence.workQueueLifecycleMutated) {
    reasonCodes.push("web_research_work_queue_lifecycle_mutated");
  }
  for (const source of evidence.sources) {
    if (source.rawPageStored) {
      reasonCodes.push("web_research_raw_page_source_storage_requested");
    }
    if (!source.sourceRef || !source.urlHash || !source.contentHash) {
      reasonCodes.push("web_research_source_ref_or_hash_missing");
    }
  }
  if (containsRawContentMarker(evidence as unknown as JsonValue)) {
    reasonCodes.push("web_research_raw_content_marker_detected");
  }
  return { valid: reasonCodes.length === 0, reasonCodes: [...new Set(reasonCodes)] };
}

export async function recordWebResearchRuntimeEvidence(input: {
  runtimeJobs: RuntimeJobRepository;
  evidence: WebResearchRuntimeEvidence;
}): Promise<RuntimeJobArtifact> {
  const validation = validateWebResearchRuntimeEvidence(input.evidence);
  if (!validation.valid) {
    throw new Error(`invalid web research runtime evidence: ${validation.reasonCodes.join(",")}`);
  }
  await input.runtimeJobs.recordEvent({
    jobId: input.evidence.runtimeJobId,
    eventType: "web_research.evidence_recorded",
    data: {
      researchRunId: input.evidence.researchRunId,
      sourceCount: input.evidence.sources.length,
      citationCount: input.evidence.citationRefs.length,
      validationState: input.evidence.validationState,
      rawPageStored: false,
      externalWritePerformed: false,
      workQueueLifecycleMutated: false,
    },
  });
  return await input.runtimeJobs.attachArtifact({
    jobId: input.evidence.runtimeJobId,
    artifactType: WEB_RESEARCH_RUNTIME_EVIDENCE_ARTIFACT_TYPE,
    storageKind: "metadata",
    uri: `runtime-job://${input.evidence.runtimeJobId}/web-research/runtime-evidence/${input.evidence.researchRunId}`,
    contentType: "application/json",
    sha256: sha256(JSON.stringify(input.evidence)),
    sizeBytes: Buffer.byteLength(JSON.stringify(input.evidence), "utf8"),
    metadata: input.evidence as unknown as JsonValue,
  });
}

export function latestWebResearchRuntimeEvidence(
  artifacts: RuntimeJobArtifact[],
): WebResearchRuntimeEvidence | null {
  const artifact = artifacts.findLast(
    (item) => item.artifactType === WEB_RESEARCH_RUNTIME_EVIDENCE_ARTIFACT_TYPE,
  );
  if (
    !artifact?.metadata ||
    typeof artifact.metadata !== "object" ||
    Array.isArray(artifact.metadata)
  ) {
    return null;
  }
  return artifact.metadata as unknown as WebResearchRuntimeEvidence;
}

export function buildWebResearchHumanCloseoutSummary(input: {
  evidence: WebResearchRuntimeEvidence;
  evidenceRef: string;
}): WebResearchHumanCloseoutSummary {
  return {
    artifactKind: "web_research_human_closeout_summary",
    summaryVersion: "execution-platform.web-research-human-closeout-summary.v1",
    status:
      input.evidence.validationState === "passed"
        ? "completed"
        : input.evidence.validationState === "needs_review"
          ? "needs_review"
          : "blocked",
    headline: boundText(
      `Web research completed with ${input.evidence.sources.length} bounded sources.`,
      240,
    ),
    eli5Summary: boundText(
      `The researcher looked up current information, kept only source refs, hashes, dates, and short summaries, then recorded ${input.evidence.citationRefs.length} citation refs without saving page bodies.`,
      600,
    ),
    sourceCount: input.evidence.sources.length,
    citationCount: input.evidence.citationRefs.length,
    runtimeJobId: input.evidence.runtimeJobId,
    researchRunId: input.evidence.researchRunId,
    evidenceRef: input.evidenceRef,
    reasonCodes: input.evidence.reasonCodes.slice(0, MAX_REASON_CODES),
    rawPromptStored: false,
    rawResponseStored: false,
    rawPageStored: false,
    workQueueLifecycleMutated: false,
  };
}

function containsRawContentMarker(value: JsonValue): boolean {
  const text = JSON.stringify(value).toLowerCase();
  return [
    "raw prompt",
    "raw response",
    "raw transcript",
    "raw page",
    "raw provider log",
    "raw tool log",
    "secret=",
    "hidden reasoning",
  ].some((marker) => text.includes(marker));
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function boundText(value: string, maxChars: number): string {
  return value.replace(/\s+/gu, " ").trim().slice(0, maxChars);
}
