import {
  MODEL_MEMORY_RUNTIME_WIRING_VERSION,
  type MemoryRuntimeEvidenceRef,
  compactString,
} from "./types.ts";

export type ContextPackSegment = {
  segmentId: string;
  kind:
    | "retrieval_pack"
    | "projection"
    | "stable_memory"
    | "tool_result_summary"
    | "closeout_capsule";
  tokenEstimate: number;
  ref: string;
  boundedSummary: string;
  stale?: boolean;
};

export type ContextPackBudget = {
  maxTotalTokens: number;
  maxRetrievalPackTokens: number;
  maxProjectionTokens: number;
  maxStableMemoryTokens: number;
  maxToolResultSummaryTokens: number;
  maxCloseoutContextTokens: number;
  sessionContextRemainingTokens: number;
};

export type ContextPackAssemblyDecision = {
  artifactKind: "context_pack_assembly_decision";
  version: typeof MODEL_MEMORY_RUNTIME_WIRING_VERSION;
  decision: "insert_bounded_pack" | "trimmed_bounded_pack" | "skip_over_budget" | "skip_stale_only";
  selectedRefs: MemoryRuntimeEvidenceRef[];
  skippedRefs: MemoryRuntimeEvidenceRef[];
  totalTokenEstimate: number;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawTranscriptStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  workQueueLifecycleMutated: false;
};

function segmentLimit(kind: ContextPackSegment["kind"], budget: ContextPackBudget): number {
  switch (kind) {
    case "retrieval_pack":
      return budget.maxRetrievalPackTokens;
    case "projection":
      return budget.maxProjectionTokens;
    case "stable_memory":
      return budget.maxStableMemoryTokens;
    case "tool_result_summary":
      return budget.maxToolResultSummaryTokens;
    case "closeout_capsule":
      return budget.maxCloseoutContextTokens;
  }
  return 0;
}

function refFromSegment(segment: ContextPackSegment): MemoryRuntimeEvidenceRef {
  return {
    ref: segment.ref,
    kind: segment.kind === "closeout_capsule" ? "closeout_capsule" : "context_pack",
    boundedSummary: compactString(segment.boundedSummary, 300),
  };
}

export function assembleBoundedContextPack(input: {
  segments: ContextPackSegment[];
  budget: ContextPackBudget;
}): ContextPackAssemblyDecision {
  const seenRefs = new Set<string>();
  const selected: ContextPackSegment[] = [];
  const skipped: ContextPackSegment[] = [];
  let total = 0;
  const usedByKind = new Map<ContextPackSegment["kind"], number>();
  for (const segment of input.segments) {
    if (segment.stale || seenRefs.has(segment.ref)) {
      skipped.push(segment);
      continue;
    }
    seenRefs.add(segment.ref);
    const kindUsed = usedByKind.get(segment.kind) ?? 0;
    const limit = segmentLimit(segment.kind, input.budget);
    const nextKind = kindUsed + Math.max(0, segment.tokenEstimate);
    const nextTotal = total + Math.max(0, segment.tokenEstimate);
    if (
      nextKind > limit ||
      nextTotal > input.budget.maxTotalTokens ||
      nextTotal > input.budget.sessionContextRemainingTokens
    ) {
      skipped.push(segment);
      continue;
    }
    selected.push(segment);
    usedByKind.set(segment.kind, nextKind);
    total = nextTotal;
  }
  const selectedRefs = selected.map(refFromSegment);
  const skippedRefs = skipped.map(refFromSegment);
  const selectedAny = selectedRefs.length > 0;
  const staleOnly = input.segments.length > 0 && input.segments.every((segment) => segment.stale);
  return {
    artifactKind: "context_pack_assembly_decision",
    version: MODEL_MEMORY_RUNTIME_WIRING_VERSION,
    decision: selectedAny
      ? skippedRefs.length > 0
        ? "trimmed_bounded_pack"
        : "insert_bounded_pack"
      : staleOnly
        ? "skip_stale_only"
        : "skip_over_budget",
    selectedRefs,
    skippedRefs,
    totalTokenEstimate: total,
    reasonCodes: [
      ...(selectedAny ? ["bounded_context_pack_selected"] : []),
      ...(skippedRefs.length > 0 ? ["context_pack_segments_skipped_or_trimmed"] : []),
      ...(staleOnly ? ["all_context_pack_segments_stale"] : []),
      ...(!selectedAny && !staleOnly ? ["context_pack_budget_exceeded"] : []),
    ],
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    workQueueLifecycleMutated: false,
  };
}
