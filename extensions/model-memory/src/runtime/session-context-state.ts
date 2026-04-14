import type { CompactionStatus, SessionContextStateRecord } from "../runtime-read-models.ts";

export type SessionContextStateInput = {
  sessionId: string;
  agentId: string;
  activeProjectIds?: string[];
  openLoops?: string[];
  unresolvedQuestions?: string[];
  activePlanState?: Record<string, unknown>;
  sessionSummaryArtifactId?: string;
  projectionVersions?: Record<string, string>;
  compactionStatus?: CompactionStatus;
  updatedAt?: Date;
};

export type SessionContextStatePatch = Omit<SessionContextStateInput, "sessionId" | "agentId">;

function normalizeStringList(values: string[] | undefined): string[] {
  return Array.from(new Set((values ?? []).map((value) => value.trim()).filter(Boolean))).toSorted(
    (left, right) => left.localeCompare(right),
  );
}

function normalizeProjectionVersions(
  versions: Record<string, string> | undefined,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(versions ?? {})
      .map(([key, value]) => [key, value.trim()])
      .filter(([, value]) => value.length > 0)
      .toSorted(([left], [right]) => left.localeCompare(right)),
  );
}

export function createSessionContextState(
  input: SessionContextStateInput,
): SessionContextStateRecord {
  return {
    sessionId: input.sessionId,
    agentId: input.agentId,
    activeProjectIds: normalizeStringList(input.activeProjectIds),
    openLoops: normalizeStringList(input.openLoops),
    unresolvedQuestions: normalizeStringList(input.unresolvedQuestions),
    activePlanState: { ...input.activePlanState },
    sessionSummaryArtifactId: input.sessionSummaryArtifactId,
    projectionVersions: normalizeProjectionVersions(input.projectionVersions),
    compactionStatus: input.compactionStatus ?? "delegated",
    updatedAt: input.updatedAt ?? new Date(0),
  };
}

export function updateSessionContextState(
  existing: SessionContextStateRecord,
  patch: SessionContextStatePatch,
): SessionContextStateRecord {
  return createSessionContextState({
    sessionId: existing.sessionId,
    agentId: existing.agentId,
    activeProjectIds: patch.activeProjectIds ?? existing.activeProjectIds,
    openLoops: patch.openLoops ?? existing.openLoops,
    unresolvedQuestions: patch.unresolvedQuestions ?? existing.unresolvedQuestions,
    activePlanState: patch.activePlanState ?? existing.activePlanState,
    sessionSummaryArtifactId: patch.sessionSummaryArtifactId ?? existing.sessionSummaryArtifactId,
    projectionVersions: patch.projectionVersions ?? existing.projectionVersions,
    compactionStatus: patch.compactionStatus ?? existing.compactionStatus,
    updatedAt: patch.updatedAt ?? existing.updatedAt,
  });
}
