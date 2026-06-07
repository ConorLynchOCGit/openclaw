export const NODE_LIFECYCLE_GATES = [
  "node_agent_session_ready",
  "node_agent_session_escalation_required",
  "node_lifecycle_root_cause_collapsed",
] as const;

export type NodeLifecycleGate = (typeof NODE_LIFECYCLE_GATES)[number];

export type NodeLifecycleTransitionDescriptor = {
  gate: NodeLifecycleGate;
  legalToolIds: readonly string[];
  handlerRef: string;
  stateMutationTarget: "node_agent_session" | "root_cause";
  readbackGate: NodeLifecycleGate;
  rootCauseStage: string;
  canCallGlobalSchedulerAfterTransition: boolean;
};

export const NODE_LIFECYCLE_TRANSITION_DESCRIPTORS: readonly NodeLifecycleTransitionDescriptor[] = [
  {
    gate: "node_agent_session_ready",
    legalToolIds: ["node.agent_session.invoke"],
    handlerRef: "node-lifecycle-handler://node-agent-session/invoke/v1",
    stateMutationTarget: "node_agent_session",
    readbackGate: "node_agent_session_ready",
    rootCauseStage: "node_agent_session",
    canCallGlobalSchedulerAfterTransition: false,
  },
  {
    gate: "node_agent_session_escalation_required",
    legalToolIds: ["node.agent_session.invoke_high_capability"],
    handlerRef: "node-lifecycle-handler://node-agent-session/high-capability-escalation/v1",
    stateMutationTarget: "node_agent_session",
    readbackGate: "node_agent_session_escalation_required",
    rootCauseStage: "node_agent_session_escalation",
    canCallGlobalSchedulerAfterTransition: false,
  },
  {
    gate: "node_lifecycle_root_cause_collapsed",
    legalToolIds: [],
    handlerRef: "node-lifecycle-handler://root-cause/terminal/v1",
    stateMutationTarget: "root_cause",
    readbackGate: "node_lifecycle_root_cause_collapsed",
    rootCauseStage: "node_lifecycle_root_cause",
    canCallGlobalSchedulerAfterTransition: true,
  },
] as const;

export const NODE_LIFECYCLE_DESCRIPTOR_BY_GATE = Object.freeze(
  Object.fromEntries(
    NODE_LIFECYCLE_TRANSITION_DESCRIPTORS.map((descriptor) => [descriptor.gate, descriptor]),
  ) as Record<NodeLifecycleGate, NodeLifecycleTransitionDescriptor>,
);

export const NODE_LIFECYCLE_GATE_TRANSITIONS = Object.freeze(
  Object.fromEntries(
    NODE_LIFECYCLE_TRANSITION_DESCRIPTORS.map((descriptor) => [
      descriptor.gate,
      descriptor.legalToolIds,
    ]),
  ) as Record<NodeLifecycleGate, readonly string[]>,
);

export const NODE_LIFECYCLE_DESCRIPTOR_TOOL_IDS = Object.freeze(
  [
    ...new Set(
      NODE_LIFECYCLE_TRANSITION_DESCRIPTORS.flatMap((descriptor) => [...descriptor.legalToolIds]),
    ),
  ].toSorted(),
);

export function isNodeLifecycleGate(value: string | null | undefined): value is NodeLifecycleGate {
  return Boolean(value && value in NODE_LIFECYCLE_DESCRIPTOR_BY_GATE);
}

export function lifecycleDescriptorForGate(
  gate: string | null | undefined,
): NodeLifecycleTransitionDescriptor | null {
  return isNodeLifecycleGate(gate) ? NODE_LIFECYCLE_DESCRIPTOR_BY_GATE[gate] : null;
}

export function legalTransitionsForLifecycleGate(gate: string | null | undefined): string[] {
  return [...(lifecycleDescriptorForGate(gate)?.legalToolIds ?? [])];
}

export function nodeLifecycleGateForWorkIntentContextStatus(
  status: string,
): NodeLifecycleGate | "no_local_lifecycle_transition" {
  if (status === "satisfied" || status === "read_only_satisfied") {
    return "node_agent_session_ready";
  }
  return isNodeLifecycleGate(status) ? status : "no_local_lifecycle_transition";
}

export type LifecycleCapabilityTraits = {
  requiresResources: boolean;
  canInspectRepo: boolean;
  canEditSource: boolean;
  canWriteTests: boolean;
  canRunValidation: boolean;
  roleClass?: string;
};

export function lifecycleTransitionToolIdsForCapabilityTraits(
  input: LifecycleCapabilityTraits,
): string[] {
  const transitions = new Set<string>();
  const add = (gate: NodeLifecycleGate) => {
    for (const toolId of NODE_LIFECYCLE_DESCRIPTOR_BY_GATE[gate].legalToolIds) {
      transitions.add(toolId);
    }
  };
  if (input.roleClass !== "human") {
    add("node_agent_session_ready");
  }
  if (
    input.canEditSource ||
    input.canWriteTests ||
    input.canRunValidation ||
    input.roleClass === "implementation" ||
    input.roleClass === "validation" ||
    input.roleClass === "review" ||
    input.roleClass === "closeout"
  ) {
    add("node_agent_session_escalation_required");
  }
  if (input.roleClass === "human") {
    transitions.add("approval.request");
  }
  if (transitions.size === 0) {
    transitions.add("artifact.create");
  }
  return [...transitions].slice(0, 48);
}

export function requiredLifecycleToolIdsForCapabilityTraits(
  input: LifecycleCapabilityTraits,
): string[] {
  if (input.roleClass === "human") {
    return ["approval.request"];
  }
  if (
    input.canInspectRepo ||
    input.canEditSource ||
    input.canWriteTests ||
    input.canRunValidation ||
    input.roleClass
  ) {
    return ["node.agent_session.invoke"];
  }
  return [];
}

export function validateLifecycleDescriptorToolRegistration(input: {
  registeredToolIds: Iterable<string>;
}): { valid: boolean; missingToolIds: string[]; reasonCodes: string[] } {
  const registered = new Set(input.registeredToolIds);
  const missingToolIds = NODE_LIFECYCLE_DESCRIPTOR_TOOL_IDS.filter(
    (toolId) => !registered.has(toolId),
  );
  return {
    valid: missingToolIds.length === 0,
    missingToolIds,
    reasonCodes:
      missingToolIds.length === 0
        ? ["node_lifecycle_descriptor_tool_registry_valid"]
        : [
            "node_lifecycle_descriptor_tool_registry_missing_tools",
            ...missingToolIds.map((toolId) => `missing_lifecycle_tool:${toolId}`),
          ],
  };
}
