import { describe, expect, it } from "vitest";
import {
  applyObligationToolCallsToDraft,
  obligationToolManifest,
  summarizeObligationGraphForScheduler,
} from "./obligation-graph.ts";
import type { MissionContractLedger } from "./mission-contract-ledger.ts";

function ledger(): MissionContractLedger {
  return {
    artifactKind: "mission_contract_ledger",
    schemaVersion: "execution-platform.mission-contract-ledger.v1",
    missionId: "mission-obligation-proof",
    sourceRuntimeJobId: null,
    sourceWorkItemId: null,
    ownerObjectiveSummary:
      "Implement a production planning workflow and prove read-only evidence without forcing every commitment into implementation.",
    blockingCommitments: [
      {
        commitmentId: "implement-workflow",
        commitmentText: "Implement the production workflow path.",
        whyItMatters: "This is the runnable coding obligation.",
        expectedEvidenceDescription: "Changed files and validation evidence.",
        acceptedEvidenceRefs: [],
        rejectedEvidenceRefs: [],
        status: "pending",
        rationale: null,
        remainingWork: ["Create runnable WorkIntent", "Run worker validation"],
        blocking: true,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
      {
        commitmentId: "read-spec-first",
        commitmentText: "Read the source specs before editing.",
        whyItMatters: "This is a grounding obligation, not an edit obligation.",
        expectedEvidenceDescription: "Read-only source/spec evidence.",
        acceptedEvidenceRefs: [],
        rejectedEvidenceRefs: [],
        status: "pending",
        rationale: null,
        remainingWork: ["Ground the implementation in specs"],
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
    missionGateRationale: null,
    ledgerStatus: "pending",
    revisionProposals: [],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
  };
}

describe("ObligationGraph", () => {
  it("exposes small verbs instead of universal worker packet fields", () => {
    const manifest = obligationToolManifest();
    expect(JSON.stringify(manifest)).toContain("obligation.create");
    expect(JSON.stringify(manifest)).not.toContain("workerObjective");
    expect(JSON.stringify(manifest)).not.toContain("contextScoutObjective");
    expect(JSON.stringify(manifest)).not.toContain("expectedImplementationOutput");
  });

  it("accepts read-only obligations without implementation packet fields", () => {
    const result = applyObligationToolCallsToDraft({
      missionId: "mission-obligation-proof",
      graphId: "mission-obligation-proof:obligation-graph",
      graphRefPrefix: "runtime-job://job/obligation-graph/mission-obligation-proof",
      sourceMissionLedgerRef: "runtime-job://job/mission-ledger/ref",
      ledger: ledger(),
      modelOutputs: [
        {
          obligationActions: [
            {
              tool: "obligation.create",
              obligationId: "obl-implement-workflow",
              commitmentIds: ["implement-workflow"],
              ownerIntentSummary: "Implement the production workflow path.",
            },
            {
              tool: "obligation.mark_executable_candidate",
              obligationId: "obl-implement-workflow",
              executionIntentHint: "source_edit",
              selectedCapabilityHints: ["implementation_microtask"],
              resourceRequirementKinds: ["repo_authority"],
            },
            {
              tool: "obligation.add_success_condition",
              obligationId: "obl-implement-workflow",
              successCondition: "Workflow path is implemented and validated.",
            },
            {
              tool: "obligation.add_evidence_expectation",
              obligationId: "obl-implement-workflow",
              evidenceExpectation: "Changed files and validation refs.",
            },
            {
              tool: "obligation.create",
              obligationId: "obl-read-spec-first",
              commitmentIds: ["read-spec-first"],
              ownerIntentSummary: "Ground implementation in source specs before editing.",
            },
            {
              tool: "obligation.mark_non_executable",
              obligationId: "obl-read-spec-first",
              obligationKind: "read_only_grounding",
              evidenceExpectation: "Read-only source/spec evidence refs.",
            },
            {
              tool: "obligation.add_success_condition",
              obligationId: "obl-read-spec-first",
              successCondition: "Relevant source specs are identified and cited.",
            },
            {
              tool: "obligation.submit_graph",
            },
          ],
        },
      ],
    });

    expect(result.status).toBe("accepted");
    expect(result.graph?.obligations).toHaveLength(2);
    expect(result.graph?.obligations.find((item) => item.obligationId === "obl-read-spec-first"))
      .toMatchObject({
        obligationKind: "read_only_grounding",
        evidenceExpectation: "Read-only source/spec evidence refs.",
      });
    expect(JSON.stringify(result.graph)).not.toContain("expectedImplementationOutput");
    const summary = summarizeObligationGraphForScheduler(result.graph);
    expect(summary).toMatchObject({
      obligationCount: 2,
      executableCount: 1,
      nonExecutableCount: 1,
    });
  });

  it("blocks incomplete obligation graphs instead of falling back to packet fanout", () => {
    const result = applyObligationToolCallsToDraft({
      missionId: "mission-obligation-proof",
      graphId: "mission-obligation-proof:obligation-graph",
      graphRefPrefix: "runtime-job://job/obligation-graph/mission-obligation-proof",
      ledger: ledger(),
      modelOutputs: [
        {
          obligationActions: [
            {
              tool: "obligation.create",
              obligationId: "obl-read-spec-first",
              commitmentIds: ["read-spec-first"],
            },
            {
              tool: "obligation.submit_graph",
            },
          ],
        },
      ],
    });

    expect(result.status).toBe("blocked");
    expect(result.graph).toBeNull();
    expect(result.reasonCodes).toContain("obligation_missing_obligationKind:obl-read-spec-first");
    expect(result.reasonCodes).toContain("obligation_graph_blocked");
  });
});
