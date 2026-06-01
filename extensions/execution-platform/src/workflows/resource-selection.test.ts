import { describe, expect, it } from "vitest";
import {
  ModelTaskClientRouter,
  buildResourceSelectionFieldRepairRequest,
  buildResourceSelectionHandleManifest,
  buildDomainResourceSelectionRequest,
  compileDomainResourceSelectionDecision,
  compileResourceSelectionPacket,
  parseResourceSelectionModelToolCall,
  parseDomainResourceSelectionModelToolCall,
  resourceSelectionDecisionFromDomainResourceSelectionDecision,
  resourceSelectionDecisionFromToolCall,
  type ResourceSelectionCandidateHandle,
  type ResourceSelectionModelTaskRouterAdapter,
} from "./resource-selection.ts";

const candidate = (
  ref: string,
  overrides: Partial<ResourceSelectionCandidateHandle> = {},
): ResourceSelectionCandidateHandle => ({
  candidateId: `candidate:${ref}`,
  resourceRef: ref,
  resourceKind: "repo_file",
  candidateSource: "resource_scout",
  sourceRefs: ["context://handoff/1"],
  authorityScopeRefs: ["src/example.ts"],
  targetCommitmentIds: ["commitment-1"],
  capabilityIds: ["implementation_microtask"],
  evidenceRequirements: ["validated_diff"],
  objectiveSnippet: "Update the implementation.",
  contextSummary: "resource scout found this file as a candidate.",
  payloadRef: ref,
  payloadHash: `sha256:${ref}`,
  omittedBodyRef: ref,
  omittedBodyHash: `sha256:${ref}:omitted`,
  rawPromptStored: false,
  rawResponseStored: false,
  rawProviderLogStored: false,
  rawToolLogStored: false,
  ...overrides,
});

describe("resource selection boundary", () => {
  it("compiles a generic resource-selection packet from a small model-authored tool call", () => {
    const manifest = buildResourceSelectionHandleManifest({
      runtimeJobId: "job-1",
      workflowId: "workflow-1",
      graphId: "graph-1",
      nodeId: "node-1",
      domainKind: "neutral.documentation",
      objectiveSnippet: "Select the right source document.",
      targetCommitmentIds: ["commitment-1"],
      capabilityIds: ["docs_update"],
      evidenceRequirements: ["selected_source_ref"],
      candidateHandles: [candidate("docs/a.md", { resourceKind: "doc" })],
      maxInputBytes: 32_000,
    });
    const parsed = parseResourceSelectionModelToolCall(
      JSON.stringify({
        toolName: "resource.selection.propose",
        arguments: {
          selectedResourceRefs: ["docs/a.md"],
          resourceIntents: [
            {
              resourceRef: "docs/a.md",
              intentKind: "source_document",
              intendedUse: "Use this document as the authoritative source.",
              rationale: "The model selected this candidate from the provided handles.",
              validationHintRefs: [],
            },
          ],
          validationDiscoveryPlan: ["Check the selected doc exists."],
          selectionRationale: "This candidate matches the task source requirement.",
        },
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      }),
    );

    expect(parsed.status).toBe("accepted");
    const packet = compileResourceSelectionPacket({
      runtimeJobId: "job-1",
      workflowId: "workflow-1",
      graphId: "graph-1",
      nodeId: "node-1",
      domainKind: "neutral.documentation",
      targetCommitmentIds: ["commitment-1"],
      manifest,
      decision: parsed.decision!,
      modelTaskBoundaryId: "domain_resource_selection",
      modelTaskPolicyRef: "model-task-policy://tool-selection/qwen3-coder-next",
      providerPath: "openrouter",
      modelRef: "qwen/qwen3-coder-next",
    });

    expect(packet.status).toBe("accepted");
    expect(packet.selectedResourceRefs).toEqual(["docs/a.md"]);
    expect(packet.invalidSelections).toEqual([]);
    expect(packet.reasonCodes).toContain("resource_selection_intents_model_authored");
  });

  it("caps overfilled validation hint refs without rejecting an otherwise valid selection", () => {
    const manifest = buildResourceSelectionHandleManifest({
      runtimeJobId: "job-1",
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      nodeId: "node-1",
      domainKind: "coding.domain_resource_selection",
      objectiveSnippet: "Select the concrete implementation target.",
      targetCommitmentIds: ["commitment-1"],
      capabilityIds: ["implementation_microtask"],
      evidenceRequirements: ["changed_file_evidence", "validation_evidence"],
      candidateHandles: [candidate("file-window://src/example.ts#L1-L120", { authorityScopeRefs: ["src/"] })],
      maxInputBytes: 32_000,
    });
    const request = buildDomainResourceSelectionRequest({
      runtimeJobId: "job-1",
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      nodeId: "node-1",
      acceptedResourceHandoffRefs: Array.from({ length: 16 }, (_, index) => `resource-handoff://${index + 1}`),
      authorityScopeRefs: ["src/"],
      manifest,
    });
    const parsed = parseDomainResourceSelectionModelToolCall(
      JSON.stringify({
        toolName: "resource.selection.propose",
        arguments: {
          selectedTargetRefs: ["file-window://src/example.ts#L1-L120"],
          fileChangeIntents: [
            {
              targetRef: "file-window://src/example.ts#L1-L120",
              operation: "modify",
              intendedChange: "Wire the selected implementation target into the runtime path.",
              sourceCommitmentIds: ["commitment-1"],
              resourceHandoffRefs: Array.from(
                { length: 16 },
                (_, index) => `resource-handoff://${index + 1}`,
              ),
              expectedEvidenceMode: ["changed_file_evidence", "validation_evidence"],
              validationDiscoveryNeed: "Run the focused resource-selection tests.",
              authorityScopeRef: "src/",
              rationale: "The model selected this exact window from the legal handle menu.",
            },
          ],
          validationDiscoveryPlan: ["Run resource-selection.test.ts"],
          selectionRationale: "The exact window is the right implementation target.",
          excludedCandidateRefs: [],
        },
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      }),
    );

    expect(parsed.status).toBe("accepted");
    const domainDecision = compileDomainResourceSelectionDecision({
      request,
      manifest,
      proposal: parsed.proposal!,
    });
    expect(domainDecision.status).toBe("accepted");
    const decision = resourceSelectionDecisionFromDomainResourceSelectionDecision(domainDecision);
    const packet = compileResourceSelectionPacket({
      runtimeJobId: "job-1",
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      nodeId: "node-1",
      domainKind: "coding.domain_resource_selection",
      manifest,
      decision,
      modelTaskBoundaryId: "domain_resource_selection",
      modelTaskPolicyRef: "model-task-policy://tool-selection/qwen3-coder-next",
      providerPath: "openrouter",
      modelRef: "qwen/qwen3-coder-next",
    });

    expect(packet.status).toBe("accepted");
    expect(packet.resourceIntents[0]?.validationHintRefs).toHaveLength(12);
  });

  it("rejects invalid selected refs structurally without scoring resource usefulness", () => {
    const manifest = buildResourceSelectionHandleManifest({
      runtimeJobId: "job-1",
      workflowId: "workflow-1",
      graphId: "graph-1",
      nodeId: "node-1",
      domainKind: "coding.domain_resource_selection",
      objectiveSnippet: "Update a file.",
      candidateHandles: [candidate("src/example.ts")],
      maxInputBytes: 32_000,
    });
    const decision = resourceSelectionDecisionFromToolCall({
      toolName: "resource.selection.propose",
      arguments: {
        selectedResourceRefs: ["src/not-a-candidate.ts"],
        resourceIntents: [
          {
            resourceRef: "src/not-a-candidate.ts",
            intentKind: "whole_file",
            intendedUse: "Edit the file.",
            rationale: "Model rationale remains semantic and is not judged by runtime.",
            validationHintRefs: [],
          },
        ],
        validationDiscoveryPlan: ["Run targeted validation."],
        selectionRationale: "The runtime should not score this rationale.",
      },
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    });

    const packet = compileResourceSelectionPacket({
      runtimeJobId: "job-1",
      workflowId: "workflow-1",
      graphId: "graph-1",
      nodeId: "node-1",
      domainKind: "coding.domain_resource_selection",
      manifest,
      decision,
      modelTaskBoundaryId: "domain_resource_selection",
      modelTaskPolicyRef: "model-task-policy://tool-selection/qwen3-coder-next",
      providerPath: "openrouter",
      modelRef: "qwen/qwen3-coder-next",
    });

    expect(packet.status).toBe("needs_review");
    expect(packet.invalidSelections).toEqual(["src/not-a-candidate.ts"]);
    expect(packet.reasonCodes).toContain("resource_selection_selected_refs_not_in_candidate_set");

    const repair = buildResourceSelectionFieldRepairRequest({
      nodeId: "node-1",
      packet,
      manifest,
    });

    expect(repair.status).toBe("repair_required");
    expect(repair.fieldRepairs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldPath: "selectedResourceRefs",
          reasonCode: "resource_selection_selected_refs_not_in_candidate_set",
          currentValueRef: "src/not-a-candidate.ts",
          allowedValueRefs: ["src/example.ts"],
        }),
      ]),
    );
  });

  it("builds parser-field repair requests without regenerating the whole packet", () => {
    const repair = buildResourceSelectionFieldRepairRequest({
      nodeId: "node-1",
      schemaErrorPath: "arguments.selectedResourceRefs.0",
      parserReasonCodes: ["resource_selection_tool_call_invalid"],
    });

    expect(repair.status).toBe("repair_required");
    expect(repair.fieldRepairs).toEqual([
      expect.objectContaining({
        fieldPath: "arguments.selectedResourceRefs.0",
        reasonCode: "resource_selection_tool_call_schema_field_invalid",
      }),
    ]);
    expect(repair.reasonCodes).toContain("resource_selection_field_specific_repair_required");
  });

  it("blocks domain-resource-selection provider calls before invocation when payload exceeds policy", async () => {
    let providerCalled = false;
    const router = new ModelTaskClientRouter({
      adapters: [
        {
          providerPath: "openrouter",
          async executeJson() {
            providerCalled = true;
            return {
              status: "succeeded",
              responseText: "{}",
              responseHash: "hash",
              latencyMs: 1,
            };
          },
        } satisfies ResourceSelectionModelTaskRouterAdapter,
      ],
    });

    const result = await router.runJson({
      boundaryId: "domain_resource_selection",
      taskClass: "tool_selection",
      callSite: "resource.selection",
      systemPrompt: "Select resources.",
      userPayload: { candidateRefs: ["src/example.ts"] },
      requestedInputBytes: 33_000,
      maxOutputTokens: 3_000,
      timeoutMs: 60_000,
      proofMode: true,
    });

    expect(providerCalled).toBe(false);
    expect(result.status).toBe("blocked");
    expect(result.reasonCodes).toContain("model_policy_input_exceeds_bound");
  });

  it("routes accepted domain-resource-selection calls through the configured OpenRouter/Qwen policy", async () => {
    const router = new ModelTaskClientRouter({
      adapters: [
        {
          providerPath: "openrouter",
          async executeJson(input) {
            expect(input.modelRef).toBe("qwen/qwen3-coder-next");
            expect(input.providerPath).toBe("openrouter");
            expect(input.reasoningMode).toBe("none");
            expect(input.taskClass).toBe("tool_selection");
            expect(input.callSite).toBe("resource.selection");
            return {
              status: "succeeded",
              responseText: JSON.stringify({
                toolName: "resource.selection.mark_blocked",
                arguments: {
                  blockerSummary: "No candidates.",
                  missingContextQuestions: ["Provide candidate refs."],
                  selectionRationale: "Cannot select without candidates.",
                },
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
                rawToolLogStored: false,
              }),
              responseHash: "hash",
              latencyMs: 1,
              providerResponseDiagnostics: { providerPath: "openrouter" },
            };
          },
        } satisfies ResourceSelectionModelTaskRouterAdapter,
      ],
    });

    const result = await router.runJson({
      boundaryId: "domain_resource_selection",
      taskClass: "tool_selection",
      callSite: "resource.selection",
      systemPrompt: "Select resources.",
      userPayload: { candidateRefs: ["src/example.ts"] },
      requestedInputBytes: 2_000,
      maxOutputTokens: 3_000,
      timeoutMs: 60_000,
      proofMode: true,
    });

    expect(result.status).toBe("succeeded");
    expect(result.classification).toMatchObject({
      selectedModelRef: "qwen/qwen3-coder-next",
      providerPath: "openrouter",
      contractBoundaryId: "domain_resource_selection",
    });
    expect(result.reasonCodes).toContain("model_task_client_router_provider_call_completed");
  });

  it("compiles domain-resource-selection request, proposal, and decision from target-specific small verbs", () => {
    const manifest = buildResourceSelectionHandleManifest({
      runtimeJobId: "job-1",
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      nodeId: "node-1",
      sourceWorkUnitId: "wu-1",
      domainKind: "coding.domain_resource_selection",
      objectiveSnippet: "Wire context satisfaction into implementation target selection.",
      targetCommitmentIds: ["commitment-1"],
      capabilityIds: ["implementation_microtask"],
      evidenceRequirements: ["changed_file_evidence", "validation_evidence"],
      candidateHandles: [
        candidate("src/workflows/work-intent-context-resolution.ts", {
          authorityScopeRefs: ["src/workflows/"],
          sourceRefs: ["resource-handoff://accepted/1"],
        }),
      ],
      maxInputBytes: 32_000,
    });
    const request = buildDomainResourceSelectionRequest({
      runtimeJobId: "job-1",
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      nodeId: "node-1",
      sourceWorkUnitId: "wu-1",
      workIntentRef: "runtime-work-graph://work-intent/1",
      workIntentContextResolutionRef: "runtime-work-graph://work-intent-context-resolution/1",
      acceptedResourceHandoffRefs: ["resource-handoff://accepted/1"],
      authorityScopeRefs: ["src/workflows/"],
      manifest,
    });
    const parsed = parseDomainResourceSelectionModelToolCall(
      JSON.stringify({
        toolName: "resource.selection.propose",
        arguments: {
          selectedTargetRefs: ["src/workflows/work-intent-context-resolution.ts"],
          fileChangeIntents: [
            {
              targetRef: "src/workflows/work-intent-context-resolution.ts",
              operation: "modify",
              intendedChange:
                "Consume accepted shard handoff refs when resolving WorkIntent context.",
              sourceCommitmentIds: ["commitment-1"],
              resourceHandoffRefs: ["resource-handoff://accepted/1"],
              expectedEvidenceMode: ["changed_file_evidence", "validation_evidence"],
              validationDiscoveryNeed: "Run focused WorkIntent context resolution tests.",
              authorityScopeRef: "src/workflows/",
              rationale:
                "This file owns WorkIntent context resolution and is a legal candidate handle.",
            },
          ],
          validationDiscoveryPlan: ["Run work-intent-context-resolution.test.ts"],
          selectionRationale:
            "The accepted context handoff points to the context resolution compiler.",
          excludedCandidateRefs: [],
        },
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      }),
    );

    expect(parsed.status).toBe("accepted");
    const decision = compileDomainResourceSelectionDecision({
      request,
      manifest,
      proposal: parsed.proposal!,
    });

    expect(decision.status).toBe("accepted");
    expect(decision.selectedTargetRefs).toEqual([
      "src/workflows/work-intent-context-resolution.ts",
    ]);
    expect(decision.reasonCodes).toContain("domain_resource_selection_file_change_intents_model_authored");
    expect(decision.nextLegalTransition).toBe("resource.selection.accept");
    expect(decision.semanticQualityJudgedByDeterministicCode).toBe(false);

    const resourceDecision = resourceSelectionDecisionFromDomainResourceSelectionDecision(decision);
    expect(resourceDecision.status).toBe("selected");
    expect(resourceDecision.resourceIntents[0]).toMatchObject({
      resourceRef: "src/workflows/work-intent-context-resolution.ts",
      intentKind: "modify",
    });
  });

  it("rejects domain-resource-selection proposals that select broad or unauthorized refs", () => {
    const manifest = buildResourceSelectionHandleManifest({
      runtimeJobId: "job-1",
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      nodeId: "node-1",
      domainKind: "coding.domain_resource_selection",
      objectiveSnippet: "Select concrete implementation files.",
      candidateHandles: [candidate("src/workflows/runtime.ts", { authorityScopeRefs: ["src/"] })],
      maxInputBytes: 32_000,
    });
    const request = buildDomainResourceSelectionRequest({
      runtimeJobId: "job-1",
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      nodeId: "node-1",
      acceptedResourceHandoffRefs: ["resource-handoff://accepted/1"],
      authorityScopeRefs: ["src/"],
      manifest,
    });
    const parsed = parseDomainResourceSelectionModelToolCall(
      JSON.stringify({
        toolName: "resource.selection.propose",
        arguments: {
          selectedTargetRefs: ["src/workflows/"],
          fileChangeIntents: [
            {
              targetRef: "src/workflows/",
              operation: "modify",
              intendedChange: "Edit the broad workflow directory.",
              sourceCommitmentIds: ["commitment-1"],
              resourceHandoffRefs: ["resource-handoff://accepted/1"],
              expectedEvidenceMode: ["changed_file_evidence"],
              validationDiscoveryNeed: "Run focused tests.",
              authorityScopeRef: "src/",
              rationale: "This broad directory should not be accepted as a candidate file.",
            },
          ],
          validationDiscoveryPlan: ["Run focused tests."],
          selectionRationale: "Directory-level target.",
          excludedCandidateRefs: [],
        },
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      }),
    );

    const decision = compileDomainResourceSelectionDecision({
      request,
      manifest,
      proposal: parsed.proposal!,
    });

    expect(decision.status).toBe("needs_review");
    expect(decision.invalidSelections).toEqual(["src/workflows/"]);
    expect(decision.reasonCodes).toContain("domain_resource_selection_selected_refs_not_in_candidate_set");
    expect(decision.nextLegalTransition).toBe("resource.selection.request_revision");
  });

  it("rejects domain-resource-selection proposals outside the request authority scope", () => {
    const manifest = buildResourceSelectionHandleManifest({
      runtimeJobId: "job-1",
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      nodeId: "node-1",
      domainKind: "coding.domain_resource_selection",
      objectiveSnippet: "Select concrete implementation files.",
      candidateHandles: [
        candidate("src/workflows/runtime.ts", { authorityScopeRefs: ["src/workflows/"] }),
        candidate("src/other/runtime.ts", { authorityScopeRefs: ["src/other/"] }),
      ],
      maxInputBytes: 32_000,
    });
    const request = buildDomainResourceSelectionRequest({
      runtimeJobId: "job-1",
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      nodeId: "node-1",
      acceptedResourceHandoffRefs: ["resource-handoff://accepted/1"],
      authorityScopeRefs: ["src/workflows/"],
      manifest,
    });
    const parsed = parseDomainResourceSelectionModelToolCall(
      JSON.stringify({
        toolName: "resource.selection.propose",
        arguments: {
          selectedTargetRefs: ["src/other/runtime.ts"],
          fileChangeIntents: [
            {
              targetRef: "src/other/runtime.ts",
              operation: "modify",
              intendedChange: "Modify a concrete but unauthorized file.",
              sourceCommitmentIds: ["commitment-1"],
              resourceHandoffRefs: ["resource-handoff://accepted/1"],
              expectedEvidenceMode: ["changed_file_evidence"],
              validationDiscoveryNeed: "Run focused tests.",
              authorityScopeRef: "src/other/",
              rationale:
                "This candidate is concrete but outside the request authority scope.",
            },
          ],
          validationDiscoveryPlan: ["Run focused tests."],
          selectionRationale: "Select an out-of-scope target.",
          excludedCandidateRefs: [],
        },
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      }),
    );

    const decision = compileDomainResourceSelectionDecision({
      request,
      manifest,
      proposal: parsed.proposal!,
    });

    expect(decision.status).toBe("needs_review");
    expect(decision.unauthorizedSelections).toEqual(["src/other/runtime.ts"]);
    expect(decision.reasonCodes).toContain("domain_resource_selection_authority_scope_mismatch");
  });

  it("accepts domain-resource-selection handoff coverage from runtime-owned handle provenance", () => {
    const exactRef = "file-window://src/workflows/runtime.ts#L10-L80";
    const manifest = buildResourceSelectionHandleManifest({
      runtimeJobId: "job-1",
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      nodeId: "node-1",
      domainKind: "coding.domain_resource_selection",
      objectiveSnippet: "Select concrete implementation windows.",
      candidateHandles: [
        candidate(exactRef, {
          resourceKind: "source_file_window",
          sourceRefs: ["resource-handoff://accepted/1", "ledger-entry://1"],
          authorityScopeRefs: ["src/"],
        }),
      ],
      maxInputBytes: 32_000,
    });
    const request = buildDomainResourceSelectionRequest({
      runtimeJobId: "job-1",
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      nodeId: "node-1",
      acceptedResourceHandoffRefs: ["resource-handoff://accepted/1"],
      authorityScopeRefs: ["src/"],
      manifest,
    });
    const parsed = parseDomainResourceSelectionModelToolCall(
      JSON.stringify({
        toolId: "resource.selection.propose",
        input: {
          selectedTargetRefs: [exactRef],
          fileChangeIntents: [
            {
              targetRef: exactRef,
              operation: "modify",
              intendedChange: "Use the selected exact window for implementation.",
              validationDiscoveryNeed: "Run focused tests.",
              authorityScopeRef: "src/",
              rationale: "Exact node-local ledger window selected.",
            },
          ],
          validationDiscoveryPlan: ["Run focused tests."],
          selectionRationale: "Exact node-local ledger window selected.",
          excludedCandidateRefs: [],
        },
      }),
    );

    const decision = compileDomainResourceSelectionDecision({
      request,
      manifest,
      proposal: parsed.proposal!,
    });

    expect(decision.status).toBe("accepted");
    expect(decision.resourceHandoffCoverageMissingRefs).toEqual([]);
    expect(decision.selectedTargetRefs).toEqual([exactRef]);
  });

  it("extracts domain-resource-selection tool JSON from fenced or prefaced model output", () => {
    const parsed = parseDomainResourceSelectionModelToolCall(
      `I will call the domain-resource-selection tool now.\n\n\`\`\`json\n${JSON.stringify({
        toolName: "resource.selection.propose",
        arguments: {
          selectedTargetRefs: ["src/workflows/runtime.ts"],
          fileChangeIntents: [
            {
              targetRef: "src/workflows/runtime.ts",
              operation: "modify",
              intendedChange: "Modify runtime wiring.",
              sourceCommitmentIds: ["commitment-1"],
              resourceHandoffRefs: ["resource-handoff://accepted/1"],
              expectedEvidenceMode: ["changed_file_evidence"],
              validationDiscoveryNeed: "Run focused tests.",
              authorityScopeRef: "src/workflows/",
              rationale: "Concrete target from accepted context.",
            },
          ],
          validationDiscoveryPlan: "Run focused tests.",
          selectionRationale: "Concrete target from accepted context.",
          excludedCandidateRefs: [],
        },
      })}\n\`\`\``,
    );

    expect(parsed.status).toBe("accepted");
    expect(parsed.proposal?.selectedTargetRefs).toEqual(["src/workflows/runtime.ts"]);
    expect(parsed.proposal?.validationDiscoveryPlan).toEqual(["Run focused tests."]);
  });

  it("accepts small-verb toolId/input domain-resource-selection envelopes", () => {
    const parsed = parseDomainResourceSelectionModelToolCall(
      JSON.stringify({
        toolId: "resource.selection.propose",
        input: {
          selectedTargetRefs: ["src/workflows/runtime.ts"],
          fileChangeIntents: [
            {
              targetRef: "src/workflows/runtime.ts",
              operation: "modify",
              intendedChange: "Modify runtime wiring.",
              sourceCommitmentIds: ["commitment-1"],
              resourceHandoffRefs: ["resource-handoff://accepted/1"],
              expectedEvidenceMode: ["changed_file_evidence"],
              validationDiscoveryNeed: "Run focused tests.",
              authorityScopeRef: "src/workflows/",
              rationale: "Concrete target from accepted context.",
            },
          ],
          validationDiscoveryPlan: ["Run focused tests."],
          selectionRationale: "Concrete target from accepted context.",
          excludedCandidateRefs: [],
        },
      }),
    );

    expect(parsed.status).toBe("accepted");
    expect(parsed.toolCall?.toolName).toBe("resource.selection.propose");
    expect(parsed.proposal?.selectedTargetRefs).toEqual(["src/workflows/runtime.ts"]);
  });

  it("repairs compact domain-resource-selection aliases without changing selected refs", () => {
    const parsed = parseDomainResourceSelectionModelToolCall(
      JSON.stringify({
        toolId: "resource.selection.propose",
        input: {
          selectedResourceRefs: ["file-window://src/workflows/runtime.ts#L10-L80"],
          targetIntents: [
            {
              resourceRef: "file-window://src/workflows/runtime.ts#L10-L80",
              operation: "edit",
              change: "Wire the selected runtime path.",
              rationale: "This exact window contains the lifecycle boundary.",
            },
          ],
          validationPlan: "Run focused lifecycle tests.",
          rationale: "The exact window is the only selected target.",
          extraModelNote: "This should be stripped by the gateway.",
        },
      }),
    );

    expect(parsed.status).toBe("accepted");
    expect(parsed.toolCall?.toolName).toBe("resource.selection.propose");
    expect(parsed.proposal?.selectedTargetRefs).toEqual([
      "file-window://src/workflows/runtime.ts#L10-L80",
    ]);
    expect(parsed.proposal?.fileChangeIntents[0]).toMatchObject({
      targetRef: "file-window://src/workflows/runtime.ts#L10-L80",
      operation: "modify",
      intendedChange: "Wire the selected runtime path.",
      validationDiscoveryNeed: "Run the relevant validation for this selected target.",
    });
    expect(JSON.stringify(parsed.proposal)).not.toContain("extraModelNote");
  });

  it("accepts runtime-wrapped domain-resource-selection semantic bodies", () => {
    const parsed = parseDomainResourceSelectionModelToolCall(
      JSON.stringify({
        selectedTargetRefs: ["src/workflows/runtime.ts"],
        fileChangeIntents: [
          {
            targetRef: "src/workflows/runtime.ts",
            operation: "modify",
            intendedChange: "Modify runtime wiring.",
            sourceCommitmentIds: ["commitment-1"],
            resourceHandoffRefs: ["resource-handoff://accepted/1"],
            expectedEvidenceMode: ["changed_file_evidence"],
            validationDiscoveryNeed: "Run focused tests.",
            authorityScopeRef: "src/workflows/",
            rationale: "Concrete target from accepted context.",
          },
        ],
        validationDiscoveryPlan: ["Run focused tests."],
        selectionRationale: "Concrete target from accepted context.",
        excludedCandidateRefs: [],
      }),
    );

    expect(parsed.status).toBe("accepted");
    expect(parsed.toolCall?.toolName).toBe("resource.selection.propose");
    expect(parsed.proposal?.selectedTargetRefs).toEqual(["src/workflows/runtime.ts"]);
  });

  it("scans past non-tool JSON candidates without semantic interpretation", () => {
    const parsed = parseDomainResourceSelectionModelToolCall(
      `${JSON.stringify({ note: "not a tool call" })}\n${JSON.stringify({
        toolName: "resource.selection.propose",
        arguments: {
          selectedTargetRefs: ["src/workflows/runtime.ts"],
          fileChangeIntents: [
            {
              targetRef: "src/workflows/runtime.ts",
              operation: "modify",
              intendedChange: "Modify runtime wiring.",
              sourceCommitmentIds: ["commitment-1"],
              resourceHandoffRefs: ["resource-handoff://accepted/1"],
              expectedEvidenceMode: ["changed_file_evidence"],
              validationDiscoveryNeed: "Run focused tests.",
              authorityScopeRef: "src/workflows/",
              rationale: "Concrete target from accepted context.",
            },
          ],
          validationDiscoveryPlan: ["Run focused tests."],
          selectionRationale: "Concrete target from accepted context.",
          excludedCandidateRefs: [],
        },
      })}`,
    );

    expect(parsed.status).toBe("accepted");
    expect(parsed.reasonCodes).toContain("domain_resource_selection_tool_call_candidate_scan_used");
    expect(parsed.proposal?.selectedTargetRefs).toEqual(["src/workflows/runtime.ts"]);
  });
});
