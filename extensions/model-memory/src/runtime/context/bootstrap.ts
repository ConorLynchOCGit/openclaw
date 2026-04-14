import type {
  ContextArtifactRecord,
  SessionContextStateRecord,
  WorkspaceProjectionVersionRecord,
} from "../../runtime-read-models.ts";

export type ContextBootstrapInput = {
  sessionId: string;
  agentId: string;
  sessionState?: SessionContextStateRecord;
  projectionVersions: WorkspaceProjectionVersionRecord[];
  artifacts: ContextArtifactRecord[];
};

export type ContextBootstrapResult = {
  sessionId: string;
  agentId: string;
  activeProjectIds: string[];
  projectionVersions: WorkspaceProjectionVersionRecord[];
  sessionSummaryArtifact?: ContextArtifactRecord;
};

export function bootstrapContext(input: ContextBootstrapInput): ContextBootstrapResult {
  const projectionVersions = [...input.projectionVersions].toSorted((left, right) =>
    left.targetId.localeCompare(right.targetId),
  );
  const sessionSummaryArtifact = input.sessionState?.sessionSummaryArtifactId
    ? input.artifacts.find(
        (artifact) => artifact.id === input.sessionState?.sessionSummaryArtifactId,
      )
    : undefined;

  return {
    sessionId: input.sessionId,
    agentId: input.agentId,
    activeProjectIds: [...(input.sessionState?.activeProjectIds ?? [])].toSorted((left, right) =>
      left.localeCompare(right),
    ),
    projectionVersions,
    sessionSummaryArtifact,
  };
}
