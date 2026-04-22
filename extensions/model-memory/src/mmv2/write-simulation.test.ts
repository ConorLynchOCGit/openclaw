import { describe, expect, it } from "vitest";
import { MMV2_DOCUMENT_PROOF_CASES } from "./proof-corpus.ts";
import { runMmV2ProofCase } from "./proof-runner.ts";
import { simulateWritePolicy } from "./write-simulation.ts";

describe("mmv2/write-simulation", () => {
  it("marks duplicate-seeded cases as realistic no-op writes even when shadow recording created an object", async () => {
    const duplicateCase = MMV2_DOCUMENT_PROOF_CASES.find(
      (proofCase) => proofCase.id === "mmv2-doc-004-duplicate-seeded",
    )!;
    const result = await runMmV2ProofCase(duplicateCase);

    expect(result.writeSimulation.candidates[0]).toMatchObject({
      candidateId: "candidate-duplicate-001",
      disposition: "keep_existing_noop",
      createsNewDurableMemory: false,
      shadowDurableMemoryCreated: true,
      overstatesWrite: true,
    });
    expect(result.writeSimulation.summary).toMatchObject({
      realisticDurableMemoryCount: 0,
      shadowDurableMemoryCount: 1,
      overstatementCount: 1,
    });
  });

  it("simulates supersede as a new durable write while conflict stays non-durable", async () => {
    const supersedeCase = MMV2_DOCUMENT_PROOF_CASES.find(
      (proofCase) => proofCase.id === "mmv2-doc-005-preference-change-seeded",
    )!;
    const conflictCase = MMV2_DOCUMENT_PROOF_CASES.find(
      (proofCase) => proofCase.id === "mmv2-doc-013-near-duplicate-source-ref-conflict",
    )!;
    const supersedeResult = await runMmV2ProofCase(supersedeCase);
    const conflictResult = await runMmV2ProofCase(conflictCase);

    expect(supersedeResult.writeSimulation.candidates[0]).toMatchObject({
      disposition: "create_superseding_memory",
      createsNewDurableMemory: true,
      overstatesWrite: false,
    });
    expect(conflictResult.writeSimulation.candidates[0]).toMatchObject({
      disposition: "create_conflict_record",
      createsNewDurableMemory: false,
      overstatesWrite: true,
    });
  });

  it("can simulate writes directly from run artifacts", async () => {
    const proofCase = MMV2_DOCUMENT_PROOF_CASES.find(
      (entry) => entry.id === "mmv2-doc-001-preference-claim",
    )!;
    const result = await runMmV2ProofCase(proofCase);
    const simulation = simulateWritePolicy({
      canonicalBatch: result.run!.canonicalization,
      admissionBatch: result.run!.admission,
      reconciliationDecisions: result.run!.reconciliation,
      shadowRecording: result.run!.shadowRecording,
    });

    expect(simulation.summary.realisticDurableMemoryCount).toBe(1);
    expect(simulation.summary.overstatementCount).toBe(0);
  });
});
