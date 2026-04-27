import { buildDerivedArtifactId, uniqueSortedStrings, type JsonLike } from "../derived-artifact.ts";
import { sha256JsonValue } from "../hashing.ts";

export const PHASE2_PROACTIVITY_ACTIVE_CONTEXT_SCHEMA_VERSION =
  "phase2_proactivity_active_context.v1" as const;

export type Phase2ProactivityActiveContextInput = {
  userId?: string;
  recipientId?: string;
  projectId?: string;
  sessionKey?: string;
  operatorId?: string;
  taskId?: string;
  source?: "chat_active_session" | "gateway_eligibility_scope" | "proof_fixture" | "unknown";
};

export type Phase2ProactivityActiveContext = Required<
  Omit<Phase2ProactivityActiveContextInput, "taskId">
> & {
  schemaVersion: typeof PHASE2_PROACTIVITY_ACTIVE_CONTEXT_SCHEMA_VERSION;
  contextId: string;
  taskId?: string;
  wildcardRejected: boolean;
};

export type Phase2ProactivityContextCandidateScope = {
  projectId: string;
  sessionKey: string;
  userId?: string;
  recipientId?: string;
  operatorId?: string;
  taskId?: string;
};

export type Phase2ProactivityContextMatchDecision = {
  decision: "surface_inline" | "keep_in_inbox" | "blocked";
  exactMatch: boolean;
  reasonCodes: string[];
  whyNotShownDiagnostics: string[];
  contextHash: string;
};

function safeString(value: string | undefined, fallback: string): string {
  return value && value.trim() ? value.trim() : fallback;
}

function hasWildcard(value: string | undefined): boolean {
  return (
    !value || value === "*" || value.toLowerCase() === "all" || value.toLowerCase() === "global"
  );
}

export function resolvePhase2ProactivityActiveContext(
  input: Phase2ProactivityActiveContextInput = {},
): Phase2ProactivityActiveContext {
  const context = {
    schemaVersion: PHASE2_PROACTIVITY_ACTIVE_CONTEXT_SCHEMA_VERSION,
    userId: safeString(input.userId, "local-openclaw-user"),
    recipientId: safeString(input.recipientId, "local-openclaw-recipient"),
    projectId: safeString(input.projectId, "openclaw"),
    sessionKey: safeString(input.sessionKey, "main"),
    operatorId: safeString(input.operatorId, "local-openclaw-operator"),
    taskId: input.taskId?.trim() || undefined,
    source: input.source ?? "chat_active_session",
    wildcardRejected: false,
  } satisfies Omit<Phase2ProactivityActiveContext, "contextId">;
  const wildcardRejected = [
    context.userId,
    context.recipientId,
    context.projectId,
    context.sessionKey,
    context.operatorId,
  ].some(hasWildcard);
  const contextId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_proactivity_active_context",
    targetId: `${context.projectId}:${context.sessionKey}`,
    seed: { ...context, wildcardRejected },
  });
  return { ...context, contextId, wildcardRejected };
}

export function decidePhase2ProactivityContextMatch(input: {
  activeContext: Phase2ProactivityActiveContext;
  candidateScope: Phase2ProactivityContextCandidateScope;
  staleLabels?: string[];
  conflictLabels?: string[];
}): Phase2ProactivityContextMatchDecision {
  const reasonCodes: string[] = [];
  const diagnostics: string[] = [];
  if (input.activeContext.wildcardRejected) {
    reasonCodes.push("wildcard_global_context_rejected");
  }
  if (input.candidateScope.projectId !== input.activeContext.projectId) {
    reasonCodes.push("project_mismatch");
    diagnostics.push(
      `not shown because candidate project=${input.candidateScope.projectId}, active project=${input.activeContext.projectId}`,
    );
  }
  if (input.candidateScope.sessionKey !== input.activeContext.sessionKey) {
    reasonCodes.push("session_mismatch");
    diagnostics.push(
      `not shown because candidate session=${input.candidateScope.sessionKey}, active session=${input.activeContext.sessionKey}`,
    );
  }
  if (
    input.candidateScope.taskId &&
    input.activeContext.taskId &&
    input.candidateScope.taskId !== input.activeContext.taskId
  ) {
    reasonCodes.push("task_mismatch");
    diagnostics.push(
      `not shown because candidate task=${input.candidateScope.taskId}, active task=${input.activeContext.taskId}`,
    );
  }
  if ((input.staleLabels ?? []).length > 0) {
    reasonCodes.push("stale_candidate_suppressed");
  }
  if ((input.conflictLabels ?? []).length > 0) {
    reasonCodes.push("conflicted_candidate_suppressed");
  }
  const exactMatch = reasonCodes.length === 0;
  return {
    decision: input.activeContext.wildcardRejected
      ? "blocked"
      : exactMatch
        ? "surface_inline"
        : "keep_in_inbox",
    exactMatch,
    reasonCodes: uniqueSortedStrings(reasonCodes),
    whyNotShownDiagnostics: diagnostics,
    contextHash: sha256JsonValue(input.activeContext as unknown as JsonLike),
  };
}
