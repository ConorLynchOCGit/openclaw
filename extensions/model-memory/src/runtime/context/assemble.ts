import type {
  ContextArtifactRecord,
  WorkspaceProjectionVersionRecord,
} from "../../runtime-read-models.ts";
import { countRuntimeTokens } from "../../runtime-read-models.ts";
import { getWorkspaceProjectionTarget } from "../projections/targets.ts";
import { applyTrimPolicy, type ContextSegment } from "./trim-policy.ts";

const DEFAULT_RETRIEVAL_PACK_LIMIT = 1;
const DEFAULT_RETRIEVAL_PACK_TOKEN_SHARE = 0.2;

export type AssembleContextInput = {
  projectionVersions: WorkspaceProjectionVersionRecord[];
  projectionTexts: Record<string, string>;
  artifacts: ContextArtifactRecord[];
  recentTurns: Array<{ role: "user" | "assistant" | "system"; text: string }>;
  toolResults: string[];
  currentTurn: string;
  maxTokens: number;
  includeRetrievalPacks?: boolean;
  retrievalPackScopeKeys?: string[];
};

export type AssembledContext = {
  stableSegments: ContextSegment[];
  semiStableSegments: ContextSegment[];
  volatileSegments: ContextSegment[];
  orderedSegments: ReturnType<typeof applyTrimPolicy>["segments"];
  pruningUsed: boolean;
  systemPromptAddition?: string;
};

function trimTextToTokenBudget(text: string, maxTokens: number): string {
  if (maxTokens <= 0) {
    return "";
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }
  const words = trimmed.split(/\s+/);
  if (words.length <= maxTokens) {
    return trimmed;
  }
  return words.slice(0, maxTokens).join(" ");
}

function toStableSegments(
  projectionVersions: WorkspaceProjectionVersionRecord[],
  projectionTexts: Record<string, string>,
): ContextSegment[] {
  return [...projectionVersions]
    .sort((left, right) => left.targetId.localeCompare(right.targetId))
    .map((version) => {
      const target = getWorkspaceProjectionTarget(version.targetId);
      return {
        segmentType: "bootstrap" as const,
        priority: "stable" as const,
        sourceKind: "workspace_projection",
        projectionVersionId: version.id,
        text: trimTextToTokenBudget(projectionTexts[version.targetId] ?? "", target.tokenBudget),
      };
    })
    .filter((segment) => segment.text.trim().length > 0);
}

function toSemiStableSegments(
  artifacts: ContextArtifactRecord[],
  includeRetrievalPacks: boolean,
  retrievalPackScopeKeys: string[],
  maxTokens: number,
): ContextSegment[] {
  const latestDerivedArtifactByKey = new Map<string, ContextArtifactRecord>();
  for (const artifact of [...artifacts].sort((left, right) => {
    const byBuiltAt = right.builtAt.getTime() - left.builtAt.getTime();
    if (byBuiltAt !== 0) {
      return byBuiltAt;
    }
    return right.contentHash.localeCompare(left.contentHash);
  })) {
    if (!["user_memory_pack", "session_summary_pack"].includes(artifact.artifactType)) {
      continue;
    }
    const key = `${artifact.artifactType}:${artifact.scopeKey ?? "global"}`;
    if (!latestDerivedArtifactByKey.has(key)) {
      latestDerivedArtifactByKey.set(key, artifact);
    }
  }
  const normalizedScopeKeys = retrievalPackScopeKeys.filter((value) => value.trim().length > 0);
  const retrievalArtifacts = includeRetrievalPacks
    ? artifacts
        .filter(
          (artifact) =>
            artifact.artifactType === "retrieval_pack" &&
            (normalizedScopeKeys.length === 0 ||
              (artifact.scopeKey ? normalizedScopeKeys.includes(artifact.scopeKey) : false)),
        )
        .sort((left, right) => {
          const byBuiltAt = right.builtAt.getTime() - left.builtAt.getTime();
          if (byBuiltAt !== 0) {
            return byBuiltAt;
          }
          return right.contentHash.localeCompare(left.contentHash);
        })
        .slice(0, DEFAULT_RETRIEVAL_PACK_LIMIT)
    : [];
  const derivedArtifacts = [...latestDerivedArtifactByKey.values()].sort((left, right) =>
    `${left.artifactType}:${left.scopeKey ?? "global"}:${left.contentHash}`.localeCompare(
      `${right.artifactType}:${right.scopeKey ?? "global"}:${right.contentHash}`,
    ),
  );
  const retrievalPackTokenBudget = Math.max(
    1,
    Math.floor(maxTokens * DEFAULT_RETRIEVAL_PACK_TOKEN_SHARE),
  );

  return [...derivedArtifacts, ...retrievalArtifacts]
    .map((artifact) => ({
      segmentType:
        artifact.artifactType === "retrieval_pack"
          ? ("retrieval_pack" as const)
          : artifact.artifactType === "session_summary_pack"
            ? ("session_summary" as const)
            : artifact.artifactType === "project_memory_pack"
              ? ("project_pack" as const)
              : artifact.artifactType === "procedure_memory_pack"
                ? ("procedure_pack" as const)
                : ("user_pack" as const),
      priority:
        artifact.artifactType === "retrieval_pack"
          ? ("volatile" as const)
          : ("semi_stable" as const),
      sourceKind: "context_artifact",
      sourceArtifactId: artifact.id,
      text:
        artifact.artifactType === "retrieval_pack"
          ? trimTextToTokenBudget(
              artifact.renderedText ?? JSON.stringify(artifact.structuredPayload ?? {}, null, 2),
              retrievalPackTokenBudget,
            )
          : artifact.artifactType === "user_memory_pack"
            ? trimTextToTokenBudget(
                artifact.renderedText ?? JSON.stringify(artifact.structuredPayload ?? {}, null, 2),
                Math.max(1, Math.floor(maxTokens * 0.18)),
              )
            : (artifact.renderedText ?? JSON.stringify(artifact.structuredPayload ?? {}, null, 2)),
    }))
    .filter((segment) => countRuntimeTokens(segment.text) > 0);
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
    input.retrievalPackScopeKeys ?? [],
    input.maxTokens,
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
