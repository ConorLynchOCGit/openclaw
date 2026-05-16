import { describe, expect, it } from "vitest";
import {
  applyMissionCommitmentEvaluation,
  missionLedgerBlocksExecution,
  missionLedgerHasOpenBlockingCommitments,
  missionLedgerRequiresReviewBeforeExecution,
  normalizeMissionContractLedger,
  parseMissionCommitmentEvaluation,
  parseMissionContractLedger,
  summarizeMissionContractLedger,
} from "./mission-contract-ledger.ts";

describe("mission contract ledger", () => {
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
        deliverableKind: "product_spec_planning",
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

  it("carries model-authored safety constraints and mission gates without deterministic taxonomy", () => {
    const ledger = normalizeMissionContractLedger({
      missionId: "mission-safety",
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
        explicitNonGoals: ["Do not deploy."],
        safetyConstraints: [
          {
            constraintId: "no-deploy",
            constraintText: "Do not deploy.",
            boundaryKind: "side_effect",
            enforcementOwner: "runtime_policy",
            evidenceRefs: [],
          },
        ],
        prohibitedDirectiveCandidates: [
          {
            directiveId: "deploy-text",
            directiveText: "Do not deploy.",
            classification: "constraint_not_primary",
            rationale: "The owner used deploy as a negative safety boundary.",
            actionCategory: "deploy",
            evidenceRefs: [],
          },
        ],
        missionGate: "clear_to_execute",
        missionGateRationale: "Dangerous words are safety constraints, not primary work.",
      },
    });

    const summary = summarizeMissionContractLedger(ledger);

    expect(ledger.safetyConstraints[0]?.constraintText).toBe("Do not deploy.");
    expect(ledger.prohibitedDirectiveCandidates[0]?.classification).toBe("constraint_not_primary");
    expect(summary.safetyConstraintCount).toBe(1);
    expect(summary.prohibitedPrimaryDirectiveCount).toBe(0);
    expect(missionLedgerBlocksExecution(ledger)).toBe(false);
    expect(missionLedgerRequiresReviewBeforeExecution(ledger)).toBe(false);
  });

  it("blocks execution when the model-authored mission gate finds primary prohibited work", () => {
    const ledger = normalizeMissionContractLedger({
      missionId: "mission-blocked",
      ownerObjectiveSummary: "Deploy production without approval.",
      value: {
        blockingCommitments: [
          {
            commitmentId: "unsafe-primary",
            commitmentText: "Deploy production without approval.",
            whyItMatters: "This is the primary requested outcome.",
            expectedEvidenceDescription: "No execution evidence should be created.",
            status: "needs_review",
            blocking: true,
          },
        ],
        prohibitedDirectiveCandidates: [
          {
            directiveId: "unsafe-deploy",
            directiveText: "Deploy production without approval.",
            classification: "primary_prohibited",
            rationale: "The prohibited side effect is the primary requested outcome.",
            actionCategory: "deploy",
            evidenceRefs: [],
          },
        ],
        missionGate: "blocked_primary_prohibited",
        missionGateRationale: "Primary mission requests prohibited production deploy.",
      },
    });

    expect(ledger.ledgerStatus).toBe("blocked");
    expect(missionLedgerBlocksExecution(ledger)).toBe(true);
    expect(summarizeMissionContractLedger(ledger).prohibitedPrimaryDirectiveCount).toBe(1);
  });
});
