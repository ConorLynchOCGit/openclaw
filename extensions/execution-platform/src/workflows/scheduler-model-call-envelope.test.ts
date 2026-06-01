import { describe, expect, it } from "vitest";
import {
  buildSchedulerModelCallEnvelope,
  schedulerModelCallEnvelopePhaseFromProgress,
} from "./scheduler-model-call-envelope.ts";

describe("scheduler model call envelope", () => {
  it("builds a bounded owner-facing envelope without raw model/provider payloads", () => {
    const envelope = buildSchedulerModelCallEnvelope({
      phase: "completion",
      spanId: "job-1:graph-1:scheduler:7:0",
      runtimeJobId: "job-1",
      workItemId: "work-1",
      graphId: "graph-1",
      schedulerIteration: 7,
      currentSuperstep: 7,
      repairAttempt: 0,
      decisionSlot: "scheduler.select_next_action",
      schedulerPhase: "scheduler_decision_model_call",
      modelRef: "openai-codex/gpt-5.5",
      providerPath: "codex_app_server",
      providerProfileId: "codex_app_server",
      modelTaskClass: "global_reasoning",
      modelPolicyRef: "model-task-policy://global_reasoning/default",
      contractBoundaryId: "scheduler_global_reasoning",
      modelPolicyBindingRef: "model-contract-boundary://scheduler_global_reasoning",
      reasoningMode: "high",
      parserMode: "json_object",
      allowedToolFamily: "scheduler.orchestrator_decision",
      allowedOutputContractId: "runtime_work_graph_orchestrator_plan",
      allowedOutputContractVersion: "v1",
      proofCleanlinessState: "clean",
      proofCleanlinessReasonCodes: ["model_policy_proof_clean"],
      policyMismatchFields: [
        {
          fieldPath: "timeoutMs",
          reasonCode: "model_policy_timeout_exceeds_bound",
        },
      ],
      inputByteCount: 23_456,
      inputHash: "sha256:input",
      commitmentCount: 14,
      workIntentCount: 6,
      graphNodeCount: 8,
      graphEdgeCount: 9,
      activeFrontierCounts: {
        ready: 3,
        blocked: 1,
      },
      elapsedMs: 182_000,
      timeoutMs: 900_000,
      heartbeatCount: 18,
      heartbeatAgeMs: 10_000,
      outputByteCount: 12_345,
      outputHash: "sha256:output",
      finishReason: "stop",
      responseShapeSummary: {
        outputBytes: 12_345,
        topLevelKeys: ["decisionId", "decisionKind"],
      },
      modelProviderDiagnostics: {
        choicesLength: 1,
        messageKeys: ["role", "content"],
        contentLengths: [12_345],
        responseBody: "must-not-be-exposed",
      },
      acceptedToolCallSummary: {
        decisionKind: "add_nodes",
      },
      reasonCodes: ["scheduler_orchestrator_model_call"],
    });

    expect(envelope).toMatchObject({
      artifactKind: "runtime_work_graph_scheduler_model_call_envelope",
      phase: "completion",
      decisionSlot: "scheduler.select_next_action",
      allowedToolFamily: "scheduler.orchestrator_decision",
      contractBoundaryId: "scheduler_global_reasoning",
      modelPolicyBindingRef: "model-contract-boundary://scheduler_global_reasoning",
      proofCleanlinessState: "clean",
      policyMismatchFields: [
        {
          fieldPath: "timeoutMs",
          reasonCode: "model_policy_timeout_exceeds_bound",
        },
      ],
      inputByteCount: 23_456,
      outputByteCount: 12_345,
      graphNodeCount: 8,
      activeFrontierCounts: {
        ready: 3,
        blocked: 1,
      },
      providerResponseShape: {
        choicesLength: 1,
        messageKeys: ["role", "content"],
        contentLengths: [12_345],
      },
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      hiddenReasoningStored: false,
      secretsStored: false,
    });
    expect(JSON.stringify(envelope)).not.toContain("must-not-be-exposed");
  });

  it("maps live progress phases into scheduler envelope lifecycle phases", () => {
    expect(schedulerModelCallEnvelopePhaseFromProgress("started", 0)).toBe("preflight");
    expect(schedulerModelCallEnvelopePhaseFromProgress("started", 1)).toBe("repair");
    expect(schedulerModelCallEnvelopePhaseFromProgress("heartbeat", 0)).toBe("heartbeat");
    expect(schedulerModelCallEnvelopePhaseFromProgress("completed", 0)).toBe("completion");
    expect(schedulerModelCallEnvelopePhaseFromProgress("failed", 0)).toBe("rejection");
  });
});
