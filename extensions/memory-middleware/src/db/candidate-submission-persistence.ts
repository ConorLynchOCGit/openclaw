import { readCanonicalMemoryIngestionCandidateFromMetadata } from "../memory-canonical-compat.js";
import type { CandidateSubmissionInput, CandidateSubmissionKind } from "./runtime.js";
import { assertSafeIdentifier } from "./shared.js";

export type CandidatePersistencePlan = {
  schema: string;
  event: {
    eventKind: "candidate_submission";
    eventName: `candidate_submission.${CandidateSubmissionKind}`;
    projectId?: string;
    agentId?: string;
    sessionId?: string;
    payload: Record<string, unknown>;
    metadata: Record<string, unknown>;
  };
  memoryObject: {
    projectId?: string;
    agentId?: string;
    sessionId?: string;
    memoryKind: "project" | "feedback" | "procedure";
    reviewState: "candidate";
    content: string;
    metadata: Record<string, unknown>;
  };
  memorySource: {
    sourceKind: "event";
    sourceTable: string;
    metadata: Record<string, unknown>;
  };
};

function mapCanonicalKindToPersistenceMemoryKind(
  kind: string | undefined,
): CandidatePersistencePlan["memoryObject"]["memoryKind"] | null {
  switch (kind) {
    case "user":
    case "feedback":
      return "feedback";
    case "project":
    case "reference":
      return "project";
    default:
      return null;
  }
}

function mapCandidateKindToMemoryKind(
  input: CandidateSubmissionInput,
): CandidatePersistencePlan["memoryObject"]["memoryKind"] {
  if (input.kind === "procedure") {
    return "procedure";
  }

  const canonicalKind = readCanonicalMemoryIngestionCandidateFromMetadata(input.metadata)?.record
    .kind;
  const canonicalMemoryKind = mapCanonicalKindToPersistenceMemoryKind(canonicalKind);
  if (canonicalMemoryKind) {
    return canonicalMemoryKind;
  }

  if (
    input.kind === "correction" &&
    input.metadata &&
    typeof input.metadata === "object" &&
    input.metadata.category === "project_fact_correction"
  ) {
    return "project";
  }
  if (
    input.kind === "learning" &&
    input.metadata &&
    typeof input.metadata === "object" &&
    (input.metadata.category === "user_preference" ||
      input.metadata.category === "user_requirement")
  ) {
    return "feedback";
  }

  switch (input.kind) {
    case "correction":
      return "feedback";
    case "learning":
    case "improvement":
      return "project";
  }
}

export function createCandidateSubmissionPersistencePlan(params: {
  schema: string;
  input: CandidateSubmissionInput;
}): CandidatePersistencePlan {
  const schema = assertSafeIdentifier(params.schema, "schema");
  const input = params.input;
  const eventName = `candidate_submission.${input.kind}` as const;

  return {
    schema,
    event: {
      eventKind: "candidate_submission",
      eventName,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.agentId ? { agentId: input.agentId } : {}),
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      payload: {
        submissionKind: input.kind,
        content: input.content,
        ...(input.metadata ? { candidateMetadata: input.metadata } : {}),
      },
      metadata: {
        source: "candidate-only-ingress",
      },
    },
    memoryObject: {
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.agentId ? { agentId: input.agentId } : {}),
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      memoryKind: mapCandidateKindToMemoryKind(input),
      reviewState: "candidate",
      content: input.content,
      metadata: {
        submissionKind: input.kind,
        ...(input.metadata ? { candidateMetadata: input.metadata } : {}),
      },
    },
    memorySource: {
      sourceKind: "event",
      sourceTable: `${schema}.memory_events`,
      metadata: {
        source: "candidate-only-ingress",
        submissionKind: input.kind,
      },
    },
  };
}
