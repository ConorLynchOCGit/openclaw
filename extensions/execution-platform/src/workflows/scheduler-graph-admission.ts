import type { JsonValue } from "../runtime-job-repository.ts";
import type {
  OrchestratorGraphEdgeSpec,
  OrchestratorGraphNodeSpec,
} from "./orchestrator-graph-decision.ts";
import type { TeamGraphNode, TeamGraphNodeKind } from "./runtime-work-graph.ts";
import {
  schedulerClosurePolicyOrDefault,
  schedulerValidationPhaseForClosureRunMode,
  type SchedulerClosurePolicy,
  type SchedulerClosureRunMode,
  type SchedulerMissionTailKind,
} from "./scheduler-graph-closure-policy.ts";
import {
  normalizeRuntimeValidationPhase,
  type RuntimeValidationPhase,
} from "./validation-phase.ts";

export type SchedulerGraphAdmissionNode = Pick<TeamGraphNode, "nodeId" | "nodeKind" | "metadata">;

export type SchedulerGraphAdmissionInput = {
  nodes: OrchestratorGraphNodeSpec[];
  edges: OrchestratorGraphEdgeSpec[];
  existingNodesById?: ReadonlyMap<string, SchedulerGraphAdmissionNode>;
  schedulerClosurePolicy?: SchedulerClosurePolicy | null;
  closureRunMode?: SchedulerClosureRunMode;
};

export type SchedulerGraphAdmissionDiagnostic = {
  reasonCode: string;
  affectedNodeIds: string[];
  affectedEdgeIds: string[];
  blockerSummary: string;
};

export type SchedulerGraphAdmissionResult = {
  valid: boolean;
  reasonCodes: string[];
  diagnostics: SchedulerGraphAdmissionDiagnostic[];
};

const POST_WORK_VALIDATION_NODE_KINDS = new Set<TeamGraphNodeKind>([
  "validation",
  "test_review",
  "reviewer",
  "security_review",
  "observability_readback",
  "closeout",
]);

const GRAPH_TAIL_NODE_KINDS_BY_TAIL_KIND: Record<SchedulerMissionTailKind, TeamGraphNodeKind[]> = {
  validation: ["validation", "test_review"],
  review: ["reviewer", "security_review"],
  closeout: ["closeout", "observability_readback"],
};

const CORE_EXECUTABLE_NODE_KINDS = new Set<TeamGraphNodeKind>([
  "implementation",
  "test_authoring",
  "docs_update",
]);

const PRE_EXECUTION_NODE_KINDS = new Set<TeamGraphNodeKind>([
  "planning_capsule",
  "architecture_spec",
  "compiler",
]);

function metadataRecord(value: JsonValue | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function metadataString(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function metadataTailKind(value: unknown): SchedulerMissionTailKind | null {
  if (value === "validation" || value === "review" || value === "closeout") {
    return value;
  }
  return null;
}

function isWorkerPostEditValidationPhase(phase: RuntimeValidationPhase | null): boolean {
  return phase === "worker_post_edit_validation" || phase === "post_action_validation";
}

function isCoreExecutableNode(node: OrchestratorGraphNodeSpec): boolean {
  const metadata = metadataRecord(node.metadata);
  return (
    CORE_EXECUTABLE_NODE_KINDS.has(node.nodeKind) ||
    ["source_edit", "implementation", "docs", "test_authoring"].includes(
      metadataString(metadata.executionIntent),
    )
  );
}

function isPreExecutionNode(
  node: OrchestratorGraphNodeSpec | SchedulerGraphAdmissionNode,
): boolean {
  const metadata = metadataRecord(node.metadata);
  return (
    PRE_EXECUTION_NODE_KINDS.has(node.nodeKind) ||
    ["source_grounding", "prompt_grounding", "pre_execution"].includes(
      metadataString(metadata.executionIntent),
    )
  );
}

function addDiagnostic(
  diagnostics: SchedulerGraphAdmissionDiagnostic[],
  reasonCode: string,
  affectedNodeIds: string[],
  affectedEdgeIds: string[],
  blockerSummary: string,
): void {
  diagnostics.push({
    reasonCode,
    affectedNodeIds,
    affectedEdgeIds,
    blockerSummary,
  });
}

function edgeKey(edge: OrchestratorGraphEdgeSpec, index: number): string {
  return edge.edgeId || `edge-${index + 1}`;
}

export function validateSchedulerGraphAdmission(
  input: SchedulerGraphAdmissionInput,
): SchedulerGraphAdmissionResult {
  const diagnostics: SchedulerGraphAdmissionDiagnostic[] = [];
  const policy = schedulerClosurePolicyOrDefault(input.schedulerClosurePolicy);
  const closureRunMode = input.closureRunMode ?? "standard";
  const expectedValidationPhase = schedulerValidationPhaseForClosureRunMode({
    policy,
    closureRunMode,
  });
  const proposedNodesById = new Map(input.nodes.map((node) => [node.nodeId, node]));
  const existingNodesById = input.existingNodesById ?? new Map();
  const allNodeIds = new Set([...proposedNodesById.keys(), ...existingNodesById.keys()]);
  const incomingByNodeId = new Map<string, OrchestratorGraphEdgeSpec[]>();
  const outgoingByNodeId = new Map<string, OrchestratorGraphEdgeSpec[]>();
  input.edges.forEach((edge, index) => {
    const edgeId = edgeKey(edge, index);
    const fromNodeId = metadataString(edge.fromNodeId);
    const toNodeId = metadataString(edge.toNodeId);
    if (fromNodeId && !allNodeIds.has(fromNodeId)) {
      addDiagnostic(
        diagnostics,
        `scheduler_graph_admission_edge_endpoint_unknown:${edgeId}:from`,
        [fromNodeId],
        [edgeId],
        "Scheduler graph edge references an unknown source node.",
      );
    }
    if (toNodeId && !allNodeIds.has(toNodeId)) {
      addDiagnostic(
        diagnostics,
        `scheduler_graph_admission_edge_endpoint_unknown:${edgeId}:to`,
        [toNodeId],
        [edgeId],
        "Scheduler graph edge references an unknown target node.",
      );
    }
    if (toNodeId) {
      incomingByNodeId.set(toNodeId, [...(incomingByNodeId.get(toNodeId) ?? []), edge]);
    }
    if (fromNodeId) {
      outgoingByNodeId.set(fromNodeId, [...(outgoingByNodeId.get(fromNodeId) ?? []), edge]);
    }
  });

  const tailCountByKind = new Map<SchedulerMissionTailKind, string[]>();
  for (const node of input.nodes) {
    const metadata = metadataRecord(node.metadata);
    const tailKind = metadataTailKind(metadata.missionTailKind);
    const validationPhase =
      normalizeRuntimeValidationPhase(metadata.validationPhase) ??
      normalizeRuntimeValidationPhase(metadata.validationNodePhase);
    if (tailKind) {
      tailCountByKind.set(tailKind, [...(tailCountByKind.get(tailKind) ?? []), node.nodeId]);
      if (!GRAPH_TAIL_NODE_KINDS_BY_TAIL_KIND[tailKind].includes(node.nodeKind)) {
        addDiagnostic(
          diagnostics,
          `scheduler_graph_admission_tail_node_kind_mismatch:${node.nodeId}:${tailKind}`,
          [node.nodeId],
          [],
          "Mission tail node kind does not match its tail kind.",
        );
      }
    }
    if (POST_WORK_VALIDATION_NODE_KINDS.has(node.nodeKind)) {
      if (tailKind === "validation" && validationPhase !== expectedValidationPhase) {
        addDiagnostic(
          diagnostics,
          `scheduler_graph_admission_tail_validation_phase_mismatch:${node.nodeId}`,
          [node.nodeId],
          [],
          "Mission validation tail phase does not match closure run mode.",
        );
      }
      if (node.nodeKind === "validation" || node.nodeKind === "test_review") {
        if (!validationPhase) {
          addDiagnostic(
            diagnostics,
            `scheduler_graph_admission_validation_phase_missing:${node.nodeId}`,
            [node.nodeId],
            [],
            "Validation graph nodes must declare a graph-level validation phase.",
          );
        } else if (isWorkerPostEditValidationPhase(validationPhase)) {
          addDiagnostic(
            diagnostics,
            `scheduler_graph_admission_worker_local_validation_phase_on_graph_tail:${node.nodeId}`,
            [node.nodeId],
            [],
            "Worker-local validation phases are not valid for graph-level validation nodes.",
          );
        }
      }
      const incomingEdges = incomingByNodeId.get(node.nodeId) ?? [];
      if (incomingEdges.length === 0) {
        addDiagnostic(
          diagnostics,
          `scheduler_graph_admission_tail_initial_frontier_rejected:${node.nodeId}`,
          [node.nodeId],
          [],
          "Mission tail nodes cannot be initial frontier nodes.",
        );
      }
      for (const edge of outgoingByNodeId.get(node.nodeId) ?? []) {
        const toNode = metadataString(edge.toNodeId)
          ? (proposedNodesById.get(metadataString(edge.toNodeId)) ??
            existingNodesById.get(metadataString(edge.toNodeId)))
          : null;
        if (toNode && isCoreExecutableNode(toNode as OrchestratorGraphNodeSpec)) {
          addDiagnostic(
            diagnostics,
            `scheduler_graph_admission_tail_points_back_to_core:${node.nodeId}`,
            [node.nodeId, toNode.nodeId],
            [edge.edgeId ?? ""],
            "Mission tail nodes must not point back to core executable workers.",
          );
        }
      }
    }
  }
  for (const [tailKind, nodeIds] of tailCountByKind.entries()) {
    if (nodeIds.length > 1) {
      addDiagnostic(
        diagnostics,
        `scheduler_graph_admission_duplicate_mission_tail:${tailKind}`,
        nodeIds,
        [],
        "Scheduler graph contains duplicate mission tail nodes for the same tail kind.",
      );
    }
  }

  const coreNodes = input.nodes.filter(isCoreExecutableNode);
  if (coreNodes.length === 0) {
    addDiagnostic(
      diagnostics,
      "scheduler_graph_admission_core_executable_initial_frontier_missing",
      [],
      [],
      "Scheduler graph must include at least one core executable node before mission tails.",
    );
  }
  const initialCoreNodes = coreNodes.filter((node) => {
    const incomingEdges = incomingByNodeId.get(node.nodeId) ?? [];
    return incomingEdges.length === 0;
  });
  if (coreNodes.length > 0 && initialCoreNodes.length === 0) {
    addDiagnostic(
      diagnostics,
      "scheduler_graph_admission_core_executable_initial_frontier_missing",
      coreNodes.map((node) => node.nodeId),
      [],
      "At least one core executable node must be runnable before tail work.",
    );
  }
  for (const node of coreNodes) {
    for (const edge of incomingByNodeId.get(node.nodeId) ?? []) {
      const fromNodeId = metadataString(edge.fromNodeId);
      if (!fromNodeId) {
        continue;
      }
      const fromNode = proposedNodesById.get(fromNodeId) ?? existingNodesById.get(fromNodeId);
      if (!fromNode || isPreExecutionNode(fromNode)) {
        continue;
      }
      addDiagnostic(
        diagnostics,
        `scheduler_graph_admission_core_depends_on_non_pre_execution:${node.nodeId}`,
        [fromNodeId, node.nodeId],
        [edge.edgeId ?? ""],
        "Core executable nodes should start from roots or pre-execution grounding dependencies.",
      );
    }
  }

  const reasonCodes = diagnostics.map((diagnostic) => diagnostic.reasonCode);
  return {
    valid: diagnostics.length === 0,
    reasonCodes,
    diagnostics,
  };
}
