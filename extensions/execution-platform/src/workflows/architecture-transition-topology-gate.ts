export const ARCHITECTURE_TRANSITION_TOPOLOGY_GATE_VERSION =
  "execution-platform.architecture-transition-topology-gate.v1" as const;

export type ArchitectureTransitionTopologyGateStatus = "passed" | "failed";

export type ArchitectureTransitionTopologyGateGraphNode = {
  nodeId?: string | null;
  nodeKind?: string | null;
};

export type ArchitectureTransitionTopologyGateGraphEdge = {
  fromNodeId?: string | null;
  toNodeId?: string | null;
  edgeKind?: string | null;
};

export type ArchitectureTransitionTopologyGateProgressEvent = {
  schedulerToolId?: string | null;
  currentPhase?: string | null;
  checkpointKind?: string | null;
  stage?: string | null;
};

export type ArchitectureTransitionTopologyGateInput = {
  graph?: {
    nodes?: ArchitectureTransitionTopologyGateGraphNode[] | null;
    nodeKinds?: string[] | null;
    edges?: ArchitectureTransitionTopologyGateGraphEdge[] | null;
  } | null;
  schedulerProgress?: ArchitectureTransitionTopologyGateProgressEvent[] | null;
};

export type ArchitectureTransitionTopologyGateResult = {
  artifactKind: "execution_platform.architecture_transition_topology_gate";
  schemaVersion: typeof ARCHITECTURE_TRANSITION_TOPOLOGY_GATE_VERSION;
  status: ArchitectureTransitionTopologyGateStatus;
  failed: boolean;
  reasonCodes: string[];
  evidence: {
    contextScoutGraphFanout: boolean;
    contextScoutGraphNodeIds: string[];
    resourceFulfillmentEdgeCount: number;
    contextSynthesisNode: boolean;
    contextSynthesisNodeIds: string[];
    dispatchedGraphContextScout: boolean;
    dispatchEventCount: number;
    rawPromptStored: false;
    rawResponseStored: false;
    rawProviderLogStored: false;
    rawToolLogStored: false;
  };
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  semanticQualityJudgedByDeterministicCode: false;
};

function bounded(value: unknown, max = 240): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

function unique(values: Array<string | null | undefined>, max = 40): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].slice(0, max);
}

function graphNodes(
  graph: ArchitectureTransitionTopologyGateInput["graph"],
): ArchitectureTransitionTopologyGateGraphNode[] {
  const explicit = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const nodeKindOnly = Array.isArray(graph?.nodeKinds)
    ? graph.nodeKinds.map((nodeKind) => ({ nodeKind }))
    : [];
  return [...explicit, ...nodeKindOnly];
}

export function evaluateArchitectureTransitionTopologyGate(
  input: ArchitectureTransitionTopologyGateInput,
): ArchitectureTransitionTopologyGateResult {
  const nodes = graphNodes(input.graph);
  const edges = Array.isArray(input.graph?.edges) ? input.graph.edges : [];
  const schedulerProgress = Array.isArray(input.schedulerProgress) ? input.schedulerProgress : [];
  const contextScoutGraphNodeIds = unique(
    nodes
      .filter((node) => bounded(node.nodeKind) === "resource_scout")
      .map((node, index) => bounded(node.nodeId) ?? `resource_scout:${index}`),
  );
  const contextSynthesisNodeIds = unique(
    nodes
      .filter((node) => bounded(node.nodeKind) === "context_synthesis")
      .map((node, index) => bounded(node.nodeId) ?? `context_synthesis:${index}`),
  );
  const resourceFulfillmentEdgeCount = edges.filter(
    (edge) => bounded(edge.edgeKind) === "context_supplies",
  ).length;
  const dispatchEvents = schedulerProgress.filter((event) => {
    const toolId = bounded(event.schedulerToolId);
    const phase = bounded(event.currentPhase);
    const checkpointKind = bounded(event.checkpointKind);
    return (
      toolId === "resource_broker.dispatch_resource_scout" ||
      phase === "resource_broker_dispatch_resource_scout" ||
      checkpointKind === "runtime_policy_node_scoped_resource_fulfillment_created"
    );
  });
  const reasonCodes = [
    ...(contextScoutGraphNodeIds.length > 0 || dispatchEvents.length > 0
      ? ["default_resource_scout_fanout_retired"]
      : []),
    ...(resourceFulfillmentEdgeCount > 0 ? ["legacy_resource_fulfillment_gate_retired"] : []),
    ...(contextSynthesisNodeIds.length > 0 ? ["context_synthesis_default_glue_retired"] : []),
  ];
  const failed = reasonCodes.length > 0;
  return {
    artifactKind: "execution_platform.architecture_transition_topology_gate",
    schemaVersion: ARCHITECTURE_TRANSITION_TOPOLOGY_GATE_VERSION,
    status: failed ? "failed" : "passed",
    failed,
    reasonCodes: failed
      ? [
          "architecture_transition_topology_invalid",
          "architecture_transition_legacy_topology_blocked",
          ...reasonCodes,
        ]
      : ["architecture_transition_topology_clean"],
    evidence: {
      contextScoutGraphFanout: contextScoutGraphNodeIds.length > 0,
      contextScoutGraphNodeIds,
      resourceFulfillmentEdgeCount,
      contextSynthesisNode: contextSynthesisNodeIds.length > 0,
      contextSynthesisNodeIds,
      dispatchedGraphContextScout: dispatchEvents.length > 0,
      dispatchEventCount: dispatchEvents.length,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    },
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    semanticQualityJudgedByDeterministicCode: false,
  };
}
