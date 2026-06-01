import { describe, expect, it } from "vitest";
import type { JsonValue } from "../runtime-job-repository.ts";
import type { DynamicCodingTeamModelClient } from "../codex-bridge/dynamic-coding-team-orchestrator.ts";
import { MISSION_CONTRACT_LEDGER_ARTIFACT_TYPE, type MissionContractLedger } from "./mission-contract-ledger.ts";
import { IntakeStageRunner } from "./intake-stage-runner.ts";

function ledger(): MissionContractLedger {
  return {
    artifactKind: "mission_contract_ledger",
    schemaVersion: "execution-platform.mission-contract-ledger.v1",
    missionId: "mission-intake-proof",
    sourceRuntimeJobId: null,
    sourceWorkItemId: null,
    ownerObjectiveSummary: "Implement a real intake runner.",
    blockingCommitments: [
      {
        commitmentId: "commitment-a",
        commitmentText: "Implement intake runner ownership.",
        whyItMatters: "Intake must not be inline graph-runner code.",
        expectedEvidenceDescription: "Typed obligation graph and scheduler-ready intake.",
        acceptedEvidenceRefs: [],
        rejectedEvidenceRefs: [],
        status: "pending",
        rationale: null,
        remainingWork: ["Create runnable WorkIntent seed"],
        blocking: true,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    ],
    nonBlockingCommitments: [],
    explicitNonGoals: [],
    safetyConstraints: [],
    prohibitedDirectiveCandidates: [],
    revisionProposals: [],
    authorityBoundary: {
      requestedAuthority: null,
      maximumAuthority: "workflow_default",
      requiresApproval: false,
      approvalRefs: [],
      authorityRefs: [],
      rawPromptStored: false,
      rawResponseStored: false,
    },
    storagePolicy: {
      rawPromptStorageAllowed: false,
      rawResponseStorageAllowed: false,
      rawTranscriptStorageAllowed: false,
      rawProviderLogStorageAllowed: false,
      rawToolLogStorageAllowed: false,
      rawDbRowStorageAllowed: false,
      secretsStorageAllowed: false,
      boundedRefsOnly: true,
    },
    lifecycleBoundary: {
      workQueueLifecycleMutationAllowed: false,
      authorityGrantAllowed: false,
      deployAllowed: false,
      outboundSendAllowed: false,
      modelPromotionAllowed: false,
      runtimeJobLifecycleOwner: "runtime_jobs",
    },
    missionGate: "clear_to_execute",
    missionGateRationale: "Allowed engineering work.",
    ledgerStatus: "pending",
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
  };
}

function validActions(): string {
  return JSON.stringify({
    obligationActions: [
      {
        tool: "obligation.create",
        obligationId: "obligation-a",
        commitmentIds: ["commitment-a"],
        ownerIntentSummary: "Implement intake runner ownership.",
      },
      {
        tool: "obligation.mark_executable_candidate",
        obligationId: "obligation-a",
        executionIntentHint: "source_edit",
        selectedCapabilityHints: ["coding.implementation"],
        resourceRequirementKinds: ["repo_files"],
      },
      {
        tool: "obligation.add_success_condition",
        obligationId: "obligation-a",
        successCondition: "Scheduler receives a typed executable obligation.",
      },
      {
        tool: "obligation.add_evidence_expectation",
        obligationId: "obligation-a",
        evidenceExpectation: "Accepted obligation graph artifact.",
      },
      { tool: "obligation.submit_graph" },
    ],
  });
}

function runnerWithResponses(responses: string[]) {
  const progress: Array<Record<string, unknown>> = [];
  const artifacts: Array<Record<string, unknown>> = [];
  const calls: Array<Record<string, unknown>> = [];
  const modelClient: DynamicCodingTeamModelClient = {
    runJson: async (input) => {
      calls.push(input as unknown as Record<string, unknown>);
      return {
        modelRunRef: `model-run-${calls.length}`,
        responseText: responses.shift() ?? validActions(),
        responseHash: `hash-${calls.length}`,
        latencyMs: 12,
        rawPromptStored: false,
        rawResponseStored: false,
      };
    },
  };
  const acceptedLedger = ledger();
  const runtimeJobs = {
    listArtifacts: async () => [
      {
        artifactType: MISSION_CONTRACT_LEDGER_ARTIFACT_TYPE,
        uri: "runtime-job://source/mission-ledger/accepted",
        metadata: acceptedLedger,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ],
    attachArtifact: async (input: Record<string, unknown>) => {
      artifacts.push(input);
      return input;
    },
    attachRuntimeArtifactByContract: async (input: Record<string, unknown>) => {
      artifacts.push(input);
      return input;
    },
  };
  const runner = new IntakeStageRunner({
    runtimeJobs: runtimeJobs as never,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    missionModelClient: modelClient,
    attachProgress: async (input) => {
      progress.push(input as Record<string, unknown>);
      return `progress-${progress.length}`;
    },
    attachMissionLedger: async () => "runtime-job://job/mission-ledger/1",
    recordBoundaryCheckpoint: async () => "runtime-job://job/checkpoint/1",
    attachModelCallProgress: async () => undefined,
  });
  return { runner, progress, artifacts, calls };
}

describe("IntakeStageRunner", () => {
  it("owns ObligationGraph tool-shape repair before scheduler intake", async () => {
    const { runner, progress, calls } = runnerWithResponses([
      JSON.stringify({ obligations: [] }),
      validActions(),
    ]);

    const result = await runner.run({
      runtimeJobId: "job-intake",
      workItemId: null,
      graphId: "graph-intake",
      teamRunId: "team-intake",
      objective: "Implement intake runner ownership.",
      objectiveForModel: "Implement intake runner ownership.",
      sourcePromptResolution: { status: "resolved" } as JsonValue,
      sourcePromptContextIndexRef: "runtime-job://job/source-prompt/index",
      repoScopeRefs: ["extensions/execution-platform/src/"],
      validationCommandRefs: ["pnpm test:file intake-stage-runner.test.ts"],
      checkpointReplay: {
        sourceRuntimeJobId: "source-job",
        replayBoundary: "mission_ledger",
      } as JsonValue,
    });

    expect(result.obligationGraph?.obligations).toHaveLength(1);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.modelTaskCallSite).toBe("mission.obligation_graph_author.repair_tool_shape");
    expect(progress.map((item) => item.currentPhase)).toContain(
      "obligation_graph_repairing_tool_shape",
    );
  });

  it("blocks with typed intake diagnostics when parse and repair fail", async () => {
    const { runner, progress } = runnerWithResponses(["not json", JSON.stringify({ actions: [] })]);

    await expect(
      runner.run({
        runtimeJobId: "job-intake",
        workItemId: null,
        graphId: "graph-intake",
        teamRunId: "team-intake",
        objective: "Implement intake runner ownership.",
        objectiveForModel: "Implement intake runner ownership.",
        sourcePromptResolution: { status: "resolved" } as JsonValue,
        sourcePromptContextIndexRef: "runtime-job://job/source-prompt/index",
        repoScopeRefs: ["extensions/execution-platform/src/"],
        validationCommandRefs: ["pnpm test:file intake-stage-runner.test.ts"],
        checkpointReplay: {
          sourceRuntimeJobId: "source-job",
          replayBoundary: "mission_ledger",
        } as JsonValue,
      }),
    ).rejects.toThrow("obligation_graph_authoring_blocked");

    const blocked = progress.find((item) => item.currentPhase === "obligation_graph_blocked");
    expect(blocked?.reasonCodes).toContain("obligation_graph_author_output_parsed");
    expect(blocked?.reasonCodes).toContain("obligation_graph_submit_tool_missing");
  });
});
