export const NODE_LIFECYCLE_GATES = [
  "resource_demand_open",
  "resource_demand_blocked",
  "resource_narrowing_required",
  "resource_ledger_ready",
  "domain_resource_selection_required",
  "domain_resource_selection_blocked",
  "domain_action_gate_blocked",
  "worker_action_ready",
  "post_action_validation",
  "validation_repair_plan_required",
  "validation_repair_patch_required",
  "validation_terminal_blocker",
  "high_capability_escalation_required",
  "evidence_closure",
  "node_lifecycle_root_cause_collapsed",
] as const;

export type NodeLifecycleGate = (typeof NODE_LIFECYCLE_GATES)[number];

export type NodeLifecycleTransitionDescriptor = {
  gate: NodeLifecycleGate;
  legalToolIds: readonly string[];
  handlerRef: string;
  stateMutationTarget:
    | "node_resource_demand_session"
    | "resource_specialist_subturn"
    | "node_resource_ledger"
    | "domain_resource_selection"
    | "node_execution_packet"
    | "worker_loop"
    | "validation"
    | "evidence"
    | "root_cause";
  readbackGate: NodeLifecycleGate;
  rootCauseStage: string;
  canCallGlobalSchedulerAfterTransition: boolean;
};

export const NODE_LIFECYCLE_TRANSITION_DESCRIPTORS: readonly NodeLifecycleTransitionDescriptor[] = [
  {
    gate: "resource_demand_open",
    legalToolIds: [
      "resource.demand.fulfill_exact_handles",
      "resource.scout.dispatch_specialist_subturn",
      "node.execution_packet.attach_resource_demand",
    ],
    handlerRef: "node-lifecycle-handler://node-resource-demand/fulfill-or-narrow/v1",
    stateMutationTarget: "node_resource_demand_session",
    readbackGate: "resource_demand_open",
    rootCauseStage: "node_resource_demand",
    canCallGlobalSchedulerAfterTransition: false,
  },
  {
    gate: "resource_demand_blocked",
    legalToolIds: ["resource.scout.dispatch_specialist_subturn"],
    handlerRef: "node-lifecycle-handler://node-resource-demand/blocker-to-specialist/v1",
    stateMutationTarget: "resource_specialist_subturn",
    readbackGate: "resource_demand_blocked",
    rootCauseStage: "node_resource_demand",
    canCallGlobalSchedulerAfterTransition: false,
  },
  {
    gate: "resource_narrowing_required",
    legalToolIds: [
      "resource.scout.choose_file_from_listing",
      "resource.scout.choose_search_query",
      "resource.scout.choose_window_from_matches",
      "resource.scout.expand_window",
      "resource.scout.contract_window",
      "resource.scout.submit_exact_handles",
      "resource.scout.mark_narrowing_blocked",
    ],
    handlerRef: "node-lifecycle-handler://resource-specialist/exact-handle-selection/v1",
    stateMutationTarget: "resource_specialist_subturn",
    readbackGate: "resource_narrowing_required",
    rootCauseStage: "resource_narrowing",
    canCallGlobalSchedulerAfterTransition: false,
  },
  {
    gate: "resource_ledger_ready",
    legalToolIds: [
      "scheduler.accept_resources_for_work_intent",
      "scheduler.mark_read_only_work_intent_satisfied_from_resources",
      "scheduler.promote_resource_satisfied_work_intent_to_executable",
      "node.execution_packet.mark_resource_ledger_ready",
      "node.execution_packet.require_domain_resource_selection",
    ],
    handlerRef: "node-lifecycle-handler://resource-ledger/accept-or-select-resource/v1",
    stateMutationTarget: "node_resource_ledger",
    readbackGate: "resource_ledger_ready",
    rootCauseStage: "resource_ledger",
    canCallGlobalSchedulerAfterTransition: false,
  },
  {
    gate: "domain_resource_selection_required",
    legalToolIds: ["node.execution_packet.require_domain_resource_selection", "resource.selection.propose"],
    handlerRef: "node-lifecycle-handler://domain-resource-selection/propose/v1",
    stateMutationTarget: "domain_resource_selection",
    readbackGate: "domain_resource_selection_required",
    rootCauseStage: "domain_resource_selection",
    canCallGlobalSchedulerAfterTransition: false,
  },
  {
    gate: "domain_resource_selection_blocked",
    legalToolIds: ["resource.selection.propose"],
    handlerRef: "node-lifecycle-handler://domain-resource-selection/repair-or-terminalize/v1",
    stateMutationTarget: "domain_resource_selection",
    readbackGate: "domain_resource_selection_blocked",
    rootCauseStage: "domain_resource_selection",
    canCallGlobalSchedulerAfterTransition: false,
  },
  {
    gate: "domain_action_gate_blocked",
    legalToolIds: [
      "node.execution_packet.evaluate_action_gate",
      "node.execution_packet.promote_worker_action_ready",
    ],
    handlerRef: "node-lifecycle-handler://node-execution-packet/domain-action-gate/v1",
    stateMutationTarget: "node_execution_packet",
    readbackGate: "domain_action_gate_blocked",
    rootCauseStage: "domain_action_gate",
    canCallGlobalSchedulerAfterTransition: false,
  },
  {
    gate: "worker_action_ready",
    legalToolIds: [
      "worker.context.request_more",
      "worker.context.search",
      "worker.context.search_symbols",
      "worker.context.find_callers",
      "worker.context.find_tests",
      "worker.context.open_around_match",
      "worker.context.expand_window",
      "worker.context.contract_window",
      "worker.context.accept_window",
      "worker.context.open_adjacent",
      "worker.context.report_pattern",
      "worker.context.report_risk",
      "worker.context.report_edit_point",
      "worker.edit.plan",
    ],
    handlerRef: "node-lifecycle-handler://worker/action-ready/v1",
    stateMutationTarget: "worker_loop",
    readbackGate: "worker_action_ready",
    rootCauseStage: "worker_action",
    canCallGlobalSchedulerAfterTransition: false,
  },
  {
    gate: "post_action_validation",
    legalToolIds: [
      "worker.validation.run_structural_default",
      "worker.validation.record_result",
    ],
    handlerRef: "node-lifecycle-handler://worker/post-action-validation/v1",
    stateMutationTarget: "validation",
    readbackGate: "post_action_validation",
    rootCauseStage: "validation",
    canCallGlobalSchedulerAfterTransition: false,
  },
  {
    gate: "validation_repair_plan_required",
    legalToolIds: [
      "worker.context.request_more",
      "worker.context.search",
      "worker.context.search_symbols",
      "worker.context.find_callers",
      "worker.context.find_tests",
      "worker.context.open_around_match",
      "worker.context.expand_window",
      "worker.context.contract_window",
      "worker.context.accept_window",
      "worker.context.open_adjacent",
      "worker.context.report_pattern",
      "worker.context.report_risk",
      "worker.context.report_edit_point",
      "worker.validation.request_repair",
      "worker.validation.record_blocker",
      "worker.escalation.request_high_capability",
    ],
    handlerRef: "node-lifecycle-handler://worker/validation-repair-plan/v1",
    stateMutationTarget: "validation",
    readbackGate: "validation_repair_plan_required",
    rootCauseStage: "validation_repair",
    canCallGlobalSchedulerAfterTransition: false,
  },
  {
    gate: "validation_repair_patch_required",
    legalToolIds: [
      "worker.repair.author_edit",
      "worker.edit.apply_patch",
      "worker.validation.run_structural_default",
      "worker.validation.run",
      "worker.repair.mark_upstream_blocker",
      "worker.escalation.request_high_capability",
    ],
    handlerRef: "node-lifecycle-handler://worker/validation-repair-patch/v1",
    stateMutationTarget: "validation",
    readbackGate: "validation_repair_patch_required",
    rootCauseStage: "validation_repair",
    canCallGlobalSchedulerAfterTransition: false,
  },
  {
    gate: "validation_terminal_blocker",
    legalToolIds: [
      "worker.validation.record_blocker",
      "worker.repair.mark_upstream_blocker",
      "worker.escalation.request_high_capability",
    ],
    handlerRef: "node-lifecycle-handler://worker/validation-terminal-blocker/v1",
    stateMutationTarget: "validation",
    readbackGate: "validation_terminal_blocker",
    rootCauseStage: "validation_repair",
    canCallGlobalSchedulerAfterTransition: false,
  },
  {
    gate: "high_capability_escalation_required",
    legalToolIds: [
      "worker.escalation.execute_high_capability",
      "worker.escalation.mark_unavailable",
    ],
    handlerRef: "node-lifecycle-handler://worker/high-capability-escalation/v1",
    stateMutationTarget: "worker_loop",
    readbackGate: "high_capability_escalation_required",
    rootCauseStage: "worker_escalation",
    canCallGlobalSchedulerAfterTransition: false,
  },
  {
    gate: "evidence_closure",
    legalToolIds: [
      "worker.evidence.claim_from_validation",
      "mission.ledger.apply_evidence_claims",
    ],
    handlerRef: "node-lifecycle-handler://worker/evidence-closure/v1",
    stateMutationTarget: "evidence",
    readbackGate: "evidence_closure",
    rootCauseStage: "evidence",
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
      NODE_LIFECYCLE_TRANSITION_DESCRIPTORS.flatMap((descriptor) => [
        ...descriptor.legalToolIds,
      ]),
    ),
  ].sort(),
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
  if (status === "read_only_satisfied") {
    return "resource_ledger_ready";
  }
  if (status === "satisfied") {
    return "resource_ledger_ready";
  }
  if (status === "partially_satisfied" || status === "blocked") {
    return "node_lifecycle_root_cause_collapsed";
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
  const workerOwnedContext = input.canEditSource || input.canWriteTests;
  if (input.requiresResources && !workerOwnedContext) {
    add("resource_demand_open");
    add("resource_demand_blocked");
    add("resource_narrowing_required");
    add("resource_ledger_ready");
  }
  if (input.canInspectRepo) {
    add("resource_narrowing_required");
    add("resource_ledger_ready");
  }
  if (input.canEditSource || input.canWriteTests) {
    add("domain_resource_selection_required");
    add("domain_resource_selection_blocked");
    add("domain_action_gate_blocked");
    add("worker_action_ready");
    add("evidence_closure");
  }
  if (input.canRunValidation || input.canWriteTests || input.canEditSource) {
    add("post_action_validation");
    add("validation_repair_plan_required");
    add("validation_repair_patch_required");
    add("validation_terminal_blocker");
    add("high_capability_escalation_required");
  }
  if (input.roleClass === "review") {
    transitions.add("review.add_issue");
    transitions.add("review.approve");
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
  if (input.canEditSource || input.canWriteTests) {
    return [
      "node.execution_packet.promote_worker_action_ready",
      "worker.context.request_more",
      "worker.context.search",
      "worker.context.open_around_match",
      "worker.context.accept_window",
    ];
  }
  if (input.requiresResources) {
    return ["resource.scout.choose_search_query", "resource.scout.submit_exact_handles"];
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
