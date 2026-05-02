import type { CanonicalCandidate, ExistingMemorySummary } from "./contracts.ts";
import type { ReconciliationNeighborProvider } from "./document-shadow-ingestion.ts";
import { parseExplicitMemoryCommand } from "./explicit-memory-command.ts";

export const DEFAULT_RECONCILIATION_NEIGHBOR_RECALL_LIMIT = 240;

export type ReconciliationNeighborRecallRepository = {
  listExistingMemorySummaries?: () => Promise<ExistingMemorySummary[]>;
  listExistingMemorySummariesForCapture?: (input: {
    projectId?: string | null;
    workspaceId?: string | null;
    sessionId?: string | null;
    kinds?: string[];
    memoryIds?: string[];
    queryText?: string | null;
    limit?: number;
  }) => Promise<ExistingMemorySummary[]>;
};

function nonEmpty(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

export function buildReconciliationRecallQuery(candidate: CanonicalCandidate): string {
  return [
    nonEmpty(candidate.canonical_text),
    nonEmpty(candidate.search_text),
    nonEmpty(candidate.source.evidence_quote),
  ]
    .filter((value): value is string => value !== undefined)
    .join("\n");
}

function readExplicitTargetMemoryIds(candidate: CanonicalCandidate): string[] {
  const command = parseExplicitMemoryCommand(candidate.source.evidence_quote);
  if (command?.commandType !== "correction_preference") {
    return [];
  }
  return command.targetRefs.filter((ref) => ref.type === "memory_id").map((ref) => ref.value);
}

export function createReconciliationNeighborRecallProvider(input: {
  canonicalRepository: ReconciliationNeighborRecallRepository;
  projectId?: string | null;
  workspaceId?: string | null;
  sessionId?: string | null;
  limit?: number;
}): ReconciliationNeighborProvider {
  const limit = input.limit ?? DEFAULT_RECONCILIATION_NEIGHBOR_RECALL_LIMIT;
  return async (candidate) => {
    const projectId = candidate.scope.project_id ?? input.projectId ?? null;
    const workspaceId = candidate.scope.workspace_id ?? input.workspaceId ?? null;
    const queryText = buildReconciliationRecallQuery(candidate);
    const memoryIds = readExplicitTargetMemoryIds(candidate);

    if (typeof input.canonicalRepository.listExistingMemorySummariesForCapture === "function") {
      return input.canonicalRepository.listExistingMemorySummariesForCapture({
        projectId,
        workspaceId,
        sessionId: input.sessionId ?? null,
        memoryIds,
        queryText,
        limit,
      });
    }

    const fallback = await input.canonicalRepository.listExistingMemorySummaries?.();
    return fallback?.slice(0, limit) ?? [];
  };
}
