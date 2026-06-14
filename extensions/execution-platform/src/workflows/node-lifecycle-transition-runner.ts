import { createHash } from "node:crypto";
import {
  buildNodeExecutionSnapshotFromGraphNode,
  NODE_EXECUTION_SNAPSHOT_ARTIFACT_TYPE,
  resolveNodeExecutionAgentId,
  type NodeExecutionSnapshot,
} from "./node-execution-snapshot.ts";
import {
  isNodeLifecycleGate,
  legalTransitionsForLifecycleGate,
  lifecycleDescriptorForGate,
  NODE_LIFECYCLE_DESCRIPTOR_BY_GATE,
  NODE_LIFECYCLE_DESCRIPTOR_TOOL_IDS,
  NODE_LIFECYCLE_GATE_TRANSITIONS,
  NODE_LIFECYCLE_GATES,
  NODE_LIFECYCLE_TRANSITION_DESCRIPTORS,
  validateLifecycleDescriptorToolRegistration,
  type NodeLifecycleGate,
  type NodeLifecycleTransitionDescriptor,
} from "./node-lifecycle-transition-descriptors.ts";
import {
  findRuntimeNodeCapability,
  type RuntimeNodeCapabilityManifest,
} from "./runtime-node-capability-registry.ts";
import type { RuntimeWorkGraphSnapshot } from "./runtime-work-graph-repository.ts";
import { graphRef, type TeamGraphNode, type TeamGraphNodeStatus } from "./runtime-work-graph.ts";

export {
  legalTransitionsForLifecycleGate,
  lifecycleDescriptorForGate,
  NODE_LIFECYCLE_DESCRIPTOR_BY_GATE,
  NODE_LIFECYCLE_DESCRIPTOR_TOOL_IDS,
  NODE_LIFECYCLE_GATE_TRANSITIONS,
  NODE_LIFECYCLE_GATES,
  NODE_LIFECYCLE_TRANSITION_DESCRIPTORS,
  validateLifecycleDescriptorToolRegistration,
  type NodeLifecycleGate,
  type NodeLifecycleTransitionDescriptor,
};

export const NODE_LIFECYCLE_PROJECTION_ARTIFACT_TYPE =
  "execution_platform.node_lifecycle_projection" as const;

export const NODE_LIFECYCLE_PROJECTION_SCHEMA_VERSION =
  "execution-platform.node-lifecycle-projection.v1" as const;

const HARD_TERMINAL_NODE_STATUSES = new Set<TeamGraphNodeStatus>(["succeeded", "failed"]);

const LOCAL_LIFECYCLE_GATES = new Set<string>(NODE_LIFECYCLE_GATES);

export type NodeLifecycleRootCauseSignature = {
  signatureRef: string;
  signatureHash: string;
  stage: string;
  nodeKind: string;
  capabilityId: string | null;
  currentGate: string;
  missingFields: string[];
  reasonCodes: string[];
  contractVersion: string | null;
  transitionProfileRef: string | null;
};

export type NodeLifecycleProjection = {
  artifactKind: "execution_platform.node_lifecycle_projection";
  schemaVersion: typeof NODE_LIFECYCLE_PROJECTION_SCHEMA_VERSION;
  projectionRef: string;
  projectionHash: string;
  runtimeJobId: string;
  workflowId: string;
  graphId: string;
  nodeId: string;
  branchId: string | null;
  capabilityId: string | null;
  lifecycleTransitionProfileRef: string | null;
  currentLifecycleState: string;
  currentGate: string;
  nodeStatus: string;
  executionIntent: string | null;
  evidenceMode: string[];
  nextLegalTransitions: string[];
  rejectedLifecycleTransitions: string[];
  acceptedArtifactRefs: string[];
  blockedArtifactRefs: string[];
  requestArtifactRefs: string[];
  diagnosticArtifactRefs: string[];
  providerDiagnosticRefs: string[];
  rootCauseSignature: NodeLifecycleRootCauseSignature | null;
  canCallGlobalScheduler: boolean;
  rawPromptStored: false;
  rawResponseStored: false;
  rawTranscriptStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogStored: false;
  rawDbRowsStored: false;
  hiddenReasoningStored: false;
};

export type NodeLifecycleProjectionManifest = {
  artifactKind: "execution_platform.node_lifecycle_projection_manifest";
  schemaVersion: typeof NODE_LIFECYCLE_PROJECTION_SCHEMA_VERSION;
  projectionRef: string;
  projectionHash: string;
  runtimeJobId: string;
  workflowId: string;
  graphId: string;
  nodeId: string;
  branchId: string | null;
  capabilityId: string | null;
  lifecycleTransitionProfileRef: string | null;
  currentLifecycleState: string;
  currentGate: string;
  nodeStatus: string;
  executionIntent: string | null;
  evidenceMode: string[];
  nextLegalTransitions: string[];
  rejectedLifecycleTransitionCount: number;
  rejectedLifecycleTransitions: string[];
  acceptedArtifactRefCount: number;
  blockedArtifactRefCount: number;
  requestArtifactRefCount: number;
  diagnosticArtifactRefCount: number;
  providerDiagnosticRefCount: number;
  acceptedArtifactRefs: string[];
  blockedArtifactRefs: string[];
  requestArtifactRefs: string[];
  diagnosticArtifactRefs: string[];
  providerDiagnosticRefs: string[];
  rootCauseSignatureRef: string | null;
  rootCauseSignatureHash: string | null;
  canCallGlobalScheduler: boolean;
  byteCount: number;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogStored: false;
  rawDbRowsStored: false;
  hiddenReasoningStored: false;
};

export type NodeLifecycleTransitionResult = {
  status: "continue" | "needs_review" | "failed";
  reasonCodes: string[];
  refs: string[];
  continueLoop: boolean;
};

export type NodeLifecycleProjectionRecordResult = {
  refs: string[];
  reasonCodes: string[];
};

export type NodeLifecycleNodeExecutionSnapshotRecordResult = {
  refs: string[];
  reasonCodes: string[];
};

export type NodeLifecycleAgentSessionStart = {
  status: "accepted" | "blocked";
  nodeExecutionSnapshot: NodeExecutionSnapshot;
  artifactType: typeof NODE_EXECUTION_SNAPSHOT_ARTIFACT_TYPE;
  blockerKind: string | null;
  refs: string[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawTranscriptStored: false;
  rawProviderLogStored: false;
  hiddenReasoningStored: false;
};

export type NodeLifecycleAgentProfileResolution =
  | {
      status: "accepted";
      agentId: string;
      reasonCodes: string[];
    }
  | {
      status: "blocked";
      agentId: string | null;
      blockerKind:
        | "node_agent_profile_missing"
        | "node_agent_profile_not_allowed"
        | "node_agent_tool_policy_insufficient"
        | "node_agent_skill_policy_insufficient"
        | "node_agent_subagent_policy_insufficient"
        | "node_agent_runtime_unavailable";
      reasonCodes: string[];
    };

export type NodeLifecycleTransitionRunnerOptions = {
  capabilityManifest: RuntimeNodeCapabilityManifest;
  recordProjection?: (input: {
    graphId: string;
    iteration: number;
    snapshot: RuntimeWorkGraphSnapshot;
    node: TeamGraphNode;
    projection: NodeLifecycleProjection;
    manifest: NodeLifecycleProjectionManifest;
  }) => Promise<NodeLifecycleProjectionRecordResult>;
  recordNodeExecutionSnapshot?: (input: {
    graphId: string;
    iteration: number;
    snapshot: RuntimeWorkGraphSnapshot;
    node: TeamGraphNode;
    nodeExecutionSnapshot: NodeExecutionSnapshot;
  }) => Promise<NodeLifecycleNodeExecutionSnapshotRecordResult>;
  resolveNodeAgentProfile?: (input: {
    graphId: string;
    iteration: number;
    snapshot: RuntimeWorkGraphSnapshot;
    node: TeamGraphNode;
    proposedAgentId: string;
    capabilityId: string | null;
    workflowId: string;
  }) => Promise<NodeLifecycleAgentProfileResolution> | NodeLifecycleAgentProfileResolution;
  executeTransition?: (input: {
    graphId: string;
    iteration: number;
    snapshot: RuntimeWorkGraphSnapshot;
    node: TeamGraphNode;
    projection: NodeLifecycleProjection;
    transitionContext?: unknown;
  }) => Promise<NodeLifecycleTransitionResult | null>;
};

export type NodeLifecycleDrainResult = {
  status: "continue" | "needs_review" | "failed";
  actionTaken: boolean;
  hasPendingLegalTransitions: boolean;
  blockedGlobalScheduler: boolean;
  refs: string[];
  projections: NodeLifecycleProjection[];
  reasonCodes: string[];
  continueLoop: boolean;
};

function hashValue(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function bounded(value: unknown, max = 360): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().replace(/\s+/gu, " ").slice(0, max);
  return normalized || null;
}

function strings(value: unknown, max = 40, maxChars = 360): string[] {
  const source = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of source) {
    const normalized = bounded(item, maxChars);
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

function uniqueStrings(values: Array<string | null | undefined>, max = 40): string[] {
  return strings(values, max);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstString(metadata: Record<string, unknown>, keys: string[], max = 360): string | null {
  for (const key of keys) {
    const value = bounded(metadata[key], max);
    if (value) {
      return value;
    }
  }
  return null;
}

function refList(metadata: Record<string, unknown>, keys: string[], max = 40): string[] {
  return strings(
    keys.flatMap((key) => strings(metadata[key], max)),
    max,
  );
}

function nodeLifecycleDependencySatisfied(status: string | null | undefined): boolean {
  return status === "succeeded" || status === "skipped";
}

function nodeLifecycleHasUnsatisfiedDependencies(input: {
  snapshot: RuntimeWorkGraphSnapshot;
  node: TeamGraphNode;
}): boolean {
  const statusByNodeId = new Map(
    input.snapshot.nodes.map((node) => [node.nodeId, node.nodeStatus]),
  );
  return input.snapshot.edges.some((edge) => {
    if (edge.toNodeId !== input.node.nodeId) {
      return false;
    }
    if (!["depends_on", "handoff", "closeout_source"].includes(edge.edgeKind)) {
      return false;
    }
    return !nodeLifecycleDependencySatisfied(
      edge.fromNodeId ? statusByNodeId.get(edge.fromNodeId) : null,
    );
  });
}

function metadataGate(metadata: Record<string, unknown>): string | null {
  const canonicalGate = firstString(
    metadata,
    ["nodeLifecycleProjectionGate", "nodeLifecycleCurrentGate", "currentGate"],
    220,
  );
  if (isNodeLifecycleGate(canonicalGate)) {
    return canonicalGate;
  }
  return null;
}

function defaultGateForExecutableNode(input: {
  node: TeamGraphNode;
  capability: ReturnType<typeof findRuntimeNodeCapability> | null;
}): string {
  if (input.node.nodeKind === "work_intent" || input.node.nodeKind === "human_task") {
    return "no_local_lifecycle_transition";
  }
  if (HARD_TERMINAL_NODE_STATUSES.has(input.node.nodeStatus)) {
    return "no_local_lifecycle_transition";
  }
  if (input.capability && !input.capability.canRunAsExecutable) {
    return "no_local_lifecycle_transition";
  }
  if (input.capability && input.capability.roleClass === "human") {
    return "no_local_lifecycle_transition";
  }
  return "node_agent_session_ready";
}

function staleMetadataGateDiagnostics(metadata: Record<string, unknown>): string[] {
  return firstString(
    metadata,
    [
      "nodeLifecycleProjectionGate",
      "nodeLifecycleCurrentGate",
      "progressiveState",
      "workIntentContextResolutionStatus",
      "currentPhase",
      "schedulerPhase",
    ],
    220,
  )
    ? ["node_lifecycle_stale_metadata_gate_ignored"]
    : [];
}

function transitionsForGate(input: {
  gate: string;
  capability: ReturnType<typeof findRuntimeNodeCapability> | null;
}): string[] {
  return legalTransitionsForLifecycleGate(input.gate).slice(0, 16);
}

function canCallGlobalSchedulerFor(input: {
  gate: string;
  nextLegalTransitions: string[];
  nodeStatus: TeamGraphNodeStatus;
  nodeKind: string;
  rejectedLifecycleTransitions: string[];
}): boolean {
  if (HARD_TERMINAL_NODE_STATUSES.has(input.nodeStatus)) {
    return true;
  }
  if (input.rejectedLifecycleTransitions.length > 0) {
    return false;
  }
  if (
    input.gate === "node_agent_session_ready" ||
    input.gate === "node_agent_session_escalation_required"
  ) {
    return false;
  }
  if (!LOCAL_LIFECYCLE_GATES.has(input.gate)) {
    return true;
  }
  return input.nextLegalTransitions.length === 0;
}

function lifecycleProjectionPriority(projection: NodeLifecycleProjection): number {
  switch (projection.currentGate) {
    case "node_agent_session_ready":
    case "node_agent_session_escalation_required":
      return 0;
    case "node_lifecycle_root_cause_collapsed":
      return 1;
    default:
      return 2;
  }
}

function legalTransitionProfile(input: {
  capability: ReturnType<typeof findRuntimeNodeCapability> | null;
  gate: string;
  nextLegalTransitions: string[];
}): { legalTransitions: string[]; rejectedTransitions: string[]; reasonCodes: string[] } {
  if (!isNodeLifecycleGate(input.gate) || !input.capability) {
    return {
      legalTransitions: input.nextLegalTransitions,
      rejectedTransitions: [],
      reasonCodes: [],
    };
  }
  const allowedTransitions = new Set([
    ...input.capability.allowedLifecycleTransitions,
    ...input.capability.domainWorkerActionToolIds,
  ]);
  const legalTransitions: string[] = [];
  const rejectedTransitions: string[] = [];
  for (const transition of input.nextLegalTransitions) {
    if (allowedTransitions.has(transition)) {
      legalTransitions.push(transition);
    } else {
      rejectedTransitions.push(transition);
    }
  }
  return {
    legalTransitions,
    rejectedTransitions,
    reasonCodes:
      rejectedTransitions.length === 0
        ? []
        : [
            "node_lifecycle_transition_profile_rejected_unregistered_tool",
            ...rejectedTransitions
              .slice(0, 12)
              .map((transition) => `node_lifecycle_transition_rejected:${transition}`),
          ],
  };
}

function buildRootCauseSignature(input: {
  graphId: string;
  node: TeamGraphNode;
  gate: string;
  capabilityId: string | null;
  transitionProfileRef: string | null;
  reasonCodes: string[];
  missingFields: string[];
  contractVersion: string | null;
}): NodeLifecycleRootCauseSignature {
  const descriptor = lifecycleDescriptorForGate(input.gate);
  const body = {
    stage: descriptor?.rootCauseStage ?? "node_lifecycle_transition",
    nodeKind: input.node.nodeKind,
    capabilityId: input.capabilityId,
    currentGate: input.gate,
    missingFields: input.missingFields.slice(0, 20),
    reasonCodes: input.reasonCodes.slice(0, 40),
    contractVersion: input.contractVersion,
    transitionProfileRef: input.transitionProfileRef,
  };
  const signatureHash = hashValue(body);
  return {
    signatureRef: graphRef(
      "node-lifecycle-root-cause-signature",
      `${input.node.nodeId}-${signatureHash}`,
    ),
    signatureHash,
    stage: body.stage,
    nodeKind: body.nodeKind,
    capabilityId: body.capabilityId,
    currentGate: body.currentGate,
    missingFields: body.missingFields,
    reasonCodes: body.reasonCodes,
    contractVersion: body.contractVersion,
    transitionProfileRef: body.transitionProfileRef,
  };
}

export function buildNodeLifecycleProjectionManifest(
  projection: NodeLifecycleProjection,
): NodeLifecycleProjectionManifest {
  const manifest = {
    artifactKind: "execution_platform.node_lifecycle_projection_manifest" as const,
    schemaVersion: NODE_LIFECYCLE_PROJECTION_SCHEMA_VERSION,
    projectionRef: projection.projectionRef,
    projectionHash: projection.projectionHash,
    runtimeJobId: projection.runtimeJobId,
    workflowId: projection.workflowId,
    graphId: projection.graphId,
    nodeId: projection.nodeId,
    branchId: projection.branchId,
    capabilityId: projection.capabilityId,
    lifecycleTransitionProfileRef: projection.lifecycleTransitionProfileRef,
    currentLifecycleState: projection.currentLifecycleState,
    currentGate: projection.currentGate,
    nodeStatus: projection.nodeStatus,
    executionIntent: projection.executionIntent,
    evidenceMode: projection.evidenceMode.slice(0, 12),
    nextLegalTransitions: projection.nextLegalTransitions.slice(0, 16),
    rejectedLifecycleTransitionCount: projection.rejectedLifecycleTransitions.length,
    rejectedLifecycleTransitions: projection.rejectedLifecycleTransitions.slice(0, 12),
    acceptedArtifactRefCount: projection.acceptedArtifactRefs.length,
    blockedArtifactRefCount: projection.blockedArtifactRefs.length,
    requestArtifactRefCount: projection.requestArtifactRefs.length,
    diagnosticArtifactRefCount: projection.diagnosticArtifactRefs.length,
    providerDiagnosticRefCount: projection.providerDiagnosticRefs.length,
    acceptedArtifactRefs: projection.acceptedArtifactRefs.slice(0, 12),
    blockedArtifactRefs: projection.blockedArtifactRefs.slice(0, 12),
    requestArtifactRefs: projection.requestArtifactRefs.slice(0, 12),
    diagnosticArtifactRefs: projection.diagnosticArtifactRefs.slice(0, 12),
    providerDiagnosticRefs: projection.providerDiagnosticRefs.slice(0, 12),
    rootCauseSignatureRef: projection.rootCauseSignature?.signatureRef ?? null,
    rootCauseSignatureHash: projection.rootCauseSignature?.signatureHash ?? null,
    canCallGlobalScheduler: projection.canCallGlobalScheduler,
    byteCount: 0,
    rawPromptStored: false as const,
    rawResponseStored: false as const,
    rawProviderLogStored: false as const,
    rawToolLogStored: false as const,
    rawCommandLogStored: false as const,
    rawDbRowsStored: false as const,
    hiddenReasoningStored: false as const,
  };
  return {
    ...manifest,
    byteCount: Buffer.byteLength(JSON.stringify(projection), "utf8"),
  };
}

export class NodeLifecycleTransitionRunner {
  constructor(private readonly options: NodeLifecycleTransitionRunnerOptions) {}

  async prepareAgentSessionStart(input: {
    graphId: string;
    iteration: number;
    snapshot: RuntimeWorkGraphSnapshot;
    node: TeamGraphNode;
    attemptId?: string;
  }): Promise<NodeLifecycleAgentSessionStart> {
    const metadata = asRecord(input.node.metadata);
    const attemptId =
      firstString(metadata, ["nodeAttemptId", "attemptId", "executionAttemptId"], 160) ??
      `iteration-${input.iteration}`;
    const proposedAgentId = resolveNodeExecutionAgentId({ node: input.node });
    const capabilityId = firstString(metadata, ["capabilityId", "selectedCapabilityId"], 180);
    const agentResolution =
      (await this.options.resolveNodeAgentProfile?.({
        graphId: input.graphId,
        iteration: input.iteration,
        snapshot: input.snapshot,
        node: input.node,
        proposedAgentId,
        capabilityId,
        workflowId: input.snapshot.graph.workflowId,
      })) ??
      ({
        status: "accepted",
        agentId: proposedAgentId,
        reasonCodes: ["node_agent_profile_resolution_not_configured_default_agent_accepted"],
      } satisfies NodeLifecycleAgentProfileResolution);
    const nodeExecutionSnapshot = buildNodeExecutionSnapshotFromGraphNode({
      snapshot: input.snapshot,
      graphId: input.graphId,
      node: input.node,
      attemptId: input.attemptId ?? attemptId,
      agentId: agentResolution.agentId ?? proposedAgentId,
    });
    if (agentResolution.status === "blocked") {
      return {
        status: "blocked",
        nodeExecutionSnapshot,
        artifactType: NODE_EXECUTION_SNAPSHOT_ARTIFACT_TYPE,
        blockerKind: agentResolution.blockerKind,
        refs: [],
        reasonCodes: uniqueStrings([
          "node_lifecycle_runner_blocked_openclaw_agent_session_start",
          agentResolution.blockerKind,
          ...agentResolution.reasonCodes,
        ]),
        rawPromptStored: false,
        rawResponseStored: false,
        rawTranscriptStored: false,
        rawProviderLogStored: false,
        hiddenReasoningStored: false,
      };
    }
    const persisted = await this.options.recordNodeExecutionSnapshot?.({
      graphId: input.graphId,
      iteration: input.iteration,
      snapshot: input.snapshot,
      node: input.node,
      nodeExecutionSnapshot,
    });
    return {
      status: "accepted",
      nodeExecutionSnapshot,
      artifactType: NODE_EXECUTION_SNAPSHOT_ARTIFACT_TYPE,
      blockerKind: null,
      refs: uniqueStrings([nodeExecutionSnapshot.snapshotRef, ...(persisted?.refs ?? [])]),
      reasonCodes: uniqueStrings([
        "node_lifecycle_runner_prepared_openclaw_agent_session_start",
        "node_lifecycle_runner_compiled_node_execution_snapshot",
        ...agentResolution.reasonCodes,
        ...(persisted?.reasonCodes ?? []),
      ]),
      rawPromptStored: false,
      rawResponseStored: false,
      rawTranscriptStored: false,
      rawProviderLogStored: false,
      hiddenReasoningStored: false,
    };
  }

  project(input: {
    graphId: string;
    snapshot: RuntimeWorkGraphSnapshot;
    node: TeamGraphNode;
  }): NodeLifecycleProjection {
    const metadata = asRecord(input.node.metadata);
    const workflowId = input.snapshot.graph.workflowId;
    const capabilityId = firstString(metadata, ["capabilityId", "selectedCapabilityId"], 180);
    const capability = capabilityId
      ? findRuntimeNodeCapability(capabilityId, this.options.capabilityManifest)
      : null;
    const gate =
      metadataGate(metadata) ?? defaultGateForExecutableNode({ node: input.node, capability });
    const currentLifecycleState =
      (gate !== "no_local_lifecycle_transition" ? gate : null) ??
      firstString(metadata, ["nodeLifecycleState"], 220) ??
      input.node.nodeStatus;
    const baseReasonCodes = uniqueStrings(
      [
        ...strings(metadata.nodeLifecycleReasonCodes, 40),
        ...strings(metadata.lastStatusReasonCodes, 40),
        ...strings(metadata.reasonCodes, 40),
      ],
      60,
    );
    const missingFields = uniqueStrings([...strings(metadata.missingFields, 20)], 20);
    const candidateTransitions = transitionsForGate({ gate, capability });
    const transitionProfileRef =
      capability?.lifecycleTransitionProfileRef ??
      firstString(metadata, ["lifecycleTransitionProfileRef"], 240);
    const transitionProfile = legalTransitionProfile({
      capability,
      gate,
      nextLegalTransitions: candidateTransitions,
    });
    const nextLegalTransitions = transitionProfile.legalTransitions.slice(0, 16);
    const rejectedLifecycleTransitions = transitionProfile.rejectedTransitions.slice(0, 16);
    const reasonCodes = uniqueStrings(
      [
        ...baseReasonCodes,
        ...transitionProfile.reasonCodes,
        ...staleMetadataGateDiagnostics(metadata),
        ...(gate === "node_agent_session_ready"
          ? ["node_lifecycle_runner_authorized_openclaw_agent_session"]
          : []),
      ],
      80,
    );
    const bodyForHash = {
      graphId: input.graphId,
      nodeId: input.node.nodeId,
      gate,
      state: currentLifecycleState,
      nodeStatus: input.node.nodeStatus,
      nextLegalTransitions,
      rejectedLifecycleTransitions,
      reasonCodes,
      missingFields,
      capabilityId,
      transitionProfileRef,
    };
    const projectionHash = hashValue(bodyForHash);
    const contractVersion = firstString(
      metadata,
      ["nodeExecutionContractVersion", "contractVersion"],
      120,
    );
    return {
      artifactKind: "execution_platform.node_lifecycle_projection",
      schemaVersion: NODE_LIFECYCLE_PROJECTION_SCHEMA_VERSION,
      projectionRef: graphRef(
        "node-lifecycle-projection",
        `${input.node.nodeId}-${projectionHash}`,
      ),
      projectionHash,
      runtimeJobId: input.snapshot.graph.rootRuntimeJobId ?? "unknown-runtime-job",
      workflowId,
      graphId: input.graphId,
      nodeId: input.node.nodeId,
      branchId: firstString(metadata, ["branchId", "superstepBranchId"], 180),
      capabilityId,
      lifecycleTransitionProfileRef: transitionProfileRef,
      currentLifecycleState,
      currentGate: gate,
      nodeStatus: input.node.nodeStatus,
      executionIntent: firstString(metadata, ["executionIntent", "downstreamExecutionIntent"], 120),
      evidenceMode: strings(metadata.evidenceMode, 12, 120),
      nextLegalTransitions,
      rejectedLifecycleTransitions,
      acceptedArtifactRefs: uniqueStrings([...refList(metadata, ["acceptedArtifactRefs"], 24)]),
      blockedArtifactRefs: refList(metadata, ["blockedArtifactRefs"], 24),
      requestArtifactRefs: uniqueStrings([...refList(metadata, ["requestArtifactRefs"], 24)]),
      diagnosticArtifactRefs: uniqueStrings([
        ...refList(metadata, ["diagnosticArtifactRefs", "outputArtifactRefs"], 24),
      ]),
      providerDiagnosticRefs: uniqueStrings([...refList(metadata, ["providerDiagnosticRefs"], 24)]),
      rootCauseSignature: buildRootCauseSignature({
        graphId: input.graphId,
        node: input.node,
        gate,
        capabilityId,
        transitionProfileRef,
        reasonCodes,
        missingFields,
        contractVersion,
      }),
      canCallGlobalScheduler: canCallGlobalSchedulerFor({
        gate,
        nextLegalTransitions,
        nodeStatus: input.node.nodeStatus,
        nodeKind: input.node.nodeKind,
        rejectedLifecycleTransitions,
      }),
      rawPromptStored: false,
      rawResponseStored: false,
      rawTranscriptStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
      hiddenReasoningStored: false,
    };
  }

  pendingProjections(input: {
    graphId: string;
    snapshot: RuntimeWorkGraphSnapshot;
  }): NodeLifecycleProjection[] {
    return input.snapshot.nodes
      .filter((node) => !HARD_TERMINAL_NODE_STATUSES.has(node.nodeStatus))
      .filter(
        (node) => !nodeLifecycleHasUnsatisfiedDependencies({ snapshot: input.snapshot, node }),
      )
      .map((node) => this.project({ graphId: input.graphId, snapshot: input.snapshot, node }))
      .filter((projection) => !projection.canCallGlobalScheduler)
      .toSorted((a, b) => {
        const priority = lifecycleProjectionPriority(a) - lifecycleProjectionPriority(b);
        return priority !== 0 ? priority : a.nodeId.localeCompare(b.nodeId);
      });
  }

  async drain(input: {
    graphId: string;
    iteration: number;
    snapshot: RuntimeWorkGraphSnapshot;
    maxTransitions?: number;
    excludeGateKinds?: string[];
    includeGateKinds?: string[];
    includeNodeKinds?: string[];
    transitionContext?: unknown;
  }): Promise<NodeLifecycleDrainResult> {
    const refs: string[] = [];
    const reasonCodes: string[] = [];
    const excludedGateKinds = new Set(input.excludeGateKinds ?? []);
    const includedGateKinds = new Set(input.includeGateKinds ?? []);
    const includedNodeKinds = new Set(input.includeNodeKinds ?? []);
    const projections = this.pendingProjections(input)
      .filter((projection) => !excludedGateKinds.has(projection.currentGate))
      .filter((projection) =>
        includedGateKinds.size > 0 ? includedGateKinds.has(projection.currentGate) : true,
      )
      .filter((projection) => {
        if (includedNodeKinds.size === 0) {
          return true;
        }
        const node = input.snapshot.nodes.find(
          (candidate) => candidate.nodeId === projection.nodeId,
        );
        return node ? includedNodeKinds.has(node.nodeKind) : false;
      });
    if (projections.length === 0) {
      return {
        status: "continue",
        actionTaken: false,
        hasPendingLegalTransitions: false,
        blockedGlobalScheduler: false,
        refs,
        projections,
        reasonCodes,
        continueLoop: false,
      };
    }

    const maxTransitions = Math.max(1, Math.min(input.maxTransitions ?? 1, 8));
    for (const projection of projections.slice(0, maxTransitions)) {
      const node = input.snapshot.nodes.find((candidate) => candidate.nodeId === projection.nodeId);
      if (!node) {
        continue;
      }
      const manifest = buildNodeLifecycleProjectionManifest(projection);
      const recorded = await this.options.recordProjection?.({
        graphId: input.graphId,
        iteration: input.iteration,
        snapshot: input.snapshot,
        node,
        projection,
        manifest,
      });
      refs.push(projection.projectionRef, ...(recorded?.refs ?? []));
      reasonCodes.push("node_lifecycle_projection_recorded", ...(recorded?.reasonCodes ?? []));

      const executed = await this.options.executeTransition?.({
        graphId: input.graphId,
        iteration: input.iteration,
        snapshot: input.snapshot,
        node,
        projection,
        transitionContext: input.transitionContext,
      });
      if (executed) {
        return {
          status: executed.status,
          actionTaken: true,
          hasPendingLegalTransitions: true,
          blockedGlobalScheduler: executed.status !== "continue",
          refs: uniqueStrings([...refs, ...executed.refs], 80),
          projections: [projection],
          reasonCodes: uniqueStrings([...reasonCodes, ...executed.reasonCodes], 120),
          continueLoop: executed.continueLoop,
        };
      }
    }

    return {
      status: "needs_review",
      actionTaken: false,
      hasPendingLegalTransitions: true,
      blockedGlobalScheduler: true,
      refs: uniqueStrings(refs, 80),
      projections: projections.slice(0, maxTransitions),
      reasonCodes: uniqueStrings(
        [
          ...reasonCodes,
          "node_lifecycle_pending_without_transition_executor",
          "node_lifecycle_global_scheduler_blocked",
        ],
        120,
      ),
      continueLoop: false,
    };
  }
}
