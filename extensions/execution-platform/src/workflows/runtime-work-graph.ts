import { createHash } from "node:crypto";
import type { JsonValue } from "../runtime-job-repository.ts";

export const TEAM_GRAPH_NODE_KINDS = [
  "orchestrator_plan",
  "context_scout",
  "implementation",
  "validation",
  "test_review",
  "test_authoring",
  "repair",
  "reviewer",
  "security_review",
  "web_research",
  "docs_update",
  "architecture_spec",
  "planning_capsule",
  "action_graph_compile",
  "observability_readback",
  "human_task",
  "compiler",
  "closeout",
] as const;

export type TeamGraphNodeKind = (typeof TEAM_GRAPH_NODE_KINDS)[number];

export const TEAM_GRAPH_EDGE_KINDS = [
  "depends_on",
  "handoff",
  "validation_failed",
  "repair_requested",
  "escalation",
  "human_wait",
  "human_resume",
  "continuation",
  "closeout_source",
] as const;

export type TeamGraphEdgeKind = (typeof TEAM_GRAPH_EDGE_KINDS)[number];

export const TEAM_RUN_GRAPH_STATUSES = [
  "planned",
  "running",
  "waiting_for_human",
  "needs_review",
  "succeeded",
  "failed",
  "canceled",
] as const;

export type TeamRunGraphStatus = (typeof TEAM_RUN_GRAPH_STATUSES)[number];

export const TEAM_GRAPH_NODE_STATUSES = [
  "planned",
  "running",
  "waiting_for_human",
  "needs_review",
  "succeeded",
  "failed",
  "skipped",
] as const;

export type TeamGraphNodeStatus = (typeof TEAM_GRAPH_NODE_STATUSES)[number];

export const HUMAN_TASK_STATUSES = [
  "waiting",
  "resumed",
  "expired",
  "needs_review",
  "canceled",
] as const;

export type HumanTaskStatus = (typeof HUMAN_TASK_STATUSES)[number];

export type BoundedStorageFlags = {
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored?: false;
  rawProviderLogStored?: false;
  rawContentStored?: false;
  workQueueLifecycleMutated?: false;
};

export type TeamRunGraph = BoundedStorageFlags & {
  graphId: string;
  parentWorkItemId: string | null;
  rootRuntimeJobId: string | null;
  workflowId: string;
  orchestratorModelRef: string;
  graphStatus: TeamRunGraphStatus;
  budgetLedgerRef: string | null;
  checkpointRefs: string[];
  finalCloseoutRef: string | null;
  metadata: JsonValue;
  rawLogsStored: false;
  workQueueLifecycleMutated: false;
  createdAt: Date;
  updatedAt: Date;
};

export type TeamGraphNode = BoundedStorageFlags & {
  nodeId: string;
  graphId: string;
  nodeKind: TeamGraphNodeKind;
  assignedRole: string;
  modelOrWorkerRef: string | null;
  runtimeJobId: string | null;
  humanTaskId: string | null;
  inputHandoffRefs: string[];
  outputArtifactRefs: string[];
  nodeStatus: TeamGraphNodeStatus;
  budgetUsage: JsonValue;
  metadata: JsonValue;
  rawLogsStored: false;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type TeamGraphEdge = {
  edgeId: string;
  graphId: string;
  fromNodeId: string | null;
  toNodeId: string | null;
  edgeKind: TeamGraphEdgeKind;
  reasonCodes: string[];
  artifactRefs: string[];
  metadata: JsonValue;
  createdAt: Date;
};

export type RoleInvocation = BoundedStorageFlags & {
  invocationId: string;
  graphId: string;
  nodeId: string | null;
  roleId: string;
  modelRef: string | null;
  workerRef: string | null;
  providerPath: string;
  transportKind: string;
  modelRunRef: string | null;
  artifactRefs: string[];
  outputHash: string;
  latencyMs: number;
  budgetUsage: JsonValue;
  rawProviderLogStored: false;
  createdAt: Date;
};

export type HandoffPacket = BoundedStorageFlags & {
  handoffId: string;
  graphId: string;
  fromNodeId: string | null;
  toNodeId: string | null;
  summary: string;
  artifactRefs: string[];
  validationRefs: string[];
  decisionRefs: string[];
  unresolvedQuestions: string[];
  limitations: string[];
  contextPackRefs: string[];
  rawLogsStored: false;
  createdAt: Date;
};

export type ArtifactManifest = BoundedStorageFlags & {
  manifestId: string;
  graphId: string;
  nodeId: string | null;
  artifactType: string;
  storageRef: string;
  contentHash: string;
  byteCount: number;
  boundedSummary: string;
  partNumber: number;
  metadata: JsonValue;
  rawContentStored: false;
  createdAt: Date;
};

export type BudgetLedger = {
  ledgerId: string;
  graphId: string;
  scopeKind: "graph" | "node" | "role_invocation" | "bridge_call";
  scopeRef: string;
  wallTimeMs: number;
  leaseRenewalCount: number;
  modelTimeoutMs: number | null;
  maxOutputTokens: number | null;
  retryCount: number;
  continuationCount: number;
  validationRepairCount: number;
  metadata: JsonValue;
  createdAt: Date;
  updatedAt: Date;
};

export type GraphCheckpoint = BoundedStorageFlags & {
  checkpointId: string;
  graphId: string;
  checkpointKind: string;
  stateSummary: string;
  artifactRefs: string[];
  budgetLedgerRef: string | null;
  rawLogsStored: false;
  createdAt: Date;
};

export type HumanTaskInvocation = BoundedStorageFlags & {
  humanTaskId: string;
  graphId: string;
  nodeId: string | null;
  operatorId: string;
  promptSummary: string;
  requiredResponseShape: JsonValue;
  deadlineAt: Date | null;
  blockingNodeRefs: string[];
  resumeTokenHash: string;
  boundedResponseRef: string | null;
  decisionRefs: string[];
  taskStatus: HumanTaskStatus;
  rawLogsStored: false;
  createdAt: Date;
  updatedAt: Date;
};

export type FinalCloseoutRef = {
  graphId: string;
  closeoutRef: string;
  closeoutHash: string;
  humanReportRef: string;
  structuredSummaryRef: string;
  opportunitySeedRefs: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
};

const RAW_KEY_PATTERN =
  /(raw(prompt|response|transcript|provider|tool|command|db|log|logs)|secret|hiddenReasoning|rawContent)/iu;
const DEFAULT_STRING_BOUND = 1_200;
const DEFAULT_ARRAY_BOUND = 24;

export function sha256RuntimeWorkGraphText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function boundedRuntimeWorkGraphString(value: string, max = DEFAULT_STRING_BOUND): string {
  return value.trim().slice(0, max);
}

export function assertRuntimeWorkGraphNoRawStorage(value: unknown, path = "input"): void {
  if (value === null || value === undefined) {
    return;
  }
  if (typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertRuntimeWorkGraphNoRawStorage(item, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (RAW_KEY_PATTERN.test(key)) {
      if (child !== false && child !== null && child !== undefined) {
        throw new Error(`raw storage field is not allowed at ${path}.${key}`);
      }
    }
    assertRuntimeWorkGraphNoRawStorage(child, `${path}.${key}`);
  }
}

export function assertBoundedStringArray(
  values: string[],
  name: string,
  maxItems = DEFAULT_ARRAY_BOUND,
  maxStringLength = DEFAULT_STRING_BOUND,
): void {
  if (values.length > maxItems) {
    throw new Error(`${name} exceeds ${maxItems} items`);
  }
  for (const value of values) {
    if (typeof value !== "string" || value.length > maxStringLength) {
      throw new Error(`${name} contains an invalid bounded string`);
    }
  }
}

export function assertJsonByteLimit(value: JsonValue, name: string, maxBytes = 64 * 1024): void {
  const bytes = Buffer.byteLength(JSON.stringify(value), "utf8");
  if (bytes > maxBytes) {
    throw new Error(`${name} exceeds ${maxBytes} bytes`);
  }
  assertRuntimeWorkGraphNoRawStorage(value, name);
}

export function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

export function graphRef(kind: string, id: string): string {
  return `runtime-work-graph://${kind}/${id}`;
}
