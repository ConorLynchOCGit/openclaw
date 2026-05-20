import { describe, expect, it } from "vitest";
import {
  buildUxReplayPayloadParityEnvelope,
  compareUxReplayPayloadParity,
  validateUxReplayPayloadProofEligibility,
  type BuildUxReplayPayloadParityEnvelopeInput,
} from "./ux-replay-payload-parity.ts";

function baseEnvelopeInput(
  overrides: Partial<BuildUxReplayPayloadParityEnvelopeInput> = {},
): BuildUxReplayPayloadParityEnvelopeInput {
  return {
    submissionSurface: "ux_prompt_file",
    diagnosticOnly: false,
    ownerPrompt: {
      promptHash: "a".repeat(64),
      promptLength: 24_000,
      sourcePromptRef: "source-prompt://aaaaaaaaaaaaaaaa/full",
      promptFileRef: "prompt-file://aaaaaaaaaaaaaaaa",
      sourcePromptContextIndexRef: "source-prompt-context://aaaaaaaaaaaaaaaa/index",
      sourcePromptResolutionStatus: "resolved",
      rawPromptStored: false,
    },
    chatRefs: {
      sessionRef: "gateway-session://main",
      conversationRef: "gateway-conversation://main",
      turnRef: "gateway-turn://run-1",
      ownerTurnInFlightRef: "owner-turn://run-1",
    },
    routeRefs: {
      routeSelected: "workflow_execution",
      workflowId: "agent_team.coding",
      executorWorkflowId: "agent_team.coding",
      jobType: "executor.agent_team",
      responseMode: "create_runtime_job",
      executeNow: true,
      routerDecisionRef: "runtime-job://job-1/execution/front-door/router-result",
      routerToolProtocolRef: "router-front-door-tool-protocol://request-1",
      routerToolInvocationRefs: ["runtime-tool://router/classify_intent/request-1"],
      requestCompilerRef: "runtime-job://job-1/execution/front-door/compiled-request",
      missionLedgerHandoffRef: "mission-ledger-handoff://request-1",
    },
    executionRefs: {
      runtimeJobId: "job-1",
      runtimeJobPayloadHash: "b".repeat(64),
      queueName: "agent-team",
      workItemId: "openclaw-convergence.pre-product-spec-04-ux-replay-payload-parity",
      idempotencyScope: "workflow:agent_team.coding",
      idempotencyKeyHash: "c".repeat(64),
      graphId: "graph-1",
    },
    missionLedgerRefs: {
      missionLedgerInputRef: "mission-ledger-input://aaaaaaaaaaaaaaaa",
      missionLedgerPromptHash: "a".repeat(64),
      missionLedgerRef: "mission-ledger://job-1/ledger",
      commitmentPacketInputRef: "commitment-work-packet-input://job-1",
      commitmentPacketRef: "commitment-work-packets://job-1",
    },
    schedulerRefs: {
      workflowDefinitionRef: "workflow-definition://agent_team.coding",
      capabilityManifestRef: "runtime-node-capability-manifest://default",
      schedulerHandoffRefs: ["scheduler-handoff://job-1/decomposition"],
      graphCompilerRefs: ["graph-compiler://job-1/compile"],
      acceptedGraphRef: "runtime-work-graph://graph-1",
    },
    safetyStorageFlags: {
      rawPromptStored: false,
      rawResponseStored: false,
      rawTranscriptStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
      secretsStored: false,
      deployRequested: false,
      outboundSendRequested: false,
      modelPromotionRequested: false,
      authorityGranted: false,
      controlsApplied: false,
      workQueueLifecycleMutated: false,
      runtimeLifecycleMutated: false,
    },
    ...overrides,
  };
}

describe("UX/replay payload parity", () => {
  it("accepts a replay clone with the same proof-critical UX prompt-file payload fields", () => {
    const ux = buildUxReplayPayloadParityEnvelope(baseEnvelopeInput());
    const replay = buildUxReplayPayloadParityEnvelope({
      ...baseEnvelopeInput({
        submissionSurface: "replay",
      }),
      executionRefs: {
        ...baseEnvelopeInput().executionRefs,
        runtimeJobId: "job-replay",
        runtimeJobPayloadHash: "d".repeat(64),
      },
      chatRefs: {
        sessionRef: "replay-session://local",
        conversationRef: "replay-conversation://local",
        turnRef: "replay-turn://local",
        ownerTurnInFlightRef: null,
      },
      routeRefs: {
        ...baseEnvelopeInput().routeRefs,
        routerDecisionRef: "runtime-job://job-replay/execution/front-door/router-result",
        requestCompilerRef: "runtime-job://job-replay/execution/front-door/compiled-request",
      },
    });

    const comparison = compareUxReplayPayloadParity({ expected: ux, actual: replay });

    expect(comparison.accepted).toBe(true);
    expect(comparison.mismatchPaths).toEqual([]);
    expect(comparison.reasonCodes).toContain("ux_replay_payload_parity_accepted");
  });

  it("rejects direct native diagnostic payloads as production proof evidence", () => {
    const direct = buildUxReplayPayloadParityEnvelope(
      baseEnvelopeInput({
        submissionSurface: "direct_native",
        diagnosticOnly: true,
      }),
    );

    const eligibility = validateUxReplayPayloadProofEligibility(direct);

    expect(eligibility.accepted).toBe(false);
    expect(eligibility.reasonCodes).toEqual(
      expect.arrayContaining([
        "surface_not_proof_eligible:direct_native",
        "diagnostic_only_payload_not_proof_eligible",
      ]),
    );
  });

  it("rejects prompt hash mismatches instead of treating replay as UX-equivalent", () => {
    const expected = buildUxReplayPayloadParityEnvelope(baseEnvelopeInput());
    const actual = buildUxReplayPayloadParityEnvelope(
      baseEnvelopeInput({
        submissionSurface: "replay",
        ownerPrompt: {
          ...baseEnvelopeInput().ownerPrompt,
          promptHash: "e".repeat(64),
        },
        missionLedgerRefs: {
          ...baseEnvelopeInput().missionLedgerRefs,
          missionLedgerPromptHash: "e".repeat(64),
        },
      }),
    );

    const comparison = compareUxReplayPayloadParity({ expected, actual });

    expect(comparison.accepted).toBe(false);
    expect(comparison.reasonCodes).toEqual(
      expect.arrayContaining([
        "parity_mismatch:$.missionLedger.missionLedgerPromptHash",
        "parity_mismatch:$.proofCriticalPrompt.promptHash",
      ]),
    );
  });

  it("rejects missing scheduler handoff refs because replay would skip graph state", () => {
    expect(() =>
      buildUxReplayPayloadParityEnvelope(
        baseEnvelopeInput({
          schedulerRefs: {
            ...baseEnvelopeInput().schedulerRefs,
            schedulerHandoffRefs: [],
          },
        }),
      ),
    ).toThrow();
  });

  it("rejects raw storage flags at the envelope schema boundary", () => {
    expect(() =>
      buildUxReplayPayloadParityEnvelope({
        ...baseEnvelopeInput(),
        safetyStorageFlags: {
          ...baseEnvelopeInput().safetyStorageFlags,
          rawPromptStored: true as false,
        },
      }),
    ).toThrow();
  });
});
