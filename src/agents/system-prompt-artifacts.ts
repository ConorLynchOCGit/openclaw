import type { SessionSystemPromptReport } from "../config/sessions/types.js";

type PromptArtifactChangeReason = NonNullable<
  SessionSystemPromptReport["promptArtifactChanges"]
>["reasons"][number];

export function resolvePromptArtifactChanges(params: {
  current?: SessionSystemPromptReport;
  previous?: SessionSystemPromptReport;
}): SessionSystemPromptReport["promptArtifactChanges"] | undefined {
  const currentArtifacts = params.current?.promptArtifacts;
  const previousArtifacts = params.previous?.promptArtifacts;
  if (!currentArtifacts || !previousArtifacts) {
    return undefined;
  }

  const reasons: PromptArtifactChangeReason[] = [];

  if (currentArtifacts.baseSystemPromptHash !== previousArtifacts.baseSystemPromptHash) {
    reasons.push("base_prompt_changed");
  }

  const currentMemoryPackHash = currentArtifacts.memoryPackPromptHash ?? null;
  const previousMemoryPackHash = previousArtifacts.memoryPackPromptHash ?? null;
  if (currentMemoryPackHash !== previousMemoryPackHash) {
    reasons.push(
      currentMemoryPackHash && previousMemoryPackHash
        ? "memory_pack_segment_changed"
        : "memory_pack_presence_changed",
    );
  }

  if (currentArtifacts.injectedFilesHash !== previousArtifacts.injectedFilesHash) {
    reasons.push("injected_files_changed");
  }
  if (currentArtifacts.skillsHash !== previousArtifacts.skillsHash) {
    reasons.push("skills_prompt_changed");
  }
  if (currentArtifacts.toolsListHash !== previousArtifacts.toolsListHash) {
    reasons.push("tools_list_changed");
  }
  if (currentArtifacts.toolsSchemaHash !== previousArtifacts.toolsSchemaHash) {
    reasons.push("tools_schema_changed");
  }

  const currentSegments = params.current?.contextSegments?.totals;
  const previousSegments = params.previous?.contextSegments?.totals;
  const segmentDrift =
    currentSegments && previousSegments
      ? {
          stableChanged: currentSegments.stableHash !== previousSegments.stableHash,
          semiStableChanged: currentSegments.semiStableHash !== previousSegments.semiStableHash,
          volatileChanged: currentSegments.volatileHash !== previousSegments.volatileHash,
        }
      : undefined;

  return {
    comparedToGeneratedAt: params.previous?.generatedAt,
    changed: reasons.length > 0,
    changedTailOnly:
      reasons.length > 0 &&
      reasons.every(
        (reason) =>
          reason === "memory_pack_segment_changed" || reason === "memory_pack_presence_changed",
      ),
    stablePrefixReusable: !reasons.some(
      (reason) =>
        reason !== "memory_pack_segment_changed" && reason !== "memory_pack_presence_changed",
    ),
    ...(segmentDrift ? { segmentDrift } : {}),
    reasons,
  };
}

export function annotatePromptArtifactChanges(params: {
  current?: SessionSystemPromptReport;
  previous?: SessionSystemPromptReport;
}): SessionSystemPromptReport | undefined {
  if (!params.current) {
    return undefined;
  }
  const promptArtifactChanges = resolvePromptArtifactChanges(params);
  if (!promptArtifactChanges) {
    if (!("promptArtifactChanges" in params.current)) {
      return params.current;
    }
    const { promptArtifactChanges: _ignored, ...rest } = params.current;
    return rest;
  }
  return {
    ...params.current,
    promptArtifactChanges,
  };
}
