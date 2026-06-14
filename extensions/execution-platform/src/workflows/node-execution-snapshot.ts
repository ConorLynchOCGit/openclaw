import { createHash } from "node:crypto";
import type { RuntimeWorkGraphSnapshot } from "./runtime-work-graph-repository.ts";
import { graphRef, type TeamGraphNode } from "./runtime-work-graph.ts";

export const NODE_EXECUTION_SNAPSHOT_ARTIFACT_TYPE =
  "execution_platform.node_execution_snapshot" as const;
export const NODE_EXECUTION_SNAPSHOT_SCHEMA_VERSION =
  "execution-platform.node-execution-snapshot.v1" as const;
export const DEFAULT_EXECUTION_AGENT_ID = "execution-coding" as const;
export const NODE_EXECUTION_ARTIFACT_POLICY_REF =
  "artifact-policy://execution-platform/native-node-execution-bounded-refs-v1" as const;
export const NODE_EXECUTION_RAW_STORAGE_POLICY_REF =
  "raw-storage-policy://execution-platform/no-raw-agent-material-v1" as const;

export const NODE_EXECUTION_RAW_STORAGE_POLICY = {
  rawPromptStored: false,
  rawResponseStored: false,
  rawTranscriptStored: false,
  rawProviderLogStored: false,
  rawToolLogStored: false,
  rawCommandLogStored: false,
  rawDbRowsStored: false,
  hiddenReasoningStored: false,
  secretsStored: false,
} as const;

export const NODE_EXECUTION_STORAGE_POLICY = {
  artifactPolicyRef: NODE_EXECUTION_ARTIFACT_POLICY_REF,
  rawStoragePolicyRef: NODE_EXECUTION_RAW_STORAGE_POLICY_REF,
  boundedRefsOnly: true,
  rawStoragePolicy: NODE_EXECUTION_RAW_STORAGE_POLICY,
} as const;

export type NodeExecutionStoragePolicy = typeof NODE_EXECUTION_STORAGE_POLICY;

export type NodeExecutionSnapshot = {
  artifactKind: typeof NODE_EXECUTION_SNAPSHOT_ARTIFACT_TYPE;
  schemaVersion: typeof NODE_EXECUTION_SNAPSHOT_SCHEMA_VERSION;
  snapshotRef: string;
  nodeRunId: string;
  runtimeJobId: string;
  workflowId: string;
  graphId: string;
  nodeId: string;
  nodeKind: TeamGraphNode["nodeKind"];
  assignedRole: string;
  attemptId: string;
  agentId: string;
  sessionKey: string;
  capabilityId: string | null;
  executionIntent: string | null;
  objective: string | null;
  expectedOutput: string | null;
  evidenceExpectation: string | null;
  acceptanceCriteria: string[];
  taskRefs: string[];
  requirementRefs: string[];
  sourcePromptRefs: string[];
  authorityRefs: {
    readableRepoRefs: string[];
    writableRepoRefs: string[];
    promptSourceRefs: string[];
    validationCommandRefs: string[];
    deniedRefs: string[];
    sandboxPolicyRef: string | null;
  };
  evidenceContractRef: string | null;
  validationPolicyRef: string | null;
  storagePolicy: NodeExecutionStoragePolicy;
  replayMetadata: {
    graphSnapshotRef: string;
    nodeRef: string;
    attemptRef: string;
    source: "node_lifecycle_runner";
  };
};

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalizeIdSegment(value: string | null | undefined, fallback: string): string {
  const normalized = value
    ?.trim()
    .replace(/[^a-zA-Z0-9_.:-]/gu, "-")
    .slice(0, 120);
  return normalized || fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstString(record: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function stringArray(value: unknown, max = 80): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !item.trim()) {
      continue;
    }
    const normalized = item.trim();
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= max) {
      break;
    }
  }
  return result;
}

function firstStringArray(
  record: Record<string, unknown>,
  keys: readonly string[],
  max = 80,
): string[] {
  for (const key of keys) {
    const values = stringArray(record[key], max);
    if (values.length > 0) {
      return values;
    }
  }
  return [];
}

export function allocateStableNodeRunId(input: {
  runtimeJobId: string;
  graphId: string;
  nodeId: string;
  attemptId: string;
}): string {
  return `nrun_${stableHash(input).slice(0, 20)}`;
}

export function buildNodeAgentSessionKey(input: { agentId: string; nodeRunId: string }): string {
  return `agent:${normalizeIdSegment(input.agentId, DEFAULT_EXECUTION_AGENT_ID)}:node:${normalizeIdSegment(
    input.nodeRunId,
    "unknown-node-run",
  )}`;
}

export function resolveNodeExecutionAgentId(input: { node: TeamGraphNode }): string {
  const metadata = asRecord(input.node.metadata);
  return (
    firstString(metadata, [
      "openClawAgentId",
      "executionAgentId",
      "agentId",
      "nodeAgentId",
      "resolvedAgentId",
    ]) ?? DEFAULT_EXECUTION_AGENT_ID
  );
}

export function buildNodeExecutionSnapshotFromGraphNode(input: {
  snapshot: RuntimeWorkGraphSnapshot;
  graphId: string;
  node: TeamGraphNode;
  attemptId: string;
  nodeRunId?: string;
  agentId?: string;
}): NodeExecutionSnapshot {
  const metadata = asRecord(input.node.metadata);
  const runtimeJobId =
    input.node.runtimeJobId ??
    input.snapshot.graph.rootRuntimeJobId ??
    firstString(metadata, ["runtimeJobId"]) ??
    "unknown-runtime-job";
  const agentId = input.agentId ?? resolveNodeExecutionAgentId({ node: input.node });
  const nodeRunId =
    input.nodeRunId ??
    allocateStableNodeRunId({
      runtimeJobId,
      graphId: input.graphId,
      nodeId: input.node.nodeId,
      attemptId: input.attemptId,
    });
  const sessionKey = buildNodeAgentSessionKey({ agentId, nodeRunId });
  const snapshotRef = graphRef("node-execution-snapshot", `${input.node.nodeId}-${nodeRunId}`);
  const requirementRefs = firstStringArray(
    metadata,
    [
      "requirementRefs",
      "coveredRequirementRefs",
      "sourceRequirementRefs",
      "targetRequirementRefs",
      "targetCommitmentIds",
      "coveredRequirementIds",
    ],
    120,
  );
  const sourcePromptRefs = [
    ...new Set([
      ...firstStringArray(metadata, ["sourcePromptRefs"], 120),
      ...firstStringArray(metadata, ["sourcePromptExcerptRefs"], 120),
      ...firstStringArray(metadata, ["sourceContextRefs"], 120),
      ...firstStringArray(metadata, ["sourceRefs"], 120),
      ...input.node.inputHandoffRefs.filter((ref) => ref.startsWith("source-prompt")),
    ]),
  ];
  const readableRepoRefs = firstStringArray(
    metadata,
    ["readableRepoRefs", "authorityScopeRefs", "allowedFileRefs", "allowedReadScope"],
    120,
  );
  const writableRepoRefs = firstStringArray(
    metadata,
    ["writableRepoRefs", "allowedEditScope", "allowedFileRefs"],
    120,
  );
  const validationCommandRefs = firstStringArray(metadata, ["validationCommandRefs"], 40);
  return {
    artifactKind: NODE_EXECUTION_SNAPSHOT_ARTIFACT_TYPE,
    schemaVersion: NODE_EXECUTION_SNAPSHOT_SCHEMA_VERSION,
    snapshotRef,
    nodeRunId,
    runtimeJobId,
    workflowId: input.snapshot.graph.workflowId,
    graphId: input.graphId,
    nodeId: input.node.nodeId,
    nodeKind: input.node.nodeKind,
    assignedRole: input.node.assignedRole,
    attemptId: input.attemptId,
    agentId,
    sessionKey,
    capabilityId: firstString(metadata, ["capabilityId", "selectedCapabilityId"]),
    executionIntent: firstString(metadata, ["executionIntent", "downstreamExecutionIntent"]),
    objective: firstString(metadata, ["exactObjective", "objective", "nodeObjective"]),
    expectedOutput: firstString(metadata, ["expectedOutput", "expectedResult"]),
    evidenceExpectation: firstString(metadata, ["evidenceExpectation", "expectedEvidence"]),
    acceptanceCriteria: firstStringArray(metadata, ["acceptanceCriteria"], 80),
    taskRefs: [
      ...new Set([
        graphRef("node", input.node.nodeId),
        ...input.node.inputHandoffRefs,
        ...firstStringArray(metadata, ["taskRefs", "contextPacketRefs"], 120),
      ]),
    ].slice(0, 160),
    requirementRefs,
    sourcePromptRefs,
    authorityRefs: {
      readableRepoRefs,
      writableRepoRefs,
      promptSourceRefs: sourcePromptRefs,
      validationCommandRefs,
      deniedRefs: firstStringArray(metadata, ["deniedRefs", "deniedAuthorityRefs"], 80),
      sandboxPolicyRef: firstString(metadata, ["sandboxPolicyRef"]),
    },
    evidenceContractRef: firstString(metadata, ["evidenceContractRef", "evidenceProfileRef"]),
    validationPolicyRef: firstString(metadata, ["validationPolicyRef", "validationContractRef"]),
    storagePolicy: NODE_EXECUTION_STORAGE_POLICY,
    replayMetadata: {
      graphSnapshotRef: graphRef("graph", input.graphId),
      nodeRef: graphRef("node", input.node.nodeId),
      attemptRef: graphRef("node-attempt", `${input.node.nodeId}-${input.attemptId}`),
      source: "node_lifecycle_runner",
    },
  };
}
