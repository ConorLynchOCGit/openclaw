import { describe, expect, it } from "vitest";
import {
  assertContextScoutSpecialistManifestMetadata,
  compileContextScoutSpecialistToolOutput,
  dispatchContextScoutSpecialistSubturn,
  submitContextScoutSpecialistHandoff,
} from "./context-scout-specialist-subturn.ts";
import {
  markNodeResourceDemandBlocked,
  openNodeResourceDemandSession,
  requestNodeResourceDemand,
} from "./node-resource-demand-session.ts";
import {
  buildResourceObjectiveFocusLegalRefUniverse,
  compileResourceObjectiveFocus,
} from "./resource-objective-focus.ts";
import { openNodeResourceLedger } from "./node-resource-ledger.ts";

function acceptedFocus(input?: { authorityScope?: string[]; focusRefs?: string[]; selectedRefIndex?: number }) {
  const authorityScope = input?.authorityScope ?? [
    "extensions/execution-platform/src/workflows/",
    "extensions/execution-platform/src/codex-bridge/",
    "scripts/",
    "docs/projects/execution-platform/specs/",
  ];
  const focusRefs = input?.focusRefs ?? authorityScope;
  const legalRefUniverse = buildResourceObjectiveFocusLegalRefUniverse({
    runtimeJobId: "runtime-1",
    workflowId: "agent_team.coding",
    graphId: "graph-1",
    consumerNodeId: "impl-1",
    workIntentRef: "work-intent://impl-1",
    nodeExecutionContractRef: "contract://impl-1",
    refs: focusRefs.map((ref) => ({
      ref,
      kind: ref.includes("test") ? "validation_ref" : "target_ref",
      boundedLabel: ref,
      authorityScopeRefs: authorityScope,
    })),
    maxSelectableHandles: 4,
    maxSemanticQuestions: 2,
  });
  const focus = compileResourceObjectiveFocus({
    runtimeJobId: "runtime-1",
    workflowId: "agent_team.coding",
    graphId: "graph-1",
    consumerNodeId: "impl-1",
    workIntentRef: "work-intent://impl-1",
    nodeExecutionContractRef: "contract://impl-1",
    currentObjectiveSlot: "specialist scout context",
    resourceUseKind: "resource_grounding",
    nextUnknown: "Which scoped refs need specialist context for this node?",
    expectedUse: "Use selected legal refs to dispatch a consumer-bound scout subturn.",
    legalRefUniverse,
    selectedRefHandles: [
      legalRefUniverse.handles[input?.selectedRefIndex ?? 0]?.handle ??
        legalRefUniverse.handles[0]!.handle,
    ],
    selectedSemanticQuestions: ["What scoped context should the specialist inspect?"],
  });
  return { focus, legalRefUniverse };
}

function openDemandAndLedger() {
  const focus = acceptedFocus();
  const opened = openNodeResourceDemandSession({
    runtimeJobId: "runtime-1",
    workflowId: "agent_team.coding",
    graphId: "graph-1",
    consumerNodeId: "impl-1",
    consumerBranchId: "branch-1",
    workIntentRef: "work-intent://impl-1",
    nodeExecutionContractRef: "contract://impl-1",
    nodeExecutionPacketRef: "packet://impl-1",
    capabilityId: "implementation_microtask",
    evidenceMode: ["changed_file_evidence", "validation_evidence"],
    targetCommitmentIds: ["C-1"],
    authorityScope: [
      "extensions/execution-platform/src/workflows/",
      "extensions/execution-platform/src/codex-bridge/",
      "scripts/",
      "docs/projects/execution-platform/specs/",
    ],
    demandReason:
      "Need node-local context for the specialist scout implementation boundary.",
    expectedUse:
      "Use the context to choose exact source refs and validation guidance for this node.",
    resourceObjectiveFocus: focus.focus,
    legalRefUniverse: focus.legalRefUniverse,
  });
  expect(opened.session).not.toBeNull();
  const fulfilled = requestNodeResourceDemand({
    session: opened.session!,
    requestKind: "file_window",
    fileRef: "extensions/execution-platform/src/workflows/node-resource-demand-session.ts",
    lineStart: 1,
    lineEnd: 140,
    reason: "Open the existing node resource demand contract.",
    expectedUse: "Use the direct file window before deciding whether scout is needed.",
    boundedSnapshotRefs: [
      "file-window://extensions/execution-platform/src/workflows/node-resource-demand-session.ts#L1-L140:abc",
    ],
  });
  expect(fulfilled.session).not.toBeNull();
  const ledger = openNodeResourceLedger({
    runtimeJobId: "runtime-1",
    workflowId: "agent_team.coding",
    graphId: "graph-1",
    consumerNodeId: "impl-1",
    consumerBranchId: "branch-1",
    workIntentRef: "work-intent://impl-1",
    nodeExecutionContractRef: "contract://impl-1",
    nodeExecutionPacketRef: "packet://impl-1",
    nodeResourceDemandSessionRef: fulfilled.session!.sessionRef,
    capabilityId: "implementation_microtask",
    evidenceMode: ["changed_file_evidence", "validation_evidence"],
    targetCommitmentIds: ["C-1"],
    authorityScope: fulfilled.session!.authorityScope,
  });
  expect(ledger.ledger).not.toBeNull();
  return {
    session: fulfilled.session!,
    request: fulfilled.request!,
    fulfillment: fulfilled.fulfillment!,
    ledger: ledger.ledger!,
  };
}

describe("ContextScoutSpecialistSubturn", () => {
  it("blocks dispatch without a consumer-bound NodeResourceDemandSession", () => {
    const result = dispatchContextScoutSpecialistSubturn({
      candidateRefs: ["extensions/execution-platform/src/workflows/node-resource-demand-session.ts"],
      scoutReason: "Need cross-file context.",
      expectedUse: "Use it for implementation planning.",
    });

    expect(result.status).toBe("needs_review");
    expect(result.reasonCodes).toContain(
      "resource_scout_specialist_node_resource_demand_session_missing",
    );
    expect(JSON.stringify(result.metadata)).not.toContain("Need cross-file context");
  });

  it("requires direct fulfillment or explicit workflow grant before specialist scout dispatch", () => {
    const focus = acceptedFocus({
      authorityScope: ["extensions/execution-platform/src/workflows/"],
    });
    const opened = openNodeResourceDemandSession({
      runtimeJobId: "runtime-1",
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      consumerNodeId: "impl-1",
      capabilityId: "implementation_microtask",
      evidenceMode: ["changed_file_evidence"],
      authorityScope: ["extensions/execution-platform/src/workflows/"],
      demandReason: "Need context.",
      expectedUse: "Use context.",
      resourceObjectiveFocus: focus.focus,
      legalRefUniverse: focus.legalRefUniverse,
    });

    const result = dispatchContextScoutSpecialistSubturn({
      nodeResourceDemandSession: opened.session,
      specialistTrigger: "cross_file_pattern_mapping",
      candidateRefs: ["extensions/execution-platform/src/workflows/node-resource-demand-session.ts"],
      scoutReason: "Need cross-file pattern mapping.",
      expectedUse: "Use the specialist result to populate the node ledger.",
    });

    expect(result.status).toBe("needs_review");
    expect(result.reasonCodes).toContain(
      "resource_scout_specialist_requires_direct_fulfillment_first",
    );
  });

  it("dispatches a consumer-bound specialist subturn after direct fulfillment with manifest metadata only", () => {
    const { session, request, fulfillment, ledger } = openDemandAndLedger();
    const result = dispatchContextScoutSpecialistSubturn({
      nodeResourceDemandSession: session,
      nodeResourceDemandRequest: request,
      nodeResourceDemandFulfillment: fulfillment,
      nodeResourceLedger: ledger,
      specialistTrigger: "cross_file_pattern_mapping",
      directFulfillmentAttempted: true,
      requestedContextKinds: ["repo_context", "validation_refs"],
      candidateRefs: [
        "extensions/execution-platform/src/workflows/node-resource-demand-session.ts",
        "extensions/execution-platform/src/workflows/node-resource-ledger.ts",
        "extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.ts",
      ],
      knownContextRefs: [fulfillment.fulfillmentRef],
      scoutReason:
        "Direct file windows are present, but a specialist should map cross-file patterns and validation refs.",
      expectedUse:
        "Use the specialist handoff as node-local context for target selection.",
      providerProfile: {
        modelRef: "qwen/qwen3-coder-next",
        providerId: "openrouter",
        providerProfileRef: "provider-profile://qwen/context-scout",
        maxInputBytes: 32_000,
        timeoutMs: 90_000,
      },
    });

    expect(result.status).toBe("succeeded");
    expect(result.request).toMatchObject({
      artifactKind: "resource_scout_specialist_subturn_request",
      consumerNodeId: "impl-1",
      nodeResourceDemandSessionRef: session.sessionRef,
      nodeResourceLedgerRef: ledger.ledgerRef,
      directFulfillmentAttempted: true,
      semanticQualityJudgedByDeterministicCode: false,
      rawPromptStored: false,
      rawResponseStored: false,
    });
    expect(result.metadata).toMatchObject({
      contextScoutSpecialistRequestManifest: {
        artifactKind: "resource_scout_specialist_subturn_request_manifest",
        directFulfillmentAttempted: true,
        candidateRefCount: 3,
      },
      nodeResourceLedgerManifest: {
        ledgerRef: ledger.ledgerRef,
      },
    });
    expect(JSON.stringify(result.metadata)).not.toContain("Direct file windows are present");
  });

  it("allows selected symbolic focus handles as specialist candidate seeds without widening final authority", () => {
    const focus = acceptedFocus({
      authorityScope: ["extensions/execution-platform/src/workflows/"],
      focusRefs: ["validationCommandRefs", "extensions/execution-platform/src/workflows/"],
      selectedRefIndex: 0,
    });
    const opened = openNodeResourceDemandSession({
      runtimeJobId: "runtime-1",
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      consumerNodeId: "impl-1",
      consumerBranchId: "branch-1",
      workIntentRef: "work-intent://impl-1",
      nodeExecutionContractRef: "contract://impl-1",
      nodeExecutionPacketRef: "packet://impl-1",
      capabilityId: "implementation_microtask",
      evidenceMode: ["changed_file_evidence", "validation_evidence"],
      targetCommitmentIds: ["C-1"],
      authorityScope: ["extensions/execution-platform/src/workflows/"],
      demandReason:
        "Need specialist narrowing from a symbolic validation handle selected by focus.",
      expectedUse:
        "Use the specialist result to choose exact file windows and validation guidance.",
      resourceObjectiveFocus: focus.focus,
      legalRefUniverse: focus.legalRefUniverse,
    });
    expect(opened.session).not.toBeNull();
    const blocked = markNodeResourceDemandBlocked({
      session: opened.session!,
      blockerSummary:
        "The selected focus handle is symbolic and requires specialist model narrowing.",
      reasonCodes: ["node_resource_demand_selected_ref_kind_requires_specialist:other"],
    });

    const result = dispatchContextScoutSpecialistSubturn({
      nodeResourceDemandSession: blocked.session,
      nodeResourceDemandBlocker: blocked.blocker,
      specialistTrigger: "direct_fulfillment_insufficient",
      directFulfillmentAttempted: true,
      candidateRefs: ["validationCommandRefs"],
      scoutReason: "Narrow the symbolic validation handle into exact usable context.",
      expectedUse:
        "Return exact context handles or a model-authored specialist blocker.",
    });

    expect(result.status).toBe("succeeded");
    expect(result.request?.candidateRefs).toEqual(["validationCommandRefs"]);

    const unauthorizedHandoff = submitContextScoutSpecialistHandoff({
      request: result.request!,
      nodeResourceLedger: result.ledger!,
      relevantFiles: [
        {
          fileRef: "src/auth/session.ts",
          summary: "This exact output ref remains outside authority.",
        },
      ],
    });
    expect(unauthorizedHandoff.status).toBe("needs_review");
    expect(unauthorizedHandoff.reasonCodes).toContain(
      "node_resource_ledger_authority_scope_violation",
    );
  });

  it("submits model-authored handoff entries to the consumer node ledger", () => {
    const { session, request, fulfillment, ledger } = openDemandAndLedger();
    const dispatch = dispatchContextScoutSpecialistSubturn({
      nodeResourceDemandSession: session,
      nodeResourceDemandRequest: request,
      nodeResourceDemandFulfillment: fulfillment,
      nodeResourceLedger: ledger,
      specialistTrigger: "cross_file_pattern_mapping",
      directFulfillmentAttempted: true,
      candidateRefs: [
        "extensions/execution-platform/src/workflows/node-resource-demand-session.ts",
        "extensions/execution-platform/src/workflows/node-resource-ledger.ts",
        "extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts",
      ],
      scoutReason: "Need the specialist to map the node resource demand to runtime tools.",
      expectedUse: "Use for exact target selection and validation guidance.",
    });
    const result = submitContextScoutSpecialistHandoff({
      request: dispatch.request!,
      nodeResourceLedger: dispatch.ledger!,
      handoffSummary:
        "resource demand and ledger tools already exist; wire specialist scout tools beside them.",
      relevantFiles: [
        {
          fileRef: "extensions/execution-platform/src/workflows/node-resource-demand-session.ts",
          summary: "Defines the demand lifecycle and scout dispatch transition.",
          details:
            "This detailed semantic body is intentionally not allowed to appear in metadata.",
          expectedUse: "Use the transition list when wiring specialist tools.",
        },
      ],
      existingPatterns: [
        {
          fileRef: "extensions/execution-platform/src/workflows/node-resource-ledger.ts",
          summary: "Ledger append helpers already enforce payload-backed entries.",
        },
      ],
      risks: [
        {
          summary: "Graph-visible scout fanout must not be reintroduced.",
          severity: "high",
        },
      ],
      editPoints: [
        {
          fileRef: "extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts",
          summary: "Register only the small specialist scout verbs.",
        },
      ],
      validationSuggestions: [
        {
          testRef:
            "extensions/execution-platform/src/workflows/context-scout-specialist-subturn.test.ts",
          summary: "Run the specialist subturn unit tests.",
        },
      ],
      limitations: [
        {
          summary: "This proof does not retire the old context synthesis executor.",
          severity: "medium",
        },
      ],
      providerDiagnostics: [
        {
          modelRef: "qwen/qwen3-coder-next",
          providerId: "openrouter",
          requestByteCount: 18_500,
          timeoutMs: 90_000,
          timeoutState: "not_timed_out",
          nativeFinishReason: "stop",
          choiceCount: 1,
          contentLengths: [1_240],
          parsedContentLength: 1_240,
          retryNumber: 0,
          inputBundleHash: "sha256:abc",
        },
      ],
    });

    expect(result.status).toBe("succeeded");
    expect(result.ledger?.entryRefs.length).toBe(7);
    expect(result.handoff).toMatchObject({
      artifactKind: "resource_scout_specialist_handoff",
      status: "fulfilled",
      consumerNodeId: "impl-1",
      semanticQualityJudgedByDeterministicCode: false,
    });
    expect(result.metadata).toMatchObject({
      contextScoutSpecialistHandoffManifest: {
        relevantFileCount: 1,
        existingPatternCount: 1,
        riskCount: 1,
        editPointCount: 1,
        validationSuggestionCount: 1,
        limitationCount: 1,
        providerDiagnosticCount: 1,
        ledgerEntryCount: 7,
      },
      nodeResourceLedgerManifest: {
        entryCount: 7,
        providerDiagnosticCount: 1,
      },
    });
    const metadataText = JSON.stringify(result.metadata);
    expect(metadataText).not.toContain("detailed semantic body");
    expect(metadataText).not.toContain("resource demand and ledger tools already exist");
  });

  it("blocks handoff refs outside authority instead of widening executable context", () => {
    const { session, request, fulfillment, ledger } = openDemandAndLedger();
    const dispatch = dispatchContextScoutSpecialistSubturn({
      nodeResourceDemandSession: session,
      nodeResourceDemandRequest: request,
      nodeResourceDemandFulfillment: fulfillment,
      nodeResourceLedger: ledger,
      specialistTrigger: "cross_file_pattern_mapping",
      directFulfillmentAttempted: true,
      candidateRefs: ["extensions/execution-platform/src/workflows/node-resource-demand-session.ts"],
      scoutReason: "Need specialist context.",
      expectedUse: "Use it for target selection.",
    });

    const result = submitContextScoutSpecialistHandoff({
      request: dispatch.request!,
      nodeResourceLedger: dispatch.ledger!,
      relevantFiles: [
        {
          fileRef: "src/auth/session.ts",
          summary: "This unauthorized file should not be accepted.",
        },
      ],
    });

    expect(result.status).toBe("needs_review");
    expect(result.reasonCodes).toContain("node_resource_ledger_authority_scope_violation");
  });

  it("keeps large handoff bodies out of metadata manifests", () => {
    const { session, request, fulfillment, ledger } = openDemandAndLedger();
    const dispatch = dispatchContextScoutSpecialistSubturn({
      nodeResourceDemandSession: session,
      nodeResourceDemandRequest: request,
      nodeResourceDemandFulfillment: fulfillment,
      nodeResourceLedger: ledger,
      specialistTrigger: "multi_ref_exploration",
      directFulfillmentAttempted: true,
      candidateRefs: [
        "extensions/execution-platform/src/workflows/node-resource-demand-session.ts",
        "extensions/execution-platform/src/workflows/node-resource-ledger.ts",
      ],
      scoutReason: "Need a larger context mapping without metadata overflow.",
      expectedUse: "Use it for target selection.",
    });
    const hugeDetails = "substantive specialist detail ".repeat(500);
    const result = submitContextScoutSpecialistHandoff({
      request: dispatch.request!,
      nodeResourceLedger: dispatch.ledger!,
      relevantFiles: Array.from({ length: 30 }, (_, index) => ({
        fileRef:
          index % 2 === 0
            ? "extensions/execution-platform/src/workflows/node-resource-demand-session.ts"
            : "extensions/execution-platform/src/workflows/node-resource-ledger.ts",
        summary: `Relevant specialist file ${index + 1}.`,
        details: hugeDetails,
      })),
      existingPatterns: Array.from({ length: 20 }, (_, index) => ({
        summary: `Pattern ${index + 1} should stay payload-backed.`,
        details: hugeDetails,
      })),
    });

    expect(result.status).toBe("succeeded");
    const metadataText = JSON.stringify(result.metadata);
    expect(Buffer.byteLength(metadataText, "utf8")).toBeLessThan(24_000);
    expect(metadataText).not.toContain("substantive specialist detail");
    expect(() => assertContextScoutSpecialistManifestMetadata(result.metadata)).not.toThrow();
  });

  it("exposes specialist scout small verbs through bounded runtime tool output compiler", () => {
    const { session, request, fulfillment, ledger } = openDemandAndLedger();
    const dispatch = compileContextScoutSpecialistToolOutput({
      toolId: "resource.scout.dispatch_specialist_subturn",
      volatileInput: {
        nodeResourceDemandSession: session,
        nodeResourceDemandRequest: request,
        nodeResourceDemandFulfillment: fulfillment,
        nodeResourceLedger: ledger,
      },
      metadata: {
        specialistTrigger: "cross_file_pattern_mapping",
        directFulfillmentAttempted: true,
        candidateRefs: [
          "extensions/execution-platform/src/workflows/node-resource-demand-session.ts",
          "extensions/execution-platform/src/workflows/node-resource-ledger.ts",
        ],
        scoutReason: "Need specialist mapping.",
        expectedUse: "Use mapping to populate ledger entries.",
      },
    });
    expect(dispatch.status).toBe("succeeded");

    const submit = compileContextScoutSpecialistToolOutput({
      toolId: "resource.scout.submit_specialist_handoff",
      volatileInput: {
        contextScoutSpecialistRequest: dispatch.request,
        nodeResourceLedger: dispatch.ledger,
      },
      metadata: {
        relevantFiles: [
          {
            fileRef: "extensions/execution-platform/src/workflows/node-resource-ledger.ts",
            summary: "Ledger tools are the direct implementation pattern.",
          },
        ],
      },
    });

    expect(submit.status).toBe("succeeded");
    expect(submit.metadata).toMatchObject({
      contextScoutSpecialistHandoffManifest: {
        relevantFileCount: 1,
      },
    });
  });

  it("keeps blocked direct-demand sessions eligible for specialist scout without graph fanout", () => {
    const { session } = openDemandAndLedger();
    const blocked = markNodeResourceDemandBlocked({
      session,
      blockerSummary: "Direct fulfillment could not answer the cross-file pattern question.",
      reasonCodes: ["resource_demand_blocked_needs_specialist_or_revision"],
    });

    const result = dispatchContextScoutSpecialistSubturn({
      nodeResourceDemandSession: blocked.session,
      nodeResourceDemandBlocker: blocked.blocker,
      specialistTrigger: "direct_fulfillment_insufficient",
      candidateRefs: ["extensions/execution-platform/src/workflows/node-resource-demand-session.ts"],
      scoutReason: "Need specialist pass after direct demand blocker.",
      expectedUse: "Use the output as node-local ledger context.",
    });

    expect(result.status).toBe("succeeded");
    expect(JSON.stringify(result)).not.toContain("newNodes");
    expect(JSON.stringify(result)).not.toContain("context_synthesis");
  });
});
