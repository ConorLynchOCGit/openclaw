import type {
  ContextArtifactRecord,
  WorkspaceProjectionVersionRecord,
} from "../../runtime-read-models.ts";
import { applyTrimPolicy, type ContextSegment } from "./trim-policy.ts";

export type AssembleContextInput = {
  projectionVersions: WorkspaceProjectionVersionRecord[];
  projectionTexts: Record<string, string>;
  artifacts: ContextArtifactRecord[];
  recentTurns: Array<{ role: "user" | "assistant" | "system"; text: string }>;
  toolResults: string[];
  currentTurn: string;
  maxTokens: number;
  includeRetrievalPacks?: boolean;
};

export type AssembledContext = {
  stableSegments: ContextSegment[];
  semiStableSegments: ContextSegment[];
  volatileSegments: ContextSegment[];
  orderedSegments: ReturnType<typeof applyTrimPolicy>["segments"];
  pruningUsed: boolean;
  systemPromptAddition?: string;
};

function toStableSegments(
  projectionVersions: WorkspaceProjectionVersionRecord[],
  projectionTexts: Record<string, string>,
): ContextSegment[] {
  return [...projectionVersions]
    .toSorted((left, right) => left.targetId.localeCompare(right.targetId))
    .map((version) => ({
      segmentType: "bootstrap" as const,
      priority: "stable" as const,
      sourceKind: "workspace_projection",
      projectionVersionId: version.id,
      text: projectionTexts[version.targetId] ?? "",
    }))
    .filter((segment) => segment.text.trim().length > 0);
}

function toSemiStableSegments(
  artifacts: ContextArtifactRecord[],
  includeRetrievalPacks: boolean,
): ContextSegment[] {
  return artifacts
    .filter((artifact) => {
      if (
        [
          "user_memory_pack",
          "project_memory_pack",
          "procedure_memory_pack",
          "session_summary_pack",
        ].includes(artifact.artifactType)
      ) {
        return true;
      }
      return includeRetrievalPacks && artifact.artifactType === "retrieval_pack";
    })
    .toSorted((left, right) =>
      `${left.artifactType}:${left.id}`.localeCompare(`${right.artifactType}:${right.id}`),
    )
    .map((artifact) => ({
      segmentType:
        artifact.artifactType === "retrieval_pack"
          ? ("retrieval_pack" as const)
          : artifact.artifactType === "session_summary_pack"
            ? ("session_summary" as const)
            : artifact.artifactType === "project_memory_pack"
              ? ("project_pack" as const)
              : ("user_pack" as const),
      priority: "semi_stable" as const,
      sourceKind: "context_artifact",
      sourceArtifactId: artifact.id,
      text: artifact.renderedText ?? JSON.stringify(artifact.structuredPayload ?? {}, null, 2),
    }));
}

function toVolatileSegments(input: AssembleContextInput): ContextSegment[] {
  const turnSegmentText = input.recentTurns
    .map((turn) => `${turn.role}: ${turn.text}`)
    .concat(`user: ${input.currentTurn}`)
    .join("\n");
  const segments: ContextSegment[] = [
    {
      segmentType: "recent_turns",
      priority: "volatile",
      sourceKind: "turn_history",
      text: turnSegmentText,
    },
    ...input.toolResults.map((result, index) => ({
      segmentType: "tool_results" as const,
      priority: "volatile" as const,
      sourceKind: `tool_result_${index}`,
      text: result,
    })),
  ];
  return segments.filter((segment) => segment.text.trim().length > 0);
}

export function assembleContext(input: AssembleContextInput): AssembledContext {
  const stableSegments = toStableSegments(input.projectionVersions, input.projectionTexts);
  const semiStableSegments = toSemiStableSegments(
    input.artifacts,
    input.includeRetrievalPacks ?? false,
  );
  const volatileSegments = toVolatileSegments(input);
  const trimmed = applyTrimPolicy(
    [...stableSegments, ...semiStableSegments, ...volatileSegments],
    input.maxTokens,
  );

  return {
    stableSegments,
    semiStableSegments,
    volatileSegments,
    orderedSegments: trimmed.segments,
    pruningUsed: trimmed.pruningUsed,
  };
}
