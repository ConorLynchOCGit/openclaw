import { describe, expect, it } from "vitest";
import {
  CONTEXT_SCOUT_TOOL_LOOP_TOOL_IDS,
  buildContextScoutToolLoopRun,
  buildContextScoutVerifiedFileRefs,
  inspectContextScoutModelAuthoredHandoffSubstance,
  summarizeContextScoutToolLoopRun,
  validateContextScoutToolLoopForImplementation,
} from "./context-scout-tool-loop.ts";
import { buildContextHandoffPacket } from "./mission-work-packets.ts";
import {
  SCHEDULER_RUNTIME_TOOL_IDS,
  buildSchedulerRuntimeToolDefinition,
} from "./scheduler-runtime-tools.ts";

describe("context scout tool loop", () => {
  it("validates context handoff structure without deterministic quality scoring", () => {
    expect(
      inspectContextScoutModelAuthoredHandoffSubstance({
        modelAuthoredSummary: "",
        recommendedEditPoints: [],
        existingPatterns: [],
        risks: [],
        validationSuggestions: [],
      }),
    ).toMatchObject({
      hasModelAuthoredHandoffSubstance: false,
      missingFieldPaths: expect.arrayContaining(["existingPatterns", "risks"]),
    });

    expect(
      inspectContextScoutModelAuthoredHandoffSubstance({
        modelAuthoredSummary:
          "Implement against the context scout tool-loop contract by preserving bounded refs, making the sufficiency review explicit, and ensuring downstream implementation reads verified handoff fields before editing.",
        recommendedEditPoints: [
          "extensions/execution-platform/src/workflows/context-scout-tool-loop.ts:buildContextScoutToolLoopRun - Extend sufficiency metadata.",
          "extensions/execution-platform/src/workflows/context-scout-tool-loop.test.ts:context scout tool loop - Add focused regression coverage.",
        ],
        existingPatterns: ["Context scout artifacts record verified refs plus sufficiency state."],
        risks: ["Runtime supplied refs can mask weak model handoff substance."],
        validationSuggestions: [
          "Run context-scout tool-loop tests.",
          "Run scheduler graph tests that consume context scout handoffs.",
        ],
      }),
    ).toMatchObject({
      hasModelAuthoredHandoffSubstance: true,
    });
  });

  it("records accepted bounded context loop evidence for implementation handoff", () => {
    const handoff = buildContextHandoffPacket({
      sourceNodeId: "context-node",
      targetCommitmentIds: ["commitment-1"],
      relevantFileRefs: ["extensions/execution-platform/src/workflows/context-scout-tool-loop.ts"],
      codeIntelligenceResultRefs: ["code-intelligence://code.get_document_symbols/abc123"],
      codeIntelligenceSymbolRefs: [
        "extensions/execution-platform/src/workflows/context-scout-tool-loop.ts:buildContextScoutToolLoopRun",
      ],
      codeIntelligenceDiagnosticRefs: [],
      codeIntelligenceRelatedTestRefs: [
        "extensions/execution-platform/src/workflows/context-scout-tool-loop.test.ts",
      ],
      codeIntelligenceImpactRefs: [
        "extensions/execution-platform/src/workflows/context-scout-tool-loop.ts",
      ],
      codeIntelligenceSemanticModes: ["structural"],
      codeIntelligenceLimitations: [
        "Code intelligence is using bounded structural mode; LSP semantic backend is not yet attached.",
      ],
      existingPatterns: [
        "Context scout tool-loop artifacts record bounded refs and sufficiency state.",
      ],
      validationSuggestions: [
        "Run the context-scout tool-loop unit tests.",
        "Verify the summarized handoff packet includes bounded evidence refs.",
      ],
      handoffSummaryForImplementation:
        "Use the context scout tool-loop contract and tests for production handoff evidence. The implementation should preserve bounded artifact storage, attach verified file refs, and keep the sufficiency review connected to downstream implementation gating.",
    });
    const verifiedFileRefs = buildContextScoutVerifiedFileRefs({
      runtimeJobId: "job-1",
      nodeId: "context-node",
      fileRefs: ["extensions/execution-platform/src/workflows/context-scout-tool-loop.ts"],
    });

    const run = buildContextScoutToolLoopRun({
      runtimeJobId: "job-1",
      graphId: "graph-1",
      nodeId: "context-node",
      roleId: "context_scout",
      modelRef: "openrouter/deepseek-v4-pro",
      targetCommitmentIds: ["commitment-1"],
      commitmentWorkPacketRefs: ["runtime-work-graph://packet/commitment-1/hash"],
      requestedContextQuestions: ["Which files define the context scout tool-loop contract?"],
      sourcePromptHash: "abc123",
      candidateFileRefs: ["extensions/execution-platform/src/workflows/"],
      verifiedFileRefs,
      contextHandoffPacketRef: "runtime-job://job-1/context-handoff/context-node",
      contextHandoffPacket: handoff,
      runtimeToolInvocationRefs: ["runtime-tool://job-1/context_scout.plan/1"],
      codeIntelligenceResultRefs: handoff.codeIntelligenceResultRefs,
      codeIntelligenceRuntimeToolInvocationRefs: [
        "runtime-tool://job-1/code.get_document_symbols/1",
      ],
      codeIntelligenceSymbolRefs: handoff.codeIntelligenceSymbolRefs,
      codeIntelligenceDiagnosticRefs: handoff.codeIntelligenceDiagnosticRefs,
      codeIntelligenceRelatedTestRefs: handoff.codeIntelligenceRelatedTestRefs,
      codeIntelligenceImpactRefs: handoff.codeIntelligenceImpactRefs,
      codeIntelligenceSemanticModes: handoff.codeIntelligenceSemanticModes,
      codeIntelligenceLimitations: handoff.codeIntelligenceLimitations,
      consumerSpecificWaivers: [
        {
          consumerNodeId: "all",
          workUnitId: null,
          limitation:
            "Code intelligence returned structural degraded mode only; semantic parity was unavailable and must be accepted as a limitation before implementation.",
          nonblockingRationale:
            "The handoff includes model-authored implementation substance and a verified source ref, so structural-mode code intelligence is nonblocking for this bounded test consumer.",
          evidenceRefs: ["code-intelligence://code.get_document_symbols/abc123"],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        },
      ],
      modelAuthoredSummary:
        "The verified workflow file and handoff packet are enough for implementation. Update the bounded tool-loop contract and tests together so downstream implementers can rely on the sufficiency status, verified refs, and model-authored handoff fields.",
    });

    expect(validateContextScoutToolLoopForImplementation(run)).toEqual({
      valid: true,
      reasonCodes: ["context_scout_accepted_with_limitations"],
    });
    expect(run.rawPromptStored).toBe(false);
    expect(run.rawResponseStored).toBe(false);
    expect(run.rawFileContentStored).toBe(false);
    expect(summarizeContextScoutToolLoopRun(run)).toMatchObject({
      sufficiencyStatus: "accepted_with_limitations",
      verifiedFileRefs: ["extensions/execution-platform/src/workflows/context-scout-tool-loop.ts"],
      codeIntelligenceResultRefs: ["code-intelligence://code.get_document_symbols/abc123"],
      codeIntelligenceRuntimeToolInvocationRefs: [
        "runtime-tool://job-1/code.get_document_symbols/1",
      ],
      codeIntelligenceSymbolRefs: [
        "extensions/execution-platform/src/workflows/context-scout-tool-loop.ts:buildContextScoutToolLoopRun",
      ],
      codeIntelligenceRelatedTestRefs: [
        "extensions/execution-platform/src/workflows/context-scout-tool-loop.test.ts",
      ],
      codeIntelligenceSemanticModes: ["structural"],
    });
  });

  it("blocks implementation when context scout lacks verified refs or handoff", () => {
    const run = buildContextScoutToolLoopRun({
      runtimeJobId: "job-2",
      graphId: "graph-2",
      nodeId: "context-node",
      roleId: "context_scout",
      modelRef: "openrouter/deepseek-v4-pro",
      targetCommitmentIds: ["commitment-1"],
      commitmentWorkPacketRefs: ["runtime-work-graph://packet/commitment-1/hash"],
      requestedContextQuestions: ["Which files matter?"],
      modelAuthoredSummary: "Context remains weak.",
    });

    expect(validateContextScoutToolLoopForImplementation(run)).toEqual({
      valid: false,
      reasonCodes: [
        "context_scout_sufficiency_not_accepted",
        "context_scout_non_runtime_context_source_missing",
        "context_scout_not_sufficient_for_implementation",
        "context_scout_verified_file_refs_missing",
        "context_scout_handoff_packet_missing",
      ],
    });
  });

  it("blocks implementation when verified refs miss expected source repo areas", () => {
    const handoff = buildContextHandoffPacket({
      sourceNodeId: "context-node",
      targetCommitmentIds: ["commitment-1"],
      relevantFileRefs: ["scripts/execution-platform-run-context-scout-tool-loop-proof.mjs"],
      handoffSummaryForImplementation:
        "The scout found only script-level context, not the source contract area.",
    });
    const verifiedFileRefs = buildContextScoutVerifiedFileRefs({
      runtimeJobId: "job-expected-area",
      nodeId: "context-node",
      fileRefs: ["scripts/execution-platform-run-context-scout-tool-loop-proof.mjs"],
    });

    const run = buildContextScoutToolLoopRun({
      runtimeJobId: "job-expected-area",
      graphId: "graph-expected-area",
      nodeId: "context-node",
      roleId: "context_scout",
      modelRef: "openrouter/deepseek-v4-pro",
      targetCommitmentIds: ["commitment-1"],
      commitmentWorkPacketRefs: ["runtime-work-graph://packet/commitment-1/hash"],
      requestedContextQuestions: ["Which workflow source files implement this commitment?"],
      candidateFileRefs: ["scripts/", "extensions/execution-platform/src/workflows/"],
      expectedRepoAreaRefs: ["extensions/execution-platform/src/workflows/"],
      verifiedFileRefs,
      contextHandoffPacketRef: "runtime-job://job-expected-area/context-handoff/context-node",
      contextHandoffPacket: handoff,
      modelAuthoredSummary: "Only script context was verified.",
    });

    expect(validateContextScoutToolLoopForImplementation(run)).toMatchObject({
      valid: false,
      reasonCodes: [
        "context_scout_sufficiency_not_accepted",
        "context_scout_not_sufficient_for_implementation",
      ],
    });
    expect(run.sufficiencyReview.missingInformation).toContain(
      "Verified repo refs did not cover the expected source repo areas from the CommitmentWorkPackets.",
    );
  });

  it("accepts verified candidate files discovered for a not-yet-existing expected source area", () => {
    const fileRef = "extensions/execution-platform/src/workflows/product-spec-planning-workflow.ts";
    const handoff = buildContextHandoffPacket({
      sourceNodeId: "context-node",
      targetCommitmentIds: ["commitment-1"],
      relevantFileRefs: [fileRef],
      existingPatterns: [
        "Candidate discovery can identify an existing workflow file when the expected folder is not created yet.",
      ],
      validationSuggestions: [
        "Run the focused context-scout tool-loop tests.",
        "Check that candidate coverage does not require nonexistent directories.",
      ],
      handoffSummaryForImplementation:
        "The scout used runtime-discovered Product/Spec Planning workflow context. Implementation should use the existing workflow file as the concrete anchor while preserving the not-yet-existing expected source area as a limitation for downstream planning.",
    });
    const verifiedFileRefs = buildContextScoutVerifiedFileRefs({
      runtimeJobId: "job-candidate-coverage",
      nodeId: "context-node",
      fileRefs: [fileRef],
    });

    const run = buildContextScoutToolLoopRun({
      runtimeJobId: "job-candidate-coverage",
      graphId: "graph-candidate-coverage",
      nodeId: "context-node",
      roleId: "context_scout",
      modelRef: "openrouter/deepseek-v4-pro",
      targetCommitmentIds: ["commitment-1"],
      commitmentWorkPacketRefs: ["runtime-work-graph://packet/commitment-1/hash"],
      requestedContextQuestions: ["Which Product/Spec Planning workflow files matter?"],
      candidateFileRefs: [fileRef],
      expectedRepoAreaRefs: ["extensions/execution-platform/src/workflows/product-spec-planning/"],
      verifiedFileRefs,
      contextHandoffPacketRef: "runtime-job://job-candidate-coverage/context-handoff/context-node",
      contextHandoffPacket: handoff,
      modelAuthoredSummary:
        "Runtime candidate discovery found the existing workflow file. The downstream implementer should inspect that file first, preserve the existing workflow pattern, and only create a new folder if the implementation actually needs a new source area.",
    });

    expect(validateContextScoutToolLoopForImplementation(run)).toEqual({
      valid: true,
      reasonCodes: [],
    });
  });

  it("does not unlock implementation from runtime-supplied verified refs even when model handoff has substance", () => {
    const fileRef = "extensions/execution-platform/src/workflows/product-spec-planning-workflow.ts";
    const handoff = buildContextHandoffPacket({
      sourceNodeId: "context-node-runtime-fallback",
      targetCommitmentIds: ["commitment-1"],
      relevantFileRefs: [fileRef],
      existingPatterns: [
        "Workflow contracts expose allowed node kinds and executor policy fields.",
      ],
      validationSuggestions: [
        "Run product-spec planning workflow tests.",
        "Run scheduler graph tests after wiring the node executor.",
      ],
      handoffSummaryForImplementation:
        "The Product/Spec Planning workflow should follow the existing workflow contract structure and register scheduler-backed node executors. Use the verified workflow file as the anchor and preserve runtime evidence claims for closeout.",
      limitations: [
        "Model output did not provide verified repo file refs; runtime supplied verified context-tool file refs instead.",
      ],
    });
    const verifiedFileRefs = buildContextScoutVerifiedFileRefs({
      runtimeJobId: "job-runtime-fallback",
      nodeId: "context-node-runtime-fallback",
      fileRefs: [fileRef],
      reasonCodes: ["context_scout_tool_first_verified_context_used"],
    });

    const run = buildContextScoutToolLoopRun({
      runtimeJobId: "job-runtime-fallback",
      graphId: "graph-runtime-fallback",
      nodeId: "context-node-runtime-fallback",
      roleId: "context_scout",
      modelRef: "openrouter/qwen3-coder-next",
      targetCommitmentIds: ["commitment-1"],
      commitmentWorkPacketRefs: ["runtime-work-graph://packet/commitment-1/hash"],
      requestedContextQuestions: ["Which workflow files matter?"],
      verifiedFileRefs,
      contextHandoffPacketRef: "runtime-job://job-runtime-fallback/context-handoff/context-node",
      contextHandoffPacket: handoff,
      modelAuthoredSummary:
        "The Product/Spec Planning workflow should follow the existing workflow contract structure and register scheduler-backed node executors. Use the verified workflow file as the anchor and preserve runtime evidence claims for closeout.",
      limitations: handoff.limitations,
      groundingReasonCodes: ["context_scout_tool_first_verified_context_used"],
    });

    expect(run.sufficiencyReview.status).toBe("accepted_with_limitations");
    expect(validateContextScoutToolLoopForImplementation(run)).toEqual({
      valid: false,
      reasonCodes: [
        "context_scout_sufficiency_not_accepted",
        "context_scout_accepted_with_limitations",
        "context_scout_accepted_with_limitations_consumer_waiver_missing",
        "context_scout_runtime_only_context_detected",
        "context_scout_non_runtime_context_source_missing",
      ],
    });
  });

  it("does not cleanly accept runtime-supplied refs when model handoff substance is generic", () => {
    const fileRef = "extensions/execution-platform/src/workflows/product-spec-planning-workflow.ts";
    const handoff = buildContextHandoffPacket({
      sourceNodeId: "context-node-generic",
      targetCommitmentIds: ["commitment-1"],
      relevantFileRefs: [fileRef],
      validationSuggestions: ["Run tests."],
      handoffSummaryForImplementation:
        "Use target refs extensions/execution-platform/src/workflows/ and validate with the focused test.",
      limitations: [
        "Model output did not provide verified repo file refs; runtime supplied verified context-tool file refs instead.",
      ],
    });
    const verifiedFileRefs = buildContextScoutVerifiedFileRefs({
      runtimeJobId: "job-generic",
      nodeId: "context-node-generic",
      fileRefs: [fileRef],
      reasonCodes: ["context_scout_tool_first_verified_context_used"],
    });

    const run = buildContextScoutToolLoopRun({
      runtimeJobId: "job-generic",
      graphId: "graph-generic",
      nodeId: "context-node-generic",
      roleId: "context_scout",
      modelRef: "openrouter/qwen3-coder-next",
      targetCommitmentIds: ["commitment-1"],
      commitmentWorkPacketRefs: ["runtime-work-graph://packet/commitment-1/hash"],
      requestedContextQuestions: ["Which workflow files matter?"],
      verifiedFileRefs,
      contextHandoffPacketRef: "runtime-job://job-generic/context-handoff/context-node",
      contextHandoffPacket: handoff,
      modelAuthoredSummary: handoff.handoffSummaryForImplementation,
      limitations: handoff.limitations,
      groundingReasonCodes: ["context_scout_tool_first_verified_context_used"],
    });

    expect(run.sufficiencyReview.status).toBe("accepted_with_limitations");
    expect(validateContextScoutToolLoopForImplementation(run)).toMatchObject({
      valid: false,
      reasonCodes: expect.arrayContaining([
        "context_scout_sufficiency_not_accepted",
        "context_scout_accepted_with_limitations",
        "context_scout_accepted_with_limitations_consumer_waiver_missing",
        "context_scout_runtime_only_context_detected",
        "context_scout_non_runtime_context_source_missing",
      ]),
    });
  });

  it("preserves runtime verified bounded summaries in file-ref evidence", () => {
    const verifiedFileRefs = buildContextScoutVerifiedFileRefs({
      runtimeJobId: "job-verified",
      nodeId: "context-node",
      fileRefs: ["extensions/execution-platform/src/workflows/product-spec-planning-plugin.ts"],
      boundedSummariesByFileRef: {
        "extensions/execution-platform/src/workflows/product-spec-planning-plugin.ts":
          "Defines the workflow plugin surface and scheduler-backed evidence profile.",
      },
      reasonCodes: ["context_scout_tool_first_verified_context_used"],
    });

    expect(verifiedFileRefs[0]).toMatchObject({
      fileRef: "extensions/execution-platform/src/workflows/product-spec-planning-plugin.ts",
      boundedSummary: "Defines the workflow plugin surface and scheduler-backed evidence profile.",
      rawFileContentStored: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    });
    expect(verifiedFileRefs[0]?.reasonCodes).toContain(
      "context_scout_tool_first_verified_context_used",
    );
  });

  it("registers every context scout operation as a runtime tool", () => {
    expect(SCHEDULER_RUNTIME_TOOL_IDS).toEqual(
      expect.arrayContaining([...CONTEXT_SCOUT_TOOL_LOOP_TOOL_IDS]),
    );
    for (const toolId of CONTEXT_SCOUT_TOOL_LOOP_TOOL_IDS) {
      const definition = buildSchedulerRuntimeToolDefinition(toolId);
      expect(definition.toolFamily).toBe(
        toolId.startsWith("code.") ? "code_intelligence.query" : "context_scout.tool_loop",
      );
      expect(["read_only", "bounded_runtime_write"]).toContain(definition.authorityClass);
      expect(definition.rawPromptStored).toBe(false);
    }
  });
});
