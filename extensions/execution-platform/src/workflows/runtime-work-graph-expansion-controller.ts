import { createHash } from "node:crypto";
import { z } from "zod";
import type { JsonValue } from "../runtime-job-repository.ts";
import type {
  OrchestratorGraphDecision,
  OrchestratorGraphNodeSpec,
} from "./orchestrator-graph-decision.ts";
import type { RuntimeWorkGraphSchedulerSnapshotSummary } from "./runtime-work-graph-scheduler-contracts.ts";

export const DEFAULT_EXPANSION_ADMISSION_POLICY = {
  policyRef: "runtime-work-graph.expansion-admission.v1",
  maxNewNodesPerIteration: 24,
  maxNewEdgesPerIteration: 48,
  maxAbsoluteNewNodesPerIteration: 160,
  maxAbsoluteNewEdgesPerIteration: 240,
  maxReadyFrontierDeferralNodeCount: 1,
  maxPendingContextRequests: 32,
  maxActiveImplementationOrResourceBranches: 24,
  maxGraphPatchBytes: 512 * 1024,
} as const;

export type RuntimeWorkGraphExpansionAdmissionPolicy = {
  policyRef: string;
  maxNewNodesPerIteration: number;
  maxNewEdgesPerIteration: number;
  maxAbsoluteNewNodesPerIteration: number;
  maxAbsoluteNewEdgesPerIteration: number;
  maxReadyFrontierDeferralNodeCount: number;
  maxPendingContextRequests: number;
  maxActiveImplementationOrResourceBranches: number;
  maxGraphPatchBytes: number;
};

export const ExpansionAdmissionStatusSchema = z.enum([
  "accepted",
  "accepted_paged",
  "deferred_due_to_ready_frontier",
  "rejected_budget_exceeded",
  "halt_no_progress",
  "needs_review",
]);

export type ExpansionAdmissionStatus = z.infer<typeof ExpansionAdmissionStatusSchema>;

const stringList = (maxItems: number, maxChars = 260) =>
  z.array(z.string().trim().min(1).max(maxChars)).max(maxItems).default([]);

export const ExpansionAdmissionDecisionSchema = z
  .object({
    artifactKind: z.literal("runtime_work_graph_expansion_admission_decision"),
    schemaVersion: z.literal("execution-platform.expansion-admission-decision.v1"),
    decisionRef: z.string().trim().min(1).max(320),
    policyRef: z.string().trim().min(1).max(220),
    graphId: z.string().trim().min(1).max(180),
    iteration: z.number().int().min(0),
    sourceDecisionId: z.string().trim().max(180).nullable().default(null),
    status: ExpansionAdmissionStatusSchema,
    originalNodeCount: z.number().int().min(0).max(10_000),
    originalEdgeCount: z.number().int().min(0).max(10_000),
    admittedNodeCount: z.number().int().min(0).max(10_000),
    admittedEdgeCount: z.number().int().min(0).max(10_000),
    deferredNodeCount: z.number().int().min(0).max(10_000),
    deferredEdgeCount: z.number().int().min(0).max(10_000),
    readyFrontierNodeIds: stringList(80),
    admittedNodeIds: stringList(80),
    admittedEdgeIds: stringList(80),
    deferredNodeIds: stringList(80),
    deferredEdgeIds: stringList(80),
    pendingContextRequestRefs: stringList(80, 320),
    activeImplementationOrResourceNodeIds: stringList(80),
    prerequisiteCritical: z.boolean(),
    nextTransition: z.enum([
      "persist_admitted_page",
      "run_ready_frontier",
      "needs_review",
      "halt_no_progress",
      "continue",
    ]),
    reasonCodes: stringList(120, 220),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
    rawCommandLogStored: z.literal(false),
    rawDbRowsStored: z.literal(false),
    secretsStored: z.literal(false),
  })
  .strict();

export type ExpansionAdmissionDecision = z.infer<typeof ExpansionAdmissionDecisionSchema>;

export type ExpansionAdmissionResult = {
  decision: ExpansionAdmissionDecision;
  admittedNodes: OrchestratorGraphNodeSpec[];
  admittedEdges: NonNullable<OrchestratorGraphDecision["newEdges"]>;
  deferredNodes: OrchestratorGraphNodeSpec[];
  deferredEdges: NonNullable<OrchestratorGraphDecision["newEdges"]>;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
};

function hashValue(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function bounded(value: string | null | undefined, max = 260): string {
  const normalized = (value ?? "").trim().replace(/\s+/gu, " ");
  return normalized.length <= max
    ? normalized
    : `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}...`;
}

function unique(values: Array<string | null | undefined>, max = 80, maxChars = 260): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = bounded(value, maxChars);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(normalized);
    if (output.length >= max) {
      break;
    }
  }
  return output;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringArray(value: unknown, max = 80): string[] {
  return Array.isArray(value)
    ? unique(
        value.filter((entry): entry is string => typeof entry === "string"),
        max,
      )
    : [];
}

function mergePolicy(
  override?: Partial<RuntimeWorkGraphExpansionAdmissionPolicy> | null,
): RuntimeWorkGraphExpansionAdmissionPolicy {
  const merged = {
    ...DEFAULT_EXPANSION_ADMISSION_POLICY,
    ...override,
  };
  return {
    ...merged,
    policyRef: merged.policyRef.trim() || DEFAULT_EXPANSION_ADMISSION_POLICY.policyRef,
    maxNewNodesPerIteration: Math.max(1, Math.trunc(merged.maxNewNodesPerIteration)),
    maxNewEdgesPerIteration: Math.max(0, Math.trunc(merged.maxNewEdgesPerIteration)),
    maxAbsoluteNewNodesPerIteration: Math.max(
      1,
      Math.trunc(merged.maxAbsoluteNewNodesPerIteration),
    ),
    maxAbsoluteNewEdgesPerIteration: Math.max(
      0,
      Math.trunc(merged.maxAbsoluteNewEdgesPerIteration),
    ),
    maxReadyFrontierDeferralNodeCount: Math.max(
      1,
      Math.trunc(merged.maxReadyFrontierDeferralNodeCount),
    ),
    maxPendingContextRequests: Math.max(0, Math.trunc(merged.maxPendingContextRequests)),
    maxActiveImplementationOrResourceBranches: Math.max(
      0,
      Math.trunc(merged.maxActiveImplementationOrResourceBranches),
    ),
    maxGraphPatchBytes: Math.max(1024, Math.trunc(merged.maxGraphPatchBytes)),
  };
}

function decisionIsPrerequisiteCritical(decision: OrchestratorGraphDecision): boolean {
  if (decision.decisionKind === "request_context") {
    return true;
  }
  if (
    (decision.newEdges ?? []).some((edge) =>
      ["context_supplies", "repair_requested", "validation_failed"].includes(edge.edgeKind),
    )
  ) {
    return true;
  }
  const metadata = asRecord(decision.metadata);
  if (
    metadata.prerequisiteCritical === true ||
    metadata.runtimePrerequisiteCritical === true ||
    metadata.expansionRequiredByReadyFrontier === true
  ) {
    return true;
  }
  const nodes = decision.newNodes ?? [];
  return nodes.some((node) => {
    const nodeMetadata = asRecord(node.metadata);
    return (
      node.nodeKind === "context_scout" &&
      (nodeMetadata.targetNodeId ||
        nodeMetadata.consumerNodeId ||
        stringArray(nodeMetadata.targetNodeIds, 4).length > 0 ||
        stringArray(nodeMetadata.consumerNodeIds, 4).length > 0)
    );
  });
}

function edgeId(
  edge: NonNullable<OrchestratorGraphDecision["newEdges"]>[number],
  index: number,
): string {
  return bounded(edge.edgeId ?? `edge-${index + 1}`, 180);
}

function isEdgeAdmitted(input: {
  edge: NonNullable<OrchestratorGraphDecision["newEdges"]>[number];
  admittedNodeIds: Set<string>;
  existingNodeIds: Set<string>;
}): boolean {
  const fromOk =
    !input.edge.fromNodeId ||
    input.admittedNodeIds.has(input.edge.fromNodeId) ||
    input.existingNodeIds.has(input.edge.fromNodeId);
  const toOk =
    !input.edge.toNodeId ||
    input.admittedNodeIds.has(input.edge.toNodeId) ||
    input.existingNodeIds.has(input.edge.toNodeId);
  return fromOk && toOk;
}

export function evaluateRuntimeWorkGraphExpansionAdmission(input: {
  graphId: string;
  iteration: number;
  decision: OrchestratorGraphDecision;
  snapshotSummary: RuntimeWorkGraphSchedulerSnapshotSummary;
  readyFrontierNodeIds?: string[];
  pendingContextRequestRefs?: string[];
  activeImplementationOrResourceNodeIds?: string[];
  policy?: Partial<RuntimeWorkGraphExpansionAdmissionPolicy> | null;
}): ExpansionAdmissionResult {
  const policy = mergePolicy(input.policy);
  const newNodes = input.decision.newNodes ?? [];
  const newEdges = input.decision.newEdges ?? [];
  const readyFrontierNodeIds = unique(input.readyFrontierNodeIds ?? [], 80);
  const pendingContextRequestRefs = unique(input.pendingContextRequestRefs ?? [], 80, 320);
  const activeImplementationOrResourceNodeIds = unique(
    input.activeImplementationOrResourceNodeIds ?? [],
    80,
  );
  const prerequisiteCritical = decisionIsPrerequisiteCritical(input.decision);
  const existingNodeIds = new Set(input.snapshotSummary.nodeSummaries.map((node) => node.nodeId));
  const expansionCreatesNovelNodes = newNodes.some((node) => !existingNodeIds.has(node.nodeId));
  const reasonCodes = [
    "expansion_admission_evaluated",
    `expansion_original_node_count:${newNodes.length}`,
    `expansion_original_edge_count:${newEdges.length}`,
  ];

  let status: ExpansionAdmissionStatus = "accepted";
  let nextTransition: ExpansionAdmissionDecision["nextTransition"] = "persist_admitted_page";
  let admittedNodes = newNodes;
  let admittedEdges = newEdges;
  let deferredNodes: OrchestratorGraphNodeSpec[] = [];
  let deferredEdges: NonNullable<OrchestratorGraphDecision["newEdges"]> = [];

  if (
    newNodes.length > policy.maxAbsoluteNewNodesPerIteration ||
    newEdges.length > policy.maxAbsoluteNewEdgesPerIteration ||
    pendingContextRequestRefs.length > policy.maxPendingContextRequests ||
    activeImplementationOrResourceNodeIds.length > policy.maxActiveImplementationOrResourceBranches
  ) {
    status = "rejected_budget_exceeded";
    nextTransition = "needs_review";
    admittedNodes = [];
    admittedEdges = [];
    deferredNodes = newNodes;
    deferredEdges = newEdges;
    reasonCodes.push(
      "expansion_absolute_budget_exceeded",
      ...(newNodes.length > policy.maxAbsoluteNewNodesPerIteration
        ? ["expansion_absolute_node_budget_exceeded"]
        : []),
      ...(newEdges.length > policy.maxAbsoluteNewEdgesPerIteration
        ? ["expansion_absolute_edge_budget_exceeded"]
        : []),
      ...(pendingContextRequestRefs.length > policy.maxPendingContextRequests
        ? ["expansion_pending_context_request_budget_exceeded"]
        : []),
      ...(activeImplementationOrResourceNodeIds.length >
      policy.maxActiveImplementationOrResourceBranches
        ? ["expansion_active_branch_budget_exceeded"]
        : []),
    );
  } else if (
    readyFrontierNodeIds.length >= policy.maxReadyFrontierDeferralNodeCount &&
    !prerequisiteCritical &&
    newNodes.length > 0 &&
    expansionCreatesNovelNodes
  ) {
    status = "deferred_due_to_ready_frontier";
    nextTransition = "run_ready_frontier";
    admittedNodes = [];
    admittedEdges = [];
    deferredNodes = newNodes;
    deferredEdges = newEdges;
    reasonCodes.push("expansion_deferred_ready_frontier_exists");
  } else if (
    newNodes.length > policy.maxNewNodesPerIteration ||
    newEdges.length > policy.maxNewEdgesPerIteration
  ) {
    status = "accepted_paged";
    admittedNodes = newNodes.slice(0, policy.maxNewNodesPerIteration);
    deferredNodes = newNodes.slice(policy.maxNewNodesPerIteration);
    const existingNodeIds = new Set(input.snapshotSummary.nodeSummaries.map((node) => node.nodeId));
    const admittedNodeIds = new Set(admittedNodes.map((node) => node.nodeId));
    const edgeBuckets = newEdges.reduce(
      (buckets, edge, index) => {
        const target = isEdgeAdmitted({ edge, admittedNodeIds, existingNodeIds })
          ? buckets.admitted
          : buckets.deferred;
        target.push({ edge, index });
        return buckets;
      },
      { admitted: [], deferred: [] } as {
        admitted: Array<{
          edge: NonNullable<OrchestratorGraphDecision["newEdges"]>[number];
          index: number;
        }>;
        deferred: Array<{
          edge: NonNullable<OrchestratorGraphDecision["newEdges"]>[number];
          index: number;
        }>;
      },
    );
    admittedEdges = edgeBuckets.admitted
      .slice(0, policy.maxNewEdgesPerIteration)
      .map((entry) => entry.edge);
    deferredEdges = [
      ...edgeBuckets.admitted.slice(policy.maxNewEdgesPerIteration).map((entry) => entry.edge),
      ...edgeBuckets.deferred.map((entry) => entry.edge),
    ];
    nextTransition = "persist_admitted_page";
    reasonCodes.push(
      "expansion_accepted_paged",
      `expansion_admitted_node_count:${admittedNodes.length}`,
      `expansion_deferred_node_count:${deferredNodes.length}`,
    );
  }

  const decisionRef = `runtime-work-graph://expansion-admission/${bounded(
    input.graphId,
    120,
  )}/${input.iteration}/${hashValue({
    decisionId: input.decision.decisionId,
    status,
    admittedNodeIds: admittedNodes.map((node) => node.nodeId),
    deferredNodeIds: deferredNodes.map((node) => node.nodeId),
  }).slice(0, 18)}`;

  if (status === "accepted") {
    reasonCodes.push("expansion_accepted_within_budget");
  }

  const decision = ExpansionAdmissionDecisionSchema.parse({
    artifactKind: "runtime_work_graph_expansion_admission_decision",
    schemaVersion: "execution-platform.expansion-admission-decision.v1",
    decisionRef,
    policyRef: policy.policyRef,
    graphId: input.graphId,
    iteration: input.iteration,
    sourceDecisionId: input.decision.decisionId || null,
    status,
    originalNodeCount: newNodes.length,
    originalEdgeCount: newEdges.length,
    admittedNodeCount: admittedNodes.length,
    admittedEdgeCount: admittedEdges.length,
    deferredNodeCount: deferredNodes.length,
    deferredEdgeCount: deferredEdges.length,
    readyFrontierNodeIds,
    admittedNodeIds: unique(
      admittedNodes.map((node) => node.nodeId),
      80,
    ),
    admittedEdgeIds: unique(
      admittedEdges.map((edge, index) => edgeId(edge, index)),
      80,
    ),
    deferredNodeIds: unique(
      deferredNodes.map((node) => node.nodeId),
      80,
    ),
    deferredEdgeIds: unique(
      deferredEdges.map((edge, index) => edgeId(edge, index)),
      80,
    ),
    pendingContextRequestRefs,
    activeImplementationOrResourceNodeIds,
    prerequisiteCritical,
    nextTransition,
    reasonCodes: unique(reasonCodes, 120, 220),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
  });

  return {
    decision,
    admittedNodes,
    admittedEdges,
    deferredNodes,
    deferredEdges,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

export function summarizeExpansionAdmissionDecision(
  decision: ExpansionAdmissionDecision,
): JsonValue {
  return {
    expansionAdmissionDecisionRef: decision.decisionRef,
    expansionAdmissionPolicyRef: decision.policyRef,
    expansionAdmissionStatus: decision.status,
    expansionAdmissionOriginalNodeCount: decision.originalNodeCount,
    expansionAdmissionOriginalEdgeCount: decision.originalEdgeCount,
    expansionAdmissionAdmittedNodeCount: decision.admittedNodeCount,
    expansionAdmissionAdmittedEdgeCount: decision.admittedEdgeCount,
    expansionAdmissionDeferredNodeCount: decision.deferredNodeCount,
    expansionAdmissionDeferredEdgeCount: decision.deferredEdgeCount,
    expansionAdmissionReadyFrontierNodeIds: decision.readyFrontierNodeIds.slice(0, 40),
    expansionAdmissionAdmittedNodeIds: decision.admittedNodeIds.slice(0, 40),
    expansionAdmissionDeferredNodeIds: decision.deferredNodeIds.slice(0, 40),
    expansionAdmissionNextTransition: decision.nextTransition,
    expansionAdmissionPrerequisiteCritical: decision.prerequisiteCritical,
    expansionAdmissionReasonCodes: decision.reasonCodes.slice(0, 40),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  } satisfies JsonValue;
}

export function expansionAdmissionPolicyFromJson(
  value: JsonValue | null | undefined,
): Partial<RuntimeWorkGraphExpansionAdmissionPolicy> | null {
  const record = asRecord(value);
  if (!record || Object.keys(record).length === 0) {
    return null;
  }
  const numberField = (key: keyof RuntimeWorkGraphExpansionAdmissionPolicy): number | undefined =>
    typeof record[key] === "number" && Number.isFinite(record[key])
      ? Math.max(0, Math.trunc(record[key]))
      : undefined;
  return {
    policyRef: typeof record.policyRef === "string" ? record.policyRef : undefined,
    maxNewNodesPerIteration: numberField("maxNewNodesPerIteration"),
    maxNewEdgesPerIteration: numberField("maxNewEdgesPerIteration"),
    maxAbsoluteNewNodesPerIteration: numberField("maxAbsoluteNewNodesPerIteration"),
    maxAbsoluteNewEdgesPerIteration: numberField("maxAbsoluteNewEdgesPerIteration"),
    maxReadyFrontierDeferralNodeCount: numberField("maxReadyFrontierDeferralNodeCount"),
    maxPendingContextRequests: numberField("maxPendingContextRequests"),
    maxActiveImplementationOrResourceBranches: numberField(
      "maxActiveImplementationOrResourceBranches",
    ),
    maxGraphPatchBytes: numberField("maxGraphPatchBytes"),
  };
}
