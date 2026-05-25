import { z } from "zod";
import type { JsonValue } from "../runtime-job-repository.ts";
import type { TeamGraphNode } from "./runtime-work-graph.ts";
import type { RuntimeWorkGraphNodeExecutionResult } from "./workflow-node-execution-contracts.ts";

export const SUPERSTEP_BRANCH_RESULT_STATUSES = [
  "succeeded",
  "blocked_context",
  "blocked_resource",
  "blocked_dependency",
  "blocked_authority",
  "blocked_human_decision",
  "failed_recoverable",
  "failed_unrecoverable",
  "needs_review",
] as const;

export const SuperstepBranchResultStatusSchema = z.enum(SUPERSTEP_BRANCH_RESULT_STATUSES);
export type SuperstepBranchResultStatus = z.infer<typeof SuperstepBranchResultStatusSchema>;

const stringList = (maxItems: number, maxChars = 360) =>
  z.array(z.string().trim().min(1).max(maxChars)).max(maxItems).default([]);

export const SuperstepBranchResultSchema = z
  .object({
    artifactKind: z.literal("runtime_work_graph_superstep_branch_result"),
    schemaVersion: z.literal("execution-platform.superstep-branch-result.v1"),
    superstepId: z.string().trim().min(1).max(360),
    branchId: z.string().trim().min(1).max(420),
    nodeId: z.string().trim().min(1).max(260),
    nodeKind: z.string().trim().min(1).max(160),
    capabilityId: z.string().trim().max(260).nullable(),
    targetCommitmentIds: stringList(40, 220),
    status: SuperstepBranchResultStatusSchema,
    failureClass: z.string().trim().max(220).nullable(),
    errorPath: z.string().trim().max(320).nullable(),
    errorSummary: z.string().trim().max(700).nullable(),
    blockerSummary: z.string().trim().max(700).nullable(),
    repairAction: z.string().trim().max(360).nullable(),
    nextTransition: z.string().trim().max(260).nullable(),
    evidenceRefs: stringList(80, 700),
    readinessStateRef: z.string().trim().max(700).nullable(),
    reasonCodes: stringList(80, 260),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
    rawCommandLogStored: z.literal(false),
    rawDbRowsStored: z.literal(false),
    secretsStored: z.literal(false),
  })
  .strict();

export type SuperstepBranchResult = z.infer<typeof SuperstepBranchResultSchema>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function bounded(value: unknown, max = 700): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().replace(/\s+/gu, " ");
  return normalized ? normalized.slice(0, max) : null;
}

function stringArray(value: unknown, max = 80): string[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value.filter(
            (item): item is string => typeof item === "string" && item.trim().length > 0,
          ),
        ),
      ]
        .map((item) => item.trim())
        .slice(0, max)
    : [];
}

function includesAny(values: string[], markers: string[]): boolean {
  const joined = values.join(" ").toLowerCase();
  return markers.some((marker) => joined.includes(marker));
}

function statusFromStructuredSignals(input: {
  resultStatus: string;
  nodeStatus: string | null;
  reasonCodes: string[];
  metadata: Record<string, unknown>;
  unrecoverable: boolean;
}): SuperstepBranchResultStatus {
  if (input.resultStatus === "succeeded" || input.nodeStatus === "succeeded") {
    return "succeeded";
  }
  if (input.resultStatus === "waiting_for_human" || input.nodeStatus === "waiting_for_human") {
    return "blocked_human_decision";
  }
  const lifecycleState = bounded(input.metadata.nodeLifecycleState, 120);
  const readinessStatus = bounded(input.metadata.nodeReadinessStatus, 120);
  const repairAction = bounded(input.metadata.nodeReadinessRepairAction, 220);
  const failureClass = bounded(
    input.metadata.lastRepairFailureClass ?? input.metadata.parallelFrontierBranchFailureClass,
    220,
  );
  const structuredSignals = [
    lifecycleState,
    readinessStatus,
    repairAction,
    failureClass,
    ...input.reasonCodes,
  ].filter((value): value is string => Boolean(value));
  if (
    includesAny(structuredSignals, [
      "context",
      "handoff",
      "snapshot_stale",
      "context_packet",
      "request_context",
    ])
  ) {
    return "blocked_context";
  }
  if (
    includesAny(structuredSignals, [
      "resource",
      "materialization",
      "target_snapshot",
      "target_ref",
      "file_snapshot",
      "node_execution_packet",
    ])
  ) {
    return "blocked_resource";
  }
  if (includesAny(structuredSignals, ["dependency", "not_satisfied", "upstream"])) {
    return "blocked_dependency";
  }
  if (
    includesAny(structuredSignals, [
      "authority",
      "prohibited",
      "raw_storage",
      "storage_policy",
      "permission",
    ])
  ) {
    return "blocked_authority";
  }
  if (input.unrecoverable) {
    return "failed_unrecoverable";
  }
  if (input.resultStatus === "failed" || input.nodeStatus === "failed") {
    return "failed_recoverable";
  }
  return "needs_review";
}

function nextTransitionForStatus(status: SuperstepBranchResultStatus): string {
  switch (status) {
    case "succeeded":
      return "evaluate_downstream";
    case "blocked_context":
      return "request_context_or_reuse_context";
    case "blocked_resource":
      return "materialize_resources_or_split_task";
    case "blocked_dependency":
      return "wait_for_dependency_or_repair_edge";
    case "blocked_authority":
      return "operator_review_authority";
    case "blocked_human_decision":
      return "wait_for_human_decision";
    case "failed_recoverable":
      return "repair_or_retry_branch";
    case "failed_unrecoverable":
      return "operator_review_unrecoverable_failure";
    case "needs_review":
      return "operator_or_orchestrator_review";
  }
  return "operator_or_orchestrator_review";
}

export function buildSuperstepBranchResult(input: {
  superstepId: string;
  branchId: string;
  node: TeamGraphNode;
  capabilityId: string | null;
  resultStatus: RuntimeWorkGraphNodeExecutionResult["status"] | "continue" | "needs_review";
  refreshedNodeStatus?: string | null;
  refreshedMetadata?: JsonValue | null;
  reasonCodes: string[];
  outputArtifactRefs?: string[];
  errorSummary?: string | null;
  failureClass?: string | null;
  errorPath?: string | null;
  repairAction?: string | null;
  readinessStateRef?: string | null;
  unrecoverable?: boolean;
}): SuperstepBranchResult {
  const metadata = asRecord(input.refreshedMetadata ?? input.node.metadata ?? null);
  const targetCommitmentIds = stringArray(metadata.commitmentIdsAdvanced, 40);
  const reasonCodes = [...new Set(input.reasonCodes)].slice(0, 80);
  const status = statusFromStructuredSignals({
    resultStatus: input.resultStatus,
    nodeStatus: input.refreshedNodeStatus ?? null,
    reasonCodes,
    metadata,
    unrecoverable: input.unrecoverable === true,
  });
  const failureClass =
    input.failureClass ??
    bounded(metadata.lastRepairFailureClass, 220) ??
    bounded(metadata.parallelFrontierBranchFailureClass, 220);
  const errorPath =
    input.errorPath ??
    bounded(metadata.lastFailedFieldPath, 320) ??
    bounded(metadata.parallelFrontierBranchErrorPath, 320);
  const errorSummary =
    input.errorSummary ??
    bounded(metadata.parallelFrontierBranchErrorSummary, 700) ??
    bounded(metadata.lastResultSummary, 700);
  const repairAction =
    input.repairAction ??
    bounded(metadata.nodeReadinessRepairAction, 360) ??
    bounded(metadata.lastRepairStrategy, 360);
  const readinessStateRef = input.readinessStateRef ?? bounded(metadata.nodeReadinessStateRef, 700);
  const evidenceRefs = [
    ...(input.outputArtifactRefs ?? []),
    ...stringArray(metadata.outputArtifactRefs, 40),
    ...stringArray(metadata.contextSnapshotRefs, 40),
    ...stringArray(metadata.evidenceRefs, 40),
  ];
  return SuperstepBranchResultSchema.parse({
    artifactKind: "runtime_work_graph_superstep_branch_result",
    schemaVersion: "execution-platform.superstep-branch-result.v1",
    superstepId: input.superstepId,
    branchId: input.branchId,
    nodeId: input.node.nodeId,
    nodeKind: input.node.nodeKind,
    capabilityId: input.capabilityId,
    targetCommitmentIds,
    status,
    failureClass: status === "succeeded" ? null : failureClass,
    errorPath: status === "succeeded" ? null : errorPath,
    errorSummary: status === "succeeded" ? null : errorSummary,
    blockerSummary:
      status === "succeeded"
        ? null
        : (errorSummary ??
          bounded(metadata.blockerSummary, 700) ??
          bounded(metadata.nodeReadinessBlockerSummary, 700) ??
          reasonCodes.find((code) => code.includes("blocked") || code.includes("missing")) ??
          null),
    repairAction: status === "succeeded" ? null : repairAction,
    nextTransition: nextTransitionForStatus(status),
    evidenceRefs: [...new Set(evidenceRefs)].slice(0, 80),
    readinessStateRef,
    reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
  });
}
