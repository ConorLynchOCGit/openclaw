import { randomUUID } from "node:crypto";
import type { CandidateLearningInput } from "./candidate-ingress.js";
import type { LearnedGuidanceAdvisoryPlanningResult } from "./learned-guidance-advisory-planning.js";
import { readCanonicalMemoryIngestionCandidateFromMetadata } from "./memory-canonical-compat.js";
import type { MemoryContextOutcomeObservation } from "./memory-context-outcome-model.js";
import type { CompiledMemoryPromptContext } from "./memory-context-pack-model.js";
import {
  buildActiveMemorySlotSemanticKey,
  normalizeActiveMemorySlotAgentKey,
  resolveActiveMemorySlotCategoryFromCanonicalCandidate,
  resolveActiveMemorySlotScopeKind,
} from "./memory-slot-model.js";

type AttachedMemoryRunRecord = {
  runId?: string;
  sessionId?: string;
  sessionKey?: string;
  agentId?: string;
  attachedAt: number;
  responded: boolean;
  finalized: boolean;
  packCount: number;
  packKinds: string[];
  packHash: string;
  attachedSlotKeys: Set<string>;
  attachedSemanticKeys: Set<string>;
  attachedSourceIds: Set<string>;
  sourceToSlotKeys: Map<string, Set<string>>;
  repeatedCorrectionSlotKeys: Set<string>;
  applicationAligned: boolean;
  applicationMissed: boolean;
  appliedSourceIds: Set<string>;
  appliedSlotKeys: Set<string>;
  applicationMode?: string;
};

const ATTACHMENT_TTL_MS = 6 * 60 * 60 * 1000;

function cleanupExpired(
  runsById: Map<string, AttachedMemoryRunRecord>,
  latestRunIdBySessionId: Map<string, string>,
  latestRunIdBySessionKey: Map<string, string>,
) {
  const cutoff = Date.now() - ATTACHMENT_TTL_MS;
  for (const [runId, record] of runsById) {
    if (record.attachedAt >= cutoff) {
      continue;
    }
    runsById.delete(runId);
    if (record.sessionId && latestRunIdBySessionId.get(record.sessionId) === runId) {
      latestRunIdBySessionId.delete(record.sessionId);
    }
    if (record.sessionKey && latestRunIdBySessionKey.get(record.sessionKey) === runId) {
      latestRunIdBySessionKey.delete(record.sessionKey);
    }
  }
}

function buildCandidateSemanticKey(params: { input: CandidateLearningInput }): string | null {
  const candidate = readCanonicalMemoryIngestionCandidateFromMetadata(params.input.metadata);
  if (!candidate || !resolveActiveMemorySlotCategoryFromCanonicalCandidate(candidate)) {
    return null;
  }

  const projectSlug =
    typeof candidate.record.facets.projectScope === "string" &&
    candidate.record.facets.projectScope.trim().length > 0
      ? candidate.record.facets.projectScope.trim()
      : params.input.projectId?.trim() || undefined;
  const agentKey = normalizeActiveMemorySlotAgentKey(params.input.agentId);
  const sessionKey =
    typeof candidate.record.facets.sessionKey === "string" &&
    candidate.record.facets.sessionKey.trim().length > 0
      ? candidate.record.facets.sessionKey.trim()
      : undefined;
  const forceSession = candidate.record.facets.scopeType === "session";

  return buildActiveMemorySlotSemanticKey({
    scopeKind: resolveActiveMemorySlotScopeKind({
      projectSlug,
      agentKey,
      sessionKey,
      forceSession,
    }),
    projectSlug,
    agentKey,
    sessionKey,
    dedupeKey: candidate.identity.dedupeKey,
    clusterKey: candidate.identity.clusterKey,
    subjectKey: candidate.identity.subjectKey,
    subject: candidate.record.subject,
    statement: candidate.record.statement,
    fallbackText: params.input.content,
  });
}

export type MemoryContextOutcomeTracker = {
  recordPromptAttachment(params: {
    runId?: string;
    sessionId?: string;
    sessionKey?: string;
    agentId?: string;
    compiled: CompiledMemoryPromptContext;
  }): MemoryContextOutcomeObservation[];
  recordLlmOutput(params: {
    runId?: string;
    sessionId?: string;
    sessionKey?: string;
  }): MemoryContextOutcomeObservation[];
  recordCandidateSubmission(params: {
    kind: "learning" | "correction" | "procedure" | "improvement";
    input: CandidateLearningInput;
    accepted: boolean;
  }): MemoryContextOutcomeObservation[];
  recordGuidancePlan(params: {
    runId?: string;
    sessionId?: string;
    sessionKey?: string;
    result: LearnedGuidanceAdvisoryPlanningResult;
  }): MemoryContextOutcomeObservation[];
};

export function createMemoryContextOutcomeTracker(): MemoryContextOutcomeTracker {
  const runsById = new Map<string, AttachedMemoryRunRecord>();
  const latestRunIdBySessionId = new Map<string, string>();
  const latestRunIdBySessionKey = new Map<string, string>();

  function resolveLatestRecord(input: {
    runId?: string;
    sessionId?: string;
    sessionKey?: string;
  }): AttachedMemoryRunRecord | undefined {
    if (input.runId) {
      const direct = runsById.get(input.runId);
      if (direct) {
        return direct;
      }
    }
    if (input.sessionId) {
      const runId = latestRunIdBySessionId.get(input.sessionId);
      if (runId) {
        return runsById.get(runId);
      }
    }
    if (input.sessionKey) {
      const runId = latestRunIdBySessionKey.get(input.sessionKey);
      if (runId) {
        return runsById.get(runId);
      }
    }
    return undefined;
  }

  return {
    recordPromptAttachment(input) {
      cleanupExpired(runsById, latestRunIdBySessionId, latestRunIdBySessionKey);
      const observations: MemoryContextOutcomeObservation[] = [];

      const previous = resolveLatestRecord({
        sessionId: input.sessionId,
        sessionKey: input.sessionKey,
      });
      if (
        previous &&
        previous.runId !== input.runId &&
        previous.responded &&
        !previous.finalized &&
        previous.repeatedCorrectionSlotKeys.size === 0
      ) {
        previous.finalized = true;
        observations.push({
          outcome: previous.applicationAligned
            ? "survived_after_application"
            : "survived_turn_boundary",
          attribution: previous.applicationAligned ? "causal" : "proxy",
          ...(previous.runId ? { runId: previous.runId } : {}),
          ...(previous.sessionId ? { sessionId: previous.sessionId } : {}),
          ...(previous.agentId ? { agentId: previous.agentId } : {}),
          packCount: previous.packCount,
          packKinds: previous.packKinds,
          attachedSlotCount: previous.attachedSlotKeys.size,
          matchedSlotCount: previous.applicationAligned ? previous.appliedSlotKeys.size : undefined,
          matchedSlotKeys: previous.applicationAligned
            ? [...previous.appliedSlotKeys].sort((left, right) => left.localeCompare(right))
            : undefined,
          matchedSourceIds: previous.applicationAligned
            ? [...previous.appliedSourceIds].sort((left, right) => left.localeCompare(right))
            : undefined,
          applicationMode: previous.applicationMode,
        });
      }

      const runId = input.runId ?? `memory-context-run:${randomUUID()}`;
      const sourceToSlotKeys = new Map<string, Set<string>>();
      for (const pack of input.compiled.packs) {
        for (const sourceId of pack.sourceIds) {
          const existing = sourceToSlotKeys.get(sourceId) ?? new Set<string>();
          for (const slotKey of pack.slotKeys) {
            existing.add(slotKey);
          }
          sourceToSlotKeys.set(sourceId, existing);
        }
      }
      const record: AttachedMemoryRunRecord = {
        runId,
        sessionId: input.sessionId,
        sessionKey: input.sessionKey,
        agentId: input.agentId,
        attachedAt: Date.now(),
        responded: false,
        finalized: false,
        packCount: input.compiled.packs.length,
        packKinds: input.compiled.packs.map((pack) => pack.kind),
        packHash: input.compiled.hash,
        attachedSlotKeys: new Set(input.compiled.packs.flatMap((pack) => pack.slotKeys)),
        attachedSemanticKeys: new Set(input.compiled.packs.flatMap((pack) => pack.semanticKeys)),
        attachedSourceIds: new Set(input.compiled.packs.flatMap((pack) => pack.sourceIds)),
        sourceToSlotKeys,
        repeatedCorrectionSlotKeys: new Set<string>(),
        applicationAligned: false,
        applicationMissed: false,
        appliedSourceIds: new Set<string>(),
        appliedSlotKeys: new Set<string>(),
      };
      runsById.set(runId, record);
      if (input.sessionId) {
        latestRunIdBySessionId.set(input.sessionId, runId);
      }
      if (input.sessionKey) {
        latestRunIdBySessionKey.set(input.sessionKey, runId);
      }

      observations.push({
        outcome: "pack_attached",
        attribution: "observational",
        ...(record.runId ? { runId: record.runId } : {}),
        ...(record.sessionId ? { sessionId: record.sessionId } : {}),
        ...(record.agentId ? { agentId: record.agentId } : {}),
        packCount: input.compiled.packs.length,
        packKinds: input.compiled.packs.map((pack) => pack.kind),
        attachedSlotCount: input.compiled.attachedSlotCount,
        omittedSlotCount: input.compiled.omittedSlotCount,
        packHash: input.compiled.hash,
      });

      return observations;
    },

    recordLlmOutput(input) {
      cleanupExpired(runsById, latestRunIdBySessionId, latestRunIdBySessionKey);
      const record = resolveLatestRecord(input);
      if (!record || record.responded) {
        return [];
      }
      record.responded = true;
      return [
        {
          outcome: "response_observed",
          attribution: "observational",
          ...(record.runId ? { runId: record.runId } : {}),
          ...(record.sessionId ? { sessionId: record.sessionId } : {}),
          ...(record.agentId ? { agentId: record.agentId } : {}),
          packCount: record.packCount,
          packKinds: record.packKinds,
          attachedSlotCount: record.attachedSlotKeys.size,
        },
      ];
    },

    recordCandidateSubmission(input) {
      cleanupExpired(runsById, latestRunIdBySessionId, latestRunIdBySessionKey);
      if (!input.accepted || !input.input.sessionId) {
        return [];
      }

      const record = resolveLatestRecord({
        sessionId: input.input.sessionId,
      });
      if (!record || !record.responded || record.finalized) {
        return [];
      }

      const semanticKey = buildCandidateSemanticKey({ input: input.input });
      if (!semanticKey || !record.attachedSemanticKeys.has(semanticKey)) {
        return [];
      }

      record.finalized = true;
      record.repeatedCorrectionSlotKeys.add(semanticKey);
      return [
        {
          outcome: "repeated_correction",
          attribution: "causal",
          ...(record.runId ? { runId: record.runId } : {}),
          ...(record.sessionId ? { sessionId: record.sessionId } : {}),
          ...(record.agentId ? { agentId: record.agentId } : {}),
          correctionKind: input.kind,
          packCount: record.packCount,
          packKinds: record.packKinds,
          attachedSlotCount: record.attachedSlotKeys.size,
          matchedSlotCount: 1,
          matchedSlotKeys: [semanticKey],
          applicationMode: record.applicationMode,
          applicationAlignedBeforeFailure: record.applicationAligned,
        },
      ];
    },

    recordGuidancePlan(input) {
      cleanupExpired(runsById, latestRunIdBySessionId, latestRunIdBySessionKey);
      if (!input.result.accepted) {
        return [];
      }

      const record = resolveLatestRecord(input);
      if (!record) {
        return [];
      }

      const matchedSourceIds = input.result.suggestions
        .map((suggestion) => suggestion.memoryObjectId)
        .filter((memoryObjectId) => record.attachedSourceIds.has(memoryObjectId));
      if (matchedSourceIds.length === 0) {
        record.applicationMissed = true;
        record.applicationMode = input.result.applicationMode;
        return [
          {
            outcome: "application_missed",
            attribution: "causal",
            ...(record.runId ? { runId: record.runId } : {}),
            ...(record.sessionId ? { sessionId: record.sessionId } : {}),
            ...(record.agentId ? { agentId: record.agentId } : {}),
            packCount: record.packCount,
            packKinds: record.packKinds,
            attachedSlotCount: record.attachedSlotKeys.size,
            suggestionCount: input.result.suggestions.length,
            applicationMode: input.result.applicationMode,
          },
        ];
      }

      record.applicationAligned = true;
      record.applicationMode = input.result.applicationMode;
      for (const sourceId of matchedSourceIds) {
        record.appliedSourceIds.add(sourceId);
        const slotKeys = record.sourceToSlotKeys.get(sourceId);
        for (const slotKey of slotKeys ?? []) {
          record.appliedSlotKeys.add(slotKey);
        }
      }

      return [
        {
          outcome: "application_aligned",
          attribution: "causal",
          ...(record.runId ? { runId: record.runId } : {}),
          ...(record.sessionId ? { sessionId: record.sessionId } : {}),
          ...(record.agentId ? { agentId: record.agentId } : {}),
          packCount: record.packCount,
          packKinds: record.packKinds,
          attachedSlotCount: record.attachedSlotKeys.size,
          matchedSlotCount: record.appliedSlotKeys.size,
          matchedSlotKeys: [...record.appliedSlotKeys].sort((left, right) =>
            left.localeCompare(right),
          ),
          matchedSourceIds,
          suggestionCount: input.result.suggestions.length,
          applicationMode: input.result.applicationMode,
        },
      ];
    },
  };
}
