import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXECUTION_WORKFLOW_REGISTRY,
  type WorkflowRegistry,
} from "../workflows/workflow-registry.ts";
import type { IntakeRouteContract } from "./intake-route-contract.ts";
import { validateIntentFrontDoorDecision } from "./intent-validator.ts";
import { evaluateRouterEscalationPolicy } from "./router-escalation-policy.ts";
import {
  createBaseCanonicalRouterOutput,
  createCanonicalRouterAction,
  parseCanonicalRouterOutput,
} from "./router-schema.ts";
import {
  buildWorkflowSummaryIndex,
  createWorkflowSummaryIndexEntry,
} from "./workflow-summary-index.ts";

const auth = { authenticated: true, actorId: "operator", sessionId: "session-1" };

function index(registry: WorkflowRegistry = DEFAULT_EXECUTION_WORKFLOW_REGISTRY) {
  return buildWorkflowSummaryIndex(registry, { generatedAt: "2026-05-06T00:00:00.000Z" });
}

function codingOutput(overrides = {}) {
  return createBaseCanonicalRouterOutput({
    route: "workflow_execution",
    responseMode: "create_runtime_job",
    executeNow: true,
    workflowId: "agent_team.coding",
    jobType: "executor.agent_team",
    confidence: 0.95,
    requestedActions: [createCanonicalRouterAction("code_edit", "bounded edit", 0.95)],
    requestedAuthority: "local_yolo",
    sideEffectClass: "code_edit",
    ...overrides,
  });
}

const codingProofContract: IntakeRouteContract = {
  artifactKind: "intake_route_contract" as const,
  schemaVersion: "intent-front-door.intake-route-contract.v1" as const,
  contractId: "test-coding-proof-contract",
  expectedPrimaryOutcomeKinds: ["implement_existing_system", "prove_existing_system"],
  requiredExecutorCapabilities: ["code_edit", "test", "review", "closeout"],
  requiredRequestedActions: ["code_edit", "test", "review", "closeout"],
  expectedSubjectKinds: ["workflow"],
  reasonCodes: ["test_requires_coding_executor_capability_profile"],
  rawPromptStored: false as const,
  rawResponseStored: false as const,
};

describe("Intent front door validator", () => {
  it("accepts valid chat/status and plan-only routes without workflow execution", () => {
    expect(
      validateIntentFrontDoorDecision({
        parseResult: parseCanonicalRouterOutput(
          createBaseCanonicalRouterOutput({
            route: "chat_response",
            responseMode: "answer_in_chat",
          }),
        ),
      }),
    ).toMatchObject({ outcome: "accepted", accepted: true, runtimeJobCreated: false });
    expect(
      validateIntentFrontDoorDecision({
        parseResult: parseCanonicalRouterOutput(
          createBaseCanonicalRouterOutput({
            route: "status_response",
            responseMode: "answer_in_chat",
          }),
        ),
      }),
    ).toMatchObject({ outcome: "accepted", accepted: true });
    expect(
      validateIntentFrontDoorDecision({
        parseResult: parseCanonicalRouterOutput(
          createBaseCanonicalRouterOutput({
            route: "plan_only",
            responseMode: "create_plan_only",
          }),
        ),
      }),
    ).toMatchObject({ outcome: "plan_only_allowed", accepted: true });
  });

  it("accepts coding workflow only after schema, auth, workflow, authority, and side-effect checks", () => {
    const decision = validateIntentFrontDoorDecision({
      parseResult: parseCanonicalRouterOutput(codingOutput()),
      workflowSummaryIndex: index(),
      auth,
      authority: {
        snapshotFresh: true,
        supportedAuthorityProfiles: ["read_only", "local_yolo"],
      },
    });

    expect(decision).toMatchObject({
      outcome: "accepted",
      accepted: true,
      workflowId: "agent_team.coding",
      jobType: "executor.agent_team",
      authorityGranted: false,
      workQueueLifecycleMutationAllowed: false,
    });
  });

  it("does not treat platform runtime-job compilation as a missing executor capability", () => {
    const decision = validateIntentFrontDoorDecision({
      parseResult: parseCanonicalRouterOutput(
        codingOutput({
          requestedCapabilities: ["code_edit", "test", "review", "closeout", "runtime_job_compile"],
          requestedActions: [
            createCanonicalRouterAction("code_edit", "bounded edit", 0.95),
            createCanonicalRouterAction("test", "run validation", 0.95),
            createCanonicalRouterAction("review", "review result", 0.95),
            createCanonicalRouterAction("closeout", "closeout evidence", 0.95),
          ],
          reasonCodes: ["router_primary_outcome:harden_existing_system"],
        }),
      ),
      workflowSummaryIndex: index(),
      auth,
      authority: {
        snapshotFresh: true,
        supportedAuthorityProfiles: ["read_only", "local_yolo"],
      },
    });

    expect(decision.outcome).toBe("accepted");
  });

  it("blocks invalid schema, missing auth, unknown workflow, disabled workflow, and missing ids", () => {
    expect(
      validateIntentFrontDoorDecision({
        parseResult: parseCanonicalRouterOutput({ route: "workflow_execution" }),
      }).outcome,
    ).toBe("blocked");

    expect(
      validateIntentFrontDoorDecision({
        parseResult: parseCanonicalRouterOutput(codingOutput()),
        workflowSummaryIndex: index(),
      }).reasonCodes,
    ).toContain("authenticated_session_required");

    expect(
      validateIntentFrontDoorDecision({
        parseResult: parseCanonicalRouterOutput(
          codingOutput({ workflowId: "workflow.unknown", jobType: "executor.workflow" }),
        ),
        workflowSummaryIndex: index(),
        auth,
        authority: { snapshotFresh: true, supportedAuthorityProfiles: [] },
      }).reasonCodes,
    ).toContain("workflow_not_registered");

    const disabledRegistry = {
      artifactKind: "execution_workflow_registry" as const,
      workflows: [
        {
          ...DEFAULT_EXECUTION_WORKFLOW_REGISTRY.workflows[0]!,
          status: "disabled" as const,
        },
      ],
    };
    expect(
      validateIntentFrontDoorDecision({
        parseResult: parseCanonicalRouterOutput(codingOutput()),
        workflowSummaryIndex: index(disabledRegistry),
        auth,
        authority: { snapshotFresh: true, supportedAuthorityProfiles: ["local_yolo"] },
      }).reasonCodes,
    ).toContain("workflow_not_executable:disabled");
  });

  it("clarifies low-confidence execution and ignores router-authored authority while blocking stale snapshots", () => {
    expect(
      validateIntentFrontDoorDecision({
        parseResult: parseCanonicalRouterOutput(codingOutput({ confidence: 0.5 })),
        workflowSummaryIndex: index(),
        auth,
        authority: { snapshotFresh: true, supportedAuthorityProfiles: ["local_yolo"] },
      }).outcome,
    ).toBe("clarification_required");

    const authorityIgnored = validateIntentFrontDoorDecision({
      parseResult: parseCanonicalRouterOutput(
        codingOutput({ requestedAuthority: "production_deploy" }),
      ),
      workflowSummaryIndex: index(),
      auth,
      authority: { snapshotFresh: true, supportedAuthorityProfiles: ["local_yolo"] },
    });
    expect(authorityIgnored.outcome).toBe("accepted");
    expect(authorityIgnored.reasonCodes.some((code) => code.includes("authority"))).toBe(false);

    expect(
      validateIntentFrontDoorDecision({
        parseResult: parseCanonicalRouterOutput(codingOutput()),
        workflowSummaryIndex: index(),
        auth,
        authority: { snapshotFresh: false, supportedAuthorityProfiles: ["local_yolo"] },
      }).reasonCodes,
    ).toContain("authority_snapshot_stale");
  });

  it("ignores structured router approval fields at the front door", () => {
    const output = codingOutput({
      requiresApproval: true,
      approvalKind: "local_yolo",
    });
    expect(
      validateIntentFrontDoorDecision({
        parseResult: parseCanonicalRouterOutput(output),
        workflowSummaryIndex: index(),
        auth,
        authority: { snapshotFresh: true, supportedAuthorityProfiles: ["local_yolo"] },
      }).outcome,
    ).toBe("accepted");
    expect(
      validateIntentFrontDoorDecision({
        parseResult: parseCanonicalRouterOutput(output),
        workflowSummaryIndex: index(),
        auth,
        authority: {
          snapshotFresh: true,
          supportedAuthorityProfiles: ["local_yolo"],
          approvalRefs: ["local_yolo"],
        },
      }).outcome,
    ).toBe("accepted");
  });

  it("does not run owner-default approval satisfaction at the front door", () => {
    const output = codingOutput({
      requiresApproval: true,
      approvalKind: null,
      requestedAuthority: null,
    });
    const decision = validateIntentFrontDoorDecision({
      parseResult: parseCanonicalRouterOutput(output),
      workflowSummaryIndex: index(),
      auth,
      authority: {
        snapshotFresh: true,
        supportedAuthorityProfiles: ["read_only", "local_yolo"],
        defaultEnabledAuthorityProfiles: ["local_yolo"],
      },
    });

    expect(decision.outcome).toBe("accepted");
    expect(decision.reasonCodes).not.toContain("approval_satisfied_by_owner_default_authority");
    expect(decision.authorityGranted).toBe(false);
  });

  it("ignores non-authority approval labels at the front door", () => {
    const output = codingOutput({
      requiresApproval: true,
      approvalKind: "operator_review",
      requestedAuthority: null,
    });
    const decision = validateIntentFrontDoorDecision({
      parseResult: parseCanonicalRouterOutput(output),
      workflowSummaryIndex: index(),
      auth,
      authority: {
        snapshotFresh: true,
        supportedAuthorityProfiles: ["read_only", "local_yolo"],
        defaultEnabledAuthorityProfiles: ["local_yolo"],
      },
    });

    expect(decision.outcome).toBe("accepted");
    expect(decision.reasonCodes).not.toContain("approval_satisfied_by_owner_default_authority");
  });

  it("does not block supported non-default approval labels at the front door", () => {
    const output = codingOutput({
      requiresApproval: true,
      approvalKind: "outbound_readonly",
      requestedAuthority: null,
    });
    const decision = validateIntentFrontDoorDecision({
      parseResult: parseCanonicalRouterOutput(output),
      workflowSummaryIndex: index(),
      auth,
      authority: {
        snapshotFresh: true,
        supportedAuthorityProfiles: ["read_only", "local_yolo", "outbound_readonly"],
        defaultEnabledAuthorityProfiles: ["local_yolo"],
      },
    });

    expect(decision.outcome).toBe("accepted");
  });

  it("does not convert high-risk router approval flags into front-door approval blockers", () => {
    const output = codingOutput({
      requiresApproval: true,
      approvalKind: null,
      requestedAuthority: null,
      requestedActions: [createCanonicalRouterAction("install_dependency", "install", 0.9)],
      sideEffectClass: "install_dependency",
    });
    const decision = validateIntentFrontDoorDecision({
      parseResult: parseCanonicalRouterOutput(output),
      workflowSummaryIndex: index(),
      auth,
      authority: {
        snapshotFresh: true,
        supportedAuthorityProfiles: ["read_only", "local_yolo"],
        defaultEnabledAuthorityProfiles: ["local_yolo"],
      },
    });

    expect(decision.outcome).toBe("accepted");
  });

  it("blocks raw storage flags, Work Queue lifecycle mutation, and production side-effect mismatch", () => {
    expect(
      validateIntentFrontDoorDecision({
        parseResult: parseCanonicalRouterOutput({
          ...createBaseCanonicalRouterOutput({
            route: "chat_response",
            responseMode: "answer_in_chat",
          }),
          rawPromptStored: true,
        }),
      }).outcome,
    ).toBe("blocked");
    expect(
      validateIntentFrontDoorDecision({
        parseResult: parseCanonicalRouterOutput(codingOutput()),
        workflowSummaryIndex: index(),
        auth,
        authority: {
          snapshotFresh: true,
          supportedAuthorityProfiles: ["local_yolo"],
          lifecycleMutationRequested: true,
        },
      }).reasonCodes,
    ).toContain("work_queue_lifecycle_mutation_rejected");
    expect(
      validateIntentFrontDoorDecision({
        parseResult: parseCanonicalRouterOutput(
          codingOutput({ sideEffectClass: "production_side_effect" }),
        ),
        workflowSummaryIndex: index(),
        auth,
        authority: { snapshotFresh: true, supportedAuthorityProfiles: ["local_yolo"] },
      }).reasonCodes,
    ).toContain("side_effect_class_incompatible_with_workflow_contract");
  });

  it("respects escalation outcomes without parsing English", () => {
    const output = codingOutput();
    expect(
      validateIntentFrontDoorDecision({
        parseResult: parseCanonicalRouterOutput(output),
        workflowSummaryIndex: index(),
        auth,
        authority: { snapshotFresh: true, supportedAuthorityProfiles: ["local_yolo"] },
        escalationDecision: evaluateRouterEscalationPolicy({
          schemaValid: true,
          authoritySnapshotFresh: false,
          routerOutput: output,
        }),
      }).outcome,
    ).toBe("blocked");
    expect(
      validateIntentFrontDoorDecision({
        parseResult: parseCanonicalRouterOutput(output),
        workflowSummaryIndex: index(),
        auth,
        authority: { snapshotFresh: true, supportedAuthorityProfiles: ["local_yolo"] },
        escalationDecision: evaluateRouterEscalationPolicy({
          schemaValid: true,
          workQueueControlTargetAmbiguous: true,
          routerOutput: createBaseCanonicalRouterOutput({
            route: "work_queue_control",
            responseMode: "apply_control",
          }),
        }),
      }).outcome,
    ).toBe("clarification_required");
  });

  it("can validate against supplied workflow summaries without registry mutation", () => {
    const summary = createWorkflowSummaryIndexEntry(
      DEFAULT_EXECUTION_WORKFLOW_REGISTRY.workflows[0]!,
    );
    expect(
      validateIntentFrontDoorDecision({
        parseResult: parseCanonicalRouterOutput(codingOutput()),
        workflowSummaries: [summary],
        auth,
        authority: { snapshotFresh: true, supportedAuthorityProfiles: ["local_yolo"] },
      }),
    ).toMatchObject({
      outcome: "accepted",
      runtimeJobCreated: false,
      workQueueLifecycleMutationAllowed: false,
    });
  });

  it("accepts an intake route contract when coding executes and the planning workflow is only the subject", () => {
    const decision = validateIntentFrontDoorDecision({
      parseResult: parseCanonicalRouterOutput(
        codingOutput({
          subjectWorkflowIds: ["agent_team.architecture"],
          targetSubjectRefs: [
            {
              targetKind: "workflow",
              targetRef: "workflow://agent_team.architecture",
              confidence: 0.95,
            },
          ],
          requestedActions: [
            createCanonicalRouterAction("code_edit", "implement the framework", 0.95),
            createCanonicalRouterAction("test", "run proof validation", 0.95),
            createCanonicalRouterAction("review", "review proof output", 0.95),
            createCanonicalRouterAction("closeout", "closeout evidence", 0.95),
          ],
          reasonCodes: ["router_primary_outcome:implement_existing_system"],
        }),
      ),
      workflowSummaryIndex: index(),
      auth,
      authority: {
        snapshotFresh: true,
        supportedAuthorityProfiles: ["read_only", "local_yolo"],
      },
      intakeRouteContract: codingProofContract,
    });

    expect(decision.outcome).toBe("accepted");
    expect(decision.reasonCodes).toContain("intake_route_contract_validated");
  });

  it("rejects a planning executor for a coding-proof intake route contract", () => {
    const output = createBaseCanonicalRouterOutput({
      route: "workflow_execution",
      responseMode: "create_runtime_job",
      executeNow: true,
      executorWorkflowId: "agent_team.architecture",
      workflowId: "agent_team.architecture",
      jobType: "executor.workflow",
      confidence: 0.95,
      objectiveSummary: "Plan the named workflow.",
      requestedActions: [createCanonicalRouterAction("plan", "draft planning output", 0.95)],
      requestedCapabilities: ["plan", "action_graph_proposal", "runtime_job_compile", "closeout"],
      requestedAuthority: "local_yolo",
      sideEffectClass: "read_only",
      reasonCodes: ["router_primary_outcome:produce_plan"],
    });
    const decision = validateIntentFrontDoorDecision({
      parseResult: parseCanonicalRouterOutput(output),
      workflowSummaryIndex: index(),
      auth,
      authority: {
        snapshotFresh: true,
        supportedAuthorityProfiles: ["read_only", "local_yolo"],
      },
      intakeRouteContract: codingProofContract,
    });

    expect(decision.outcome).toBe("needs_review");
    expect(decision.reasonCodes).toEqual(
      expect.arrayContaining([
        "intake_route_contract_primary_outcome_mismatch",
        "intake_route_contract_executor_capability_missing:code_edit",
      ]),
    );
    expect(decision.reasonCodes).toContain(
      "intake_route_contract_actions_deferred_to_requirement_map",
    );
  });
});
