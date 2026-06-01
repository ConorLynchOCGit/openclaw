import { describe, expect, it } from "vitest";
import type {
  ContextScoutExecutionPacket,
  ContextScoutSingleUnitOverProfileBlocker,
} from "./context-scout-execution-packet.ts";
import {
  buildContextScoutFieldRepairRequest,
  assertContextScopeRevisionManifestMetadata,
  buildContextScopeRevisionLegalWindows,
  buildContextScopeRevisionPrompt,
  buildContextScopeRevisionRepairRequest,
  buildContextScopeRevisionRequest,
  compileContextScopeRevisionDecision,
  contextScopeRevisionDecisionMetadata,
  contextScopeRevisionRequestMetadata,
  contextScopeRevisionCompileInputFromDecision,
  parseContextScopeRevisionProposal,
} from "./context-scope-revision.ts";

function packet(): ContextScoutExecutionPacket {
  return {
    artifactKind: "resource_scout_execution_packet",
    schemaVersion: "execution-platform.resource-scout-execution-packet.v1",
    packetId: "packet-1",
    packetRef: "runtime-job://job-1/runtime-work-graph/graph-1/resource-scout/execution-packet/node-1/packet-1",
    runtimeJobId: "job-1",
    workflowId: "workflow.generic",
    graphId: "graph-1",
    nodeId: "node-1",
    targetNodeIds: ["consumer-1"],
    targetCommitmentIds: ["commitment-1"],
    resourceRequirementRefs: ["ctxreq-1"],
    resourceRequirementSummaries: [
      {
        resourceRequirementRef: "ctxreq-1",
        resourceRequirementHash: "sha256:ctxreq-1",
        consumerNodeId: "consumer-1",
        consumerBranchId: "branch-1",
        workIntentRef: "work-intent://one",
        contextPurpose: "consumer_scoped_resource_handoff",
        semanticQuestions: ["Which files define the runtime boundary?"],
        requiredResourceKinds: ["repo_context", "validation_refs"],
        downstreamCapabilityId: "coding.source_edit",
        downstreamExecutionIntent: "source_edit",
        downstreamEvidenceMode: ["resource_handoff_evidence"],
        candidateRepoAreaRefs: ["src/runtime-boundary.ts", "src/runtime-boundary.test.ts"],
        knownTargetRefs: ["src/runtime-boundary.ts"],
        knownValidationNeedRefs: ["pnpm test:file src/runtime-boundary.test.ts"],
        sourceContextBrokerRequestRef: "context-broker://request-1",
      },
    ],
    objectiveSummary: "Exercise context scope revision.",
    nodeObjective: "Select a narrower legal context scope.",
    downstreamConsumer: "implementation",
    contextBrokerRequest: null,
    sourceContractRefs: ["source-contract://one"],
    sourceContractSummaries: [
      {
        packetRef: "source-contract://one",
        commitmentId: "commitment-1",
        workerObjective: "Implement the runtime boundary.",
        contextScoutObjective: "Find files and tests for the runtime boundary.",
        requiredContextQuestions: ["Which files define the runtime boundary?"],
        expectedContextScoutOutput: "Relevant files and validation refs.",
        likelyRepoAreas: ["src/runtime-boundary.ts"],
        stopIfMissing: ["target file"],
        acceptanceCriteria: ["context handoff cites existing files"],
      },
    ],
    sourcePrompt: {
      promptHash: "sha256:prompt",
      promptLength: 1000,
      resolutionStatus: "resolved",
      sectionRefs: ["source-section-1"],
      sectionSummaries: [
        {
          sectionRef: "source-section-1",
          heading: "Runtime Boundary",
          boundedSummary: "The runtime boundary must preserve semantic choice for the model.",
        },
      ],
      excerptDecisionRefs: [],
      providedExcerptSummaries: [],
      rawPromptStored: false,
    },
    boundedRepoContextRefs: [
      {
        fileRef: "src/runtime-boundary.ts",
        evidenceHash: "sha256:file-1",
        boundedSummary: "Defines runtime boundary helpers.",
        rawFileContentStored: false,
      },
      {
        fileRef: "src/runtime-boundary.test.ts",
        evidenceHash: "sha256:file-2",
        boundedSummary: "Tests runtime boundary helpers.",
        rawFileContentStored: false,
      },
    ],
    candidateFileRefs: ["src/runtime-boundary.ts", "src/runtime-boundary.test.ts"],
    validationCommandRefs: ["pnpm test:file src/runtime-boundary.test.ts"],
    requestedOutputShape: "resource_scout_handoff_json",
    modelTaskClass: "local_semantic_extraction",
    modelPolicyRef: "model-task-policy://local-semantic-extraction",
    providerTimeoutMs: 90_000,
    maxInputBytes: 32_000,
    estimatedPromptBytes: 48_000,
    exactProviderInputBytes: 48_000,
    providerEnvelopeReserveBytes: 0,
    providerInputBudgetStatus: "blocked",
    providerInputPreflight: {
      artifactKind: "resource_scout_provider_input_preflight",
      schemaVersion: "execution-platform.context-scout-provider-input-preflight.v1",
      accepted: false,
      modelTaskClass: "local_semantic_extraction",
      modelPolicyRef: "model-task-policy://local-semantic-extraction",
      providerPath: "openrouter",
      parserMode: "runtime_json_object",
      responseFormatMode: "prompt_only_json",
      reasoningMode: "none",
      inputBytes: 48_000,
      maxInputBytes: 32_000,
      timeoutMs: 90_000,
      maxTimeoutMs: 90_000,
      providerEnvelopeReserveBytes: 0,
      blockingReason: "Over profile.",
      reasonCodes: ["context_specialist_payload_over_profile_bound"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    },
    status: "blocked",
    reasonCodes: ["context_specialist_payload_over_profile_bound"],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

function blocker(): ContextScoutSingleUnitOverProfileBlocker {
  return {
    artifactKind: "resource_scout_single_unit_over_profile_blocker",
    schemaVersion: "execution-platform.context-scout-single-unit-over-profile-blocker.v1",
    blockerRef: "runtime-job://job-1/runtime-work-graph/graph-1/context-frontier/single-unit-blocker/node-1/fp",
    parentPacketRef: packet().packetRef,
    nodeId: "node-1",
    unitKind: "resource_requirement",
    unitRefs: ["ctxreq-1"],
    inputBytes: 48_000,
    maxInputBytes: 32_000,
    blockingReason: "A single declared context unit exceeds the provider bound.",
    reasonCodes: ["resource_scout_single_structural_unit_over_profile_bound"],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

describe("context scope revision contracts", () => {
  it("builds a bounded model-authored scope revision request from a single-unit blocker", () => {
    const request = buildContextScopeRevisionRequest({ packet: packet(), blocker: blocker() });

    expect(request.status).toBe("ready");
    expect(request.semanticScopeChosenByModel).toBe(true);
    expect(request.runtimeSemanticTruncationApplied).toBe(false);
    expect(request.legalWindows.length).toBeGreaterThan(0);
    expect(request.legalCandidateRefs).toContain("src/runtime-boundary.ts");
    expect(request.nextLegalToolIds).toContain("resource.scope.select_legal_subset");
    expect(request.rawPromptStored).toBe(false);
    expect(buildContextScopeRevisionPrompt(request)).toContain(
      "resource.scope.select_legal_subset",
    );
  });

  it("accepts a legal model-authored subset and can compile a narrower scout input", () => {
    const basePacket = packet();
    const request = buildContextScopeRevisionRequest({
      packet: basePacket,
      blocker: blocker(),
    });
    const repoWindow = request.legalWindows.find(
      (window) => window.sourceRef === "src/runtime-boundary.ts",
    );
    expect(repoWindow).toBeDefined();
    const proposal = parseContextScopeRevisionProposal({
      request,
      responseText: JSON.stringify({
        toolId: "resource.scope.select_legal_subset",
        selectedWindowRefs: [repoWindow?.windowRef],
        selectedSourceRefs: ["src/runtime-boundary.ts"],
        scopeRationale:
          "The runtime boundary source file is the smallest useful window for selecting implementation context.",
        excludedWindows: [
          {
            windowRef: request.legalWindows.find(
              (window) => window.sourceRef === "src/runtime-boundary.test.ts",
            )?.windowRef,
            reason: "The implementation context can request tests after selecting the target source file.",
          },
        ],
        missingContextRequests: [],
        limitations: [],
        confidence: 0.84,
      }),
    });
    const decision = compileContextScopeRevisionDecision({ request, proposal });

    expect(proposal.parseStatus).toBe("parsed");
    expect(decision.status).toBe("accepted");
    expect(decision.selectedSourceRefs).toContain("src/runtime-boundary.ts");
    expect(decision.nextLegalTransition).toBe("resource.frontier.accept_scope_revision");

    const narrowedInput = contextScopeRevisionCompileInputFromDecision({
      originalInput: {
        runtimeJobId: basePacket.runtimeJobId,
        workflowId: basePacket.workflowId,
        graphId: basePacket.graphId,
        nodeId: basePacket.nodeId,
        targetNodeIds: basePacket.targetNodeIds,
        targetCommitmentIds: basePacket.targetCommitmentIds,
        resourceRequirementPackets: [],
        objectiveSummary: basePacket.objectiveSummary,
        nodeObjective: basePacket.nodeObjective,
        downstreamConsumer: basePacket.downstreamConsumer,
        sourceContracts: [],
        sourcePromptContextIndex: null,
        boundedRepoContextIndex: [
          {
            fileRef: "src/runtime-boundary.ts",
            evidenceHash: "sha256:file-1",
            boundedSummary: "Defines runtime boundary helpers.",
            rawFileContentStored: false,
          },
          {
            fileRef: "src/runtime-boundary.test.ts",
            evidenceHash: "sha256:file-2",
            boundedSummary: "Tests runtime boundary helpers.",
            rawFileContentStored: false,
          },
        ],
        candidateFileRefs: basePacket.candidateFileRefs,
        validationCommandRefs: basePacket.validationCommandRefs,
        nodeBudgetMs: 90_000,
        requestedTimeoutMs: 90_000,
      },
      decision,
    });
    expect(narrowedInput.nodeId).toContain("__scope_revision");
    expect(narrowedInput.boundedRepoContextIndex.map((entry) => entry.fileRef)).toEqual([
      "src/runtime-boundary.ts",
    ]);
  });

  it("accepts harmless tool aliasing without changing semantic ownership", () => {
    const request = buildContextScopeRevisionRequest({ packet: packet(), blocker: blocker() });
    const repoWindow = request.legalWindows.find(
      (window) => window.sourceRef === "src/runtime-boundary.ts",
    );
    const proposal = parseContextScopeRevisionProposal({
      request,
      responseText: JSON.stringify({
        tool: "resource.scope.select_legal_subset",
        selectedWindows: [repoWindow?.windowRef],
        selectedRefs: ["src/runtime-boundary.ts"],
        scopeRationale:
          "This legal source window preserves the runtime-boundary context needed by the consumer.",
        excludedWindows: [],
        missingContextRequests: [],
        limitations: [],
      }),
    });
    const decision = compileContextScopeRevisionDecision({ request, proposal });

    expect(proposal.toolId).toBe("resource.scope.select_legal_subset");
    expect(decision.status).toBe("accepted");
    expect(decision.semanticScopeChosenByModel).toBe(true);
  });

  it("rejects invalid refs and runtime-owned model fields with field-specific repair", () => {
    const request = buildContextScopeRevisionRequest({ packet: packet(), blocker: blocker() });
    const proposal = parseContextScopeRevisionProposal({
      request,
      responseText: JSON.stringify({
        toolId: "resource.scope.select_legal_subset",
        requestRef: request.requestRef,
        accepted: true,
        selectedWindowRefs: ["context-scope-window://not-legal"],
        selectedSourceRefs: ["src/not-legal.ts"],
        scopeRationale: "Use the invented file because it sounds relevant.",
        excludedWindows: [],
        missingContextRequests: [],
        limitations: [],
      }),
    });
    const decision = compileContextScopeRevisionDecision({ request, proposal });
    const repair = buildContextScopeRevisionRepairRequest({ request, decision });

    expect(decision.status).toBe("repair_required");
    expect(decision.validationFailures.map((failure) => failure.reasonCode)).toEqual(
      expect.arrayContaining([
        "resource_scope_revision_runtime_owned_field_present",
        "resource_scope_revision_selected_window_ref_not_legal",
        "resource_scope_revision_selected_source_ref_not_legal",
      ]),
    );
    expect(repair.status).toBe("repair_required");
    expect(repair.preserveAcceptedFields).toContain("scopeRationale");
    expect(repair.legalWindowRefs.length).toBe(request.legalWindows.length);
    expect(repair.rawPromptStored).toBe(false);
  });

  it("supports model-authored unshardable explanations without runtime semantic fallback", () => {
    const request = buildContextScopeRevisionRequest({ packet: packet(), blocker: blocker() });
    const proposal = parseContextScopeRevisionProposal({
      request,
      responseText: JSON.stringify({
        toolId: "resource.scope.explain_unshardable_unit",
        unshardableRationale:
          "The legal windows are mutually dependent and cannot answer the consumer without the whole upstream unit.",
        missingContextRequests: ["Add a workflow-authored split handle for this source section."],
        limitations: ["No legal current window preserves the required relationship."],
        confidence: 0.74,
      }),
    });
    const decision = compileContextScopeRevisionDecision({ request, proposal });

    expect(decision.status).toBe("unshardable");
    expect(decision.nextLegalTransition).toBe(
      "scheduler.request_resource_requirement_for_work_intent",
    );
    expect(decision.runtimeSemanticTruncationApplied).toBe(false);
  });

  it("builds field-specific resource scout repair requests without reattaching raw context", () => {
    const request = buildContextScopeRevisionRequest({ packet: packet(), blocker: blocker() });
    const fieldRepair = buildContextScoutFieldRepairRequest({
      repairFor: "context_shard_handoff",
      failedArtifactRef: "artifact://handoff/failed",
      failedDecisionRef: "decision://failed",
      inputBundleRef: request.requestRef,
      inputBundleHash: "sha256:bundle",
      preserveAcceptedFields: ["relevantFiles", "existingPatterns"],
      acceptedFieldRefs: [{ fieldPath: "relevantFiles", valueRef: "src/runtime-boundary.ts" }],
      fieldRepairs: [
        {
          fieldPath: "handoffSummaryForImplementation",
          reasonCode: "resource_scout_handoff_summary_missing",
          expectedType: "nonempty_string",
          currentValueRef: null,
          allowedValueRefs: [],
          repairInstruction:
            "Add only the missing worker handoff summary; preserve accepted fields.",
        },
      ],
      legalCandidateRefs: request.legalCandidateRefs,
      legalWindows: request.legalWindows,
      runtimeJobId: request.runtimeJobId,
      graphId: request.graphId,
      nodeId: request.nodeId,
    });

    expect(fieldRepair.status).toBe("repair_required");
    expect(fieldRepair.preserveAcceptedFields).toEqual(["relevantFiles", "existingPatterns"]);
    expect(fieldRepair.fieldRepairs[0]?.fieldPath).toBe("handoffSummaryForImplementation");
    expect(fieldRepair.rawPromptStored).toBe(false);
    expect(fieldRepair.rawFileContentStored).toBe(false);
  });

  it("uses structural window construction without changing model semantic ownership", () => {
    const windows = buildContextScopeRevisionLegalWindows({
      packet: packet(),
      blocker: blocker(),
    });

    expect(windows.some((window) => window.windowKind === "bounded_repo_context_ref")).toBe(true);
    expect(windows.every((window) => window.rawFileContentStored === false)).toBe(true);
  });

  it("keeps request and decision metadata manifest-only and rejects body fields", () => {
    const request = buildContextScopeRevisionRequest({ packet: packet(), blocker: blocker() });
    const proposal = parseContextScopeRevisionProposal({
      request,
      responseText: JSON.stringify({
        toolId: "resource.scope.select_legal_subset",
        selectedWindowRefs: [request.legalWindows[0]?.windowRef],
        selectedSourceRefs: [request.legalWindows[0]?.sourceRef],
        scopeRationale: "This is the smallest legal scope for the downstream consumer.",
        excludedWindows: [],
        missingContextRequests: [],
        limitations: [],
      }),
    });
    const decision = compileContextScopeRevisionDecision({ request, proposal });
    const requestMetadata = contextScopeRevisionRequestMetadata(request);
    const decisionMetadata = contextScopeRevisionDecisionMetadata(decision);

    expect(() => assertContextScopeRevisionManifestMetadata(requestMetadata)).not.toThrow();
    expect(() => assertContextScopeRevisionManifestMetadata(decisionMetadata)).not.toThrow();
    expect(JSON.stringify(requestMetadata)).not.toContain("legalWindows");
    expect(JSON.stringify(decisionMetadata)).not.toContain("acceptedLegalWindows");
    expect(() =>
      assertContextScopeRevisionManifestMetadata({
        requestRef: request.requestRef,
        legalWindows: request.legalWindows,
        rawPromptStored: false,
        rawResponseStored: false,
      }),
    ).toThrow(/resource_scope_revision_manifest_contains_body_field:legalWindows/u);
  });
});
