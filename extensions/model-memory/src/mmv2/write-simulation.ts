import type {
  AdmissionDecision,
  AdmissionDecisionBatch,
  CanonicalCandidateBatch,
  ReconciliationDecision,
} from "./contracts.ts";
import type { ShadowMemoryBatch } from "./recording.ts";
import { createCanonicalSemanticKey } from "./semantic-identity.ts";

export type MmV2WriteDisposition =
  | "create_new_memory"
  | "logical_merge_existing"
  | "keep_existing_noop"
  | "create_superseding_memory"
  | "create_conflict_record"
  | "quarantine"
  | "reject"
  | "embed_only";

export type MmV2SimulatedWriteOutcome = {
  candidateId: string;
  semanticKey: string;
  canonicalText: string;
  admissionDecision: AdmissionDecision["decision"] | "missing";
  reconciliationDecision: ReconciliationDecision["decision"] | "missing";
  disposition: MmV2WriteDisposition;
  createsNewDurableMemory: boolean;
  targetMemoryIds: string[];
  supersedesMemoryIds: string[];
  shadowDurableMemoryCreated: boolean;
  shadowDurableMemoryId: string | null;
  shadowEventTypes: string[];
  overstatesWrite: boolean;
};

export type MmV2WriteSimulationSummary = {
  candidateCount: number;
  shadowDurableMemoryCount: number;
  realisticDurableMemoryCount: number;
  overstatementCount: number;
  dispositionCounts: Record<MmV2WriteDisposition, number>;
};

export type MmV2WriteSimulationResult = {
  candidates: MmV2SimulatedWriteOutcome[];
  summary: MmV2WriteSimulationSummary;
};

const WRITE_DISPOSITIONS: MmV2WriteDisposition[] = [
  "create_new_memory",
  "logical_merge_existing",
  "keep_existing_noop",
  "create_superseding_memory",
  "create_conflict_record",
  "quarantine",
  "reject",
  "embed_only",
];

function createDispositionCounts(): Record<MmV2WriteDisposition, number> {
  return Object.fromEntries(WRITE_DISPOSITIONS.map((disposition) => [disposition, 0])) as Record<
    MmV2WriteDisposition,
    number
  >;
}

function resolveDisposition(input: {
  admissionDecision: AdmissionDecision["decision"] | undefined;
  reconciliationDecision: ReconciliationDecision["decision"] | undefined;
}): {
  disposition: MmV2WriteDisposition;
  createsNewDurableMemory: boolean;
} {
  if (!input.admissionDecision) {
    return { disposition: "reject", createsNewDurableMemory: false };
  }
  switch (input.admissionDecision) {
    case "reject":
      return { disposition: "reject", createsNewDurableMemory: false };
    case "quarantine":
      return { disposition: "quarantine", createsNewDurableMemory: false };
    case "embed_only":
      return { disposition: "embed_only", createsNewDurableMemory: false };
    case "admit":
      break;
  }

  switch (input.reconciliationDecision ?? "insert_new") {
    case "insert_new":
      return { disposition: "create_new_memory", createsNewDurableMemory: true };
    case "merge_with_existing":
      return { disposition: "logical_merge_existing", createsNewDurableMemory: false };
    case "keep_existing_ignore_candidate":
      return { disposition: "keep_existing_noop", createsNewDurableMemory: false };
    case "supersede_existing":
      return { disposition: "create_superseding_memory", createsNewDurableMemory: true };
    case "record_as_conflict":
      return { disposition: "create_conflict_record", createsNewDurableMemory: false };
    case "quarantine":
      return { disposition: "quarantine", createsNewDurableMemory: false };
  }
  return { disposition: "reject", createsNewDurableMemory: false };
}

export function simulateWritePolicy(input: {
  canonicalBatch: CanonicalCandidateBatch;
  admissionBatch: AdmissionDecisionBatch;
  reconciliationDecisions: ReconciliationDecision[];
  shadowRecording: ShadowMemoryBatch;
}): MmV2WriteSimulationResult {
  const admissionById = new Map(
    input.admissionBatch.decisions.map((decision) => [decision.candidate_id, decision]),
  );
  const reconciliationById = new Map(
    input.reconciliationDecisions.map((decision) => [decision.candidate_id, decision]),
  );

  const candidates = input.canonicalBatch.canonical_candidates.map((candidate) => {
    const admission = admissionById.get(candidate.candidate_id);
    const reconciliation = reconciliationById.get(candidate.candidate_id);
    const shadowMemory = input.shadowRecording.durableMemories.find((memory) =>
      memory.lineage.candidate_ids.includes(candidate.candidate_id),
    );
    const shadowEventTypes = input.shadowRecording.memoryEvents
      .filter((event) => event.candidate_id === candidate.candidate_id)
      .map((event) => event.event_type);
    const resolved = resolveDisposition({
      admissionDecision: admission?.decision,
      reconciliationDecision: reconciliation?.decision,
    });
    return {
      candidateId: candidate.candidate_id,
      semanticKey: createCanonicalSemanticKey(candidate),
      canonicalText: candidate.canonical_text,
      admissionDecision: admission?.decision ?? "missing",
      reconciliationDecision: reconciliation?.decision ?? "missing",
      disposition: resolved.disposition,
      createsNewDurableMemory: resolved.createsNewDurableMemory,
      targetMemoryIds: reconciliation?.target_memory_ids ?? [],
      supersedesMemoryIds: reconciliation?.supersedes_memory_ids ?? [],
      shadowDurableMemoryCreated: Boolean(shadowMemory),
      shadowDurableMemoryId: shadowMemory?.memory_id ?? null,
      shadowEventTypes,
      overstatesWrite: Boolean(shadowMemory) && !resolved.createsNewDurableMemory,
    } satisfies MmV2SimulatedWriteOutcome;
  });

  const dispositionCounts = createDispositionCounts();
  let realisticDurableMemoryCount = 0;
  let overstatementCount = 0;
  for (const candidate of candidates) {
    dispositionCounts[candidate.disposition] += 1;
    if (candidate.createsNewDurableMemory) {
      realisticDurableMemoryCount += 1;
    }
    if (candidate.overstatesWrite) {
      overstatementCount += 1;
    }
  }

  return {
    candidates,
    summary: {
      candidateCount: candidates.length,
      shadowDurableMemoryCount: input.shadowRecording.durableMemories.length,
      realisticDurableMemoryCount,
      overstatementCount,
      dispositionCounts,
    },
  };
}
