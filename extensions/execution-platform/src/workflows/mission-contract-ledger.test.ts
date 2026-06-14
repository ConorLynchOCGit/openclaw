import { describe, expect, it } from "vitest";
import {
  applyMissionCommitmentEvaluation,
  applyMissionLedgerToolCallsToDraft,
  missionLedgerNativeToolDefinitions,
  missionLedgerProviderToolName,
  missionLedgerToolCallFromNativeToolCall,
  missionLedgerHasOpenBlockingCommitments,
  normalizeMissionContractLedger,
  parseMissionCommitmentEvaluation,
  parseMissionContractLedger,
  summarizeMissionContractLedger,
} from "./mission-contract-ledger.ts";

describe("mission contract ledger", () => {
  it("compiles provider-native Mission Ledger small verbs without authority or gate semantics", () => {
    const compile = applyMissionLedgerToolCallsToDraft({
      missionId: "mission-native",
      sourceRuntimeJobId: "job-native",
      sourceWorkItemId: "wq-native",
      ownerObjectiveSummary: "Implement workflow. Do not deploy.",
      modelOutputs: [
        {
          missionLedgerToolCalls: [
            {
              tool: "mission.add_blocking_commitment",
              input: {
                commitmentId: "implementation",
                commitmentText: "Implement the requested workflow.",
                whyItMatters: "Owner requested implementation.",
                expectedEvidenceDescription: "Changed-file refs and validation refs.",
                sourceAnchorRefs: ["Implement workflow"],
                lexicalAnchors: ["requested workflow"],
              },
            },
            {
              tool: "mission.add_safety_constraint",
              input: {
                constraintId: "no-deploy",
                constraintText: "Do not deploy.",
                boundaryKind: "side_effect",
              },
            },
          ],
        },
      ],
    });

    expect(compile.status).toBe("accepted");
    expect(compile.ledger?.blockingCommitments[0]?.commitmentId).toBe("implementation");
    expect(compile.ledger?.blockingCommitments[0]?.sourceAnchorRefs).toEqual([
      "Implement workflow",
    ]);
    expect(compile.ledger?.blockingCommitments[0]?.lexicalAnchors).toEqual(["requested workflow"]);
    expect(compile.ledger?.safetyConstraints[0]).toMatchObject({
      constraintId: "no-deploy",
      boundaryKind: "side_effect",
    });
    expect(compile.ledger && "missionGate" in compile.ledger).toBe(false);
    expect(compile.ledger && "authorityBoundary" in compile.ledger).toBe(false);
    expect(compile.reasonCodes).toContain("mission_ledger_native_tool_compile_accepted");
    expect(compile.reasonCodes).toContain("mission_ledger_runtime_submitted_after_required_fields");
  });

  it("maps only normal Mission Ledger authoring tools", () => {
    const definitions = missionLedgerNativeToolDefinitions([
      "mission.add_blocking_commitment",
      "mission.add_safety_constraint",
    ]);
    const call = missionLedgerToolCallFromNativeToolCall({
      providerToolName: missionLedgerProviderToolName("mission.add_blocking_commitment"),
      toolArguments: {
        commitmentId: "impl",
        commitmentText: "Implement the feature.",
        whyItMatters: "Owner requested it.",
        expectedEvidenceDescription: "Changed-file refs.",
      },
    });

    expect(definitions.map((definition) => definition.name)).toEqual([
      "mission_add_blocking_commitment",
      "mission_add_safety_constraint",
    ]);
    expect(definitions.map((definition) => definition.canonicalToolId)).not.toContain(
      "mission.add_prohibited_directive_candidate",
    );
    expect(call?.tool).toBe("mission.add_blocking_commitment");
    expect(call?.input.commitmentId).toBe("impl");
  });

  it("requires source grounding and lexical anchors for blocking commitments", () => {
    const compile = applyMissionLedgerToolCallsToDraft({
      missionId: "mission-grounding-required",
      sourceRuntimeJobId: "job-grounding-required",
      sourceWorkItemId: "wq-grounding-required",
      ownerObjectiveSummary: "Implement workflow behavior from the owner prompt.",
      modelOutputs: [
        {
          missionLedgerToolCalls: [
            {
              tool: "mission.add_blocking_commitment",
              input: {
                commitmentId: "implementation",
                commitmentText: "Implement the requested workflow.",
                whyItMatters: "Owner asked for working behavior.",
                expectedEvidenceDescription: "Changed-file refs and validation refs.",
              },
            },
          ],
        },
      ],
    });

    expect(compile.status).toBe("blocked");
    expect(compile.ledger).toBeNull();
    expect(compile.missingFields).toContain("blockingCommitmentSourceGrounding:implementation");
    expect(compile.missingFields).toContain("blockingCommitmentLexicalAnchors:implementation");
    expect(compile.reasonCodes).toContain(
      "mission_ledger_missing:blockingCommitmentSourceGrounding:implementation",
    );
    expect(compile.reasonCodes).toContain(
      "mission_ledger_missing:blockingCommitmentLexicalAnchors:implementation",
    );
  });

  it("normalizes model-authored commitments without deterministic deliverable taxonomy", () => {
    const ledger = normalizeMissionContractLedger({
      missionId: "mission-1",
      sourceRuntimeJobId: "job-1",
      sourceWorkItemId: "wq-1",
      ownerObjectiveSummary: "Build the planning workflow and prove it.",
      value: {
        blockingCommitments: [
          {
            commitmentId: "planning-workflow",
            commitmentText: "Implement the planning workflow surface.",
            whyItMatters: "Owner requested it as part of the mission.",
            expectedEvidenceDescription: "File refs, test refs, and closeout refs.",
            status: "pending",
            blocking: true,
          },
        ],
        explicitNonGoals: ["Do not deploy."],
      },
    });

    expect(ledger.blockingCommitments).toHaveLength(1);
    expect(ledger.blockingCommitments[0]?.commitmentText).toContain("planning workflow");
    expect(ledger.ledgerStatus).toBe("pending");
    expect("deliverableKind" in ledger.blockingCommitments[0]!).toBe(false);
  });

  it("rejects raw storage flags and unknown structured fields", () => {
    const ledger = normalizeMissionContractLedger({
      missionId: "mission-raw",
      ownerObjectiveSummary: "Do useful work.",
      value: {
        blockingCommitments: [
          {
            commitmentId: "unsafe",
            commitmentText: "Do useful work.",
            whyItMatters: "Mission.",
            expectedEvidenceDescription: "Evidence refs.",
            status: "pending",
            acceptedEvidenceRefs: [],
            rejectedEvidenceRefs: [],
            remainingWork: [],
            blocking: true,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
        ],
      },
    });

    expect(() =>
      parseMissionContractLedger({
        ...ledger,
        rawPromptStored: true,
      }),
    ).toThrow();
    expect(() =>
      parseMissionContractLedger({
        ...ledger,
        deliverableKind: "unknown_deliverable_kind",
      }),
    ).toThrow();
  });

  it("keeps clean success blocked until model evaluation closes blocking commitments", () => {
    const ledger = normalizeMissionContractLedger({
      missionId: "mission-2",
      ownerObjectiveSummary: "Edit source and run tests.",
      value: {
        blockingCommitments: [
          {
            commitmentId: "source-edit",
            commitmentText: "Edit source files.",
            whyItMatters: "Owner requested implementation.",
            expectedEvidenceDescription: "Changed file refs.",
            status: "pending",
            blocking: true,
          },
        ],
      },
    });

    expect(missionLedgerHasOpenBlockingCommitments(ledger)).toBe(true);
    const evaluation = parseMissionCommitmentEvaluation({
      artifactKind: "mission_commitment_evaluation",
      schemaVersion: "execution-platform.mission-contract-ledger.v1",
      evaluationId: "eval-1",
      missionId: "mission-2",
      commitmentUpdates: [
        {
          commitmentId: "source-edit",
          status: "satisfied",
          acceptedEvidenceRefs: ["runtime-job://job/source/file"],
          rejectedEvidenceRefs: [],
          rationale: "Model reviewer accepted changed-file evidence.",
          remainingWork: [],
        },
      ],
      revisionProposals: [],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
    });
    const closed = applyMissionCommitmentEvaluation({
      ledger,
      evaluation,
      availableEvidenceRefs: ["runtime-job://job/source/file"],
    });

    expect(closed.ledgerStatus).toBe("satisfied");
    expect(missionLedgerHasOpenBlockingCommitments(closed)).toBe(false);
    expect(summarizeMissionContractLedger(closed).openBlockingCommitmentCount).toBe(0);
  });

  it("bounds large model-authored safety and non-goal arrays before schema validation", () => {
    const ledger = normalizeMissionContractLedger({
      missionId: "mission-bounds",
      ownerObjectiveSummary: "Implement workflow. Do not deploy or store raw logs.",
      value: {
        blockingCommitments: [
          {
            commitmentId: "implementation",
            commitmentText: "Implement the requested workflow.",
            whyItMatters: "Owner requested production work.",
            expectedEvidenceDescription: "Changed file refs and validation refs.",
            status: "pending",
            blocking: true,
          },
        ],
        explicitNonGoals: Array.from(
          { length: 50 },
          (_, index) => `Do not perform excluded action ${index + 1}.`,
        ),
        safetyConstraints: Array.from({ length: 50 }, (_, index) => ({
          constraintId: `constraint-${index + 1}`,
          constraintText: `Respect safety boundary ${index + 1}.`,
          boundaryKind: "scope",
          evidenceRefs: [],
        })),
      },
    });

    expect(ledger.explicitNonGoals).toHaveLength(20);
    expect(ledger.safetyConstraints).toHaveLength(30);
    expect(ledger.blockingCommitments).toHaveLength(1);
  });
});
