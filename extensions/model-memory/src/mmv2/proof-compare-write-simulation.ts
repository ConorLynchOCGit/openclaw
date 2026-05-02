import {
  createPhaseMismatch,
  finalizePhaseResult,
  type MmV2PhaseMismatch,
} from "./proof-compare-shared.ts";
import type {
  MmV2WriteSimulationCandidateExpectation,
  MmV2WriteSimulationExpectation,
} from "./proof-corpus.ts";
import type { MmV2WriteSimulationResult } from "./write-simulation.ts";

export type MmV2WritePolicyComparisonResult = {
  pass: boolean;
  mismatches: MmV2PhaseMismatch[];
};

function findCandidate(
  simulation: MmV2WriteSimulationResult,
  expectation: MmV2WriteSimulationCandidateExpectation,
) {
  if (expectation.candidateId) {
    const exactIdMatch = simulation.candidates.find(
      (candidate) => candidate.candidateId === expectation.candidateId,
    );
    if (exactIdMatch) {
      return exactIdMatch;
    }
  }

  if (simulation.candidates.length === 1) {
    return simulation.candidates[0];
  }

  return undefined;
}

export function compareWriteSimulation(
  simulation: MmV2WriteSimulationResult,
  expectation?: MmV2WriteSimulationExpectation,
): MmV2WritePolicyComparisonResult {
  const mismatches: MmV2PhaseMismatch[] = [];
  if (!expectation) {
    return { pass: true, mismatches };
  }

  if (
    expectation.realisticDurableMemoryCount !== undefined &&
    simulation.summary.realisticDurableMemoryCount !== expectation.realisticDurableMemoryCount
  ) {
    mismatches.push(
      createPhaseMismatch(
        "recording",
        "write_simulation_realistic_count_mismatch",
        "Realistic durable write count did not match expectation.",
        { expectedCount: expectation.realisticDurableMemoryCount },
        { actualCount: simulation.summary.realisticDurableMemoryCount },
      ),
    );
  }

  if (
    expectation.overstatementCount !== undefined &&
    simulation.summary.overstatementCount !== expectation.overstatementCount
  ) {
    mismatches.push(
      createPhaseMismatch(
        "recording",
        "write_simulation_overstatement_count_mismatch",
        "Write overstatement count did not match expectation.",
        { expectedCount: expectation.overstatementCount },
        { actualCount: simulation.summary.overstatementCount },
      ),
    );
  }

  for (const candidateExpectation of expectation.candidates) {
    const candidate = findCandidate(simulation, candidateExpectation);
    if (!candidate) {
      mismatches.push(
        createPhaseMismatch(
          "recording",
          "write_simulation_missing_candidate",
          "Expected simulated write candidate was not present.",
          candidateExpectation,
        ),
      );
      continue;
    }
    if (
      candidateExpectation.disposition !== undefined &&
      candidate.disposition !== candidateExpectation.disposition
    ) {
      mismatches.push(
        createPhaseMismatch(
          "recording",
          "write_simulation_disposition_mismatch",
          "Simulated write disposition did not match expectation.",
          { candidateId: candidate.candidateId, disposition: candidateExpectation.disposition },
          { candidateId: candidate.candidateId, disposition: candidate.disposition },
        ),
      );
    }
    if (
      candidateExpectation.createsNewDurableMemory !== undefined &&
      candidate.createsNewDurableMemory !== candidateExpectation.createsNewDurableMemory
    ) {
      mismatches.push(
        createPhaseMismatch(
          "recording",
          "write_simulation_new_durable_flag_mismatch",
          "Simulated new-durable-memory flag did not match expectation.",
          {
            candidateId: candidate.candidateId,
            createsNewDurableMemory: candidateExpectation.createsNewDurableMemory,
          },
          {
            candidateId: candidate.candidateId,
            createsNewDurableMemory: candidate.createsNewDurableMemory,
          },
        ),
      );
    }
    if (
      candidateExpectation.shadowDurableMemoryCreated !== undefined &&
      candidate.shadowDurableMemoryCreated !== candidateExpectation.shadowDurableMemoryCreated
    ) {
      mismatches.push(
        createPhaseMismatch(
          "recording",
          "write_simulation_shadow_write_flag_mismatch",
          "Shadow durable-memory creation flag did not match expectation.",
          {
            candidateId: candidate.candidateId,
            shadowDurableMemoryCreated: candidateExpectation.shadowDurableMemoryCreated,
          },
          {
            candidateId: candidate.candidateId,
            shadowDurableMemoryCreated: candidate.shadowDurableMemoryCreated,
          },
        ),
      );
    }
    if (
      candidateExpectation.overstatesWrite !== undefined &&
      candidate.overstatesWrite !== candidateExpectation.overstatesWrite
    ) {
      mismatches.push(
        createPhaseMismatch(
          "recording",
          "write_simulation_overstatement_flag_mismatch",
          "Write overstatement flag did not match expectation.",
          {
            candidateId: candidate.candidateId,
            overstatesWrite: candidateExpectation.overstatesWrite,
          },
          {
            candidateId: candidate.candidateId,
            overstatesWrite: candidate.overstatesWrite,
          },
        ),
      );
    }
    for (const targetMemoryId of candidateExpectation.targetMemoryIdsInclude ?? []) {
      if (!candidate.targetMemoryIds.includes(targetMemoryId)) {
        mismatches.push(
          createPhaseMismatch(
            "recording",
            "write_simulation_missing_target_memory",
            "Expected target memory id was not present in the simulated write outcome.",
            { candidateId: candidate.candidateId, targetMemoryId },
            { candidateId: candidate.candidateId, targetMemoryIds: candidate.targetMemoryIds },
          ),
        );
      }
    }
    for (const targetMemoryId of candidateExpectation.supersedesMemoryIdsInclude ?? []) {
      if (!candidate.supersedesMemoryIds.includes(targetMemoryId)) {
        mismatches.push(
          createPhaseMismatch(
            "recording",
            "write_simulation_missing_supersedes_memory",
            "Expected superseded memory id was not present in the simulated write outcome.",
            { candidateId: candidate.candidateId, targetMemoryId },
            {
              candidateId: candidate.candidateId,
              supersedesMemoryIds: candidate.supersedesMemoryIds,
            },
          ),
        );
      }
    }
  }

  const finalized = finalizePhaseResult({
    phase: "recording",
    mismatches,
  });
  return {
    pass: finalized.pass,
    mismatches: finalized.mismatches,
  };
}
