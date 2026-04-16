import { countRuntimeTokens } from "../../runtime-read-models.ts";

export type ContextSegment = {
  segmentType:
    | "bootstrap"
    | "user_pack"
    | "project_pack"
    | "procedure_pack"
    | "session_summary"
    | "retrieval_pack"
    | "recent_turns"
    | "tool_results"
    | "system_addition";
  text: string;
  priority: "stable" | "semi_stable" | "volatile";
  sourceKind: string;
  sourceArtifactId?: string;
  projectionVersionId?: string;
};

export type TrimmedContextSegment = ContextSegment & {
  estimatedTokens: number;
  dropped: boolean;
  trimmed: boolean;
  trimReason?: string;
};

const DROP_ORDER: Array<ContextSegment["segmentType"]> = [
  "tool_results",
  "recent_turns",
  "session_summary",
  "project_pack",
  "procedure_pack",
  "retrieval_pack",
];

export function applyTrimPolicy(
  segments: ContextSegment[],
  maxTokens: number,
): { segments: TrimmedContextSegment[]; pruningUsed: boolean } {
  const working: TrimmedContextSegment[] = segments.map((segment) => ({
    ...segment,
    estimatedTokens: countRuntimeTokens(segment.text),
    dropped: false,
    trimmed: false,
  }));
  let total = working.reduce((sum, segment) => sum + segment.estimatedTokens, 0);
  let pruningUsed = false;

  for (const segmentType of DROP_ORDER) {
    if (total <= maxTokens) {
      break;
    }
    for (const segment of working) {
      if (segment.segmentType !== segmentType || segment.dropped) {
        continue;
      }
      segment.dropped = true;
      segment.trimReason = "trim_budget";
      total -= segment.estimatedTokens;
      pruningUsed = true;
      if (total <= maxTokens) {
        break;
      }
    }
  }

  return { segments: working, pruningUsed };
}
