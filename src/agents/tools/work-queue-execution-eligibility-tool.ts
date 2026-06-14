import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "./common.js";
import { textResult } from "./common.js";

export const WORK_QUEUE_EXECUTION_ELIGIBILITY_TOOL_NAME =
  "work_queue_execution_eligibility" as const;

const WorkQueueExecutionEligibilitySchema = Type.Object(
  {
    limit: Type.Optional(
      Type.Number({
        description: "Maximum number of eligible and excluded Work Queue items to return.",
      }),
    ),
  },
  { additionalProperties: false },
);

export type WorkQueueExecutionEligibilityToolInput = {
  limit?: number;
};

export type WorkQueueExecutionEligibilityReadbackItem = {
  workItemId: string;
  title: string;
  description?: string | null;
  itemType: string;
  queueStatus: string;
  lifecycleState: string;
  queueRank: number | null;
  queuePosition: number | null;
  sourceDocRefs?: string[];
  artifactRefs?: string[];
  nextAction?: string | null;
  reasonCodes: string[];
  runtimeJobIds?: string[];
};

export type WorkQueueExecutionEligibilityToolResult = {
  artifactKind: "work_queue_execution_eligibility_read_model";
  eligible: WorkQueueExecutionEligibilityReadbackItem[];
  excluded: WorkQueueExecutionEligibilityReadbackItem[];
  source: string;
  ranking: "db_queue_rank_only";
  semanticExecutorSelection: false;
  workQueueLifecycleMutationAllowed: false;
};

function boundedLimit(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("limit must be a finite number");
  }
  const integer = Math.trunc(value);
  if (integer < 1 || integer > 50) {
    throw new Error("limit must be between 1 and 50");
  }
  return integer;
}

function formatItem(item: WorkQueueExecutionEligibilityReadbackItem): string {
  const rank =
    typeof item.queueRank === "number"
      ? `rank=${item.queueRank}`
      : typeof item.queuePosition === "number"
        ? `position=${item.queuePosition}`
        : "rank=<none>";
  const runtimeJobs =
    item.runtimeJobIds && item.runtimeJobIds.length > 0
      ? ` runtimeJobs=${item.runtimeJobIds.join(",")}`
      : "";
  const lines = [
    `- ${item.workItemId}: ${item.title}`,
    `  ${rank} status=${item.queueStatus} lifecycle=${item.lifecycleState} type=${item.itemType}${runtimeJobs}`,
    `  reasons=${item.reasonCodes.join(", ")}`,
  ];
  if (item.description) {
    lines.push(`  description=${item.description}`);
  }
  if (item.nextAction) {
    lines.push(`  nextAction=${item.nextAction}`);
  }
  if (item.sourceDocRefs?.length) {
    lines.push(`  sourceDocRefs=${item.sourceDocRefs.join(", ")}`);
  }
  if (item.artifactRefs?.length) {
    lines.push(`  artifactRefs=${item.artifactRefs.join(", ")}`);
  }
  return lines.join("\n");
}

export function formatWorkQueueExecutionEligibilityResult(
  result: WorkQueueExecutionEligibilityToolResult,
): string {
  const lines = [
    "Work Queue execution eligibility.",
    `source: ${result.source}`,
    `ranking: ${result.ranking}`,
    "semanticExecutorSelection: false",
    "workQueueLifecycleMutationAllowed: false",
    "",
    `Eligible (${result.eligible.length}):`,
    ...(result.eligible.length > 0 ? result.eligible.map(formatItem) : ["- <none>"]),
    "",
    `Excluded (${result.excluded.length}):`,
    ...(result.excluded.length > 0 ? result.excluded.map(formatItem) : ["- <none>"]),
  ];
  return lines.join("\n");
}

export function createWorkQueueExecutionEligibilityTool(opts: {
  readEligibility: (
    input: WorkQueueExecutionEligibilityToolInput,
  ) => Promise<WorkQueueExecutionEligibilityToolResult>;
}): AnyAgentTool {
  return {
    name: WORK_QUEUE_EXECUTION_ELIGIBILITY_TOOL_NAME,
    label: "work_queue_execution_eligibility",
    displaySummary: "Read eligible Work Queue execution items",
    description:
      "Read deterministic Work Queue execution eligibility. Use before start_execution_session when the user asks to execute the next Work Queue item. This returns queue-ranked eligible items and excluded reason codes; it does not infer requirements, choose an executor, or mutate Work Queue lifecycle.",
    parameters: WorkQueueExecutionEligibilitySchema,
    execute: async (_toolCallId, args) => {
      const limit = boundedLimit((args as WorkQueueExecutionEligibilityToolInput).limit);
      const result = await opts.readEligibility(limit === undefined ? {} : { limit });
      return textResult(formatWorkQueueExecutionEligibilityResult(result), result);
    },
  };
}
